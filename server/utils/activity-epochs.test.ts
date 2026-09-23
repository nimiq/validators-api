import type { ElectionSet, EpochActivity, Range } from 'nimiq-validator-trustscore/types'
import { describe, expect, it, vi } from 'vitest'
import {
  calculateActivityCoverage,
  getRecentEpochRange,
  planEpochSync,
  prepareCompletedEpoch,
} from './activity-epochs'

vi.mock('./drizzle', () => ({
  tables: {},
  useDrizzle: () => {
    throw new Error('Database access is not available in pure activity epoch tests')
  },
}))

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const ADDRESS_A = 'NQ02 31N6 3KM5 T6G5 22TN EPF5 5XPY RLHK RMB3'
const ADDRESS_A_CANONICAL = 'NQ0231N63KM5T6G522TNEPF55XPYRLHKRMB3'
const ADDRESS_B = 'NQ29 FBVT B4GM S27H UBP4 1MTC GNKQ VPBT 099M'
const ADDRESS_B_CANONICAL = 'NQ29FBVTB4GMS27HUBP41MTCGNKQVPBT099M'
const ADDRESS_C = 'NQ40 FC4D HAT6 9N1H P52H P4FX QL8P CE6Y 10VT'
const EXPECTED_ELECTION_SET_HASH = 'ff5c7e71ebf54f0ca2d57a4adefc3c3a7d0b1d10bcb1b69b653431d047cdacbd'

function createRange(overrides: Partial<Range> = {}): Range {
  const fromEpoch = overrides.fromEpoch ?? 1
  const toEpoch = overrides.toEpoch ?? 100
  const epochDurationMs = overrides.epochDurationMs ?? 12 * HOUR_MS

  return {
    head: 1_000_000,
    headEpoch: toEpoch + 1,
    epochCount: toEpoch - fromEpoch + 1,
    epochDurationMs,
    fromEpoch,
    fromBlockNumber: 0,
    fromTimestamp: 0,
    toEpoch,
    toBlockNumber: 999_999,
    toTimestamp: 0,
    snapshotEpoch: toEpoch + 1,
    snapshotBlock: 1_000_000,
    snapshotTimestamp: 0,
    ...overrides,
  }
}

function createElectionSet(addresses = [ADDRESS_A, ADDRESS_B]): ElectionSet {
  return {
    epochIndex: 77,
    electionBlockNumber: 123_456,
    validators: addresses.map((address, index) => ({ address, numSlots: 10 + index })),
  }
}

function createElectedActivity(address: string, likelihood: number) {
  return {
    address,
    elected: true as const,
    likelihood,
    missed: 2,
    rewarded: 718,
    dominanceRatioViaBalance: -1,
    dominanceRatioViaSlots: likelihood / 512,
    balance: -1,
    stakers: 0,
  }
}

function createEpochActivity(): EpochActivity {
  return {
    [ADDRESS_B_CANONICAL.toLowerCase()]: createElectedActivity(ADDRESS_B, 11),
    [ADDRESS_A]: createElectedActivity(ADDRESS_A_CANONICAL.toLowerCase(), 10),
  }
}

function createPreparationInput(overrides: Partial<{
  epochNumber: number
  electionSet: ElectionSet
  activity: EpochActivity
  validatorIds: Map<string, number>
}> = {}) {
  return {
    epochNumber: 77,
    electionSet: createElectionSet(),
    activity: createEpochActivity(),
    validatorIds: new Map<string, number>([
      [ADDRESS_B.toLowerCase(), 22],
      [ADDRESS_A_CANONICAL, 11],
    ]),
    ...overrides,
  }
}

describe('activity epoch ranges and coverage', () => {
  it('selects the inclusive epochs covering the most recent 14 days', () => {
    const range = createRange({ fromEpoch: 40, toEpoch: 100, epochDurationMs: 12 * HOUR_MS })

    expect(getRecentEpochRange(range)).toEqual({ fromEpoch: 73, toEpoch: 100 })
  })

  it('rounds a partial epoch up when covering the requested duration', () => {
    const range = createRange({ fromEpoch: 40, toEpoch: 100, epochDurationMs: 12 * HOUR_MS - 60_000 })

    expect(getRecentEpochRange(range, 14 * DAY_MS)).toEqual({ fromEpoch: 72, toEpoch: 100 })
  })

  it('clamps the recent range to the available history', () => {
    const range = createRange({ fromEpoch: 80, toEpoch: 100, epochDurationMs: 12 * HOUR_MS })

    expect(getRecentEpochRange(range)).toEqual({ fromEpoch: 80, toEpoch: 100 })
  })

  it('reports inclusive finalized coverage and every missing epoch', () => {
    expect(calculateActivityCoverage(10, 14, [14, 10, 12])).toEqual({
      fromEpoch: 10,
      toEpoch: 14,
      expectedEpochCount: 5,
      finalizedEpochCount: 3,
      coverage: 0.6,
      missingEpochs: [11, 13],
    })
  })

  it('does not inflate coverage with duplicate or out-of-range finalized epochs', () => {
    expect(calculateActivityCoverage(10, 12, [9, 10, 10, 12, 13])).toEqual({
      fromEpoch: 10,
      toEpoch: 12,
      expectedEpochCount: 3,
      finalizedEpochCount: 2,
      coverage: 2 / 3,
      missingEpochs: [11],
    })
  })
})

describe('activity epoch synchronization planning', () => {
  const now = '2026-07-28T12:00:00.000Z'

  it('prioritizes latest, recent failed or stale, recent absent, then older failed or absent epochs newest-first', () => {
    expect(planEpochSync({
      range: { fromEpoch: 90, toEpoch: 100 },
      recentRange: { fromEpoch: 97, toEpoch: 100 },
      markers: [
        { epochNumber: 99, status: 'failed', startedAt: '2026-07-28T11:00:00.000Z' },
        { epochNumber: 98, status: 'syncing', startedAt: '2026-07-28T05:59:59.000Z' },
        { epochNumber: 96, status: 'failed', startedAt: '2026-07-27T12:00:00.000Z' },
        { epochNumber: 95, status: 'syncing', startedAt: '2026-07-28T00:00:00.000Z' },
        { epochNumber: 93, status: 'syncing', startedAt: '2026-07-28T11:00:00.000Z' },
        { epochNumber: 92, status: 'finalized', startedAt: '2026-07-27T12:00:00.000Z' },
      ],
      now,
    })).toEqual([100, 99, 98, 97, 96, 95, 94, 91, 90])
  })

  it('keeps a fresh syncing lease out of the plan and retries it at the six-hour boundary', () => {
    const baseInput = {
      range: { fromEpoch: 40, toEpoch: 42 },
      recentRange: { fromEpoch: 40, toEpoch: 42 },
      now,
    }

    expect(planEpochSync({
      ...baseInput,
      markers: [
        { epochNumber: 42, status: 'finalized', startedAt: '2026-07-28T00:00:00.000Z' },
        { epochNumber: 41, status: 'syncing', startedAt: '2026-07-28T06:00:01.000Z' },
        { epochNumber: 40, status: 'finalized', startedAt: '2026-07-28T00:00:00.000Z' },
      ],
    })).toEqual([])

    expect(planEpochSync({
      ...baseInput,
      markers: [
        { epochNumber: 42, status: 'finalized', startedAt: '2026-07-28T00:00:00.000Z' },
        { epochNumber: 41, status: 'syncing', startedAt: '2026-07-28T06:00:00.000Z' },
        { epochNumber: 40, status: 'finalized', startedAt: '2026-07-28T00:00:00.000Z' },
      ],
    })).toEqual([41])
  })

  it('allows a shorter lease to recover orphaned development attempts', () => {
    const input = {
      range: { fromEpoch: 40, toEpoch: 42 },
      recentRange: { fromEpoch: 40, toEpoch: 42 },
      markers: [
        { epochNumber: 42, status: 'finalized' as const, startedAt: '2026-07-28T00:00:00.000Z' },
        { epochNumber: 41, status: 'syncing' as const, startedAt: '2026-07-28T11:54:59.000Z' },
        { epochNumber: 40, status: 'finalized' as const, startedAt: '2026-07-28T00:00:00.000Z' },
      ],
      now,
    }

    expect(planEpochSync(input)).toEqual([])
    expect(planEpochSync({
      ...input,
      syncingLeaseDurationMs: 5 * 60 * 1000,
    })).toEqual([41])
  })

  it('never schedules finalized epochs', () => {
    expect(planEpochSync({
      range: { fromEpoch: 7, toEpoch: 9 },
      recentRange: { fromEpoch: 7, toEpoch: 9 },
      markers: [7, 8, 9].map(epochNumber => ({
        epochNumber,
        status: 'finalized' as const,
        startedAt: '2026-07-28T00:00:00.000Z',
      })),
      now,
    })).toEqual([])
  })

  it('applies the production limit of 50 candidates after priority ordering', () => {
    const planned = planEpochSync({
      range: { fromEpoch: 1, toEpoch: 60 },
      recentRange: { fromEpoch: 50, toEpoch: 60 },
      markers: [],
      now,
    })

    expect(planned).toHaveLength(50)
    expect(planned).toEqual(Array.from({ length: 50 }, (_, index) => 60 - index))
  })

  it('returns the entire range when development requests an unlimited plan', () => {
    const planned = planEpochSync({
      range: { fromEpoch: 1, toEpoch: 550 },
      recentRange: { fromEpoch: 522, toEpoch: 550 },
      markers: [],
      now,
      limit: Infinity,
    })

    expect(planned).toHaveLength(550)
    expect(new Set(planned)).toEqual(new Set(Array.from({ length: 550 }, (_, index) => index + 1)))
  })
})

describe('completed epoch preparation', () => {
  it('prepares a deterministic exact elected set with validated IDs, counts, and hash', async () => {
    const prepared = await prepareCompletedEpoch(createPreparationInput())

    expect(prepared).toMatchObject({
      epochNumber: 77,
      expectedElectedCount: 2,
      storedElectedCount: 2,
      electedSetHash: EXPECTED_ELECTION_SET_HASH,
    })
    expect(prepared.activities).toEqual([
      expect.objectContaining({ validatorId: 11, epochNumber: 77, likelihood: 10, missed: 2, rewarded: 718 }),
      expect.objectContaining({ validatorId: 22, epochNumber: 77, likelihood: 11, missed: 2, rewarded: 718 }),
    ])
  })

  it('rejects a mismatch between the election set and activity keys', async () => {
    const activity = createEpochActivity()
    delete activity[ADDRESS_B_CANONICAL.toLowerCase()]
    activity[ADDRESS_C] = createElectedActivity(ADDRESS_C, 11)

    await expect(prepareCompletedEpoch(createPreparationInput({ activity }))).rejects.toThrow(/election|address|set|mismatch/i)
  })

  it('rejects an activity whose payload address does not match its key canonically', async () => {
    const activity = createEpochActivity()
    activity[ADDRESS_A] = createElectedActivity(ADDRESS_C, 10)

    await expect(prepareCompletedEpoch(createPreparationInput({ activity }))).rejects.toThrow(/address|canonical|mismatch/i)
  })

  it.each([
    ['rewarded', 0.5],
    ['rewarded', Number.NaN],
    ['rewarded', Number.POSITIVE_INFINITY],
    ['missed', 0.5],
    ['missed', Number.NaN],
    ['missed', Number.POSITIVE_INFINITY],
  ] as const)('rejects non-integer finalized %s counters: %s', async (counter, value) => {
    const activity = createEpochActivity()
    Object.assign(activity[ADDRESS_A]!, { [counter]: value })

    await expect(prepareCompletedEpoch(createPreparationInput({ activity })))
      .rejects
      .toThrow(/counter|finalized|finite|integer/i)
  })

  it('rejects missing or unexpected validator ID mappings', async () => {
    await expect(prepareCompletedEpoch(createPreparationInput({
      validatorIds: new Map([[ADDRESS_A, 11]]),
    }))).rejects.toThrow(/validator|id|count|address/i)

    await expect(prepareCompletedEpoch(createPreparationInput({
      validatorIds: new Map([
        [ADDRESS_A, 11],
        [ADDRESS_B, 22],
        [ADDRESS_C, 33],
      ]),
    }))).rejects.toThrow(/validator|id|count|address/i)
  })

  it('rejects invalid or duplicate stored validator IDs', async () => {
    await expect(prepareCompletedEpoch(createPreparationInput({
      validatorIds: new Map([
        [ADDRESS_A, 11],
        [ADDRESS_B, 11],
      ]),
    }))).rejects.toThrow(/duplicate|validator|id/i)

    await expect(prepareCompletedEpoch(createPreparationInput({
      validatorIds: new Map([
        [ADDRESS_A, 11],
        [ADDRESS_B, 0],
      ]),
    }))).rejects.toThrow(/validator|id/i)
  })

  it('rejects election-set epoch and count inconsistencies', async () => {
    await expect(prepareCompletedEpoch(createPreparationInput({
      electionSet: { ...createElectionSet(), epochIndex: 76 },
    }))).rejects.toThrow(/epoch/i)

    const duplicateCanonicalElectionSet = createElectionSet([
      ADDRESS_A,
      ADDRESS_A_CANONICAL.toLowerCase(),
    ])
    await expect(prepareCompletedEpoch(createPreparationInput({
      electionSet: duplicateCanonicalElectionSet,
    }))).rejects.toThrow(/duplicate|count|address/i)
  })
})
