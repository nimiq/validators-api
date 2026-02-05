import consola from 'consola'

export default defineNitroPlugin(async () => {
  if (!import.meta.dev)
    return

  // Import validators on dev branch
  hubHooks.hookOnce('database:migrations:done', async () => {
    const { nimiqNetwork, gitBranch } = useSafeRuntimeConfig().public
    if (gitBranch !== 'dev')
      return

    const [ok, error, validators] = await importValidators('filesystem', { nimiqNetwork, gitBranch })
    if (!ok)
      throw new Error(`Error importing validators: ${error}`)
    consola.success(`${validators.length} validators imported successfully`)
  })
})
