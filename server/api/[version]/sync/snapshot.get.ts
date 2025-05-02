import { isDevelopment } from 'std-env'

export default defineEventHandler(async () => {
  const source = isDevelopment ? 'filesystem' : 'github'
  const { nimiqNetwork, gitBranch } = useRuntimeConfig().public
  const [importSuccess, errorImport, importData] = await importValidators(source, { nimiqNetwork, gitBranch })
  if (!importSuccess || !importData)
    throw createError(errorImport || 'Unable to import from GitHub')

  const [fetchActiveEpochSuccess, fetchActiveEpochError, fetchActiveEpochData] = await fetchActiveEpoch()
  if (!fetchActiveEpochSuccess || !fetchActiveEpochData)
    throw createError(fetchActiveEpochError || 'Unable to fetch active epoch')

  const [scoresSuccess, errorScores, scores] = await upsertScoresSnapshotEpoch()
  if (!scoresSuccess || !scores)
    throw createError(errorScores || 'Unable to fetch scores')

  return { success: true, data: { ...fetchActiveEpochData, scores } }
})
