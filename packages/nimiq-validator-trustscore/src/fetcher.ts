import type { BaseAlbatrossPolicyOptions } from '@nimiq/utils/albatross-policy'
import type { ElectionMacroBlock } from 'nimiq-rpc-client-ts/types'
import type { ElectedValidator, EpochActivity, Result, ResultSync, SnapshotEpoch, UnelectedValidator } from './types'
import { BATCHES_PER_EPOCH, electionBlockOf, isElectionBlockAt, SLOTS } from '@nimiq/utils/albatross-policy'
import { getAccountByAddress, getBlockByNumber, getEpochNumber, getInherentsByBatchNumber, getStakersByValidatorAddress, getValidators } from 'nimiq-rpc-client-ts/http'
import { InherentType } from 'nimiq-rpc-client-ts/types'

export interface FetchActivityOptions extends Pick<BaseAlbatrossPolicyOptions, 'network'> {
  /**
   * The maximum number of retries to fetch the activity for a given batch.
   * @default 5
   */
  maxRetries?: number
}

/**
 * For a given block number, fetches the validator slots assignation.
 * The block number MUST be an election block otherwise it will return an error result.
 */
export async function fetchActivity(epochIndex: number, options: FetchActivityOptions = {}): Result<EpochActivity> {
  const { maxRetries = 5, network = 'mainnet' } = options
  // Epochs start at 1, but election block is the first block of the epoch
  const electionBlock = electionBlockOf(epochIndex, { network })!
  const [isBlockOk, errorBlockNumber, block] = await getBlockByNumber(electionBlock, { includeBody: false })
  if (!isBlockOk) {
    console.error(JSON.stringify({ epochIndex, errorBlockNumber, block }))
    return [false, errorBlockNumber, undefined]
  }
  if (!('isElectionBlock' in block))
    return [false, JSON.stringify({ message: 'Block is not election block', epochIndex, block }), undefined]

  const [isEpochOk, errorEpochNumber, currentEpochNumber] = await getEpochNumber()
  if (!isEpochOk) {
    return [false, `There was an error fetching current epoch: ${JSON.stringify({ epochIndex, error: errorEpochNumber, currentEpoch: currentEpochNumber })}`, undefined]
  }

  if (epochIndex >= currentEpochNumber)
    return [false, `You tried to fetch an epoch that is not finished yet: ${JSON.stringify({ epochIndex, currentEpoch: currentEpochNumber })}`, undefined]

  // The election block will be the first block of the epoch, since we only fetch finished epochs, we can assume that all the batches in this epoch can be fetched
  // First, we need to know in which batch this block is. Batches start at 1
  const firstBatchIndex = 1 + (epochIndex - 1) * BATCHES_PER_EPOCH
  if (firstBatchIndex % 1 !== 0 || firstBatchIndex < 1)
    // It should be an exact division since we are fetching election blocks
    return [false, JSON.stringify({ message: 'Something happened calculating batchIndex', firstBatchIndex, electionBlock, block }), undefined]

  // Initialize the list of validators and their activity in the epoch
  const epochActivity: EpochActivity = {}
  for (const { numSlots: likelihood, validator } of (block as ElectionMacroBlock).slots) {
    const dominanceRatioViaSlots = likelihood / SLOTS
    const balance = -1
    const dominanceRatioViaBalance = -1
    epochActivity[validator] = { address: validator, likelihood, missed: 0, rewarded: 0, dominanceRatioViaBalance, dominanceRatioViaSlots, balance, elected: true, stakers: 0 } as ElectedValidator
  }

  const maxBatchSize = 120
  const minBatchSize = 10
  let batchSize = maxBatchSize

  const createPromise = async (index: number, retryCount = 0): Promise<ResultSync<void>> => {
    try {
      const [inherentsOk, errorBatch, inherents] = await getInherentsByBatchNumber(firstBatchIndex + index)
      if (!inherentsOk || inherents.length === 0) {
        const errorMsg = inherents?.length === 0 ? `No inherents found in batch ${firstBatchIndex + index}` : `Batch fetch failed: ${errorBatch}`
        return [false, errorMsg, undefined]
      }

      for (const { type, validatorAddress } of inherents) {
        const isStakingAddress = validatorAddress === 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'
        const validatorsExists = !!epochActivity[validatorAddress]
        const validatorIsElected = validatorsExists && epochActivity[validatorAddress]?.elected
        if (isStakingAddress || !validatorIsElected || !validatorsExists)
          continue

        const activity = epochActivity[validatorAddress]
        if (!activity)
          continue
        if (type === InherentType.Reward)
          activity.rewarded++
        else if ([InherentType.Penalize, InherentType.Jail].includes(type))
          activity.missed++
      }

      return [true, undefined, undefined]
    }
    catch (error) {
      if (retryCount >= maxRetries)
        return [false, `Max retries exceeded for batch ${firstBatchIndex + index}: ${error}`, undefined]
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
      const failures = results.filter(result => !!result[1]).length

      // Adjust batch dominance based on success rate
      if (failures > 0)
        batchSize = Math.max(minBatchSize, Math.floor(batchSize / 2))
      else
        batchSize = Math.min(maxBatchSize, Math.floor(batchSize * 1.5))

      // Check for any remaining errors
      const errors = results
        .filter(result => !result[0])
        .map(result => result[1])
      if (errors.length > 0) {
        console.error(errors)
        return [false, `Failed to process batches: ${JSON.stringify(errors)}`, undefined]
      }
    }

    return [true, undefined, epochActivity]
  }
  catch (error) {
    return [false, `Error processing batches: ${error instanceof Error ? error.message : String(error)}`, undefined]
  }
}

/**
 * Fetches the activity for the given block numbers.
 * This function is an asynchronous generator. It yields each activity one by one,
 * allowing the caller to decide when to fetch the next activity.
 *
 * @param epochsIndexes - An array of epoch block numbers to fetch the activities for.
 * @returns An asynchronous generator yielding objects containing the address, epoch block number, and activity.
 */
export async function* fetchEpochs(epochsIndexes: number[]) {
  for (const epochIndex of epochsIndexes) {
    const [activityOk, _activityError, activities] = await fetchActivity(epochIndex)

    // If there was an error or validatorActivities is empty, yield null activity
    if (!activityOk) {
      yield { epochIndex, address: '', activity: null }
      continue
    }

    for (const [address, activity] of Object.entries(activities)) {
      yield { address, epochIndex, activity }
    }
  }
}

interface FetchSnapshotEpochOptions extends Pick<BaseAlbatrossPolicyOptions, 'network'> { }

/**
 * This function returns the validators information for the current epoch.
 *
 *    ┌────────────► Elected validators in the epoch
 *    │          ┌─► Active validators
 * ┌──┼──────────┴──────┐
 * │┌─┴─────────────┐   │
 * ││               │   │
 * ││ x   x  x  x   │x  │
 * ││               │   │
 * ││           x   │ x │
 * ││      x        │   │
 * ││               │   │
 * │└───────────────┘ x │
 * └────────────────────┘
 *
 */
export async function fetchSnapshotEpoch(options: FetchSnapshotEpochOptions = {}): Result<SnapshotEpoch> {
  const { network = 'mainnet' } = options
  const [validatorsOk, errorValidators, validatorsStakingContract] = await getValidators()
  if (!validatorsOk)
    return [false, JSON.stringify({ error: errorValidators, validatorsStakingContract }), undefined]

  const [currentEpochNumberOk, error, currentEpochNumber] = await getEpochNumber()
  if (!currentEpochNumberOk)
    return [false, JSON.stringify({ error, epochNumber: currentEpochNumber }), undefined]
  const previousEpochNumber = currentEpochNumber - 1

  const electionBlockPreviousEpoch = electionBlockOf(previousEpochNumber, { network })!

  if (!isElectionBlockAt(electionBlockPreviousEpoch, { network }))
    return [false, JSON.stringify({ message: `${electionBlockPreviousEpoch} is not an election block` }), undefined]

  // We retrieve the election block because we need the slots distribution
  // to be able to compute the dominance ratio via slots
  const [electionBlockOk, errorElectionBlock, electionBlock] = await getBlockByNumber(electionBlockPreviousEpoch)
  if (!electionBlockOk)
    return [false, JSON.stringify({ errorElectionBlock, currentElectionBlock: electionBlock }), undefined]
  if (!('isElectionBlock' in electionBlock) || !('slots' in electionBlock))
    return [false, JSON.stringify({ message: `${electionBlockPreviousEpoch} is not an election block`, epochNumber: previousEpochNumber, electionBlock }), undefined]
  const slotsDistribution = Object.fromEntries((electionBlock as ElectionMacroBlock).slots.map(({ validator, numSlots }) => [validator, numSlots]))

  const result: ResultSync<SnapshotEpoch['validators'][number]>[] = await Promise.all(validatorsStakingContract.map(async ({ address }) => {
    const [accountOk, error, account] = await getAccountByAddress(address)
    if (!accountOk)
      return [false, JSON.stringify({ error, address }), undefined]

    const dominanceRatioViaBalance = -1 // We update the value later once we have the total balance
    const isElected = slotsDistribution[address] !== undefined
    let data: ElectedValidator | UnelectedValidator
    if (!isElected) {
      const defaultValues: Pick<UnelectedValidator, 'missed' | 'rewarded' | 'dominanceRatioViaSlots' | 'likelihood' | 'stakers'> = { missed: -1, rewarded: -1, dominanceRatioViaSlots: -1, likelihood: -1, stakers: 0 }
      data = { address, balance: account.balance, elected: false, dominanceRatioViaBalance, ...defaultValues } satisfies UnelectedValidator
    }
    else {
      const dominanceRatioViaSlots = isElected ? slotsDistribution[address]! / SLOTS : -1
      const unknownParametersAtm: Pick<ElectedValidator, 'missed' | 'rewarded' | 'stakers'> = { missed: -1, rewarded: -1, stakers: 0 }
      const likelihood = slotsDistribution[address]! / SLOTS
      data = { address, balance: account.balance, elected: true, dominanceRatioViaBalance, dominanceRatioViaSlots, ...unknownParametersAtm, likelihood } satisfies ElectedValidator
    }
    return [true, undefined, data]
  },
  ))

  const errors = result.filter(v => !v[0]).map(v => v[1])
  if (errors.length > 0)
    return [false, `Failed to fetch validators: ${JSON.stringify(errors)}`, undefined]

  const validators = result.map(v => v[2]).filter(v => !!v) as SnapshotEpoch['validators']
  const totalBalance = validators.reduce((acc, v) => acc + (v.balance ?? 0), 0)
  validators.forEach(v => v.dominanceRatioViaBalance = v.balance / totalBalance)

  const batchSize = 3
  for (let i = 0; i < validators.length; i += batchSize) {
    const batch = validators.slice(i, i + batchSize)
    await Promise.all(batch.map(async ({ address }) => {
      // const { data: stakers, error: errorStakers } = await getStakersByValidatorAddress(address)
      const [stakersOk, errorStakers, stakers] = await getStakersByValidatorAddress(address)
      if (!stakersOk)
        return [false, JSON.stringify({ error: errorStakers, address }), undefined]
      const stakersCount = stakers.length
      const validator = validators.find(v => v.address === address)
      if (!validator)
        return [false, JSON.stringify({ message: 'Validator not found', stakersCount, address }), undefined]
      validator.stakers = stakersCount
    }))
  }

  return [true, undefined, { epochNumber: currentEpochNumber, validators }]
}
