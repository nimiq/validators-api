import { powi } from './utils'

/**
 * The total supply of the cryptocurrency, in LUNA.
 */
export const TOTAL_SUPPLY = 21e14

/**
 * The date of the proof-of-stake fork.
 */
export const PROOF_OF_STAKE_FORK_DATE = new Date('2024-11-19')

/**
 * The total supply of the cryptocurrency at the proof-of-stake fork date, in NIM.
 *
 * Same as:
 * powSupplyAfter(powBlockHeightAt(PROOF_OF_STAKE_FORK_DATE))
 */
export const SUPPLY_AT_PROOF_OF_STAKE_FORK_DATE = 12_893_109_654_06244

/**
 * The total supply of the cryptocurrency in **Testnet** at the proof-of-stake fork date, in NIM.
 *
 * Same as:
 * powSupplyAfter(powBlockHeightAt(PROOF_OF_STAKE_FORK_DATE))
 */
export const SUPPLY_AT_PROOF_OF_STAKE_FORK_DATE_TESTNET = 12_030_755_339_52899

/**
 * The block height of the proof-of-stake fork.
 */
export const PROOF_OF_STAKE_FORK_BLOCK = 3456000

/**
 * The initial supply of the cryptocurrency, in Lunas.
 */
export const PROOF_OF_WORK_INITIAL_SUPPLY = 2520000000e5

/**
 * The speed of the emission curve, in Lunas.
 */
export const PROOF_OF_WORK_EMISSION_SPEED = powi(2, 22)

/**
 * The block number at which the emission tail starts.
 */
export const PROOF_OF_WORK_EMISSION_TAIL_START = 48692960

/**
 * The reward per block in the emission tail.
 */
export const PROOF_OF_WORK_EMISSION_TAIL_REWARD = 4000
