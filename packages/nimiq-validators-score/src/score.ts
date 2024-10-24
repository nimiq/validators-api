import type { ScoreParams, ScoreValues } from './types'
import { defu } from 'defu'

export function getSize({ threshold, steepness, sizeRatio }: ScoreParams['size']) {
  if (!threshold || !steepness || !sizeRatio)
    throw new Error('Balance, threshold, steepness, or total balance is not set')
  if (sizeRatio < 0 || sizeRatio > 1)
    throw new Error(`Invalid size ratio: ${sizeRatio}`)
  const s = Math.max(0, 1 - (sizeRatio / threshold) ** steepness)
  return s
}

export function getLiveness({ activeEpochStates, weightFactor }: ScoreParams['liveness']) {
  if (!activeEpochStates || !weightFactor || activeEpochStates.length === 0)
    throw new Error(`Invalid liveness params: ${JSON.stringify({ activeEpochStates, weightFactor })}`)

  let weightedSum = 0
  let weightTotal = 0

  for (const [i, state] of activeEpochStates.entries()) {
    const weight = 1 - (weightFactor * i) / activeEpochStates.length
    weightedSum += weight * state
    weightTotal += weight
  }

  if (weightTotal === 0)
    throw new Error('Weight total is zero, cannot divide by zero')

  const movingAverage = weightedSum / weightTotal
  const liveness = -(movingAverage ** 2) + 2 * movingAverage

  return liveness
}

export function getReliability({ inherentsPerEpoch, weightFactor, curveCenter }: ScoreParams['reliability']) {
  if (!inherentsPerEpoch || !weightFactor || !curveCenter)
    throw new Error(`Invalid reliability params: ${JSON.stringify({ inherentsPerEpoch, weightFactor, curveCenter })}`)

  let numerator = 0
  let denominator = 0
  const length = inherentsPerEpoch.size

  for (const [epochIndex, { missed, rewarded }] of Array.from(inherentsPerEpoch.entries())) {
    // console.log(epochIndex, { missed, rewarded }) // TODO Something missed and rewarded are -1, is that correct?
    const totalBlocks = rewarded + missed

    if (totalBlocks <= 0)
      continue

    const r = rewarded / totalBlocks
    const weight = 1 - weightFactor * Number(epochIndex) / length

    numerator += weight * r
    denominator += weight
  }
  const reliability = numerator / denominator

  // Could be the case that the division is NaN, so we return 0 in that case. That means there's no inherents, so no blocks, so not reliable because there's no data
  if (Number.isNaN(reliability))
    return 0

  // Ensure the expression under the square root is non-negative
  const discriminant = -(reliability ** 2) + 2 * curveCenter * reliability + (curveCenter - 1) ** 2
  if (discriminant < 0)
    return 0

  // Plot into the curve
  return -curveCenter + 1 - Math.sqrt(discriminant)
}

// The default values for the computeScore function
// Negative values and empty arrays are used to indicate that the user must provide the values or an error will be thrown
const defaultScoreParams: ScoreParams = {
  size: { threshold: 0.1, steepness: 7.5, sizeRatio: -1 },
  liveness: { weightFactor: 0.5, activeEpochStates: [] },
  reliability: { weightFactor: 0.5, curveCenter: -0.16, inherentsPerEpoch: new Map() },
}

export function computeScore(params: ScoreParams) {
  const computeScoreParams = defu(params, defaultScoreParams)

  const size = getSize(computeScoreParams.size)
  const liveness = getLiveness(computeScoreParams.liveness)
  const reliability = getReliability(computeScoreParams.reliability)

  const total = size * liveness * reliability
  const score: ScoreValues = { size, liveness, reliability, total }
  return score
}
