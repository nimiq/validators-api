import type { Activity } from './drizzle'
import { describe, expect, it } from 'vitest'
import { ValidatorEpochStatus } from '../../packages/nimiq-validator-trustscore/src/epoch-status'
import { buildValidatorActivityTimeline, withValidatorEpochStatus } from './validator-activity-status'

const baseActivity: Activity = {
  validatorId: 1,
  epochNumber: 1,
  likelihood: -1,
  rewarded: -1,
  missed: -1,
  dominanceRatioViaBalance: 0.01,
  dominanceRatioViaSlots: -1,
  balance: 1,
  stakers: 1,
}

describe('validator activity status', () => {
  it('adds randomness status to unelected eligible activity rows', () => {
    expect(withValidatorEpochStatus(baseActivity)).toMatchObject({
      status: ValidatorEpochStatus.NotElectedRandomness,
      missRate: null,
    })
  })

  it('adds failed status to elected rows with missed production', () => {
    expect(withValidatorEpochStatus({
      ...baseActivity,
      likelihood: 20,
      dominanceRatioViaSlots: 0.04,
      rewarded: 0,
      missed: 720,
    })).toMatchObject({
      status: ValidatorEpochStatus.ElectedFailedOrOffline,
      missRate: 1,
    })
  })

  it('does not infer a missing validator row for an unfinalized epoch', () => {
    const activities = [
      {
        ...baseActivity,
        epochNumber: 10,
        likelihood: 33,
        rewarded: 720,
        missed: 0,
        dominanceRatioViaSlots: 0.064,
      },
      {
        ...baseActivity,
        epochNumber: 12,
        likelihood: 33,
        rewarded: 720,
        missed: 0,
        dominanceRatioViaSlots: 0.064,
      },
    ]

    expect(buildValidatorActivityTimeline(
      { fromEpoch: 10, toEpoch: 12 },
      activities,
      new Set([10, 12]),
    ).map(activity => activity.epochNumber)).toEqual([10, 12])
  })
})
