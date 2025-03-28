import type { EpochActivity, EpochsActivities, Range, Result, SelectedValidator, UnselectedValidator } from 'nimiq-validator-trustscore/types'
import type { NewActivity } from './drizzle'
import type { CurrentEpochValidators } from './types'
import { consola } from 'consola'
import { eq, gte, lte, not } from 'drizzle-orm'
import { fetchEpochs } from 'nimiq-validator-trustscore/fetcher'
import { getRange } from 'nimiq-validator-trustscore/range'
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
      // If any entry of the same epoch contains a likelihood of -1, then we consider it as missing
      not(eq(tables.activity.likelihood, -1)),
    ))
    .all()
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
async function storeActivities(epochs: EpochsActivities) {
  const promises = Object.entries(epochs).map(async ([_epochNumber, activities]) => {
    const epochNumber = Number(_epochNumber)
    const activePromises = Object.entries(activities)
      .map(async ([address, activity]) => storeSingleActivity({ address, activity, epochNumber }))
    return await Promise.all(activePromises)
  })
  await Promise.all(promises)
}

interface StoreActivityParams {
  address: string
  activity: SelectedValidator | UnselectedValidator | null
  epochNumber: number
}

const defaultActivity: SelectedValidator = { likelihood: -1, balance: -1, dominanceRatioViaBalance: -1, dominanceRatioViaSlots: -1, missed: -1, rewarded: -1, address: '', selected: true }

async function storeSingleActivity({ address, activity, epochNumber }: StoreActivityParams) {
  const validatorId = await storeValidator(address)
  if (!validatorId)
    return
  // If we ever move out of cloudflare we could use transactions to avoid inconsistencies and improve performance
  // Cloudflare D1 does not support transactions: https://github.com/cloudflare/workerd/blob/e78561270004797ff008f17790dae7cfe4a39629/src/workerd/api/sql-test.js#L252-L253
  const { dominanceRatioViaBalance: _dominanceRatioViaBalance, dominanceRatioViaSlots: _dominanceRatioViaSlots, balance: _balance } = await useDrizzle()
    .select({
      likelihood: tables.activity.likelihood,
      rewarded: tables.activity.rewarded,
      missed: tables.activity.missed,
      dominanceRatioViaSlots: tables.activity.dominanceRatioViaSlots,
      dominanceRatioViaBalance: tables.activity.dominanceRatioViaBalance,
      balance: tables.activity.balance,
    })
    .from(tables.activity)
    .where(and(
      eq(tables.activity.epochNumber, epochNumber),
      eq(tables.activity.validatorId, validatorId),
    ))
    .get() || defaultActivity

  const dominanceRatioViaSlots = (_dominanceRatioViaSlots === -1 ? activity?.dominanceRatioViaSlots : _dominanceRatioViaSlots) || -1
  const dominanceRatioViaBalance = (_dominanceRatioViaBalance === -1 ? activity?.dominanceRatioViaBalance : _dominanceRatioViaBalance) || -1
  const balance = (_balance === -1 ? activity?.balance : _balance) || -1

  await useDrizzle().delete(tables.activity).where(and(
    eq(tables.activity.epochNumber, epochNumber),
    eq(tables.activity.validatorId, validatorId),
  ))
  const activityDb: NewActivity = { ...activity!, epochNumber, validatorId, dominanceRatioViaSlots, dominanceRatioViaBalance, balance }
  await useDrizzle().insert(tables.activity).values(activityDb)
}

const EPOCHS_IN_PARALLEL = 3

/**
 * Fetches the activities of the epochs that have finished and are missing in the database.
 */
export async function fetchMissingEpochs(): Result<number[]> {
  const client = getRpcClient()

  // The range that we will consider
  const [rangeSuccess, errorRange, range] = await getRange(client)
  if (!rangeSuccess || !range)
    return [false, errorRange || 'No range', undefined]

  consola.info(`Fetching data for range: [${range.fromBlockNumber}/${range.fromEpoch} - ${range.toBlockNumber}/${range.toEpoch}] (${range.epochCount} epochs). Now at ${range.head}/${range.currentEpoch}.`)
  // Only fetch the missing epochs that are not in the database
  const missingEpochs = await findMissingEpochs(range)
  if (missingEpochs.length === 0)
    return [true, undefined, []]

  consola.info(`Fetching missing epochs...`)
  const fetchedEpochs = []
  const epochGenerator = fetchEpochs(client, missingEpochs)

  while (true) {
    const epochsActivities: EpochsActivities = {}

    // Fetch the activities in parallel
    for (let i = 0; i < EPOCHS_IN_PARALLEL; i++) {
      const { value: epochActivity, done } = await epochGenerator.next()
      if (done || !epochActivity)
        break
      if (epochActivity.activity === null) {
        consola.warn(`Epoch ${epochActivity.epochIndex} is missing`, epochActivity)
        await storeSingleActivity({ address: '', activity: null, epochNumber: epochActivity.epochIndex })
        continue
      }
      if (!epochsActivities[`${epochActivity.epochIndex}`])
        epochsActivities[`${epochActivity.epochIndex}`] = {}
      const epoch = epochsActivities[`${epochActivity.epochIndex}`]!
      if (!epoch[epochActivity.address])
        epoch[epochActivity.address] = epochActivity.activity
    }

    const epochs = Object.keys(epochsActivities).map(Number)
    fetchedEpochs.push(...epochs)
    const newestEpoch = Math.max(...fetchedEpochs)
    const percentage = Math.round((fetchedEpochs.length / missingEpochs.length) * 100).toFixed(2)
    consola.info(`Fetched ${newestEpoch} epochs. ${percentage}%`)

    if (epochs.length === 0 && (await findMissingEpochs(range)).length === 0)
      break

    await storeActivities(epochsActivities)
  }

  return [true, undefined, missingEpochs]
}

export async function fetchActiveEpoch(): Result<CurrentEpochValidators> {
  const [success, error, data] = await categorizeValidatorsCurrentEpoch()
  if (!success || !data)
    return [false, error || 'No active epoch', undefined]

  const untrackedAddresses = data.untrackedValidators.map(v => v.address)
  if (untrackedAddresses.length > 0)
    consola.warn(`Found ${untrackedAddresses.length} untracked validators in the current epoch.`, untrackedAddresses)
  await Promise.all(untrackedAddresses.map(address => storeValidator(address)))

  // Now we transform the data so we can use the same functions as if the epoch was finished
  // The following fields are the ones that cannot be computed at the moment, and we will compute them later
  const activity: EpochActivity = {}
  for (const { address, ...rest } of data.selectedValidators)
    activity[address] = { address, ...rest }
  for (const { address, ...rest } of data.unselectedValidators)
    activity[address] = { address, ...rest }
  consola.info(`Fetched active epoch: ${data.epochNumber} ()`)
  const epochActivity: EpochsActivities = { [data.epochNumber]: activity }
  await storeActivities(epochActivity)

  return [true, undefined, data]
}
