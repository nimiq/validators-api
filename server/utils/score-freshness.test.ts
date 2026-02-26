import { describe, expect, it } from 'vitest'
import { getScoreLagEpochs, isScoreLagMissing } from './score-freshness'

describe('score freshness', () => {
  it('considers score synced when latest score epoch equals current toEpoch', () => {
    expect(getScoreLagEpochs({ toEpoch: 100, latestScoreEpoch: 100 })).toBe(0)
    expect(isScoreLagMissing({ toEpoch: 100, latestScoreEpoch: 100, allowedLagEpochs: 1 })).toBe(false)
  })

  it('considers score synced when lag is exactly one epoch', () => {
    expect(getScoreLagEpochs({ toEpoch: 100, latestScoreEpoch: 99 })).toBe(1)
    expect(isScoreLagMissing({ toEpoch: 100, latestScoreEpoch: 99, allowedLagEpochs: 1 })).toBe(false)
  })

  it('considers score missing when lag is two epochs', () => {
    expect(getScoreLagEpochs({ toEpoch: 100, latestScoreEpoch: 98 })).toBe(2)
    expect(isScoreLagMissing({ toEpoch: 100, latestScoreEpoch: 98, allowedLagEpochs: 1 })).toBe(true)
  })

  it('considers score missing when no score exists', () => {
    expect(getScoreLagEpochs({ toEpoch: 100, latestScoreEpoch: null })).toBeNull()
    expect(isScoreLagMissing({ toEpoch: 100, latestScoreEpoch: null, allowedLagEpochs: 1 })).toBe(true)
  })
})
