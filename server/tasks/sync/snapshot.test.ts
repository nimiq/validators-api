import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  initRpcClient: vi.fn(),
  getRpcUrl: vi.fn(),
  importValidatorsBundled: vi.fn(),
  fetchActiveEpoch: vi.fn(),
  upsertScoresSnapshotEpoch: vi.fn(),
  sendSyncFailureNotification: vi.fn(),
}))

vi.mock('nimiq-rpc-client-ts/client', () => ({
  initRpcClient: mocks.initRpcClient,
}))

vi.mock('../../utils/rpc', () => ({
  getRpcUrl: mocks.getRpcUrl,
}))

vi.mock('../../utils/slack', () => ({
  sendSyncFailureNotification: mocks.sendSyncFailureNotification,
}))

vi.stubGlobal('defineTask', (task: unknown) => task)
vi.stubGlobal('useSafeRuntimeConfig', () => ({ public: { nimiqNetwork: 'testnet' } }))
vi.stubGlobal('importValidatorsBundled', mocks.importValidatorsBundled)
vi.stubGlobal('fetchActiveEpoch', mocks.fetchActiveEpoch)
vi.stubGlobal('upsertScoresSnapshotEpoch', mocks.upsertScoresSnapshotEpoch)

type SnapshotSyncTask = typeof import('./snapshot')['default']
let task: SnapshotSyncTask

beforeEach(async () => {
  vi.resetAllMocks()
  const epochNumber = 101

  mocks.getRpcUrl.mockReturnValue('http://rpc.test')
  mocks.importValidatorsBundled.mockResolvedValue([true, undefined, [{}]])
  mocks.fetchActiveEpoch.mockResolvedValue([true, undefined, {
    epochNumber,
    electedValidators: [],
    unelectedValidators: [],
    untrackedValidators: [],
    deletedValidators: [],
    unlistedActiveValidators: [],
    storageOutcome: 'provisioning',
  }])
  mocks.upsertScoresSnapshotEpoch.mockResolvedValue([true, undefined, {}])
  mocks.sendSyncFailureNotification.mockResolvedValue(undefined)

  vi.resetModules()
  task = (await import('./snapshot')).default
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('active snapshot validator provisioning', () => {
  it('defers score persistence without reporting a bounded provisioning pass as failure', async () => {
    const result = await task.run()

    expect(result).toEqual({
      result: {
        success: true,
        epochNumber: 101,
        storageOutcome: 'provisioning',
      },
    })
    expect(mocks.upsertScoresSnapshotEpoch).not.toHaveBeenCalled()
    expect(mocks.sendSyncFailureNotification).not.toHaveBeenCalled()
  })

  it('never calculates or persists scores directly after snapshot activity is stored', async () => {
    mocks.fetchActiveEpoch.mockResolvedValueOnce([true, undefined, {
      epochNumber: 101,
      electedValidators: [],
      unelectedValidators: [],
      untrackedValidators: [],
      deletedValidators: [],
      unlistedActiveValidators: [],
      storageOutcome: 'stored',
    }])

    const result = await task.run()

    expect(result).toEqual({
      result: {
        success: true,
        epochNumber: 101,
        storageOutcome: 'stored',
      },
    })
    expect(mocks.upsertScoresSnapshotEpoch).not.toHaveBeenCalled()
    expect(mocks.sendSyncFailureNotification).not.toHaveBeenCalled()
  })
})
