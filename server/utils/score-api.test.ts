import type { ScoreVersion } from './drizzle'
import { describe, expect, it } from 'vitest'
import { mainQuerySchema } from './schemas'
import {
  deriveMarkerScoreStatus,
  resolveScoreVersion,
  selectScoreHistory,
  toScoreApiValue,
} from './score-api'

function score(
  epochNumber: number,
  scoreVersion: ScoreVersion,
  overrides: Record<string, number | string | null> = {},
) {
  return {
    validatorId: 7,
    epochNumber,
    scoreVersion,
    total: 0.9,
    availability: 0.8,
    recentAvailability: scoreVersion === 2 ? 0.75 : null,
    longTermAvailability: scoreVersion === 2 ? 0.85 : null,
    dominance: 0.7,
    reliability: 0.95,
    dataStatus: 'complete' as const,
    longTermCoverage: scoreVersion === 2 ? 0.6 : null,
    longTermAsOfEpoch: scoreVersion === 2 ? epochNumber - 1 : null,
    ...overrides,
  }
}

describe('score API version selection', () => {
  it('parses only score versions 1 and 2', () => {
    expect(mainQuerySchema.parse({ 'score-version': '1' })['score-version']).toBe(1)
    expect(mainQuerySchema.parse({ 'score-version': '2' })['score-version']).toBe(2)
    expect(() => mainQuerySchema.parse({ 'score-version': '3' })).toThrow()
  })

  it('uses v1 by default in off and shadow modes, and v2 in active mode', () => {
    expect(resolveScoreVersion(undefined, 'off')).toBe(1)
    expect(resolveScoreVersion(undefined, 'shadow')).toBe(1)
    expect(resolveScoreVersion(undefined, 'active')).toBe(2)
    expect(resolveScoreVersion(2, 'off')).toBe(2)
    expect(resolveScoreVersion(1, 'active')).toBe(1)
  })
})

describe('score API value mapping', () => {
  it('marks an exact score current and an older selected-version score stale', () => {
    expect(toScoreApiValue(score(20, 2), {
      requestedEpoch: 20,
      scoreVersion: 2,
      recentCoverage: 1,
    })).toMatchObject({
      scoreVersion: 2,
      epochNumber: 20,
      scoreEpoch: 20,
      dataStatus: 'current',
      recentCoverage: 1,
    })

    expect(toScoreApiValue(score(19, 2), {
      requestedEpoch: 20,
      scoreVersion: 2,
      recentCoverage: 0.8,
    })).toMatchObject({
      scoreVersion: 2,
      epochNumber: 19,
      scoreEpoch: 19,
      dataStatus: 'stale',
      recentCoverage: 0.8,
    })
  })

  it('keeps an exact-epoch row stale when its stored data is stale', () => {
    expect(toScoreApiValue(score(20, 2, {
      dataStatus: 'stale',
    }), {
      requestedEpoch: 20,
      scoreVersion: 2,
      recentCoverage: 1,
    })).toMatchObject({
      epochNumber: 20,
      scoreEpoch: 20,
      dataStatus: 'stale',
    })
  })

  it('returns explicit no_score data without coercing missing values to zero', () => {
    expect(toScoreApiValue(null, {
      requestedEpoch: 20,
      scoreVersion: 2,
      recentCoverage: 0.75,
    })).toEqual({
      scoreVersion: 2,
      total: null,
      availability: null,
      recentAvailability: null,
      longTermAvailability: null,
      dominance: null,
      reliability: null,
      epochNumber: null,
      scoreEpoch: null,
      dataStatus: 'no_score',
      recentCoverage: 0.75,
      longTermCoverage: null,
      longTermAsOfEpoch: null,
    })
  })

  it('preserves nullable score components', () => {
    expect(toScoreApiValue(score(20, 2, {
      recentAvailability: null,
      longTermAvailability: null,
      longTermCoverage: null,
      longTermAsOfEpoch: null,
    }), {
      requestedEpoch: 20,
      scoreVersion: 2,
      recentCoverage: 1,
    })).toMatchObject({
      recentAvailability: null,
      longTermAvailability: null,
      longTermCoverage: null,
      longTermAsOfEpoch: null,
    })
  })
})

describe('score API history selection', () => {
  it('keeps one requested version and sorts history by epoch ascending', () => {
    expect(selectScoreHistory([
      score(12, 2),
      score(11, 1),
      score(10, 2),
      score(9, 1),
    ], 2).map(row => [row.epochNumber, row.scoreVersion])).toEqual([
      [10, 2],
      [12, 2],
    ])
  })
})

describe('marker-derived score status', () => {
  const markers = [
    {
      epochNumber: 10,
      status: 'finalized' as const,
      startedAt: '2026-07-29T08:00:00.000Z',
      finalizedAt: '2026-07-29T08:05:00.000Z',
      lastError: null,
    },
    {
      epochNumber: 11,
      status: 'failed' as const,
      startedAt: '2026-07-29T08:00:00.000Z',
      finalizedAt: null,
      lastError: 'RPC unavailable',
    },
    {
      epochNumber: 12,
      status: 'syncing' as const,
      startedAt: '2026-07-29T08:00:00.000Z',
      finalizedAt: null,
      lastError: null,
    },
    {
      epochNumber: 13,
      status: 'finalized' as const,
      startedAt: '2026-07-29T08:00:00.000Z',
      finalizedAt: '2026-07-29T08:05:00.000Z',
      lastError: null,
    },
    {
      epochNumber: 14,
      status: 'finalized' as const,
      startedAt: '2026-07-29T08:00:00.000Z',
      finalizedAt: '2026-07-29T08:05:00.000Z',
      lastError: null,
    },
  ]

  it('reports exact coverage, marker gaps, entries, and selected-version freshness', () => {
    const status = deriveMarkerScoreStatus({
      markers,
      recentRange: { fromEpoch: 12, toEpoch: 14 },
      longTermRange: { fromEpoch: 10, toEpoch: 14 },
      activeScoreVersion: 2,
      selectedScoreVersion: 2,
      latestScore: { epochNumber: 13, dataStatus: 'complete' },
    })

    expect(status).toMatchObject({
      latestCompletedEpoch: 14,
      latestFinalizedEpoch: 14,
      recentCoverage: 2 / 3,
      longTermCoverage: 3 / 5,
      activeScoreVersion: 2,
      selectedScoreVersion: 2,
      latestScoreEpoch: 13,
      scoreStatus: 'stale',
      missingEpochs: [11, 12],
    })
    expect(status.failedEpochs).toEqual([
      expect.objectContaining({ epochNumber: 11, lastError: 'RPC unavailable' }),
    ])
    expect(status.syncingEpochs).toEqual([
      expect.objectContaining({ epochNumber: 12 }),
    ])
  })

  it('reports current and no_score without inventing an epoch', () => {
    const input = {
      markers,
      recentRange: { fromEpoch: 12, toEpoch: 14 },
      longTermRange: { fromEpoch: 10, toEpoch: 14 },
      activeScoreVersion: 2 as const,
      selectedScoreVersion: 2 as const,
    }

    expect(deriveMarkerScoreStatus({
      ...input,
      latestScore: { epochNumber: 14, dataStatus: 'complete' },
    })).toMatchObject({
      latestScoreEpoch: 14,
      scoreStatus: 'current',
    })
    expect(deriveMarkerScoreStatus({ ...input, latestScore: null })).toMatchObject({
      latestScoreEpoch: null,
      scoreStatus: 'no_score',
    })
  })

  it('keeps selected score status stale when an exact-epoch row is persisted stale', () => {
    expect(deriveMarkerScoreStatus({
      markers,
      recentRange: { fromEpoch: 12, toEpoch: 14 },
      longTermRange: { fromEpoch: 10, toEpoch: 14 },
      activeScoreVersion: 2,
      selectedScoreVersion: 2,
      latestScore: { epochNumber: 14, dataStatus: 'stale' },
    })).toMatchObject({
      latestCompletedEpoch: 14,
      latestScoreEpoch: 14,
      scoreStatus: 'stale',
    })
  })

  it('keeps stored marker and score state when live ranges are unavailable', () => {
    expect(deriveMarkerScoreStatus({
      markers,
      recentRange: null,
      longTermRange: null,
      activeScoreVersion: 1,
      selectedScoreVersion: 2,
      latestScore: { epochNumber: 13, dataStatus: 'complete' },
    })).toMatchObject({
      latestCompletedEpoch: 14,
      latestFinalizedEpoch: 14,
      recentCoverage: null,
      longTermCoverage: null,
      activeScoreVersion: 1,
      selectedScoreVersion: 2,
      latestScoreEpoch: 13,
      scoreStatus: 'stale',
      missingEpochs: null,
      failedEpochs: [
        expect.objectContaining({ epochNumber: 11, lastError: 'RPC unavailable' }),
      ],
      syncingEpochs: [
        expect.objectContaining({ epochNumber: 12 }),
      ],
    })
  })
})
