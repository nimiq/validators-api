/**
 * TODO Remove me
 *
 * Once we release `@nimiq/utils@v0.12.3` we can remove this file.
 */

import { BLOCK_SEPARATION_TIME, PROOF_OF_STAKE_MIGRATION_BLOCK, SLOTS } from '@nimiq/utils/albatross-policy'

const BLOCKS_PER_BATCH = 60
const BATCHES_PER_EPOCH = 720
const BLOCKS_PER_EPOCH = BLOCKS_PER_BATCH * BATCHES_PER_EPOCH

export {
  BATCHES_PER_EPOCH,
  BLOCK_SEPARATION_TIME,
  BLOCKS_PER_EPOCH,
  PROOF_OF_STAKE_MIGRATION_BLOCK,
  SLOTS,
}

export function epochAt(blockNumber: number): number {
  if (blockNumber <= PROOF_OF_STAKE_MIGRATION_BLOCK)
    return 0
  const offset = blockNumber - PROOF_OF_STAKE_MIGRATION_BLOCK
  return Math.floor((offset + BLOCKS_PER_EPOCH - 1) / BLOCKS_PER_EPOCH)
}

export function electionBlockOf(epoch: number): number | null {
  if (epoch < 0)
    return null
  return PROOF_OF_STAKE_MIGRATION_BLOCK + (epoch + 1) * BLOCKS_PER_EPOCH - 1
}

export function firstBlockOf(epoch: number): number | undefined {
  if (epoch <= 0)
    return undefined
  return (epoch - 1) * BLOCKS_PER_EPOCH + PROOF_OF_STAKE_MIGRATION_BLOCK + 1
}
