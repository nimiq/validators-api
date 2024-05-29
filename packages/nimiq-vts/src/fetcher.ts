import { Client, ElectionMacroBlock, PolicyConstants, InherentType } from "nimiq-rpc-client-ts";
import { EpochActivity } from "./types";

/**
 * For a given block number, fetches the validator slots assignation.
 * The block number MUST be an election block otherwise it will throw an error.
 */
export async function fetchValidatorSlotsAssignation(client: Client, blockNumber: number, batchesPerEpoch: number, blocksPerBatch: number, genesisBlockNumber: number) {
  const { data: block, error } = await client.blockchain.getBlockByNumber(blockNumber, { includeTransactions: true })
  if (error || !block) throw new Error(JSON.stringify({ blockNumber, error, block }))
  if (!('isElectionBlock' in block)) throw Error(JSON.stringify({ message: 'Block is not election block', blockNumber, block }))

  // The election block will be the first block of the new Epoch, since we only fetch finished epochs, we can assume that all the batches in this epoch can be fetched
  // First, we need to know in which batch this block is. Since batches start at 0, but blocks at genesis, we need to know the genesis block number
  const blockIndex = blockNumber - genesisBlockNumber
  // This is going to be an exact division since we are fetching election blocks
  const firstBatchIndex = blockIndex / blocksPerBatch
  if(firstBatchIndex % 1 !== 0) throw new Error(JSON.stringify({ message: 'Something happened calculating batchIndex', blockIndex, firstBatchIndex, blockNumber, block }))

  // Now we can get all the inherents from every batch in the epoch
  const validatorInherents: Record<string, { rewarded: number, missed: number }> = {}
  for (let i = 0; i < batchesPerEpoch; i++) {
    const { data: inherents, error: errorBatch } = await client.blockchain.getInherentsByBatchNumber(firstBatchIndex + i)
    if (errorBatch || !inherents) throw new Error(JSON.stringify({ blockNumber, errorBatch, i, firstBatchIndex, currentIndex: firstBatchIndex + i }))
    // Inherents can be "reward", "penalize" or "jail". The penalize and jail will be counted as missed slots
    for (const inherent of inherents) {
      if (inherent.type === InherentType.Reward){
        if (!validatorInherents[inherent.validatorAddress]) validatorInherents[inherent.validatorAddress] = { rewarded: 0, missed: 0 }
        validatorInherents[inherent.validatorAddress].rewarded++
      } else if (inherent.type === InherentType.Penalize || inherent.type === InherentType.Jail) {
        if (!validatorInherents[inherent.validatorAddress]) validatorInherents[inherent.validatorAddress] = { rewarded: 0, missed: 0 }
        validatorInherents[inherent.validatorAddress].missed++
      }
    }
  }

  const assignation = (block as ElectionMacroBlock).slots.map(({ numSlots, validator }) => ({ 
    validator,
    assigned: numSlots,
    rewarded: validatorInherents[validator]?.rewarded || 0,
    missed: validatorInherents[validator]?.missed || 0
  }))
  return assignation
}

/**
 * Fetches the activity for the given block numbers. 
 */
export async function fetchEpochsActivity(client: Client, epochBlockNumbers: number[]): Promise<EpochActivity> {
  const { data: policy, error: errorPolicy } = await client.policy.getPolicyConstants();
  if (errorPolicy || !policy) throw new Error(errorPolicy?.message || 'No policy constants');
  const { batchesPerEpoch, blocksPerBatch, genesisBlockNumber } = policy as PolicyConstants & { blockSeparationTime: number, genesisBlockNumber: number };
  const promises = epochBlockNumbers.map(async blockNumber => [blockNumber, await fetchValidatorSlotsAssignation(client, blockNumber, batchesPerEpoch, blocksPerBatch, genesisBlockNumber)])
  return Object.fromEntries(await Promise.all(promises))
}
