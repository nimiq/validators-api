
import { count, gte, inArray, lte } from "drizzle-orm"
import { ActivityEpoch, EpochRange, ScoreValues, ValidatorEpochs } from "../vts/types"
// @ts-expect-error no types
import Identicons from '@nimiq/identicons'
import score from "../tasks/score"
import { NewScore } from "../utils/drizzle"

export async function doValidatorsExists(addresses: string[]) {
  const existingAddresses = await useDrizzle()
    .select({ address: tables.validators.address })
    .from(tables.validators)
    .where(inArray(tables.validators.address, addresses))
    .execute().then(r => r.map(r => r.address))

  const missingAddresses = addresses.filter(a => existingAddresses.indexOf(a) === -1)
  return missingAddresses.length === 0
}

export async function storeValidator(address: string) {
  const validatorId = await useDrizzle()
    .select({ id: tables.validators.id })
    .from(tables.validators)
    .where(eq(tables.validators.address, address))
    .get().then(r => r?.id)

  if (validatorId) return validatorId

  const icon = await Identicons.default.toDataUrl(address) as string
  const newValidator = await useDrizzle().insert(tables.validators).values({ address, icon }).returning().get()
  return newValidator.id
}

/**
 * It gets the list of active validators and all its required data in order to be able to compute the score. 
 * If there is a validator that is not in the database, it throws an error.
 */
export async function getEpochIndexes({ fromEpoch, toEpoch }: EpochRange): Promise<ValidatorEpochs> {
  const activities = await useDrizzle()
    .select({
      epochIndex: tables.activity.epochIndex,
      address: tables.validators.address,
      validatorId: tables.validators.id
    })
    .from(tables.activity)
    .innerJoin(tables.validators, eq(tables.activity.validatorId, tables.validators.id))
    .where(and(lte(tables.activity.epochIndex, toEpoch), gte(tables.activity.epochIndex, fromEpoch)))
    .execute()

  const epochSet = new Set(activities.map(activity => activity.epochIndex))
  const expectedEpochs = Array.from({ length: toEpoch - fromEpoch + 1 }, (_, i) => fromEpoch + i)
  if (expectedEpochs.some(epoch => !epochSet.has(epoch)))
    throw new Error(`Missing epoch indexes from ${fromEpoch} to ${toEpoch}. Found ${epochSet.size} epochs, expected ${toEpoch - fromEpoch + 1} epochs`)

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
  console.log({range})

  return Array.from({ length: range.totalEpochs }, (_, i) => range.fromEpoch + i).filter(epoch => existingEpochs.indexOf(epoch) === -1)

}

/**
 * It computes the score for a given range of epochs. It will fetch the activity for the given epochs and then compute the score for each validator. 
 * It will delete the activities for the given epochs and then insert the new activities.
 */
export async function storeActivities(activities: Record<number, ActivityEpoch>) {
  const values: Newactivity[] = []
  for (const _epochIndex of Object.keys(activities)) {
    const epochIndex = Number(_epochIndex)
    for (const { assigned, missed, validator } of activities[epochIndex]) {
      const validatorId = await storeValidator(validator)
      values.push({ assigned, missed, epochIndex, validatorId })
    }
  }
  await useDrizzle().delete(tables.activity).where(inArray(tables.activity.epochIndex, Object.keys(activities).map(Number)))
  await useDrizzle().insert(tables.activity).values(values)
}

/**
 * Insert the scores into the database. To avoid inconsistencies, it deletes all the scores for the given validators and then inserts the new scores.
 */
export async function storeScores(scores: NewScore[]) {
  const updatedAt = new Date().toISOString()
  await useDrizzle().delete(tables.scores).where(or(...scores.map(({ validatorId }) => eq(tables.scores.validatorId, validatorId))))
  await useDrizzle().insert(tables.scores).values(scores.map(s => ({ ...s, updatedAt })))
}
