import type { Activity, Score, Validator } from './drizzle'

export enum PayoutType {
  Restake = 'restake',
  Direct = 'direct',
  None = 'none',
}

export type ValidatorScore =
  Omit<Validator, 'hasDefaultLogo' | 'accentColor' | 'contact'>
  & Pick<Score, 'availability' | 'dominance' | 'reliability' | 'total'>
  & Pick<Activity, 'dominanceRatioViaBalance' | 'dominanceRatioViaSlots'>
  & { reason: { missedEpochs: number[], goodSlots: number, badSlots: number, stakedBalance: number } }
