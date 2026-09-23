import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  categorizeValidatorsSnapshotEpoch: vi.fn(),
  getActivityEpochMarkers: vi.fn(),
  getBlockNumber: vi.fn(),
  getLatestScoreState: vi.fn(),
  getRange: vi.fn(),
  getRpcUrl: vi.fn(),
  initRpcClient: vi.fn(),
}))

vi.mock('nimiq-rpc-client-ts/client', () => ({
  initRpcClient: mocks.initRpcClient,
}))

vi.mock('nimiq-rpc-client-ts/http', () => ({
  getBlockNumber: mocks.getBlockNumber,
}))

vi.mock('nimiq-validator-trustscore/range', () => ({
  getRange: mocks.getRange,
}))

vi.mock('~~/server/utils/rpc', () => ({
  getRpcUrl: mocks.getRpcUrl,
}))

vi.stubGlobal('categorizeValidatorsSnapshotEpoch', mocks.categorizeValidatorsSnapshotEpoch)
vi.stubGlobal('createError', (error: unknown) => error instanceof Error ? error : new Error(String(error)))
vi.stubGlobal('defineCachedEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getActivityEpochMarkers', mocks.getActivityEpochMarkers)
vi.stubGlobal('getLatestScoreState', mocks.getLatestScoreState)
vi.stubGlobal('getValidatedQuery', async () => ({ 'score-version': 2 }))
vi.stubGlobal('useSafeRuntimeConfig', () => ({
  scoreV2Mode: 'off',
  public: {
    nimiqNetwork: 'test-albatross',
  },
}))

type StatusHandler = (event: unknown) => Promise<Record<string, unknown>>

let statusHandler: StatusHandler

beforeEach(async () => {
  mocks.categorizeValidatorsSnapshotEpoch.mockReset()
  mocks.getActivityEpochMarkers.mockReset()
  mocks.getBlockNumber.mockReset()
  mocks.getLatestScoreState.mockReset()
  mocks.getRange.mockReset()
  mocks.getRpcUrl.mockReset()
  mocks.initRpcClient.mockReset()

  mocks.getRpcUrl.mockReturnValue('https://rpc.invalid')
  mocks.getActivityEpochMarkers.mockResolvedValue([
    {
      epochNumber: 10,
      status: 'finalized',
      startedAt: '2026-07-29T08:00:00.000Z',
      finalizedAt: '2026-07-29T08:05:00.000Z',
      lastError: null,
    },
    {
      epochNumber: 11,
      status: 'failed',
      startedAt: '2026-07-29T08:00:00.000Z',
      finalizedAt: null,
      lastError: 'RPC unavailable',
    },
    {
      epochNumber: 12,
      status: 'syncing',
      startedAt: '2026-07-29T08:00:00.000Z',
      finalizedAt: null,
      lastError: null,
    },
  ])
  mocks.getLatestScoreState.mockImplementation(async (scoreVersion: number) => {
    expect(scoreVersion).toBe(2)
    return { epochNumber: 10, dataStatus: 'complete' }
  })
  mocks.getRange.mockResolvedValue([false, 'range RPC unavailable', undefined])
  mocks.getBlockNumber.mockResolvedValue([false, 'head RPC unavailable', undefined])
  mocks.categorizeValidatorsSnapshotEpoch.mockResolvedValue([
    false,
    'snapshot RPC unavailable',
    undefined,
  ])

  vi.resetModules()
  statusHandler = (await import('./status.get')).default as StatusHandler
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('status API live failure isolation', () => {
  it('returns stored marker and selected-version score status when every optional live RPC fails', async () => {
    const payload = await statusHandler({})

    expect(payload).toMatchObject({
      latestCompletedEpoch: 12,
      latestFinalizedEpoch: 10,
      failedEpochs: [
        expect.objectContaining({ epochNumber: 11, lastError: 'RPC unavailable' }),
      ],
      syncingEpochs: [
        expect.objectContaining({ epochNumber: 12 }),
      ],
      activeScoreVersion: 1,
      selectedScoreVersion: 2,
      latestScoreEpoch: 10,
      scoreStatus: 'stale',
      recentCoverage: null,
      longTermCoverage: null,
      missingEpochs: null,
      range: null,
      validators: null,
      blockchain: {
        network: 'test-albatross',
        headBlockNumber: null,
      },
    })
    expect(mocks.getRange).toHaveBeenCalledOnce()
    expect(mocks.getBlockNumber).toHaveBeenCalledOnce()
    expect(mocks.categorizeValidatorsSnapshotEpoch).toHaveBeenCalledOnce()
    expect(mocks.getLatestScoreState).toHaveBeenCalledWith(2)
  })
})
