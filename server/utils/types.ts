import type { Range } from '~~/packages/nimiq-validators-trustscore/src'
import type { Score, Validator } from './drizzle'

export type Result<T> = Promise<{ data: T, error: undefined } | { data: undefined, error: string }>

export enum PayoutType {
  Restake = 'restake',
  Direct = 'direct',
  None = 'none',
}

export type ValidatorScore =
  Omit<Validator, 'hasDefaultIcon' | 'accentColor' | 'contact'>
  & Pick<Score, 'availability' | 'dominance' | 'reliability' | 'total'>

export enum HealthFlag {
  MissingEpochs = 'missing-epochs',
  NoValidators = 'no-validators',
  // TODO,
  // ScoreNotComputed = 'score-not-computed',
}

export interface HealthStatus {
  // TODO
  // latestScoreEpoch: number | undefined
  latestFetchedEpoch: number | undefined
  totalValidators: number
  headBlockNumber: number
  currentEpoch: number
  missingEpochs: number[]
  fetchedEpochs: number[]
  range: Range

  isSynced: boolean
  flags: HealthFlag[]
  network: string
}
