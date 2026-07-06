interface EpochActivityCompletenessFields {
  likelihood: number
  missed: number
  rewarded: number
}

export function isFinalizedEpochActivity({ likelihood, missed, rewarded }: EpochActivityCompletenessFields) {
  return likelihood !== -1 && missed >= 0 && rewarded >= 0
}
