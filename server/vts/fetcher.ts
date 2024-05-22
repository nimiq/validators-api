import { Client, ElectionMacroBlock, PolicyConstants } from "nimiq-rpc-client-ts";
import { consola } from 'consola'
import { ActivityEpoch, AsyncResult } from "./types";

/**
 * For a given block number, fetches the validator slots assignation.
 * The block number MUST be an election block otherwise it will throw an error.
 */
export async function fetchValidatorSlotsAssignation(client: Client, blockNumber: number, missed: number): AsyncResult<ActivityEpoch> {
  const { data: block, error } = await client.blockchain.getBlockByNumber(blockNumber, { includeTransactions: true })
  if (error || !block) throw new Error(JSON.stringify({ blockNumber, error, block }))
  if (!('isElectionBlock' in block)) throw Error(JSON.stringify({ message: 'Block is not election block', blockNumber, block }))
  const data = (block as ElectionMacroBlock).slots.map(({ numSlots, validator }) => ({ validator, assigned: numSlots, missed }))
  return { data, error: undefined };
}

/**
 * Fetches the activity for a range of epochs and stores it in the database. 
 * 
 * It will fetch the activity epoch by epoch and store it in the database. It will go from the last epoch to the first epoch.
 * 
 * @param client The RPC client
 * @param customRange The range to fetch the activity. Optional.
 */
export async function fetchEpochsActivity(client: Client, epochsIndexes: number[]) {
  const { data: policy, error: errorPolicy } = await client.policy.getPolicyConstants()
  if (errorPolicy) throw new Error(JSON.stringify({ errorPolicy, policy }))
  const { blocksPerEpoch, genesisBlockNumber } = policy as PolicyConstants & { genesisBlockNumber: number }

  const activities: Record<number, ActivityEpoch> = {}

  for (const epochIndex of epochsIndexes) {
    const blockNumber = genesisBlockNumber + epochIndex * blocksPerEpoch
    const { data: activity, error } = await fetchValidatorSlotsAssignation(client, blockNumber, 0)
    if (error || !activity) throw new Error(JSON.stringify({ epochIndex, blockNumber, error, activity }))
    activities[epochIndex] = activity
  }

  consola.success(`Fetched ${epochsIndexes.length} epochs`)
  return activities
}
