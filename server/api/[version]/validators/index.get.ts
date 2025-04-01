import type { MainQuerySchema } from '~~/server/utils/schemas'
import { getRange } from '~~/packages/nimiq-validator-trustscore/src/range'
import { fetchValidators } from '~~/server/utils/validators'

export default defineCachedEventHandler(async (event) => {
  const queryParams = await getValidatedQuery(event, mainQuerySchema.parse)
  const { nimiqNetwork: network } = useRuntimeConfig().public

  const client = getRpcClient()
  const [rangeSuccess, errorRange, range] = await getRange(client, { network })
  if (!rangeSuccess || !range)
    throw createError({ statusCode: 404, statusMessage: errorRange })

  const [validatorsSuccess, errorValidators, validators] = await fetchValidators({ ...queryParams, epochNumber: range.toEpoch })
  if (!validatorsSuccess || !validators)
    throw createError({ statusCode: 500, statusMessage: errorValidators || 'Failed to fetch validators' })

  return validators
}, {
  maxAge: 10 * 60, // 10 minutes
  getKey(event) {
    const { 'only-known': onlyKnown, 'with-identicons': withIdenticons, force, 'payout-type': payoutType } = getQuery<MainQuerySchema>(event)
    return `validators:${onlyKnown}:${withIdenticons}:${force}:${payoutType}`
  },
})
