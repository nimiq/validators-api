import { importValidatorsFromFiles } from '../utils/validators'

export default defineNitroPlugin(async () => {
  if (!import.meta.dev)
    return

  let shouldSyncDatabase = true

  onHubReady(async () => {
    const { nimiqNetwork } = useRuntimeConfig().public

    if (!shouldSyncDatabase)
      return

    // Import validators
    await importValidatorsFromFiles(`./public/validators/${nimiqNetwork}/`)

    // Fetch missing data
    await runTask('fetch')

    shouldSyncDatabase = false
  })
})
