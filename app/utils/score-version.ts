export type ScoreVersion = 1 | 2

export function parseScoreVersion(value: unknown): ScoreVersion | undefined {
  if (value === '1')
    return 1
  if (value === '2')
    return 2
}

export function resolveDashboardScoreVersion(
  value: unknown,
  apiDefault: ScoreVersion = 1,
): ScoreVersion {
  return parseScoreVersion(value) ?? apiDefault
}

export function createScoreVersionRequestQuery(value: unknown) {
  const scoreVersion = parseScoreVersion(value)
  return scoreVersion === undefined
    ? {}
    : { 'score-version': scoreVersion }
}

export function mergeScoreVersionQuery<T extends Record<string, unknown>>(
  query: T,
  scoreVersion: ScoreVersion,
) {
  return {
    ...query,
    'score-version': String(scoreVersion),
  }
}
