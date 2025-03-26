import { BLOCK_SEPARATION_TIME, BLOCKS_PER_EPOCH, electionBlockAfter } from '@nimiq/utils/albatross-policy'
import { fetchCurrentEpoch } from 'nimiq-validator-trustscore/fetcher'
import { getRange } from 'nimiq-validator-trustscore/range'
import { getStoredValidatorsAddress } from '~~/server/utils/validators'

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

export default defineEventHandler(async () => {
  const client = getRpcClient()

  const { data: range, error: errorRange } = await getRange(client)
  if (errorRange || !range)
    throw createError(errorRange || 'No range')

  const dbAddresses = await getStoredValidatorsAddress()
  const { data: epoch, error } = await fetchCurrentEpoch(client, dbAddresses)
  if (!epoch || error)
    throw createError(error || 'No data')

  const { data: headBlockNumber, error: errorHeadBlockNumber } = await client.blockchain.getBlockNumber()
  if (errorHeadBlockNumber || !headBlockNumber)
    throw createError(errorHeadBlockNumber || 'No head block number')
  const nextEpochBlockNumber = electionBlockAfter(headBlockNumber)
  const blocksUntilNextEpoch = nextEpochBlockNumber - headBlockNumber
  const expectedTimestamp = new Date(Date.now() + blocksUntilNextEpoch * BLOCK_SEPARATION_TIME * 1000)

  return {
    range,
    validators: epoch.validators,
    blockchain: {
      headBlockNumber,
      currentEpoch: epoch.epochNumber,
      expectedTimestamp,
      duration: BLOCK_SEPARATION_TIME * BLOCKS_PER_EPOCH,
    },
  }
})
