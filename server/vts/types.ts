export type ComputeScoreConst = {
  liveness: Partial<{ weightFactor: number, fromEpoch: number, toEpoch: number, activeEpochIndexes: number[] }>,
  size: Partial<{ threshold: number, steepness: number, balance: number, totalBalance: number }>,
  reliability?: {}
}
export type ScoreParams = { validatorId: number, params: ComputeScoreConst }
export type ActivityEpoch = { validator: string, assigned: number, missed: number }[]
export type ValidatorEpochs = Record<string, { activeEpochIndexes: number[], validatorId: number }>
export type ScoreValues = Pick<Score, 'liveness' | 'reliability' | 'size' | 'total'>
export type EpochRange = { fromEpoch: number, toEpoch: number, totalEpochs: number }
