import { consola } from 'consola'
import { initRpcClient } from 'nimiq-rpc-client-ts/client'
import { fetchActivity } from '~~/packages/nimiq-validator-trustscore/src/fetcher'
import { getRange } from '~~/packages/nimiq-validator-trustscore/src/range'
import { formatActivityBatchProgress, formatEpochSyncProgress } from '~~/packages/nimiq-validator-trustscore/src/sync-progress'
import { storeActivities } from '~~/server/utils/activities'
import { getRpcUrl } from '~~/server/utils/rpc'
import { sendNewEpochNotification, sendSyncFailureNotification } from '~~/server/utils/slack'

// In production, limit epochs per run to avoid Cloudflare Workers 30s CPU timeout.
// In local dev, no limit so we can sync everything at once.
const MAX_EPOCHS_PER_RUN = import.meta.dev ? Infinity : 50

export default defineTask({
  meta: {
    name: 'sync:epochs',
    description: 'Sync all missing blockchain epochs to D1 database',
  },
  async run() {
    const config = useSafeRuntimeConfig()

    try {
      const rpcUrl = getRpcUrl()
      if (!rpcUrl)
        throw new Error('No Albatross RPC Node URL')
      initRpcClient({ url: rpcUrl })

      const [rangeOk, rangeError, range] = await getRange({ network: config.public.nimiqNetwork })
      if (!rangeOk || !range) {
        const error = new Error(rangeError || 'Unable to fetch range')
        await sendSyncFailureNotification('missing-epoch', error)
        return { result: { success: false, error: rangeError } }
      }

      let totalSynced = 0
      const epochsSynced: number[] = []
      const maxEpochsPerRunLabel = Number.isFinite(MAX_EPOCHS_PER_RUN) ? MAX_EPOCHS_PER_RUN : 'all'
      consola.info(`[sync:epochs] range ${range.fromEpoch}-${range.toEpoch} on ${config.public.nimiqNetwork}`)

      while (totalSynced < MAX_EPOCHS_PER_RUN) {
        const missingEpochs = await findMissingEpochs(range)
        if (!missingEpochs || missingEpochs.length === 0) {
          consola.info(`[sync:epochs] no missing epochs after syncing ${totalSynced}`)
          break
        }

        const missingEpoch = missingEpochs.at(0)!
        consola.info(formatEpochSyncProgress({
          epochIndex: missingEpoch,
          missingEpochsCount: missingEpochs.length,
          runIndex: totalSynced + 1,
          maxEpochsPerRun: maxEpochsPerRunLabel,
        }))
        const [activityOk, activityError, epochActivity] = await fetchActivity(missingEpoch, {
          network: config.public.nimiqNetwork,
          maxBatchSize: import.meta.dev ? 120 : 6,
          onProgress: progress => consola.info(formatActivityBatchProgress(progress)),
        })
        if (!activityOk || !epochActivity) {
          const error = new Error(activityError || 'Unable to fetch activity')
          await sendSyncFailureNotification('missing-epoch', error)
          return { result: { success: false, error: activityError, totalSynced, epochsSynced } }
        }

        await storeActivities({ [`${missingEpoch}`]: epochActivity }, { finalizeEpoch: true })
        consola.info(`[sync:epochs] epoch ${missingEpoch} stored (${totalSynced + 1}/${maxEpochsPerRunLabel})`)
        await sendNewEpochNotification(missingEpoch, missingEpochs.length)

        epochsSynced.push(missingEpoch)
        totalSynced++
      }

      consola.info(`[sync:epochs] finished; synced ${totalSynced} epoch(s)`)
      return { result: { success: true, totalSynced, epochsSynced } }
    }
    catch (error) {
      await sendSyncFailureNotification('missing-epoch', error)
      return { result: { success: false, error: String(error) } }
    }
  },
})
