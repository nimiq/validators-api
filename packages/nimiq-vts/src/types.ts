export type ScoreParams = {
  liveness: Partial<({ weightFactor: number, activeEpochBlockNumbers: number[] }) & Range>,
  size: Partial<{ threshold: number, steepness: number, balance: number, totalBalance: number }>,
  reliability?: {}
}
export type ActivityEpoch = { validator: string, assigned: number, missed: number }[]
export type ValidatorActivity = Record<string /* address */, { activeEpochBlockNumbers: number[], validatorId: number, balance: number }>
export type EpochActivity = Record<number /* Election block number */, ActivityEpoch>
export type ScoreValues = { liveness: number, reliability: number, size: number, total: number }
export interface Range {
  // The first block number that we will consider
  fromEpoch: number,
  // The last block number that we will consider
  toEpoch: number,

  blocksPerEpoch: number,
}

