import type { SelectedValidator, UnselectedValidator } from 'nimiq-validator-trustscore/types'

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

export type FetchedValidator = Omit<Validator, 'logo' | 'contact'> & {
  logo?: string
  score: { total: number | null, availability: number | null, reliability: number | null, dominance: number | null }
  dominanceRatio: number | null
  balance: number
  activeInEpoch: boolean
}
