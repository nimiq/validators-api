import { Client, type ElectionMacroBlock, InherentType } from "nimiq-rpc-client-ts"
import type { Activity, ValidatorActivity, ValidatorsActivities } from "./types"
import { getPolicyConstants } from "./utils"

/**
 * For a given block number, fetches the validator slots assignation.
 * The block number MUST be an election block otherwise it will throw an error.
 */
export async function fetchValidatorsActivitiesInEpoch(client: Client, blockNumber: number) {
  const start = globalThis.performance.now()
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

  // Then, fetch each batch in the epoch and update the activity
  for (let i = 0; i < batchesPerEpoch; i++) {
    const { data: inherents, error: errorBatch } = await client.blockchain.getInherentsByBatchNumber(firstBatchIndex + i)
    if (errorBatch || !inherents) throw new Error(JSON.stringify({ blockNumber, errorBatch, i, firstBatchIndex, currentIndex: firstBatchIndex + i }))

    for (const { type, validatorAddress } of inherents) {
      if (validatorAddress === 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000') continue
      // TODO Add comment why this case can happen. e.g address: NQ57 M1NT JRQA FGD2  in election block 3075210
      if(!validatorsActivity[validatorAddress]) continue
      validatorsActivity[validatorAddress].rewarded += type === InherentType.Reward ? 1 : 0
      validatorsActivity[validatorAddress].missed += [InherentType.Penalize, InherentType.Jail].includes(type) ? 1 : 0
      // TODO Maybe there are more states we need to consider
    }
  }

  const end = globalThis.performance.now()
  const seconds = Math.floor((end - start) / 1000)
  console.log(`Fetched slots assignation for block ${blockNumber} in ${seconds} seconds.`)

  return validatorsActivity
}

/**
 * Fetches the activity for the given block numbers. 
 */
// TODO Generator
export async function fetchValidatorsActivities(client: Client, epochBlockNumbers: number[]) {
  const validatorsActivities: ValidatorsActivities = new Map()
  for (const epochBlockNumber of epochBlockNumbers) {
    const validatorActivities = await fetchValidatorsActivitiesInEpoch(client, epochBlockNumber)
    Object.entries(validatorActivities).forEach(([address, activity]) => validatorsActivities.set({ address, epochBlockNumber }, activity))
  }
  return validatorsActivities
}
