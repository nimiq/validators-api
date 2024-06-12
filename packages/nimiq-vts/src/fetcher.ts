import { type Client, type ElectionMacroBlock, InherentType } from "nimiq-rpc-client-ts";
import type { ValidatorActivity } from "./types"
import { getPolicyConstants } from "./utils"

/**
 * For a given block number, fetches the validator slots assignation.
 * The block number MUST be an election block otherwise it will throw an error.
 */
export async function fetchValidatorsActivitiesInEpoch(client: Client, blockNumber: number) {
  const start = globalThis.performance.now()
  // TODO: change this to fetching epoch n...
  console.info(`Fetching slots assignation for block ${blockNumber}`)
  const { batchesPerEpoch, genesisBlockNumber, blocksPerBatch } = await getPolicyConstants(client)
  const { data: block, error } = await client.blockchain.getBlockByNumber(blockNumber, { includeTransactions: true })
  if (error || !block) throw new Error(JSON.stringify({ blockNumber, error, block }))
  if (!('isElectionBlock' in block)) throw Error(JSON.stringify({ message: 'Block is not election block', blockNumber, block }))

  // The election block will be the first block of the new Epoch, since we only fetch finished epochs, we can assume that all the batches in this epoch can be fetched
  // First, we need to know in which batch this block is. Since batches start at 0, but blocks at genesis, we need to know the genesis block number
  const blockIndex = blockNumber - genesisBlockNumber
  // This is going to be an exact division since we are fetching election blocks
  const firstBatchIndex = blockIndex / blocksPerBatch
  if (firstBatchIndex % 1 !== 0) throw new Error(JSON.stringify({ message: 'Something happened calculating batchIndex', blockIndex, firstBatchIndex, blockNumber, block }))

  // Initialize the list of validators and their activity in the epoch
  const validatorsActivity: ValidatorActivity = {}
  for (const { numSlots: likelihood, validator } of (block as ElectionMacroBlock).slots) {
    validatorsActivity[validator] = { likelihood, missed: 0, rewarded: 0 }
  }

  const maxBatchSize = 120;
  const minBatchSize = 10;
  let batchSize = maxBatchSize;
  for (let i = 0; i < batchesPerEpoch; i += batchSize) {
    const batchPromises = Array.from({ length: Math.min(batchSize, batchesPerEpoch - i) }, (_, j) => createPromise(i + j));

    let results = await Promise.allSettled(batchPromises);

    let rejectedIndexes: number[] = results.reduce((acc: number[], result, index) => {
      if (result.status === 'rejected') {
        acc.push(index);
      }
      return acc;
    }, []);

    if (rejectedIndexes.length > 0) {
      // Lowering the batch size to prevent more rejections
      batchSize = Math.max(minBatchSize, Math.floor(batchSize / 2))
      console.log(`Decreasing batch size to ${batchSize}`)
    } else {
      batchSize = Math.min(maxBatchSize,  Math.floor(batchSize + batchSize / 2))
      if(batchSize !== maxBatchSize)
        console.log(`Increasing batch size to ${batchSize}`)
    }

    while (rejectedIndexes.length > 0) {
      const retryPromises = rejectedIndexes.map(index => createPromise(i + index));
      console.log(`Retrying ${rejectedIndexes.length} batches for block ${blockNumber}`);
      results = await Promise.allSettled(retryPromises);

      rejectedIndexes = results.reduce((acc: number[], result, index) => {
        if (result.status === 'rejected') {
          acc.push(rejectedIndexes[index]);
        }
        return acc;
      }, []);
    }
  }

  async function createPromise(index: number) {
    const { data: inherents, error: errorBatch } = await client.blockchain.getInherentsByBatchNumber(firstBatchIndex + index)
    return new Promise<void>((resolve, reject) => {
      if (errorBatch || !inherents) {
        reject(JSON.stringify({ blockNumber, errorBatch, index, firstBatchIndex, currentIndex: firstBatchIndex + index }));
      } else {
        for (const { type, validatorAddress } of inherents) {
          if (validatorAddress === 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000') continue
          if (!validatorsActivity[validatorAddress]) continue
          validatorsActivity[validatorAddress].rewarded += type === InherentType.Reward ? 1 : 0
          validatorsActivity[validatorAddress].missed += [InherentType.Penalize, InherentType.Jail].includes(type) ? 1 : 0
        }
        resolve();
      }
    });
  }

  const end = globalThis.performance.now()
  const seconds = Math.floor((end - start) / 1000)
  console.log(`Fetched slots assignation for block ${blockNumber} in ${seconds} seconds.`)

  return validatorsActivity
}

/**
 * Fetches the activity for the given block numbers.
 * This function is an asynchronous generator. It yields each activity one by one,
 * allowing the caller to decide when to fetch the next activity.
 *
 * @param client - The client instance to use for fetching validator activities.
 * @param epochBlockNumbers - An array of epoch block numbers to fetch activities for.
 * @returns An asynchronous generator yielding objects containing the address, epoch block number, and activity.
 *
 * Usage:
 * const activitiesGenerator = fetchValidatorsActivities(client, epochBlockNumbers);
 * for await (const { key, activity } of activitiesGenerator) {
 *   console.log(`Address: ${key.address}, Epoch: ${key.epochBlockNumber}, Activity: ${activity}`);
 * }
 */
export async function* fetchValidatorsActivities(client: Client, epochBlockNumbers: number[]) {
  for (const epochBlockNumber of epochBlockNumbers) {
    const validatorActivities = await fetchValidatorsActivitiesInEpoch(client, epochBlockNumber);
    for (const [address, activity] of Object.entries(validatorActivities)) {
      yield { key: { address, epochBlockNumber }, activity };
    }
  }
}
