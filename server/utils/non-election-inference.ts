import { SLOTS } from '@nimiq/utils/albatross-policy'
import { ValidatorEpochStatus } from '../../packages/nimiq-validator-trustscore/src/epoch-status'

export const MAX_RANDOM_NON_ELECTION_PROBABILITY = 0.001
export const MIN_HIGH_STAKE_RATIO = 0.01

export interface ElectionObservation {
  epochNumber: number
  dominanceRatioViaBalance: number
  dominanceRatioViaSlots: number
}

export interface InferredNonElection {
  epochNumber: number
  inferred: true
  randomnessProbability: number
  stakeRatio: number
  status: ValidatorEpochStatus.InferredOffline | ValidatorEpochStatus.NotElectedRandomness
}

interface InferMissingNonElectionsOptions {
  fromEpoch: number
  toEpoch: number
  activities: readonly ElectionObservation[]
  finalizedEpochs?: ReadonlySet<number>
  maxRandomnessProbability?: number
}

function getStakeRatio(activity: ElectionObservation): number | undefined {
  const candidates = [
    activity.dominanceRatioViaBalance,
    activity.dominanceRatioViaSlots,
  ].filter(ratio => Number.isFinite(ratio) && ratio > 0 && ratio <= 1)

  return candidates.at(0)
}

function classifyGap(
  epochNumbers: readonly number[],
  previous: ElectionObservation,
  next: ElectionObservation | undefined,
  maxRandomnessProbability: number,
): InferredNonElection[] {
  const ratios = [getStakeRatio(previous), next ? getStakeRatio(next) : undefined]
    .filter((ratio): ratio is number => ratio !== undefined)
  const stakeRatio = ratios.length > 0 ? Math.min(...ratios) : 0
  const randomnessProbability = stakeRatio > 0
    ? Math.exp(epochNumbers.length * SLOTS * Math.log1p(-stakeRatio))
    : 1
  const status = stakeRatio >= MIN_HIGH_STAKE_RATIO
    && randomnessProbability < maxRandomnessProbability
    ? ValidatorEpochStatus.InferredOffline
    : ValidatorEpochStatus.NotElectedRandomness

  return epochNumbers.map(epochNumber => ({
    epochNumber,
    inferred: true,
    randomnessProbability,
    stakeRatio,
    status,
  }))
}

export function inferMissingNonElections(
  options: InferMissingNonElectionsOptions,
): Map<number, InferredNonElection> {
  const {
    fromEpoch,
    toEpoch,
    activities,
    finalizedEpochs,
    maxRandomnessProbability = MAX_RANDOM_NON_ELECTION_PROBABILITY,
  } = options
  if (!(maxRandomnessProbability > 0 && maxRandomnessProbability < 1))
    throw new Error(`Invalid non-election probability threshold: ${maxRandomnessProbability}`)

  const activityByEpoch = new Map(
    activities
      .filter(activity => activity.epochNumber >= fromEpoch && activity.epochNumber <= toEpoch)
      .map(activity => [activity.epochNumber, activity]),
  )
  const inferred = new Map<number, InferredNonElection>()
  let previous: ElectionObservation | undefined
  let gap: number[] = []

  for (let epochNumber = fromEpoch; epochNumber <= toEpoch; epochNumber++) {
    if (finalizedEpochs && !finalizedEpochs.has(epochNumber)) {
      previous = undefined
      gap = []
      continue
    }

    const activity = activityByEpoch.get(epochNumber)
    if (!activity) {
      if (previous)
        gap.push(epochNumber)
      continue
    }

    if (previous && gap.length > 0) {
      for (const entry of classifyGap(gap, previous, activity, maxRandomnessProbability))
        inferred.set(entry.epochNumber, entry)
    }
    gap = []
    previous = activity
  }

  if (previous && gap.length > 0) {
    for (const entry of classifyGap(gap, previous, undefined, maxRandomnessProbability))
      inferred.set(entry.epochNumber, entry)
  }

  return inferred
}
