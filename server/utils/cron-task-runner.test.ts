import { describe, expect, it, vi } from 'vitest'
import { runTasksBestEffort } from './cron-task-runner'

describe('runTasksBestEffort', () => {
  it('runs every task once in order and normalizes returned and thrown failures', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce({ result: { success: false, error: 'epochs RPC unavailable' } })
      .mockRejectedValueOnce(new Error('snapshot import failed'))
      .mockResolvedValueOnce({ result: { success: true } })

    await expect(runTasksBestEffort([
      'sync:epochs',
      'sync:snapshot',
      'sync:scores',
    ], run)).resolves.toEqual([
      { name: 'sync:epochs', success: false, error: 'epochs RPC unavailable' },
      { name: 'sync:snapshot', success: false, error: 'snapshot import failed' },
      { name: 'sync:scores', success: true, value: { result: { success: true } } },
    ])

    expect(run).toHaveBeenCalledTimes(3)
    expect(run).toHaveBeenNthCalledWith(1, 'sync:epochs')
    expect(run).toHaveBeenNthCalledWith(2, 'sync:snapshot')
    expect(run).toHaveBeenNthCalledWith(3, 'sync:scores')
  })
})
