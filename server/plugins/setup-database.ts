import consola from 'consola'

export default defineNitroPlugin(async () => {
  if (!import.meta.dev)
    return

  hubHooks.hookOnce('database:migrations:done', async () => {
    consola.info('Running migrations...')
    const { nimiqNetwork, gitBranch } = useRuntimeConfig().public

    // delete all validators wher the Name does not start with 'NQ\d\d'
    await useDrizzle().delete(tables.scores)
    await useDrizzle().delete(tables.activity)
    await useDrizzle().delete(tables.validators)

    const [ok, error, validators] = await importValidators('filesystem', { nimiqNetwork, gitBranch })
    if (!ok)
      throw new Error(`Error importing validators: ${error}`)
    consola.success(`${validators.length} validators imported successfully`)
  })
})
