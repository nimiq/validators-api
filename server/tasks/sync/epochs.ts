import type { EpochSyncOutcome } from '~~/server/utils/activity-sync'
import { consola } from 'consola'
import { initRpcClient } from 'nimiq-rpc-client-ts/client'
import { getRange } from '~~/packages/nimiq-validator-trustscore/src/range'
import {
  DEFAULT_SYNCING_LEASE_DURATION_MS,
  getActivityEpochMarkers,
  getRecentEpochRange,
  planEpochSync,
} from '~~/server/utils/activity-epochs'
import { synchronizeCompletedEpoch } from '~~/server/utils/activity-sync'
import { getRpcUrl } from '~~/server/utils/rpc'
import { getOldestV2BackfillEpoch } from '~~/server/utils/scores'
import { sendSyncFailureNotification } from '~~/server/utils/slack'

const MAX_PRODUCTION_EPOCH_CANDIDATES_PER_RUN = 50
const MAX_PRODUCTION_REPAIR_ATTEMPTS_PER_RUN = 4
const PRODUCTION_EPOCH_START_BUDGET_MS = 8 * 60 * 1000
const DEVELOPMENT_SYNCING_LEASE_DURATION_MS = 5 * 60 * 1000

export function getEpochCandidateLimit(isDevelopment: boolean): number {
  return isDevelopment ? Infinity : MAX_PRODUCTION_EPOCH_CANDIDATES_PER_RUN
}

export function getSyncingLeaseDurationMs(isDevelopment: boolean): number {
  return isDevelopment
    ? DEVELOPMENT_SYNCING_LEASE_DURATION_MS
    : DEFAULT_SYNCING_LEASE_DURATION_MS
}

export function isFullRepairAllowed(fullRepairAttempts: number, isDevelopment: boolean): boolean {
  return isDevelopment || fullRepairAttempts < MAX_PRODUCTION_REPAIR_ATTEMPTS_PER_RUN
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

async function notifyFailure(error: Error) {
  try {
    await sendSyncFailureNotification('missing-epoch', error)
  }
  catch (notificationError) {
    consola.info(`[sync:epochs] failure notification failed: ${formatError(notificationError)}`)
  }
}

export default defineTask({
  meta: {
    name: 'sync:epochs',
    description: 'Verify and repair completed blockchain epochs',
  },
  async run() {
    const config = useSafeRuntimeConfig()
    const startedAt = Date.now()

    try {
      const rpcUrl = getRpcUrl()
      if (!rpcUrl)
        throw new Error('No Albatross RPC Node URL')
      initRpcClient({ url: rpcUrl })

      const [rangeOk, rangeError, range] = await getRange({ network: config.public.nimiqNetwork })
      if (!rangeOk || !range) {
        const error = new Error(rangeError || 'Unable to fetch range')
        await notifyFailure(error)
        return { result: { success: false, error: rangeError } }
      }

      const oldestBackfillEpoch = config.scoreV2Mode === 'shadow' || config.scoreV2Mode === 'active'
        ? await getOldestV2BackfillEpoch(range)
        : null
      const plannerRange = {
        fromEpoch: oldestBackfillEpoch === null
          ? range.fromEpoch
          : Math.min(range.fromEpoch, Math.max(1, oldestBackfillEpoch - range.epochCount + 1)),
        toEpoch: range.toEpoch,
      }
      const markers = await getActivityEpochMarkers(plannerRange)
      const recentRange = getRecentEpochRange(range)
      const plannedEpochs = planEpochSync({
        range: plannerRange,
        recentRange,
        markers,
        now: new Date(),
        limit: getEpochCandidateLimit(import.meta.dev),
        syncingLeaseDurationMs: getSyncingLeaseDurationMs(import.meta.dev),
      })
      const outcomes: EpochSyncOutcome[] = []
      const epochsSynced: number[] = []
      let fullRepairAttempts = 0

      for (const epochNumber of plannedEpochs) {
        // Leave unstarted epochs eligible for the next run instead of claiming and failing them.
        if (!isFullRepairAllowed(fullRepairAttempts, import.meta.dev)
          || (!import.meta.dev && Date.now() - startedAt >= PRODUCTION_EPOCH_START_BUDGET_MS)) {
          break
        }

        let outcome: EpochSyncOutcome
        try {
          outcome = await synchronizeCompletedEpoch(epochNumber, config.public.nimiqNetwork)
        }
        catch (error) {
          outcome = { epochNumber, status: 'failed', error: formatError(error), repairAttempted: false }
        }
        outcomes.push(outcome)

        if (outcome.status === 'verified' || outcome.status === 'repaired')
          epochsSynced.push(epochNumber)
        if (outcome.status === 'repaired' || (outcome.status === 'failed' && outcome.repairAttempted))
          fullRepairAttempts++
      }

      const deferredEpochs = plannedEpochs.slice(outcomes.length)
      consola.info(`[sync:epochs] finalized ${epochsSynced.length}, repair attempts ${fullRepairAttempts}, deferred ${deferredEpochs.length} planned epoch(s)`)

      const failures = outcomes.filter((outcome): outcome is Extract<EpochSyncOutcome, { status: 'failed' }> => outcome.status === 'failed')
      const recentFailure = failures.find(outcome => outcome.epochNumber >= recentRange.fromEpoch)
      const historicalFailures = failures.filter(outcome => outcome.epochNumber < recentRange.fromEpoch)
      const failureSummaries: string[] = []
      if (recentFailure) {
        const summary = `[sync:epochs] epoch ${recentFailure.epochNumber} failed: ${recentFailure.error}`
        failureSummaries.push(summary)
        await notifyFailure(new Error(summary))
      }
      if (historicalFailures.length > 0) {
        const summary = `[sync:epochs] ${historicalFailures.length} historical epoch sync failure(s): ${historicalFailures.map(outcome => outcome.epochNumber).join(', ')}`
        failureSummaries.push(summary)
        await notifyFailure(new Error(summary))
      }

      return {
        result: {
          success: failures.length === 0,
          ...(failureSummaries.length > 0 ? { error: failureSummaries.join('; ') } : {}),
          totalSynced: epochsSynced.length,
          epochsSynced,
          deferredEpochs,
          outcomes,
        },
      }
    }
    catch (error) {
      await notifyFailure(error instanceof Error ? error : new Error(formatError(error)))
      return { result: { success: false, error: formatError(error) } }
    }
  },
})
