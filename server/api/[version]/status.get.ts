import { BLOCK_SEPARATION_TIME, BLOCKS_PER_EPOCH, electionBlockAfter } from '@nimiq/utils/albatross-policy'
import { getRange } from 'nimiq-validator-trustscore/range'
import { findMissingEpochs } from '~~/server/utils/activities'
import { categorizeValidatorsCurrentEpoch } from '~~/server/utils/validators'

/**
 * This endpoint returns the status of the API:
 *   Range information:
 *   - Range information
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
  const { nimiqNetwork } = useRuntimeConfig().public

  // We get a "window" whose size is determined by the range
  const client = getRpcClient()
  const [rangeSuccess, errorRange, range] = await getRange(client)
  if (!rangeSuccess || !range)
    throw createError(errorRange || 'No range')

  const [validatorsSuccess, error, validatorsEpoch] = await categorizeValidatorsCurrentEpoch()
  if (!validatorsSuccess || !validatorsEpoch)
    throw createError(error || 'No data')

  const { data: headBlockNumber, error: errorHeadBlockNumber } = await client.blockchain.getBlockNumber()
  if (errorHeadBlockNumber || !headBlockNumber)
    throw createError(errorHeadBlockNumber || 'No head block number')
  const nextEpochBlockNumber = electionBlockAfter(headBlockNumber, { testnet: nimiqNetwork === 'test-albatross' })
  const blocksUntilNextEpoch = nextEpochBlockNumber - headBlockNumber
  const expectedTimestampNextEpochStart = new Date(Date.now() + blocksUntilNextEpoch * BLOCK_SEPARATION_TIME * 1000)

  const missingEpochs = await findMissingEpochs(range)

  return {
    range,
    validators: validatorsEpoch,
    missingEpochs,
    blockchain: {
      nimiqNetwork,
      headBlockNumber,
      currentEpoch: validatorsEpoch.epochNumber,
      expectedTimestampNextEpochStart,
      epochDurationMs: BLOCK_SEPARATION_TIME * BLOCKS_PER_EPOCH,
    },
  }
})
