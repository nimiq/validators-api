import type { FetchValidatorsOptions } from '~~/server/utils/validators'
import { initRpcClient } from 'nimiq-rpc-client-ts/client'
import { getRange } from '~~/packages/nimiq-validator-trustscore/src/range'
import { getRpcUrl } from '~~/server/utils/rpc'
import { cachedFetchValidators, fetchValidators } from '~~/server/utils/validators'

export default defineEventHandler(async (event) => {
  const queryParams = await getValidatedQuery(event, mainQuerySchema.parse)

  const rpcUrl = getRpcUrl()
  if (!rpcUrl)
    throw createError('No Albatross RPC Node URL')
  initRpcClient({ url: rpcUrl })
  const { nimiqNetwork: network } = useRuntimeConfig().public

  const [rangeSuccess, errorRange, range] = await getRange({ network })
  if (!rangeSuccess || !range)
    throw createError({ statusCode: 404, statusMessage: errorRange })

  const resolvedParams: FetchValidatorsOptions = { epochNumber: range.toEpoch, ...queryParams }
  const fn = queryParams.force ? fetchValidators : cachedFetchValidators
  const [validatorsSuccess, errorValidators, validators] = await fn(event, resolvedParams)
  if (!validatorsSuccess || !validators)
    throw createError({ statusCode: 500, statusMessage: errorValidators || 'Failed to fetch validators' })

  return validators
})
