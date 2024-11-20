import { importValidatorsFromFiles } from '../utils/validators'

export default defineNitroPlugin(async () => {
  if (!import.meta.dev)
    return

  hubHooks.hookOnce('database:migrations:done', async () => {
    const { nimiqNetwork } = useRuntimeConfig().public
    await importValidatorsFromFiles(`./public/validators/${nimiqNetwork}/`)
    await runTask('fetch')
  })
})
