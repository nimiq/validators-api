import type { MainQuerySchema } from '~~/server/utils/schemas'
import { getRange } from '~~/packages/nimiq-validator-trustscore/src/range'
import { mainQuerySchema } from '~~/server/utils/schemas'
import { fetchValidators } from '~~/server/utils/validators'

export default defineCachedEventHandler(async (event) => {
  const queryParams = await getValidatedQuery(event, mainQuerySchema.parse)

  const { data: range, error: errorEpochNumber } = await getRange(getRpcClient())
  if (errorEpochNumber || !range)
    throw createError({ statusCode: 500, message: `JSON.stringify({ error: errorEpochNumber, range })` })

  const params = { epochNumber: range.toEpoch, ...queryParams }
  const { data: validators, error: errorValidators } = await fetchValidators(params)
  if (errorValidators || !validators)
    throw createError({ message: 'Failed to fetch validators', status: 500 })

  return validators
}, {
  maxAge: import.meta.dev ? 1 : 60 * 10, // 10 minutes
  getKey(event) {
    const { 'only-known': onlyKnown, 'with-identicons': withIdenticons, force, 'payout-type': payoutType } = getQuery<MainQuerySchema>(event)
    return `validators:${onlyKnown}:${withIdenticons}:${force}:${payoutType}`
  },
})
