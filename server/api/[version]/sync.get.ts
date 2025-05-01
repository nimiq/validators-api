import type { SyncStream } from '~~/server/utils/types'
import { createConsola } from 'consola'
import { initRpcClient } from 'nimiq-rpc-client-ts/config'
import { isDevelopment } from 'std-env'

const consola = createConsola({ defaults: { tag: 'sync' } })

export default defineEventHandler(async (event) => {
  const eventStream = createEventStream(event)
  const controller = new AbortController()

  // Handle client disconnection by aborting the controller
  eventStream.onClosed(async () => {
    consola.info('Client disconnected, aborting sync process')
    controller.abort()
    await eventStream.close()
  })

  function report(json: SyncStream) {
    const method = json.kind === 'error' ? 'error' : json.kind === 'success' ? 'success' : 'log'
    consola[method](json.message)
    eventStream.push(JSON.stringify(json))
    if (json.kind === 'error') {
      eventStream.close()
      throw createError(json.message)
    }
    if (controller.signal.aborted && json.message !== 'Sync process aborted') {
      consola.warn('Sync process aborted')
      report({ kind: 'log', message: 'Sync process aborted' })
    }
  }

  if (!useRuntimeConfig().albatrossRpcNodeUrl)
    throw createError('No Albatross RPC Node URL')
  initRpcClient({ url: useRuntimeConfig().albatrossRpcNodeUrl })
  report({ kind: 'log', message: 'Starting syncing...' })

  // We need to return the event stream to the client first
  setTimeout(async () => {
    try {
      const source = isDevelopment ? 'filesystem' : 'github'
      const { nimiqNetwork, gitBranch } = useRuntimeConfig().public
      const [importSuccess, errorImport, importData] = await importValidators(source, { nimiqNetwork, gitBranch })
      if (!importSuccess || !importData)
        return report({ kind: 'error', message: errorImport || 'Unable to import from GitHub' })
      report({ kind: 'success', payload: importData, message: `Fetched ${importData.length} validators` })

      // Pass the controller to fetchMissingEpochs for proper abort handling
      const [fetchEpochsSuccess, fetchEpochsError, fetchEpochsData] = await fetchMissingEpochs({ report, controller })
      if (!fetchEpochsSuccess || !fetchEpochsData)
        return report({ kind: 'error', message: fetchEpochsError || 'Unable to fetch missing epochs' })
      report({ kind: 'success', payload: fetchEpochsData, message: `Fetched ${fetchEpochsData.length} missing epochs` })

      const [fetchActiveEpochSuccess, fetchActiveEpochError, fetchActiveEpochData] = await fetchActiveEpoch()
      if (!fetchActiveEpochSuccess || !fetchActiveEpochData)
        return report({ kind: 'error', message: fetchActiveEpochError || 'Unable to fetch active epoch' })
      report({ kind: 'log', message: `Fetched active epoch: ${fetchActiveEpochData.epochNumber}`, payload: fetchActiveEpochData })

      const [scoresSuccess, errorScores, scores] = await upsertScoresSnapshotEpoch()
      if (!scoresSuccess || !scores)
        return report({ kind: 'error', message: errorScores || 'Unable to fetch scores' })
      report({ kind: 'success', payload: scores, message: `Fetched scores` })

      const supplyData = await $fetch('/api/v1/supply')
      report({ kind: 'success', payload: supplyData, message: 'Fetched distribution data' })

      report({ kind: 'success', message: 'Sync process completed' })
    }
    catch (e) {
      report({ kind: 'error', message: JSON.stringify(e) })
    }
  })

  return eventStream.send()
})
