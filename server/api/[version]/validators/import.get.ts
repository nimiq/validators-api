/**
 * Import validators from the public/validators folder and sets the icon in case it is missing
 */
export default defineEventHandler(async () => {
  try {
    // First update database with default data, this will populate the icon of unknown validators that didn't have an icon
    const validators = await useDrizzle().select().from(tables.validators).all()
    await Promise.allSettled(validators.map(validator => storeValidator(validator.address, validator, { force: true })))

    // Now, get the custom validators from the public/validators folder
    await importValidatorsFromFiles('./public/validators')
  }
  catch (e) {
    return createError((e as Error))
  }
  return 'Validators imported successfully'
})
