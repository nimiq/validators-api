import type { TestDbHarness } from '~~/server/test/db-harness'
import type { FetchedValidator } from '~~/server/utils/types'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '~~/server/db/schema'
import { createTestDbHarness } from '~~/server/test/db-harness'
import { mainQuerySchema } from '~~/server/utils/schemas'

const mocks = vi.hoisted(() => ({
  db: undefined as unknown,
  getRange: vi.fn(),
  getRpcUrl: vi.fn(),
  initRpcClient: vi.fn(),
}))

vi.mock('nimiq-rpc-client-ts/client', () => ({ initRpcClient: mocks.initRpcClient }))
vi.mock('~~/packages/nimiq-validator-trustscore/src/range', () => ({ getRange: mocks.getRange }))
vi.mock('~~/server/utils/rpc', () => ({ getRpcUrl: mocks.getRpcUrl }))
vi.mock('~~/server/utils/drizzle', () => ({
  tables: schema,
  useDrizzle: () => mocks.db,
}))
vi.mock('~~/server/utils/logo', () => ({ handleValidatorLogo: vi.fn() }))

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('defineCachedFunction', (handler: unknown) => handler)
vi.stubGlobal('getValidatedQuery', async (
  event: { query?: Record<string, string> },
  validate: (query: unknown) => unknown,
) => validate(event.query ?? {}))
vi.stubGlobal('createError', (error: { statusCode?: number, statusMessage?: string }) =>
  Object.assign(new Error(error.statusMessage), error))
vi.stubGlobal('mainQuerySchema', mainQuerySchema)
vi.stubGlobal('tables', schema)
vi.stubGlobal('useDrizzle', () => mocks.db)
vi.stubGlobal('useSafeRuntimeConfig', () => ({
  scoreV2Mode: 'active',
  public: { nimiqNetwork: 'main-albatross' },
}))

let harness: TestDbHarness
let handler: (event: { query?: Record<string, string> }) => Promise<FetchedValidator[]>

beforeEach(async () => {
  vi.clearAllMocks()
  harness = await createTestDbHarness()
  mocks.db = harness.db
  mocks.getRpcUrl.mockReturnValue('https://rpc.invalid')
  mocks.getRange.mockResolvedValue([false, 'HTTP error 403: Forbidden', undefined])

  const validators = await harness.db.insert(schema.validators).values([
    { address: 'listed-validator', name: 'Listed', logo: 'logo', accentColor: '#000000', isListed: true, payoutType: 'restake' },
    { address: 'unlisted-validator', name: 'Unlisted', logo: 'logo', accentColor: '#000000', isListed: false, payoutType: 'direct' },
  ]).returning().all()
  for (const validator of validators) {
    await harness.db.insert(schema.scores).values([
      { validatorId: validator.id, epochNumber: 100, scoreVersion: 1, total: 0.6, availability: 0.7, dominance: 0.8, reliability: 0.9 },
      { validatorId: validator.id, epochNumber: 100, scoreVersion: 2, total: 0.9, availability: 0.8, dominance: 0.7, reliability: 0.6 },
    ]).execute()
    await harness.db.insert(schema.activity).values({
      validatorId: validator.id,
      epochNumber: 101,
      likelihood: 1,
      rewarded: 10,
      missed: 0,
      dominanceRatioViaBalance: 0.01,
      dominanceRatioViaSlots: 0.01,
      balance: 1000,
      stakers: 5,
    }).execute()
  }
  await harness.db.insert(schema.activityEpochs).values({
    epochNumber: 101,
    status: 'failed',
    startedAt: '2026-10-22T10:00:00.000Z',
    lastError: 'HTTP error 403: Forbidden',
  }).execute()

  handler = (await import('./index.get')).default as typeof handler
})

afterEach(() => harness.close())
afterAll(() => vi.unstubAllGlobals())

describe('validator list RPC failure isolation', () => {
  it('serves stored validators and stale scores when the RPC returns an error', async () => {
    expect(await handler({})).toMatchObject([
      { address: 'listed-validator', balance: 1000, stakers: 5, score: { scoreVersion: 2, scoreEpoch: 100, total: 0.9, dataStatus: 'stale' } },
    ])
  })

  it('serves stored validators when the RPC throws', async () => {
    mocks.getRange.mockRejectedValue(new Error('RPC connection failed'))

    expect(await handler({})).toMatchObject([
      { address: 'listed-validator', score: { scoreEpoch: 100, dataStatus: 'stale' } },
    ])
  })

  it('serves stored validators without an RPC URL', async () => {
    mocks.getRpcUrl.mockReturnValue('')

    expect(await handler({})).toMatchObject([
      { address: 'listed-validator', score: { scoreEpoch: 100, dataStatus: 'stale' } },
    ])
  })

  it('preserves filters, score version, and forced reads during an outage', async () => {
    expect(await handler({ query: { 'only-known': 'false', 'payout-type': 'direct', 'score-version': '1', 'force': 'true' } })).toMatchObject([
      { address: 'unlisted-validator', score: { scoreVersion: 1, total: 0.6, dataStatus: 'stale' } },
    ])
  })

  it('marks stored scores stale even when their epoch is the latest stored epoch', async () => {
    await harness.db.delete(schema.activityEpochs).execute()

    expect(await handler({})).toMatchObject([
      { address: 'listed-validator', score: { scoreEpoch: 100, dataStatus: 'stale' } },
    ])
  })

  it('keeps current scores when the live RPC succeeds', async () => {
    mocks.getRange.mockResolvedValue([true, undefined, {
      fromEpoch: 1,
      toEpoch: 100,
      epochDurationMs: 43_200_000,
    }])

    expect(await handler({})).toMatchObject([
      { address: 'listed-validator', score: { scoreVersion: 2, scoreEpoch: 100, dataStatus: 'current' } },
    ])
  })

  it('returns service unavailable when neither live nor stored epoch data exists', async () => {
    await harness.db.delete(schema.activityEpochs).execute()
    await harness.db.delete(schema.scores).execute()

    await expect(handler({})).rejects.toMatchObject({ statusCode: 503 })
  })
})
