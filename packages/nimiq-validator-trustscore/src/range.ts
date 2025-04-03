import type { BaseAlbatrossPolicyOptions } from '@nimiq/utils/albatross-policy'
import type { NimiqRPCClient } from 'nimiq-rpc-client-ts'
import type { Range, Result } from './types'
import { BATCHES_PER_EPOCH, BLOCK_SEPARATION_TIME, BLOCKS_PER_EPOCH, electionBlockOf, epochAt } from '@nimiq/utils/albatross-policy'

interface GetRangeOptions extends Pick<BaseAlbatrossPolicyOptions, 'network'> {
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

/**
 * Returns the epoch range (with corresponding block numbers) to consider.
 */
export async function getRange(client: NimiqRPCClient, options: GetRangeOptions = {}): Result<Range> {
  const { network = 'mainnet' } = options
  const durationMs = options?.durationMs || DEFAULT_WINDOW_IN_MS
  const epochsCount = Math.ceil(durationMs / (BLOCK_SEPARATION_TIME * BLOCKS_PER_EPOCH))

  if (options?.toEpochIndex && options.toEpochIndex < 1)
    return [false, `Invalid epoch range. The range should start from epoch 1`, undefined]

  const { data: head, error: headError } = await client.blockchain.getBlockNumber()
  if (headError || head === undefined)
    return [false, headError?.message || 'No block number', undefined]
  const headEpoch = epochAt(head, { network })

  // Only consider fully ended epochs.
  const toEpoch = options?.toEpochIndex ?? headEpoch - 1
  const fromEpoch = Math.max(1, toEpoch - epochsCount + 1)
  const epochCount = toEpoch - fromEpoch + 1

  // Use epoch boundaries: [firstBlockOf(fromEpoch), firstBlockOf(toEpoch+1)-1]
  // Note: The election block mark the end of an epoch, therefore, we need to subtract 1 our epoch
  const fromBlockNumber = electionBlockOf(fromEpoch - 1, { network })!
  const toBlockNumber = electionBlockOf(toEpoch, { network })!

  // Calculate snapshot epoch (balance/network size measurement point)
  const snapshotEpoch = toEpoch + 1

  if (fromBlockNumber < 0 || toBlockNumber < 0 || fromBlockNumber > toBlockNumber)
    return [false, `Invalid epoch range: [${fromBlockNumber}, ${toBlockNumber}]`, undefined]
  if (fromEpoch < 1)
    return [false, `Invalid epoch range: [${fromEpoch}, ${toEpoch}]. The range should start from epoch 1`, undefined]
  if (toBlockNumber >= head)
    return [false, `Invalid epoch range: [${fromBlockNumber}/${fromEpoch}, ${toBlockNumber}/${toEpoch}]. The current head is ${head}/${headEpoch}.`, undefined]

  // Get block data to determine timestamps
  const { data: fromBlock, error: errorFromBlock } = await client.blockchain.getBlockByNumber(fromBlockNumber)
  const { data: toBlock, error: errorToBlock } = await client.blockchain.getBlockByNumber(toBlockNumber)

  if (errorFromBlock)
    return [false, errorFromBlock?.message || 'No block data', undefined]
  if (errorFromBlock || errorToBlock)
    return [false, errorToBlock?.message || 'No block data', undefined]

  const fromTimestamp = fromBlock!.timestamp
  const toTimestamp = toBlock!.timestamp

  const snapshotBlock = toBlockNumber + BLOCKS_PER_EPOCH
  const epochDurationMs = BLOCK_SEPARATION_TIME * BLOCKS_PER_EPOCH - BLOCK_SEPARATION_TIME * BATCHES_PER_EPOCH
  const snapshotTimestamp = toTimestamp + epochDurationMs

  return [true, undefined, {
    head,
    headEpoch,
    fromEpoch,
    fromBlockNumber,
    toEpoch,
    toBlockNumber,
    epochCount,
    fromTimestamp,
    toTimestamp,
    snapshotEpoch,
    snapshotTimestamp,
    snapshotBlock,
    epochDurationMs,
  }]
}
