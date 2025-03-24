import type { MainQuerySchema } from '~~/server/utils/schemas'
import { consola } from 'consola'
import { mainQuerySchema } from '~~/server/utils/schemas'
import { fetchValidators } from '~~/server/utils/validators'

export default defineCachedEventHandler(async (event) => {
  const params = await getValidatedQuery(event, mainQuerySchema.parse)
  const { data: validators, error: errorValidators } = await fetchValidators(params)
  if (errorValidators || !validators) {
    consola.error(`Failed to fetch validators: ${JSON.stringify(errorValidators)}`)
    return createError({ message: 'Failed to fetch validators', status: 500 })
  }
  return validators
}, {
  maxAge: import.meta.dev ? 1 : 60 * 10, // 10 minutes
  getKey(event) {
    const { 'only-known': onlyKnown, 'with-identicons': withIdenticons, force, 'payout-type': payoutType } = getQuery<MainQuerySchema>(event)
    return `validators:${onlyKnown}:${withIdenticons}:${force}:${payoutType}`
  },
})
