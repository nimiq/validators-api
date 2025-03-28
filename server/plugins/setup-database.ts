import consola from 'consola'

export default defineNitroPlugin(async () => {
  if (!import.meta.dev)
    return

  hubHooks.hookOnce('database:migrations:done', async () => {
    consola.info('Running migrations...')
    const [ok, error, validators] = await importValidators('filesystem')
    if (!ok)
      throw new Error(`Error importing validators: ${error}`)
    consola.success(`${validators.length} validators imported successfully`)
  })
})
