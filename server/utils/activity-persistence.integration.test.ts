import type { EpochActivity, Range } from 'nimiq-validator-trustscore/types'
import type { TestDbHarness } from '../test/db-harness'
import { and, asc, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../db/schema'
import { createTestDbHarness } from '../test/db-harness'

const ADDRESS_A = 'NQ02 31N6 3KM5 T6G5 22TN EPF5 5XPY RLHK RMB3'
const ADDRESS_B = 'NQ29 FBVT B4GM S27H UBP4 1MTC GNKQ VPBT 099M'
const ADDRESS_C = 'NQ40 FC4D HAT6 9N1H P52H P4FX QL8P CE6Y 10VT'
const ADDRESS_D = 'NQ11 1111 1111 1111 1111 1111 1111 1111 1111'
const ADDRESS_SHARED = 'NQ22 2222 2222 2222 2222 2222 2222 2222 2222'
const STARTED_AT = '2026-07-28T08:00:00.000Z'
const FINALIZED_AT = '2026-07-28T08:05:00.000Z'

const drizzleState = vi.hoisted(() => ({ db: undefined as unknown }))
const fetcherMocks = vi.hoisted(() => ({
  fetchSnapshotEpoch: vi.fn(),
}))
const logoBarrierState = vi.hoisted(() => ({
  address: undefined as string | undefined,
  expectedArrivals: 0,
  arrivals: 0,
  gate: undefined as Promise<void> | undefined,
  release: undefined as (() => void) | undefined,
  firstArrival: undefined as Promise<void> | undefined,
  signalFirstArrival: undefined as (() => void) | undefined,
  allArrived: undefined as Promise<void> | undefined,
  signalAllArrived: undefined as (() => void) | undefined,
}))

vi.mock('./drizzle', async () => {
  const [tables, drizzleOrm] = await Promise.all([
    import('../db/schema'),
    import('drizzle-orm'),
  ])

  return {
    ...drizzleOrm,
    tables,
    useDrizzle: () => drizzleState.db,
  }
})

vi.mock('./logo', () => ({
  handleValidatorLogo: async (address: string) => {
    if (address === logoBarrierState.address && logoBarrierState.gate) {
      logoBarrierState.arrivals++
      logoBarrierState.signalFirstArrival?.()
      if (logoBarrierState.arrivals >= logoBarrierState.expectedArrivals)
        logoBarrierState.signalAllArrived?.()
      await logoBarrierState.gate
    }
    return {
      logo: 'test-logo',
      hasDefaultLogo: true,
      accentColor: '#000000',
    }
  },
}))

vi.mock('../../packages/nimiq-validator-trustscore/src/fetcher', () => ({
  fetchSnapshotEpoch: fetcherMocks.fetchSnapshotEpoch,
}))

vi.stubGlobal('tables', schema)
vi.stubGlobal('useDrizzle', () => drizzleState.db)
vi.stubGlobal('defineCachedFunction', (fn: unknown) => fn)
vi.stubGlobal('createError', (message: unknown) => new Error(String(message)))
vi.stubGlobal('useSafeRuntimeConfig', () => ({ public: { nimiqNetwork: 'testnet' } }))

type ActivityEpochModule = typeof import('./activity-epochs')
type ActivitiesModule = typeof import('./activities')
type ValidatorsModule = typeof import('./validators')

let activityEpochs: ActivityEpochModule
let activities: ActivitiesModule
let validators: ValidatorsModule
let harness: TestDbHarness

beforeEach(async () => {
  harness = await createTestDbHarness()
  drizzleState.db = harness.db
  fetcherMocks.fetchSnapshotEpoch.mockReset()
  logoBarrierState.address = undefined
  logoBarrierState.expectedArrivals = 0
  logoBarrierState.arrivals = 0
  logoBarrierState.gate = undefined
  logoBarrierState.release = undefined
  logoBarrierState.firstArrival = undefined
  logoBarrierState.signalFirstArrival = undefined
  logoBarrierState.allArrived = undefined
  logoBarrierState.signalAllArrived = undefined
  vi.resetModules()
  activityEpochs = await import('./activity-epochs')
  activities = await import('./activities')
  validators = await import('./validators')
})

afterEach(() => {
  harness.close()
  drizzleState.db = undefined
})

afterAll(() => {
  vi.unstubAllGlobals()
})

async function insertValidator(address: string) {
  return harness.db.insert(schema.validators).values({
    address,
    name: 'Test validator',
    logo: 'test-logo',
    hasDefaultLogo: true,
    accentColor: '#000000',
  }).returning({ id: schema.validators.id }).get()
}

function createElectedActivity(address: string, likelihood: number, rewarded = 718): EpochActivity[string] {
  return {
    address,
    elected: true,
    likelihood,
    missed: 2,
    rewarded,
    dominanceRatioViaBalance: -1,
    dominanceRatioViaSlots: likelihood / 512,
    balance: -1,
    stakers: 0,
  }
}

async function prepareEpoch(epochNumber: number, validatorIds: Map<string, number>) {
  const activity: EpochActivity = {
    [ADDRESS_B]: createElectedActivity(ADDRESS_B, 11),
    [ADDRESS_A]: createElectedActivity(ADDRESS_A, 10),
  }

  return activityEpochs.prepareCompletedEpoch({
    epochNumber,
    electionSet: {
      epochIndex: epochNumber,
      electionBlockNumber: 123_456,
      validators: [
        { address: ADDRESS_A, numSlots: 10 },
        { address: ADDRESS_B, numSlots: 11 },
      ],
    },
    activity,
    validatorIds,
  })
}

function armLogoBarrier(address: string, expectedArrivals: number) {
  logoBarrierState.address = address
  logoBarrierState.expectedArrivals = expectedArrivals
  logoBarrierState.gate = new Promise<void>((resolve) => {
    logoBarrierState.release = resolve
  })
  logoBarrierState.firstArrival = new Promise<void>((resolve) => {
    logoBarrierState.signalFirstArrival = resolve
  })
  logoBarrierState.allArrived = new Promise<void>((resolve) => {
    logoBarrierState.signalAllArrived = resolve
  })
}

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

describe('activity epoch attempt markers', () => {
  it('records failed attempts and clears failure state when a new attempt begins', async () => {
    await activityEpochs.beginActivityEpochAttempt(77, STARTED_AT)
    await activityEpochs.markActivityEpochFailed(77, new Error('RPC batch exploded'))

    expect(await harness.db.select().from(schema.activityEpochs).where(eq(schema.activityEpochs.epochNumber, 77)).get())
      .toMatchObject({
        epochNumber: 77,
        status: 'failed',
        attemptCount: 1,
        startedAt: STARTED_AT,
        finalizedAt: null,
        lastError: expect.stringContaining('RPC batch exploded'),
      })

    const retryStartedAt = '2026-07-28T14:00:00.000Z'
    await activityEpochs.beginActivityEpochAttempt(77, retryStartedAt)

    expect(await harness.db.select().from(schema.activityEpochs).where(eq(schema.activityEpochs.epochNumber, 77)).get())
      .toMatchObject({
        status: 'syncing',
        attemptCount: 2,
        startedAt: retryStartedAt,
        finalizedAt: null,
        lastError: null,
      })
  })

  it('does not let a stale attempt mark a newer syncing attempt failed', async () => {
    const epochNumber = 78
    const newerStartedAt = '2026-07-28T14:00:00.000Z'
    await activityEpochs.beginActivityEpochAttempt(epochNumber, STARTED_AT)
    await activityEpochs.beginActivityEpochAttempt(epochNumber, newerStartedAt)

    await activityEpochs.markActivityEpochFailed(epochNumber, new Error('late stale failure'), STARTED_AT)

    expect(await harness.db.select().from(schema.activityEpochs).where(eq(schema.activityEpochs.epochNumber, epochNumber)).get())
      .toMatchObject({
        status: 'syncing',
        attemptCount: 2,
        startedAt: newerStartedAt,
        finalizedAt: null,
        lastError: null,
      })
  })

  it('does not let a stale attempt finalize activity or overwrite a newer syncing attempt', async () => {
    const validatorA = await insertValidator(ADDRESS_A)
    const validatorB = await insertValidator(ADDRESS_B)
    const epochNumber = 79
    const newerStartedAt = '2026-07-28T14:00:00.000Z'
    const prepared = await prepareEpoch(epochNumber, new Map([
      [ADDRESS_A, validatorA.id],
      [ADDRESS_B, validatorB.id],
    ]))
    await activityEpochs.beginActivityEpochAttempt(epochNumber, STARTED_AT)
    await activityEpochs.beginActivityEpochAttempt(epochNumber, newerStartedAt)

    await expect(activityEpochs.persistCompletedEpoch(prepared, STARTED_AT, FINALIZED_AT))
      .rejects
      .toThrow(/attempt|ownership|stale/i)

    expect(await harness.db.select().from(schema.activity).where(eq(schema.activity.epochNumber, epochNumber)).all()).toEqual([])
    expect(await harness.db.select().from(schema.activityEpochs).where(eq(schema.activityEpochs.epochNumber, epochNumber)).get())
      .toMatchObject({
        status: 'syncing',
        attemptCount: 2,
        startedAt: newerStartedAt,
        expectedElectedCount: null,
        storedElectedCount: null,
        finalizedAt: null,
        lastError: null,
      })
  })

  it('does not let a delayed attempt reopen or invalidate an already finalized epoch', async () => {
    const validatorA = await insertValidator(ADDRESS_A)
    const validatorB = await insertValidator(ADDRESS_B)
    const epochNumber = 86
    const prepared = await prepareEpoch(epochNumber, new Map([
      [ADDRESS_A, validatorA.id],
      [ADDRESS_B, validatorB.id],
    ]))
    await activityEpochs.beginActivityEpochAttempt(epochNumber, STARTED_AT)
    await activityEpochs.persistCompletedEpoch(prepared, STARTED_AT, FINALIZED_AT)
    const finalizedActivity = await harness.db.select().from(schema.activity).where(eq(schema.activity.epochNumber, epochNumber)).orderBy(asc(schema.activity.validatorId)).all()

    const delayedStartedAt = '2026-07-28T16:00:00.000Z'
    await expect(activityEpochs.beginActivityEpochAttempt(epochNumber, delayedStartedAt)).resolves.toBe(false)
    await activityEpochs.markActivityEpochFailed(epochNumber, new Error('late worker failure'), delayedStartedAt)

    expect(await harness.db.select().from(schema.activityEpochs).where(eq(schema.activityEpochs.epochNumber, epochNumber)).get())
      .toMatchObject({
        status: 'finalized',
        attemptCount: 1,
        startedAt: STARTED_AT,
        finalizedAt: FINALIZED_AT,
        lastError: null,
      })
    expect(await harness.db.select().from(schema.activity).where(eq(schema.activity.epochNumber, epochNumber)).orderBy(asc(schema.activity.validatorId)).all()).toEqual(finalizedActivity)
  })
})

describe('strict validator resolution and cache behavior', () => {
  it('does not cache an undefined ID after a tolerated insert failure', async () => {
    await harness.execute(`
      CREATE TRIGGER fail_tolerant_validator_insert
      BEFORE INSERT ON validators
      WHEN NEW.address = '${ADDRESS_A}'
      BEGIN
        SELECT RAISE(ABORT, 'forced tolerant validator failure');
      END
    `)

    await expect(validators.storeValidator(ADDRESS_A)).resolves.toBeUndefined()
    await harness.execute('DROP TRIGGER fail_tolerant_validator_insert')

    const retriedId = await validators.storeValidator(ADDRESS_A)

    expect(retriedId).toEqual(expect.any(Number))
    expect(await harness.db.select({ address: schema.validators.address }).from(schema.validators).all())
      .toEqual([{ address: ADDRESS_A }])
  })

  it('throws on strict resolution failure without writing marker or activity state', async () => {
    await harness.execute(`
      CREATE TRIGGER fail_strict_validator_insert
      BEFORE INSERT ON validators
      WHEN NEW.address = '${ADDRESS_B}'
      BEGIN
        SELECT RAISE(ABORT, 'forced strict validator failure');
      END
    `)

    const strictError = await validators.storeValidatorStrict(ADDRESS_B).then(
      () => undefined,
      error => error,
    )

    expect(strictError).toBeInstanceOf(Error)
    expect(String(strictError)).toMatch(/validator|strict|database|sqlite|constraint|forced/i)
    expect(await harness.db.select().from(schema.validators).all()).toEqual([])
    expect(await harness.db.select().from(schema.activity).all()).toEqual([])
    expect(await harness.db.select().from(schema.activityEpochs).all()).toEqual([])

    await harness.execute('DROP TRIGGER fail_strict_validator_insert')
    await expect(validators.storeValidatorStrict(ADDRESS_B)).resolves.toEqual(expect.any(Number))
  })
})

describe('atomic completed epoch persistence', () => {
  it.each([
    ['expectedElectedCount', 0.5],
    ['expectedElectedCount', Number.NaN],
    ['expectedElectedCount', Number.POSITIVE_INFINITY],
    ['storedElectedCount', 0.5],
    ['storedElectedCount', Number.NaN],
    ['storedElectedCount', Number.POSITIVE_INFINITY],
  ] as const)('rejects an invalid finalized %s value: %s', async (counter, invalidCount) => {
    const validatorA = await insertValidator(ADDRESS_A)
    const validatorB = await insertValidator(ADDRESS_B)
    const prepared = await prepareEpoch(76, new Map([
      [ADDRESS_A, validatorA.id],
      [ADDRESS_B, validatorB.id],
    ]))
    const invalidPrepared = {
      ...prepared,
      [counter]: invalidCount,
    }

    await expect(activityEpochs.persistCompletedEpoch(invalidPrepared, STARTED_AT, FINALIZED_AT))
      .rejects
      .toThrow(/count|finite|integer/i)
    expect(await harness.db.select().from(schema.activity).all()).toEqual([])
    expect(await harness.db.select().from(schema.activityEpochs).all()).toEqual([])
  })

  it('rolls back every activity change and leaves no finalized marker when one batch statement fails', async () => {
    const validatorA = await insertValidator(ADDRESS_A)
    const validatorB = await insertValidator(ADDRESS_B)
    const validatorC = await insertValidator(ADDRESS_C)
    const epochNumber = 77

    await harness.db.insert(schema.activity).values([
      {
        validatorId: validatorA.id,
        epochNumber,
        likelihood: 10,
        rewarded: 1,
        missed: 9,
        dominanceRatioViaBalance: -1,
        dominanceRatioViaSlots: 10,
        balance: 100,
        stakers: 1,
      },
      {
        validatorId: validatorC.id,
        epochNumber,
        likelihood: 12,
        rewarded: -1,
        missed: -1,
        dominanceRatioViaBalance: -1,
        dominanceRatioViaSlots: 12,
        balance: 300,
        stakers: 3,
      },
    ]).execute()
    await activityEpochs.beginActivityEpochAttempt(epochNumber, STARTED_AT)
    const prepared = await prepareEpoch(epochNumber, new Map([
      [ADDRESS_A, validatorA.id],
      [ADDRESS_B, validatorB.id],
    ]))

    await harness.execute(`
      CREATE TRIGGER fail_second_activity_insert
      BEFORE INSERT ON activity
      WHEN NEW.validator_id = ${validatorB.id}
      BEGIN
        SELECT RAISE(ABORT, 'forced activity batch failure');
      END
    `)

    await expect(activityEpochs.persistCompletedEpoch(prepared, STARTED_AT, FINALIZED_AT))
      .rejects
      .toThrow(/forced activity batch failure/i)

    expect(await harness.db.select().from(schema.activity).where(eq(schema.activity.epochNumber, epochNumber)).orderBy(asc(schema.activity.validatorId)).all())
      .toEqual([
        expect.objectContaining({ validatorId: validatorA.id, rewarded: 1, missed: 9 }),
        expect.objectContaining({ validatorId: validatorC.id, likelihood: 12, rewarded: -1, missed: -1 }),
      ])
    expect(await harness.db.select().from(schema.activityEpochs).where(eq(schema.activityEpochs.epochNumber, epochNumber)).get())
      .toMatchObject({
        status: 'syncing',
        attemptCount: 1,
        expectedElectedCount: null,
        storedElectedCount: null,
        finalizedAt: null,
      })

    await activityEpochs.markActivityEpochFailed(epochNumber, new Error('forced activity batch failure'))
    expect(await harness.db.select().from(schema.activityEpochs).where(eq(schema.activityEpochs.epochNumber, epochNumber)).get())
      .toMatchObject({
        status: 'failed',
        attemptCount: 1,
        finalizedAt: null,
        lastError: expect.stringContaining('forced activity batch failure'),
      })
  })

  it('removes all stale rows once inside the batch before expected activity upserts', async () => {
    const validatorA = await insertValidator(ADDRESS_A)
    const validatorB = await insertValidator(ADDRESS_B)
    const validatorC = await insertValidator(ADDRESS_C)
    const validatorD = await insertValidator(ADDRESS_D)
    const epochNumber = 78

    await harness.db.insert(schema.activity).values([
      {
        validatorId: validatorC.id,
        epochNumber,
        likelihood: 12,
        rewarded: 700,
        missed: 20,
        dominanceRatioViaBalance: -1,
        dominanceRatioViaSlots: 12,
        balance: 300,
        stakers: 3,
      },
      {
        validatorId: validatorD.id,
        epochNumber,
        likelihood: -1,
        rewarded: -1,
        missed: -1,
        dominanceRatioViaBalance: -1,
        dominanceRatioViaSlots: -1,
        balance: 400,
        stakers: 4,
      },
    ]).execute()
    await harness.execute(`
      CREATE TRIGGER require_stale_cleanup_before_expected_upsert
      BEFORE INSERT ON activity
      WHEN NEW.validator_id = ${validatorA.id}
        AND EXISTS (
          SELECT 1 FROM activity
          WHERE epoch_number = ${epochNumber}
            AND validator_id IN (${validatorC.id}, ${validatorD.id})
        )
      BEGIN
        SELECT RAISE(ABORT, 'stale rows were not removed first');
      END
    `)
    const prepared = await prepareEpoch(epochNumber, new Map([
      [ADDRESS_A, validatorA.id],
      [ADDRESS_B, validatorB.id],
    ]))
    await activityEpochs.beginActivityEpochAttempt(epochNumber, STARTED_AT)
    harness.trace.reset()

    await activityEpochs.persistCompletedEpoch(prepared, STARTED_AT, FINALIZED_AT)

    const activityReadsBeforeBatch = harness.trace.executed.filter(sql => /from\s+[`"]?activity[`"]?(?:\s|$)/i.test(sql))
    expect(activityReadsBeforeBatch).toEqual([])
    expect(harness.trace.batches).toHaveLength(1)
    const batchStatements = harness.trace.batches[0]!
    const activityDeletes = batchStatements.filter(sql => /delete\s+from\s+[`"]?activity[`"]?(?:\s|$)/i.test(sql))
    expect(activityDeletes).toHaveLength(1)
    expect(batchStatements).toHaveLength(Math.ceil(prepared.activities.length / 5) + 3)
    const firstExpectedUpsertIndex = batchStatements.findIndex(sql => /insert\s+into\s+[`"]?activity[`"]?(?:\s|\()/i.test(sql))
    const cleanupIndex = batchStatements.findIndex(sql => /delete\s+from\s+[`"]?activity[`"]?(?:\s|$)/i.test(sql))
    expect(cleanupIndex).toBeGreaterThanOrEqual(0)
    expect(cleanupIndex).toBeLessThan(firstExpectedUpsertIndex)

    expect(await harness.db.select().from(schema.activity).where(eq(schema.activity.epochNumber, epochNumber)).orderBy(asc(schema.activity.validatorId)).all())
      .toEqual([
        expect.objectContaining({ validatorId: validatorA.id, likelihood: 10, rewarded: 718, missed: 2 }),
        expect.objectContaining({ validatorId: validatorB.id, likelihood: 11, rewarded: 718, missed: 2 }),
      ])
  })

  it('uses conflict upserts, removes stale rows, and preserves expected rows on retry', async () => {
    const validatorA = await insertValidator(ADDRESS_A)
    const validatorB = await insertValidator(ADDRESS_B)
    const validatorC = await insertValidator(ADDRESS_C)
    const epochNumber = 78

    await harness.db.insert(schema.activity).values([
      {
        validatorId: validatorA.id,
        epochNumber,
        likelihood: 10,
        rewarded: 1,
        missed: 9,
        dominanceRatioViaBalance: -1,
        dominanceRatioViaSlots: 10,
        balance: 100,
        stakers: 1,
      },
      {
        validatorId: validatorC.id,
        epochNumber,
        likelihood: 12,
        rewarded: -1,
        missed: -1,
        dominanceRatioViaBalance: -1,
        dominanceRatioViaSlots: 12,
        balance: 300,
        stakers: 3,
      },
    ]).execute()
    await harness.execute(`
      CREATE TRIGGER preserve_expected_activity_rows
      BEFORE DELETE ON activity
      WHEN OLD.validator_id IN (${validatorA.id}, ${validatorB.id})
      BEGIN
        SELECT RAISE(ABORT, 'expected activity rows must not be deleted');
      END
    `)

    const prepared = await prepareEpoch(epochNumber, new Map([
      [ADDRESS_A, validatorA.id],
      [ADDRESS_B, validatorB.id],
    ]))
    await activityEpochs.beginActivityEpochAttempt(epochNumber, STARTED_AT)
    await activityEpochs.persistCompletedEpoch(prepared, STARTED_AT, FINALIZED_AT)
    await activityEpochs.persistCompletedEpoch(prepared, STARTED_AT, FINALIZED_AT)

    expect(await harness.db.select().from(schema.activity).where(eq(schema.activity.epochNumber, epochNumber)).orderBy(asc(schema.activity.validatorId)).all())
      .toEqual([
        expect.objectContaining({
          validatorId: validatorA.id,
          likelihood: 10,
          rewarded: 718,
          missed: 2,
          balance: 100,
          stakers: 1,
        }),
        expect.objectContaining({ validatorId: validatorB.id, likelihood: 11, rewarded: 718, missed: 2 }),
      ])
    expect(await harness.db.select().from(schema.activityEpochs).where(eq(schema.activityEpochs.epochNumber, epochNumber)).get())
      .toMatchObject({
        status: 'finalized',
        attemptCount: 1,
        expectedElectedCount: 2,
        storedElectedCount: 2,
        electedSetHash: expect.stringMatching(/^[a-f\d]{64}$/),
        finalizedAt: FINALIZED_AT,
        lastError: null,
      })
  })

  it('removes every prior row when a finalized epoch has no elected validators', async () => {
    const validatorC = await insertValidator(ADDRESS_C)
    const epochNumber = 88
    await harness.db.insert(schema.activity).values({
      validatorId: validatorC.id,
      epochNumber,
      likelihood: 12,
      rewarded: 700,
      missed: 20,
      dominanceRatioViaBalance: -1,
      dominanceRatioViaSlots: 12,
      balance: 300,
      stakers: 3,
    }).execute()
    const prepared = await activityEpochs.prepareCompletedEpoch({
      epochNumber,
      electionSet: { epochIndex: epochNumber, electionBlockNumber: 123_456, validators: [] },
      activity: {},
      validatorIds: new Map(),
    })
    await activityEpochs.beginActivityEpochAttempt(epochNumber, STARTED_AT)

    await activityEpochs.persistCompletedEpoch(prepared, STARTED_AT, FINALIZED_AT)

    expect(await harness.db.select().from(schema.activity).where(eq(schema.activity.epochNumber, epochNumber)).all()).toEqual([])
    expect(await harness.db.select().from(schema.activityEpochs).where(eq(schema.activityEpochs.epochNumber, epochNumber)).get())
      .toMatchObject({ status: 'finalized', expectedElectedCount: 0, storedElectedCount: 0 })
  })
})

describe('finalized activity store path', () => {
  it('rejects verification if a delayed snapshot replaces finalized counters before commit', async () => {
    const validator = await insertValidator(ADDRESS_A)
    const epochNumber = 89
    const electionSet = {
      epochIndex: epochNumber,
      electionBlockNumber: 123_456,
      validators: [{ address: ADDRESS_A, numSlots: 10 }],
    }
    await activityEpochs.beginActivityEpochAttempt(epochNumber, STARTED_AT)
    await harness.db.insert(schema.activity).values({
      validatorId: validator.id,
      epochNumber,
      likelihood: 10,
      rewarded: 718,
      missed: 2,
      dominanceRatioViaBalance: -1,
      dominanceRatioViaSlots: 10 / 512,
      balance: 100,
      stakers: 1,
    }).execute()
    await harness.db.update(schema.activity).set({ rewarded: -1, missed: -1 }).where(and(
      eq(schema.activity.validatorId, validator.id),
      eq(schema.activity.epochNumber, epochNumber),
    )).execute()

    await expect(activityEpochs.finalizeVerifiedCompletedEpoch(
      epochNumber,
      electionSet,
      new Map([[ADDRESS_A, validator.id]]),
      STARTED_AT,
      FINALIZED_AT,
    )).rejects.toThrow()
    expect(await harness.db.select().from(schema.activityEpochs).where(eq(schema.activityEpochs.epochNumber, epochNumber)).get())
      .toMatchObject({ status: 'syncing', finalizedAt: null })

    await harness.db.update(schema.activity).set({ rewarded: 718, missed: 2 }).where(and(
      eq(schema.activity.validatorId, validator.id),
      eq(schema.activity.epochNumber, epochNumber),
    )).execute()
    await activityEpochs.finalizeVerifiedCompletedEpoch(
      epochNumber,
      electionSet,
      new Map([[ADDRESS_A, validator.id]]),
      STARTED_AT,
      FINALIZED_AT,
    )
    expect(await harness.db.select().from(schema.activityEpochs).where(eq(schema.activityEpochs.epochNumber, epochNumber)).get())
      .toMatchObject({ status: 'finalized', finalizedAt: FINALIZED_AT })
  })

  it('marks a claimed epoch failed when strict validator insertion aborts finalization', async () => {
    const epochNumber = 80
    await harness.execute(`
      CREATE TRIGGER fail_finalized_strict_validator_insert
      BEFORE INSERT ON validators
      WHEN NEW.address = '${ADDRESS_A}'
      BEGIN
        SELECT RAISE(ABORT, 'forced finalized strict validator failure');
      END
    `)

    await expect(activities.storeActivities({
      [epochNumber]: { [ADDRESS_A]: createElectedActivity(ADDRESS_A, 10) },
    }, {
      finalizeEpoch: true,
      electionSets: {
        [epochNumber]: {
          epochIndex: epochNumber,
          electionBlockNumber: 123_456,
          validators: [{ address: ADDRESS_A, numSlots: 10 }],
        },
      },
    })).rejects.toThrow(/validator|database|insert|query|constraint/i)

    expect(await harness.db.select().from(schema.activity).where(eq(schema.activity.epochNumber, epochNumber)).all()).toEqual([])
    expect(await harness.db.select().from(schema.activityEpochs).where(eq(schema.activityEpochs.epochNumber, epochNumber)).get())
      .toMatchObject({
        status: 'failed',
        finalizedAt: null,
        lastError: expect.stringMatching(/validator|database|insert|query|constraint/i),
      })
  })

  it('rejects finalization when no authoritative election set is supplied', async () => {
    await insertValidator(ADDRESS_A)
    const epochNumber = 80
    const activity: EpochActivity = {
      [ADDRESS_A]: createElectedActivity(ADDRESS_A, 10),
    }

    await expect(activities.storeActivities({ [epochNumber]: activity }, { finalizeEpoch: true }))
      .rejects
      .toThrow(/authoritative|election|set|required/i)

    expect(await harness.db.select().from(schema.activity).where(eq(schema.activity.epochNumber, epochNumber)).all()).toEqual([])
    const marker = await harness.db.select().from(schema.activityEpochs).where(eq(schema.activityEpochs.epochNumber, epochNumber)).get()
    expect(marker?.status).not.toBe('finalized')
  })

  it('requires an authoritative election set and rejects activity that omits an elected validator', async () => {
    await insertValidator(ADDRESS_A)
    await insertValidator(ADDRESS_B)
    const epochNumber = 80
    const partialActivity: EpochActivity = {
      [ADDRESS_A]: createElectedActivity(ADDRESS_A, 10),
    }

    await expect(activities.storeActivities({ [epochNumber]: partialActivity }, {
      finalizeEpoch: true,
      electionSets: {
        [epochNumber]: {
          epochIndex: epochNumber,
          electionBlockNumber: 123_456,
          validators: [
            { address: ADDRESS_A, numSlots: 10 },
            { address: ADDRESS_B, numSlots: 11 },
          ],
        },
      },
    })).rejects.toThrow(/election|activity|address|set|mismatch/i)

    expect(await harness.db.select().from(schema.activity).where(eq(schema.activity.epochNumber, epochNumber)).all()).toEqual([])
    const marker = await harness.db.select().from(schema.activityEpochs).where(eq(schema.activityEpochs.epochNumber, epochNumber)).get()
    expect(marker?.status).not.toBe('finalized')
  })

  it('reports an already-finalized epoch explicitly without changing marker or activity', async () => {
    const validatorA = await insertValidator(ADDRESS_A)
    const validatorB = await insertValidator(ADDRESS_B)
    const epochNumber = 89
    const electionSet = {
      epochIndex: epochNumber,
      electionBlockNumber: 123_456,
      validators: [
        { address: ADDRESS_A, numSlots: 10 },
        { address: ADDRESS_B, numSlots: 11 },
      ],
    }
    const activity: EpochActivity = {
      [ADDRESS_A]: createElectedActivity(ADDRESS_A, 10),
      [ADDRESS_B]: createElectedActivity(ADDRESS_B, 11),
    }
    const prepared = await activityEpochs.prepareCompletedEpoch({
      epochNumber,
      electionSet,
      activity,
      validatorIds: new Map([
        [ADDRESS_A, validatorA.id],
        [ADDRESS_B, validatorB.id],
      ]),
    })
    await activityEpochs.beginActivityEpochAttempt(epochNumber, STARTED_AT)
    await activityEpochs.persistCompletedEpoch(prepared, STARTED_AT, FINALIZED_AT)
    const markerBefore = await harness.db.select().from(schema.activityEpochs).where(eq(schema.activityEpochs.epochNumber, epochNumber)).get()
    const activityBefore = await harness.db.select().from(schema.activity).where(eq(schema.activity.epochNumber, epochNumber)).orderBy(asc(schema.activity.validatorId)).all()

    const result = await activities.storeActivities({ [epochNumber]: activity }, {
      finalizeEpoch: true,
      electionSets: { [epochNumber]: electionSet },
    })

    expect(result).toEqual({
      storedEpochs: [],
      alreadyFinalizedEpochs: [epochNumber],
      provisioningEpochs: [],
    })
    expect(await harness.db.select().from(schema.activityEpochs).where(eq(schema.activityEpochs.epochNumber, epochNumber)).get()).toEqual(markerBefore)
    expect(await harness.db.select().from(schema.activity).where(eq(schema.activity.epochNumber, epochNumber)).orderBy(asc(schema.activity.validatorId)).all()).toEqual(activityBefore)
  })

  it('finalizes multiple epochs sharing one uncached validator without racing its unique address insert', async () => {
    const epochNumbers = [81, 82, 83, 84, 85]
    armLogoBarrier(ADDRESS_SHARED, epochNumbers.length)
    const epochActivities = Object.fromEntries(epochNumbers.map(epochNumber => [epochNumber, {
      [ADDRESS_SHARED]: createElectedActivity(ADDRESS_SHARED, 10),
    }]))
    const electionSets = Object.fromEntries(epochNumbers.map(epochNumber => [epochNumber, {
      epochIndex: epochNumber,
      electionBlockNumber: 123_456 + epochNumber,
      validators: [{ address: ADDRESS_SHARED, numSlots: 10 }],
    }]))

    const storePromise = activities.storeActivities(epochActivities, {
      finalizeEpoch: true,
      electionSets,
    })
    await logoBarrierState.firstArrival
    await Promise.race([
      logoBarrierState.allArrived!,
      new Promise(resolve => setTimeout(resolve, 100)),
    ])
    logoBarrierState.release?.()

    await expect(storePromise).resolves.toEqual({
      storedEpochs: epochNumbers,
      alreadyFinalizedEpochs: [],
      provisioningEpochs: [],
    })

    expect(await harness.db.select({ address: schema.validators.address }).from(schema.validators).all())
      .toEqual([{ address: ADDRESS_SHARED }])
    expect(await harness.db.select().from(schema.activity).orderBy(asc(schema.activity.epochNumber)).all())
      .toHaveLength(epochNumbers.length)
    expect(await harness.db.select().from(schema.activityEpochs).orderBy(asc(schema.activityEpochs.epochNumber)).all())
      .toEqual(epochNumbers.map(epochNumber => expect.objectContaining({
        epochNumber,
        status: 'finalized',
        expectedElectedCount: 1,
        storedElectedCount: 1,
      })))
  })
})

describe('worst-case finalized epoch query budget', () => {
  it('bulk-resolves 512 uncached existing validators and stays below the D1 invocation ceiling', async () => {
    const epochNumber = 87
    const addresses = Array.from({ length: 512 }, (_, index) => `bulk-validator-${index.toString().padStart(3, '0')}`)
    const insertedValidators = await harness.db.insert(schema.validators).values(addresses.map(address => ({
      address,
      name: 'Bulk validator',
      logo: 'test-logo',
      hasDefaultLogo: true,
      accentColor: '#000000',
    }))).returning({
      id: schema.validators.id,
      address: schema.validators.address,
    }).all()
    const activity = Object.fromEntries(addresses.map(address => [
      address,
      createElectedActivity(address, 1),
    ]))
    const electionSet = {
      epochIndex: epochNumber,
      electionBlockNumber: 123_456,
      validators: addresses.map(address => ({ address, numSlots: 1 })),
    }
    harness.trace.reset()

    const result = await activities.storeActivities({ [epochNumber]: activity }, {
      finalizeEpoch: true,
      electionSets: { [epochNumber]: electionSet },
    })

    expect(result).toEqual({
      storedEpochs: [epochNumber],
      alreadyFinalizedEpochs: [],
      provisioningEpochs: [],
    })
    expect(harness.trace.batches).toHaveLength(1)
    const batchStatements = harness.trace.batches[0]!
    const maxActivityUpsertStatements = Math.ceil(addresses.length / 5)
    const activityUpsertStatements = batchStatements.filter(sql => /insert\s+into\s+[`"]?activity[`"]?(?:\s|\()/i.test(sql))
    expect(activityUpsertStatements.length).toBeLessThanOrEqual(maxActivityUpsertStatements)
    expect(batchStatements.length).toBeLessThanOrEqual(maxActivityUpsertStatements + 3)
    const firstActivityUpsertIndex = batchStatements.findIndex(sql => /insert\s+into\s+[`"]?activity[`"]?(?:\s|\()/i.test(sql))
    const cleanupIndex = batchStatements.findIndex(sql => /delete\s+from\s+[`"]?activity[`"]?(?:\s|$)/i.test(sql))
    expect(cleanupIndex).toBeGreaterThanOrEqual(0)
    expect(cleanupIndex).toBeLessThan(firstActivityUpsertIndex)
    expect(batchStatements.at(-1)).toMatch(/update\s+[`"]?activity_epochs[`"]?\s+set/i)
    const validatorReads = harness.trace.executed.filter(sql => /from\s+[`"]?validators[`"]?(?:\s|$)/i.test(sql))
    expect(validatorReads.length).toBeLessThanOrEqual(8)
    const tracedD1Statements = harness.trace.executed.length
      + harness.trace.batches.reduce((count, statements) => count + statements.length, 0)
    expect(tracedD1Statements).toBeLessThan(1_000)
    expect(await harness.db.select().from(schema.activity).where(eq(schema.activity.epochNumber, epochNumber)).all())
      .toHaveLength(insertedValidators.length)
    expect(await harness.db.select().from(schema.activityEpochs).where(eq(schema.activityEpochs.epochNumber, epochNumber)).get())
      .toMatchObject({
        status: 'finalized',
        expectedElectedCount: 512,
        storedElectedCount: 512,
      })
  }, 30_000)

  it('keeps combined completed and snapshot persistence bounded, metadata-safe, and idempotent', async () => {
    const completedEpoch = 90
    const snapshotEpoch = 91
    const addresses = Array.from({ length: 512 }, (_, index) => `combined-validator-${index.toString().padStart(3, '0')}`)
    const insertedValidators = await harness.db.insert(schema.validators).values(addresses.map(address => ({
      address,
      name: 'Combined validator',
      logo: 'test-logo',
      hasDefaultLogo: true,
      accentColor: '#000000',
    }))).returning({
      id: schema.validators.id,
      address: schema.validators.address,
    }).all()
    const validatorIdByAddress = new Map(insertedValidators.map(validator => [validator.address, validator.id]))
    const completedActivity = Object.fromEntries(addresses.map((address, index) => {
      const activity = createElectedActivity(address, 1)
      if (index === 0)
        return [address, { ...activity, balance: 1_000, stakers: 10 }]
      if (index === 1)
        return [address, { ...activity, balance: 2_000, stakers: 0 }]
      return [address, activity]
    }))
    const snapshotActivity = Object.fromEntries(addresses.map((address, index) => {
      const activity = {
        ...createElectedActivity(address, 1),
        missed: -1,
        rewarded: -1,
      }
      if (index === 1)
        return [address, { ...activity, balance: 3_000, stakers: 0 }]
      return [address, activity]
    }))
    const electionSet = {
      epochIndex: completedEpoch,
      electionBlockNumber: 123_456,
      validators: addresses.map(address => ({ address, numSlots: 1 })),
    }

    harness.trace.reset()
    const completedResult = await activities.storeActivities({ [completedEpoch]: completedActivity }, {
      finalizeEpoch: true,
      electionSets: { [completedEpoch]: electionSet },
    })
    const completedStatementCount = harness.trace.executed.length
      + harness.trace.batches.reduce((count, statements) => count + statements.length, 0)
    expect(completedResult).toEqual({
      storedEpochs: [completedEpoch],
      alreadyFinalizedEpochs: [],
      provisioningEpochs: [],
    })

    harness.trace.reset()
    await activities.storeActivities({ [snapshotEpoch]: snapshotActivity })
    const snapshotStatements = [
      ...harness.trace.executed,
      ...harness.trace.batches.flat(),
    ]
    const snapshotStatementCount = snapshotStatements.length
    const snapshotValidatorReads = snapshotStatements.filter(sql => /from\s+[`"]?validators[`"]?(?:\s|$)/i.test(sql))
    const snapshotActivityReads = snapshotStatements.filter(sql => /from\s+[`"]?activity[`"]?(?:\s|$)/i.test(sql))
    const snapshotActivityUpserts = snapshotStatements.filter(sql => /insert\s+into\s+[`"]?activity[`"]?(?:\s|\()/i.test(sql))
    expect(snapshotValidatorReads.length).toBeLessThanOrEqual(1)
    expect(snapshotActivityReads.length).toBeLessThanOrEqual(2)
    expect(snapshotActivityUpserts.length).toBeLessThanOrEqual(Math.ceil(addresses.length / 5))
    expect(completedStatementCount + snapshotStatementCount).toBeLessThan(500)

    harness.trace.reset()
    await activities.storeActivities({ [snapshotEpoch]: snapshotActivity })
    const retryStatementCount = harness.trace.executed.length
      + harness.trace.batches.reduce((count, statements) => count + statements.length, 0)
    expect(retryStatementCount).toBeLessThan(200)

    const snapshotRows = await harness.db.select().from(schema.activity).where(eq(schema.activity.epochNumber, snapshotEpoch)).all()
    expect(snapshotRows).toHaveLength(addresses.length)
    expect(snapshotRows.find(row => row.validatorId === validatorIdByAddress.get(addresses[0]!)))
      .toMatchObject({ balance: 1_000, stakers: 10, missed: -1, rewarded: -1 })
    expect(snapshotRows.find(row => row.validatorId === validatorIdByAddress.get(addresses[1]!)))
      .toMatchObject({ balance: 3_000, stakers: 0, missed: -1, rewarded: -1 })
  }, 60_000)

  it('provisions 512 absent snapshot validators in chunks before writing any activity', async () => {
    const snapshotEpoch = 92
    const validatorCount = 512
    const provisioningChunkSize = 200
    const addresses = Array.from({ length: validatorCount }, (_, index) => `missing-snapshot-validator-${index.toString().padStart(3, '0')}`)
    const snapshotActivity = Object.fromEntries(addresses.map(address => [
      address,
      {
        ...createElectedActivity(address, 1),
        missed: -1,
        rewarded: -1,
      },
    ]))
    const expectedValidatorCounts = [
      provisioningChunkSize,
      provisioningChunkSize * 2,
      validatorCount,
    ]

    for (const [attemptIndex, expectedValidatorCount] of expectedValidatorCounts.entries()) {
      harness.trace.reset()
      const result = await activities.storeActivities({ [snapshotEpoch]: snapshotActivity })
      const tracedStatements = [
        ...harness.trace.executed,
        ...harness.trace.batches.flat(),
      ]

      expect(tracedStatements.length).toBeLessThan(1_000)
      expect(await harness.db.select().from(schema.validators).all()).toHaveLength(expectedValidatorCount)

      if (attemptIndex < expectedValidatorCounts.length - 1) {
        expect(result).toEqual({
          storedEpochs: [],
          alreadyFinalizedEpochs: [],
          provisioningEpochs: [snapshotEpoch],
        })
        expect(tracedStatements.filter(sql => /(?:insert\s+into|update|delete\s+from)\s+[`"]?activity[`"]?(?:\s|\()/i.test(sql))).toEqual([])
        expect(await harness.db.select().from(schema.activity).where(eq(schema.activity.epochNumber, snapshotEpoch)).all()).toEqual([])
      }
      else {
        expect(result).toEqual({
          storedEpochs: [snapshotEpoch],
          alreadyFinalizedEpochs: [],
          provisioningEpochs: [],
        })
        expect(await harness.db.select().from(schema.activity).where(eq(schema.activity.epochNumber, snapshotEpoch)).all())
          .toHaveLength(validatorCount)
      }
    }
  }, 60_000)

  it('lets the bounded snapshot store own absent-validator provisioning', async () => {
    const snapshotEpoch = 93
    const addresses = Array.from({ length: 512 }, (_, index) => `active-snapshot-validator-${index.toString().padStart(3, '0')}`)
    const validators = addresses.map(address => ({
      ...createElectedActivity(address, 1),
      missed: -1,
      rewarded: -1,
      balance: 1_000,
    }))
    fetcherMocks.fetchSnapshotEpoch.mockResolvedValue([true, undefined, {
      epochNumber: snapshotEpoch,
      validators,
    }])
    harness.trace.reset()

    const result = await activities.fetchActiveEpoch()
    const tracedStatements = [
      ...harness.trace.executed,
      ...harness.trace.batches.flat(),
    ]

    expect(result).toEqual([true, undefined, expect.objectContaining({
      epochNumber: snapshotEpoch,
      storageOutcome: 'provisioning',
    })])
    expect(tracedStatements.length).toBeLessThan(1_000)
    expect(tracedStatements.filter(sql => /(?:insert\s+into|update|delete\s+from)\s+[`"]?activity[`"]?(?:\s|\()/i.test(sql))).toEqual([])
    expect(await harness.db.select().from(schema.validators).all()).toHaveLength(200)
    expect(await harness.db.select().from(schema.activity).where(eq(schema.activity.epochNumber, snapshotEpoch)).all()).toEqual([])
  }, 60_000)

  it('provisions genuinely absent validators in safe chunks and finalizes only after all IDs exist', async () => {
    const epochNumber = 88
    const validatorCount = 512
    const provisioningChunkSize = 200
    const addresses = Array.from({ length: validatorCount }, (_, index) => `missing-validator-${index.toString().padStart(3, '0')}`)
    const activity = Object.fromEntries(addresses.map(address => [
      address,
      createElectedActivity(address, 1),
    ]))
    const electionSet = {
      epochIndex: epochNumber,
      electionBlockNumber: 123_456,
      validators: addresses.map(address => ({ address, numSlots: 1 })),
    }
    const expectedValidatorCounts = [
      provisioningChunkSize,
      provisioningChunkSize * 2,
      validatorCount,
    ]

    for (const [attemptIndex, expectedValidatorCount] of expectedValidatorCounts.entries()) {
      harness.trace.reset()
      const result = await activities.storeActivities({ [epochNumber]: activity }, {
        finalizeEpoch: true,
        electionSets: { [epochNumber]: electionSet },
      })
      const tracedD1Statements = harness.trace.executed.length
        + harness.trace.batches.reduce((count, statements) => count + statements.length, 0)

      expect(tracedD1Statements).toBeLessThan(1_000)
      expect(await harness.db.select().from(schema.validators).all()).toHaveLength(expectedValidatorCount)
      if (attemptIndex < expectedValidatorCounts.length - 1) {
        expect(result).toEqual({
          storedEpochs: [],
          alreadyFinalizedEpochs: [],
          provisioningEpochs: [epochNumber],
        })
        const activityBatchStatements = harness.trace.batches.flat().filter(sql => /(?:insert\s+into|update)\s+[`"]?activity[`"]?(?:\s|\()/i.test(sql))
        expect(activityBatchStatements).toEqual([])
        expect(await harness.db.select().from(schema.activity).where(eq(schema.activity.epochNumber, epochNumber)).all()).toEqual([])
        const marker = await harness.db.select().from(schema.activityEpochs).where(eq(schema.activityEpochs.epochNumber, epochNumber)).get()
        expect(marker?.status).not.toBe('finalized')
        expect(marker?.finalizedAt).toBeNull()
      }
      else {
        expect(result).toEqual({
          storedEpochs: [epochNumber],
          alreadyFinalizedEpochs: [],
          provisioningEpochs: [],
        })
        expect(harness.trace.batches).toHaveLength(1)
        expect(await harness.db.select().from(schema.activity).where(eq(schema.activity.epochNumber, epochNumber)).all())
          .toHaveLength(validatorCount)
        expect(await harness.db.select().from(schema.activityEpochs).where(eq(schema.activityEpochs.epochNumber, epochNumber)).get())
          .toMatchObject({
            status: 'finalized',
            expectedElectedCount: validatorCount,
            storedElectedCount: validatorCount,
          })
      }
    }
  }, 60_000)
})

describe('marker-based completeness', () => {
  it('derives missing epochs only from finalized markers, not activity-row heuristics', async () => {
    const validator = await insertValidator(ADDRESS_A)

    await harness.db.insert(schema.activity).values({
      validatorId: validator.id,
      epochNumber: 70,
      likelihood: 10,
      rewarded: 720,
      missed: 0,
      dominanceRatioViaBalance: -1,
      dominanceRatioViaSlots: 10,
      balance: -1,
      stakers: 0,
    }).execute()
    await harness.db.insert(schema.activityEpochs).values([
      {
        epochNumber: 71,
        status: 'finalized',
        expectedElectedCount: 0,
        storedElectedCount: 0,
        electedSetHash: 'empty-election-set',
        attemptCount: 1,
        startedAt: STARTED_AT,
        finalizedAt: FINALIZED_AT,
        lastError: null,
      },
      {
        epochNumber: 72,
        status: 'failed',
        attemptCount: 1,
        startedAt: STARTED_AT,
        lastError: 'RPC unavailable',
      },
    ]).execute()

    expect(await activities.findMissingEpochs(createRange(70, 72))).toEqual([70, 72])

    const finalizedMarkers = await harness.db.select({ epochNumber: schema.activityEpochs.epochNumber })
      .from(schema.activityEpochs)
      .where(and(
        eq(schema.activityEpochs.status, 'finalized'),
        eq(schema.activityEpochs.epochNumber, 71),
      ))
      .all()
    expect(finalizedMarkers).toEqual([{ epochNumber: 71 }])
  })
})
