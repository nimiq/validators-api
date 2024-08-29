import { gte, lte } from 'drizzle-orm'
import type { Activity, EpochsActivities, Range } from 'nimiq-validators-score'
import type { NewActivity } from './drizzle'
import { storeValidator } from './validators'

/**
 * Given a range, it returns the epochs that are missing in the database.
 */
export async function findMissingEpochs(range: Range) {
  const existingEpochs = await useDrizzle()
    .selectDistinct({ epochBlockNumber: tables.activity.epochNumber })
    .from(tables.activity)
    .where(and(
      gte(tables.activity.epochNumber, range.fromEpoch),
      lte(tables.activity.epochNumber, range.toEpoch),
    ))
    .execute().then(r => r.map(r => r.epochBlockNumber))

  const missingEpochs = []
  for (let i = range.fromEpoch; i <= range.toEpoch; i++) {
    if (!existingEpochs.includes(i))
      missingEpochs.push(i)
  }
  return missingEpochs
}

/**
 * We loop over all the pairs activities/epochBlockNumber and store the validator activities.
 */
export async function storeActivities(epochs: EpochsActivities) {
  const promises = Object.entries(epochs).map(async ([_epochNumber, activities]) => {
    const epochNumber = Number(_epochNumber)
    const activityPromises = Object.entries(activities).map(async ([address, activity]) => storeSingleActivity({ address, activity, epochNumber }))
    return await Promise.all(activityPromises)
  })
  await Promise.all(promises)
}

interface StoreActivityParams {
  address: string
  activity: Activity
  epochNumber: number
}

async function storeSingleActivity({ address, activity, epochNumber }: StoreActivityParams) {
  const validatorId = await storeValidator(address)
  if (!validatorId)
    return
  // If we ever move out of cloudflare we could use transactions to avoid inconsistencies and improve performance
  // Cloudflare D1 does not support transactions: https://github.com/cloudflare/workerd/blob/e78561270004797ff008f17790dae7cfe4a39629/src/workerd/api/sql-test.js#L252-L253
  const existingActivity = await useDrizzle()
    .select({ sizeRatioViaSlots: tables.activity.sizeRatioViaSlots, sizeRatio: tables.activity.sizeRatio })
    .from(tables.activity)
    .where(and(
      eq(tables.activity.epochNumber, epochNumber),
      eq(tables.activity.validatorId, validatorId),
    ))

  const { likelihood, rewarded, missed, sizeRatio: _sizeRatio, sizeRatioViaSlots: _sizeRatioViaSlots } = activity

  // We always want to update db except the columns `sizeRatio` and `sizeRatioViaSlots`.
  // If we have `sizeRatioViaSlots` as false and `sizeRatio` > 0, then we won't update only those columns
  // As we want to keep the values from the first time we inserted the activity as they are more accurate
  const viaSlotsDb = Boolean(existingActivity.at(0)?.sizeRatioViaSlots)
  const sizeRatioDb = existingActivity.at(0)?.sizeRatio || 0
  const updateSizeColumns = viaSlotsDb !== false || sizeRatioDb <= 0
  const sizeRatio = updateSizeColumns ? _sizeRatio : sizeRatioDb
  const sizeRatioViaSlotsBool = updateSizeColumns ? _sizeRatioViaSlots : viaSlotsDb
  const sizeRatioViaSlots = sizeRatioViaSlotsBool ? 1 : 0

  await useDrizzle().delete(tables.activity)
    .where(and(
      eq(tables.activity.epochNumber, epochNumber),
      eq(tables.activity.validatorId, validatorId),
    ))
  const activityDb: NewActivity = { likelihood, rewarded, missed, epochNumber, validatorId, sizeRatio, sizeRatioViaSlots }
  await useDrizzle().insert(tables.activity).values(activityDb)
}
