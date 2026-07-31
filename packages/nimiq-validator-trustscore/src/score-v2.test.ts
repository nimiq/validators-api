import { describe, expect, it } from 'vitest'
import { ValidatorEpochStatus } from './epoch-status'
import {
  computeScoreV2,
  getLongTermAvailabilityV2,
  getRecentAvailabilityV2,
  getReliabilityV2,
} from './score-v2'

function epoch(
  epochNumber: number,
  status: ValidatorEpochStatus,
  rewarded = 720,
  missed = 0,
) {
  return { epochNumber, status, rewarded, missed }
}

describe('score v2 recent availability', () => {
  it('maps the 14 server-supplied completed epochs, excluding random non-election', () => {
    const epochs = [
      epoch(14, ValidatorEpochStatus.ElectedOnline),
      epoch(13, ValidatorEpochStatus.ElectedDegraded, 711, 9),
      epoch(12, ValidatorEpochStatus.ElectedFailedOrOffline, 0, 720),
      epoch(11, ValidatorEpochStatus.InactiveByChoiceOrRemoved, 0, 0),
      epoch(10, ValidatorEpochStatus.NotElectedRandomness, -1, -1),
      epoch(9, ValidatorEpochStatus.ElectedOnline),
      epoch(8, ValidatorEpochStatus.ElectedDegraded, 711, 9),
      epoch(7, ValidatorEpochStatus.ElectedFailedOrOffline, 0, 720),
      epoch(6, ValidatorEpochStatus.InactiveByChoiceOrRemoved, 0, 0),
      epoch(5, ValidatorEpochStatus.ElectedOnline),
      epoch(4, ValidatorEpochStatus.ElectedOnline),
      epoch(3, ValidatorEpochStatus.ElectedOnline),
      epoch(2, ValidatorEpochStatus.ElectedOnline),
      epoch(1, ValidatorEpochStatus.ElectedOnline),
    ]

    expect(getRecentAvailabilityV2(epochs)).toEqual([true, undefined, 0.6923076923076923])
  })

  it('fails rather than treating unknown activity as online', () => {
    const [success, error, availability] = getRecentAvailabilityV2([
      epoch(2, ValidatorEpochStatus.ElectedOnline),
      epoch(1, ValidatorEpochStatus.UnknownPlaceholder, -1, -1),
    ])

    expect(success).toBe(false)
    expect(error).toBeTypeOf('string')
    expect(availability).toBeUndefined()
  })

  it('fails when every completed epoch is excluded random non-election', () => {
    const [success, error, availability] = getRecentAvailabilityV2([
      epoch(2, ValidatorEpochStatus.NotElectedRandomness, -1, -1),
      epoch(1, ValidatorEpochStatus.NotElectedRandomness, -1, -1),
    ])

    expect(success).toBe(false)
    expect(error).toBeTypeOf('string')
    expect(availability).toBeUndefined()
  })

  it('treats explicit inactivity sentinels as zero availability', () => {
    expect(getRecentAvailabilityV2([
      epoch(1, ValidatorEpochStatus.InactiveByChoiceOrRemoved, -1, -1),
    ])).toEqual([true, undefined, 0])
  })

  it('treats inferred offline non-election as zero availability', () => {
    expect(getRecentAvailabilityV2([
      epoch(1, 'inferred_offline' as ValidatorEpochStatus, -1, -1),
    ])).toEqual([true, undefined, 0])
  })
})

describe('score v2 long-term availability', () => {
  it('excludes random non-election and weights newest eligible epochs first before quadratic smoothing', () => {
    const [success, error, availability] = getLongTermAvailabilityV2([
      epoch(1, ValidatorEpochStatus.ElectedFailedOrOffline, 0, 720),
      epoch(3, ValidatorEpochStatus.NotElectedRandomness, -1, -1),
      epoch(2, ValidatorEpochStatus.ElectedOnline),
    ])

    expect(success).toBe(true)
    expect(error).toBeUndefined()
    expect(availability).toBeCloseTo(0.8163265306122449, 12)
  })

  it('scores elected offline and explicit inactivity as zero availability', () => {
    expect(getLongTermAvailabilityV2([
      epoch(2, ValidatorEpochStatus.ElectedFailedOrOffline, 0, 720),
      epoch(1, ValidatorEpochStatus.InactiveByChoiceOrRemoved, 0, 0),
    ])).toEqual([true, undefined, 0])
  })

  it('treats explicit inactivity sentinels as zero availability', () => {
    expect(getLongTermAvailabilityV2([
      epoch(1, ValidatorEpochStatus.InactiveByChoiceOrRemoved, -1, -1),
    ])).toEqual([true, undefined, 0])
  })
})

describe('score v2 reliability', () => {
  it('uses normalized zero-based positions and epoch recency, independent of input order', () => {
    const [,, newestDegraded] = getReliabilityV2([
      epoch(2, ValidatorEpochStatus.ElectedOnline),
      epoch(10_000, ValidatorEpochStatus.ElectedDegraded, 3, 1),
    ])
    const [,, oldestDegraded] = getReliabilityV2([
      epoch(10_000, ValidatorEpochStatus.ElectedOnline),
      epoch(2, ValidatorEpochStatus.ElectedDegraded, 3, 1),
    ])

    if (newestDegraded === undefined || oldestDegraded === undefined)
      throw new Error('Expected reliability values')

    expect(newestDegraded).toBeCloseTo(0.5798100240755055, 6)
    expect(oldestDegraded).toBeCloseTo(0.6474652824103583, 6)
    expect(newestDegraded).toBeLessThan(oldestDegraded)
  })

  it('reduces reliability when a degraded elected epoch misses blocks', () => {
    expect(getReliabilityV2([
      epoch(1, ValidatorEpochStatus.ElectedDegraded, 3, 1),
    ])).toEqual([true, undefined, expect.closeTo(0.4230468128842918, 7)])
  })

  it('excludes full offline epochs so availability owns the outage penalty', () => {
    expect(getReliabilityV2([
      epoch(3, ValidatorEpochStatus.ElectedFailedOrOffline, 0, 720),
      epoch(2, ValidatorEpochStatus.ElectedOnline),
      epoch(1, ValidatorEpochStatus.InactiveByChoiceOrRemoved, 0, 0),
    ])).toEqual([true, undefined, 1])
  })

  it('excludes explicit inactivity sentinels from reliability', () => {
    expect(getReliabilityV2([
      epoch(2, ValidatorEpochStatus.ElectedOnline),
      epoch(1, ValidatorEpochStatus.InactiveByChoiceOrRemoved, -1, -1),
    ])).toEqual([true, undefined, 1])
  })
})

describe('score v2 validation', () => {
  it('fails long-term and reliability scoring on unknown activity', () => {
    for (const result of [
      getLongTermAvailabilityV2([
        epoch(1, ValidatorEpochStatus.UnknownPlaceholder, -1, -1),
      ]),
      getReliabilityV2([
        epoch(1, ValidatorEpochStatus.UnknownPlaceholder, -1, -1),
      ]),
    ]) {
      expect(result[0]).toBe(false)
      expect(result[1]).toBeTypeOf('string')
      expect(result[2]).toBeUndefined()
    }
  })

  it('fails when filtering leaves no usable data', () => {
    for (const result of [
      getLongTermAvailabilityV2([
        epoch(1, ValidatorEpochStatus.NotElectedRandomness, -1, -1),
      ]),
      getReliabilityV2([]),
    ]) {
      expect(result[0]).toBe(false)
      expect(result[1]).toBeTypeOf('string')
      expect(result[2]).toBeUndefined()
    }
  })

  it('rejects invalid weight factors and invalid production counters', () => {
    expect(getLongTermAvailabilityV2([
      epoch(1, ValidatorEpochStatus.ElectedOnline),
    ], { weightFactor: 1.1 })[0]).toBe(false)

    expect(getReliabilityV2([
      epoch(1, ValidatorEpochStatus.ElectedOnline),
    ], { weightFactor: -0.1 })[0]).toBe(false)

    expect(getReliabilityV2([
      epoch(1, ValidatorEpochStatus.ElectedOnline, -1, -1),
    ])[0]).toBe(false)
  })

  it('returns only finite values within the unit interval', () => {
    const results = [
      getRecentAvailabilityV2([
        epoch(2, ValidatorEpochStatus.ElectedOnline),
        epoch(1, ValidatorEpochStatus.ElectedFailedOrOffline, 0, 720),
      ]),
      getLongTermAvailabilityV2([
        epoch(2, ValidatorEpochStatus.ElectedOnline),
        epoch(1, ValidatorEpochStatus.ElectedFailedOrOffline, 0, 720),
      ]),
      getReliabilityV2([
        epoch(2, ValidatorEpochStatus.ElectedOnline),
        epoch(1, ValidatorEpochStatus.ElectedDegraded, 3, 1),
      ]),
    ]

    for (const [success, error, value] of results) {
      expect(success).toBe(true)
      expect(error).toBeUndefined()
      if (value === undefined)
        throw new Error('Expected score value')
      expect(Number.isFinite(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })
})

describe('score v2 outage regression', () => {
  it('blends four recent outages with separate healthy long-term history near the outage target', () => {
    const recentEpochs = [
      epoch(29, ValidatorEpochStatus.ElectedFailedOrOffline, 0, 720),
      epoch(28, ValidatorEpochStatus.ElectedFailedOrOffline, 0, 720),
      epoch(27, ValidatorEpochStatus.ElectedFailedOrOffline, 0, 720),
      epoch(26, ValidatorEpochStatus.ElectedFailedOrOffline, 0, 720),
      epoch(25, ValidatorEpochStatus.ElectedOnline),
      epoch(24, ValidatorEpochStatus.ElectedOnline),
      epoch(23, ValidatorEpochStatus.ElectedOnline),
      epoch(22, ValidatorEpochStatus.ElectedOnline),
      epoch(21, ValidatorEpochStatus.ElectedOnline),
      epoch(20, ValidatorEpochStatus.ElectedOnline),
      epoch(19, ValidatorEpochStatus.ElectedOnline),
      epoch(18, ValidatorEpochStatus.ElectedOnline),
      epoch(17, ValidatorEpochStatus.ElectedOnline),
      epoch(16, ValidatorEpochStatus.ElectedOnline),
      epoch(15, ValidatorEpochStatus.ElectedOnline),
      epoch(14, ValidatorEpochStatus.ElectedOnline),
      epoch(13, ValidatorEpochStatus.ElectedOnline),
      epoch(12, ValidatorEpochStatus.ElectedOnline),
      epoch(11, ValidatorEpochStatus.ElectedOnline),
      epoch(10, ValidatorEpochStatus.ElectedOnline),
      epoch(9, ValidatorEpochStatus.ElectedOnline),
      epoch(8, ValidatorEpochStatus.ElectedOnline),
      epoch(7, ValidatorEpochStatus.ElectedOnline),
      epoch(6, ValidatorEpochStatus.ElectedOnline),
      epoch(5, ValidatorEpochStatus.ElectedOnline),
      epoch(4, ValidatorEpochStatus.ElectedOnline),
      epoch(3, ValidatorEpochStatus.ElectedOnline),
      epoch(2, ValidatorEpochStatus.ElectedOnline),
      epoch(1, ValidatorEpochStatus.ElectedOnline),
    ]
    const longTermEpochs = [
      epoch(3, ValidatorEpochStatus.ElectedOnline),
      epoch(2, ValidatorEpochStatus.ElectedOnline),
      epoch(1, ValidatorEpochStatus.ElectedOnline),
    ]

    const [success, error, score] = computeScoreV2({
      dominance: { dominanceRatio: 0.01 },
      recentEpochs,
      longTermEpochs,
    })

    expect(success).toBe(true)
    expect(error).toBeUndefined()
    expect(score).toBeDefined()
    expect(score?.recentAvailability).toBeCloseTo(0.8620689655172413, 12)
    expect(score?.longTermAvailability).toBe(1)
    expect(score?.availability).toBeCloseTo(0.9310344827586207, 12)
    expect(score?.total).toBeGreaterThanOrEqual(0.9)
    expect(score?.total).toBeLessThanOrEqual(0.94)

    for (const value of Object.values(score ?? {})) {
      expect(Number.isFinite(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })
})
