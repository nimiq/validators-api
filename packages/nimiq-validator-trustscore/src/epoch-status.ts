export enum ValidatorEpochStatus {
  NotElectedRandomness = 'not_elected_randomness',
  ElectedOnline = 'elected_online',
  ElectedDegraded = 'elected_degraded',
  ElectedFailedOrOffline = 'elected_failed_or_offline',
  UnknownPlaceholder = 'unknown_placeholder',
  InactiveByChoiceOrRemoved = 'inactive_by_choice_or_removed',
}

export interface ValidatorEpochStatusInput {
  likelihood: number
  dominanceRatioViaSlots: number
  balance: number
  stakers: number
  rewarded: number
  missed: number
}

export interface ValidatorEpochStatusResult {
  status: ValidatorEpochStatus
  missRate: number | null
}

export interface ValidatorEpochStatusOptions {
  degradedMissRateThreshold?: number
  degradedMissedThreshold?: number
  failedMissRateThreshold?: number
}

export function classifyValidatorEpoch(
  activity: ValidatorEpochStatusInput,
  options: ValidatorEpochStatusOptions = {},
): ValidatorEpochStatusResult {
  const {
    degradedMissRateThreshold = 0.01,
    degradedMissedThreshold = 5,
    failedMissRateThreshold = 0.5,
  } = options
  const elected = activity.likelihood !== -1 || activity.dominanceRatioViaSlots >= 0
  const finalized = activity.rewarded >= 0 && activity.missed >= 0

  if (!elected) {
    const eligible = activity.balance > 0 || activity.stakers > 0
    return {
      status: eligible ? ValidatorEpochStatus.NotElectedRandomness : ValidatorEpochStatus.InactiveByChoiceOrRemoved,
      missRate: null,
    }
  }

  if (!finalized)
    return { status: ValidatorEpochStatus.UnknownPlaceholder, missRate: null }

  const total = activity.rewarded + activity.missed
  const missRate = total > 0 ? activity.missed / total : null

  if (activity.rewarded === 0 || (missRate !== null && missRate >= failedMissRateThreshold))
    return { status: ValidatorEpochStatus.ElectedFailedOrOffline, missRate }

  if (activity.missed > degradedMissedThreshold || (missRate !== null && missRate > degradedMissRateThreshold))
    return { status: ValidatorEpochStatus.ElectedDegraded, missRate }

  return { status: ValidatorEpochStatus.ElectedOnline, missRate }
}
