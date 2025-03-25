import type { ElectionMacroBlock, NimiqRPCClient } from 'nimiq-rpc-client-ts'
import type { ActiveValidator, CurrentEpoch, EpochActivity, EpochsActivities, ResultSync } from './types'
import { InherentType } from 'nimiq-rpc-client-ts'
import { BATCHES_PER_EPOCH, electionBlockOf, SLOTS } from './policy'

/**
 * For a given block number, fetches the validator slots assignation.
 * The block number MUST be an election block otherwise it will return an error result.
 */
export async function fetchActivity(client: NimiqRPCClient, epochIndex: number, maxRetries = 5): Promise<ResultSync<EpochActivity>> {
  // Epochs start at 1, but election block is the first block of the epoch
  const electionBlock = electionBlockOf(epochIndex)!
  const { data: block, error } = await client.blockchain.getBlockByNumber(electionBlock, { includeBody: false })
  if (error || !block) {
    console.error(JSON.stringify({ epochIndex, error, block }))
    return { error: `Failed to fetch block: ${error}` }
  }
  if (!('isElectionBlock' in block))
    return { error: JSON.stringify({ message: 'Block is not election block', epochIndex, block }) }

  const { data: currentEpoch, error: errorCurrentEpoch } = await client.blockchain.getEpochNumber()
  if (errorCurrentEpoch || !currentEpoch)
    return { error: `There was an error fetching current epoch: ${JSON.stringify({ epochIndex, errorCurrentEpoch, currentEpoch })}` }
  if (epochIndex >= currentEpoch)
    return { error: `You tried to fetch an epoch that is not finished yet: ${JSON.stringify({ epochIndex, currentEpoch })}` }

  // The election block will be the first block of the epoch, since we only fetch finished epochs, we can assume that all the batches in this epoch can be fetched
  // First, we need to know in which batch this block is. Batches start at 1
  const firstBatchIndex = 1 + (epochIndex - 1) * BATCHES_PER_EPOCH
  if (firstBatchIndex % 1 !== 0 || firstBatchIndex < 1)
    // It should be an exact division since we are fetching election blocks
    return { error: JSON.stringify({ message: 'Something happened calculating batchIndex', firstBatchIndex, electionBlock, block }) }

  // Initialize the list of validators and their activity in the epoch
  const epochActivity: EpochActivity = {}
  for (const { numSlots: likelihood, validator } of (block as ElectionMacroBlock).slots) {
    const dominanceRatioViaSlots = likelihood / SLOTS
    const balance = -1
    const dominanceRatioViaBalance = -1
    epochActivity[validator] = { likelihood, missed: 0, rewarded: 0, dominanceRatioViaBalance, dominanceRatioViaSlots, balance, kind: 'active' }
  }

  const maxBatchSize = 120
  const minBatchSize = 10
  let batchSize = maxBatchSize

  const createPromise = async (index: number, retryCount = 0): Promise<ResultSync<void>> => {
    try {
      const { data: inherents, error: errorBatch } = await client.blockchain.getInherentsByBatchNumber(firstBatchIndex + index)
      if (errorBatch || !inherents || inherents.length === 0) {
        const errorMsg = inherents?.length === 0 ? `No inherents found in batch ${firstBatchIndex + index}` : `Batch fetch failed: ${errorBatch}`
        return { error: errorMsg }
      }

      for (const { type, validatorAddress } of inherents) {
        const isStakingAddress = validatorAddress === 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'
        const validatorsExists = !!epochActivity[validatorAddress]
        const validatorIsActive = validatorsExists && epochActivity[validatorAddress].kind === 'active'
        if (isStakingAddress || !validatorIsActive || !validatorsExists)
          continue

        const activity = epochActivity[validatorAddress] as ActiveValidator
        if (type === InherentType.Reward)
          activity.rewarded++
        else if ([InherentType.Penalize, InherentType.Jail].includes(type))
          activity.missed++
      }

      return { data: undefined, error: undefined }
    }
    catch (error) {
      if (retryCount >= maxRetries)
        return { error: `Max retries exceeded for batch ${firstBatchIndex + index}: ${error}` }
      await new Promise(resolve => setTimeout(resolve, 2 ** retryCount * 1000))
      return createPromise(index, retryCount + 1)
    }
  }

  // Process batches with dynamic sizing
  try {
    for (let i = 0; i < BATCHES_PER_EPOCH; i += batchSize) {
      const currentBatchSize = Math.min(batchSize, BATCHES_PER_EPOCH - i)
      const batchPromises = Array.from({ length: currentBatchSize }, (_, j) => createPromise(i + j))

      const results = await Promise.all(batchPromises)
      const failures = results.filter(result => !!result.error).length

      // Adjust batch dominance based on success rate
      if (failures > 0)
        batchSize = Math.max(minBatchSize, Math.floor(batchSize / 2))
      else
        batchSize = Math.min(maxBatchSize, Math.floor(batchSize * 1.5))

      // Check for any remaining errors
      const errors = results
        .filter(result => !!result.error)
        .map(result => result.error)
      if (errors.length > 0) {
        console.error(errors)
        return { error: `Failed to process batches: ${JSON.stringify(errors)}` }
      }
    }

    return { data: epochActivity, error: undefined }
  }
  catch (error) {
    return { error: `Error processing batches: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Fetches the activity for the given block numbers.
 * This function is an asynchronous generator. It yields each activity one by one,
 * allowing the caller to decide when to fetch the next activity.
 *
 * @param client - The client instance to use for fetching validator activities.
 * @param epochsIndexes - An array of epoch block numbers to fetch the activities for.
 * @returns An asynchronous generator yielding objects containing the address, epoch block number, and activity.
 */
export async function* fetchEpochs(client: NimiqRPCClient, epochsIndexes: number[]) {
  for (const epochIndex of epochsIndexes) {
    const activityResult = await fetchActivity(client, epochIndex)

    // If there was an error or validatorActivities is empty, yield null activity
    if (activityResult.error || !activityResult.data || Object.keys(activityResult.data).length === 0) {
      yield { epochIndex, address: '', activity: null }
      continue
    }

    for (const [address, activity] of Object.entries(activityResult.data)) {
      yield { address, epochIndex, activity }
    }
  }
}

export async function fetchCurrentEpoch(client: NimiqRPCClient): Promise<ResultSync<CurrentEpoch>> {
  const { data: currentEpoch, error } = await client.blockchain.getEpochNumber()
  if (error || !currentEpoch)
    return { error: JSON.stringify({ error, currentEpoch }) }

  const { data: activeValidators, error: errorValidators } = await client.blockchain.getActiveValidators()
  if (errorValidators || !activeValidators)
    return { error: JSON.stringify({ errorValidators, activeValidators }) }

  const totalBalance = Object.values(activeValidators).reduce((acc, { balance }) => acc + balance, 0)
  const activity: EpochsActivities = {
    [currentEpoch]: Object.entries(activeValidators).reduce((acc, [, { address, balance }]) => {
      acc[address] = {
        likelihood: -1,
        missed: -1,
        rewarded: -1,
        dominanceRatioViaBalance: balance / totalBalance,
        dominanceRatioViaSlots: -1,
        balance,
        kind: 'active',
      }
      return acc
    }, {} as EpochActivity),
  }

  return {
    data: {
      currentEpoch,
      activity,
      addresses: activeValidators.map(({ address }) => address),
    },
    error: undefined,
  }
}
