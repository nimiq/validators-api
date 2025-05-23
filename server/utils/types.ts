import type { ElectedValidator, UnelectedValidator } from 'nimiq-validator-trustscore/types'
import type { Activity, Score } from './drizzle'

export enum PayoutType {
  Restake = 'restake',
  Direct = 'direct',
  None = 'none',
}

export interface SnapshotEpochValidators {
  epochNumber: number
  electedValidators: (ElectedValidator | UnelectedValidator)[]
  unelectedValidators: (ElectedValidator | UnelectedValidator)[]
  deletedValidators: string[]

  /**
   * Validators that are not tracked by the database. The untracked validators are
   * also part of the `electedValidators` and `unelectedValidators` arrays, but they are
   * not stored in the database yet.
   */
  untrackedValidators: (ElectedValidator | UnelectedValidator)[]
}

type Nullable<T> = {
  [K in keyof T]: T[K] | null
}
export type FetchedValidator = Omit<Validator, 'logo' | 'contact'> & Pick<Activity, 'balance' | 'stakers'> & {
  logo?: string
  score: Nullable<Pick<Score, 'total' | 'availability' | 'reliability' | 'dominance' | 'epochNumber'>>
  dominanceRatio: number | null
}

export interface SyncStream { kind: 'success' | 'data' | 'log' | 'error', message: string, payload?: any }
export type SyncStreamReportFn = (json: SyncStream) => void
