import { describe, expect, it } from 'vitest'
import { formatActivityBatchProgress, formatEpochSyncProgress } from './sync-progress'

describe('sync progress logs', () => {
  it('formats the current epoch position in the run', () => {
    expect(formatEpochSyncProgress({
      epochIndex: 841,
      missingEpochsCount: 365,
      runIndex: 3,
      maxEpochsPerRun: 50,
    })).toBe('[sync:epochs] epoch 841 (run 3/50, missing 365) fetching activity')
  })

  it('formats the current activity batch range', () => {
    expect(formatActivityBatchProgress({
      epochIndex: 841,
      fromBatchIndex: 603361,
      toBatchIndex: 603480,
      completedBatches: 120,
      totalBatches: 720,
      batchSize: 120,
    })).toBe('[sync:epochs] epoch 841 batches 603361-603480 (120/720, batch size 120)')
  })
})
