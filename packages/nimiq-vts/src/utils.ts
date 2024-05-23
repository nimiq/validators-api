import { Client, PolicyConstants } from 'nimiq-rpc-client-ts'
import { Range } from './types'

interface GetRangeOptions {
  // The last epoch number that we will consider. Default to the last finished epoch.
  toEpochIndex?: number
  // The amount of milliseconds we want to consider. Default to 9 months.
  durationMs?: number
}

/**
 * Given the amount of milliseconds we want to consider, it returns an object with the epoch range we will consider.
*/
export async function getRange(client: Client, options?: GetRangeOptions): Promise<Range> {
  const { data: policy, error: errorPolicy } = await client.policy.getPolicyConstants()
  if (errorPolicy || !policy) throw new Error(errorPolicy.message || 'No policy constants')

  const { blockSeparationTime, blocksPerEpoch, genesisBlockNumber } = policy as PolicyConstants & { blockSeparationTime: number, genesisBlockNumber: number }
  const durationMs = options?.durationMs || 1000 * 60 * 60 * 24 * 30 * 9
  const epochsCount = Math.ceil(durationMs / (blockSeparationTime * blocksPerEpoch))

  let toEpochIndex = options?.toEpochIndex
  if (!toEpochIndex) {
    const { data: currentEpoch, error: errorCurrentEpoch } = await client.blockchain.getEpochNumber()
    if (errorCurrentEpoch || !currentEpoch) throw new Error(errorCurrentEpoch?.message || 'No current epoch')
    toEpochIndex = currentEpoch - 1
  }
  // Don't go back more than the block after the genesis block
  const fromEpochIndex = Math.max(1, toEpochIndex - epochsCount)

  // Convert indexes to election blocks
  const fromEpoch = genesisBlockNumber + blocksPerEpoch * fromEpochIndex
  const toEpoch = genesisBlockNumber + blocksPerEpoch * toEpochIndex

  // Validate the epoch range
  if (fromEpoch < 0 || toEpoch < 0 || fromEpoch > toEpoch) throw new Error(`Invalid epoch range: [${fromEpoch}, ${toEpoch}]`)
  if (fromEpoch === 0) throw new Error(`Invalid epoch range: [${fromEpoch}, ${toEpoch}]. The range should start from epoch 1`)

  const { data: blockNumber, error: errorBlockNumber } = await client.blockchain.getBlockNumber()
  if (errorBlockNumber || !blockNumber) throw new Error(errorBlockNumber?.message || 'No block number')
  if (toEpoch >= blockNumber) throw new Error(`Invalid epoch range: [${fromEpoch}, ${toEpoch}]. The current head is ${blockNumber}`)

  const range: Range = { fromEpoch, toEpoch, blocksPerEpoch }
  return range
}
