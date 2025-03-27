import type { NimiqRPCClient } from 'nimiq-rpc-client-ts'
import type { Range, Result } from './types'
import { BLOCK_SEPARATION_TIME, BLOCKS_PER_EPOCH, epochAt, firstBlockOf } from '@nimiq/utils/albatross-policy'

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

  /**
   * Wether to use testnet
   * @default false
   */
  testnet?: boolean
}

export const DEFAULT_WINDOW_IN_DAYS = 30 * 9
export const DEFAULT_WINDOW_IN_MS = DEFAULT_WINDOW_IN_DAYS * 24 * 60 * 60 * 1000

/**
 * Returns the epoch range (with corresponding block numbers) to consider.
 */
export async function getRange(client: NimiqRPCClient, options?: GetRangeOptions): Result<Range> {
  const testnet = options?.testnet ?? false
  const durationMs = options?.durationMs || DEFAULT_WINDOW_IN_MS
  const epochsCount = Math.ceil(durationMs / (BLOCK_SEPARATION_TIME * BLOCKS_PER_EPOCH))

  if (options?.toEpochIndex && options.toEpochIndex < 1)
    return { error: `Invalid epoch range. The range should start from epoch 1` }

  const { data: head, error: headError } = await client.blockchain.getBlockNumber()
  if (headError || head === undefined)
    return { error: headError?.message || 'No block number' }
  const currentEpoch = epochAt(head, { testnet })

  // Only consider fully ended epochs.
  const toEpoch = options?.toEpochIndex ?? currentEpoch - 1
  const fromEpoch = Math.max(1, toEpoch - epochsCount + 1)
  const epochCount = toEpoch - fromEpoch + 1

  // Use epoch boundaries: [firstBlockOf(fromEpoch), firstBlockOf(toEpoch+1)-1]
  const fromBlockNumber = firstBlockOf(fromEpoch, { testnet })! - 1
  const toBlockNumber = firstBlockOf(toEpoch - 1, { testnet })! + BLOCKS_PER_EPOCH - 2
  if (fromBlockNumber < 0 || toBlockNumber < 0 || fromBlockNumber > toBlockNumber)
    return { error: `Invalid epoch range: [${fromBlockNumber}, ${toBlockNumber}]` }
  if (fromEpoch < 1)
    return { error: `Invalid epoch range: [${fromEpoch}, ${toEpoch}]. The range should start from epoch 1` }
  if (toBlockNumber >= head)
    return { error: `Invalid epoch range: [${fromBlockNumber}/${fromEpoch}, ${toBlockNumber}/${toEpoch}]. The current head is ${head}/${currentEpoch}.` }

  return {
    data: {
      head,
      currentEpoch,
      fromEpoch,
      fromBlockNumber,
      toEpoch,
      toBlockNumber,
      epochCount,
    },
  }
}
