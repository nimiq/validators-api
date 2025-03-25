export default defineNitroPlugin(async () => {
  if (!import.meta.dev)
    return

  hubHooks.hookOnce('database:migrations:done', async () => {
    const { error } = await importValidators('filesystem')
    if (error)
      throw new Error(`Error importing validators: ${error}`)
    await runTask('fetch')
  })
})
