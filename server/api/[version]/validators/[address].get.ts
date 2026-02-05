import { ValidationUtils } from '@nimiq/utils/validation-utils'
import { initRpcClient } from 'nimiq-rpc-client-ts/client'
import { z } from 'zod'
import { getRange } from '~~/packages/nimiq-validator-trustscore/src/range'
import { getRpcUrl } from '~~/server/utils/rpc'

const paramsSchema = z.object({
  address: z.string(),
})

export default defineEventHandler(async (event) => {
  const rpcUrl = getRpcUrl()
  if (!rpcUrl)
    throw createError('No Albatross RPC Node URL')
  initRpcClient({ url: rpcUrl })
  const { address } = await getValidatedRouterParams(event, paramsSchema.parse, { decode: true })
  const isValid = ValidationUtils.isValidAddress(address)
  if (!isValid)
    throw createError({ statusCode: 400, statusMessage: 'Invalid address format' })
  const { nimiqNetwork: network } = useRuntimeConfig().public

  const [rangeSuccess, errorRange, range] = await getRange({ network })
  if (!rangeSuccess || !range)
    throw createError({ statusCode: 404, statusMessage: errorRange })

  const [validatorSuccess, errorValidator, validator] = await cachedFetchValidator(event, { address, range })
  if (!validatorSuccess)
    throw createError({ statusCode: 404, statusMessage: errorValidator })

  return { ...validator, range }
})
