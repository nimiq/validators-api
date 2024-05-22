import { gte, inArray, lte } from "drizzle-orm"
import { ActivityEpoch, EpochRange, ScoreValues, ValidatorEpochs } from "../vts/types"
// @ts-expect-error no types
import Identicons from '@nimiq/identicons'
import { NewScore } from "../utils/drizzle"

export async function getMissingValidators(addresses: string[]) {
  const existingAddresses = await useDrizzle()
    .select({ address: tables.validators.address })
    .from(tables.validators)
    .where(inArray(tables.validators.address, addresses))
    .execute().then(r => r.map(r => r.address))

  const missingAddresses = addresses.filter(a => existingAddresses.indexOf(a) === -1)
  return missingAddresses
}

const validators = new Map<string, number>()

export async function storeValidator(address: string) {
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
  const newValidator = await useDrizzle().insert(tables.validators).values({ address, icon }).returning().get()
  validators.set(address, newValidator.id)
  return newValidator.id
}

/**
 * It gets the list of active validators and all its required data in order to be able to compute the score. 
 * If there is a validator that is not in the database, it throws an error.
 */
export async function getEpochIndexes(range: EpochRange): Promise<ValidatorEpochs> {
  const missingEpochs = await getMissingEpochs(range)
  if (missingEpochs.length > 0) throw new Error(`Missing epochs: ${missingEpochs.join(', ')}`)

  const activities = await useDrizzle()
    .select({
      epochIndex: tables.activity.epochIndex,
      address: tables.validators.address,
      validatorId: tables.validators.id
    })
    .from(tables.activity)
    .innerJoin(tables.validators, eq(tables.activity.validatorId, tables.validators.id))
    .where(and(lte(tables.activity.epochIndex, range.toEpoch), gte(tables.activity.epochIndex, range.fromEpoch)))
    .execute()

  const activitiesByValidator = activities.reduce((acc, activity) => {
    if (!acc[activity.address]) acc[activity.address] = { validatorId: activity.validatorId, activeEpochIndexes: [] }
    acc[activity.address].activeEpochIndexes.push(activity.epochIndex)
    return acc
  }, {} as Record<string, { validatorId: number, activeEpochIndexes: number[] }>)
  return activitiesByValidator
}

/**
 * Given a range of epochs, it returns the epochs that are missing in the database. 
 */
export async function getMissingEpochs(range: EpochRange) {
  const existingEpochs = await useDrizzle()
    .select({ epochIndex: tables.activity.epochIndex })
    .from(tables.activity)
    .where(and(gte(tables.activity.epochIndex, range.fromEpoch), lte(tables.activity.epochIndex, range.toEpoch)))
    .execute().then(r => r.map(r => r.epochIndex))
  return Array.from({ length: range.totalEpochs }, (_, i) => range.fromEpoch + i).filter(epoch => existingEpochs.indexOf(epoch) === -1)
}

/**
 * It computes the score for a given range of epochs. It will fetch the activity for the given epochs and then compute the score for each validator. 
 * It will delete the activities for the given epochs and then insert the new activities.
 */
export async function storeActivities(activities: Record<number, ActivityEpoch>) {
  const values: Newactivity[] = []
  const epochIndexes = Object.keys(activities).map(Number)
  for (const _epochIndex of epochIndexes) {
    const epochIndex = Number(_epochIndex)
    for (const { assigned, missed, validator } of activities[epochIndex]) {
      const validatorId = await storeValidator(validator)
      values.push({ assigned, missed, epochIndex, validatorId })
    }
  }

  console.log('Deleting activities for epochs:', epochIndexes)
  await useDrizzle().delete(tables.activity).where(inArray(tables.activity.epochIndex, epochIndexes))

  // For some reason, D1 is hanging when inserting all the values at once. So dividing the values in chunks of 32
  // seems to work
  const chunkArray = (arr: any[], chunkSize: number) => Array.from({ length: Math.ceil(arr.length / chunkSize) }, (_, i) => arr.slice(i * chunkSize, i * chunkSize + chunkSize))
  for (const chunk of chunkArray(values, 32))
    await Promise.all(values.map(v => useDrizzle().insert(tables.activity).values(chunk)))


  // If we ever move out of cloudfare we could use transactions to avoid inconsistencies
  // Cloudfare D1 does not support transactions: https://github.com/cloudflare/workerd/blob/e78561270004797ff008f17790dae7cfe4a39629/src/workerd/api/sql-test.js#L252-L253
  // await useDrizzle().transaction(async (tx) => {
  //  await tx.delete(tables.activity).where(inArray(tables.activity.epochIndex, epochIndexes))
  //  await Promise.all(values.map(v => tx.insert(tables.activity).values(v)))
  // })
}

/**
 * Insert the scores into the database. To avoid inconsistencies, it deletes all the scores for the given validators and then inserts the new scores.
 */
export async function storeScores(scores: NewScore[]) {
  const updatedAt = new Date().toISOString()

  await useDrizzle().delete(tables.scores).where(or(...scores.map(({ validatorId }) => eq(tables.scores.validatorId, validatorId))))
  await useDrizzle().insert(tables.scores).values(scores.map(s => ({ ...s, updatedAt })))

  // If we ever move out of cloudfare we could use transactions to avoid inconsistencies
  // Cloudfare D1 does not support transactions: https://github.com/cloudflare/workerd/blob/e78561270004797ff008f17790dae7cfe4a39629/src/workerd/api/sql-test.js#L252-L253
  // await useDrizzle().transaction(async (tx) => {
  //   await tx.delete(tables.scores).where(or(...scores.map(({ validatorId }) => eq(tables.scores.validatorId, validatorId))))
  //   await tx.insert(tables.scores).values(scores.map(s => ({ ...s, updatedAt })))
  // })
}
