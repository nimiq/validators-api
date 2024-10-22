import { gte, inArray, lte } from 'drizzle-orm'
import type { Range, ScoreParams } from 'nimiq-validators-score'
import { consola } from 'consola'
import { computeScore } from 'nimiq-validators-score'
import type { NewScore } from './drizzle'
import type { Result, ValidatorScore } from './types'
import { fetchValidatorsScoreByIds } from './validators'
import { findMissingEpochs } from './activities'

interface GetScoresResult {
  validators: ValidatorScore[]
  range: Range
}

/**
 * Given a range of epochs, it returns the scores for the validators in that range.
 */
export async function calculateScores(range: Range): Result<GetScoresResult> {
  const missingEpochs = await findMissingEpochs(range)
  if (missingEpochs.length > 0)
    consola.warn(`Missing epochs in database: ${missingEpochs.join(', ')}. Run the fetch task first.`)

  // TODO Decide how we want to handle the case of missing activity
  // const { data: range, error: rangeError } = await adjustRangeForAvailableData(expectedRange)
  // consola.info({ range, rangeError })
  // if (rangeError || !range)
  //   return { error: rangeError, data: undefined }

  // TODO Check if we already have scores for the given range and return from the database

  const sizeLastEpoch = await useDrizzle()
    .select({
      sizeRatio: tables.activity.sizeRatio,
      sizeRatioViaSlots: tables.activity.sizeRatioViaSlots,
      validatorId: tables.activity.validatorId,
    })
    .from(tables.activity)
    .where(and(
      eq(tables.activity.epochNumber, range.toEpoch),
    ))

  const sizeLastEpochByValidator = new Map<number, { sizeRatio: number, sizeRatioViaSlots: boolean }>()
  sizeLastEpoch.forEach(({ validatorId, sizeRatio, sizeRatioViaSlots }) =>
    sizeLastEpochByValidator.set(validatorId, { sizeRatio, sizeRatioViaSlots: Boolean(sizeRatioViaSlots) }))
  const validatorsIds = Array.from(sizeLastEpochByValidator.keys())

  const _activities = await useDrizzle()
    .select({
      epoch: tables.activity.epochNumber,
      validatorId: tables.validators.id,
      rewarded: tables.activity.rewarded,
      missed: tables.activity.missed,
    })
    .from(tables.activity)
    .innerJoin(tables.validators, eq(tables.activity.validatorId, tables.validators.id))
    .where(and(
      gte(tables.activity.epochNumber, range.fromEpoch),
      lte(tables.activity.epochNumber, range.toEpoch),
      inArray(tables.activity.validatorId, validatorsIds),
    ))
    .orderBy(tables.activity.epochNumber)
    .execute()

  type Activity = Map<number /* validatorId */, { inherentsPerEpoch: Map<number /* epoch */, { rewarded: number, missed: number }>, sizeRatio: number, sizeRatioViaSlots: boolean }>

  const validatorsParams: Activity = new Map()

  for (const { epoch, missed, rewarded, validatorId } of _activities) {
    if (!validatorsParams.has(validatorId)) {
      const { sizeRatio, sizeRatioViaSlots } = sizeLastEpochByValidator.get(validatorId) ?? { sizeRatio: -1, sizeRatioViaSlots: false }
      if (sizeRatio === -1)
        return { error: `Missing size ratio for validator ${validatorId}. Range: ${range.fromEpoch}-${range.toEpoch}`, data: undefined }
      validatorsParams.set(validatorId, { sizeRatio, sizeRatioViaSlots, inherentsPerEpoch: new Map() })
    }
    const validatorInherents = validatorsParams.get(validatorId)!.inherentsPerEpoch
    if (!validatorInherents.has(epoch))
      validatorInherents.set(epoch, { rewarded: 0, missed: 0 })
    const { missed: accMissed, rewarded: accRewarded } = validatorInherents.get(epoch)!
    validatorInherents.set(epoch, { rewarded: accRewarded + rewarded, missed: accMissed + missed })
  }

  const scores = Array.from(validatorsParams.entries()).map(([validatorId, { inherentsPerEpoch }]) => {
    const activeEpochStates = Array.from({ length: range.toEpoch - range.fromEpoch + 1 }, (_, i) => inherentsPerEpoch.has(range.fromEpoch + i) ? 1 : 0)
    const size: ScoreParams['size'] = { sizeRatio: sizeLastEpochByValidator.get(validatorId)?.sizeRatio ?? -1 }
    const liveness: ScoreParams['liveness'] = { activeEpochStates }
    const reliability: ScoreParams['reliability'] = { inherentsPerEpoch }

    const reason = {
      size: size.sizeRatio,
      missedEpochs: activeEpochStates.map((s, i) => s === 0 ? range.fromEpoch + i : -1).filter(e => e !== -1),
      goodSlots: Array.from(inherentsPerEpoch.values()).reduce((acc, { rewarded }) => acc + rewarded, 0),
      badSlots: Array.from(inherentsPerEpoch.values()).reduce((acc, { missed }) => acc + missed, 0),
    }

    const score = computeScore({ liveness, size, reliability })
    const newScore: NewScore = { validatorId: Number(validatorId), fromEpoch: range.fromEpoch, toEpoch: range.toEpoch, ...score, reason }
    return newScore
  })

  // TODO only store the scores that uses default window size to save space
  await persistScores(scores)
  const { data: validators, error: errorValidators } = await fetchValidatorsScoreByIds(scores.map(s => s.validatorId))
  if (errorValidators || !validators)
    return { error: errorValidators, data: undefined }
  return { data: { validators, range }, error: undefined }
}

/**
 * Insert the scores into the database. To avoid inconsistencies, it deletes all the scores for the given validators and then inserts the new scores.
 */
export async function persistScores(scores: NewScore[]) {
  await useDrizzle().delete(tables.scores).where(or(...scores.map(({ validatorId }) => eq(tables.scores.validatorId, validatorId))))
  await Promise.all(scores.map(async score => await useDrizzle().insert(tables.scores).values(score)))

  // If we ever move out of cloudflare we could use transactions to avoid inconsistencies
  // Cloudflare D1 does not support transactions: https://github.com/cloudflare/workerd/blob/e78561270004797ff008f17790dae7cfe4a39629/src/workerd/api/sql-test.js#L252-L253
  // await useDrizzle().transaction(async (tx) => {
  //   await tx.delete(tables.scores).where(or(...scores.map(({ validatorId }) => eq(tables.scores.validatorId, validatorId))))
  //   await tx.insert(tables.scores).values(scores.map(s => ({ ...s, updatedAt })))
  // })
}

export async function checkIfScoreExistsInDb(range: Range) {
  const scoreAlreadyInDb = await useDrizzle()
    .select({ validatorId: tables.scores.validatorId })
    .from(tables.scores)
    .where(and(
      eq(tables.scores.toEpoch, range.toEpoch),
      eq(tables.scores.fromEpoch, range.fromEpoch),
    ))
    .get()
    .then(r => Boolean(r?.validatorId))
  return scoreAlreadyInDb
}
