import type { Range } from 'nimiq-validator-trustscore/types'
import type { SnapshotEpochValidators } from '~~/server/utils/types'
import { consola } from 'consola'
import { initRpcClient } from 'nimiq-rpc-client-ts/client'
import { getBlockNumber } from 'nimiq-rpc-client-ts/http'
import { getRange } from 'nimiq-validator-trustscore/range'
import { getRpcUrl } from '~~/server/utils/rpc'
import { scoreVersionQuerySchema } from '~~/server/utils/schemas'
import { deriveMarkerScoreStatus, resolveScoreVersion } from '~~/server/utils/score-api'

/**
 * This endpoint returns the status of the API:
 *   Range information:
 *   - Range object
 *   - Missing epochs within the range
 *
 *   Validator information:
 *   - The addresses of the active validators in the current epoch
 *   - The addresses of inactive validators
 *   - The addresses of untracked validators (new validators)
 *   - The addresses of active validators with removed profile metadata (`unlistedActiveValidators`)
 *   - The addresses of all validators regardless of their status
 *
 *   Blockchain information:
 *   - Head block number
 *   - Current epoch
 *   - Expected Timestamp for the next epoch
 *   - Duration of epoch
 */

export default defineCachedEventHandler(async (event) => {
  const queryParams = await getValidatedQuery(event, scoreVersionQuerySchema.parse)
  const runtimeConfig = useSafeRuntimeConfig() as ReturnType<typeof useSafeRuntimeConfig> & {
    scoreV2Mode?: string
  }
  const { nimiqNetwork: network } = runtimeConfig.public
  const scoreV2Mode = runtimeConfig.scoreV2Mode ?? 'off'
  if (scoreV2Mode !== 'off' && scoreV2Mode !== 'shadow' && scoreV2Mode !== 'active')
    throw new Error(`Invalid score v2 mode: ${scoreV2Mode}`)
  const activeScoreVersion = resolveScoreVersion(undefined, scoreV2Mode)
  const selectedScoreVersion = resolveScoreVersion(queryParams['score-version'], scoreV2Mode)
  const [markers, latestScore] = await Promise.all([
    getActivityEpochMarkers(),
    getLatestScoreState(selectedScoreVersion),
  ])

  const rpcUrl = getRpcUrl()
  let rpcReady = false
  if (rpcUrl) {
    try {
      initRpcClient({ url: rpcUrl })
      rpcReady = true
    }
    catch (error) {
      consola.warn('Failed to initialize optional status RPC client', error)
      rpcReady = false
    }
  }

  let range: Range | null = null
  let validatorsEpoch: SnapshotEpochValidators | null = null
  let headBlockNumber: number | null = null
  if (rpcReady) {
    try {
      const [rangeSuccess, , liveRange] = await getRange({ network })
      if (rangeSuccess && liveRange)
        range = liveRange
    }
    catch (error) {
      consola.warn('Failed to fetch optional status range', error)
    }

    try {
      const [validatorsSuccess, , liveValidators] = await categorizeValidatorsSnapshotEpoch()
      if (validatorsSuccess && liveValidators)
        validatorsEpoch = liveValidators
    }
    catch (error) {
      consola.warn('Failed to fetch optional validator snapshot', error)
    }

    try {
      const [headBlockOk, , liveHeadBlockNumber] = await getBlockNumber()
      if (headBlockOk && liveHeadBlockNumber !== undefined)
        headBlockNumber = liveHeadBlockNumber
    }
    catch (error) {
      consola.warn('Failed to fetch optional head block', error)
    }
  }

  const markerStatus = deriveMarkerScoreStatus({
    markers,
    recentRange: range ? getRecentEpochRange(range) : null,
    longTermRange: range,
    activeScoreVersion,
    selectedScoreVersion,
    latestScore,
  })

  const allowedScoreLagEpochs = 1
  const scoreLagEpochs = range
    ? getScoreLagEpochs({
        toEpoch: range.toEpoch,
        latestScoreEpoch: latestScore?.epochNumber ?? null,
      })
    : null
  const missingScore = range
    ? await isScoreMissingWithLag(
        range,
        allowedScoreLagEpochs,
        latestScore?.epochNumber ?? null,
      )
    : null

  return {
    range,
    validators: validatorsEpoch,
    ...markerStatus,
    missingScore,
    scoreLagEpochs,
    allowedScoreLagEpochs,
    blockchain: { network, headBlockNumber },
  }
})
