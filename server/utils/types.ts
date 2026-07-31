import type { ElectedValidator, UnelectedValidator } from 'nimiq-validator-trustscore/types'
import type { Activity, ScoreVersion } from './drizzle'

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
  unlistedActiveValidators: string[]

  /**
   * Validators that are not tracked by the database. The untracked validators are
   * also part of the `electedValidators` and `unelectedValidators` arrays, but they are
   * not stored in the database yet.
   */
  untrackedValidators: (ElectedValidator | UnelectedValidator)[]
}

export interface StoredSnapshotEpochValidators extends SnapshotEpochValidators {
  storageOutcome: 'stored' | 'provisioning'
}

export type FetchedValidator = Omit<Validator, 'logo' | 'contact'> & Pick<Activity, 'balance' | 'stakers'> & {
  logo?: string
  score: ScoreApiValue
  dominanceRatio: number | null
}

export interface ScoreApiValue {
  scoreVersion: ScoreVersion
  total: number | null
  availability: number | null
  recentAvailability: number | null
  longTermAvailability: number | null
  dominance: number | null
  reliability: number | null
  epochNumber: number | null
  scoreEpoch: number | null
  dataStatus: 'current' | 'stale' | 'no_score'
  recentCoverage: number
  longTermCoverage: number | null
  longTermAsOfEpoch: number | null
}

export interface SyncStream { kind: 'success' | 'data' | 'log' | 'error', message: string, payload?: any }
export type SyncStreamReportFn = (json: SyncStream) => void
