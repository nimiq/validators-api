import type { Score, Validator } from './drizzle'
import type { Range } from '~~/packages/nimiq-validators-score/src'

export type Result<T> = Promise<{ data: T, error: undefined } | { data: undefined, error: string }>

export type ValidatorScore =
  Pick<Validator, 'id' | 'name' | 'address' | 'fee' | 'payoutType' | 'description' | 'icon' | 'tag' | 'website'>
  & Pick<Score, 'total' | 'liveness' | 'size' | 'reliability'>
  & { range: Range, sizeRatioViaSlots: number }
