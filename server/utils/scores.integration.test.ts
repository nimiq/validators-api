import type { Range } from 'nimiq-validator-trustscore/types'
import type { TestDbHarness } from '../test/db-harness'
import { and, asc, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../db/schema'
import { createTestDbHarness } from '../test/db-harness'

const drizzleState = vi.hoisted(() => ({ db: undefined as unknown }))
const runtimeConfigState = vi.hoisted(() => ({ scoreV2Mode: 'off' }))
const mocks = vi.hoisted(() => ({
  getRange: vi.fn(),
  getStoredValidatorsId: vi.fn(),
}))

vi.mock('nimiq-validator-trustscore/range', () => ({
  getRange: mocks.getRange,
}))

vi.mock('./validators', () => ({
  getStoredValidatorsId: mocks.getStoredValidatorsId,
}))

vi.mock('./drizzle', () => ({
  tables: schema,
  useDrizzle: () => drizzleState.db,
}))

vi.stubGlobal('tables', schema)
vi.stubGlobal('useDrizzle', () => drizzleState.db)
vi.stubGlobal('useSafeRuntimeConfig', () => ({
  scoreV2Mode: runtimeConfigState.scoreV2Mode,
  public: {
    nimiqNetwork: 'testnet',
    scoreV2Mode: runtimeConfigState.scoreV2Mode,
  },
}))

type ScoresModule = typeof import('./scores')

let scores: ScoresModule
let harness: TestDbHarness

function createRange(fromEpoch: number, toEpoch: number): Range {
  return {
    head: 1_000_000,
    headEpoch: toEpoch + 1,
    epochCount: toEpoch - fromEpoch + 1,
    epochDurationMs: 12 * 60 * 60 * 1000,
    fromEpoch,
    fromBlockNumber: 0,
    fromTimestamp: 0,
    toEpoch,
    toBlockNumber: 999_999,
    toTimestamp: 0,
    snapshotEpoch: toEpoch + 1,
    snapshotBlock: 1_000_000,
    snapshotTimestamp: 0,
  }
}

async function insertValidators(count: number, prefix = 'score-validator') {
  return harness.db.insert(schema.validators).values(Array.from({ length: count }, (_, index) => ({
    address: `${prefix}-${index.toString().padStart(3, '0')}`,
    name: 'Score validator',
    logo: 'test-logo',
    hasDefaultLogo: true,
    accentColor: '#000000',
  }))).returning({
    id: schema.validators.id,
    address: schema.validators.address,
  }).all()
}

function finalizedMarker(epochNumber: number, validatorCount: number) {
  return {
    epochNumber,
    status: 'finalized' as const,
    expectedElectedCount: validatorCount,
    storedElectedCount: validatorCount,
    electedSetHash: `marker-${epochNumber}`,
    attemptCount: 1,
    startedAt: '2026-07-28T08:00:00.000Z',
    finalizedAt: '2026-07-28T08:05:00.000Z',
    lastError: null,
  }
}

function activityRow(
  validatorId: number,
  epochNumber: number,
  rewarded = 720,
  missed = 0,
  overrides: Record<string, number> = {},
) {
  return {
    validatorId,
    epochNumber,
    likelihood: 1,
    rewarded,
    missed,
    dominanceRatioViaBalance: 0,
    dominanceRatioViaSlots: 0,
    balance: 1_000,
    stakers: 1,
    ...overrides,
  }
}

async function insertFinalizedRange(
  fromEpoch: number,
  toEpoch: number,
  validatorCount = 1,
) {
  await harness.db.insert(schema.activityEpochs).values(
    Array.from(
      { length: toEpoch - fromEpoch + 1 },
      (_, index) => finalizedMarker(fromEpoch + index, validatorCount),
    ),
  ).execute()
}

beforeEach(async () => {
  harness = await createTestDbHarness()
  drizzleState.db = harness.db
  runtimeConfigState.scoreV2Mode = 'off'
  mocks.getRange.mockReset()
  mocks.getStoredValidatorsId.mockReset()
  mocks.getStoredValidatorsId.mockImplementation(() => harness.db
    .select({ id: schema.validators.id })
    .from(schema.validators)
    .execute()
    .then(rows => rows.map(row => row.id)))

  vi.resetModules()
  scores = await import('./scores')
})

afterEach(() => {
  harness.close()
  drizzleState.db = undefined
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('marker-gated v1 score persistence', () => {
  it('preserves prior scores and returns stale when any required activity marker is incomplete', async () => {
    const range = createRange(10, 11)
    const [validator] = await insertValidators(1)
    runtimeConfigState.scoreV2Mode = 'shadow'
    mocks.getRange.mockResolvedValue([true, undefined, range])
    await harness.db.insert(schema.activity).values([
      activityRow(validator!.id, 10),
      activityRow(validator!.id, 11),
    ]).execute()
    await harness.db.insert(schema.activityEpochs).values([
      finalizedMarker(10, 1),
      {
        epochNumber: 11,
        status: 'syncing',
        attemptCount: 1,
        startedAt: '2026-07-28T08:00:00.000Z',
      },
    ]).execute()
    await harness.db.insert(schema.scores).values([
      {
        validatorId: validator!.id,
        epochNumber: 9,
        scoreVersion: 1,
        total: 0.75,
        availability: 0.8,
        dominance: 0.95,
        reliability: 0.99,
        dataStatus: 'complete',
      },
      {
        validatorId: validator!.id,
        epochNumber: 9,
        scoreVersion: 2,
        total: 0.7,
        availability: 0.75,
        recentAvailability: 0.7,
        longTermAvailability: 0.8,
        dominance: 0.95,
        reliability: 0.98,
        dataStatus: 'complete',
        longTermCoverage: 1,
        longTermAsOfEpoch: 9,
      },
    ]).execute()
    const scoresBefore = await harness.db.select().from(schema.scores).all()

    const result = await scores.upsertScoresSnapshotEpoch()

    expect(result).toEqual([true, undefined, expect.objectContaining({
      dataStatus: 'stale',
      missingEpochs: [11],
      scores: [],
    })])
    expect(await harness.db.select().from(schema.scores).all()).toEqual(scoresBefore)
  })

  it('bulk-loads 512 validators and their activity before bounded in-memory scoring and chunked writes', async () => {
    const epochNumber = 20
    const range = createRange(epochNumber, epochNumber)
    const validators = await insertValidators(512, 'bulk-score-validator')
    mocks.getRange.mockResolvedValue([true, undefined, range])
    await harness.db.insert(schema.activity).values(validators.map(validator => activityRow(validator.id, epochNumber))).execute()
    await harness.db.insert(schema.activityEpochs).values(finalizedMarker(epochNumber, validators.length)).execute()
    harness.trace.reset()

    const result = await scores.upsertScoresSnapshotEpoch()

    expect(result[0]).toBe(true)
    const tracedStatements = [
      ...harness.trace.executed,
      ...harness.trace.batches.flat(),
    ]
    const validatorReads = tracedStatements.filter(sql => /from\s+[`"]?validators[`"]?(?:\s|$)/i.test(sql))
    const activityReads = tracedStatements.filter(sql => /from\s+[`"]?activity[`"]?(?:\s|$)/i.test(sql))
    const scoreInserts = tracedStatements.filter(sql => /insert\s+into\s+[`"]?scores[`"]?(?:\s|\()/i.test(sql))
    expect(validatorReads.length).toBeLessThanOrEqual(1)
    expect(activityReads.length).toBeLessThanOrEqual(2)
    expect(scoreInserts.length).toBeLessThanOrEqual(Math.ceil(validators.length / 5))
    expect(tracedStatements.length).toBeLessThan(200)
    expect(await harness.db.select().from(schema.scores).all()).toHaveLength(validators.length)
  }, 60_000)

  it('keeps current v1 numeric semantics for complete marker-backed activity', async () => {
    const range = createRange(1, 2)
    const [perfectValidator, intermittentValidator] = await insertValidators(2, 'semantic-score-validator')
    mocks.getRange.mockResolvedValue([true, undefined, range])
    await harness.db.insert(schema.activityEpochs).values([
      finalizedMarker(1, 2),
      finalizedMarker(2, 2),
    ]).execute()
    await harness.db.insert(schema.activity).values([
      activityRow(perfectValidator!.id, 1),
      activityRow(perfectValidator!.id, 2),
      activityRow(intermittentValidator!.id, 1),
      activityRow(intermittentValidator!.id, 2, 0, 0),
    ]).execute()

    const result = await scores.upsertScoresSnapshotEpoch()

    expect(result[0]).toBe(true)
    const calculated = result[2]!.scores.sort((a, b) => a.validatorId - b.validatorId)
    expect(calculated[0]).toMatchObject({
      validatorId: perfectValidator!.id,
      epochNumber: 2,
      scoreVersion: 1,
    })
    expect(calculated[0]!.availability).toBeCloseTo(1, 12)
    expect(calculated[0]!.dominance).toBeCloseTo(1, 12)
    expect(calculated[0]!.reliability).toBeCloseTo(1, 12)
    expect(calculated[0]!.total).toBeCloseTo(1, 12)
    expect(calculated[1]).toMatchObject({
      validatorId: intermittentValidator!.id,
      epochNumber: 2,
      scoreVersion: 1,
    })
    expect(calculated[1]!.dominance).toBeCloseTo(1, 12)
    expect(calculated[1]!.reliability).toBeCloseTo(1, 12)
    expect(calculated[1]!.availability).toBeCloseTo(40 / 49, 12)
    expect(calculated[1]!.total).toBeCloseTo(40 / 49, 12)
    expect(calculated[1]!.params.availability.activeEpochStates).toEqual([1, 0])
    expect(Array.from(calculated[1]!.params.reliability.inherentsPerEpoch.entries())).toEqual([
      [1, { rewarded: 720, missed: 0 }],
      [2, { rewarded: 0, missed: 0 }],
    ])
    const storedScores = await harness.db.select().from(schema.scores).orderBy(asc(schema.scores.validatorId)).all()
    expect(storedScores[0]).toMatchObject({ validatorId: perfectValidator!.id })
    expect(storedScores[0]!.total).toBeCloseTo(1, 12)
    expect(storedScores[1]).toMatchObject({ validatorId: intermittentValidator!.id })
    expect(storedScores[1]!.total).toBeCloseTo(40 / 49, 12)
  })
})

describe('score v2 rollout persistence', () => {
  it('backfills finalized history without historical v1 scores', async () => {
    const [validator] = await insertValidators(1, 'fresh-history-validator')
    const range = createRange(1, 5)
    runtimeConfigState.scoreV2Mode = 'active'
    mocks.getRange.mockResolvedValue([true, undefined, range])
    await insertFinalizedRange(1, 5)
    await harness.db.insert(schema.activity).values(
      [1, 2, 3, 4, 5].map(epoch => activityRow(validator!.id, epoch)),
    ).execute()

    const first = await scores.upsertScoresSnapshotEpoch()
    expect(first[0]).toBe(true)
    expect(first[2]!.backfilledEpochs).toEqual([4, 3])
    expect((await scores.upsertScoresSnapshotEpoch())[2]!.backfilledEpochs).toEqual([2, 1])
    expect((await scores.upsertScoresSnapshotEpoch())[2]!.backfilledEpochs).toEqual([])

    const stored = await harness.db.select().from(schema.scores).orderBy(asc(schema.scores.epochNumber)).all()
    expect(stored.filter(row => row.scoreVersion === 1).map(row => row.epochNumber)).toEqual([5])
    expect(stored.filter(row => row.scoreVersion === 2).map(row => row.epochNumber)).toEqual([1, 2, 3, 4, 5])
  })

  it('plans missing historical coverage before bootstrapping v2 without v1 history', async () => {
    const [validator] = await insertValidators(1, 'fresh-coverage-validator')
    const range = createRange(4, 6)
    runtimeConfigState.scoreV2Mode = 'active'
    mocks.getRange.mockResolvedValue([true, undefined, range])
    await insertFinalizedRange(4, 6)
    await harness.db.insert(schema.activity).values(
      [4, 5, 6].map(epoch => activityRow(validator!.id, epoch)),
    ).execute()

    expect(await scores.getOldestV2BackfillEpoch(range)).toBe(4)
    expect((await scores.upsertScoresSnapshotEpoch())[2]!.backfilledEpochs).toEqual([])
    await insertFinalizedRange(2, 3)
    await harness.db.insert(schema.activity).values(
      [2, 3].map(epoch => activityRow(validator!.id, epoch)),
    ).execute()

    expect((await scores.upsertScoresSnapshotEpoch())[2]!.backfilledEpochs).toEqual([5, 4])
    expect(await scores.getOldestV2BackfillEpoch(range)).toBeNull()
  })

  it('does not infer offline across an unfinalized historical epoch', async () => {
    const range = createRange(1, 30)
    const [validator] = await insertValidators(1, 'unfinalized-gap-validator')
    runtimeConfigState.scoreV2Mode = 'shadow'
    mocks.getRange.mockResolvedValue([true, undefined, range])
    await insertFinalizedRange(1, 30)
    await harness.db.delete(schema.activityEpochs).where(eq(schema.activityEpochs.epochNumber, 2)).execute()
    await harness.db.insert(schema.activity).values([
      activityRow(validator!.id, 1, 720, 0, { dominanceRatioViaBalance: 0.01, dominanceRatioViaSlots: 0.01 }),
      ...Array.from({ length: 27 }, (_, index) => activityRow(validator!.id, index + 4, 720, 0, {
        dominanceRatioViaBalance: 0.01,
        dominanceRatioViaSlots: 0.01,
      })),
    ]).execute()
    await harness.db.insert(schema.scores).values({
      validatorId: validator!.id,
      epochNumber: 29,
      scoreVersion: 2,
      total: 0.8,
      availability: 0.8,
      recentAvailability: 1,
      longTermAvailability: 0.6,
      dominance: 1,
      reliability: 1,
      longTermCoverage: 1,
      longTermAsOfEpoch: 1,
    }).execute()

    expect((await scores.upsertScoresSnapshotEpoch())[0]).toBe(true)
    const stored = await harness.db.select().from(schema.scores).where(and(
      eq(schema.scores.validatorId, validator!.id),
      eq(schema.scores.epochNumber, 30),
      eq(schema.scores.scoreVersion, 2),
    )).get()
    expect(stored!.recentAvailability).toBe(1)
  })

  it('refreshes retained historical v2 scores after their marker coverage becomes complete', async () => {
    const [validator] = await insertValidators(1, 'retained-backfill-validator')
    runtimeConfigState.scoreV2Mode = 'shadow'
    mocks.getRange.mockResolvedValue([true, undefined, createRange(1, 30)])
    await insertFinalizedRange(1, 30)
    await harness.db.delete(schema.activityEpochs).where(eq(schema.activityEpochs.epochNumber, 2)).execute()
    await harness.db.insert(schema.activity).values([
      activityRow(validator!.id, 1),
      ...Array.from({ length: 28 }, (_, index) => activityRow(validator!.id, index + 3)),
    ]).execute()
    await harness.db.insert(schema.scores).values({
      validatorId: validator!.id,
      epochNumber: 1,
      scoreVersion: 2,
      total: 0.8,
      availability: 0.8,
      recentAvailability: 1,
      longTermAvailability: 0.6,
      dominance: 1,
      reliability: 1,
      longTermCoverage: 1,
      longTermAsOfEpoch: 1,
    }).execute()

    expect((await scores.upsertScoresSnapshotEpoch())[0]).toBe(true)
    expect(await harness.db.select().from(schema.scores).where(and(
      eq(schema.scores.validatorId, validator!.id),
      eq(schema.scores.epochNumber, 30),
      eq(schema.scores.scoreVersion, 2),
    )).get()).toMatchObject({ longTermAvailability: 0.6, longTermCoverage: 29 / 30, longTermAsOfEpoch: 1 })

    await harness.db.insert(schema.activityEpochs).values(finalizedMarker(31, 1)).execute()
    await harness.db.insert(schema.activity).values(activityRow(validator!.id, 31)).execute()
    mocks.getRange.mockResolvedValue([true, undefined, createRange(1, 31)])

    const incomplete = await scores.upsertScoresSnapshotEpoch()
    expect(incomplete[0]).toBe(true)
    expect(incomplete[2]!.backfilledEpochs).not.toContain(30)
    expect(await harness.db.select().from(schema.scores).where(and(
      eq(schema.scores.validatorId, validator!.id),
      eq(schema.scores.epochNumber, 30),
      eq(schema.scores.scoreVersion, 2),
    )).get()).toMatchObject({ longTermAvailability: 0.6, longTermCoverage: 29 / 30, longTermAsOfEpoch: 1 })

    await harness.db.insert(schema.activityEpochs).values(finalizedMarker(2, 0)).execute()
    await harness.db.insert(schema.activityEpochs).values(finalizedMarker(32, 1)).execute()
    await harness.db.insert(schema.activity).values(activityRow(validator!.id, 32)).execute()
    mocks.getRange.mockResolvedValue([true, undefined, createRange(1, 32)])

    expect(await scores.getOldestV2BackfillEpoch()).toBe(30)
    const refreshedEpochs: number[] = []
    // New activity-only targets share the bounded cursor; allow one full scan before retrying epoch 30.
    for (let attempt = 0; attempt < 16; attempt++) {
      const next = await scores.upsertScoresSnapshotEpoch()
      expect(next[0]).toBe(true)
      refreshedEpochs.push(...next[2]!.backfilledEpochs)
    }
    expect(refreshedEpochs).toContain(30)
    expect(await harness.db.select().from(schema.scores).where(and(
      eq(schema.scores.validatorId, validator!.id),
      eq(schema.scores.epochNumber, 30),
      eq(schema.scores.scoreVersion, 2),
    )).get()).toMatchObject({ longTermAvailability: 1, longTermCoverage: 1, longTermAsOfEpoch: 30 })
  })

  it('counts an offline gap that starts before the recent window', async () => {
    const range = createRange(1, 100)
    const [validator] = await insertValidators(1, 'window-crossing-offline-validator')
    runtimeConfigState.scoreV2Mode = 'shadow'
    mocks.getRange.mockResolvedValue([true, undefined, range])
    await insertFinalizedRange(1, 100)
    await harness.db.insert(schema.activity).values([
      activityRow(validator!.id, 40, 720, 0, { dominanceRatioViaBalance: 0.1, dominanceRatioViaSlots: 0.1 }),
      activityRow(validator!.id, 100, 720, 0, { dominanceRatioViaBalance: 0.1, dominanceRatioViaSlots: 0.1 }),
    ]).execute()

    expect((await scores.upsertScoresSnapshotEpoch())[0]).toBe(true)
    const stored = await harness.db.select().from(schema.scores).where(and(
      eq(schema.scores.validatorId, validator!.id),
      eq(schema.scores.scoreVersion, 2),
      eq(schema.scores.epochNumber, 100),
    )).get()
    expect(stored!.recentAvailability).toBeCloseTo(1 / 28, 12)
  })

  it('keeps inferring offline after the last election before the recent window', async () => {
    const range = createRange(1, 100)
    const [validator] = await insertValidators(1, 'ongoing-offline-validator')
    runtimeConfigState.scoreV2Mode = 'shadow'
    mocks.getRange.mockResolvedValue([true, undefined, range])
    await insertFinalizedRange(1, 100)
    await harness.db.insert(schema.activity).values(activityRow(validator!.id, 40, 720, 0, {
      dominanceRatioViaBalance: 0.1,
      dominanceRatioViaSlots: 0.1,
    })).execute()

    expect((await scores.upsertScoresSnapshotEpoch())[0]).toBe(true)
    const stored = await harness.db.select().from(schema.scores).where(eq(schema.scores.scoreVersion, 2)).get()
    expect(stored!.recentAvailability).toBe(0)
  })

  it('moves backfill past never-elected validators within two runs', async () => {
    const [active, neverElected] = await insertValidators(2, 'progress-backfill-validator')
    runtimeConfigState.scoreV2Mode = 'shadow'
    mocks.getRange.mockResolvedValue([true, undefined, createRange(1, 100)])
    await insertFinalizedRange(1, 100)
    await harness.db.insert(schema.activity).values(Array.from(
      { length: 100 },
      (_, index) => activityRow(active!.id, index + 1),
    )).execute()
    await harness.db.insert(schema.scores).values([97, 98, 99].flatMap(epochNumber => [active!, neverElected!].map(validator => ({
      validatorId: validator.id,
      epochNumber,
      scoreVersion: 1 as const,
      total: 1,
      availability: 1,
      dominance: 1,
      reliability: 1,
    })))).execute()

    expect((await scores.upsertScoresSnapshotEpoch())[0]).toBe(true)
    expect((await scores.upsertScoresSnapshotEpoch())[0]).toBe(true)

    const rows = await harness.db.select().from(schema.scores).where(and(
      eq(schema.scores.validatorId, active!.id),
      eq(schema.scores.scoreVersion, 2),
    )).all()
    expect(rows.map(row => row.epochNumber)).toEqual(expect.arrayContaining([97, 98, 99, 100]))
  })

  it('retries a skipped backfill epoch after marker coverage is repaired', async () => {
    const [active, neverElected] = await insertValidators(2, 'retry-backfill-validator')
    runtimeConfigState.scoreV2Mode = 'shadow'
    mocks.getRange.mockResolvedValue([true, undefined, createRange(1, 100)])
    await insertFinalizedRange(1, 100)
    await harness.db.delete(schema.activityEpochs).where(eq(schema.activityEpochs.epochNumber, 50)).execute()
    await harness.db.insert(schema.activity).values(Array.from(
      { length: 100 },
      (_, index) => activityRow(active!.id, index + 1),
    )).execute()
    await harness.db.insert(schema.scores).values([97, 98, 99].flatMap(epochNumber => [active!, neverElected!].map(validator => ({
      validatorId: validator.id,
      epochNumber,
      scoreVersion: 1 as const,
      total: 1,
      availability: 1,
      dominance: 1,
      reliability: 1,
    })))).execute()

    const first = await scores.upsertScoresSnapshotEpoch()
    expect(first[2]!.backfilledEpochs).toEqual([])
    await harness.db.insert(schema.activityEpochs).values(finalizedMarker(50, 1)).execute()
    for (let attempt = 0; attempt < 3; attempt++)
      expect((await scores.upsertScoresSnapshotEpoch())[0]).toBe(true)

    const rows = await harness.db.select().from(schema.scores).where(and(
      eq(schema.scores.validatorId, active!.id),
      eq(schema.scores.scoreVersion, 2),
    )).all()
    expect(rows.some(row => row.epochNumber === 97)).toBe(true)
  })

  it('backfills v1 epochs older than the live score range', async () => {
    const [validator] = await insertValidators(1, 'historical-bootstrap-validator')
    runtimeConfigState.scoreV2Mode = 'shadow'
    mocks.getRange.mockResolvedValue([true, undefined, createRange(90, 100)])
    await insertFinalizedRange(40, 100)
    await harness.db.insert(schema.activity).values([
      activityRow(validator!.id, 50),
      activityRow(validator!.id, 100),
    ]).execute()
    await harness.db.insert(schema.scores).values({
      validatorId: validator!.id,
      epochNumber: 50,
      scoreVersion: 1,
      total: 1,
      availability: 1,
      dominance: 1,
      reliability: 1,
    }).execute()

    expect(await scores.getOldestV2BackfillEpoch()).toBe(50)
    // Ten newer activity-only epochs precede the legacy target in the bounded scan.
    for (let attempt = 0; attempt < 6; attempt++)
      expect((await scores.upsertScoresSnapshotEpoch())[0]).toBe(true)
    expect(await harness.db.select().from(schema.scores).where(and(
      eq(schema.scores.validatorId, validator!.id),
      eq(schema.scores.epochNumber, 50),
      eq(schema.scores.scoreVersion, 2),
    )).get()).toBeDefined()
    expect(await scores.getOldestV2BackfillEpoch()).toBeNull()
  })

  it('penalizes improbable high-stake non-election only in score v2', async () => {
    const range = createRange(10, 12)
    const [validator] = await insertValidators(1, 'offline-inference-validator')
    runtimeConfigState.scoreV2Mode = 'shadow'
    mocks.getRange.mockResolvedValue([true, undefined, range])
    await harness.db.insert(schema.activityEpochs).values([
      finalizedMarker(10, 1),
      finalizedMarker(11, 0),
      finalizedMarker(12, 1),
    ]).execute()
    await harness.db.insert(schema.activity).values([
      activityRow(validator!.id, 10, 720, 0, {
        dominanceRatioViaBalance: -1,
        dominanceRatioViaSlots: 0.064,
      }),
      activityRow(validator!.id, 12, 720, 0, {
        dominanceRatioViaBalance: -1,
        dominanceRatioViaSlots: 0.064,
      }),
    ]).execute()

    const result = await scores.upsertScoresSnapshotEpoch()
    expect(result[0]).toBe(true)

    const stored = await harness.db.select()
      .from(schema.scores)
      .where(and(
        eq(schema.scores.validatorId, validator!.id),
        eq(schema.scores.epochNumber, 12),
      ))
      .orderBy(asc(schema.scores.scoreVersion))
      .all()
    expect(stored).toHaveLength(2)
    expect(stored[0]!.availability).toBe(1)
    expect(stored[1]!.recentAvailability).toBeCloseTo(2 / 3, 12)
  })

  it('writes coexisting v1 and v2 rows in shadow mode and reruns idempotently', async () => {
    const range = createRange(10, 11)
    const [validator] = await insertValidators(1, 'shadow-score-validator')
    runtimeConfigState.scoreV2Mode = 'shadow'
    mocks.getRange.mockResolvedValue([true, undefined, range])
    await insertFinalizedRange(10, 11)
    await harness.db.insert(schema.activity).values([
      activityRow(validator!.id, 10),
      activityRow(validator!.id, 11),
    ]).execute()

    expect((await scores.upsertScoresSnapshotEpoch())[0]).toBe(true)
    expect((await scores.upsertScoresSnapshotEpoch())[0]).toBe(true)

    const stored = await harness.db.select()
      .from(schema.scores)
      .where(eq(schema.scores.epochNumber, 11))
      .orderBy(asc(schema.scores.scoreVersion))
      .all()
    expect(stored).toHaveLength(2)
    expect(stored.map(score => score.scoreVersion)).toEqual([1, 2])
    expect(stored[1]).toMatchObject({
      validatorId: validator!.id,
      epochNumber: 11,
      scoreVersion: 2,
      dataStatus: 'complete',
      recentAvailability: 1,
      longTermAvailability: 1,
      longTermCoverage: 1,
      longTermAsOfEpoch: 11,
    })
  })

  it('writes only v1 while score v2 mode is off', async () => {
    const range = createRange(20, 20)
    const [validator] = await insertValidators(1, 'off-score-validator')
    runtimeConfigState.scoreV2Mode = 'off'
    mocks.getRange.mockResolvedValue([true, undefined, range])
    await insertFinalizedRange(20, 20)
    await harness.db.insert(schema.activity).values(activityRow(validator!.id, 20)).execute()

    expect((await scores.upsertScoresSnapshotEpoch())[0]).toBe(true)

    const stored = await harness.db.select().from(schema.scores).all()
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({
      validatorId: validator!.id,
      epochNumber: 20,
      scoreVersion: 1,
    })
  })

  it('retains trustworthy long-term state when recent coverage is complete but long-term coverage is partial', async () => {
    const range = createRange(1, 40)
    const [validator] = await insertValidators(1, 'retained-score-validator')
    runtimeConfigState.scoreV2Mode = 'shadow'
    mocks.getRange.mockResolvedValue([true, undefined, range])
    await insertFinalizedRange(12, 40)
    await harness.db.insert(schema.activity).values(
      Array.from(
        { length: 29 },
        (_, index) => activityRow(validator!.id, 12 + index),
      ),
    ).execute()
    await harness.db.insert(schema.scores).values({
      validatorId: validator!.id,
      epochNumber: 39,
      scoreVersion: 2,
      total: 0.7,
      availability: 0.85,
      recentAvailability: 0.9,
      longTermAvailability: 0.8,
      dominance: 1,
      reliability: 0.9,
      dataStatus: 'complete',
      longTermCoverage: 1,
      longTermAsOfEpoch: 11,
    }).execute()

    expect((await scores.upsertScoresSnapshotEpoch())[0]).toBe(true)

    const stored = await harness.db.select().from(schema.scores).where(and(
      eq(schema.scores.validatorId, validator!.id),
      eq(schema.scores.epochNumber, 40),
      eq(schema.scores.scoreVersion, 2),
    )).get()
    expect(stored).toMatchObject({
      recentAvailability: 1,
      longTermAvailability: 0.8,
      reliability: 0.9,
      longTermAsOfEpoch: 11,
      dataStatus: 'complete',
    })
    expect(stored!.longTermCoverage).toBeCloseTo(29 / 40, 12)
    expect(stored!.availability).toBeCloseTo(0.9, 12)
    expect(stored!.total).toBeCloseTo(0.81, 12)
  })

  it('ignores positive dominance from an unfinalized epoch when retaining long-term state', async () => {
    const range = createRange(1, 40)
    const [validator] = await insertValidators(1, 'finalized-dominance-validator')
    runtimeConfigState.scoreV2Mode = 'shadow'
    mocks.getRange.mockResolvedValue([true, undefined, range])
    await insertFinalizedRange(12, 40)
    await harness.db.insert(schema.activityEpochs).values({
      epochNumber: 11,
      status: 'syncing',
      attemptCount: 1,
      startedAt: '2026-07-28T08:00:00.000Z',
    }).execute()
    await harness.db.insert(schema.activity).values([
      activityRow(validator!.id, 11, 720, 0, {
        dominanceRatioViaBalance: 1,
        dominanceRatioViaSlots: 1,
      }),
      ...Array.from(
        { length: 29 },
        (_, index) => activityRow(validator!.id, 12 + index, 720, 0, {
          dominanceRatioViaBalance: -1,
          dominanceRatioViaSlots: -1,
        }),
      ),
    ]).execute()
    await harness.db.insert(schema.scores).values({
      validatorId: validator!.id,
      epochNumber: 39,
      scoreVersion: 2,
      total: 0.7,
      availability: 0.85,
      recentAvailability: 0.9,
      longTermAvailability: 0.8,
      dominance: 1,
      reliability: 0.9,
      dataStatus: 'complete',
      longTermCoverage: 1,
      longTermAsOfEpoch: 10,
    }).execute()

    expect((await scores.upsertScoresSnapshotEpoch())[0]).toBe(true)

    const stored = await harness.db.select().from(schema.scores).where(and(
      eq(schema.scores.validatorId, validator!.id),
      eq(schema.scores.epochNumber, 40),
      eq(schema.scores.scoreVersion, 2),
    )).get()
    expect(stored).toMatchObject({
      dominance: 1,
      recentAvailability: 1,
      longTermAvailability: 0.8,
      reliability: 0.9,
      longTermAsOfEpoch: 10,
    })
    expect(stored!.total).toBeCloseTo(0.81, 12)
  })

  it('publishes no current v2 row when long-term coverage is partial and no prior v2 state exists', async () => {
    const range = createRange(1, 40)
    const [validator] = await insertValidators(1, 'no-prior-score-validator')
    runtimeConfigState.scoreV2Mode = 'shadow'
    mocks.getRange.mockResolvedValue([true, undefined, range])
    await insertFinalizedRange(12, 40)
    await harness.db.insert(schema.activity).values(
      Array.from(
        { length: 29 },
        (_, index) => activityRow(validator!.id, 12 + index),
      ),
    ).execute()

    expect((await scores.upsertScoresSnapshotEpoch())[0]).toBe(true)

    const stored = await harness.db.select().from(schema.scores).where(and(
      eq(schema.scores.validatorId, validator!.id),
      eq(schema.scores.epochNumber, 40),
    )).all()
    expect(stored).toHaveLength(1)
    expect(stored[0]!.scoreVersion).toBe(1)
  })

  it('backfills validators missing v2 inside a partially populated historical score epoch', async () => {
    const range = createRange(40, 42)
    const [validatorA, validatorB] = await insertValidators(2, 'partial-backfill-validator')
    runtimeConfigState.scoreV2Mode = 'shadow'
    mocks.getRange.mockResolvedValue([true, undefined, range])
    await insertFinalizedRange(39, 42, 2)
    await harness.db.insert(schema.activity).values(
      [39, 40, 41, 42].flatMap(epochNumber => [
        activityRow(validatorA!.id, epochNumber),
        activityRow(validatorB!.id, epochNumber),
      ]),
    ).execute()
    await harness.db.insert(schema.scores).values([
      {
        validatorId: validatorA!.id,
        epochNumber: 41,
        scoreVersion: 1,
        total: 1,
        availability: 1,
        dominance: 1,
        reliability: 1,
      },
      {
        validatorId: validatorB!.id,
        epochNumber: 41,
        scoreVersion: 1,
        total: 1,
        availability: 1,
        dominance: 1,
        reliability: 1,
      },
      {
        validatorId: validatorA!.id,
        epochNumber: 41,
        scoreVersion: 2,
        total: 0.7,
        availability: 0.8,
        recentAvailability: 0.8,
        longTermAvailability: 0.8,
        dominance: 1,
        reliability: 0.875,
        longTermCoverage: 1,
        longTermAsOfEpoch: 41,
      },
    ]).execute()

    const progress: string[] = []
    const [success, error, result] = await scores.upsertScoresSnapshotEpoch({
      onProgress: message => progress.push(message),
    })

    expect(success).toBe(true)
    expect(error).toBeUndefined()
    expect(result!.backfilledEpochs).toEqual([41])
    expect(progress).toEqual(expect.arrayContaining([
      'range 40-42; v2 mode shadow',
      'loaded 2 validator(s), 6 activity row(s)',
      'calculating current v1 for 2 validator(s) at epoch 42',
      'stored current v1 rows 2/2',
      'calculating current v2 for 2 validator(s) at epoch 42',
      'stored current v2 rows 2/2',
      'backfill found 2 candidate epoch(s)',
      'backfill epoch 41 (1/2): checking coverage',
      'backfill epoch 41 (1/2): calculating 1 validator(s)',
      'backfill epoch 41 (1/2): prepared 1 score(s)',
      'stored v2 backfill rows 1/1',
    ]))
    const historicalV2 = await harness.db.select().from(schema.scores).where(and(
      eq(schema.scores.epochNumber, 41),
      eq(schema.scores.scoreVersion, 2),
    )).orderBy(asc(schema.scores.validatorId)).all()
    expect(historicalV2.map(score => score.validatorId)).toEqual([
      validatorA!.id,
      validatorB!.id,
    ])
  })

  it('fails without score writes when a finalized epoch contains a placeholder', async () => {
    const range = createRange(50, 50)
    const [validator] = await insertValidators(1, 'placeholder-score-validator')
    runtimeConfigState.scoreV2Mode = 'shadow'
    mocks.getRange.mockResolvedValue([true, undefined, range])
    await insertFinalizedRange(50, 50)
    await harness.db.insert(schema.activity).values(
      activityRow(validator!.id, 50, -1, -1),
    ).execute()

    const [success, error] = await scores.upsertScoresSnapshotEpoch()

    expect(success).toBe(false)
    expect(error).toMatch(/placeholder|integrity/i)
    expect(await harness.db.select().from(schema.scores).all()).toEqual([])
  })

  it('rejects a finalized placeholder before writing v1 while score v2 mode is off', async () => {
    const range = createRange(51, 51)
    const [validator] = await insertValidators(1, 'off-placeholder-score-validator')
    runtimeConfigState.scoreV2Mode = 'off'
    mocks.getRange.mockResolvedValue([true, undefined, range])
    await insertFinalizedRange(51, 51)
    await harness.db.insert(schema.activity).values(
      activityRow(validator!.id, 51, -1, -1),
    ).execute()

    const [success, error] = await scores.upsertScoresSnapshotEpoch()

    expect(success).toBe(false)
    expect(error).toMatch(/placeholder|integrity/i)
    expect(await harness.db.select().from(schema.scores).all()).toEqual([])
  })

  it('persists current v1 before reporting a non-integrity retained v2 calculation failure', async () => {
    const range = createRange(1, 40)
    const [validator] = await insertValidators(1, 'failed-v2-score-validator')
    runtimeConfigState.scoreV2Mode = 'shadow'
    mocks.getRange.mockResolvedValue([true, undefined, range])
    await insertFinalizedRange(12, 40)
    await harness.db.insert(schema.activity).values(
      Array.from(
        { length: 29 },
        (_, index) => activityRow(validator!.id, 12 + index),
      ),
    ).execute()
    await harness.db.insert(schema.scores).values({
      validatorId: validator!.id,
      epochNumber: 39,
      scoreVersion: 2,
      total: 0.7,
      availability: 0.85,
      recentAvailability: 0.9,
      longTermAvailability: 2,
      dominance: 1,
      reliability: 0.9,
      dataStatus: 'complete',
      longTermCoverage: 1,
      longTermAsOfEpoch: 39,
    }).execute()

    const [success, error] = await scores.upsertScoresSnapshotEpoch()

    expect(success).toBe(false)
    expect(error).toMatch(/long-term availability|retained/i)
    expect(await harness.db.select().from(schema.scores).where(and(
      eq(schema.scores.validatorId, validator!.id),
      eq(schema.scores.epochNumber, 40),
      eq(schema.scores.scoreVersion, 1),
    )).get()).toMatchObject({
      validatorId: validator!.id,
      epochNumber: 40,
      scoreVersion: 1,
    })
    expect(await harness.db.select().from(schema.scores).where(and(
      eq(schema.scores.validatorId, validator!.id),
      eq(schema.scores.epochNumber, 40),
      eq(schema.scores.scoreVersion, 2),
    )).get()).toBeUndefined()
  })

  it('returns the latest score epoch for the requested version only', async () => {
    const [validator] = await insertValidators(1, 'latest-version-score-validator')
    await harness.db.insert(schema.scores).values([
      {
        validatorId: validator!.id,
        epochNumber: 100,
        scoreVersion: 1,
        total: 1,
        availability: 1,
        dominance: 1,
        reliability: 1,
      },
      {
        validatorId: validator!.id,
        epochNumber: 80,
        scoreVersion: 2,
        total: 1,
        availability: 1,
        recentAvailability: 1,
        longTermAvailability: 1,
        dominance: 1,
        reliability: 1,
        longTermCoverage: 1,
        longTermAsOfEpoch: 80,
      },
    ]).execute()

    await expect(scores.getLatestScoreEpoch(1)).resolves.toBe(100)
    await expect(scores.getLatestScoreEpoch(2)).resolves.toBe(80)
  })
})
