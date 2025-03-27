import consola from 'consola'

export default defineNitroPlugin(async () => {
  if (!import.meta.dev)
    return

  hubHooks.hookOnce('database:migrations:done', async () => {
    consola.info('Running migrations...')
    const { error } = await importValidators('filesystem')
    if (error)
      throw new Error(`Error importing validators: ${error}`)
  })
})
