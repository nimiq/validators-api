import type { Activity, EpochsActivities, Range } from 'nimiq-validators-trustscore'
import type { NewActivity } from './drizzle'
import { eq, gte, lte, not } from 'drizzle-orm'
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
      // If every entry of the same epoch contains a likelihood of -1, then we consider it as missing
      not(eq(tables.activity.likelihood, -1)),
    ))
    .execute()
    .then(r => r.map(r => r.epochBlockNumber))

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
  activity: Activity | null
  epochNumber: number
}

const defaultActivity: Activity = { likelihood: -1, missed: -1, rewarded: -1, dominanceRatioViaBalance: -1, dominanceRatioViaSlots: -1, balance: -1 }

export async function storeSingleActivity({ address, activity, epochNumber }: StoreActivityParams) {
  const validatorId = await storeValidator(address)
  if (!validatorId)
    return
  // If we ever move out of cloudflare we could use transactions to avoid inconsistencies and improve performance
  // Cloudflare D1 does not support transactions: https://github.com/cloudflare/workerd/blob/e78561270004797ff008f17790dae7cfe4a39629/src/workerd/api/sql-test.js#L252-L253
  const existingActivity = await useDrizzle()
    .select({
      dominanceRatioViaSlots: tables.activity.dominanceRatioViaSlots,
      dominanceRatioViaBalance: tables.activity.dominanceRatioViaBalance,
      balance: tables.activity.balance,
    })
    .from(tables.activity)
    .where(and(
      eq(tables.activity.epochNumber, epochNumber),
      eq(tables.activity.validatorId, validatorId),
    ))

  const { likelihood, rewarded, missed, dominanceRatioViaBalance: _dominanceRatioViaBalance, dominanceRatioViaSlots: _dominanceRatioViaSlots, balance: _balance } = activity || defaultActivity

  // We always want to update db except the columns `dominanceRatioViaBalance` and `dominanceRatioViaSlots`.
  const dominanceRatioViaSlotsDb = existingActivity.at(0)?.dominanceRatioViaSlots
  const dominanceRatioViaSlots = dominanceRatioViaSlotsDb === -1 ? _dominanceRatioViaSlots : dominanceRatioViaSlotsDb || -1

  const dominanceRatioViaBalanceDb = existingActivity.at(0)?.dominanceRatioViaBalance
  const dominanceRatioViaBalance = dominanceRatioViaBalanceDb === -1 ? _dominanceRatioViaSlots : dominanceRatioViaBalanceDb || -1

  const balance = existingActivity.at(0)?.balance === -1 ? _balance : existingActivity.at(0)?.balance

  await useDrizzle().delete(tables.activity).where(and(
    eq(tables.activity.epochNumber, epochNumber),
    eq(tables.activity.validatorId, validatorId),
  ))
  const activityDb: NewActivity = { likelihood, rewarded, missed, epochNumber, validatorId, dominanceRatioViaSlots, dominanceRatioViaBalance, balance }
  await useDrizzle().insert(tables.activity).values(activityDb)
}
