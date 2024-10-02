import { consola } from 'consola'
import { desc, isNotNull } from 'drizzle-orm'
import { getRpcClient } from '~~/server/lib/client'
import { retrieveActivity } from '~~/server/lib/fetch'

function err(error: any) {
  consola.error(error)
  return createError(error)
}

// TODO What if the selected epoch does not have activity for the validator?
// Code now will return a range where the last epoch is the last epoch with activity
// but we should maybe add a flag to the return?

export default defineEventHandler(async (event) => {
  const networkName = useRuntimeConfig().public.nimiqNetwork

  const rpcClient = getRpcClient()

  const { data: range, error: errorRange } = await extractRangeFromRequest(rpcClient, event)
  if (errorRange || !range)
    throw err(errorRange || 'No range')

  // TODO Remove this block once scheduled tasks are implemented in NuxtHub and the data is being
  // fetched periodically
  // This is just a workaround to sync the data before the request in case of missing epochs
  const missingEpochs = await findMissingEpochs(range)
  if (missingEpochs.length > 0) {
    consola.warn(`Missing epochs: ${JSON.stringify(missingEpochs)}. Fetching data...`)
    await retrieveActivity(rpcClient)
  }
  // End of workaround

  if (!(await checkIfScoreExistsInDb(range)))
    await calculateScores(range)

  const validators = await useDrizzle()
    .select({
      id: tables.validators.id,
      name: tables.validators.name,
      address: tables.validators.address,
      fee: tables.validators.fee,
      payoutType: tables.validators.payoutType,
      description: tables.validators.description,
      icon: tables.validators.icon,
      isMaintainedByNimiq: tables.validators.isMaintainedByNimiq,
      website: tables.validators.website,
      liveness: tables.scores.liveness,
      total: tables.scores.total,
      size: tables.scores.size,
      sizeRatio: tables.activity.sizeRatio,
      reliability: tables.scores.reliability,
    })
    .from(tables.validators)
    .leftJoin(tables.scores, eq(tables.validators.id, tables.scores.validatorId))
    .leftJoin(tables.activity, and(eq(tables.validators.id, tables.activity.validatorId), eq(tables.activity.epochNumber, range.toEpoch)))
    .where(isNotNull(tables.scores.validatorId))
    .groupBy(tables.validators.id)
    .orderBy(desc(tables.scores.total))
    .all() as ValidatorScore[]

  return { validators, range, network: networkName } as const
})
