import { initRpcClient } from 'nimiq-rpc-client-ts/client'
import { sendSyncFailureNotification } from '~~/server/utils/slack'

export default defineTask({
  meta: {
    name: 'sync:snapshot',
    description: 'Sync validator snapshot and calculate scores',
  },
  async run() {
    const config = useRuntimeConfig()

    try {
      initRpcClient({ url: config.albatrossRpcNodeUrl })

      // Use import.meta.dev for consistent behavior with Cloudflare Workers runtime
      const source = import.meta.dev ? 'filesystem' : 'github'
      const { nimiqNetwork, gitBranch } = config.public

      const [importSuccess, errorImport, importData] = await importValidators(source, { nimiqNetwork, gitBranch })
      if (!importSuccess || !importData) {
        const error = new Error(errorImport || 'Unable to import from GitHub')
        await sendSyncFailureNotification('snapshot', error)
        return { result: { success: false, error: errorImport } }
      }

      const [fetchActiveEpochSuccess, fetchActiveEpochError, fetchActiveEpochData] = await fetchActiveEpoch()
      if (!fetchActiveEpochSuccess || !fetchActiveEpochData) {
        const error = new Error(fetchActiveEpochError || 'Unable to fetch active epoch')
        await sendSyncFailureNotification('snapshot', error)
        return { result: { success: false, error: fetchActiveEpochError } }
      }

      const [scoresSuccess, errorScores, scores] = await upsertScoresSnapshotEpoch()
      if (!scoresSuccess || !scores) {
        const error = new Error(errorScores || 'Unable to fetch scores')
        await sendSyncFailureNotification('snapshot', error)
        return { result: { success: false, error: errorScores } }
      }

      return { result: { success: true, epochNumber: fetchActiveEpochData.epochNumber } }
    }
    catch (error) {
      await sendSyncFailureNotification('snapshot', error)
      return { result: { success: false, error: String(error) } }
    }
  },
})
