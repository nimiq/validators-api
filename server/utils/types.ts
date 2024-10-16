import type { Activity, Score, Validator } from './drizzle'
import type { Range } from '~~/packages/nimiq-validators-score/src'

export type Result<T> = Promise<{ data: T, error: undefined } | { data: undefined, error: string }>

export type ValidatorScore =
  Pick<Validator, 'id' | 'name' | 'address' | 'fee' | 'isPool' | 'description' | 'icon' | 'isMaintainedByNimiq' | 'website'>
  & Pick<Score, 'total' | 'liveness' | 'size' | 'reliability' | 'reason'>
  & Pick<Activity, 'sizeRatio'>

export enum HealthFlag {
  MissingEpochs = 'missing-epochs',
  NoValidators = 'no-validators',
  // TODO
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
