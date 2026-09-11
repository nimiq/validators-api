import consola from 'consola'

export default defineNitroPlugin(async () => {
  if (!import.meta.dev)
    return

  const { nimiqNetwork } = useSafeRuntimeConfig().public

  const [ok, error, validators] = await importValidatorsBundled(nimiqNetwork)
  if (!ok) {
    consola.warn(`Skipping validator import: ${error}`)
    return
  }
  consola.success(`${validators.length} validators imported successfully`)
})
