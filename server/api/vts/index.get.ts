import { desc, eq, isNotNull, max } from 'drizzle-orm'
import { consola } from 'consola'
import { getRange } from '~~/packages/nimiq-vts/src'
import { getMissingEpochs } from '~~/server/database/utils'
import { fetchVtsData } from '~~/server/lib/fetch'
import { getRpcClient } from '~~/server/lib/client'

export interface Validator {
  id: number
  name: string
  address: string
  fee: number
  payoutType: string
  description: string
  icon: string
  tag: string
  website: string
  total: number
  liveness: number
  size: number
  reliability: number
}

function err(error: any) {
  consola.error(error)
  return createError(error)
}

export default defineEventHandler(async (event) => {
  const rpcClient = getRpcClient()

  // TODO Remove this block once scheduled tasks are implemented in NuxtHub
  // This is just a workaround to sync the data before the request in case of missing epochs
  const range = await getRange(rpcClient)
  const missingEpochs = await getMissingEpochs(range)
  if (missingEpochs.length > 0) {
    consola.warn(`Missing epochs: ${JSON.stringify(missingEpochs)}. Fetching data...`)
    await fetchVtsData(rpcClient)
  }
  // End of workaround

  const validators = await useDrizzle()
    .select({
      id: tables.validators.id,
      name: tables.validators.name,
      address: tables.validators.address,
      fee: tables.validators.fee,
      payoutType: tables.validators.payoutType,
      description: tables.validators.description,
      icon: tables.validators.icon,
      tag: tables.validators.tag,
      website: tables.validators.website,
      total: tables.scores.total,
      liveness: tables.scores.liveness,
      size: tables.scores.size,
      reliability: tables.scores.reliability,
    })
    .from(tables.validators)
    .leftJoin(tables.scores, eq(tables.validators.id, tables.scores.validatorId))
    .where(isNotNull(tables.scores.validatorId))
    .groupBy(tables.validators.id)
    .orderBy(desc(tables.scores.total))
    .all() as Validator[]

  const epochBlockNumber = await useDrizzle()
    .select({ epoch: max(tables.activity.epochBlockNumber) })
    .from(tables.activity)
    .get().then(row => row?.epoch ?? -1)

  const { data: epochNumber, error: epochNumberError } = await rpcClient.policy.getEpochAt(epochBlockNumber)
  if (epochNumberError)
    return err(epochNumberError)

  setResponseStatus(event, 200)
  return { validators, epochNumber } as const
})
