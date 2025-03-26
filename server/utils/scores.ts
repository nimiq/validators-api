import type { Range, Result, ScoreParams } from 'nimiq-validator-trustscore/types'
import { desc, gte, lte } from 'drizzle-orm'
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
      const { dominanceViaBalance, dominanceViaSlots } = results[0]!
      return dominanceViaBalance >= 0 ? dominanceViaBalance : dominanceViaSlots
    })

  const inherentsPerEpoch: Map<number /* epoch */, { rewarded: number, missed: number }> = new Map()
  const activeEpochStates: (0 | 1)[] = []

  for (let epoch = range.fromEpoch; epoch <= range.toEpoch; epoch++) {
    const { missed, rewarded } = await useDrizzle()
      .select({ missed: activity.missed, rewarded: activity.rewarded })
      .from(activity)
      .where(and(eq(activity.validatorId, validatorId), eq(activity.epochNumber, epoch)))
      .execute()
      .then(r => r.at(0)!)
    inherentsPerEpoch.set(epoch, { missed, rewarded })
    activeEpochStates.push(missed === 0 && rewarded === 0 ? 0 : 1)
  }

  const params: ScoreParams = {
    availability: { activeEpochStates },
    dominance: { dominanceRatio },
    reliability: { inherentsPerEpoch },
  }
  const { data: scoreValues, error: errorScore } = computeScore(params)
  if (errorScore || !scoreValues)
    return { error: `Error in ${validatorId}: ${errorScore}` }
  const score: Score = {
    ...scoreValues,
    validatorId,
    epochNumber: range.toEpoch,
    reason: '{}',
  }
  return { data: { ...score, params } }
}

/**
 * Given a range of epochs, it will compute the score for each validator entry found in the activity table.
 */
export async function upsertScoresCurrentEpoch(): Result<CalculateScoreResult> {
  const { data: range, error: errorRange } = await getRange(getRpcClient())
  if (errorRange || !range)
    return { error: errorRange || 'No range' }

  const validatorsId = await getStoredValidatorsId()
  const scorePromises = validatorsId.map(validatorId => calculateScore(range, validatorId))
  const maybeRes = await Promise.all(scorePromises)

  // If we have an error, we stop
  if (maybeRes.some(s => s.error))
    return { error: maybeRes.map(s => s.error).join(', ') }

  const scores = maybeRes.map(s => s.data!)

  // Write the scores to the database
  await useDrizzle()
    .delete(tables.scores)
    .where(eq(tables.scores.epochNumber, range.toEpoch)) // Delete all scores for that epoch
    .execute()
  await useDrizzle()
    .insert(tables.scores)
    .values(scores)

  return { data: { scores, range } }
}
