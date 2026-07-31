import { consola } from 'consola'
import { upsertScoresSnapshotEpoch } from '../../utils/scores'
import { sendSyncFailureNotification } from '../../utils/slack'

export default defineTask({
  meta: {
    name: 'sync:scores',
    description: 'Calculate and persist validator scores',
  },
  async run() {
    consola.info('[sync:scores] starting')
    try {
      const [success, error, data] = await upsertScoresSnapshotEpoch({
        onProgress: message => consola.info(`[sync:scores] ${message}`),
      })
      if (!success || !data) {
        const scoreError = new Error(error || 'Unable to calculate scores')
        await sendSyncFailureNotification('scores', scoreError)
        consola.error(`[sync:scores] failed: ${scoreError.message}`)
        return { result: { success: false, error } }
      }

      if (data.dataStatus === 'stale') {
        consola.info(`[sync:scores] deferred; ${data.missingEpochs.length} recent epoch(s) missing`)
        return {
          result: {
            success: true,
            dataStatus: 'stale',
            missingEpochs: data.missingEpochs,
            scoreCounts: data.scoreCounts,
            recentCoverage: data.recentCoverage,
            longTermCoverage: data.longTermCoverage,
            backfilledEpochs: data.backfilledEpochs,
          },
        }
      }

      consola.info(`[sync:scores] finished; v1 ${data.scoreCounts.v1}, v2 ${data.scoreCounts.v2}, backfilled ${data.backfilledEpochs.length} epoch(s)`)
      return {
        result: {
          success: true,
          dataStatus: 'complete',
          epochNumber: data.range.toEpoch,
          scoreCounts: data.scoreCounts,
          recentCoverage: data.recentCoverage,
          longTermCoverage: data.longTermCoverage,
          backfilledEpochs: data.backfilledEpochs,
        },
      }
    }
    catch (error) {
      await sendSyncFailureNotification('scores', error)
      consola.error('[sync:scores] failed', error)
      return { result: { success: false, error: String(error) } }
    }
  },
})
