import { posSupplyAt, PROOF_OF_STAKE_FORK_DATE, SUPPLY_AT_PROOF_OF_STAKE_FORK_DATE, SUPPLY_AT_PROOF_OF_STAKE_FORK_DATE_TESTNET } from 'nimiq-supply-calculator'

// = 1 - POS_SUPPLY_DECAY ** (1000 * 60 * 60 * 24)
const DECAY_PER_DAY = 0.0003432600460362

export interface CalculateStakingRewardsParams {
  /**
   * The ratio of the total staked cryptocurrency to the total supply.
   */
  stakedSupplyRatio: number

  /**
   * The initial amount of cryptocurrency staked, in NIM.
   * @default 1
   */
  amount?: number

  /**
   * The number of days the cryptocurrency is staked.
   * @default 365
   */
  days?: number

  /**
   * Indicates whether the staking rewards are restaked (default is true). Restaked mean that each staking reward is added to the pool of staked cryptocurrency for compound interest.
   * @default true
   */
  autoRestake?: boolean

  /**
   * The network name
   *
   * @default 'main-albatross'
   */
  network?: 'main-albatross' | 'test-albatross'

  /**
   * The fee percentage that the pool charges for staking.
   * @default 0
   */
  fee?: number
}

export interface CalculateStakingRewardsResult {
  /**
   * The total amount of cryptocurrency after staking for the specified number of days, in NIM.
   * Considering the decay of rewards and whether the rewards are restaked.
   */
  totalAmount: number

  /**
   * The gain in cryptocurrency after staking for the specified number of days,
   * considering the decay of rewards and whether the rewards are restaked, in NIM.
   */
  gain: number

  /**
   * The gain in percentage after staking for the specified number of days,
   * considering the decay of rewards and whether the rewards are restaked.
   */
  gainRatio: number
}

/**
 * Calculates the potential wealth accumulation based on staking in a cryptocurrency network,
 * considering the effects of reward decay over time. It computes the final amount of cryptocurrency
 * after a specified number of days of staking, taking into account whether the rewards are restaked or not.
 * @param {CalculateStakingRewardsParams} params The parameters for the calculation. @see CalculateStakingRewardsParams
 * @returns {CalculateStakingRewardsResult} The result of the calculation.
 */
export function calculateStakingRewards(params: CalculateStakingRewardsParams): CalculateStakingRewardsResult {
  const { amount = 1e5, days = 365, autoRestake = true, stakedSupplyRatio, network = 'main-albatross', fee = 0 } = params
  const genesisSupply = network === 'main-albatross' ? SUPPLY_AT_PROOF_OF_STAKE_FORK_DATE : SUPPLY_AT_PROOF_OF_STAKE_FORK_DATE_TESTNET

  const initialRewardsPerDay = posSupplyAt(PROOF_OF_STAKE_FORK_DATE.getTime() + 24 * 60 * 60 * 1000) - genesisSupply
  const decayFactor = Math.E ** (-DECAY_PER_DAY * days)

  let gainRatio = 0
  if (autoRestake) {
    const rewardFactor = initialRewardsPerDay / (DECAY_PER_DAY * stakedSupplyRatio * genesisSupply)
    gainRatio = rewardFactor * (1 - decayFactor)
  }
  else {
    gainRatio = (1 / stakedSupplyRatio) * (
      Math.log(
        (DECAY_PER_DAY * genesisSupply * (1 / decayFactor))
        + initialRewardsPerDay * (1 / decayFactor) - initialRewardsPerDay,
      )
      - DECAY_PER_DAY * days
      - Math.log(DECAY_PER_DAY * genesisSupply)
    )
  }
  gainRatio = gainRatio * (1 - fee) / 1e5
  const totalAmount = amount * (1 + gainRatio)
  return { totalAmount, gain: totalAmount - amount, gainRatio }
}
