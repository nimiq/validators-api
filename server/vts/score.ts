import { ComputeScoreConst, ScoreValues } from './types'
import { defu } from "defu"

export function getSize({ balance, threshold, steepness, totalBalance }: Required<ComputeScoreConst['size']>) {
  if (balance < 0 || totalBalance < 0) throw new Error("Balance or total balance is negative")
  const size = balance / totalBalance
  const s = Math.max(0, 1 - Math.pow(size / threshold, steepness))
  return s
}

export function getLiveness({ activeEpochIndexes, fromEpoch, toEpoch, weightFactor }: Required<ComputeScoreConst['liveness']>) {
  if (fromEpoch === -1 || toEpoch === -1 || activeEpochIndexes.length === 0)
    throw new Error(`fromEpoch, toEpoch, or activeEpochIndexes is not set: ${fromEpoch}, ${toEpoch}, ${activeEpochIndexes}`)

  const n = toEpoch - fromEpoch + 1; // Total number of epochs in the window
  if (n <= 0) throw new Error('Invalid epoch range');

  let weightedSum = 0;
  let weightTotal = 0;

  for (let i = 0; i < n; i++) {
    const epochIndex = fromEpoch + i;
    const isActive = activeEpochIndexes.includes(epochIndex) ? 1 : 0;
    const weight = 1 - weightFactor * (i / (n - 1));
    weightedSum += weight * isActive;
    weightTotal += weight;
  }

  if (weightTotal === 0) throw new Error('Weight total is zero, cannot divide by zero');


  const movingAverage = weightedSum / weightTotal;
  const liveness = -Math.pow(movingAverage, 2) + 2 * movingAverage;

  return liveness
}

// export async function getReliability({ }: Required<ComputeScoreConst['reliability']>) {
// TODO
// }
export async function getReliability({ }: any) {
  return Math.random()
}


// The default values for the computeScore function
// Negative values and empty arrays are used to indicate that the user must provide the values or an error will be thrown
const defaultComputeScoreConst: ComputeScoreConst = {
  size: { threshold: 0.25, steepness: 4, balance: -1, totalBalance: -1 },
  liveness: { weightFactor: 0.5, fromEpoch: -1, toEpoch: -1, activeEpochIndexes: [] as number[] },
  reliability: {}
}

export function computeScore(params: ComputeScoreConst) {
  const computeScoreParams = defu(params, defaultComputeScoreConst)

  const size = getSize(computeScoreParams.size)
  const liveness = getLiveness(computeScoreParams.liveness)
  const reliability = -1

  const total = size * liveness // * reliability
  const score: ScoreValues = { size, liveness, reliability, total }
  return score
}
