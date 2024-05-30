import { Client } from 'nimiq-rpc-client-ts'
import { getRange } from 'nimiq-vts'
import { consola } from 'consola'
import { getMissingEpochs, storeActivities } from '../database/utils'
import { fetchValidatorsActivities, fetchValidatorsActivitiesInEpoch } from '~/packages/nimiq-vts/src'

export default defineTask({
  meta: {
    name: 'fetch',
    description: 'Fetches the necessary data from the blockchain',
  },
  async run() {
    consola.info('Running fetch task...')

    const start = globalThis.performance.now()

    const client = new Client(new URL(useRuntimeConfig().rpcUrl))

    // The range that we will consider
    const range = await getRange(client)
    consola.info(`Fetching data for range: ${JSON.stringify(range)}`)

    // Only fetch the missing epochs that are not in the database
    const epochBlockNumbers = await getMissingEpochs(range)
    consola.info(`Fetching data for epochs: ${JSON.stringify(epochBlockNumbers)}`)
    if (epochBlockNumbers.length === 0)
      return { success: 'No epochs to fetch. Database is up to date' }

    // Fetch the activity for the given epochs
    fetchValidatorsActivities(client, epochBlockNumbers).then(storeActivities)

    return { result: `Task initialized` }
  },
})
