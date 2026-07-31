import { describe, expect, it } from 'vitest'
import {
  createEpochFormatter,
  createPaddedDomain,
  ensureDrawableLineData,
  prepareActivityHistory,
  prepareScoreHistory,
} from './useValidatorCharts'

describe('validator chart helpers', () => {
  it('formats chart x ticks from the data epoch instead of the raw index', () => {
    const formatEpoch = createEpochFormatter([{ epoch: 1203 }, { epoch: 1204 }])

    expect(formatEpoch(0)).toBe('E1203')
    expect(formatEpoch(1)).toBe('E1204')
    expect(formatEpoch(0.5)).toBe('')
  })

  it('duplicates a single score point so line charts render a visible segment', () => {
    expect(ensureDrawableLineData([{ epoch: 1209, total: 0.98 }])).toEqual([
      { epoch: 1209, total: 0.98 },
      { epoch: 1209, total: 0.98 },
    ])
  })

  it('pads a flat numeric domain so the chart line has drawable height', () => {
    expect(createPaddedDomain([
      { balance: 388_367_850 },
      { balance: 388_367_850 },
    ], 'balance')).toEqual([386_426_010.75, 390_309_689.25])
  })

  it('filters score history to the selected version and sorts epochs ascending', () => {
    const scores = [
      { epochNumber: 14, scoreVersion: 2 as const, total: 0.8 },
      { epochNumber: 12, scoreVersion: 1 as const, total: 0.7 },
      { epochNumber: 13, scoreVersion: 2 as const, total: 0.75 },
    ]

    expect(prepareScoreHistory(scores, 2, ['total']))
      .toEqual([scores[2], scores[0]])
  })

  it('preserves true zero scores and excludes null or non-finite totals', () => {
    const scores = [
      { epochNumber: 15, scoreVersion: 2 as const, total: null },
      { epochNumber: 16, scoreVersion: 2 as const, total: 0 },
      { epochNumber: 17, scoreVersion: 2 as const, total: Number.NaN },
    ]

    expect(prepareScoreHistory(scores, 2, ['total']))
      .toEqual([scores[1]])
  })

  it('excludes rows missing a component required by a multi-series chart', () => {
    const scores = [
      {
        epochNumber: 18,
        scoreVersion: 2 as const,
        total: 0.8,
        availability: null,
        dominance: 0.9,
        reliability: 0.95,
      },
      {
        epochNumber: 19,
        scoreVersion: 2 as const,
        total: 0,
        availability: 0,
        dominance: 0.9,
        reliability: 0.95,
      },
    ]

    expect(prepareScoreHistory(
      scores,
      2,
      ['total', 'availability', 'dominance', 'reliability'],
    )).toEqual([scores[1]])
  })

  it('sorts activity history ascending and excludes rows missing chart fields', () => {
    const activity = [
      { epochNumber: 1249, balance: 30, stakers: 3, rewarded: 8, missed: 1 },
      { epochNumber: 1246, balance: 0, stakers: 0, rewarded: 0, missed: 0 },
      { epochNumber: 1247, balance: 10, stakers: 1, rewarded: 6, missed: 0 },
      { epochNumber: 1248, balance: 20, stakers: 2, rewarded: 7, missed: 1 },
      { epochNumber: 1250, balance: Number.NaN, stakers: 4, rewarded: 9, missed: 0 },
      { epochNumber: 1251, balance: -1, stakers: 5, rewarded: 10, missed: 0 },
      { epochNumber: 1252, balance: 40, stakers: -1, rewarded: 11, missed: 0 },
      { epochNumber: 1253, balance: 50, stakers: 6, rewarded: -1, missed: 0 },
      { epochNumber: 1254, balance: 60, stakers: 7, rewarded: 12, missed: -1 },
    ]

    expect(prepareActivityHistory(activity, ['balance']).map(row => row.epochNumber))
      .toEqual([1246, 1247, 1248, 1249, 1252, 1253, 1254])
    expect(prepareActivityHistory(activity, ['stakers']).map(row => row.epochNumber))
      .toEqual([1246, 1247, 1248, 1249, 1250, 1251, 1253, 1254])
    expect(prepareActivityHistory(activity, ['rewarded', 'missed']).map(row => row.epochNumber))
      .toEqual([1246, 1247, 1248, 1249, 1250, 1251, 1252])
  })
})
