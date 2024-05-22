import { Client, ElectionMacroBlock, PolicyConstants } from "nimiq-rpc-client-ts";
import { ActivityEpoch } from "./types";

/**
 * For a given block number, fetches the validator slots assignation.
 * The block number MUST be an election block otherwise it will throw an error.
 */
export async function fetchValidatorSlotsAssignation(client: Client, blockNumber: number, missed: number) {
  const { data: block, error } = await client.blockchain.getBlockByNumber(blockNumber, { includeTransactions: true })
  if (error || !block) throw new Error(JSON.stringify({ blockNumber, error, block }))
  if (!('isElectionBlock' in block)) throw Error(JSON.stringify({ message: 'Block is not election block', blockNumber, block }))
  const assignation = (block as ElectionMacroBlock).slots.map(({ numSlots, validator }) => ({ validator, assigned: numSlots, missed }))
  return assignation
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

  const toBlockNumber = (epochIndex: number) => genesisBlockNumber + epochIndex * blocksPerEpoch

  for (const epochIndex of epochsIndexes)
    activities[epochIndex] = await fetchValidatorSlotsAssignation(client, toBlockNumber(epochIndex), 0)

  return activities
}
