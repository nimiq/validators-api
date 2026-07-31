export type ScoreDataStatus = 'current' | 'stale' | 'no_score'

export interface ScoreDisplayInput {
  total: number | null
  dataStatus: ScoreDataStatus
  scoreVersion: 1 | 2
}

export interface ScoreDisplay {
  value: number | null
  status: ScoreDataStatus
  statusLabel: string
  version: 1 | 2
  versionLabel: string
}

export function mapScoreDisplay(score: ScoreDisplayInput): ScoreDisplay {
  const statusLabels: Record<ScoreDataStatus, string> = {
    current: 'Current',
    stale: 'Stale',
    no_score: 'No score',
  }

  return {
    value: score.total,
    status: score.dataStatus,
    statusLabel: statusLabels[score.dataStatus],
    version: score.scoreVersion,
    versionLabel: `v${score.scoreVersion}`,
  }
}

export function compareScoreValues(left: number | null, right: number | null): number {
  if (left === null)
    return right === null ? 0 : -1
  if (right === null)
    return 1
  return left - right
}

export function calculateAverageScore(scores: readonly (number | null)[]): number | null {
  const finiteScores = scores.filter(
    (score): score is number => typeof score === 'number' && Number.isFinite(score),
  )
  if (finiteScores.length === 0)
    return null
  return finiteScores.reduce((total, score) => total + score, 0) / finiteScores.length
}
