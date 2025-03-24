import type { NimiqRPCClient } from 'nimiq-rpc-client-ts'
import type { EpochsActivities } from 'nimiq-validator-trustscore/types'
import { consola } from 'consola'
import { fetchCurrentEpoch, fetchEpochs } from 'nimiq-validator-trustscore/fetcher'
import { getRange } from 'nimiq-validator-trustscore/utils'
import { findMissingEpochs, storeActivities, storeSingleActivity } from '../utils/activities'
import { categorizeValidators, fetchValidatorBalances, storeValidator } from '../utils/validators'

const EPOCHS_IN_PARALLEL = 3

let running = false

export async function getActiveValidators(client: NimiqRPCClient) {
  const { data: activeValidators, error: errorActiveValidators } = await client.blockchain.getActiveValidators()
  if (errorActiveValidators || !activeValidators)
    throw new Error(errorActiveValidators.message || 'No active validators')
  return activeValidators
}

// TODO rename to retrieveActivities or something with activity
/**
 * Fetches the required data for computing the score.
 * The dominance ratio parameter can be obtained via two different methods:
 * 1. Knowing the slots assignation of the validator relative to the total amount of slots in the epoch
 *    We can retrieve this data from the election blocks
 * 2. From the balance of the validators relative to the other validators in the epoch
 *    We can retrieve this data only when the epoch is active, and this is the prefered method as it is more precise but
 *    it is not reliable
 *
 * @param client
 */
export async function retrieveActivity(client: NimiqRPCClient) {
  if (running) {
    consola.info('Task is already running')
    return
  }

  try {
    running = true
    const missingEpochs = await fetchMissingEpochs(client)
    const { missingValidators, addresses: addressesCurrentValidators } = await fetchActiveEpoch(client)
    return { missingEpochs, missingValidators, addressesCurrentValidators }
  }
  catch (error) {
    consola.error(error)
    throw error
  }
  finally {
    running = false
  }
}

/**
 * Fetches the activities of the epochs that have finished and are missing in the database.
 */
async function fetchMissingEpochs(client: NimiqRPCClient) {
  // The range that we will consider
  const range = await getRange(client)
  consola.info(`Fetching data for range: ${JSON.stringify(range)}`)

  // Only fetch the missing epochs that are not in the database
  const missingEpochs = await findMissingEpochs(range)
  consola.info(`Fetching missing epochs: ${JSON.stringify(missingEpochs)}`)
  if (missingEpochs.length === 0)
    return []

  const fetchedEpochs = []
  const epochGenerator = fetchEpochs(client, missingEpochs)

  while (true) {
    const epochsActivities: EpochsActivities = {}

    // Fetch the activities in parallel
    for (let i = 0; i < EPOCHS_IN_PARALLEL; i++) {
      const { value: pair, done } = await epochGenerator.next()
      if (done || !pair)
        break
      if (pair.activity === null) {
        consola.warn(`Epoch ${pair.epochIndex} is missing`, pair)
        await storeSingleActivity({ address: '', activity: null, epochNumber: pair.epochIndex })
        continue
      }
      if (!epochsActivities[`${pair.epochIndex}`])
        epochsActivities[`${pair.epochIndex}`] = {}
      const epoch = epochsActivities[`${pair.epochIndex}`]
      if (!epoch[pair.address])
        epoch[pair.address] = pair.activity
    }

    const epochs = Object.keys(epochsActivities).map(Number)
    fetchedEpochs.push(...epochs)
    const newestEpoch = Math.max(...fetchedEpochs)
    const percentage = Math.round((fetchedEpochs.length / missingEpochs.length) * 100).toFixed(2)
    consola.info(`Fetched ${newestEpoch} epochs. ${percentage}%`)

    if (epochs.length === 0 && (await findMissingEpochs(range)).length === 0)
      break

    await storeActivities(epochsActivities)
  }

  return missingEpochs
}

async function fetchActiveEpoch(client: NimiqRPCClient) {
  // We need to fetch the data of the active validators that are active in the current epoch
  // but we don't have the data yet.
  const epoch = await fetchCurrentEpoch(client)
  const { missingValidators, inactiveValidators } = await categorizeValidators(epoch.addresses)

  // Store new validators
  await Promise.all(missingValidators.map(missingValidator => storeValidator(missingValidator)))

  // Handle inactive validators - fetch their balances and store them
  if (inactiveValidators.length > 0) {
    const inactiveBalances = await fetchValidatorBalances(client, inactiveValidators)

    // Add inactive validator balances to the epoch activity
    for (const { address, balance } of inactiveBalances) {
      if (!epoch.activity[epoch.currentEpoch])

        epoch.activity[epoch.currentEpoch][address] = { balance, kind: 'inactive' }
    }
  }

  await storeActivities(epoch.activity)
  return { missingValidators, inactiveValidators, ...epoch }
}
