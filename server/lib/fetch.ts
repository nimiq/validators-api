import type { NimiqRPCClient } from 'nimiq-rpc-client-ts'
import type { CurrentEpoch, EpochsActivities, Result } from 'nimiq-validator-trustscore/types'
import { consola } from 'consola'
import { fetchCurrentEpoch, fetchEpochs } from 'nimiq-validator-trustscore/fetcher'
import { getRange } from 'nimiq-validator-trustscore/utils'
import { findMissingEpochs, storeActivities, storeSingleActivity } from '../utils/activities'
import { categorizeValidators, fetchValidatorBalances, storeValidator } from '../utils/validators'

const EPOCHS_IN_PARALLEL = 3

let running = false

interface FetchActivityResult {
  missingEpochs: number[]
  missingValidators: string[]
  addressesCurrentValidators: string[]
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
export async function retrieveActivity(client: NimiqRPCClient): Result<FetchActivityResult> {
  if (running)
    return { error: 'Task is already running' }

  running = true

  async function _retrieveActivity() {
    const [missingEpochsRes, activeEpochRes] = await Promise.all([fetchMissingEpochs(client), fetchActiveEpoch(client)])
    if (missingEpochsRes.error || activeEpochRes.error)
      return { error: 'Failed to fetch activities' }
    const missingEpochs = missingEpochsRes.data!
    const { missingValidators, addresses: addressesCurrentValidators } = activeEpochRes.data!
    return { data: { missingEpochs, missingValidators, addressesCurrentValidators } }
  }

  running = false

  const result = await _retrieveActivity()
  return result
}

/**
 * Fetches the activities of the epochs that have finished and are missing in the database.
 */
async function fetchMissingEpochs(client: NimiqRPCClient): Result<number[]> {
  // The range that we will consider
  const { data: range, error: errorRange } = await getRange(client)
  if (errorRange || !range)
    return { error: errorRange || 'No range' }

  consola.info(`Fetching data for range: ${JSON.stringify(range)}`)
  // Only fetch the missing epochs that are not in the database
  const missingEpochs = await findMissingEpochs(range)
  consola.info(`Fetching missing epochs: ${JSON.stringify(missingEpochs)}`)
  if (missingEpochs.length === 0)
    return { data: [] }

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

  return { data: missingEpochs }
}

interface FetchActiveEpochResult extends CurrentEpoch {
  missingValidators: string[]
  inactiveValidators: string[]
}
async function fetchActiveEpoch(client: NimiqRPCClient): Result<FetchActiveEpochResult> {
  // We need to fetch the data of the active validators that are active in the current epoch
  // but we don't have the data yet.
  const { data: epoch, error } = await fetchCurrentEpoch(client)
  if (error || !epoch)
    return { error: error || 'No active epoch' }

  const { missingValidators, inactiveValidators } = await categorizeValidators(epoch.addresses)

  // Store new validators
  const res = await Promise.allSettled(missingValidators.map(missingValidator => storeValidator(missingValidator)))
  const rejected = res.filter(result => result.status === 'rejected')
  if (rejected.length > 0) {
    consola.warn('Failed to store some validators', rejected)
    return { error: `Failed to store some validators: ${JSON.stringify(rejected)}` }
  }

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
  return { data: { missingValidators, inactiveValidators, ...epoch } }
}
