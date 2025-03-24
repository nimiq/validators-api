import type { EpochsActivities } from 'nimiq-validator-trustscore/types'
import { consola } from 'consola'
import { not } from 'drizzle-orm'
import { fetchEpochs } from 'nimiq-validator-trustscore/fetcher'
import { getRpcClient } from '~~/server/lib/client'

function err(error: any) {
  consola.error(error)
  return createError(error)
}

export default defineEventHandler(async (event) => {
  const epochNumberParam = getRouterParam(event, 'epochNumber')
  const epochNumber = Number(epochNumberParam)

  if (!epochNumber || Number.isNaN(epochNumber))
    return err(`Invalid epoch number: ${epochNumberParam}`)

  const epoch = await useDrizzle()
    .select({
      epochNumber: tables.activity.epochNumber,
      likelihood: tables.activity.likelihood,
      rewarded: tables.activity.rewarded,
      missed: tables.activity.missed,
      dominanceRatioViaBalance: tables.activity.dominanceRatioViaBalance,
      dominanceRatioViaSlots: tables.activity.dominanceRatioViaSlots,
      validatorAddress: tables.validators.address,
    })
    .from(tables.activity)
    .leftJoin(tables.validators, eq(tables.activity.validatorId, tables.validators.id))
    .where(and(
      eq(tables.activity.epochNumber, epochNumber),
      not(eq(tables.activity.likelihood, -1)),
    ))
    .all()

  if (epoch.length > 0)
    return epoch

  consola.info(`Epoch ${epochNumber} is missing, fetching it...`)
  const rpcClient = getRpcClient()
  const epochGenerator = fetchEpochs(rpcClient, [epochNumber])

  const epochsActivities: EpochsActivities = {}

  while (true) {
    const { value: pair, done } = await epochGenerator.next()
    if (done || !pair)
      break

    const { activity, address, epochIndex } = pair

    if (activity === null) {
      await storeSingleActivity({ address: '', activity: null, epochNumber: pair.epochIndex })
      return err(`Epoch ${pair.epochIndex} is missing`)
    }
    // Initialize epoch object if it doesn't exist
    epochsActivities[epochIndex] = epochsActivities[epochIndex] || {}
    // Store activity for the address in this epoch
    epochsActivities[epochIndex][address] = activity
  }
  await storeActivities(epochsActivities)
  const epochActivity = epochsActivities[epochNumber]
  for (const address in epochActivity) {
    epoch.push({
      epochNumber,
      likelihood: epochActivity[address].likelihood,
      rewarded: epochActivity[address].rewarded,
      missed: epochActivity[address].missed,
      dominanceRatioViaBalance: epochActivity[address].dominanceRatioViaBalance,
      dominanceRatioViaSlots: epochActivity[address].dominanceRatioViaSlots,
      validatorAddress: address,
    })
  }

  return epoch
})
