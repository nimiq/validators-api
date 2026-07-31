import { ValidationUtils } from '@nimiq/utils/validation-utils'
import { initRpcClient } from 'nimiq-rpc-client-ts/client'
import { z } from 'zod'
import { getRange } from '~~/packages/nimiq-validator-trustscore/src/range'
import {
  calculateActivityCoverage,
  getActivityEpochMarkers,
  getRecentEpochRange,
} from '~~/server/utils/activity-epochs'
import { getRpcUrl } from '~~/server/utils/rpc'
import { scoreVersionQuerySchema } from '~~/server/utils/schemas'
import { resolveScoreVersion } from '~~/server/utils/score-api'
import { parseScoreV2Mode } from '~~/server/utils/scores'
import { cachedFetchValidator } from '~~/server/utils/validators'

const paramsSchema = z.object({
  address: z.string(),
})

export default defineEventHandler(async (event) => {
  const queryParams = await getValidatedQuery(event, scoreVersionQuerySchema.parse)
  const rpcUrl = getRpcUrl()
  if (!rpcUrl)
    throw createError('No Albatross RPC Node URL')
  initRpcClient({ url: rpcUrl })
  const { address } = await getValidatedRouterParams(event, paramsSchema.parse, { decode: true })
  const isValid = ValidationUtils.isValidAddress(address)
  if (!isValid)
    throw createError({ statusCode: 400, statusMessage: 'Invalid address format' })
  const runtimeConfig = useSafeRuntimeConfig() as ReturnType<typeof useSafeRuntimeConfig> & {
    scoreV2Mode?: string
  }
  const { nimiqNetwork: network } = runtimeConfig.public

  const [rangeSuccess, errorRange, range] = await getRange({ network })
  if (!rangeSuccess || !range)
    throw createError({ statusCode: 404, statusMessage: errorRange })

  const scoreVersion = resolveScoreVersion(
    queryParams['score-version'],
    parseScoreV2Mode(runtimeConfig.scoreV2Mode),
  )
  const recentRange = getRecentEpochRange(range)
  const recentMarkers = await getActivityEpochMarkers(recentRange)
  const recentCoverage = calculateActivityCoverage(
    recentRange.fromEpoch,
    recentRange.toEpoch,
    recentMarkers
      .filter(marker => marker.status === 'finalized')
      .map(marker => marker.epochNumber),
  ).coverage
  const [validatorSuccess, errorValidator, validator] = await cachedFetchValidator(event, {
    address,
    range,
    scoreVersion,
    recentCoverage,
  })
  if (!validatorSuccess)
    throw createError({ statusCode: 404, statusMessage: errorValidator })

  return { ...validator, range }
})
