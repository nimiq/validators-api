import { importValidatorsFromFiles } from '../utils/validators'

export default defineNitroPlugin(async () => {
  if (!import.meta.dev)
    return

  onHubReady(async () => {
    const { nimiqNetwork } = useRuntimeConfig().public

    // Import validators
    await importValidatorsFromFiles(`./public/validators/${nimiqNetwork}/`)

    // Fetch missing data
    // await runTask('fetch')
  })
})
