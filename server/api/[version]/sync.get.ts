import { createConsola } from 'consola'
import { fetchActiveEpoch, fetchMissingEpochs } from '~~/server/utils/activities'

const consola = createConsola({ defaults: { tag: 'sync' } })

export default defineEventHandler(async () => {
  consola.info('Starting syncing...')
  const { data: importData, error: errorImport } = await importValidators('github')
  if (!importData || errorImport)
    throw createError({ statusCode: 500, statusMessage: errorImport || 'Unable to import from GitHub' })

  consola.success('Imported from GitHub')

  const { data: fetchEpochsData, error: fetchEpochsError } = await fetchMissingEpochs()
  if (fetchEpochsError || !fetchEpochsData)
    throw createError({ statusCode: 500, statusMessage: fetchEpochsError || 'Unable to fetch missing epochs' })
  consola.success('Fetched missing epochs:', fetchEpochsData)

  const { data: fetchActiveEpochData, error: fetchActiveEpochError } = await fetchActiveEpoch()
  if (fetchActiveEpochError || !fetchActiveEpochData)
    throw createError({ statusCode: 500, statusMessage: fetchActiveEpochError })
  const { selectedValidators, unselectedValidators } = fetchActiveEpochData
  consola.success(`Fetched active epoch: ${fetchActiveEpochData.epochNumber} with ${selectedValidators.length} selected and ${unselectedValidators.length} unselected validators`)

  const { data: scores, error: errorScores } = await upsertScoresCurrentEpoch()
  if (errorScores || !scores)
    throw createError({ statusCode: 500, statusMessage: errorScores || 'Unable to fetch scores' })

  return { fetchEpochsData, fetchActiveEpochData, scores, importData }
})
