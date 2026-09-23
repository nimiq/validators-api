import type { Range } from 'nimiq-validator-trustscore/types'
import type { TestDbHarness } from '../test/db-harness'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../db/schema'
import { createTestDbHarness } from '../test/db-harness'

const drizzleState = vi.hoisted(() => ({ db: undefined as unknown }))
const cacheDefinitions = vi.hoisted(() => new Map<string, {
  getKey: (_event: unknown, params: Record<string, unknown>) => string
}>())

vi.mock('./drizzle', () => ({
  tables: schema,
  useDrizzle: () => drizzleState.db,
}))

vi.mock('./logo', () => ({
  handleValidatorLogo: vi.fn(),
}))

vi.stubGlobal('defineCachedFunction', (
  fn: unknown,
  options: { name: string, getKey: (_event: unknown, params: Record<string, unknown>) => string },
) => {
  cacheDefinitions.set(options.name, options)
  return fn
})

type ValidatorsModule = typeof import('./validators')

let harness: TestDbHarness
let validators: ValidatorsModule

beforeEach(async () => {
  harness = await createTestDbHarness()
  drizzleState.db = harness.db
  cacheDefinitions.clear()
  vi.resetModules()
  validators = await import('./validators')
})

afterEach(() => {
  harness.close()
  drizzleState.db = undefined
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('versioned validator score query', () => {
  it('filters score version before maximum-epoch grouping', async () => {
    const [validator] = await harness.db.insert(schema.validators).values({
      address: 'validator-1',
      name: 'Validator 1',
      logo: 'logo',
      hasDefaultLogo: true,
      accentColor: '#000000',
      isListed: true,
    }).returning().all()

    await harness.db.insert(schema.scores).values([
      {
        validatorId: validator!.id,
        epochNumber: 12,
        scoreVersion: 1,
        total: 0.1,
        availability: 0.1,
        dominance: 0.1,
        reliability: 0.1,
      },
      {
        validatorId: validator!.id,
        epochNumber: 10,
        scoreVersion: 2,
        total: 0.9,
        availability: 0.8,
        recentAvailability: 0.75,
        longTermAvailability: 0.85,
        dominance: 0.7,
        reliability: 0.95,
        longTermCoverage: 1,
        longTermAsOfEpoch: 10,
      },
    ]).execute()
    await harness.db.insert(schema.activity).values({
      validatorId: validator!.id,
      epochNumber: 12,
      likelihood: 1,
      rewarded: 720,
      missed: 0,
      dominanceRatioViaBalance: 0.01,
      dominanceRatioViaSlots: 0.01,
      balance: 1_000,
      stakers: 1,
    }).execute()
    harness.trace.reset()

    const [success, error, result] = await validators.fetchValidators({} as never, {
      'only-known': true,
      'with-identicons': false,
      'force': false,
      'epoch-number': 12,
      'epochNumber': 12,
      'scoreVersion': 2,
    })

    expect(success).toBe(true)
    expect(error).toBeUndefined()
    expect(result).toHaveLength(1)
    expect(result![0]!.score).toMatchObject({
      scoreVersion: 2,
      total: 0.9,
      epochNumber: 10,
      scoreEpoch: 10,
      dataStatus: 'stale',
    })

    const scoreMaximumQuery = harness.trace.executed.find(statement =>
      /max\(.+scores.+epoch_number/i.test(statement),
    )
    expect(scoreMaximumQuery).toMatch(/where.+score_version.+group by/is)
  })
})

describe('versioned validator cache keys', () => {
  it('separates list and detail cache entries by selected score version', () => {
    const listCache = cacheDefinitions.get('validators')!
    const detailCache = cacheDefinitions.get('validator')!
    const baseList = {
      'only-known': true,
      'with-identicons': false,
      'payout-type': undefined,
      'epochNumber': 20,
    }
    const baseDetail = {
      address: 'validator-1',
      range: { fromEpoch: 10, toEpoch: 20 },
    }

    expect(listCache.getKey({}, { ...baseList, scoreVersion: 1 })).not.toBe(listCache.getKey({}, { ...baseList, scoreVersion: 2 }))
    expect(detailCache.getKey({}, { ...baseDetail, scoreVersion: 1 })).not.toBe(detailCache.getKey({}, { ...baseDetail, scoreVersion: 2 }))
  })
})

describe('validator activity history', () => {
  it('exposes an improbable high-stake non-election only for score v2', async () => {
    const address = 'offline-validator'
    const [validator] = await harness.db.insert(schema.validators).values({
      address,
      name: 'Offline validator',
      logo: 'logo',
      hasDefaultLogo: true,
      accentColor: '#000000',
      isListed: true,
    }).returning().all()
    await harness.db.insert(schema.activity).values([
      {
        validatorId: validator!.id,
        epochNumber: 10,
        likelihood: 33,
        rewarded: 720,
        missed: 0,
        dominanceRatioViaBalance: -1,
        dominanceRatioViaSlots: 0.064,
        balance: 1_000,
        stakers: 1,
      },
      {
        validatorId: validator!.id,
        epochNumber: 12,
        likelihood: 33,
        rewarded: 720,
        missed: 0,
        dominanceRatioViaBalance: -1,
        dominanceRatioViaSlots: 0.064,
        balance: 1_000,
        stakers: 1,
      },
    ]).execute()
    await harness.db.insert(schema.activityEpochs).values([
      {
        epochNumber: 10,
        status: 'finalized',
        expectedElectedCount: 1,
        storedElectedCount: 1,
        electedSetHash: 'marker-10',
        attemptCount: 1,
        startedAt: '2026-07-31T08:00:00.000Z',
        finalizedAt: '2026-07-31T08:05:00.000Z',
      },
      {
        epochNumber: 11,
        status: 'finalized',
        expectedElectedCount: 0,
        storedElectedCount: 0,
        electedSetHash: 'marker-11',
        attemptCount: 1,
        startedAt: '2026-07-31T08:00:00.000Z',
        finalizedAt: '2026-07-31T08:05:00.000Z',
      },
      {
        epochNumber: 12,
        status: 'finalized',
        expectedElectedCount: 1,
        storedElectedCount: 1,
        electedSetHash: 'marker-12',
        attemptCount: 1,
        startedAt: '2026-07-31T08:00:00.000Z',
        finalizedAt: '2026-07-31T08:05:00.000Z',
      },
    ]).execute()
    const range: Range = {
      head: 13,
      headEpoch: 13,
      epochCount: 3,
      epochDurationMs: 12 * 60 * 60 * 1000,
      fromEpoch: 10,
      fromBlockNumber: 0,
      fromTimestamp: 0,
      toEpoch: 12,
      toBlockNumber: 12,
      toTimestamp: 0,
      snapshotEpoch: 13,
      snapshotBlock: 13,
      snapshotTimestamp: 0,
    }

    const [success, error, result] = await validators.fetchValidator({} as never, {
      address,
      range,
      scoreVersion: 2,
      recentCoverage: 1,
    })

    expect(success).toBe(true)
    expect(error).toBeUndefined()
    expect(result!.activity).toEqual([
      expect.objectContaining({ epochNumber: 10, status: 'elected_online' }),
      expect.objectContaining({
        epochNumber: 11,
        status: 'inferred_offline',
        inferred: true,
      }),
      expect.objectContaining({ epochNumber: 12, status: 'elected_online' }),
    ])

    const [v1Success, v1Error, v1Result] = await validators.fetchValidator({} as never, {
      address,
      range,
      scoreVersion: 1,
      recentCoverage: 1,
    })

    expect(v1Success).toBe(true)
    expect(v1Error).toBeUndefined()
    expect(v1Result!.activity).toEqual([
      expect.objectContaining({ epochNumber: 10, status: 'elected_online' }),
      expect.objectContaining({ epochNumber: 12, status: 'elected_online' }),
    ])
  })
})
