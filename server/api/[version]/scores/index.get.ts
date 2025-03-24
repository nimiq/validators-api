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
  const params = await getValidatedQuery(event, mainQuerySchema.parse)

  const networkName = useRuntimeConfig().public.nimiqNetwork

  const rpcClient = getRpcClient()

  const { data: range, error: errorRange } = await extractRangeFromRequest(rpcClient, event)
  if (errorRange || !range)
    throw err(`Error extracting range from request ${errorRange}` || 'No range')

  // TODO Remove this block once scheduled tasks are implemented in NuxtHub and the data is being
  // fetched periodically
  // This is just a workaround to sync the data before the request in case of missing epochs
  const missingEpochs = await findMissingEpochs(range)
  if (missingEpochs.length > 0) {
    consola.warn(`Missing epochs: ${JSON.stringify(missingEpochs)}. Fetching data...`)
    await retrieveActivity(rpcClient)
  }
  // End of workaround

  const { data: activeValidators, error: errorValidators } = await rpcClient.blockchain.getActiveValidators()
  if (errorValidators || !activeValidators)
    throw new Error(JSON.stringify({ errorValidators, activeValidators }))

  const existingScores = await Promise.all(activeValidators.map(({ address }) => checkIfScoreExistsInDb(range, address)))
  if (!(existingScores.every(x => x === true)) || params.force) {
    consola.info('Calculating scores...')
    await calculateScores(range)
  }

  const validators = await useDrizzle()
    .select({
      id: tables.validators.id,
      name: tables.validators.name,
      address: tables.validators.address,
      fee: tables.validators.fee,
      payoutType: tables.validators.payoutType,
      payoutSchedule: tables.validators.payoutSchedule,
      description: tables.validators.description,
      logo: tables.validators.logo,
      isMaintainedByNimiq: tables.validators.isMaintainedByNimiq,
      website: tables.validators.website,
      availability: tables.scores.availability,
      total: tables.scores.total,
      dominance: tables.scores.dominance,
      dominanceRatioViaBalance: tables.activity.dominanceRatioViaBalance,
      dominanceRatioViaSlots: tables.activity.dominanceRatioViaSlots,
      reliability: tables.scores.reliability,
      reason: tables.scores.reason,
    })
    .from(tables.validators)
    .leftJoin(tables.scores, eq(tables.validators.id, tables.scores.validatorId))
    .leftJoin(tables.activity, and(eq(tables.validators.id, tables.activity.validatorId), eq(tables.activity.epochNumber, range.toEpoch)))
    .where(isNotNull(tables.scores.validatorId))
    .groupBy(tables.validators.id)
    .orderBy(desc(tables.scores.total))
    .all() as ValidatorScore[]

  validators.forEach((validator) => {
    const activeValidator = activeValidators.find(av => av.address === validator.address)
    if (activeValidator) {
      validator.reason.stakedBalance = activeValidator.balance
    }
  })

  return { validators, range, network: networkName } as const
})
