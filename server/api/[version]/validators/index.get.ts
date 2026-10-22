import type { Range } from 'nimiq-validator-trustscore/types'
import type { FetchValidatorsOptions } from '~~/server/utils/validators'
import { BATCHES_PER_EPOCH, BLOCK_SEPARATION_TIME, BLOCKS_PER_EPOCH } from '@nimiq/utils/albatross-policy'
import { consola } from 'consola'
import { initRpcClient } from 'nimiq-rpc-client-ts/client'
import { getRange } from '~~/packages/nimiq-validator-trustscore/src/range'
import {
  calculateActivityCoverage,
  getActivityEpochMarkers,
  getRecentEpochRange,
} from '~~/server/utils/activity-epochs'
import { getRpcUrl } from '~~/server/utils/rpc'
import { resolveScoreVersion } from '~~/server/utils/score-api'
import { getLatestScoreState, parseScoreV2Mode } from '~~/server/utils/scores'
import { cachedFetchValidators, fetchValidators } from '~~/server/utils/validators'

export default defineEventHandler(async (event) => {
  const queryParams = await getValidatedQuery(event, mainQuerySchema.parse)

  const runtimeConfig = useSafeRuntimeConfig() as ReturnType<typeof useSafeRuntimeConfig> & {
    scoreV2Mode?: string
  }
  const { nimiqNetwork: network } = runtimeConfig.public

  const rolloutMode = parseScoreV2Mode(runtimeConfig.scoreV2Mode)
  const scoreVersion = resolveScoreVersion(queryParams['score-version'], rolloutMode)
  let range: Pick<Range, 'fromEpoch' | 'toEpoch' | 'epochDurationMs'> | undefined
  try {
    const rpcUrl = getRpcUrl()
    if (rpcUrl) {
      initRpcClient({ url: rpcUrl })
      const [rangeSuccess, , liveRange] = await getRange({ network })
      if (rangeSuccess)
        range = liveRange
    }
  }
  catch (error) {
    consola.warn('Failed to fetch live validator range', error)
  }

  const hasLiveRange = !!range
  if (!range) {
    const [latestScore, markers] = await Promise.all([
      getLatestScoreState(scoreVersion),
      getActivityEpochMarkers(),
    ])
    const toEpoch = Math.max(latestScore?.epochNumber ?? 0, ...markers.map(marker => marker.epochNumber))
    if (toEpoch < 1)
      throw createError({ statusCode: 503, statusMessage: 'Validator data unavailable' })

    // Stored epochs keep cache keys and database reads usable during RPC outages.
    range = {
      fromEpoch: 1,
      toEpoch,
      epochDurationMs: BLOCK_SEPARATION_TIME * (BLOCKS_PER_EPOCH - BATCHES_PER_EPOCH),
    }
  }

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

  if (hasLiveRange)
    return validators

  return validators.map(validator => ({
    ...validator,
    score: validator.score.dataStatus === 'current'
      ? { ...validator.score, dataStatus: 'stale' as const }
      : validator.score,
  }))
})
