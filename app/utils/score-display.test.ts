import { describe, expect, it } from 'vitest'
import {
  calculateAverageScore,
  compareScoreValues,
  mapScoreDisplay,
} from './score-display'

describe('score display', () => {
  it('keeps a current zero score distinct from no score', () => {
    expect(mapScoreDisplay({
      total: 0,
      dataStatus: 'current',
      scoreVersion: 2,
    })).toEqual({
      value: 0,
      status: 'current',
      statusLabel: 'Current',
      version: 2,
      versionLabel: 'v2',
    })
  })

  it('maps a missing score to an explicit no-score state', () => {
    expect(mapScoreDisplay({
      total: null,
      dataStatus: 'no_score',
      scoreVersion: 1,
    })).toEqual({
      value: null,
      status: 'no_score',
      statusLabel: 'No score',
      version: 1,
      versionLabel: 'v1',
    })
  })

  it('keeps a stale numeric score and labels it stale', () => {
    expect(mapScoreDisplay({
      total: 0.81,
      dataStatus: 'stale',
      scoreVersion: 2,
    })).toEqual({
      value: 0.81,
      status: 'stale',
      statusLabel: 'Stale',
      version: 2,
      versionLabel: 'v2',
    })
  })

  it('sorts no score below a true zero score', () => {
    expect([0.67, null, 0].sort(compareScoreValues)).toEqual([null, 0, 0.67])
  })

  describe('validators index average', () => {
    it('returns null for N/A when every validator score is missing', () => {
      expect(calculateAverageScore([null, null])).toBeNull()
    })

    it('keeps a true zero score in the average', () => {
      expect(calculateAverageScore([null, 0])).toBe(0)
      expect(calculateAverageScore([null, 0, 0.6])).toBeCloseTo(0.3)
    })
  })
})
