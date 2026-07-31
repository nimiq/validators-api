import { describe, expect, it, vi } from 'vitest'
import {
  buildScoreV2Epochs,
  getScoreRollout,
  parseScoreV2Mode,
  planV2Backfill,
  resolveLongTermState,
} from './scores'

vi.mock('./validators', () => ({
  getStoredValidatorsId: vi.fn(),
}))

vi.mock('./drizzle', () => ({
  tables: {},
  useDrizzle: () => {
    throw new Error('Database access is not available in pure score tests')
  },
}))

function activity(epoch: number, overrides: Record<string, number> = {}) {
  return {
    validatorId: 7,
    epoch,
    likelihood: 1,
    missed: 0,
    rewarded: 720,
    dominanceViaSlots: 0.01,
    dominanceViaBalance: 0.01,
    balance: 1_000,
    stakers: 1,
    ...overrides,
  }
}

describe('score v2 rollout mode', () => {
  it('defaults to off and validates every supported mode', () => {
    expect(parseScoreV2Mode(undefined)).toBe('off')
    expect(parseScoreV2Mode('off')).toBe('off')
    expect(parseScoreV2Mode('shadow')).toBe('shadow')
    expect(parseScoreV2Mode('active')).toBe('active')
    expect(() => parseScoreV2Mode('invalid')).toThrow(/score v2 mode/i)
  })

  it('always writes v1 and activates v2 only in active mode', () => {
    expect(getScoreRollout('off')).toEqual({
      writeV1: true,
      writeV2: false,
      activeVersion: 1,
    })
    expect(getScoreRollout('shadow')).toEqual({
      writeV1: true,
      writeV2: true,
      activeVersion: 1,
    })
    expect(getScoreRollout('active')).toEqual({
      writeV1: true,
      writeV2: true,
      activeVersion: 2,
    })
  })
})

describe('score v2 finalized activity mapping', () => {
  it('maps an improbable high-stake non-election to inferred offline', () => {
    const result = buildScoreV2Epochs({
      validatorId: 7,
      range: { fromEpoch: 10, toEpoch: 12 },
      activities: [
        activity(10, {
          dominanceViaBalance: -1,
          dominanceViaSlots: 0.064,
        }),
        activity(12, {
          dominanceViaBalance: -1,
          dominanceViaSlots: 0.064,
        }),
      ],
    })

    expect(result).toEqual([true, undefined, [
      expect.objectContaining({ epochNumber: 12, status: 'elected_online' }),
      {
        epochNumber: 11,
        status: 'inferred_offline',
        rewarded: -1,
        missed: -1,
      },
      expect.objectContaining({ epochNumber: 10, status: 'elected_online' }),
    ]])
  })

  it('maps an absent validator row in a finalized epoch to random non-election', () => {
    const result = buildScoreV2Epochs({
      validatorId: 7,
      range: { fromEpoch: 10, toEpoch: 12 },
      activities: [
        activity(10),
        activity(12, { likelihood: 0, missed: 9, rewarded: 711 }),
      ],
    })

    expect(result).toEqual([true, undefined, [
      expect.objectContaining({ epochNumber: 12, status: 'elected_degraded' }),
      {
        epochNumber: 11,
        status: 'not_elected_randomness',
        rewarded: -1,
        missed: -1,
      },
      expect.objectContaining({ epochNumber: 10, status: 'elected_online' }),
    ]])
  })

  it('rejects a placeholder inside a finalized range', () => {
    const [success, error, epochs] = buildScoreV2Epochs({
      validatorId: 7,
      range: { fromEpoch: 10, toEpoch: 10 },
      activities: [activity(10, { missed: -1, rewarded: -1 })],
    })

    expect(success).toBe(false)
    expect(error).toMatch(/placeholder|integrity/i)
    expect(epochs).toBeUndefined()
  })
})

describe('score v2 retained long-term state', () => {
  const prior = {
    longTermAvailability: 0.98,
    reliability: 0.97,
    longTermAsOfEpoch: 90,
  }

  it('uses freshly computed state only at full coverage', () => {
    expect(resolveLongTermState({
      coverage: 1,
      targetEpoch: 100,
      computed: {
        longTermAvailability: 0.99,
        reliability: 0.96,
      },
      prior,
    })).toEqual({
      longTermAvailability: 0.99,
      reliability: 0.96,
      longTermCoverage: 1,
      longTermAsOfEpoch: 100,
    })
  })

  it('retains a trustworthy prior pair when coverage is partial', () => {
    expect(resolveLongTermState({
      coverage: 0.75,
      targetEpoch: 100,
      prior,
    })).toEqual({
      ...prior,
      longTermCoverage: 0.75,
    })
  })

  it('publishes no state without a prior pair or when it comes from the future', () => {
    expect(resolveLongTermState({
      coverage: 0.75,
      targetEpoch: 100,
    })).toBeNull()
    expect(resolveLongTermState({
      coverage: 0.75,
      targetEpoch: 80,
      prior,
    })).toBeNull()
  })
})

describe('score v2 backfill planning', () => {
  it('returns unique missing v2 epochs newest first and bounded', () => {
    expect(planV2Backfill(
      [100, 98, 100, 99, 97, 96],
      [99, 96],
      3,
    )).toEqual([100, 98, 97])
  })

  it('rejects an invalid limit', () => {
    expect(() => planV2Backfill([100], [], 0)).toThrow(/limit/i)
  })
})
