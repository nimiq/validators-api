import { ValidationUtils } from '@nimiq/utils/validation-utils'
import { z } from 'zod'
import { getRange } from '~~/packages/nimiq-validator-trustscore/src/range'

const paramsSchema = z.object({
  address: z.string(),
})

export default defineEventHandler(async (event) => {
  const { address } = await getValidatedRouterParams(event, paramsSchema.parse)
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
