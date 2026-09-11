export interface EpochSyncProgress {
  epochIndex: number
  missingEpochsCount: number
  runIndex: number
  maxEpochsPerRun: number | 'all'
}

export interface ActivityBatchProgress {
  epochIndex: number
  fromBatchIndex: number
  toBatchIndex: number
  completedBatches: number
  totalBatches: number
  batchSize: number
}

export function formatEpochSyncProgress(progress: EpochSyncProgress) {
  return `[sync:epochs] epoch ${progress.epochIndex} (run ${progress.runIndex}/${progress.maxEpochsPerRun}, missing ${progress.missingEpochsCount}) fetching activity`
}

export function formatActivityBatchProgress(progress: ActivityBatchProgress) {
  return `[sync:epochs] epoch ${progress.epochIndex} batches ${progress.fromBatchIndex}-${progress.toBatchIndex} (${progress.completedBatches}/${progress.totalBatches}, batch size ${progress.batchSize})`
}
