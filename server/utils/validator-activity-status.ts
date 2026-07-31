import type { ValidatorEpochStatusResult } from '../../packages/nimiq-validator-trustscore/src/epoch-status'
import type { Range } from '../../packages/nimiq-validator-trustscore/src/types'
import type { Activity } from './drizzle'
import { classifyValidatorEpoch } from '../../packages/nimiq-validator-trustscore/src/epoch-status'
import { inferMissingNonElections } from './non-election-inference'

export type ActivityWithStatus = Activity & ValidatorEpochStatusResult & {
  inferred?: true
  randomnessProbability?: number
  stakeRatio?: number
}

export function withValidatorEpochStatus(activity: Activity): ActivityWithStatus {
  return {
    ...activity,
    ...classifyValidatorEpoch(activity),
  }
}

export function buildValidatorActivityTimeline(
  range: Pick<Range, 'fromEpoch' | 'toEpoch'>,
  activities: readonly Activity[],
  finalizedEpochs?: ReadonlySet<number>,
): ActivityWithStatus[] {
  const inferred = inferMissingNonElections({
    fromEpoch: range.fromEpoch,
    toEpoch: range.toEpoch,
    activities,
    finalizedEpochs,
  })
  const inferredRows: ActivityWithStatus[] = [...inferred.values()].map(epoch => ({
    validatorId: activities[0]!.validatorId,
    epochNumber: epoch.epochNumber,
    likelihood: -1,
    rewarded: -1,
    missed: -1,
    dominanceRatioViaBalance: -1,
    dominanceRatioViaSlots: -1,
    balance: -1,
    stakers: 0,
    status: epoch.status,
    missRate: null,
    inferred: true,
    randomnessProbability: epoch.randomnessProbability,
    stakeRatio: epoch.stakeRatio,
  }))

  return [
    ...activities.map(withValidatorEpochStatus),
    ...inferredRows,
  ].sort((left, right) => left.epochNumber - right.epochNumber)
}
