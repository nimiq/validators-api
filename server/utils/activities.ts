import type { ElectedValidator, EpochActivity, EpochsActivities, Range, Result, UnelectedValidator } from 'nimiq-validator-trustscore/types'
import type { NewActivity } from './drizzle'
import type { SnapshotEpochValidators, SyncStreamReportFn } from './types'
import { consola } from 'consola'
import { and, desc, eq, gte, lte, not, or } from 'drizzle-orm'
import { fetchEpochs } from 'nimiq-validator-trustscore/fetcher'
import { getRange } from 'nimiq-validator-trustscore/range'
import { isCompleteFinalizedEpochActivity } from './activity-completeness'
import { resolveLiveActivityMetadata } from './activity-metadata'
import { storeValidator } from './validators'

/**
 * Given a range, it returns the epochs that are missing in the database.
 */
export async function findMissingEpochs(range: Range) {
  const activityRows = await useDrizzle()
    .select({
      epochNumber: tables.activity.epochNumber,
      likelihood: tables.activity.likelihood,
      missed: tables.activity.missed,
      rewarded: tables.activity.rewarded,
    })
    .from(tables.activity)
    .where(and(
      gte(tables.activity.epochNumber, range.fromEpoch),
      lte(tables.activity.epochNumber, range.toEpoch),
    ))
    .all()

  const epochs = new Map<number, typeof activityRows>()
  for (const row of activityRows) {
    const rows = epochs.get(row.epochNumber) || []
    rows.push(row)
    epochs.set(row.epochNumber, rows)
  }

  const missingEpochs = []
  for (let i = range.fromEpoch; i <= range.toEpoch; i++) {
    if (!isCompleteFinalizedEpochActivity(epochs.get(i) || []))
      missingEpochs.push(i)
  }
  return missingEpochs
}

/**
 * We loop over all the pairs activities/epochBlockNumber and store the validator activities.
 */
interface StoreActivitiesOptions {
  finalizeEpoch?: boolean
}

export async function storeActivities(epochs: EpochsActivities, options: StoreActivitiesOptions = {}) {
  const promises = Object.entries(epochs).map(async ([_epochNumber, activities]) => {
    const epochNumber = Number(_epochNumber)
    const activePromises = Object.entries(activities)
      .map(async ([address, activity]) => storeSingleActivity({ address, activity, epochNumber }))
    await Promise.all(activePromises)
    if (options.finalizeEpoch)
      await clearStaleElectedPlaceholders({ epochNumber, finalizedAddresses: Object.keys(activities) })
  })
  await Promise.all(promises)
}

interface ClearStaleElectedPlaceholdersParams {
  epochNumber: number
  finalizedAddresses: string[]
}

export async function clearStaleElectedPlaceholders({ epochNumber, finalizedAddresses }: ClearStaleElectedPlaceholdersParams) {
  const finalizedAddressSet = new Set(finalizedAddresses)
  const staleRows = await useDrizzle()
    .select({
      validatorId: tables.activity.validatorId,
      address: tables.validators.address,
    })
    .from(tables.activity)
    .innerJoin(tables.validators, eq(tables.activity.validatorId, tables.validators.id))
    .where(and(
      eq(tables.activity.epochNumber, epochNumber),
      not(eq(tables.activity.likelihood, -1)),
      eq(tables.activity.missed, -1),
      eq(tables.activity.rewarded, -1),
    ))
    .all()

  const staleUnelectedRows = staleRows.filter(row => !finalizedAddressSet.has(row.address))
  if (staleUnelectedRows.length === 0)
    return

  await Promise.all(staleUnelectedRows.map(row => useDrizzle()
    .update(tables.activity)
    .set({
      likelihood: -1,
      missed: 0,
      rewarded: 0,
      dominanceRatioViaSlots: -1,
    })
    .where(and(
      eq(tables.activity.epochNumber, epochNumber),
      eq(tables.activity.validatorId, row.validatorId),
    ))
    .execute()))
}

interface StoreActivityParams {
  address: string
  activity: ElectedValidator | UnelectedValidator | null
  epochNumber: number
}

const defaultActivity: ElectedValidator = { likelihood: -1, balance: -1, dominanceRatioViaBalance: -1, dominanceRatioViaSlots: -1, missed: -1, rewarded: -1, address: '', elected: true, stakers: 0 }

async function fetchLatestActivityMetadata(validatorId: number) {
  return useDrizzle()
    .select({
      balance: tables.activity.balance,
      stakers: tables.activity.stakers,
    })
    .from(tables.activity)
    .where(and(
      eq(tables.activity.validatorId, validatorId),
      or(
        gte(tables.activity.balance, 0),
        gte(tables.activity.stakers, 1),
      ),
    ))
    .orderBy(desc(tables.activity.epochNumber))
    .limit(1)
    .then(rows => rows.at(0))
}

export async function storeSingleActivity({ address, activity, epochNumber }: StoreActivityParams) {
  const validatorId = await storeValidator(address)
  if (!validatorId)
    return
  // If we ever move out of cloudflare we could use transactions to avoid inconsistencies and improve performance
  // Cloudflare D1 does not support transactions: https://github.com/cloudflare/workerd/blob/e78561270004797ff008f17790dae7cfe4a39629/src/workerd/api/sql-test.js#L252-L253
  const stored = await useDrizzle()
    .select({
      likelihood: tables.activity.likelihood,
      rewarded: tables.activity.rewarded,
      missed: tables.activity.missed,
      dominanceRatioViaSlots: tables.activity.dominanceRatioViaSlots,
      dominanceRatioViaBalance: tables.activity.dominanceRatioViaBalance,
      balance: tables.activity.balance,
      stakers: tables.activity.stakers,
    })
    .from(tables.activity)
    .where(and(
      eq(tables.activity.epochNumber, epochNumber),
      eq(tables.activity.validatorId, validatorId),
    ))
    .get() || defaultActivity

  const dominanceRatioViaSlots = (stored.dominanceRatioViaSlots === -1 ? activity?.dominanceRatioViaSlots : stored.dominanceRatioViaSlots) || -1
  const dominanceRatioViaBalance = (stored.dominanceRatioViaBalance === -1 ? activity?.dominanceRatioViaBalance : stored.dominanceRatioViaBalance) || -1
  const latestActivityMetadata = await fetchLatestActivityMetadata(validatorId)
  const { balance, stakers } = resolveLiveActivityMetadata(stored, activity || defaultActivity, latestActivityMetadata)

  await useDrizzle().delete(tables.activity).where(and(
    eq(tables.activity.epochNumber, epochNumber),
    eq(tables.activity.validatorId, validatorId),
  ))
  const activityDb: NewActivity = { ...activity!, epochNumber, validatorId, dominanceRatioViaSlots, dominanceRatioViaBalance, balance, stakers }
  await useDrizzle().insert(tables.activity).values(activityDb)
}

interface FetchMissingEpochsParams {
  report?: SyncStreamReportFn
  // AbortController to abort the fetch process once the epoch being processed is finished
  controller?: AbortController
}

/**
 * Fetches the activities of the epochs that have finished and are missing in the database.
 */
export async function fetchMissingEpochs({ report, controller }: FetchMissingEpochsParams = {}): Result<number[]> {
  const { nimiqNetwork: network } = useSafeRuntimeConfig().public

  // The range that we will consider
  const [rangeSuccess, errorRange, range] = await getRange({ network })
  if (!rangeSuccess || !range)
    return [false, errorRange || 'No range', undefined]

  consola.info(`Fetching data for range: [${range.fromBlockNumber}/${range.fromEpoch} - ${range.toBlockNumber}/${range.toEpoch}] (${range.epochCount} epochs). Now at ${range.head}/${range.headEpoch}.`)

  // Only fetch the missing epochs that are not in the database
  const missingEpochs = await findMissingEpochs(range)
  if (missingEpochs.length === 0)
    return [true, undefined, []]

  consola.info(`Fetching missing epochs...`)
  const processedEpochs = new Set<number>()
  const epochGenerator = fetchEpochs(missingEpochs, { network })

  while (true) {
    const epochsActivities: EpochsActivities = {}
    const initialProcessedCount = processedEpochs.size

    // Fetch one epoch activity at a time
    const { value: epochActivityResult, done } = await epochGenerator.next()
    if (done || !epochActivityResult)
      break

    const [success, errorMsg, epochActivity] = epochActivityResult
    if (!success)
      throw createError(errorMsg)

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

    // Mark this epoch as processed
    processedEpochs.add(epochActivity.epochIndex)

    // If we've been aborted and haven't processed anything in this iteration, exit now
    if (controller?.signal.aborted && Object.keys(epochsActivities).length === 0) {
      consola.warn('Fetch process aborted, exiting')
      return [true, undefined, Array.from(processedEpochs)]
    }

    const epochs = Object.keys(epochsActivities).map(Number)
    if (epochs.length === 0 && (await findMissingEpochs(range)).length === 0)
      break

    await storeActivities(epochsActivities)

    // Only log progress if we've processed new epochs in this batch
    if (processedEpochs.size > initialProcessedCount) {
      // Calculate progress based on unique processed epochs rather than individual validator activities
      const percentage = ((processedEpochs.size / missingEpochs.length) * 100).toFixed(2)
      const msg = `Processed epochs: [${Array.from(processedEpochs).join(', ')}]. Progress: ${processedEpochs.size}/${missingEpochs.length} epochs. ${percentage}%`
      consola.info(msg)
      report?.({ kind: 'log', message: msg })
    }

    // Check for abort after storing data
    if (controller?.signal.aborted) {
      consola.warn('Fetch process aborted after storing data')
      return [true, undefined, Array.from(processedEpochs)]
    }
  }

  return [true, undefined, Array.from(processedEpochs)]
}

export async function fetchActiveEpoch(): Result<SnapshotEpochValidators> {
  const [success, error, data] = await categorizeValidatorsSnapshotEpoch()
  if (!success || !data)
    return [false, error || 'No active epoch', undefined]

  const untrackedAddresses = data.untrackedValidators.map(v => v.address)
  if (untrackedAddresses.length > 0)
    consola.warn(`Found ${untrackedAddresses.length} untracked validators in the current epoch.`, untrackedAddresses)
  await Promise.all(untrackedAddresses.map(address => storeValidator(address)))

  // Now we transform the data so we can use the same functions as if the epoch was finished
  // The following fields are the ones that cannot be computed at the moment, and we will compute them later
  const activity: EpochActivity = {}
  for (const { address, ...rest } of data.electedValidators)
    activity[address] = { address, ...rest }
  for (const { address, ...rest } of data.unelectedValidators)
    activity[address] = { address, ...rest }
  consola.info(`Fetched active epoch: ${data.epochNumber} ()`)
  const epochActivity: EpochsActivities = { [data.epochNumber]: activity }
  await storeActivities(epochActivity)

  return [true, undefined, data]
}
