import type { NimiqRPCClient } from 'nimiq-rpc-client-ts'
import type { Range, Result } from './types'
import { BLOCK_SEPARATION_TIME, BLOCKS_PER_EPOCH, electionBlockOf, firstBlockOf } from '@nimiq/utils/albatross-policy'

interface GetRangeOptions {
  /**
   * The last epoch number that we will consider. Defaults to the last finished epoch.
   */
  toEpochIndex?: number
  /**
   * The amount of milliseconds we want to consider. Default is 9 months.
   * @default 1000 * 60 * 60 * 24 * 30 * 9
   */
  durationMs?: number
}

export const DEFAULT_WINDOW_IN_DAYS = 30 * 9
export const DEFAULT_WINDOW_IN_MS = DEFAULT_WINDOW_IN_DAYS * 24 * 60 * 60 * 1000
const EPOCHS_PER_DAY = 2
export const DEFAULT_WINDOW_IN_EPOCHS = DEFAULT_WINDOW_IN_DAYS * EPOCHS_PER_DAY

/**
 * Returns the epoch range (with corresponding block numbers) to consider.
 */
export async function getRange(
  client: NimiqRPCClient,
  options?: GetRangeOptions,
): Result<Range> {
  const durationMs = options?.durationMs || DEFAULT_WINDOW_IN_MS
  const epochsCount = Math.ceil(durationMs / (BLOCK_SEPARATION_TIME * BLOCKS_PER_EPOCH))

  const { data: currentEpoch, error: errorCurrentEpoch } = await client.blockchain.getEpochNumber()
  if (errorCurrentEpoch || currentEpoch === undefined)
    return { error: errorCurrentEpoch?.message || 'No current epoch' }

  const toEpoch = options?.toEpochIndex ?? currentEpoch - 1
  const fromEpoch = Math.max(1, toEpoch - epochsCount)

  const fromBlockNumber = firstBlockOf(fromEpoch)!
  const toBlockNumber = electionBlockOf(toEpoch)!
  if (fromBlockNumber === null || toBlockNumber === null) {
    return { error: `Invalid epoch range: fromEpoch ${fromEpoch}, toEpoch ${toEpoch}` }
  }

  if (fromBlockNumber < 0 || toBlockNumber < 0 || fromBlockNumber > toBlockNumber)
    return { error: `Invalid epoch range: [${fromBlockNumber}, ${toBlockNumber}]` }
  if (fromEpoch < 0)
    return { error: `Invalid epoch range: [${fromEpoch}, ${toEpoch}]. The range should start from epoch 0` }

  const { data: head, error: headError } = await client.blockchain.getBlockNumber()
  if (headError || head === undefined)
    return { error: headError?.message || 'No block number' }
  if (toBlockNumber >= head)
    return { error: `Invalid epoch range: [${fromBlockNumber}, ${toBlockNumber}]. The current head is ${head}` }

  const epochCount = toEpoch - fromEpoch + 1

  return {
    data: {
      fromEpoch,
      fromBlockNumber,
      toEpoch,
      toBlockNumber,
      epochCount,
    },
  }
}
