import { Client, PolicyConstants } from 'nimiq-rpc-client-ts'
import { EpochRange, ScoreParams } from './types'
// TODO REmove this
import { getMissingValidators, getEpochIndexes } from '../database/utils'

/**
 * It gets the list of active validators and all its required data in order to be able to compute the score.
 * 
 * Note: For now, we only support the computation of the current epoch, although we can modify the code to
 * support the ability to compute the score for a given epoch. The main problem is that we need to fetch the
 * balances for each validators for the given epoch and currently there is no an easy way to do that.
 */
export async function getValidatorsParams(client: Client, range: EpochRange) {
  const { data: activeValidators, error: errorActiveValdators } = await client.blockchain.getActiveValidators()
  if (errorActiveValdators || !activeValidators) throw new Error(errorActiveValdators.message || 'No active validators')

  const missingValidators = await getMissingValidators(activeValidators.map(v => v.address))
  if (missingValidators.length > 0) throw new Error(`There are missing validators: ${missingValidators.join(', ')}`)

  const totalBalance = activeValidators.reduce((acc, v) => acc + v.balance, 0)
  const validatorBalances = Object.fromEntries(activeValidators.map(v => [v.address, v.balance]))

  const validatorEpochs = await getEpochIndexes(range)

  const params: ScoreParams[] = []
  for (const { address } of activeValidators) {
    const validatorId = validatorEpochs[address].validatorId
    const activeEpochIndexes = validatorEpochs[address].activeEpochIndexes
    const balance = validatorBalances[address]
    params.push({ validatorId, params: { liveness: { activeEpochIndexes, ...range }, size: { balance, totalBalance } } })
  }

  return params
}

/**
 * Validates the epoch range. The range should start from epoch 1 because the epoch 0 is a special epoch where we store the
 * old blockchain data. The range should finish in the current epoch - 1 as we can only compute the score for finished epochs.
 */
export async function valdidateEpochRange(client: Client, { fromEpoch, toEpoch }: EpochRange) {
  if (fromEpoch < 0 || toEpoch < 0 || fromEpoch > toEpoch) throw new Error(`Invalid epoch range: [${fromEpoch}, ${toEpoch}]`)
  if (fromEpoch === 0) throw new Error(`Invalid epoch range: [${fromEpoch}, ${toEpoch}]. The range should start from epoch 1`)

  const { data: epochNumber, error } = await client.blockchain.getEpochNumber()
  if (error || !epochNumber) throw new Error(JSON.stringify({ epochNumber, error }))
  if (toEpoch >= epochNumber) throw new Error(`Invalid epoch range: [${fromEpoch}, ${toEpoch}]. The last valid epoch is ${epochNumber - 1}`)
}

/**
 * Given the amount of milliseconds we want to consider, it returns the range that we will use to compute the score. By default we will use
 * the last 9 months.
 * 
 * First it gets which epoch range we are computing. We convert the window size to a range of [fromEpoch, toEpoch].
 * Then, it checks if we have already fetched the data for all the epochs in the range. If there is a missing epoch, it throws an error.
 *
 * The range will be validated 
 */
export async function getEpochRange(client: Client, ms: number = 9 * 30 * 24 * 60 * 60 * 1000): Promise<EpochRange> {
  const { data: policy, error: errorPolicy } = await client.policy.getPolicyConstants()
  if (errorPolicy || !policy) throw new Error(errorPolicy.message || 'No policy constants')

  const { blockSeparationTime, blocksPerEpoch } = policy as PolicyConstants & { blockSeparationTime: number }

  const { data: currentEpoch, error: errorCurrentEpoch } = await client.blockchain.getEpochNumber()
  if (errorCurrentEpoch || !currentEpoch) throw new Error(errorCurrentEpoch?.message || 'No current epoch')

  const epochDurationMs = blockSeparationTime * blocksPerEpoch
  const expectedTotalEpochs = Math.ceil(ms / epochDurationMs) // The number of epochs to consider
  const fromEpoch = Math.max(1, currentEpoch - expectedTotalEpochs)
  const toEpoch = currentEpoch - 1
  const totalEpochs = toEpoch - fromEpoch + 1 // The actual number of epochs we will consider
  const range: EpochRange = { fromEpoch, toEpoch, totalEpochs }
  await valdidateEpochRange(client, range)
  return range
}
