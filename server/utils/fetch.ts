import type { NimiqRPCClient } from 'nimiq-rpc-client-ts'
import type { CurrentEpoch, EpochsActivities, Result } from 'nimiq-validator-trustscore/types'
import { consola } from 'consola'
import { fetchCurrentEpoch, fetchEpochs } from 'nimiq-validator-trustscore/fetcher'
import { getRange } from 'nimiq-validator-trustscore/utils'
import { findMissingEpochs, storeActivities, storeSingleActivity } from './activities'
import { categorizeValidators, fetchValidatorBalances } from './validators'

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
      const epoch = epochsActivities[`${epochActivity.epochIndex}`]
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

interface FetchActiveEpochResult extends CurrentEpoch {
  missingValidators: string[]
  inactiveValidators: string[]
}
export async function fetchActiveEpoch(client: NimiqRPCClient): Result<FetchActiveEpochResult> {
  const { data: epoch, error } = await fetchCurrentEpoch(client)
  if (error || !epoch)
    return { error: error || 'No active epoch' }

  const activityInEpoch = epoch.activity[epoch.currentEpoch]
  const { missingValidators, inactiveValidators, validators } = await categorizeValidators(epoch.addresses)

  const balances = await fetchValidatorBalances(client, validators)
  for (const { address, balance } of balances) {
    if (inactiveValidators.includes(address))
      activityInEpoch[address] = { balance, kind: 'inactive' }
    else
      activityInEpoch[address].balance = balance
  }

  await storeActivities(epoch.activity)

  return { data: { missingValidators, inactiveValidators, ...epoch } }
}
