import { PROOF_OF_STAKE_FORK_DATE, SUPPLY_AT_PROOF_OF_STAKE_FORK_DATE, SUPPLY_AT_PROOF_OF_STAKE_FORK_DATE_TESTNET, SUPPLY_DECAY, TOTAL_SUPPLY } from 'nimiq-albatross-policy'
import { powi } from './utils'

export interface PosSupplyAtParams {
  /**
   * The network name
   *
   * @default 'main-albatross'
   */
  network?: 'main-albatross' | 'test-albatross'
}

/**
 * Calculate the PoS supply at a given time.
 * @param {number} timestampMs The timestamp at which to calculate the PoS supply.
 * @returns {number} The total supply of the cryptocurrency at the given time, in NIM.
 */
export function posSupplyAt(timestampMs: number, { network = 'main-albatross' }: PosSupplyAtParams = {}): number {
  const ts = timestampMs - PROOF_OF_STAKE_FORK_DATE.getTime()
  if (ts < 0)
    throw new Error(`Invalid timestamp: ${timestampMs}. It must be greater than ${PROOF_OF_STAKE_FORK_DATE.getTime()}.`)

  const genesisSupply = network === 'main-albatross' ? SUPPLY_AT_PROOF_OF_STAKE_FORK_DATE : SUPPLY_AT_PROOF_OF_STAKE_FORK_DATE_TESTNET
  return (TOTAL_SUPPLY - ((TOTAL_SUPPLY - genesisSupply * 1e5) * powi(SUPPLY_DECAY, ts))) / 1e5
}
