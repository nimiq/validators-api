import type { NimiqRPCClient } from 'nimiq-rpc-client-ts'
import type { ValidatorsActivities } from 'nimiq-vts'
import { fetchValidatorsActivities, getRange } from 'nimiq-vts'
import { consola } from 'consola'
import { getMissingEpochs, getMissingValidators, storeActivities, storeValidator } from '../database/utils'

const EPOCHS_IN_PARALLEL = 2

let running = false

export async function fetchVtsData(client: NimiqRPCClient) {
  if (running) {
    consola.info('Task is already running')
    return
  }

  try {
    running = true
    consola.info('Fetching data for VTS...')
    const epochBlockNumbers = await fetchEpochs(client)

    // We need to fetch the data of the active validators that are active in the current epoch
    // but we don't have the data yet.
    const { data: activeValidators, error: errorActiveValidators } = await client.blockchain.getActiveValidators()
    if (errorActiveValidators || !activeValidators)
      throw new Error(errorActiveValidators.message || 'No active validators')
    const addressesCurrentValidators = activeValidators.map(v => v.address)
    const missingValidators = await getMissingValidators(addressesCurrentValidators)
    await Promise.all(missingValidators.map(missingValidator => storeValidator(missingValidator)))
    return { epochBlockNumbers, missingValidators, addressesCurrentValidators }
  }
  catch (error) {
    consola.error(error)
    throw error
  }
  finally {
    running = false
  }
}

async function fetchEpochs(client: NimiqRPCClient) {
  // The range that we will consider
  const range = await getRange(client)
  consola.info(`Fetching data for range: ${JSON.stringify(range)}`)

  // Only fetch the missing epochs that are not in the database
  const epochBlockNumbers = await getMissingEpochs(range)
  consola.info(`Fetching data for epochs: ${JSON.stringify(epochBlockNumbers)}`)
  if (epochBlockNumbers.length === 0)
    return []

  const activitiesGenerator = fetchValidatorsActivities(client, epochBlockNumbers)

  // We fetch epochs 3 by 3 in parallel and store them in the database
  while (true) {
    const start = globalThis.performance.now()
    const epochsActivities: ValidatorsActivities = new Map()
    for (let i = 0; i < EPOCHS_IN_PARALLEL; i++) {
      const { value: pair, done } = await activitiesGenerator.next()
      if (done)
        break
      epochsActivities.set(pair.key, pair.activity)
    }

    const end = globalThis.performance.now()
    const seconds = (end - start) / 1000
    consola.info(`Fetched ${epochsActivities.size} epochs in ${seconds} seconds`)

    if (epochsActivities.size === 0)
      break
    await storeActivities(epochsActivities)
  }

  return epochBlockNumbers
}
