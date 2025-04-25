import { createConsola } from 'consola'
import { initRpcClient } from 'nimiq-rpc-client-ts/config'
import { isDevelopment } from 'std-env'

const consola = createConsola({ defaults: { tag: 'sync' } })

export default defineEventHandler(async () => {
  if (!useRuntimeConfig().albatrossRpcNodeUrl)
    throw createError('No Albatross RPC Node URL')
  initRpcClient({ url: useRuntimeConfig().albatrossRpcNodeUrl })
  consola.info('Starting syncing...')
  const [importSuccess, errorImport, importData] = await importValidators(isDevelopment ? 'filesystem' : 'github')
  if (!importSuccess || !importData)
    throw createError({ statusCode: 500, statusMessage: errorImport || 'Unable to import from GitHub' })

  consola.success('Imported from GitHub')

  const [fetchEpochsSuccess, fetchEpochsError, fetchEpochsData] = await fetchMissingEpochs()
  if (!fetchEpochsSuccess || !fetchEpochsData)
    throw createError({ statusCode: 500, statusMessage: fetchEpochsError || 'Unable to fetch missing epochs' })
  consola.success('Fetched missing epochs:', fetchEpochsData)

  const [fetchActiveEpochSuccess, fetchActiveEpochError, fetchActiveEpochData] = await fetchActiveEpoch()
  if (!fetchActiveEpochSuccess || !fetchActiveEpochData)
    throw createError({ statusCode: 500, statusMessage: fetchActiveEpochError })
  const { electedValidators, unelectedValidators } = fetchActiveEpochData
  consola.success(`Fetched active epoch: ${fetchActiveEpochData.epochNumber} with ${electedValidators.length} elected and ${unelectedValidators.length} unelected validators`)

  const [scoresSuccess, errorScores, scores] = await upsertScoresSnapshotEpoch()
  if (!scoresSuccess || !scores)
    throw createError({ statusCode: 500, statusMessage: errorScores || 'Unable to fetch scores' })

  const distributionData = await $fetch('/api/v1/distribution')

  return { fetchEpochsData, fetchActiveEpochData, scores, importData, distributionData }
})
