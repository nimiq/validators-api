import { initRpcClient } from 'nimiq-rpc-client-ts/client'
import { getRpcUrl } from '~~/server/utils/rpc'
import { sendSyncFailureNotification } from '~~/server/utils/slack'

export default defineTask({
  meta: {
    name: 'sync:snapshot',
    description: 'Sync validator snapshot',
  },
  async run() {
    const config = useSafeRuntimeConfig()

    try {
      const rpcUrl = getRpcUrl()
      if (!rpcUrl)
        throw new Error('No Albatross RPC Node URL')
      initRpcClient({ url: rpcUrl })

      const { nimiqNetwork } = config.public

      const [importSuccess, errorImport, importData] = await importValidatorsBundled(nimiqNetwork)
      if (!importSuccess || !importData) {
        const error = new Error(errorImport || 'Unable to import bundled validators')
        await sendSyncFailureNotification('snapshot', error)
        return { result: { success: false, error: errorImport } }
      }

      const [fetchActiveEpochSuccess, fetchActiveEpochError, fetchActiveEpochData] = await fetchActiveEpoch()
      if (!fetchActiveEpochSuccess || !fetchActiveEpochData) {
        const error = new Error(fetchActiveEpochError || 'Unable to fetch active epoch')
        await sendSyncFailureNotification('snapshot', error)
        return { result: { success: false, error: fetchActiveEpochError } }
      }
      if (fetchActiveEpochData.storageOutcome === 'provisioning') {
        return {
          result: {
            success: true,
            epochNumber: fetchActiveEpochData.epochNumber,
            storageOutcome: 'provisioning',
          },
        }
      }

      return {
        result: {
          success: true,
          epochNumber: fetchActiveEpochData.epochNumber,
          storageOutcome: 'stored',
        },
      }
    }
    catch (error) {
      await sendSyncFailureNotification('snapshot', error)
      return { result: { success: false, error: String(error) } }
    }
  },
})
