import { initRpcClient } from 'nimiq-rpc-client-ts/client'
import { fetchActivity } from '~~/packages/nimiq-validator-trustscore/src/fetcher'
import { getRange } from '~~/packages/nimiq-validator-trustscore/src/range'
import { storeActivities } from '~~/server/utils/activities'
import { sendNewEpochNotification, sendSyncFailureNotification } from '~~/server/utils/slack'

export default defineEventHandler(async () => {
  try {
    initRpcClient({ url: useRuntimeConfig().albatrossRpcNodeUrl })

    const [rangeOk, rangeError, range] = await getRange({ network: useRuntimeConfig().public.nimiqNetwork })
    if (!rangeOk) {
      const error = createError(rangeError || 'Unable to fetch range')
      await sendSyncFailureNotification('missing-epoch', error)
      throw error
    }

    const missingEpochs = await findMissingEpochs(range)
    if (!missingEpochs) {
      const error = createError('Unable to fetch missing epochs')
      await sendSyncFailureNotification('missing-epoch', error)
      throw error
    }

    if (missingEpochs.length === 0)
      return { isSynced: true, next: null, syncedEpoch: null, totalMissing: 0 }

    const missingEpoch = missingEpochs.at(0)!
    const [activityOk, activityError, epochActivity] = await fetchActivity(missingEpoch)
    if (!activityOk || !epochActivity) {
      const error = createError(activityError || 'Unable to fetch activity')
      await sendSyncFailureNotification('missing-epoch', error)
      throw error
    }

    await storeActivities({ [`${missingEpoch}`]: epochActivity })

    // Send notification for new epoch (only for mainnet, no tagging)
    await sendNewEpochNotification(missingEpoch, missingEpochs.length)

    // Subtract 1 from totalMissing as we've just synced one epoch
    const totalMissing = missingEpochs.length - 1

    return totalMissing === 0
      ? { isSynced: true, next: null, syncedEpoch: missingEpoch, totalMissing }
      : { isSynced: false, next: missingEpochs[1], syncedEpoch: missingEpoch, totalMissing }
  }
  catch (error) {
    // Send failure notification if it hasn't been sent already
    if (!(error as any)?.statusMessage?.includes('SLACK_NOTIFIED')) {
      await sendSyncFailureNotification('missing-epoch', error)
    }
    throw error
  }
})
