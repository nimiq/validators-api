import { describe, expect, it } from 'vitest'
import { classifyValidatorEpoch, ValidatorEpochStatus } from './epoch-status'

describe('validator epoch status', () => {
  it('classifies unelected eligible validators as randomness', () => {
    expect(classifyValidatorEpoch({
      likelihood: -1,
      dominanceRatioViaSlots: -1,
      balance: 10,
      stakers: 1,
      rewarded: -1,
      missed: -1,
    }).status).toBe(ValidatorEpochStatus.NotElectedRandomness)
  })

  it('classifies elected rows without finalized production as unknown placeholders', () => {
    expect(classifyValidatorEpoch({
      likelihood: 0.04,
      dominanceRatioViaSlots: 0.04,
      balance: 10,
      stakers: 1,
      rewarded: -1,
      missed: -1,
    }).status).toBe(ValidatorEpochStatus.UnknownPlaceholder)
  })

  it('classifies healthy, degraded, and failed elected production', () => {
    expect(classifyValidatorEpoch({
      likelihood: 20,
      dominanceRatioViaSlots: 0.04,
      balance: 10,
      stakers: 1,
      rewarded: 720,
      missed: 1,
    }).status).toBe(ValidatorEpochStatus.ElectedOnline)

    expect(classifyValidatorEpoch({
      likelihood: 20,
      dominanceRatioViaSlots: 0.04,
      balance: 10,
      stakers: 1,
      rewarded: 720,
      missed: 9,
    }).status).toBe(ValidatorEpochStatus.ElectedDegraded)

    expect(classifyValidatorEpoch({
      likelihood: 20,
      dominanceRatioViaSlots: 0.04,
      balance: 10,
      stakers: 1,
      rewarded: 0,
      missed: 720,
    }).status).toBe(ValidatorEpochStatus.ElectedFailedOrOffline)
  })

  it('classifies unelected rows without eligibility evidence as inactive', () => {
    expect(classifyValidatorEpoch({
      likelihood: -1,
      dominanceRatioViaSlots: -1,
      balance: 0,
      stakers: 0,
      rewarded: -1,
      missed: -1,
    }).status).toBe(ValidatorEpochStatus.InactiveByChoiceOrRemoved)
  })
})
