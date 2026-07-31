import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  upsertScoresSnapshotEpoch: vi.fn(),
  sendSyncFailureNotification: vi.fn(),
}))

vi.mock('consola', () => ({
  consola: {
    error: mocks.error,
    info: mocks.info,
  },
}))

vi.mock('../../utils/scores', () => ({
  upsertScoresSnapshotEpoch: mocks.upsertScoresSnapshotEpoch,
}))

vi.mock('../../utils/slack', () => ({
  sendSyncFailureNotification: mocks.sendSyncFailureNotification,
}))

vi.stubGlobal('defineTask', (task: unknown) => task)
vi.stubGlobal('upsertScoresSnapshotEpoch', mocks.upsertScoresSnapshotEpoch)

interface ScoresSyncTask {
  meta: {
    name: string
    description: string
  }
  run: () => Promise<unknown>
}

let task: ScoresSyncTask

beforeEach(async () => {
  vi.resetAllMocks()
  mocks.upsertScoresSnapshotEpoch.mockResolvedValue([true, undefined, {
    dataStatus: 'stale',
    missingEpochs: [101],
    scores: [],
    scoreCounts: { v1: 0, v2: 0 },
    recentCoverage: 0.5,
    longTermCoverage: 0.75,
    backfilledEpochs: [],
  }])
  mocks.sendSyncFailureNotification.mockResolvedValue(undefined)

  vi.resetModules()
  task = (await import('./scores')).default as ScoresSyncTask
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('independent score synchronization', () => {
  it('registers a dedicated sync:scores task', () => {
    expect(task.meta).toMatchObject({ name: 'sync:scores' })
  })

  it('reports incomplete marker coverage as a successful stale skip', async () => {
    await expect(task.run()).resolves.toEqual({
      result: {
        success: true,
        dataStatus: 'stale',
        missingEpochs: [101],
        scoreCounts: { v1: 0, v2: 0 },
        recentCoverage: 0.5,
        longTermCoverage: 0.75,
        backfilledEpochs: [],
      },
    })
    expect(mocks.sendSyncFailureNotification).not.toHaveBeenCalled()
  })

  it('reports per-version counts, coverage, and backfilled epochs for a current snapshot', async () => {
    mocks.upsertScoresSnapshotEpoch.mockImplementation(async (options) => {
      options?.onProgress('backfill epoch 119 (1/2): calculating 3 validator(s)')
      return [true, undefined, {
        range: { toEpoch: 120 },
        dataStatus: 'complete',
        missingEpochs: [],
        scores: [],
        scoreCounts: { v1: 3, v2: 2 },
        recentCoverage: 1,
        longTermCoverage: 0.8,
        backfilledEpochs: [119, 118],
      }]
    })

    await expect(task.run()).resolves.toEqual({
      result: {
        success: true,
        dataStatus: 'complete',
        epochNumber: 120,
        scoreCounts: { v1: 3, v2: 2 },
        recentCoverage: 1,
        longTermCoverage: 0.8,
        backfilledEpochs: [119, 118],
      },
    })
    expect(mocks.info).toHaveBeenCalledWith('[sync:scores] starting')
    expect(mocks.info).toHaveBeenCalledWith(
      '[sync:scores] backfill epoch 119 (1/2): calculating 3 validator(s)',
    )
    expect(mocks.info).toHaveBeenCalledWith(
      '[sync:scores] finished; v1 3, v2 2, backfilled 2 epoch(s)',
    )
    expect(mocks.sendSyncFailureNotification).not.toHaveBeenCalled()
  })
})
