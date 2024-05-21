/**
 * This file contains the logic to get the parameters for the score computation. 
 */


import { Address, Client, PolicyConstants, Validator as ValidatorRpc } from 'nimiq-rpc-client-ts'
import { Validator as ValidatorDb } from '../utils/drizzle'
import { ComputeScoreConst } from './score'
import { gte, lte } from 'drizzle-orm'
import defu from 'defu'
import { DrizzleD1Database } from 'drizzle-orm/d1'

type Database = DrizzleD1Database<typeof import("/home/maxi/nimiq/validators/server/database/schema")>

// This is the window size for the score computation. Mainly for liveness computation.
const WINDOW_SIZE = 9 * 30 * 24 * 60 * 60 * 1000 // 9 months

/**
 * It gets the information from the validators and the epochs to compute the score parameters.
 * Then, the parameters are merge with the default values to get the final parameters.
 * 
 * Some observations:
 *  - For now we only support calculate the score for the current epoch, even though we have the epochs data.
 *    This is due to the fact that there is not an easy way to get the active validators and its balances for a given epoch.
 */
export async function getValidatorsParams(client: Client, db: Database) {
  const { validatorsData, totalBalance } = await getValidatorsInfo(client, db)
  const { fromEpoch, toEpoch } = await getEpochIndexes(client)

  const defaultScoreParams: ComputeScoreConst = { size: { totalBalance }, liveness: { fromEpoch, toEpoch } }
  const params = await validatorsToParams(defaultScoreParams, { validatorsData, fromEpoch, toEpoch })
  return params
}

/**
 * Gets the active validator list and its balances.
 * If there is a validator that is not in the database, it throws an error.
 * 
 * Otherwise, it merges the information from the database and the active validators and returns it along with the total balance
 */
type ValidatorInfo = ValidatorDb & ValidatorRpc
async function getValidatorsInfo(client: Client, db: Database) {
  const { data: activeValidators, error: errorActiveValdators } = await client.blockchain.getActiveValidators()
  if (errorActiveValdators || !activeValidators) throw new Error(errorActiveValdators.message || 'No active validators')

  const totalBalance = activeValidators.reduce((acc, v) => acc + v.balance, 0)

  const knownValidators = await db.select().from(tables.validators)
    .where(or(...activeValidators.map(v => eq(tables.validators.address, v.address))))

  const unknownValidators = activeValidators.filter(v => !knownValidators.find(kv => kv.address === v.address))
  if (unknownValidators.length > 0)
    throw new Error(`Unknown validators: ${unknownValidators.map(v => v.address).join(', ')}`)

  const validatorsData = activeValidators.map(activeValidator => {
    const validatorDb = knownValidators.find(kv => kv.address === activeValidator.address)!
    return { ...validatorDb, ...activeValidator } satisfies ValidatorInfo
  })
  return { validatorsData, totalBalance }
}

/**
 * Gets the epoch indexes for the score computation.
 * 
 * First it gets which epoch range we are computing. We convert the window size to a range of [fromEpoch, toEpoch].
 * Then, it checks if we have already fetched the data for all the epochs in the range. If there is a missing epoch, it throws an error.
 * 
 * Then we compute the activeEpochIndexes
 *  e.g. { toEpoch: 5, fromEpoch: 19 } a valid activeEpochIndexes would be: [5, 7, 16, 17, 18]
 */
export async function getEpochIndexes(client: Client) {
  const { data: policy, error: errorPolicy } = await client.policy.getPolicyConstants()
  if (errorPolicy || !policy) throw new Error(errorPolicy.message || 'No policy constants')

  const { data: head, error: errorHead } = await client.blockchain.getBlockNumber()
  if (errorHead || !head) throw new Error(errorHead?.message || 'No head block number')

  const { blockSeparationTime, blocksPerEpoch } = policy as PolicyConstants & { blockSeparationTime: number }

  const { data: currentEpoch, error: errorCurrentEpoch } = await client.blockchain.getEpochNumber()
  if (errorCurrentEpoch || !currentEpoch) throw new Error(errorCurrentEpoch?.message || 'No current epoch')

  const epochDifference = Math.ceil(WINDOW_SIZE / blockSeparationTime / blocksPerEpoch)
  const fromEpoch = Math.max(0, currentEpoch - epochDifference)
  const toEpoch = currentEpoch - 1

  const epochIndexes = await useDrizzle()
    .select({ epochIndex: tables.activity.epochIndex })
    .from(tables.activity)
    .where(and(lte(tables.activity.epochIndex, toEpoch), gte(tables.activity.epochIndex, fromEpoch)))
    .then(r => r.map(e => e.epochIndex))

  // see the differences between the two arrays
  const missingEpochs = Array.from({ length: toEpoch - fromEpoch + 1 }, (_, i) => i + fromEpoch).filter(e => !epochIndexes.includes(e))

  if (missingEpochs.length > 0)
    throw new Error(`Missing epochs: ${missingEpochs.join(', ')}`)

  return { fromEpoch, toEpoch }
}

/**
 * It gets the parameters for the score computation for each validator.
 * Each validator will have:
 *  - activeEpochIndexes: A list of epoch indexes when the validator was active. Read more in getEpochIndexes
 *  - balance: The balance of the validator in the epoch that we are computing the score. Useful for size
 */
type ValidatorParams = { validatorId: number, params: ComputeScoreConst }
type ValidatorParamsOptions = { validatorsData: ValidatorInfo[], toEpoch: number, fromEpoch: number }
async function validatorsToParams(defaultScoreParams: ComputeScoreConst, options: ValidatorParamsOptions) {
  const { validatorsData, fromEpoch, toEpoch } = options

  const promises: Promise<ValidatorParams>[] = []
  for (const { id: validatorId, balance } of validatorsData) {
    const params = useDrizzle().select({ epochIndex: tables.activity.epochIndex }).from(tables.activity).where(and(
      eq(tables.activity.validatorId, validatorId),
      lte(tables.activity.epochIndex, toEpoch),
      gte(tables.activity.epochIndex, fromEpoch)
    ))
      .then(r => r.map(e => e.epochIndex))
      .then(activeEpochIndexes => ({ liveness: { activeEpochIndexes }, size: { balance } } satisfies ComputeScoreConst))
      .then(params => ({ validatorId, params }))
    promises.push(defu(defaultScoreParams, params))
  }
  return Promise.all(promises)
}
