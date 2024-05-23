import { ScoreParams, ScoreValues } from './types'
import { defu } from "defu"

export function getSize({ balance, threshold, steepness, totalBalance }: ScoreParams['size']) {
  if (!balance || !threshold || !steepness || !totalBalance) throw new Error("Balance, threshold, steepness, or total balance is not set")
  if (balance < 0 || totalBalance < 0) throw new Error("Balance or total balance is negative")
  const size = balance / totalBalance
  const s = Math.max(0, 1 - Math.pow(size / threshold, steepness))
  return s
}

export function getLiveness({ activeEpochStates, weightFactor }: ScoreParams['liveness']) {
  if (!activeEpochStates || !weightFactor || activeEpochStates.length === 0)
    throw new Error(`Invalid params: ${JSON.stringify({ activeEpochStates, weightFactor })}`)

  let weightedSum = 0
  let weightTotal = 0

  for (const [i, state] of activeEpochStates.entries()) {
    const weight = 1 - (weightFactor * i) / activeEpochStates.length
    weightedSum += weight * state
    weightTotal += weight
  }

  if (weightTotal === 0)
    throw new Error('Weight total is zero, cannot divide by zero');

  const movingAverage = weightedSum / weightTotal;
  const liveness = -Math.pow(movingAverage, 2) + 2 * movingAverage;

  return liveness;
}

// export async function getReliability({ }: ScoreParams['reliability']) {
// TODO
// }
export async function getReliability({ }: any) {
  return Math.random()
}


// The default values for the computeScore function
// Negative values and empty arrays are used to indicate that the user must provide the values or an error will be thrown
const defaultScoreParams: ScoreParams = {
  size: { threshold: 0.25, steepness: 4, balance: -1, totalBalance: -1 },
  liveness: { weightFactor: 0.5, activeEpochStates: [] },
  reliability: {}
}

export function computeScore(params: ScoreParams) {
  const computeScoreParams = defu(params, defaultScoreParams)

  const size = getSize(computeScoreParams.size)
  const liveness = getLiveness(computeScoreParams.liveness)
  const reliability = -1

  const total = size * liveness // * reliability
  const score: ScoreValues = { size, liveness, reliability, total }
  return score
}
