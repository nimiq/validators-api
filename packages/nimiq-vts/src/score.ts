import { ScoreParams, ScoreValues } from './types'
import { defu } from "defu"

export function getSize({ balance, threshold, steepness, totalBalance }: ScoreParams['size']) {
  if (!balance || !threshold || !steepness || !totalBalance) throw new Error("Balance, threshold, steepness, or total balance is not set")
  if (balance < 0 || totalBalance < 0) throw new Error("Balance or total balance is negative")
  const size = balance / totalBalance
  const s = Math.max(0, 1 - Math.pow(size / threshold, steepness))
  return s
}

export function getLiveness({ activeEpochBlockNumbers, blocksPerEpoch, fromEpoch, toEpoch, weightFactor }: ScoreParams['liveness']) {
  if (!activeEpochBlockNumbers || !fromEpoch || !toEpoch || !weightFactor || !blocksPerEpoch)
    throw new Error("Active epoch block numbers, from epoch, to epoch, blocks per epoch, or weight factor is not set")
  if (fromEpoch === -1 || toEpoch === -1 || activeEpochBlockNumbers.length === 0)
    throw new Error(`fromEpoch, toEpoch, or activeEpochBlockNumbers is not set: ${fromEpoch}, ${toEpoch}, ${activeEpochBlockNumbers}`)

  const n = toEpoch - fromEpoch + 1; // Total number of epochs in the window
  if (n <= 0) throw new Error('Invalid epoch range');

  let weightedSum = 0;
  let weightTotal = 0;

  for (let i = toEpoch; i >= fromEpoch; i--) {
    const isActive = activeEpochBlockNumbers.includes(i) ? 1 : 0;
    const weight = 1 - weightFactor * (i - fromEpoch) / (toEpoch - fromEpoch);
    weightedSum += weight * isActive;
    weightTotal += weight;
  }
  if (weightTotal === 0) throw new Error('Weight total is zero, cannot divide by zero');

  const movingAverage = weightedSum / weightTotal;
  const liveness = -Math.pow(movingAverage, 2) + 2 * movingAverage;

  return liveness
}

// export async function getReliability({ }: Required<ScoreParams['reliability']>) {
// TODO
// }
export async function getReliability({ }: any) {
  return Math.random()
}


// The default values for the computeScore function
// Negative values and empty arrays are used to indicate that the user must provide the values or an error will be thrown
const defaultScoreParams: ScoreParams = {
  size: { threshold: 0.25, steepness: 4, balance: -1, totalBalance: -1 },
  liveness: { weightFactor: 0.5, fromEpoch: -1, toEpoch: -1, activeEpochBlockNumbers: [] as number[] },
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
