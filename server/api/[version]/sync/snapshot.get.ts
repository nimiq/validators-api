import { initRpcClient } from 'nimiq-rpc-client-ts/client'
import { isDevelopment } from 'std-env'
import { sendSyncFailureNotification } from '~~/server/utils/slack'

export default defineEventHandler(async () => {
  try {
    initRpcClient({ url: useRuntimeConfig().albatrossRpcNodeUrl })

    const source = isDevelopment ? 'filesystem' : 'github'
    const { nimiqNetwork, gitBranch } = useRuntimeConfig().public
    const [importSuccess, errorImport, importData] = await importValidators(source, { nimiqNetwork, gitBranch })
    if (!importSuccess || !importData) {
      const error = createError(errorImport || 'Unable to import from GitHub')
      await sendSyncFailureNotification('snapshot', error)
      throw error
    }

    const [fetchActiveEpochSuccess, fetchActiveEpochError, fetchActiveEpochData] = await fetchActiveEpoch()
    if (!fetchActiveEpochSuccess || !fetchActiveEpochData) {
      const error = createError(fetchActiveEpochError || 'Unable to fetch active epoch')
      await sendSyncFailureNotification('snapshot', error)
      throw error
    }

    const [scoresSuccess, errorScores, scores] = await upsertScoresSnapshotEpoch()
    if (!scoresSuccess || !scores) {
      const error = createError(errorScores || 'Unable to fetch scores')
      await sendSyncFailureNotification('snapshot', error)
      throw error
    }

    return { success: true, data: { ...fetchActiveEpochData, scores } }
  }
  catch (error) {
    // Send failure notification if it hasn't been sent already
    if (!(error as any)?.statusMessage?.includes('SLACK_NOTIFIED')) {
      await sendSyncFailureNotification('snapshot', error)
    }
    throw error
  }
})
