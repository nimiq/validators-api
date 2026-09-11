export interface ScoreFreshnessParams {
  toEpoch: number
  latestScoreEpoch: number | null
  allowedLagEpochs?: number
}

export function getScoreLagEpochs({ toEpoch, latestScoreEpoch }: Pick<ScoreFreshnessParams, 'toEpoch' | 'latestScoreEpoch'>): number | null {
  if (latestScoreEpoch === null)
    return null

  return Math.max(0, toEpoch - latestScoreEpoch)
}

export function isScoreLagMissing({ toEpoch, latestScoreEpoch, allowedLagEpochs = 1 }: ScoreFreshnessParams): boolean {
  if (latestScoreEpoch === null)
    return true

  return (toEpoch - latestScoreEpoch) > allowedLagEpochs
}
