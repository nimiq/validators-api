import type { ElectedValidator, ElectionSet, EpochActivity, EpochsActivities, Range, Result, UnelectedValidator } from 'nimiq-validator-trustscore/types'
import type { NewActivity } from './drizzle'
import type { StoredSnapshotEpochValidators, SyncStreamReportFn } from './types'
import { consola } from 'consola'
import { and, desc, eq, gte, lte, not, or, sql } from 'drizzle-orm'
import { fetchEpochs } from 'nimiq-validator-trustscore/fetcher'
import { getRange } from 'nimiq-validator-trustscore/range'
import {
  beginActivityEpochAttempt,
  calculateActivityCoverage,
  markActivityEpochFailed,
  persistCompletedEpoch,
  prepareCompletedEpoch,
} from './activity-epochs'
import { canonicalizeValidatorAddress } from './activity-integrity'
import { resolveLiveActivityMetadata } from './activity-metadata'
import { categorizeValidatorsSnapshotEpoch, storeValidator, storeValidatorStrict } from './validators'

/**
 * Given a range, it returns the epochs that are missing in the database.
 */
export async function findMissingEpochs(range: Range) {
  const finalizedEpochs = await useDrizzle()
    .select({ epochNumber: tables.activityEpochs.epochNumber })
    .from(tables.activityEpochs)
    .where(and(
      eq(tables.activityEpochs.status, 'finalized'),
      gte(tables.activityEpochs.epochNumber, range.fromEpoch),
      lte(tables.activityEpochs.epochNumber, range.toEpoch),
    ))
    .all()

  return calculateActivityCoverage(
    range.fromEpoch,
    range.toEpoch,
    finalizedEpochs.map(({ epochNumber }) => epochNumber),
  ).missingEpochs
}

/**
 * We loop over all the pairs activities/epochBlockNumber and store the validator activities.
 */
export interface StoreActivitiesOptions {
  finalizeEpoch?: boolean
  electionSets?: Readonly<Record<number, ElectionSet>>
}

export interface StoreActivitiesResult {
  storedEpochs: number[]
  alreadyFinalizedEpochs: number[]
  provisioningEpochs: number[]
}

export interface CompletedEpochValidatorResolution {
  validatorIds: Map<string, number>
  complete: boolean
}

const MAX_VALIDATOR_PROVISIONS_PER_INVOCATION = 200
const ACTIVITY_UPSERT_CHUNK_SIZE = 5
const defaultActivity: ElectedValidator = { likelihood: -1, balance: -1, dominanceRatioViaBalance: -1, dominanceRatioViaSlots: -1, missed: -1, rewarded: -1, address: '', elected: true, stakers: 0 }

export async function resolveCompletedEpochValidatorIds(
  addresses: readonly string[],
  maxProvisions = MAX_VALIDATOR_PROVISIONS_PER_INVOCATION,
): Promise<CompletedEpochValidatorResolution> {
  const storedValidators = await useDrizzle()
    .select({ id: tables.validators.id, address: tables.validators.address })
    .from(tables.validators)
    .all()
  const validatorIdByCanonicalAddress = new Map<string, number>()
  for (const validator of storedValidators) {
    const canonicalAddress = canonicalizeValidatorAddress(validator.address)
    const existingId = validatorIdByCanonicalAddress.get(canonicalAddress)
    if (existingId !== undefined && existingId !== validator.id)
      throw new Error(`Duplicate stored canonical validator address: ${canonicalAddress}`)
    validatorIdByCanonicalAddress.set(canonicalAddress, validator.id)
  }

  const resolvedValidatorIds = new Map<string, number>()
  const resolvedCanonicalAddresses = new Set<string>()
  const missingAddresses: Array<{ address: string, canonicalAddress: string }> = []
  for (const address of addresses) {
    const canonicalAddress = canonicalizeValidatorAddress(address)
    if (resolvedCanonicalAddresses.has(canonicalAddress))
      throw new Error(`Duplicate election-set validator address: ${canonicalAddress}`)
    resolvedCanonicalAddresses.add(canonicalAddress)

    const validatorId = validatorIdByCanonicalAddress.get(canonicalAddress)
    if (validatorId === undefined)
      missingAddresses.push({ address, canonicalAddress })
    else
      resolvedValidatorIds.set(address, validatorId)
  }

  const addressesToProvision = missingAddresses.slice(0, maxProvisions)
  for (const { address, canonicalAddress } of addressesToProvision) {
    const validatorId = await storeValidatorStrict(address)
    validatorIdByCanonicalAddress.set(canonicalAddress, validatorId)
    resolvedValidatorIds.set(address, validatorId)
  }

  return {
    validatorIds: resolvedValidatorIds,
    complete: missingAddresses.length <= maxProvisions,
  }
}

async function storeNonFinalizedActivities(epochNumber: number, activities: EpochActivity): Promise<'stored' | 'provisioning'> {
  const activityEntries = Object.entries(activities)
  if (activityEntries.length === 0)
    return 'stored'

  const db = useDrizzle()
  const resolution = await resolveCompletedEpochValidatorIds(activityEntries.map(([address]) => address))
  if (!resolution.complete)
    return 'provisioning'

  const storedRows = await db.select({
    validatorId: tables.activity.validatorId,
    likelihood: tables.activity.likelihood,
    rewarded: tables.activity.rewarded,
    missed: tables.activity.missed,
    dominanceRatioViaSlots: tables.activity.dominanceRatioViaSlots,
    dominanceRatioViaBalance: tables.activity.dominanceRatioViaBalance,
    balance: tables.activity.balance,
    stakers: tables.activity.stakers,
  }).from(tables.activity).where(eq(tables.activity.epochNumber, epochNumber)).all()
  const latestLiveEpochs = db.select({
    validatorId: tables.activity.validatorId,
    epochNumber: sql<number>`max(${tables.activity.epochNumber})`.as('latest_epoch_number'),
  }).from(tables.activity).where(or(
    gte(tables.activity.balance, 0),
    gte(tables.activity.stakers, 1),
  )).groupBy(tables.activity.validatorId).as('latest_live_activity')
  const latestLiveRows = await db.select({
    validatorId: tables.activity.validatorId,
    balance: tables.activity.balance,
    stakers: tables.activity.stakers,
  }).from(tables.activity).innerJoin(latestLiveEpochs, and(
    eq(tables.activity.validatorId, latestLiveEpochs.validatorId),
    eq(tables.activity.epochNumber, latestLiveEpochs.epochNumber),
  )).all()
  const storedByValidatorId = new Map(storedRows.map(row => [row.validatorId, row]))
  const latestLiveByValidatorId = new Map(latestLiveRows.map(row => [row.validatorId, row]))
  const activityRows = activityEntries.map(([address, activity]): NewActivity => {
    const validatorId = resolution.validatorIds.get(address)
    if (validatorId === undefined)
      throw new Error(`Failed to resolve validator ID for ${address}`)

    const stored = storedByValidatorId.get(validatorId) || defaultActivity
    const dominanceRatioViaSlots = stored.dominanceRatioViaSlots !== -1
      ? stored.dominanceRatioViaSlots
      : activity.dominanceRatioViaSlots
    const dominanceRatioViaBalance = stored.dominanceRatioViaBalance !== -1
      ? stored.dominanceRatioViaBalance
      : activity.dominanceRatioViaBalance
    const { balance, stakers } = resolveLiveActivityMetadata(
      stored,
      activity,
      latestLiveByValidatorId.get(validatorId),
    )

    return {
      validatorId,
      epochNumber,
      likelihood: activity.likelihood,
      rewarded: activity.rewarded,
      missed: activity.missed,
      dominanceRatioViaBalance,
      dominanceRatioViaSlots,
      balance,
      stakers,
    }
  })
  const finalizedEpochGuard = db.update(tables.activityEpochs).set({
    // Force the snapshot batch to roll back if this epoch finalized after it was fetched.
    startedAt: sql`CASE
      WHEN ${tables.activityEpochs.status} = 'finalized' THEN NULL
      ELSE ${tables.activityEpochs.startedAt}
    END`,
  }).where(eq(tables.activityEpochs.epochNumber, epochNumber))
  const statements = Array.from(
    { length: Math.ceil(activityRows.length / ACTIVITY_UPSERT_CHUNK_SIZE) },
    (_, chunkIndex) => {
      const fromIndex = chunkIndex * ACTIVITY_UPSERT_CHUNK_SIZE
      const activityChunk = activityRows.slice(fromIndex, fromIndex + ACTIVITY_UPSERT_CHUNK_SIZE)
      return db.insert(tables.activity).values(activityChunk).onConflictDoUpdate({
        target: [tables.activity.validatorId, tables.activity.epochNumber],
        set: {
          likelihood: sql`excluded.likelihood`,
          rewarded: sql`excluded.rewarded`,
          missed: sql`excluded.missed`,
          dominanceRatioViaBalance: sql`excluded.dominance_ratio_via_balance`,
          dominanceRatioViaSlots: sql`excluded.dominance_ratio_via_slots`,
          balance: sql`excluded.balance`,
          stakers: sql`excluded.stakers`,
        },
      })
    },
  )
  await db.batch([finalizedEpochGuard, ...statements])
  return 'stored'
}

export async function storeActivities(epochs: EpochsActivities, options: StoreActivitiesOptions = {}) {
  const result: StoreActivitiesResult = {
    storedEpochs: [],
    alreadyFinalizedEpochs: [],
    provisioningEpochs: [],
  }
  if (!options.finalizeEpoch) {
    for (const [_epochNumber, activities] of Object.entries(epochs)) {
      const epochNumber = Number(_epochNumber)
      const outcome = await storeNonFinalizedActivities(epochNumber, activities)
      if (outcome === 'provisioning') {
        result.provisioningEpochs.push(epochNumber)
        return result
      }
      result.storedEpochs.push(epochNumber)
    }
    return result
  }

  for (const [_epochNumber, activities] of Object.entries(epochs)) {
    const epochNumber = Number(_epochNumber)
    const electionSet = options.electionSets?.[epochNumber]
    if (!electionSet)
      throw new Error(`Authoritative election set is required to finalize epoch ${epochNumber}`)

    const startedAt = new Date().toISOString()
    const claimed = await beginActivityEpochAttempt(epochNumber, startedAt)
    if (!claimed) {
      result.alreadyFinalizedEpochs.push(epochNumber)
      continue
    }

    try {
      const resolution = await resolveCompletedEpochValidatorIds(
        electionSet.validators.map(({ address }) => address),
      )
      if (!resolution.complete) {
        result.provisioningEpochs.push(epochNumber)
        return result
      }

      const prepared = await prepareCompletedEpoch({
        epochNumber,
        electionSet,
        activity: activities,
        validatorIds: resolution.validatorIds,
      })
      await persistCompletedEpoch(prepared, startedAt, new Date().toISOString())
      result.storedEpochs.push(epochNumber)
    }
    catch (error) {
      await markActivityEpochFailed(epochNumber, error, startedAt)
      throw error
    }
  }
  return result
}

export async function repairCompletedEpoch(
  epochNumber: number,
  electionSet: ElectionSet,
  activity: EpochActivity,
  startedAt: string,
): Promise<void> {
  const resolution = await resolveCompletedEpochValidatorIds(
    electionSet.validators.map(({ address }) => address),
  )
  if (!resolution.complete)
    throw new Error(`Validator provisioning is incomplete for completed epoch ${epochNumber}`)

  const prepared = await prepareCompletedEpoch({
    epochNumber,
    electionSet,
    activity,
    validatorIds: resolution.validatorIds,
  })
  await persistCompletedEpoch(prepared, startedAt, new Date().toISOString())
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

  const activityDb: NewActivity = { ...activity!, epochNumber, validatorId, dominanceRatioViaSlots, dominanceRatioViaBalance, balance, stakers }
  await useDrizzle().insert(tables.activity).values(activityDb).onConflictDoUpdate({
    target: [tables.activity.validatorId, tables.activity.epochNumber],
    set: {
      likelihood: activityDb.likelihood,
      rewarded: activityDb.rewarded,
      missed: activityDb.missed,
      dominanceRatioViaBalance: activityDb.dominanceRatioViaBalance,
      dominanceRatioViaSlots: activityDb.dominanceRatioViaSlots,
      balance: activityDb.balance,
      stakers: activityDb.stakers,
    },
  }).execute()
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

export async function fetchActiveEpoch(): Result<StoredSnapshotEpochValidators> {
  const [success, error, data] = await categorizeValidatorsSnapshotEpoch()
  if (!success || !data)
    return [false, error || 'No active epoch', undefined]

  const untrackedAddresses = data.untrackedValidators.map(v => v.address)
  if (untrackedAddresses.length > 0)
    consola.warn(`Found ${untrackedAddresses.length} untracked validators in the current epoch.`, untrackedAddresses)

  // Now we transform the data so we can use the same functions as if the epoch was finished
  // The following fields are the ones that cannot be computed at the moment, and we will compute them later
  const activity: EpochActivity = {}
  for (const { address, ...rest } of data.electedValidators)
    activity[address] = { address, ...rest }
  for (const { address, ...rest } of data.unelectedValidators)
    activity[address] = { address, ...rest }
  consola.info(`Fetched active epoch: ${data.epochNumber} ()`)
  const epochActivity: EpochsActivities = { [data.epochNumber]: activity }
  const storeResult = await storeActivities(epochActivity)
  if (storeResult.provisioningEpochs.includes(data.epochNumber))
    return [true, undefined, { ...data, storageOutcome: 'provisioning' }]
  if (!storeResult.storedEpochs.includes(data.epochNumber))
    return [false, `Active epoch ${data.epochNumber} storage returned no outcome`, undefined]

  return [true, undefined, { ...data, storageOutcome: 'stored' }]
}
