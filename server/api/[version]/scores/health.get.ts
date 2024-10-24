import { getRpcClient } from '~~/server/lib/client'
import { consola } from 'consola'
import { count, max } from 'drizzle-orm'
import { getRange } from 'nimiq-validators-score'

function err(error: any) {
  consola.error(error)
  return createError(error)
}

export default defineEventHandler(async () => {
  const networkName = useRuntimeConfig().public.nimiqNetwork

  const rpcClient = getRpcClient()

  // Get the latest epoch number in the activity table
  const latestActivityBlock = await useDrizzle()
    .select({ epoch: max(tables.activity.epochNumber) })
    .from(tables.activity)
    .get()
    .then(row => row?.epoch ?? -1)

  const { data: latestFetchedEpoch, error: errorLatestFetchedEpoch } = await rpcClient.policy.getEpochAt(latestActivityBlock)
  if (errorLatestFetchedEpoch)
    throw err(errorLatestFetchedEpoch)

  // Get the total number of validators
  const totalValidators = await useDrizzle()
    .select({ count: count(tables.validators.id) })
    .from(tables.validators)
    .get()
    .then(row => row?.count ?? 0)

  const fetchedEpochs = await useDrizzle()
    .selectDistinct({ epoch: tables.activity.epochNumber })
    .from(tables.activity)
    .orderBy(tables.activity.epochNumber)
    .all()
    .then(rows => rows.map(row => row.epoch))

  const { data: headBlockNumber, error: errorHeadBlockNumber } = await rpcClient.blockchain.getBlockNumber()
  if (errorHeadBlockNumber)
    throw err(errorHeadBlockNumber)

  const { data: currentEpoch, error: errorCurrentEpoch } = await rpcClient.blockchain.getEpochNumber()
  if (errorCurrentEpoch)
    throw err(errorCurrentEpoch)

  const flags: HealthFlag[] = []
  const range = await getRange(rpcClient)

  const missingEpochs = await findMissingEpochs(range)
  if (missingEpochs.length > 0)
    flags.push(HealthFlag.MissingEpochs)

  if (totalValidators === 0)
    flags.push(HealthFlag.NoValidators)

  const isSynced = flags.length === 0

  // TODO Add component to see how much time left for next epoch and length of current epoch

  return {
    latestFetchedEpoch,
    totalValidators,
    headBlockNumber,
    currentEpoch,
    range,
    missingEpochs,
    isSynced,
    flags,
    fetchedEpochs,
    network: networkName,
  } satisfies HealthStatus
})
