import { getRpcClient } from '~~/server/lib/client'
import { fetchActiveEpoch, fetchMissingEpochs } from '~~/server/lib/fetch'

export default defineEventHandler(async () => {
  const rpcClient = getRpcClient()

  const [missingEpochsResult, balancesResult, validatorsResult] = await Promise.all([
    // Sync all epochs
    fetchMissingEpochs(rpcClient),
    // Sync all balances in current epoch
    fetchActiveEpoch(rpcClient),
    // Sync all validators JSON files
    importValidators('github'),
  ])

  return { missingEpochsResult, balancesResult, validatorsResult }
})
