import type { ElectionSet, EpochActivity } from 'nimiq-validator-trustscore/types'
import { and, eq, gte, not } from 'drizzle-orm'
import { fetchActivity, fetchElectionSet } from '~~/packages/nimiq-validator-trustscore/src/fetcher'
import {
  repairCompletedEpoch as repairCompletedEpochDefault,
  resolveCompletedEpochValidatorIds,
} from './activities'
import {
  beginActivityEpochAttempt,
  finalizeVerifiedCompletedEpoch,
  markActivityEpochFailed,
} from './activity-epochs'
import { compareCanonicalAddressSets } from './activity-integrity'
import { tables, useDrizzle } from './drizzle'

export type EpochSyncOutcome
  = | { epochNumber: number, status: 'already_finalized' }
    | { epochNumber: number, status: 'verified' }
    | { epochNumber: number, status: 'repaired' }
    | { epochNumber: number, status: 'failed', error: string, repairAttempted: boolean }

type ElectionSetResult = [success: boolean, error?: string, electionSet?: ElectionSet]
type ActivityResult = [success: boolean, error?: string, activity?: EpochActivity]

export interface ActivitySyncDependencies {
  beginActivityEpochAttempt: (epochNumber: number, startedAt: string) => Promise<boolean>
  fetchElectionSet: (epochNumber: number, options: { network: string }) => Promise<ElectionSetResult>
  fetchActivity: (epochNumber: number, options: { network: string, electionSet: ElectionSet, maxBatchSize?: number }) => Promise<ActivityResult>
  getStoredFinalizedElectedAddresses: (epochNumber: number) => Promise<string[]>
  finalizeVerifiedEpoch: (epochNumber: number, electionSet: ElectionSet, startedAt: string) => Promise<void>
  repairCompletedEpoch: (epochNumber: number, electionSet: ElectionSet, activity: EpochActivity, startedAt: string) => Promise<void>
  markActivityEpochFailed: (epochNumber: number, error: Error, startedAt: string) => Promise<void>
  now: () => Date
  allowRepair: boolean
}

async function getStoredFinalizedElectedAddresses(epochNumber: number): Promise<string[]> {
  const rows = await useDrizzle()
    .select({ address: tables.validators.address })
    .from(tables.activity)
    .innerJoin(tables.validators, eq(tables.activity.validatorId, tables.validators.id))
    .where(and(
      eq(tables.activity.epochNumber, epochNumber),
      not(eq(tables.activity.likelihood, -1)),
      gte(tables.activity.missed, 0),
      gte(tables.activity.rewarded, 0),
    ))
    .all()
  return rows.map(row => row.address)
}

async function finalizeVerifiedEpoch(epochNumber: number, electionSet: ElectionSet, startedAt: string): Promise<void> {
  const resolution = await resolveCompletedEpochValidatorIds(
    electionSet.validators.map(({ address }) => address),
  )
  if (!resolution.complete)
    throw new Error(`Validator provisioning is incomplete for verified epoch ${epochNumber}`)

  await finalizeVerifiedCompletedEpoch(
    epochNumber,
    electionSet,
    resolution.validatorIds,
    startedAt,
    new Date().toISOString(),
  )
}

function formatError(error: unknown): string {
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

const defaultDependencies: ActivitySyncDependencies = {
  beginActivityEpochAttempt,
  fetchElectionSet,
  fetchActivity,
  getStoredFinalizedElectedAddresses,
  finalizeVerifiedEpoch,
  repairCompletedEpoch: repairCompletedEpochDefault,
  markActivityEpochFailed,
  now: () => new Date(),
  allowRepair: true,
}

export async function synchronizeCompletedEpoch(
  epochNumber: number,
  network: string,
  deps: Partial<ActivitySyncDependencies> = {},
): Promise<EpochSyncOutcome> {
  const dependencies = { ...defaultDependencies, ...deps }
  const startedAt = dependencies.now().toISOString()
  let repairAttempted = false

  try {
    if (!await dependencies.beginActivityEpochAttempt(epochNumber, startedAt))
      return { epochNumber, status: 'already_finalized' }

    const [electionSetOk, electionSetError, electionSet] = await dependencies.fetchElectionSet(epochNumber, { network })
    if (!electionSetOk || !electionSet)
      throw new Error(electionSetError || 'Unable to fetch election set')

    const storedAddresses = await dependencies.getStoredFinalizedElectedAddresses(epochNumber)
    if (compareCanonicalAddressSets(
      electionSet.validators.map(validator => validator.address),
      storedAddresses,
    ).matches) {
      await dependencies.finalizeVerifiedEpoch(epochNumber, electionSet, startedAt)
      return { epochNumber, status: 'verified' }
    }

    if (!dependencies.allowRepair)
      throw new Error(`Repair budget exhausted; epoch ${epochNumber} deferred`)

    repairAttempted = true
    const [activityOk, activityError, activity] = await dependencies.fetchActivity(epochNumber, {
      network,
      electionSet,
      maxBatchSize: import.meta.dev ? 120 : 6,
    })
    if (!activityOk || !activity)
      throw new Error(activityError || 'Unable to fetch activity')

    await dependencies.repairCompletedEpoch(epochNumber, electionSet, activity, startedAt)
    return { epochNumber, status: 'repaired' }
  }
  catch (error) {
    const message = formatError(error)
    try {
      await dependencies.markActivityEpochFailed(epochNumber, new Error(message), startedAt)
    }
    catch {
      // Failure reporting must not make a planned later epoch unreachable.
    }
    return { epochNumber, status: 'failed', error: message, repairAttempted }
  }
}
