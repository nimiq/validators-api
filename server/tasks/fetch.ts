import { fetchActiveEpoch, fetchMissingEpochs } from '../utils/activities'
import { getRpcClient } from '../utils/client'

export default defineTask({
  meta: {
    name: 'fetch',
    description: 'Fetches the necessary data from the blockchain',
  },
  async run() {
    const rpcClient = getRpcClient()

    const [missingEpochsResult, balancesResult, validatorsResult] = await Promise.all([
      // Sync all epochs
      fetchMissingEpochs(rpcClient),
      // Sync all balances in current epoch
      fetchActiveEpoch(rpcClient),
      // Sync all validators JSON files
      undefined,
    ])
    return { result: missingEpochsResult, balancesResult, validatorsResult }
  },
})
