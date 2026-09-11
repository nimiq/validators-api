import { initRpcClient } from 'nimiq-rpc-client-ts/client'
import { getBlockNumber } from 'nimiq-rpc-client-ts/http'
import { getRange } from 'nimiq-validator-trustscore/range'
import { getRpcUrl } from '~~/server/utils/rpc'

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

export default defineCachedEventHandler(async () => {
  const rpcUrl = getRpcUrl()
  if (!rpcUrl)
    throw createError('No Albatross RPC Node URL')
  initRpcClient({ url: rpcUrl })

  const { nimiqNetwork: network } = useSafeRuntimeConfig().public

  // We get a "window" whose size is determined by the range
  const [rangeSuccess, errorRange, range] = await getRange({ network })
  if (!rangeSuccess || !range)
    throw createError(errorRange || 'No range')

  const [validatorsSuccess, error, validatorsEpoch] = await categorizeValidatorsSnapshotEpoch()
  if (!validatorsSuccess || !validatorsEpoch)
    throw createError(error || 'No data')

  const [headBlockOk, errorHeadBlockNumber, headBlockNumber] = await getBlockNumber()
  if (!headBlockOk)
    throw createError(errorHeadBlockNumber || 'No head block number')

  const allowedScoreLagEpochs = 1
  const latestScoreEpoch = await getLatestScoreEpoch()
  const scoreLagEpochs = getScoreLagEpochs({
    toEpoch: range.toEpoch,
    latestScoreEpoch,
  })

  const missingEpochs = await findMissingEpochs(range)
  const missingScore = await isScoreMissingWithLag(range, allowedScoreLagEpochs, latestScoreEpoch)

  return {
    range,
    validators: validatorsEpoch,
    missingEpochs,
    missingScore,
    latestScoreEpoch,
    scoreLagEpochs,
    allowedScoreLagEpochs,
    blockchain: { network, headBlockNumber },
  }
})
