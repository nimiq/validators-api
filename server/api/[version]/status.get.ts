import { getBlockNumber } from 'nimiq-rpc-client-ts/http'
import { getRange } from 'nimiq-validator-trustscore/range'

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
 *   - The addresses of all validators regardless of their status
 *
 *   Blockchain information:
 *   - Head block number
 *   - Current epoch
 *   - Expected Timestamp for the next epoch
 *   - Duration of epoch
 */

export default defineCachedEventHandler(async () => {
  const { nimiqNetwork: network } = useRuntimeConfig().public

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

  const missingEpochs = await findMissingEpochs(range)
  const missingScore = await isMissingScore(range)

  return {
    range,
    validators: validatorsEpoch,
    missingEpochs,
    missingScore,
    blockchain: { network, headBlockNumber },
  }
})
