import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runTask: vi.fn(),
  insertValues: vi.fn(),
  insertGet: vi.fn(),
  updateSet: vi.fn(),
  updateExecute: vi.fn(),
}))

vi.mock('nitropack/runtime', () => ({
  runTask: mocks.runTask,
}))

vi.mock('../../utils/drizzle', () => ({
  eq: vi.fn(() => ({ kind: 'eq' })),
  tables: {
    cronRuns: {
      id: 'id',
    },
  },
  useDrizzle: () => ({
    insert: () => ({
      values: (values: unknown) => {
        mocks.insertValues(values)
        return {
          returning: () => ({
            get: mocks.insertGet,
          }),
        }
      },
    }),
    update: () => ({
      set: (values: unknown) => {
        mocks.updateSet(values)
        return {
          where: () => ({
            execute: mocks.updateExecute,
          }),
        }
      },
    }),
  }),
}))

vi.stubGlobal('defineTask', (task: unknown) => task)
vi.stubGlobal('useSafeRuntimeConfig', () => ({
  public: {
    nimiqNetwork: 'testnet',
    gitBranch: 'test',
  },
}))

type CronSyncTask = typeof import('./sync')['default']
let task: CronSyncTask

beforeEach(async () => {
  vi.resetAllMocks()
  mocks.insertGet.mockResolvedValue({ id: 1 })
  mocks.updateExecute.mockResolvedValue(undefined)
  mocks.runTask.mockResolvedValue({ result: { success: true } })

  vi.resetModules()
  task = (await import('./sync')).default
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('scheduled synchronization order', () => {
  it('records the six-hour schedule', async () => {
    await task.run({ payload: {}, context: {} } as never)

    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      cron: '0 */6 * * *',
    }))
  })

  it('runs the independent score task after snapshot synchronization', async () => {
    await task.run({ payload: {}, context: {} } as never)

    expect(mocks.runTask.mock.calls.map(([taskName]) => taskName)).toEqual([
      'sync:epochs',
      'sync:snapshot',
      'sync:scores',
    ])
  })

  it('runs all tasks before recording and rejecting aggregate failures', async () => {
    mocks.runTask
      .mockResolvedValueOnce({ result: { success: false, error: 'epochs failed' } })
      .mockRejectedValueOnce(new Error('snapshot failed'))
      .mockResolvedValueOnce({ result: { success: true } })

    await expect(task.run({ payload: {}, context: {} } as never)).rejects.toThrow(/task failures/i)

    expect(mocks.runTask.mock.calls.map(([taskName]) => taskName)).toEqual([
      'sync:epochs',
      'sync:snapshot',
      'sync:scores',
    ])
    expect(mocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error',
      meta: expect.objectContaining({
        failedTasks: [
          expect.objectContaining({ name: 'sync:epochs', error: 'epochs failed' }),
          expect.objectContaining({ name: 'sync:snapshot', error: 'snapshot failed' }),
        ],
      }),
    }))
    expect(mocks.updateExecute).toHaveBeenCalledTimes(1)
  })
})
