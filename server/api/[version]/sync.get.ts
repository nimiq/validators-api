import { fetchActiveEpoch, fetchMissingEpochs } from '~~/server/utils/activities'

export default defineEventHandler(async () => {
  const { data: importData, error: errorImport } = await importValidators('github')
  if (!importData || errorImport)
    throw createError({ statusCode: 500, statusMessage: errorImport || 'Unable to import from GitHub' })

  const { data: fetchEpochsData, error: fetchEpochsError } = await fetchMissingEpochs()
  if (fetchEpochsError || !fetchEpochsData)
    throw createError({ statusCode: 500, statusMessage: fetchEpochsError || 'Unable to fetch missing epochs' })

  const { data: fetchActiveEpochData, error: fetchActiveEpochError } = await fetchActiveEpoch()
  if (fetchActiveEpochError || !fetchActiveEpochData)
    throw createError({ statusCode: 500, statusMessage: fetchActiveEpochError })

  const scores = await upsertScoresCurrentEpoch()

  return { fetchEpochsData, fetchActiveEpochData, scores, importData }
})
