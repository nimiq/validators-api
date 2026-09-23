import type { BaseAlbatrossPolicyOptions } from '@nimiq/utils/albatross-policy'
import type { ElectionMacroBlock } from 'nimiq-rpc-client-ts/types'
import type { ActivityBatchProgress } from './sync-progress'
import type { ElectedValidator, ElectionSet, EpochActivity, Result, ResultSync, SnapshotEpoch, UnelectedValidator } from './types'
import { batchAt, BATCHES_PER_EPOCH, electionBlockOf, firstBlockOf, isElectionBlockAt, SLOTS } from '@nimiq/utils/albatross-policy'
import { getBlockByNumber, getEpochNumber, getInherentsByBatchNumber, getStakersByValidatorAddress, getValidatorByAddress, getValidators } from 'nimiq-rpc-client-ts/http'
import { InherentType } from 'nimiq-rpc-client-ts/types'

export interface FetchElectionSetOptions extends Pick<BaseAlbatrossPolicyOptions, 'network'> { }

export interface FetchActivityOptions extends FetchElectionSetOptions {
  /**
   * The maximum number of retries to fetch the activity for a given batch.
   * @default 5
   */
  maxRetries?: number
  /**
   * Max concurrent RPC requests per batch. Workers allows ~6 concurrent outbound connections.
   * @default 120
   */
  maxBatchSize?: number
  onProgress?: (progress: ActivityBatchProgress) => void
  electionSet?: ElectionSet
}

export type FetchEpochsOptions = Omit<FetchActivityOptions, 'electionSet'>

function canonicalAddress(address: string): string {
  return address.replace(/\s/g, '').toUpperCase()
}

const STAKING_CONTRACT_ADDRESS = canonicalAddress('NQ07 0000 0000 0000 0000 0000 0000 0000 0000')

export function electionBlockToElectionSet(epochIndex: number, electionBlockNumber: number, block: unknown): ResultSync<ElectionSet> {
  if (!block || typeof block !== 'object' || !('isElectionBlock' in block) || block.isElectionBlock !== true)
    return [false, JSON.stringify({ message: 'Block is not an election block', epochIndex, block }), undefined]

  if (!('slots' in block) || !Array.isArray(block.slots))
    return [false, JSON.stringify({ message: 'Election block has no slots array', epochIndex, block }), undefined]

  const validators: ElectionSet['validators'] = []
  const seenAddresses = new Set<string>()
  for (const slot of block.slots) {
    if (!slot || typeof slot !== 'object' || !('validator' in slot) || typeof slot.validator !== 'string' || !('numSlots' in slot) || typeof slot.numSlots !== 'number')
      return [false, JSON.stringify({ message: 'Election block contains an invalid slot', epochIndex, slot }), undefined]

    const canonical = canonicalAddress(slot.validator)
    if (seenAddresses.has(canonical))
      return [false, JSON.stringify({ message: 'Election block contains a duplicate validator', epochIndex, address: slot.validator }), undefined]

    seenAddresses.add(canonical)
    validators.push({ address: slot.validator, numSlots: slot.numSlots })
  }

  validators.sort((a, b) => {
    const canonicalA = canonicalAddress(a.address)
    const canonicalB = canonicalAddress(b.address)
    return canonicalA < canonicalB ? -1 : canonicalA > canonicalB ? 1 : 0
  })

  return [true, undefined, { epochIndex, electionBlockNumber, validators }]
}

export async function fetchElectionSet(epochIndex: number, options: FetchElectionSetOptions = {}): Result<ElectionSet> {
  const { network = 'mainnet' } = options
  const electionBlockNumber = electionBlockOf(epochIndex - 1, { network })
  if (electionBlockNumber === undefined || electionBlockNumber === null)
    return [false, JSON.stringify({ message: 'Unable to determine election block', epochIndex, network }), undefined]

  const [isBlockOk, errorBlockNumber, block] = await getBlockByNumber({ blockNumber: electionBlockNumber, includeBody: false })
  if (!isBlockOk)
    return [false, errorBlockNumber, undefined]

  return electionBlockToElectionSet(epochIndex, electionBlockNumber, block)
}

/**
 * Fetches validator activity for a completed epoch.
 */
export async function fetchActivity(epochIndex: number, options: FetchActivityOptions = {}): Result<EpochActivity> {
  const { maxRetries = 5, network = 'mainnet', maxBatchSize: _maxBatchSize = 120 } = options
  let electionSet = options.electionSet
  if (!electionSet) {
    const [electionSetOk, electionSetError, fetchedElectionSet] = await fetchElectionSet(epochIndex, { network })
    if (!electionSetOk)
      return [false, electionSetError, undefined]
    electionSet = fetchedElectionSet
  }
  if (electionSet.epochIndex !== epochIndex)
    return [false, JSON.stringify({ message: 'Election set epoch does not match requested epoch', epochIndex, electionSetEpochIndex: electionSet.epochIndex }), undefined]
  const expectedElectionBlockNumber = electionBlockOf(epochIndex - 1, { network })
  if (expectedElectionBlockNumber === undefined || expectedElectionBlockNumber === null || electionSet.electionBlockNumber !== expectedElectionBlockNumber) {
    return [false, JSON.stringify({
      message: 'Election set block does not match requested epoch',
      epochIndex,
      electionBlockNumber: electionSet.electionBlockNumber,
      expectedElectionBlockNumber,
    }), undefined]
  }

  const [isEpochOk, errorEpochNumber, currentEpochNumber] = await getEpochNumber()
  if (!isEpochOk) {
    return [false, `There was an error fetching current epoch: ${JSON.stringify({ epochIndex, error: errorEpochNumber, currentEpoch: currentEpochNumber })}`, undefined]
  }

  if (epochIndex >= currentEpochNumber)
    return [false, `You tried to fetch an epoch that is not finished yet: ${JSON.stringify({ epochIndex, currentEpoch: currentEpochNumber })}`, undefined]

  // The election block will be the first block of the epoch, since we only fetch finished epochs, we can assume that all the batches in this epoch can be fetched
  // First, we need to know in which batch this block is. Batches start at 1
  const firstBatchIndexOfEpoch = (epoch: number) => batchAt(firstBlockOf(epoch, { network })!, { network })
  const firstBatchIndex = firstBatchIndexOfEpoch(epochIndex)

  // Initialize the list of validators and their activity in the epoch
  const epochActivity: EpochActivity = {}
  const activityAddressByCanonical = new Map<string, string>()
  for (const { address, numSlots: likelihood } of electionSet.validators) {
    const canonical = canonicalAddress(address)
    if (activityAddressByCanonical.has(canonical))
      return [false, JSON.stringify({ message: 'Election set contains a duplicate validator', epochIndex, address }), undefined]

    const dominanceRatioViaSlots = likelihood / SLOTS
    const balance = -1
    const dominanceRatioViaBalance = -1
    activityAddressByCanonical.set(canonical, address)
    epochActivity[address] = { address, likelihood, missed: 0, rewarded: 0, dominanceRatioViaBalance, dominanceRatioViaSlots, balance, elected: true, stakers: 0 } as ElectedValidator
  }

  const maxBatchSize = _maxBatchSize
  const minBatchSize = Math.min(10, maxBatchSize)
  let batchSize = maxBatchSize

  const createPromise = async (index: number, retryCount = 0): Promise<ResultSync<void>> => {
    try {
      const batchIndex = firstBatchIndex + index
      const [inherentsOk, errorBatch, inherents] = await getInherentsByBatchNumber({ batchIndex })
      if (!inherentsOk) {
        const remainingBatches = BATCHES_PER_EPOCH - index
        throw new Error(`${JSON.stringify({ errorBatch, batchIndex, inherents, inherentsOk, remainingBatches })}`)
      }
      if (!inherents || inherents.length === 0) {
        const errorMsg = `Batch fetch failed: ${errorBatch}.`
        throw new Error(`${JSON.stringify({ errorMsg, batchIndex, inherents, inherentsOk })}`)
      }

      for (const { type, validatorAddress } of inherents) {
        const canonicalValidatorAddress = canonicalAddress(validatorAddress)
        const isStakingAddress = canonicalValidatorAddress === STAKING_CONTRACT_ADDRESS
        const activityAddress = activityAddressByCanonical.get(canonicalValidatorAddress)
        const activity = activityAddress ? epochActivity[activityAddress] : undefined
        if (isStakingAddress || !activity?.elected)
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
        return [false, `Batch ${firstBatchIndex + index} reached ${maxRetries} attempts: ${error}`, undefined]
      const delay = Math.min(30_000, 2 ** retryCount * 1000) // dynamically increase time up to 30s
      await new Promise(resolve => setTimeout(resolve, delay))
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

      options.onProgress?.({
        epochIndex,
        fromBatchIndex: firstBatchIndex + i,
        toBatchIndex: firstBatchIndex + i + currentBatchSize - 1,
        completedBatches: Math.min(i + currentBatchSize, BATCHES_PER_EPOCH),
        totalBatches: BATCHES_PER_EPOCH,
        batchSize: currentBatchSize,
      })
    }

    return [true, undefined, epochActivity]
  }
  catch (error) {
    return [false, `Error processing batches: ${error instanceof Error ? error.message : String(error)}`, undefined]
  }
}

type FetchFunctionResult = AsyncGenerator<ResultSync<{
  address: string
  epochIndex: number
  activity: EpochActivity[string]
}>, void, unknown>

/**
 * Fetches the activity for the given block numbers.
 * This function is an asynchronous generator. It yields each activity one by one,
 * allowing the caller to decide when to fetch the next activity.
 *
 * @param epochsIndexes - An array of epoch block numbers to fetch the activities for.
 * @returns An asynchronous generator yielding objects containing the address, epoch index, and activity.
 */
export async function* fetchEpochs(epochsIndexes: number[], options: FetchEpochsOptions = {}): FetchFunctionResult {
  const activityOptions: FetchActivityOptions = { ...options }
  delete activityOptions.electionSet

  for (const epochIndex of epochsIndexes) {
    const [activityOk, activityError, activities] = await fetchActivity(epochIndex, activityOptions)

    if (!activityOk) {
      yield [false, `Error fetching activity for epoch ${epochIndex}: ${activityError}`, undefined]
    }
    else {
      for (const [address, activity] of Object.entries(activities)) {
        yield [true, undefined, { address, epochIndex, activity }]
      }
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
  const [electionBlockOk, errorElectionBlock, electionBlock] = await getBlockByNumber({ blockNumber: electionBlockPreviousEpoch })
  if (!electionBlockOk)
    return [false, JSON.stringify({ errorElectionBlock, currentElectionBlock: electionBlock }), undefined]
  if (!('isElectionBlock' in electionBlock) || !('slots' in electionBlock))
    return [false, JSON.stringify({ message: `${electionBlockPreviousEpoch} is not an election block`, epochNumber: previousEpochNumber, electionBlock }), undefined]
  const slotsDistribution = Object.fromEntries((electionBlock as ElectionMacroBlock).slots.map(({ validator, numSlots }) => [validator, numSlots]))

  const result: ResultSync<SnapshotEpoch['validators'][number]>[] = await Promise.all(validatorsStakingContract.map(async ({ address }) => {
    const [accountOk, error, account] = await getValidatorByAddress({ address })
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
      const [stakersOk, errorStakers, stakers] = await getStakersByValidatorAddress({ address })
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
