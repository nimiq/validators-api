import type {
  ResultSync,
  ScoreV2Epoch,
  ScoreV2Params,
  ScoreV2Values,
} from './types'
import { ValidatorEpochStatus } from './epoch-status'
import { getDominance } from './score'

interface WeightOptions {
  weightFactor?: number
}

interface ReliabilityOptions extends WeightOptions {
  curveCenter?: number
}

function validateWeightFactor(weightFactor: number): string | undefined {
  if (!Number.isFinite(weightFactor) || weightFactor < 0 || weightFactor > 1)
    return `Invalid weight factor: ${weightFactor}`
}

function validateEpochs(epochs: readonly ScoreV2Epoch[]): string | undefined {
  if (!Array.isArray(epochs) || epochs.length === 0)
    return 'No epochs supplied'

  const epochNumbers = new Set<number>()

  for (const epoch of epochs) {
    if (!Number.isInteger(epoch.epochNumber) || epoch.epochNumber < 0)
      return `Invalid epoch number: ${epoch.epochNumber}`
    if (epochNumbers.has(epoch.epochNumber))
      return `Duplicate epoch number: ${epoch.epochNumber}`
    epochNumbers.add(epoch.epochNumber)

    if (!Number.isFinite(epoch.rewarded) || !Number.isInteger(epoch.rewarded))
      return `Invalid rewarded counter for epoch ${epoch.epochNumber}: ${epoch.rewarded}`
    if (!Number.isFinite(epoch.missed) || !Number.isInteger(epoch.missed))
      return `Invalid missed counter for epoch ${epoch.epochNumber}: ${epoch.missed}`

    switch (epoch.status) {
      case ValidatorEpochStatus.NotElectedRandomness:
        if (epoch.rewarded !== -1 || epoch.missed !== -1)
          return `Invalid random non-election counters for epoch ${epoch.epochNumber}`
        break
      case ValidatorEpochStatus.ElectedOnline:
      case ValidatorEpochStatus.ElectedDegraded:
        if (epoch.rewarded < 0 || epoch.missed < 0 || epoch.rewarded + epoch.missed <= 0)
          return `Invalid elected counters for epoch ${epoch.epochNumber}`
        break
      case ValidatorEpochStatus.ElectedFailedOrOffline:
        if (epoch.rewarded < 0 || epoch.missed < 0)
          return `Invalid availability counters for epoch ${epoch.epochNumber}`
        break
      case ValidatorEpochStatus.InactiveByChoiceOrRemoved:
        if (!(
          (epoch.rewarded === -1 && epoch.missed === -1)
          || (epoch.rewarded === 0 && epoch.missed === 0)
        )) {
          return `Invalid inactive counters for epoch ${epoch.epochNumber}`
        }
        break
      case ValidatorEpochStatus.UnknownPlaceholder:
        return `Unknown activity for epoch ${epoch.epochNumber}`
      default:
        return `Invalid status for epoch ${epoch.epochNumber}: ${String(epoch.status)}`
    }
  }
}

function validateScoreValue(name: string, value: number): ResultSync<number> {
  if (!Number.isFinite(value) || value < 0 || value > 1)
    return [false, `Invalid ${name}: ${value}`, undefined]
  return [true, undefined, value]
}

function newestFirst(epochs: readonly ScoreV2Epoch[]): ScoreV2Epoch[] {
  return [...epochs].sort((a, b) => b.epochNumber - a.epochNumber)
}

export function getRecentAvailabilityV2(
  epochs: readonly ScoreV2Epoch[],
): ResultSync<number> {
  const epochError = validateEpochs(epochs)
  if (epochError)
    return [false, epochError, undefined]

  let available = 0
  let eligible = 0

  for (const epoch of epochs) {
    switch (epoch.status) {
      case ValidatorEpochStatus.NotElectedRandomness:
        break
      case ValidatorEpochStatus.ElectedOnline:
      case ValidatorEpochStatus.ElectedDegraded:
        available++
        eligible++
        break
      case ValidatorEpochStatus.ElectedFailedOrOffline:
      case ValidatorEpochStatus.InactiveByChoiceOrRemoved:
        eligible++
        break
    }
  }

  if (eligible === 0)
    return [false, 'No eligible epochs for recent availability', undefined]

  return validateScoreValue('recent availability', available / eligible)
}

export function getLongTermAvailabilityV2(
  epochs: readonly ScoreV2Epoch[],
  options: WeightOptions = {},
): ResultSync<number> {
  const { weightFactor = 0.5 } = options
  const weightError = validateWeightFactor(weightFactor)
  if (weightError)
    return [false, weightError, undefined]

  const epochError = validateEpochs(epochs)
  if (epochError)
    return [false, epochError, undefined]

  const eligible = newestFirst(epochs).filter(
    epoch => epoch.status !== ValidatorEpochStatus.NotElectedRandomness,
  )
  if (eligible.length === 0)
    return [false, 'No eligible epochs for long-term availability', undefined]

  let weightedSum = 0
  let weightTotal = 0

  for (const [position, epoch] of eligible.entries()) {
    const weight = 1 - weightFactor * position / eligible.length
    const available = epoch.status === ValidatorEpochStatus.ElectedOnline
      || epoch.status === ValidatorEpochStatus.ElectedDegraded
      ? 1
      : 0

    weightedSum += weight * available
    weightTotal += weight
  }

  if (!Number.isFinite(weightTotal) || weightTotal <= 0)
    return [false, `Invalid long-term availability weight total: ${weightTotal}`, undefined]

  const movingAverage = weightedSum / weightTotal
  const availability = -(movingAverage ** 2) + 2 * movingAverage
  return validateScoreValue('long-term availability', availability)
}

export function getReliabilityV2(
  epochs: readonly ScoreV2Epoch[],
  options: ReliabilityOptions = {},
): ResultSync<number> {
  const { weightFactor = 0.5, curveCenter = -0.16 } = options
  const weightError = validateWeightFactor(weightFactor)
  if (weightError)
    return [false, weightError, undefined]
  if (!Number.isFinite(curveCenter) || curveCenter > 0)
    return [false, `Invalid reliability curve center: ${curveCenter}`, undefined]

  const epochError = validateEpochs(epochs)
  if (epochError)
    return [false, epochError, undefined]

  const electedPerformance = newestFirst(epochs).filter(
    epoch => epoch.status === ValidatorEpochStatus.ElectedOnline
      || epoch.status === ValidatorEpochStatus.ElectedDegraded,
  )

  if (electedPerformance.length === 0) {
    const availabilityOwnsPenalty = epochs.some(
      epoch => epoch.status === ValidatorEpochStatus.ElectedFailedOrOffline
        || epoch.status === ValidatorEpochStatus.InactiveByChoiceOrRemoved,
    )
    return availabilityOwnsPenalty
      ? [true, undefined, 1]
      : [false, 'No eligible epochs for reliability', undefined]
  }

  let numerator = 0
  let denominator = 0

  for (const [position, epoch] of electedPerformance.entries()) {
    const weight = 1 - weightFactor * position / electedPerformance.length
    const reliability = epoch.rewarded / (epoch.rewarded + epoch.missed)
    numerator += weight * reliability
    denominator += weight
  }

  if (!Number.isFinite(denominator) || denominator <= 0)
    return [false, `Invalid reliability weight total: ${denominator}`, undefined]

  const reliability = numerator / denominator
  if (reliability === 0 || reliability === 1)
    return [true, undefined, reliability]

  const discriminant = -(reliability ** 2)
    + 2 * curveCenter * reliability
    + (curveCenter - 1) ** 2
  if (!Number.isFinite(discriminant) || discriminant < 0)
    return [false, `Invalid reliability curve discriminant: ${discriminant}`, undefined]

  const curvedReliability = -curveCenter + 1 - Math.sqrt(discriminant)
  return validateScoreValue('reliability', curvedReliability)
}

export function computeScoreV2(params: ScoreV2Params): ResultSync<ScoreV2Values> {
  const [dominanceSuccess, dominanceError, dominance] = getDominance(params.dominance)
  if (!dominanceSuccess)
    return [false, dominanceError, undefined]
  const validDominance = validateScoreValue('dominance', dominance)
  if (!validDominance[0])
    return validDominance

  const [recentSuccess, recentError, recentAvailability] = getRecentAvailabilityV2(params.recentEpochs)
  if (!recentSuccess)
    return [false, recentError, undefined]

  const [longTermSuccess, longTermError, longTermAvailability] = getLongTermAvailabilityV2(
    params.longTermEpochs,
    params.longTermAvailability,
  )
  if (!longTermSuccess)
    return [false, longTermError, undefined]

  const [reliabilitySuccess, reliabilityError, reliability] = getReliabilityV2(
    params.longTermEpochs,
    params.reliability,
  )
  if (!reliabilitySuccess)
    return [false, reliabilityError, undefined]

  const availability = 0.5 * longTermAvailability + 0.5 * recentAvailability
  const validAvailability = validateScoreValue('availability', availability)
  if (!validAvailability[0])
    return validAvailability

  const total = dominance * availability * reliability
  const validTotal = validateScoreValue('total score', total)
  if (!validTotal[0])
    return validTotal

  return [true, undefined, {
    dominance,
    recentAvailability,
    longTermAvailability,
    availability,
    reliability,
    total,
  }]
}
