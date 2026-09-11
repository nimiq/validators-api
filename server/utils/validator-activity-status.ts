import type { ValidatorEpochStatusResult } from '../../packages/nimiq-validator-trustscore/src/epoch-status'
import type { Activity } from './drizzle'
import { classifyValidatorEpoch } from '../../packages/nimiq-validator-trustscore/src/epoch-status'

export type ActivityWithStatus = Activity & ValidatorEpochStatusResult

export function withValidatorEpochStatus(activity: Activity): ActivityWithStatus {
  return {
    ...activity,
    ...classifyValidatorEpoch(activity),
  }
}
