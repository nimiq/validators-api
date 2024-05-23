import { Client, ElectionMacroBlock } from "nimiq-rpc-client-ts";
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
 * Fetches the activity for the given block numbers. 
 */
export async function fetchEpochsActivity(client: Client, epochBlockNumbers: number[]): Promise<Record<number, ActivityEpoch>> {
  const promises = epochBlockNumbers.map(async blockNumber => [blockNumber, await fetchValidatorSlotsAssignation(client, blockNumber, 0)])
  return Object.fromEntries(await Promise.all(promises))
}
