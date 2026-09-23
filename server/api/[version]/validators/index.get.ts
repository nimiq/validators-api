import type { FetchValidatorsOptions } from '~~/server/utils/validators'
import { initRpcClient } from 'nimiq-rpc-client-ts/client'
import { getRange } from '~~/packages/nimiq-validator-trustscore/src/range'
import {
  calculateActivityCoverage,
  getActivityEpochMarkers,
  getRecentEpochRange,
} from '~~/server/utils/activity-epochs'
import { getRpcUrl } from '~~/server/utils/rpc'
import { resolveScoreVersion } from '~~/server/utils/score-api'
import { parseScoreV2Mode } from '~~/server/utils/scores'
import { cachedFetchValidators, fetchValidators } from '~~/server/utils/validators'

export default defineEventHandler(async (event) => {
  const queryParams = await getValidatedQuery(event, mainQuerySchema.parse)

  const rpcUrl = getRpcUrl()
  if (!rpcUrl)
    throw createError('No Albatross RPC Node URL')
  initRpcClient({ url: rpcUrl })
  const runtimeConfig = useSafeRuntimeConfig() as ReturnType<typeof useSafeRuntimeConfig> & {
    scoreV2Mode?: string
  }
  const { nimiqNetwork: network } = runtimeConfig.public

  const [rangeSuccess, errorRange, range] = await getRange({ network })
  if (!rangeSuccess || !range)
    throw createError({ statusCode: 404, statusMessage: errorRange })

  const rolloutMode = parseScoreV2Mode(runtimeConfig.scoreV2Mode)
  const scoreVersion = resolveScoreVersion(queryParams['score-version'], rolloutMode)
  const recentRange = getRecentEpochRange(range)
  const recentMarkers = await getActivityEpochMarkers(recentRange)
  const recentCoverage = calculateActivityCoverage(
    recentRange.fromEpoch,
    recentRange.toEpoch,
    recentMarkers
      .filter(marker => marker.status === 'finalized')
      .map(marker => marker.epochNumber),
  ).coverage
  const resolvedParams: FetchValidatorsOptions = {
    ...queryParams,
    epochNumber: range.toEpoch,
    scoreVersion,
    recentCoverage,
  }
  const fn = queryParams.force ? fetchValidators : cachedFetchValidators
  const [validatorsSuccess, errorValidators, validators] = await fn(event, resolvedParams)
  if (!validatorsSuccess || !validators)
    throw createError({ statusCode: 500, statusMessage: errorValidators || 'Failed to fetch validators' })

  return validators
})
