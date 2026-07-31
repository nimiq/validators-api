import type { ActivityEpoch, Score, ScoreVersion } from './drizzle'
import type { ScoreApiValue } from './types'

export type ScoreRolloutMode = 'off' | 'shadow' | 'active'
export type ScoreFreshness = ScoreApiValue['dataStatus']

export interface ScoreApiOptions {
  requestedEpoch: number
  scoreVersion: ScoreVersion
  recentCoverage: number
}

export type ScoreApiSource = Pick<
  Score,
  | 'availability'
  | 'dataStatus'
  | 'dominance'
  | 'epochNumber'
  | 'longTermAsOfEpoch'
  | 'longTermAvailability'
  | 'longTermCoverage'
  | 'recentAvailability'
  | 'reliability'
  | 'scoreVersion'
  | 'total'
>

export type MarkerScoreStatusEntry = Pick<
  ActivityEpoch,
  'epochNumber' | 'finalizedAt' | 'lastError' | 'startedAt' | 'status'
>

export interface MarkerScoreStatusInput {
  markers: readonly MarkerScoreStatusEntry[]
  recentRange: {
    fromEpoch: number
    toEpoch: number
  } | null
  longTermRange: {
    fromEpoch: number
    toEpoch: number
  } | null
  activeScoreVersion: ScoreVersion
  selectedScoreVersion: ScoreVersion
  latestScore: Pick<Score, 'epochNumber' | 'dataStatus'> | null
}

export interface MarkerScoreStatus {
  latestCompletedEpoch: number | null
  latestFinalizedEpoch: number | null
  recentCoverage: number | null
  longTermCoverage: number | null
  activeScoreVersion: ScoreVersion
  selectedScoreVersion: ScoreVersion
  latestScoreEpoch: number | null
  scoreStatus: ScoreFreshness
  missingEpochs: number[] | null
  failedEpochs: MarkerScoreStatusEntry[]
  syncingEpochs: MarkerScoreStatusEntry[]
}

export function resolveScoreVersion(
  requestedVersion: ScoreVersion | undefined,
  rolloutMode: ScoreRolloutMode,
): ScoreVersion {
  if (requestedVersion !== undefined)
    return requestedVersion

  switch (rolloutMode) {
    case 'off':
    case 'shadow':
      return 1
    case 'active':
      return 2
    default:
      throw new Error(`Invalid score v2 mode: ${String(rolloutMode)}`)
  }
}

export function toScoreApiValue(
  score: ScoreApiSource | null,
  options: ScoreApiOptions,
): ScoreApiValue {
  if (!score) {
    return {
      scoreVersion: options.scoreVersion,
      total: null,
      availability: null,
      recentAvailability: null,
      longTermAvailability: null,
      dominance: null,
      reliability: null,
      epochNumber: null,
      scoreEpoch: null,
      dataStatus: 'no_score',
      recentCoverage: options.recentCoverage,
      longTermCoverage: null,
      longTermAsOfEpoch: null,
    }
  }

  return {
    scoreVersion: score.scoreVersion,
    total: score.total,
    availability: score.availability,
    recentAvailability: score.recentAvailability,
    longTermAvailability: score.longTermAvailability,
    dominance: score.dominance,
    reliability: score.reliability,
    epochNumber: score.epochNumber,
    scoreEpoch: score.epochNumber,
    dataStatus: score.epochNumber === options.requestedEpoch && score.dataStatus === 'complete'
      ? 'current'
      : 'stale',
    recentCoverage: options.recentCoverage,
    longTermCoverage: score.longTermCoverage,
    longTermAsOfEpoch: score.longTermAsOfEpoch,
  }
}

export function selectScoreHistory<
  T extends Pick<Score, 'epochNumber' | 'scoreVersion'>,
>(scores: readonly T[], scoreVersion: ScoreVersion): T[] {
  return scores
    .filter(score => score.scoreVersion === scoreVersion)
    .sort((a, b) => a.epochNumber - b.epochNumber)
}

export function deriveMarkerScoreStatus(
  input: MarkerScoreStatusInput,
): MarkerScoreStatus {
  const finalizedEpochs = input.markers
    .filter(marker => marker.status === 'finalized')
    .map(marker => marker.epochNumber)
  const finalizedSet = new Set(finalizedEpochs)
  const completedEpochs = input.markers.map(marker => marker.epochNumber)
  const latestCompletedEpoch = completedEpochs.length > 0 ? Math.max(...completedEpochs) : null
  const coverage = (fromEpoch: number, toEpoch: number) => {
    const expectedEpochCount = toEpoch - fromEpoch + 1
    let finalizedEpochCount = 0
    for (let epochNumber = fromEpoch; epochNumber <= toEpoch; epochNumber++) {
      if (finalizedSet.has(epochNumber))
        finalizedEpochCount++
    }
    return expectedEpochCount > 0 ? finalizedEpochCount / expectedEpochCount : 0
  }
  let missingEpochs: number[] | null = null
  if (input.longTermRange) {
    missingEpochs = []
    for (
      let epochNumber = input.longTermRange.fromEpoch;
      epochNumber <= input.longTermRange.toEpoch;
      epochNumber++
    ) {
      if (!finalizedSet.has(epochNumber))
        missingEpochs.push(epochNumber)
    }
  }

  return {
    latestCompletedEpoch,
    latestFinalizedEpoch: finalizedEpochs.length > 0 ? Math.max(...finalizedEpochs) : null,
    recentCoverage: input.recentRange
      ? coverage(input.recentRange.fromEpoch, input.recentRange.toEpoch)
      : null,
    longTermCoverage: input.longTermRange
      ? coverage(input.longTermRange.fromEpoch, input.longTermRange.toEpoch)
      : null,
    activeScoreVersion: input.activeScoreVersion,
    selectedScoreVersion: input.selectedScoreVersion,
    latestScoreEpoch: input.latestScore?.epochNumber ?? null,
    scoreStatus: input.latestScore === null
      ? 'no_score'
      : latestCompletedEpoch !== null
        && input.latestScore.epochNumber === latestCompletedEpoch
        && input.latestScore.dataStatus === 'complete'
        ? 'current'
        : 'stale',
    missingEpochs,
    failedEpochs: input.markers.filter(marker => marker.status === 'failed'),
    syncingEpochs: input.markers.filter(marker => marker.status === 'syncing'),
  }
}
