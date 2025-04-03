import { createConsola } from 'consola'
import { fetchActiveEpoch, fetchMissingEpochs } from '~~/server/utils/activities'

const consola = createConsola({ defaults: { tag: 'sync' } })

export default defineEventHandler(async () => {
  consola.info('Starting syncing...')
  const [importSuccess, errorImport, importData] = await importValidators('github')
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

  return { fetchEpochsData, fetchActiveEpochData, scores, importData }
})
