export default defineEventHandler(async (_event) => {
  const validators = await importValidatorsBundled(useSafeRuntimeConfig().public.nimiqNetwork, { shouldStore: true })

  if (!validators[0]) {
    throw createError({
      statusCode: 500,
      message: `Failed to import bundled validators: ${validators[1]}`,
    })
  }

  return validators[2]
})
