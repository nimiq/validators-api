import { type ElectionMacroBlock, InherentType, type NimiqRPCClient } from 'nimiq-rpc-client-ts'
import { getPolicyConstants } from './utils'
import type { EpochActivity, EpochsActivities } from './types'

// TODO remove Console log

/**
 * For a given block number, fetches the validator slots assignation.
 * The block number MUST be an election block otherwise it will throw an error.
 */
export async function fetchActivity(client: NimiqRPCClient, epochIndex: number) {
  const { batchesPerEpoch, genesisBlockNumber, blocksPerBatch, slots: slotsCount, blocksPerEpoch } = await getPolicyConstants(client)

  const electionBlock = genesisBlockNumber + (epochIndex * blocksPerEpoch)
  const { data: block, error } = await client.blockchain.getBlockByNumber(electionBlock, { includeTransactions: true })
  if (error || !block)
    throw new Error(JSON.stringify({ epochIndex, error, block }))
  if (!('isElectionBlock' in block))
    throw new Error(JSON.stringify({ message: 'Block is not election block', epochIndex, block }))

  const { data: currentEpoch, error: errorCurrentEpoch } = await client.blockchain.getEpochNumber()
  if (errorCurrentEpoch || !currentEpoch)
    throw new Error(`There was an error fetching current epoch: ${JSON.stringify({ epochIndex, errorCurrentEpoch, currentEpoch })}`)
  if (epochIndex >= currentEpoch)
    throw new Error(`You tried to fetch an epoch that is not finished yet: ${JSON.stringify({ epochIndex, currentEpoch })}`)

  // The election block will be the first block of the epoch, since we only fetch finished epochs, we can assume that all the batches in this epoch can be fetched
  // First, we need to know in which batch this block is. Batches start at 0
  const firstBatchIndex = (electionBlock - genesisBlockNumber) / blocksPerBatch
  if (firstBatchIndex % 1 !== 0)
    // It should be an exact division since we are fetching election blocks
    throw new Error(JSON.stringify({ message: 'Something happened calculating batchIndex', firstBatchIndex, electionBlock, block }))

  // Initialize the list of validators and their activity in the epoch
  const epochActivity: EpochActivity = {}
  for (const { numSlots: likelihood, validator } of (block as ElectionMacroBlock).slots) {
    epochActivity[validator] = { likelihood, missed: 0, rewarded: 0, sizeRatio: likelihood / slotsCount, sizeRatioViaSlots: true }
  }

  const maxBatchSize = 120
  const minBatchSize = 10
  let batchSize = maxBatchSize
  for (let i = 0; i < batchesPerEpoch; i += batchSize) {
    const batchPromises = Array.from({ length: Math.min(batchSize, batchesPerEpoch - i) }, (_, j) => createPromise(i + j))

    let results = await Promise.allSettled(batchPromises)

    let rejectedIndexes: number[] = results.reduce((acc: number[], result, index) => {
      if (result.status === 'rejected') {
        acc.push(index)
      }
      return acc
    }, [])

    if (rejectedIndexes.length > 0) {
      // Lowering the batch size to prevent more rejections
      batchSize = Math.max(minBatchSize, Math.floor(batchSize / 2))
    }
    else {
      // Increasing the batch size to speed up the process
      batchSize = Math.min(maxBatchSize, Math.floor(batchSize + batchSize / 2))
    }

    while (rejectedIndexes.length > 0) {
      const retryPromises = rejectedIndexes.map(index => createPromise(i + index))
      results = await Promise.allSettled(retryPromises)

      rejectedIndexes = results.reduce((acc: number[], result, index) => {
        if (result.status === 'rejected') {
          acc.push(rejectedIndexes[index])
        }
        return acc
      }, [])
    }
  }

  async function createPromise(index: number) {
    const { data: inherents, error: errorBatch } = await client.blockchain.getInherentsByBatchNumber(firstBatchIndex + index)
    return new Promise<void>((resolve, reject) => {
      if (errorBatch || !inherents) {
        reject(JSON.stringify({ epochIndex, blockNumber: electionBlock, errorBatch, index, firstBatchIndex, currentIndex: firstBatchIndex + index }))
      }
      else {
        for (const { type, validatorAddress } of inherents) {
          if (validatorAddress === 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000')
            continue
          if (!epochActivity[validatorAddress])
            continue
          epochActivity[validatorAddress].rewarded += type === InherentType.Reward ? 1 : 0
          epochActivity[validatorAddress].missed += [InherentType.Penalize, InherentType.Jail].includes(type) ? 1 : 0
        }
        resolve()
      }
    })
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
  const epochActivity: EpochsActivities = {
    [currentEpoch]: Object.entries(activeValidators).reduce((acc, [, { address, balance }]) => {
      acc[address] = { likelihood: -1, missed: -1, rewarded: -1, sizeRatio: balance / totalBalance, sizeRatioViaSlots: false }
      return acc
    }, {} as EpochActivity),
  }
  return epochActivity
}
