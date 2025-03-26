import type { NimiqRPCClient } from 'nimiq-rpc-client-ts'
import type { CurrentEpoch, EpochActivity, EpochsActivities, Result } from 'nimiq-validator-trustscore/types'
import { consola } from 'consola'
import { fetchCurrentEpoch, fetchEpochs } from 'nimiq-validator-trustscore/fetcher'
import { getRange } from 'nimiq-validator-trustscore/range'
import { findMissingEpochs, storeActivities, storeSingleActivity } from './activities'
import { getStoredValidatorsAddress } from './validators'

const EPOCHS_IN_PARALLEL = 3

/**
 * Fetches the activities of the epochs that have finished and are missing in the database.
 */
export async function fetchMissingEpochs(client: NimiqRPCClient): Result<number[]> {
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
      const { value: epochActivity, done } = await epochGenerator.next()
      if (done || !epochActivity)
        break
      if (epochActivity.activity === null) {
        consola.warn(`Epoch ${epochActivity.epochIndex} is missing`, epochActivity)
        await storeSingleActivity({ address: '', activity: null, epochNumber: epochActivity.epochIndex })
        continue
      }
      if (!epochsActivities[`${epochActivity.epochIndex}`])
        epochsActivities[`${epochActivity.epochIndex}`] = {}
      const epoch = epochsActivities[`${epochActivity.epochIndex}`]!
      if (!epoch[epochActivity.address])
        epoch[epochActivity.address] = epochActivity.activity
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

export async function fetchActiveEpoch(client: NimiqRPCClient): Result<CurrentEpoch> {
  const dbAddresses = await getStoredValidatorsAddress()
  const { data, error } = await fetchCurrentEpoch(client, dbAddresses)
  if (error || !data)
    return { error: error || 'No active epoch' }

  // Now we transform the data so we can use the same functions as if the epoch was finished
  // The following fields are the ones that cannot be computed at the moment, and we will compute them later
  const emptyActivity = { likelihood: -1, missed: -1, rewarded: -1 } as const
  const activity: EpochActivity = {}
  for (const { address, ...rest } of data.validators)
    activity[address] = { ...emptyActivity, ...rest }
  const epochActivity: EpochsActivities = { [data.epochNumber]: activity }
  await storeActivities(epochActivity)

  return { data }
}
