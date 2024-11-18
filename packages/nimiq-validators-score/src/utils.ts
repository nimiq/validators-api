import type { NimiqRPCClient, PolicyConstants } from 'nimiq-rpc-client-ts'
import type { Range } from './types'

interface GetRangeOptions {
  /**
   * The last epoch number that we will consider. Default to the last finished epoch.
   */
  toEpochIndex?: number
  /**
   * The amount of milliseconds we want to consider. Default to 9 months.
   * @default 1000 * 60 * 60 * 24 * 30 * 9 (9 months)
   */
  durationMs?: number
}

export const DEFAULT_WINDOW_IN_DAYS = 30 * 9
export const DEFAULT_WINDOW_IN_MS = DEFAULT_WINDOW_IN_DAYS * 24 * 60 * 60 * 1000
const EPOCHS_PER_DAY = 2
export const DEFAULT_WINDOW_IN_EPOCHS = DEFAULT_WINDOW_IN_DAYS * EPOCHS_PER_DAY

/**
 * Given the amount of milliseconds we want to consider, it returns an object with the epoch range we will consider.
 */
export async function getRange(client: NimiqRPCClient, options?: GetRangeOptions): Promise<Range> {
  const { blockSeparationTime, blocksPerEpoch, genesisBlockNumber } = await getPolicyConstants(client)
  const durationMs = options?.durationMs || DEFAULT_WINDOW_IN_MS
  const epochsCount = Math.ceil(durationMs / (blockSeparationTime * blocksPerEpoch))

  const { data: currentEpoch, error: errorCurrentEpoch } = await client.blockchain.getEpochNumber()
  if (errorCurrentEpoch || !currentEpoch)
    throw new Error(errorCurrentEpoch?.message || 'No current epoch')

  const toEpoch = options?.toEpochIndex ?? currentEpoch - 1
  const fromEpoch = Math.max(1, toEpoch - epochsCount)

  const fromBlockNumber = genesisBlockNumber + blocksPerEpoch * (fromEpoch - 1)
  const toBlockNumber = genesisBlockNumber + blocksPerEpoch * toEpoch

  if (fromBlockNumber < 0 || toBlockNumber < 0 || fromBlockNumber > toBlockNumber)
    throw new Error(`Invalid epoch range: [${fromBlockNumber}, ${toBlockNumber}]`)
  if (fromEpoch < 0)
    throw new Error(`Invalid epoch range: [${fromEpoch}, ${toEpoch}]. The range should start from epoch 0`)

  const { data: head, error: headError } = await client.blockchain.getBlockNumber()
  if (headError || !head)
    throw new Error(headError?.message || 'No block number')
  if (toBlockNumber >= head)
    throw new Error(`Invalid epoch range: [${fromBlockNumber}, ${toBlockNumber}]. The current head is ${head}`)

  const blockNumberToEpochIndex = (blockNumber: number) =>
    Math.floor((blockNumber - genesisBlockNumber) / blocksPerEpoch)
  const epochIndexToBlockNumber = (epochIndex: number) =>
    genesisBlockNumber + epochIndex * blocksPerEpoch
  const epochCount = toEpoch - fromEpoch + 1

  return { fromEpoch, fromBlockNumber, toEpoch, toBlockNumber, blocksPerEpoch, blockNumberToEpochIndex, epochCount, epochIndexToBlockNumber }
}

export type PolicyConstantsPatch = PolicyConstants & { blockSeparationTime: number, genesisBlockNumber: number }
let policy: PolicyConstantsPatch
export async function getPolicyConstants(client: NimiqRPCClient) {
  if (!policy) {
    const { data: _policy, error: errorPolicy } = await client.policy.getPolicyConstants()
    if (errorPolicy || !_policy)
      throw new Error(`Error getting policy constants: ${errorPolicy?.message}` || 'No policy constants')
    policy = _policy as PolicyConstants & { blockSeparationTime: number, genesisBlockNumber: number }
  }
  return policy
}
