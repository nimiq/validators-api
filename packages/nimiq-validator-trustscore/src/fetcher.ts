import type { ElectionMacroBlock, NimiqRPCClient } from 'nimiq-rpc-client-ts'
import type { CurrentEpoch, EpochActivity, Result, ResultSync, TrackedActiveValidator, ValidatorCurrentEpochActivity } from './types'
import { BATCHES_PER_EPOCH, electionBlockOf, SLOTS } from '@nimiq/utils/albatross-policy'
import { InherentType } from 'nimiq-rpc-client-ts'

/**
 * For a given block number, fetches the validator slots assignation.
 * The block number MUST be an election block otherwise it will return an error result.
 */
export async function fetchActivity(client: NimiqRPCClient, epochIndex: number, maxRetries = 5): Promise<ResultSync<EpochActivity>> {
  // Epochs start at 1, but election block is the first block of the epoch
  const electionBlock = electionBlockOf(epochIndex)!
  const { data: block, error: errorBlockNumber } = await client.blockchain.getBlockByNumber(electionBlock, { includeBody: false })
  if (errorBlockNumber || !block) {
    console.error(JSON.stringify({ epochIndex, error: errorBlockNumber, block }))
    return { error: `Failed to fetch block: ${errorBlockNumber}` }
  }
  if (!('isElectionBlock' in block))
    return { error: JSON.stringify({ message: 'Block is not election block', epochIndex, block }) }

  const { data: currentEpoch, error: errorEpochNumber } = await client.blockchain.getEpochNumber()
  if (errorEpochNumber || !currentEpoch)
    return { error: `There was an error fetching current epoch: ${JSON.stringify({ epochIndex, error: errorEpochNumber, currentEpoch })}` }
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
        const validatorIsActive = validatorsExists && epochActivity[validatorAddress]?.kind === 'active'
        if (isStakingAddress || !validatorIsActive || !validatorsExists)
          continue

        const activity = epochActivity[validatorAddress] as TrackedActiveValidator
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

/**
 * This functions returns the validators information for the current epoch plus with a categorization of the
 * validators:
 *   - Active validators: It is in the known addresses and active in the current epoch
 *   - Inactive validators: It is in the known addresses but not active in the current epoch
 *   - Untracked validators: It is not in the known addresses and active in the current epoch
 *
 *          Active validators       "x" represents a validator
 *          ┌─────────────────┐
 *          │   ┌─────────────────┐
 *          │   │       x    x│   │
 *          │   │ x   x       │   │
 *     ┌────┼─x │        x  x │   │
 *     │    │   │   x         │ x─┼─►Validator inactive
 *     ▼    └───│─────────────┘   │
 * Untracked    └─────────────────┘
 *                 Known validators
 *
 * Note: Albatross Validator have 4 states:
 * Active, Inactive, Deleted and not yet created (validators that will be created).
 * The validators API only handles Active and Inactive validators. Anything that is not active is considered inactive.
 */
export async function fetchCurrentEpoch(client: NimiqRPCClient, knownAddresses: string[] = []): Result<CurrentEpoch> {
  const { data: epochNumber, error } = await client.blockchain.getEpochNumber()
  if (error || !epochNumber)
    return { error: JSON.stringify({ error, epochNumber }) }

  // We retrieve the election block because we need the slots distribution
  // to be able to compute the dominance ratio via slots
  const { data: electionBlock, error: errorElectionBlock } = await client.blockchain.getBlockByNumber(electionBlockOf(epochNumber)!)
  if (!electionBlock || errorElectionBlock)
    return { error: JSON.stringify({ errorElectionBlock, currentElectionBlock: electionBlock }) }
  if (!('isElectionBlock' in electionBlock) || !('slots' in electionBlock))
    return { error: JSON.stringify({ message: 'Election block is not election block', epochNumber, electionBlock }) }
  const slotsDistribution = Object.fromEntries((electionBlock as ElectionMacroBlock).slots.map(({ validator, numSlots }) => [validator, numSlots]))

  const { data: activeValidators, error: errorValidators } = await client.blockchain.getActiveValidators()
  if (errorValidators || !activeValidators)
    return { error: JSON.stringify({ errorValidators, activeValidators }) }
  const totalBalance = activeValidators.reduce((acc, { balance }) => acc + (balance ?? 0), 0)

  const validators: ValidatorCurrentEpochActivity[] = []

  const trackedActiveActivitySet = new Set(knownAddresses.filter(address => activeValidators.map(({ address: a }) => a).includes(address)))
  const untrackedActiveActivitySet = new Set(activeValidators.map(({ address }) => address).filter(address => !knownAddresses.includes(address)))

  // Helper function to add the information about the active validator
  function getActiveValidator({ kind, address }: Pick<ValidatorCurrentEpochActivity, 'kind' | 'address'>) {
    const balance = activeValidators?.find(({ address: a }) => a === address)?.balance
    if (!balance)
      throw new Error(`Validator ${address} not found in active validators`) // This should never happen
    const dominanceRatioViaBalance = balance / totalBalance
    if (!slotsDistribution[address])
      throw new Error(`Slots distribution not found for validator ${address}`)
    const dominanceRatioViaSlots = slotsDistribution[address] / SLOTS
    return { address, balance, kind, dominanceRatioViaBalance, dominanceRatioViaSlots }
  }
  trackedActiveActivitySet.forEach(address => validators.push(getActiveValidator({ address, kind: 'active' })))
  untrackedActiveActivitySet.forEach(address => validators.push(getActiveValidator({ address, kind: 'untracked' })))

  // Validators that are in the known addresses but not in the active validators
  // The balances of these validators are fetched through RPC
  const inactiveActivitySet = new Set(knownAddresses.filter(address => !activeValidators.map(({ address: a }) => a).includes(address)))
  for (const address of inactiveActivitySet) {
    const { data: account, error } = await client.blockchain.getAccountByAddress(address)
    if (error || account === undefined)
      return { error: `Failed to fetch balance for validator ${address}: ${error?.message || 'Unknown error'}` }
    // Even though the validator is inactive, we still fetch the balance, so we can track it
    const balance = account.balance
    validators.push({ address, balance, kind: 'inactive', dominanceRatioViaBalance: -1, dominanceRatioViaSlots: -1 })
  }

  return { data: { epochNumber, validators } }
}
