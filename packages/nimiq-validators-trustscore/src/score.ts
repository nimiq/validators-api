import type { ScoreParams, ScoreValues } from './types'

export function getDominance({ threshold = 0.15, steepness = 7.5, dominanceRatio }: ScoreParams['dominance']) {
  if (!threshold || !steepness || !dominanceRatio)
    throw new Error(`Dominance Ratio, threshold or steepness is not set. ${JSON.stringify({ threshold, steepness, dominanceRatio })}`)
  if (dominanceRatio < 0 || dominanceRatio > 1)
    throw new Error(`Invalid dominance ratio: ${dominanceRatio}`)
  const s = Math.max(0, 1 - (dominanceRatio / threshold) ** steepness)
  return s
}

export function getAvailability({ activeEpochStates, weightFactor = 0.5 }: ScoreParams['availability']) {
  if (!activeEpochStates || !weightFactor || activeEpochStates.length === 0)
    throw new Error(`Invalid availability params: ${JSON.stringify({ activeEpochStates, weightFactor })}`)

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
  const availability = -(movingAverage ** 2) + 2 * movingAverage

  return availability
}

export function getReliability({ inherentsPerEpoch, weightFactor = 0.5, curveCenter = 0.16 }: ScoreParams['reliability']) {
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
    return -1

  // Ensure the expression under the square root is non-negative
  const discriminant = -(reliability ** 2) + 2 * curveCenter * reliability + (curveCenter - 1) ** 2
  if (discriminant < 0)
    return -1

  // Plot into the curve
  return Math.max(-curveCenter + 1 - Math.sqrt(discriminant), 1)
}

export function computeScore(params: ScoreParams) {
  const dominance = getDominance(params.dominance)
  const availability = getAvailability(params.availability)
  const reliability = getReliability(params.reliability)

  const total = dominance * availability * reliability
  const score: ScoreValues = { dominance, availability, reliability, total }
  return score
}
