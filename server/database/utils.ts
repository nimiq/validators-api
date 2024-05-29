import { gte, inArray, lte } from "drizzle-orm"
import type { EpochActivity, Range, ValidatorParams } from "nimiq-vts"
// @ts-expect-error no types
import Identicons from '@nimiq/identicons'
import { NewActivity, NewScore, NewValidator } from "../utils/drizzle"

/**
 * Given a list of validator addresses, it returns the addresses that are missing in the database.
 * This is useful when we are fetching the activity for a range of epochs and we need to check if the validators are already in the database.
 * They should be present in the database because the fetch function needs to be run in order to compute the score.
 */
export async function getMissingValidators(addresses: string[]) {
  const existingAddresses = await useDrizzle()
    .select({ address: tables.validators.address })
    .from(tables.validators)
    .where(inArray(tables.validators.address, addresses))
    .execute().then(r => r.map(r => r.address))

  const missingAddresses = addresses.filter(a => existingAddresses.indexOf(a) === -1)
  return missingAddresses
}

// A simple cache to avoid querying the database multiple times for the same validator
// Useful when we are fetching batches of activities for the same validator across multiple epochs
const validators = new Map<string, number>()

export async function storeValidator(address: string, rest: Omit<NewValidator, 'address' | 'icon'> = {}) {
  if (validators.has(address)) return validators.get(address) as number
  const validatorId = await useDrizzle()
    .select({ id: tables.validators.id })
    .from(tables.validators)
    .where(eq(tables.validators.address, address))
    .get().then(r => r?.id)

  if (validatorId) {
    validators.set(address, validatorId)
    return validatorId
  }

  const icon = await Identicons.default.toDataUrl(address) as string
  const newValidator = await useDrizzle().insert(tables.validators).values({ ...rest, address, icon }).returning().get()
  validators.set(address, newValidator.id)
  return newValidator.id
}

/**
 * Given a list of validator addresses and a range of epochs, it returns the activity for the given validators and epochs.
 * If there are missing validators or epochs, it will throw an error.
 */
export async function getValidatorParams(validators: { address: string, balance: number }[], range: Range) {
  const addresses = validators.map(v => v.address);

  const missingValidators = await getMissingValidators(addresses);
  if (missingValidators.length > 0) throw new Error(`Missing validators in database: ${missingValidators.join(', ')}. Run the fetch task first.`);

  const missingEpochs = await getMissingEpochs(range);
  if (missingEpochs.length > 0) throw new Error(`Missing epochs in database: ${missingEpochs.join(', ')}. Run the fetch task first.`);

  const activities = await useDrizzle()
    .select({
      epoch: tables.activity.epochBlockNumber,
      address: tables.validators.address,
      validatorId: tables.validators.id,
    })
    .from(tables.activity)
    .innerJoin(tables.validators, eq(tables.activity.validatorId, tables.validators.id))
    .where(and(
      gte(tables.activity.epochBlockNumber, range.fromEpoch),
      lte(tables.activity.epochBlockNumber, range.toEpoch),
      inArray(tables.validators.address, addresses)
    ))
    .execute();

  const epochCount = Math.ceil((range.toEpoch - range.fromEpoch) / range.blocksPerEpoch);
  
  const validatorParams: ValidatorParams = {};
  for (const { address, balance } of validators) {
    const validatorActivities = activities.filter(a => a.address === address);
    const validatorId = validatorActivities[0]!.validatorId;
    const activeEpochStates = Array(epochCount).fill(0);
    validatorActivities.forEach(activity => {
      const index = range.blockNumberToIndex(activity.epoch);
      if (index >= 0 && index < epochCount) activeEpochStates[index] = 1;
    });
    validatorParams[address] = { validatorId, balance, activeEpochStates };
  }
  
  return validatorParams;
}

/**
 * Given a range, it returns the epochs that are missing in the database. 
 */
export async function getMissingEpochs(range: Range) {
  const existingEpochs = await useDrizzle()
    .select({ epochBlockNumber: tables.activity.epochBlockNumber })
    .from(tables.activity)
    .where(and(gte(tables.activity.epochBlockNumber, range.fromEpoch), lte(tables.activity.epochBlockNumber, range.toEpoch)))
    .execute().then(r => r.map(r => r.epochBlockNumber))

  const missingEpochs = []
  for (let i = range.fromEpoch; i <= range.toEpoch; i += range.blocksPerEpoch) {
    if (existingEpochs.indexOf(i) === -1) missingEpochs.push(i)
  }
  return missingEpochs
}

/**
 * It computes the score for a given range of epochs. It will fetch the activity for the given epochs and then compute the score for each validator. 
 * It will delete the activities for the given epochs and then insert the new activities.
 */
export async function storeActivities(activities: EpochActivity) {
  const values: NewActivity[] = []
  const blockNumbers = Object.keys(activities).map(Number)
  for (const _epochBlockNumber of blockNumbers) {
    const epochBlockNumber = Number(_epochBlockNumber)
    for (const { assigned, rewarded, missed, validator } of activities[epochBlockNumber]) {
      const validatorId = await storeValidator(validator)
      values.push({ assigned, rewarded, missed, epochBlockNumber, validatorId })
    }
  }

  await useDrizzle().delete(tables.activity).where(inArray(tables.activity.epochBlockNumber, blockNumbers))

  // For some reason, D1 is hanging when inserting all the values at once. So dividing the values in chunks
  // seems to work: https://github.com/prisma/prisma/discussions/23646#discussioncomment-9083299
  const chunkArray = (arr: any[], chunkSize: number) => Array.from({ length: Math.ceil(arr.length / chunkSize) }, (_, i) => arr.slice(i * chunkSize, i * chunkSize + chunkSize))
  for (const chunk of chunkArray(values, 16))
    await useDrizzle().insert(tables.activity).values(chunk)


  // If we ever move out of cloudflare we could use transactions to avoid inconsistencies and improve performance
  // Cloudflare D1 does not support transactions: https://github.com/cloudflare/workerd/blob/e78561270004797ff008f17790dae7cfe4a39629/src/workerd/api/sql-test.js#L252-L253
  // await useDrizzle().transaction(async (tx) => {
  //  await tx.delete(tables.activity).where(inArray(tables.activity.epochBlockNumbers, blockNumbers))
  //  await Promise.all(values.map(v => tx.insert(tables.activity).values(v)))
  // })
}

/**
 * Insert the scores into the database. To avoid inconsistencies, it deletes all the scores for the given validators and then inserts the new scores.
 */
export async function storeScores(scores: NewScore[]) {
  await useDrizzle().delete(tables.scores).where(or(...scores.map(({ validatorId }) => eq(tables.scores.validatorId, validatorId))))
  await useDrizzle().insert(tables.scores).values(scores)

  // If we ever move out of cloudflare we could use transactions to avoid inconsistencies
  // Cloudflare D1 does not support transactions: https://github.com/cloudflare/workerd/blob/e78561270004797ff008f17790dae7cfe4a39629/src/workerd/api/sql-test.js#L252-L253
  // await useDrizzle().transaction(async (tx) => {
  //   await tx.delete(tables.scores).where(or(...scores.map(({ validatorId }) => eq(tables.scores.validatorId, validatorId))))
  //   await tx.insert(tables.scores).values(scores.map(s => ({ ...s, updatedAt })))
  // })
}
