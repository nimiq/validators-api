import { fetchActiveEpoch, fetchMissingEpochs } from '~~/server/utils/activities'
import { getRpcClient } from '~~/server/utils/client'

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

  if (missingEpochsResult.error || balancesResult.error || validatorsResult.error)
    return { missingEpochsResult, balancesResult, validatorsResult, scores: null }

  const scores = await upsertScoresCurrentEpoch()

  return { missingEpochsResult, balancesResult, validatorsResult, scores }
})
