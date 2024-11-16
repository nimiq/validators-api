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
export const SUPPLY_AT_PROOF_OF_STAKE_FORK_DATE = 12881041732.58613

/**
 * The block height of the proof-of-stake fork.
 */
export const PROOF_OF_STAKE_FORK_BLOCK = 3456000

/**
 * Adapted `exp_by_squaring_iterative` from
 * https://en.wikipedia.org/w/index.php?title=Exponentiation_by_squaring&amp%3Boldid=1229001691&useskin=vector#With_constant_auxiliary_memory
 *
 * The Rust implementation is also using this algorithm to guarantee the same result on different platforms.
 */
export function powi(x: number, n: number): number {
  if (n < 0) {
    x = 1 / x
    n *= -1
  }
  if (!n)
    return 1
  let y = 1
  while (n > 1) {
    if (n % 2) {
      y *= x
      n -= 1
    }
    x *= x
    n /= 2
  }
  return x * y
}
