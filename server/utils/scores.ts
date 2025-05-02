import type { Range, Result, ScoreParams } from 'nimiq-validator-trustscore/types'
import type { NewScore } from './drizzle'
import { and, count, desc, eq, gte, lte, or } from 'drizzle-orm'
import { getRange } from 'nimiq-validator-trustscore/range'
import { computeScore } from 'nimiq-validator-trustscore/score'
import { activity } from '../database/schema'
import { getStoredValidatorsId } from './validators'

interface CalculateScoreResult {
  range: Range
  scores: ({ params: ScoreParams } & Score)[]
}

async function calculateScore(range: Range, validatorId: number): Result<CalculateScoreResult['scores'][number]> {
  const dominanceRatio = await useDrizzle()
    .select({
      dominanceViaSlots: activity.dominanceRatioViaSlots,
      dominanceViaBalance: activity.dominanceRatioViaBalance,
    })
    .from(activity)
    .where(and(
      eq(activity.validatorId, validatorId),
      gte(activity.epochNumber, range.fromEpoch),
      lte(activity.epochNumber, range.toEpoch),
      or(
        gte(activity.dominanceRatioViaBalance, 0),
        gte(activity.dominanceRatioViaSlots, 0),
      ),
    ))
    .orderBy(desc(activity.epochNumber))
    .limit(1)
    .execute()
    .then((results) => {
      if (results.length === 0)
        return 0 // No dominance ratio found for this validator
      const { dominanceViaBalance, dominanceViaSlots } = results.at(0)!
      return dominanceViaBalance >= 0 ? dominanceViaBalance : dominanceViaSlots
    })

  // Get all activity data for the validator in the given range in a single query
  const activities = await useDrizzle()
    .select({
      epoch: activity.epochNumber,
      missed: activity.missed,
      rewarded: activity.rewarded,
    })
    .from(activity)
    .where(and(
      eq(activity.validatorId, validatorId),
      gte(activity.epochNumber, range.fromEpoch),
      lte(activity.epochNumber, range.toEpoch),
    ))
    .execute()

  // Process the data in memory
  const inherentsPerEpoch = new Map<number, { rewarded: number, missed: number }>()
  const epochData = new Map(activities.map(a => [a.epoch, { missed: a.missed, rewarded: a.rewarded }]))
  const activeEpochStates: (0 | 1)[] = []

  // Process epochs in order and handle missing data
  for (let epoch = range.fromEpoch; epoch <= range.toEpoch; epoch++) {
    const data = epochData.get(epoch) || { missed: -1, rewarded: -1 }
    inherentsPerEpoch.set(epoch, data)
    activeEpochStates.push(data.missed === 0 && data.rewarded === 0 ? 0 : 1)
  }

  const params: ScoreParams = {
    availability: { activeEpochStates },
    dominance: { dominanceRatio },
    reliability: { inherentsPerEpoch },
  }
  const [scoreAreOk, errorScore, scoreValues] = computeScore(params)
  if (!scoreAreOk)
    return [false, errorScore, undefined]
  const score: Score = {
    ...scoreValues,
    validatorId,
    epochNumber: range.toEpoch,
    reason: '{}',
  }
  return [true, undefined, { ...score, params }]
}

/**
 * Given a range of epochs, it will compute the score for each validator entry found in the activity table.
 */
export async function upsertScoresSnapshotEpoch(): Result<CalculateScoreResult> {
  const { nimiqNetwork: network } = useRuntimeConfig().public
  const [rangeSuccess, errorRange, range] = await getRange({ network })
  if (!rangeSuccess || !range)
    return [false, errorRange || 'No range', undefined]

  const validatorsId = await getStoredValidatorsId()
  const scorePromises = validatorsId.map(validatorId => calculateScore(range, validatorId))
  const maybeRes = await Promise.all(scorePromises)

  // If we have an error, we stop
  if (maybeRes.some(s => !s[0]))
    return [false, maybeRes.filter(s => !s[0]).map(s => s[1]).join(', '), undefined]

  const scores = maybeRes.map(s => s[2]!)

  // Write the scores to the database
  await useDrizzle()
    .delete(tables.scores)
    .where(eq(tables.scores.epochNumber, range.toEpoch)) // Delete all scores for that epoch
    .execute()

  // Save the new scores to the database in batches of 5, otherwise cloudflare might complain "too many parameters"
  for (let i = 0; i < scores.length; i += 5) {
    const newScores = scores.slice(i, i + 5).map(score => ({ ...score, params: undefined })) as NewScore[]
    await useDrizzle()
      .insert(tables.scores)
      .values(newScores)
      .execute()
  }

  return [true, undefined, { scores, range }]
}

export async function isMissingScore(range: Range): Promise<boolean> {
  const scoreCount = await useDrizzle()
    .select({ count: count(tables.scores.epochNumber) })
    .from(tables.scores)
    .where(eq(tables.scores.epochNumber, range.toEpoch))
    .get()
    .then(res => res?.count || 0)
  return scoreCount === 0
}
