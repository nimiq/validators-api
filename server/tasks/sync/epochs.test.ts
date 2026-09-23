import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const runtimeConfigState = vi.hoisted(() => ({ scoreV2Mode: 'off' }))
const mocks = vi.hoisted(() => ({
  initRpcClient: vi.fn(),
  fetchElectionSet: vi.fn(),
  fetchActivity: vi.fn(),
  getRange: vi.fn(),
  getRpcUrl: vi.fn(),
  storeActivities: vi.fn(),
  findMissingEpochs: vi.fn(),
  getActivityEpochMarkers: vi.fn(),
  getRecentEpochRange: vi.fn(),
  planEpochSync: vi.fn(),
  getOldestV2BackfillEpoch: vi.fn(),
  synchronizeCompletedEpoch: vi.fn(),
  sendNewEpochNotification: vi.fn(),
  sendSyncFailureNotification: vi.fn(),
  consolaInfo: vi.fn(),
}))

vi.mock('consola', () => ({
  consola: { info: mocks.consolaInfo },
}))

vi.mock('nimiq-rpc-client-ts/client', () => ({
  initRpcClient: mocks.initRpcClient,
}))

vi.mock('../../../packages/nimiq-validator-trustscore/src/range', () => ({
  getRange: mocks.getRange,
}))

vi.mock('../../../packages/nimiq-validator-trustscore/src/fetcher', () => ({
  fetchElectionSet: mocks.fetchElectionSet,
  fetchActivity: mocks.fetchActivity,
}))

vi.mock('../../../packages/nimiq-validator-trustscore/src/sync-progress', () => ({
  formatActivityBatchProgress: () => 'activity progress',
  formatEpochSyncProgress: () => 'epoch progress',
}))

vi.mock('../../utils/activities', () => ({
  storeActivities: mocks.storeActivities,
}))

vi.mock('../../utils/activity-epochs', () => ({
  DEFAULT_SYNCING_LEASE_DURATION_MS: 6 * 60 * 60 * 1000,
  getActivityEpochMarkers: mocks.getActivityEpochMarkers,
  getRecentEpochRange: mocks.getRecentEpochRange,
  planEpochSync: mocks.planEpochSync,
}))

vi.mock('../../utils/activity-sync', () => ({
  synchronizeCompletedEpoch: mocks.synchronizeCompletedEpoch,
}))

vi.mock('../../utils/scores', () => ({
  getOldestV2BackfillEpoch: mocks.getOldestV2BackfillEpoch,
}))

vi.mock('../../utils/rpc', () => ({
  getRpcUrl: mocks.getRpcUrl,
}))

vi.mock('../../utils/slack', () => ({
  sendNewEpochNotification: mocks.sendNewEpochNotification,
  sendSyncFailureNotification: mocks.sendSyncFailureNotification,
}))

vi.stubGlobal('defineTask', (task: unknown) => task)
vi.stubGlobal('useSafeRuntimeConfig', () => ({
  scoreV2Mode: runtimeConfigState.scoreV2Mode,
  public: { nimiqNetwork: 'testnet' },
}))
vi.stubGlobal('findMissingEpochs', mocks.findMissingEpochs)

type EpochSyncTask = typeof import('./epochs')['default']
let task: EpochSyncTask
let getEpochCandidateLimit: typeof import('./epochs')['getEpochCandidateLimit']
let getSyncingLeaseDurationMs: typeof import('./epochs')['getSyncingLeaseDurationMs']
let isFullRepairAllowed: typeof import('./epochs')['isFullRepairAllowed']

beforeEach(async () => {
  vi.resetAllMocks()
  runtimeConfigState.scoreV2Mode = 'off'
  mocks.getRpcUrl.mockReturnValue('http://rpc.test')
  mocks.findMissingEpochs.mockResolvedValue([])
  mocks.getOldestV2BackfillEpoch.mockResolvedValue(null)
  mocks.getRange.mockResolvedValue([true, undefined, {
    fromEpoch: 1,
    toEpoch: 100,
    epochDurationMs: 12 * 60 * 60 * 1000,
  }])
  mocks.getActivityEpochMarkers.mockResolvedValue([
    { epochNumber: 100, status: 'failed', startedAt: '2026-07-28T10:00:00.000Z' },
    { epochNumber: 99, status: 'failed', startedAt: '2026-07-28T09:00:00.000Z' },
    { epochNumber: 98, status: 'syncing', startedAt: '2026-07-28T01:00:00.000Z' },
  ])
  mocks.getRecentEpochRange.mockReturnValue({ fromEpoch: 73, toEpoch: 100 })
  mocks.planEpochSync.mockReturnValue([100, 99, 98, 97, 96])
  mocks.synchronizeCompletedEpoch
    .mockResolvedValueOnce({ epochNumber: 100, status: 'failed', error: 'first RPC failure', repairAttempted: true })
    .mockResolvedValueOnce({ epochNumber: 99, status: 'verified' })
    .mockResolvedValueOnce({ epochNumber: 98, status: 'failed', error: 'repair budget exhausted', repairAttempted: false })
    .mockResolvedValueOnce({ epochNumber: 97, status: 'verified' })
    .mockResolvedValueOnce({ epochNumber: 96, status: 'already_finalized' })
  mocks.sendSyncFailureNotification.mockResolvedValue(undefined)

  vi.resetModules()
  const epochsModule = await import('./epochs')
  task = epochsModule.default
  getEpochCandidateLimit = epochsModule.getEpochCandidateLimit
  getSyncingLeaseDurationMs = epochsModule.getSyncingLeaseDurationMs
  isFullRepairAllowed = epochsModule.isFullRepairAllowed
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('planned completed-epoch synchronization', () => {
  it('extends marker repair through the full window for the oldest pending v2 score', async () => {
    runtimeConfigState.scoreV2Mode = 'shadow'
    mocks.getRange.mockResolvedValue([true, undefined, {
      fromEpoch: 90,
      toEpoch: 100,
      epochCount: 11,
      epochDurationMs: 12 * 60 * 60 * 1000,
    }])
    mocks.getRecentEpochRange.mockReturnValue({ fromEpoch: 90, toEpoch: 100 })
    mocks.getOldestV2BackfillEpoch.mockResolvedValue(50)
    mocks.planEpochSync.mockReturnValue([])

    await task.run()

    expect(mocks.getActivityEpochMarkers).toHaveBeenCalledWith({ fromEpoch: 40, toEpoch: 100 })
    expect(mocks.planEpochSync).toHaveBeenCalledWith(expect.objectContaining({
      range: { fromEpoch: 40, toEpoch: 100 },
      recentRange: { fromEpoch: 90, toEpoch: 100 },
    }))
  })

  it('processes every candidate and repair in development while keeping production bounded', () => {
    expect(getEpochCandidateLimit(true)).toBe(Infinity)
    expect(getEpochCandidateLimit(false)).toBe(50)
    expect(getSyncingLeaseDurationMs(true)).toBe(5 * 60 * 1000)
    expect(getSyncingLeaseDurationMs(false)).toBe(6 * 60 * 60 * 1000)
    expect(isFullRepairAllowed(0, true)).toBe(true)
    expect(isFullRepairAllowed(5, true)).toBe(true)
    expect(isFullRepairAllowed(0, false)).toBe(true)
    expect(isFullRepairAllowed(1, false)).toBe(false)
  })

  it('limits production repairs while returning the failed epoch details', async () => {
    const result = await task.run()

    expect(mocks.getActivityEpochMarkers).toHaveBeenCalledTimes(1)
    expect(mocks.getRecentEpochRange).toHaveBeenCalledWith(expect.objectContaining({
      fromEpoch: 1,
      toEpoch: 100,
    }))
    expect(mocks.planEpochSync).toHaveBeenCalledWith(expect.objectContaining({
      range: { fromEpoch: 1, toEpoch: 100 },
      recentRange: { fromEpoch: 73, toEpoch: 100 },
      markers: [
        { epochNumber: 100, status: 'failed', startedAt: '2026-07-28T10:00:00.000Z' },
        { epochNumber: 99, status: 'failed', startedAt: '2026-07-28T09:00:00.000Z' },
        { epochNumber: 98, status: 'syncing', startedAt: '2026-07-28T01:00:00.000Z' },
      ],
      limit: 50,
      syncingLeaseDurationMs: 6 * 60 * 60 * 1000,
    }))
    expect(mocks.synchronizeCompletedEpoch).toHaveBeenNthCalledWith(1, 100, 'testnet', { allowRepair: true })
    expect(mocks.synchronizeCompletedEpoch).toHaveBeenNthCalledWith(2, 99, 'testnet', { allowRepair: false })
    expect(mocks.synchronizeCompletedEpoch).toHaveBeenNthCalledWith(3, 98, 'testnet', { allowRepair: false })
    expect(mocks.synchronizeCompletedEpoch).toHaveBeenNthCalledWith(4, 97, 'testnet', { allowRepair: false })
    expect(mocks.synchronizeCompletedEpoch).toHaveBeenNthCalledWith(5, 96, 'testnet', { allowRepair: false })
    expect(mocks.synchronizeCompletedEpoch).toHaveBeenCalledTimes(5)

    expect(result).toEqual({
      result: {
        success: false,
        error: '[sync:epochs] epoch 100 failed: first RPC failure',
        totalSynced: 2,
        epochsSynced: [99, 97],
        outcomes: [
          { epochNumber: 100, status: 'failed', error: 'first RPC failure', repairAttempted: true },
          { epochNumber: 99, status: 'verified' },
          { epochNumber: 98, status: 'failed', error: 'repair budget exhausted', repairAttempted: false },
          { epochNumber: 97, status: 'verified' },
          { epochNumber: 96, status: 'already_finalized' },
        ],
      },
    })
  })
})
