import type { FetchValidatorsOptions } from '~~/server/utils/validators'
import { getRange } from '~~/packages/nimiq-validator-trustscore/src/range'
import { cachedFetchValidators, fetchValidators } from '~~/server/utils/validators'

export default defineCachedEventHandler(async (event) => {
  const queryParams = await getValidatedQuery(event, mainQuerySchema.parse)
  const { nimiqNetwork: network } = useRuntimeConfig().public

  const client = getRpcClient()
  const [rangeSuccess, errorRange, range] = await getRange(client, { network })
  if (!rangeSuccess || !range)
    throw createError({ statusCode: 404, statusMessage: errorRange })

  const resolvedParams: FetchValidatorsOptions = { epochNumber: range.toEpoch, ...queryParams }
  const fn = queryParams.force ? fetchValidators : cachedFetchValidators
  const [validatorsSuccess, errorValidators, validators] = await fn(event, resolvedParams)
  if (!validatorsSuccess || !validators)
    throw createError({ statusCode: 500, statusMessage: errorValidators || 'Failed to fetch validators' })

  return validators
})
