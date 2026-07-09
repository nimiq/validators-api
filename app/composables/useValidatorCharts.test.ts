import { describe, expect, it } from 'vitest'
import { createEpochFormatter, createPaddedDomain, ensureDrawableLineData } from './useValidatorCharts'

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
})
