import { powi, PROOF_OF_STAKE_FORK_BLOCK, PROOF_OF_STAKE_FORK_DATE, TOTAL_SUPPLY } from './utils'

const INITIAL_SUPPLY = 2520000000e5
const EMISSION_SPEED = powi(2, 22)
const EMISSION_TAIL_START = 48692960 // PoW block number
const EMISSION_TAIL_REWARD = 4000

function _powBlockRewardAt(currentSupply: number, blockHeight: number): number {
  if (blockHeight <= 0)
    return 0
  const remaining = TOTAL_SUPPLY - currentSupply
  if (blockHeight >= EMISSION_TAIL_START && remaining >= EMISSION_TAIL_REWARD) {
    return EMISSION_TAIL_REWARD
  }
  const remainder = remaining % EMISSION_SPEED
  return (remaining - remainder) / EMISSION_SPEED
}

function _powSupplyAfter(initialSupply: number | undefined, blockHeight: number, startHeight = 0): number {
  let supply = initialSupply || 0
  for (let i = startHeight; i <= blockHeight; ++i) {
    supply += _powBlockRewardAt(supply, i)
  }
  return supply
}

/**
 * Extrapolate PoW block height for a certain date.
 */
export function powBlockHeightAt(date: Date): number {
  return PROOF_OF_STAKE_FORK_BLOCK + ((date.getTime() - PROOF_OF_STAKE_FORK_DATE.getTime()) / (60e3))
}

const supplyCache = new Map<number, number>()
const supplyCacheInterval = 5000 // blocks
let supplyCacheMax = 0 // blocks

/**
 * Calculate the PoW supply at a given time.
 * @returns {number} The total supply of the cryptocurrency at the given time, in NIM.
 */
export function powSupplyAfter(blockHeight: number): number {
  // Calculate last entry in supply cache that is below blockHeight.
  let startHeight = Math.floor(blockHeight / supplyCacheInterval) * supplyCacheInterval
  startHeight = Math.max(0, Math.min(startHeight, supplyCacheMax))

  // Calculate respective block for the last entry of the cache and the targeted height.
  const startI = startHeight / supplyCacheInterval
  const endI = Math.floor(blockHeight / supplyCacheInterval)

  // The starting supply is the initial supply at the beginning and a cached value afterwards.
  let supply = startHeight === 0 ? INITIAL_SUPPLY : supplyCache.get(startHeight)
  // Use and update cache.
  for (let i = startI; i < endI; ++i) {
    startHeight = i * supplyCacheInterval
    // Since the cache stores the supply *before* a certain block, subtract one.
    const endHeight = (i + 1) * supplyCacheInterval - 1
    supply = _powSupplyAfter(supply, endHeight, startHeight)
    // Don't forget to add one again.
    supplyCache.set(endHeight + 1, supply)
    supplyCacheMax = endHeight + 1
  }

  // Calculate remaining supply (this also adds the block reward for endI*interval).
  return _powSupplyAfter(supply, blockHeight, endI * supplyCacheInterval) / 1e5 // Luna >> NIM
}