import type { EpochActivity, EpochsActivities } from './types'
import { type ElectionMacroBlock, InherentType, type NimiqRPCClient } from 'nimiq-rpc-client-ts'
import { getPolicyConstants } from './utils'

/**
 * For a given block number, fetches the validator slots assignation.
 * The block number MUST be an election block otherwise it will throw an error.
 */
export async function fetchActivity(client: NimiqRPCClient, epochIndex: number, maxRetries = 5): Promise<EpochActivity> {
  const { batchesPerEpoch, genesisBlockNumber, slots: slotsCount, blocksPerEpoch } = await getPolicyConstants(client)

  // Epochs start at 1, but election block is the first block of the epoch
  const electionBlock = genesisBlockNumber + ((epochIndex - 1) * blocksPerEpoch)
  const { data: block, error } = await client.blockchain.getBlockByNumber(electionBlock, { includeBody: false })
  if (error || !block) {
    console.error(JSON.stringify({ epochIndex, error, block }))
    return {}
  }
  if (!('isElectionBlock' in block))
    throw new Error(JSON.stringify({ message: 'Block is not election block', epochIndex, block }))

  const { data: currentEpoch, error: errorCurrentEpoch } = await client.blockchain.getEpochNumber()
  if (errorCurrentEpoch || !currentEpoch)
    throw new Error(`There was an error fetching current epoch: ${JSON.stringify({ epochIndex, errorCurrentEpoch, currentEpoch })}`)
  if (epochIndex >= currentEpoch)
    throw new Error(`You tried to fetch an epoch that is not finished yet: ${JSON.stringify({ epochIndex, currentEpoch })}`)

  // The election block will be the first block of the epoch, since we only fetch finished epochs, we can assume that all the batches in this epoch can be fetched
  // First, we need to know in which batch this block is. Batches start at 1
  const firstBatchIndex = 1 + (epochIndex - 1) * batchesPerEpoch
  if (firstBatchIndex % 1 !== 0 || firstBatchIndex < 1)
    // It should be an exact division since we are fetching election blocks
    throw new Error(JSON.stringify({ message: 'Something happened calculating batchIndex', firstBatchIndex, electionBlock, block }))

  // Initialize the list of validators and their activity in the epoch
  const epochActivity: EpochActivity = {}
  for (const { numSlots: likelihood, validator } of (block as ElectionMacroBlock).slots) {
    const dominanceRatioViaSlots = likelihood / slotsCount
    const balance = -1
    const dominanceRatioViaBalance = -1
    epochActivity[validator] = { likelihood, missed: 0, rewarded: 0, dominanceRatioViaBalance, dominanceRatioViaSlots, balance }
  }

  const maxBatchSize = 120
  const minBatchSize = 10
  let batchSize = maxBatchSize

  const createPromise = async (index: number, retryCount = 0): Promise<void> => {
    try {
      const { data: inherents, error: errorBatch } = await client.blockchain.getInherentsByBatchNumber(firstBatchIndex + index)
      if (errorBatch || !inherents || inherents.length === 0)
        throw new Error(inherents?.length === 0 ? `No inherents found in batch ${firstBatchIndex + index}` : `Batch fetch failed: ${errorBatch}`)

      for (const { type, validatorAddress } of inherents) {
        if (validatorAddress === 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000' || !epochActivity[validatorAddress])
          continue

        if (type === InherentType.Reward)
          epochActivity[validatorAddress].rewarded++
        else if ([InherentType.Penalize, InherentType.Jail].includes(type))
          epochActivity[validatorAddress].missed++
      }
    }
    catch (error) {
      if ((error as Error).message.includes('No inherents found'))
        throw error
      if (retryCount >= maxRetries)
        throw new Error(`Max retries exceeded for batch ${firstBatchIndex + index}: ${error}`)

      await new Promise(resolve => setTimeout(resolve, 2 ** retryCount * 1000))
      return createPromise(index, retryCount + 1)
    }
  }

  // Process batches with dynamic sizing
  for (let i = 0; i < batchesPerEpoch; i += batchSize) {
    const currentBatchSize = Math.min(batchSize, batchesPerEpoch - i)
    const batchPromises = Array.from({ length: currentBatchSize }, (_, j) => createPromise(i + j))

    const results = await Promise.allSettled(batchPromises)
    const failures = results.filter(result => result.status === 'rejected').length

    // Adjust batch dominance based on success rate
    if (failures > 0)
      batchSize = Math.max(minBatchSize, Math.floor(batchSize / 2))
    else
      batchSize = Math.min(maxBatchSize, Math.floor(batchSize * 1.5))

    // Check for any remaining errors
    const errors = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map(result => result.reason)
    if (errors.length > 0) {
      console.error(errors)
      throw new Error(`Failed to process batches: ${JSON.stringify(errors)}`)
    }
  }

  return epochActivity
}

/**
 * Fetches the activity for the given block numbers.
 * This function is an asynchronous generator. It yields each activity one by one,
 * allowing the caller to decide when to fetch the next activity.
 *
 * @param client - The client instance to use for fetching validator activities.
 * @param epochsIndexes - An array of epoch block numbers to fetch the activities for.
 * @returns An asynchronous generator yielding objects containing the address, epoch block number, and activity.
 *
 * Usage:
 * const activitiesGenerator = fetchActivities(client, epochBlockNumbers);
 * for await (const { key, activity } of activitiesGenerator) {
 *   console.log(`Address: ${key.address}, Epoch: ${key.epochBlockNumber}, Activity: ${activity}`);
 * }
 */
export async function* fetchEpochs(client: NimiqRPCClient, epochsIndexes: number[]) {
  for (const epochIndex of epochsIndexes) {
    const validatorActivities = await fetchActivity(client, epochIndex)
    // If validatorActivities is empty, it means that the epoch cannot be fetched
    if (Object.keys(validatorActivities).length === 0)
      yield { epochIndex, address: '', activity: null }
    for (const [address, activity] of Object.entries(validatorActivities)) {
      yield { address, epochIndex, activity }
    }
  }
}

export async function fetchCurrentEpoch(client: NimiqRPCClient) {
  const { data: currentEpoch, error } = await client.blockchain.getEpochNumber()
  if (error || !currentEpoch)
    throw new Error(JSON.stringify({ error, currentEpoch }))
  const { data: activeValidators, error: errorValidators } = await client.blockchain.getActiveValidators()
  if (errorValidators || !activeValidators)
    throw new Error(JSON.stringify({ errorValidators, activeValidators }))
  const totalBalance = Object.values(activeValidators).reduce((acc, { balance }) => acc + balance, 0)
  const activity: EpochsActivities = {
    [currentEpoch]: Object.entries(activeValidators).reduce((acc, [, { address, balance }]) => {
      acc[address] = { likelihood: -1, missed: -1, rewarded: -1, dominanceRatioViaBalance: balance / totalBalance, dominanceRatioViaSlots: -1, balance }
      return acc
    }, {} as EpochActivity),
  }
  return { activity, addresses: activeValidators.map(({ address }) => address) }
}
