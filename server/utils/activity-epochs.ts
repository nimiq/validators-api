import type { ElectionSet, EpochActivity, Range } from 'nimiq-validator-trustscore/types'
import type { NewActivity } from './drizzle'
import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { ActivityEpochStatus } from '../db/schema'
import {
  canonicalizeAddressSet,
  canonicalizeValidatorAddress,
  compareCanonicalAddressSets,
  hashCanonicalAddressSet,
} from './activity-integrity'
import { tables, useDrizzle } from './drizzle'

const RECENT_ACTIVITY_DURATION_MS = 14 * 24 * 60 * 60 * 1000
export const DEFAULT_SYNCING_LEASE_DURATION_MS = 6 * 60 * 60 * 1000
const DEFAULT_EPOCH_SYNC_LIMIT = 50
const ACTIVITY_UPSERT_CHUNK_SIZE = 5

export interface ActivityCoverage {
  fromEpoch: number
  toEpoch: number
  expectedEpochCount: number
  finalizedEpochCount: number
  coverage: number
  missingEpochs: number[]
}

export interface ActivityEpochPlannerMarker {
  epochNumber: number
  status: typeof ActivityEpochStatus[keyof typeof ActivityEpochStatus]
  startedAt: string
}

export interface ActivityEpochMarker extends ActivityEpochPlannerMarker {
  finalizedAt: string | null
  lastError: string | null
}

export interface PlanEpochSyncInput {
  range: Pick<Range, 'fromEpoch' | 'toEpoch'>
  recentRange: Pick<Range, 'fromEpoch' | 'toEpoch'>
  markers: readonly ActivityEpochPlannerMarker[]
  now: string | Date
  limit?: number
  syncingLeaseDurationMs?: number
}

export async function getActivityEpochMarkers(
  range?: Pick<Range, 'fromEpoch' | 'toEpoch'>,
): Promise<ActivityEpochMarker[]> {
  const query = useDrizzle().select({
    epochNumber: tables.activityEpochs.epochNumber,
    status: tables.activityEpochs.status,
    startedAt: tables.activityEpochs.startedAt,
    finalizedAt: tables.activityEpochs.finalizedAt,
    lastError: tables.activityEpochs.lastError,
  }).from(tables.activityEpochs)

  if (!range)
    return query.all()

  return query.where(and(
    gte(tables.activityEpochs.epochNumber, range.fromEpoch),
    lte(tables.activityEpochs.epochNumber, range.toEpoch),
  )).all()
}

export interface PrepareCompletedEpochInput {
  epochNumber: number
  electionSet: ElectionSet
  activity: EpochActivity
  validatorIds: ReadonlyMap<string, number>
}

export interface PreparedCompletedEpoch {
  epochNumber: number
  expectedElectedCount: number
  storedElectedCount: number
  electedSetHash: string
  activities: NewActivity[]
}

export function getRecentEpochRange(range: Range, durationMs = RECENT_ACTIVITY_DURATION_MS): { fromEpoch: number, toEpoch: number } {
  if (!Number.isFinite(durationMs) || durationMs <= 0)
    throw new RangeError('Recent activity duration must be positive')
  if (!Number.isFinite(range.epochDurationMs) || range.epochDurationMs <= 0)
    throw new RangeError('Epoch duration must be positive')

  const epochCount = Math.max(1, Math.ceil(durationMs / range.epochDurationMs))
  return {
    fromEpoch: Math.max(range.fromEpoch, range.toEpoch - epochCount + 1),
    toEpoch: range.toEpoch,
  }
}

export function calculateActivityCoverage(fromEpoch: number, toEpoch: number, finalizedEpochs: readonly number[]): ActivityCoverage {
  if (!Number.isInteger(fromEpoch) || !Number.isInteger(toEpoch) || fromEpoch > toEpoch)
    throw new RangeError(`Invalid activity epoch range: ${fromEpoch}-${toEpoch}`)

  const finalizedSet = new Set(finalizedEpochs.filter(epoch => Number.isInteger(epoch) && epoch >= fromEpoch && epoch <= toEpoch))
  const missingEpochs: number[] = []
  for (let epochNumber = fromEpoch; epochNumber <= toEpoch; epochNumber++) {
    if (!finalizedSet.has(epochNumber))
      missingEpochs.push(epochNumber)
  }

  const expectedEpochCount = toEpoch - fromEpoch + 1
  const finalizedEpochCount = finalizedSet.size
  return {
    fromEpoch,
    toEpoch,
    expectedEpochCount,
    finalizedEpochCount,
    coverage: finalizedEpochCount / expectedEpochCount,
    missingEpochs,
  }
}

export function planEpochSync(input: PlanEpochSyncInput): number[] {
  const nowMs = input.now instanceof Date ? input.now.getTime() : Date.parse(input.now)
  if (!Number.isFinite(nowMs))
    throw new Error(`Invalid planner time: ${input.now}`)
  const syncingLeaseDurationMs = input.syncingLeaseDurationMs ?? DEFAULT_SYNCING_LEASE_DURATION_MS
  if (!Number.isFinite(syncingLeaseDurationMs) || syncingLeaseDurationMs <= 0)
    throw new RangeError(`Invalid syncing lease duration: ${syncingLeaseDurationMs}`)

  const markerByEpoch = new Map(input.markers.map(marker => [marker.epochNumber, marker]))
  const planned = new Set<number>()
  const ordered: number[] = []
  const add = (epochNumber: number) => {
    if (epochNumber < input.range.fromEpoch || epochNumber > input.range.toEpoch || planned.has(epochNumber))
      return
    planned.add(epochNumber)
    ordered.push(epochNumber)
  }
  const isStaleSyncing = (marker: ActivityEpochPlannerMarker) => {
    if (marker.status !== ActivityEpochStatus.Syncing)
      return false
    const startedAtMs = Date.parse(marker.startedAt)
    return !Number.isFinite(startedAtMs) || nowMs - startedAtMs >= syncingLeaseDurationMs
  }
  const isFailedOrStale = (marker: ActivityEpochPlannerMarker | undefined) => marker?.status === ActivityEpochStatus.Failed || (marker ? isStaleSyncing(marker) : false)
  const isEligible = (marker: ActivityEpochPlannerMarker | undefined) => !marker || isFailedOrStale(marker)

  const latestCompleted = input.range.toEpoch
  if (isEligible(markerByEpoch.get(latestCompleted)))
    add(latestCompleted)

  const recentFromEpoch = Math.max(input.range.fromEpoch, input.recentRange.fromEpoch)
  const recentToEpoch = Math.min(input.range.toEpoch, input.recentRange.toEpoch)
  for (let epochNumber = recentToEpoch; epochNumber >= recentFromEpoch; epochNumber--) {
    if (isFailedOrStale(markerByEpoch.get(epochNumber)))
      add(epochNumber)
  }
  for (let epochNumber = recentToEpoch; epochNumber >= recentFromEpoch; epochNumber--) {
    if (!markerByEpoch.has(epochNumber))
      add(epochNumber)
  }

  for (let epochNumber = recentFromEpoch - 1; epochNumber >= input.range.fromEpoch; epochNumber--) {
    if (isFailedOrStale(markerByEpoch.get(epochNumber)))
      add(epochNumber)
  }
  for (let epochNumber = recentFromEpoch - 1; epochNumber >= input.range.fromEpoch; epochNumber--) {
    if (!markerByEpoch.has(epochNumber))
      add(epochNumber)
  }

  const limit = input.limit ?? DEFAULT_EPOCH_SYNC_LIMIT
  if (!Number.isFinite(limit) && limit !== Infinity)
    throw new RangeError(`Invalid epoch sync limit: ${limit}`)
  return ordered.slice(0, Math.max(0, Math.floor(limit)))
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}

export async function prepareCompletedEpoch(input: PrepareCompletedEpochInput): Promise<PreparedCompletedEpoch> {
  if (!Number.isInteger(input.epochNumber) || input.epochNumber < 1)
    throw new Error(`Invalid completed epoch number: ${input.epochNumber}`)
  if (input.electionSet.epochIndex !== input.epochNumber)
    throw new Error(`Election set epoch ${input.electionSet.epochIndex} does not match completed epoch ${input.epochNumber}`)

  const electionAddresses = input.electionSet.validators.map(validator => validator.address)
  const activityAddresses = Object.keys(input.activity)
  const validatorIdAddresses = Array.from(input.validatorIds.keys())
  const activityComparison = compareCanonicalAddressSets(electionAddresses, activityAddresses)
  if (!activityComparison.matches)
    throw new Error(`Election and activity address sets do not match: ${JSON.stringify(activityComparison)}`)
  const validatorIdComparison = compareCanonicalAddressSets(electionAddresses, validatorIdAddresses)
  if (!validatorIdComparison.matches)
    throw new Error(`Election and validator ID address sets do not match: ${JSON.stringify(validatorIdComparison)}`)

  const expectedElectedCount = electionAddresses.length
  if (activityAddresses.length !== expectedElectedCount || input.validatorIds.size !== expectedElectedCount)
    throw new Error(`Completed epoch count mismatch: expected ${expectedElectedCount}, activity ${activityAddresses.length}, validator IDs ${input.validatorIds.size}`)

  const activityByCanonicalAddress = new Map<string, EpochActivity[string]>()
  for (const [address, activity] of Object.entries(input.activity)) {
    const canonicalAddress = canonicalizeValidatorAddress(address)
    if (canonicalizeValidatorAddress(activity.address) !== canonicalAddress)
      throw new Error(`Activity payload address does not match key: ${address}`)
    if (!activity.elected)
      throw new Error(`Completed epoch activity must be elected: ${address}`)
    if (!isNonNegativeInteger(activity.missed) || !isNonNegativeInteger(activity.rewarded))
      throw new Error(`Completed epoch activity counters must be finalized non-negative integers: ${address}`)
    activityByCanonicalAddress.set(canonicalAddress, activity)
  }

  const validatorIdByCanonicalAddress = new Map<string, number>()
  const storedValidatorIds = new Set<number>()
  for (const [address, validatorId] of input.validatorIds) {
    if (!Number.isInteger(validatorId) || validatorId < 1)
      throw new Error(`Invalid stored validator ID for ${address}: ${validatorId}`)
    if (storedValidatorIds.has(validatorId))
      throw new Error(`Duplicate stored validator ID: ${validatorId}`)
    storedValidatorIds.add(validatorId)
    validatorIdByCanonicalAddress.set(canonicalizeValidatorAddress(address), validatorId)
  }

  const electionValidatorByCanonicalAddress = new Map(input.electionSet.validators.map(validator => [
    canonicalizeValidatorAddress(validator.address),
    validator,
  ]))
  const activities = canonicalizeAddressSet(electionAddresses).map((canonicalAddress): NewActivity => {
    const activity = activityByCanonicalAddress.get(canonicalAddress)
    const validatorId = validatorIdByCanonicalAddress.get(canonicalAddress)
    const electionValidator = electionValidatorByCanonicalAddress.get(canonicalAddress)
    if (!activity || !validatorId || !electionValidator)
      throw new Error(`Missing prepared completed epoch data for ${canonicalAddress}`)
    if (activity.likelihood !== electionValidator.numSlots)
      throw new Error(`Election slots and activity likelihood do not match for ${canonicalAddress}`)

    return {
      validatorId,
      epochNumber: input.epochNumber,
      likelihood: activity.likelihood,
      rewarded: activity.rewarded,
      missed: activity.missed,
      dominanceRatioViaBalance: activity.dominanceRatioViaBalance,
      dominanceRatioViaSlots: activity.dominanceRatioViaSlots,
      balance: activity.balance,
      stakers: activity.stakers,
    }
  })

  return {
    epochNumber: input.epochNumber,
    expectedElectedCount,
    storedElectedCount: activities.length,
    electedSetHash: await hashCanonicalAddressSet(electionAddresses),
    activities,
  }
}

export async function beginActivityEpochAttempt(epochNumber: number, startedAt: string): Promise<boolean> {
  const claimed = await useDrizzle().insert(tables.activityEpochs).values({
    epochNumber,
    status: ActivityEpochStatus.Syncing,
    attemptCount: 1,
    startedAt,
    expectedElectedCount: null,
    storedElectedCount: null,
    electedSetHash: null,
    finalizedAt: null,
    lastError: null,
  }).onConflictDoUpdate({
    target: tables.activityEpochs.epochNumber,
    set: {
      status: ActivityEpochStatus.Syncing,
      attemptCount: sql`${tables.activityEpochs.attemptCount} + 1`,
      startedAt,
      expectedElectedCount: null,
      storedElectedCount: null,
      electedSetHash: null,
      finalizedAt: null,
      lastError: null,
    },
    setWhere: sql`${tables.activityEpochs.status} != ${ActivityEpochStatus.Finalized}`,
  }).returning({
    status: tables.activityEpochs.status,
    startedAt: tables.activityEpochs.startedAt,
  }).get()

  return claimed !== undefined
    && claimed.status === ActivityEpochStatus.Syncing
    && claimed.startedAt === startedAt
}

function formatActivityEpochError(error: unknown): string {
  if (error instanceof Error)
    return error.message || error.name
  if (typeof error === 'string')
    return error
  try {
    return JSON.stringify(error) || String(error)
  }
  catch {
    return String(error)
  }
}

export async function markActivityEpochFailed(epochNumber: number, error: unknown, startedAt?: string): Promise<void> {
  const ownershipConditions = [
    eq(tables.activityEpochs.epochNumber, epochNumber),
    eq(tables.activityEpochs.status, ActivityEpochStatus.Syncing),
  ]
  if (startedAt)
    ownershipConditions.push(eq(tables.activityEpochs.startedAt, startedAt))

  await useDrizzle().update(tables.activityEpochs).set({
    status: ActivityEpochStatus.Failed,
    finalizedAt: null,
    lastError: formatActivityEpochError(error),
  }).where(and(...ownershipConditions)).execute()
}

export async function persistCompletedEpoch(prepared: PreparedCompletedEpoch, startedAt: string, finalizedAt: string): Promise<void> {
  if (!isNonNegativeInteger(prepared.expectedElectedCount)
    || !isNonNegativeInteger(prepared.storedElectedCount)
    || prepared.expectedElectedCount !== prepared.storedElectedCount
    || prepared.activities.length !== prepared.storedElectedCount) {
    throw new Error('Prepared completed epoch counts must be matching non-negative integers')
  }
  if (prepared.activities.some(activity => !isNonNegativeInteger(activity.rewarded) || !isNonNegativeInteger(activity.missed)))
    throw new Error('Prepared completed epoch activity counters must be non-negative integers')

  const db = useDrizzle()
  const currentAttempt = await db.select({
    status: tables.activityEpochs.status,
    startedAt: tables.activityEpochs.startedAt,
  }).from(tables.activityEpochs).where(eq(tables.activityEpochs.epochNumber, prepared.epochNumber)).get()
  if (currentAttempt && (
    currentAttempt.startedAt !== startedAt
    || (currentAttempt.status !== ActivityEpochStatus.Syncing && currentAttempt.status !== ActivityEpochStatus.Finalized)
  )) {
    throw new Error(`Stale activity epoch attempt cannot finalize epoch ${prepared.epochNumber}`)
  }

  // A mismatched owner resolves startedAt to NULL, forcing the whole batch to roll back.
  const markerStatement = db.insert(tables.activityEpochs).values({
    epochNumber: prepared.epochNumber,
    status: ActivityEpochStatus.Syncing,
    expectedElectedCount: prepared.expectedElectedCount,
    storedElectedCount: prepared.storedElectedCount,
    electedSetHash: prepared.electedSetHash,
    attemptCount: 1,
    startedAt,
    finalizedAt: null,
    lastError: null,
  }).onConflictDoUpdate({
    target: tables.activityEpochs.epochNumber,
    set: {
      status: ActivityEpochStatus.Syncing,
      expectedElectedCount: prepared.expectedElectedCount,
      storedElectedCount: prepared.storedElectedCount,
      electedSetHash: prepared.electedSetHash,
      startedAt: sql`CASE
        WHEN ${tables.activityEpochs.startedAt} = ${startedAt}
          AND ${tables.activityEpochs.status} IN (${ActivityEpochStatus.Syncing}, ${ActivityEpochStatus.Finalized})
        THEN ${startedAt}
        ELSE NULL
      END`,
      finalizedAt: null,
      lastError: null,
    },
  })
  const expectedValidatorIds = [...new Set(prepared.activities.map(activity => activity.validatorId))]
  // IDs come from validated stored-validator rows; literals avoid D1 bind limits for large election sets.
  const deleteStaleStatement = expectedValidatorIds.length === 0
    ? db.delete(tables.activity).where(eq(tables.activity.epochNumber, prepared.epochNumber))
    : db.delete(tables.activity).where(and(
        eq(tables.activity.epochNumber, prepared.epochNumber),
        sql`${tables.activity.validatorId} NOT IN (${sql.raw(expectedValidatorIds.join(', '))})`,
      ))
  const activityStatements = Array.from(
    { length: Math.ceil(prepared.activities.length / ACTIVITY_UPSERT_CHUNK_SIZE) },
    (_, chunkIndex) => {
      const fromIndex = chunkIndex * ACTIVITY_UPSERT_CHUNK_SIZE
      const activityChunk = prepared.activities.slice(fromIndex, fromIndex + ACTIVITY_UPSERT_CHUNK_SIZE)
      return db.insert(tables.activity).values(activityChunk).onConflictDoUpdate({
        target: [tables.activity.validatorId, tables.activity.epochNumber],
        set: {
          likelihood: sql`excluded.likelihood`,
          rewarded: sql`excluded.rewarded`,
          missed: sql`excluded.missed`,
          dominanceRatioViaBalance: sql`CASE WHEN ${tables.activity.dominanceRatioViaBalance} != -1 THEN ${tables.activity.dominanceRatioViaBalance} ELSE excluded.dominance_ratio_via_balance END`,
          dominanceRatioViaSlots: sql`CASE WHEN ${tables.activity.dominanceRatioViaSlots} != -1 THEN ${tables.activity.dominanceRatioViaSlots} ELSE excluded.dominance_ratio_via_slots END`,
          balance: sql`CASE WHEN excluded.balance >= 0 THEN excluded.balance ELSE ${tables.activity.balance} END`,
          stakers: sql`CASE WHEN excluded.balance >= 0 OR excluded.stakers > 0 THEN excluded.stakers ELSE ${tables.activity.stakers} END`,
        },
      })
    },
  )
  const finalizeStatement = db.update(tables.activityEpochs).set({
    status: ActivityEpochStatus.Finalized,
    expectedElectedCount: prepared.expectedElectedCount,
    storedElectedCount: prepared.storedElectedCount,
    electedSetHash: prepared.electedSetHash,
    finalizedAt,
    lastError: null,
  }).where(and(
    eq(tables.activityEpochs.epochNumber, prepared.epochNumber),
    eq(tables.activityEpochs.status, ActivityEpochStatus.Syncing),
    eq(tables.activityEpochs.startedAt, startedAt),
  ))

  await db.batch([
    markerStatement,
    deleteStaleStatement,
    ...activityStatements,
    finalizeStatement,
  ])
}

export async function finalizeVerifiedCompletedEpoch(
  epochNumber: number,
  electionSet: ElectionSet,
  validatorIds: ReadonlyMap<string, number>,
  startedAt: string,
  finalizedAt: string,
): Promise<void> {
  if (electionSet.epochIndex !== epochNumber)
    throw new Error(`Election set epoch ${electionSet.epochIndex} does not match completed epoch ${epochNumber}`)

  const electionAddresses = electionSet.validators.map(validator => validator.address)
  const validatorIdAddresses = Array.from(validatorIds.keys())
  const validatorIdComparison = compareCanonicalAddressSets(electionAddresses, validatorIdAddresses)
  if (!validatorIdComparison.matches)
    throw new Error(`Election and validator ID address sets do not match: ${JSON.stringify(validatorIdComparison)}`)

  const expectedValidatorIds = [...new Set(validatorIds.values())]
  if (expectedValidatorIds.length !== electionAddresses.length
    || expectedValidatorIds.some(validatorId => !Number.isInteger(validatorId) || validatorId < 1)) {
    throw new Error('Verified completed epoch validator IDs must be unique positive integers')
  }

  const expectedElectedCount = electionAddresses.length
  const electedSetHash = await hashCanonicalAddressSet(electionAddresses)
  const db = useDrizzle()
  const currentAttempt = await db.select({
    status: tables.activityEpochs.status,
    startedAt: tables.activityEpochs.startedAt,
  }).from(tables.activityEpochs).where(eq(tables.activityEpochs.epochNumber, epochNumber)).get()
  if (currentAttempt && (
    currentAttempt.startedAt !== startedAt
    || (currentAttempt.status !== ActivityEpochStatus.Syncing && currentAttempt.status !== ActivityEpochStatus.Finalized)
  )) {
    throw new Error(`Stale activity epoch attempt cannot finalize epoch ${epochNumber}`)
  }

  const markerStatement = db.insert(tables.activityEpochs).values({
    epochNumber,
    status: ActivityEpochStatus.Syncing,
    expectedElectedCount,
    storedElectedCount: expectedElectedCount,
    electedSetHash,
    attemptCount: 1,
    startedAt,
    finalizedAt: null,
    lastError: null,
  }).onConflictDoUpdate({
    target: tables.activityEpochs.epochNumber,
    set: {
      status: ActivityEpochStatus.Syncing,
      expectedElectedCount,
      storedElectedCount: expectedElectedCount,
      electedSetHash,
      startedAt: sql`CASE
        WHEN ${tables.activityEpochs.startedAt} = ${startedAt}
          AND ${tables.activityEpochs.status} IN (${ActivityEpochStatus.Syncing}, ${ActivityEpochStatus.Finalized})
        THEN ${startedAt}
        ELSE NULL
      END`,
      finalizedAt: null,
      lastError: null,
    },
  })
  const deleteSnapshotRows = expectedValidatorIds.length === 0
    ? db.delete(tables.activity).where(eq(tables.activity.epochNumber, epochNumber))
    : db.delete(tables.activity).where(and(
        eq(tables.activity.epochNumber, epochNumber),
        sql`${tables.activity.validatorId} NOT IN (${sql.raw(expectedValidatorIds.join(', '))})`,
      ))
  const finalizeStatement = db.update(tables.activityEpochs).set({
    status: ActivityEpochStatus.Finalized,
    expectedElectedCount,
    storedElectedCount: expectedElectedCount,
    electedSetHash,
    finalizedAt,
    lastError: null,
  }).where(and(
    eq(tables.activityEpochs.epochNumber, epochNumber),
    eq(tables.activityEpochs.status, ActivityEpochStatus.Syncing),
    eq(tables.activityEpochs.startedAt, startedAt),
  ))

  await db.batch([markerStatement, deleteSnapshotRows, finalizeStatement])
}
