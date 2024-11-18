import { SUPPLY_AT_PROOF_OF_STAKE_FORK_DATE, TOTAL_SUPPLY } from './constants'
import { powi } from './utils'

// Supply decay per millisecond
const SUPPLY_DECAY = 0.9999999999960264

/**
 * Calculate the PoS supply at a given time.
 * @param {number} timestampTs The timestamp at which to calculate the PoS supply.
 * @returns {number} The total supply of the cryptocurrency at the given time, in NIM.
 */
export function posSupplyAt(timestampTs: number): number {
  if (timestampTs < 0) {
    throw new Error('currentTime must be greater or equal to genesisTime')
  }

  return (TOTAL_SUPPLY - ((TOTAL_SUPPLY - SUPPLY_AT_PROOF_OF_STAKE_FORK_DATE * 1e5) * powi(SUPPLY_DECAY, timestampTs))) / 1e5 // Luna >> NIM
}
