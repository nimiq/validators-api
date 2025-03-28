import type { ResultSync, ScoreParams, ScoreValues } from './types'

export function getDominance({ threshold = 0.15, steepness = 7.5, dominanceRatio }: ScoreParams['dominance']): ResultSync<number> {
  if (!threshold || !steepness || !dominanceRatio)
    return [false, `Dominance Ratio, threshold or steepness is not set. ${JSON.stringify({ threshold, steepness, dominanceRatio })}`, undefined]
  if (dominanceRatio < 0 || dominanceRatio > 1)
    return [false, `Invalid dominance ratio: ${dominanceRatio}`, undefined]
  const s = Math.max(0, 1 - (dominanceRatio / threshold) ** steepness)
  return [true, undefined, s]
}

export function getAvailability({ activeEpochStates, weightFactor = 0.5 }: ScoreParams['availability']): ResultSync<number> {
  if (!activeEpochStates || !weightFactor || activeEpochStates.length === 0)
    return [false, `Invalid availability params: ${JSON.stringify({ activeEpochStates, weightFactor })}`, undefined]

  let weightedSum = 0
  let weightTotal = 0

  for (const [i, state] of activeEpochStates.entries()) {
    const weight = 1 - (weightFactor * i) / activeEpochStates.length
    weightedSum += weight * state
    weightTotal += weight
  }

  if (weightTotal === 0)
    return [false, 'Weight total is zero, cannot divide by zero', undefined]

  const movingAverage = weightedSum / weightTotal
  const availability = -(movingAverage ** 2) + 2 * movingAverage

  return [true, undefined, availability]
}

export function getReliability({ inherentsPerEpoch, weightFactor = 0.5, curveCenter = -0.16 }: ScoreParams['reliability']): ResultSync<number> {
  if (!inherentsPerEpoch || !weightFactor || !curveCenter)
    return [false, `Invalid reliability params: ${JSON.stringify({ inherentsPerEpoch, weightFactor, curveCenter })}`, undefined]

  let numerator = 0
  let denominator = 0
  const length = inherentsPerEpoch.size

  for (const [epochIndex, { missed, rewarded }] of Array.from(inherentsPerEpoch.entries())) {
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
    return [true, undefined, -1]

  // Ensure the expression under the square root is non-negative
  const discriminant = -(reliability ** 2) + 2 * curveCenter * reliability + (curveCenter - 1) ** 2
  if (discriminant < 0)
    return [true, undefined, -1]

  // Plot into the curve
  return [true, undefined, -curveCenter + 1 - Math.sqrt(discriminant)]
}

export function computeScore(params: ScoreParams): ResultSync<ScoreValues> {
  const [dominanceSuccess, dominanceError, dominance] = getDominance(params.dominance)
  if (!dominanceSuccess || dominance === undefined)
    return [false, dominanceError, undefined]

  const [availabilitySuccess, availabilityError, availability] = getAvailability(params.availability)
  if (!availabilitySuccess || availability === undefined)
    return [false, availabilityError, undefined]

  const [reliabilitySuccess, reliabilityError, reliability] = getReliability(params.reliability)
  if (!reliabilitySuccess || reliability === undefined)
    return [false, reliabilityError, undefined]

  const total = dominance * availability * reliability
  const score: ScoreValues = { dominance, availability, reliability, total }
  return [true, undefined, score]
}
