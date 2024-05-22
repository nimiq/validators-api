export type Result<T> = { data: T, error: undefined } | { data: undefined, error: string }
export type AsyncResult<T> = Promise<Result<T>>

export type Option<T> = T | undefined
export type AsyncOption<T> = Promise<Option<T>>

export type ActivityEpoch = { validator: string, assigned: number, missed: number }[]
export type ValidatorEpochs = Record<string, { activeEpochIndexes: number[], validatorId: number }>
export type ScoreValues = Pick<Score, 'liveness' | 'reliability' | 'size' | 'total'>

export type EpochRange = { fromEpoch: number, toEpoch: number, totalEpochs: number }
