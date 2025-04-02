import type { SelectedValidator, UnselectedValidator } from 'nimiq-validator-trustscore/types'
import type { Activity, Score } from './drizzle'

export enum PayoutType {
  Restake = 'restake',
  Direct = 'direct',
  None = 'none',
}

export interface CurrentEpochValidators {
  epochNumber: number
  selectedValidators: (SelectedValidator | UnselectedValidator)[]
  unselectedValidators: (SelectedValidator | UnselectedValidator)[]

  /**
   * Validators that are not tracked by the database. The untracked validators are
   * also part of the `selectedValidators` and `unselectedValidators` arrays, but they are
   * not stored in the database yet.
   */
  untrackedValidators: (SelectedValidator | UnselectedValidator)[]
}

type Nullable<T> = {
  [K in keyof T]: T[K] | null
}
export type FetchedValidator = Omit<Validator, 'logo' | 'contact'> & Pick<Activity, 'balance' | 'stakers'> & {
  logo?: string
  score: Nullable<Pick<Score, 'total' | 'availability' | 'reliability' | 'dominance'>>
  dominanceRatio: number | null
  activeInEpoch: boolean
}
