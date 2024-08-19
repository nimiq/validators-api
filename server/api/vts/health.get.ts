import { max, count, } from 'drizzle-orm';
import { NimiqRPCClient } from 'nimiq-rpc-client-ts';
import { Range, getRange } from 'nimiq-vts';
import { getMissingEpochs } from '~~/server/database/utils';
import { consola } from 'consola'

export enum HealthFlag {
  MissingEpochs = 'missing-epochs',
  // TODO
  // ScoreNotComputed = 'score-not-computed',
}

export interface HealthStatus {
  // TODO
  // latestScoreEpoch: number | undefined
  latestFetchedEpoch: number | undefined
  totalValidators: number
  headBlockNumber: number
  currentEpoch: number
  missingEpochs: number[]
  fetchedEpochs: number[]
  range: Range

  isSynced: boolean
  flags: HealthFlag[]
}

function err(error: any) {
  consola.error(error)
  return createError(error)
}

export default defineEventHandler(async (event) => {
  consola.info('GET /vts/health')
  const url = useRuntimeConfig().rpcUrl
  if (!url) return err('Missing RPC URL in runtime config');
  consola.info('RPC URL:', url)
  const rpcClient = new NimiqRPCClient(new URL(url))
  consola.info('RPC Client:', rpcClient)

  // Get the latest epoch number in the activity table
  const latestActivityBlock = await useDrizzle()
    .select({ epoch: max(tables.activity.epochBlockNumber) })
    .from(tables.activity)
    .get()
    .then((row) => row?.epoch ?? -1);
  consola.info('Latest Activity Block:', latestActivityBlock)

  const { data: latestFetchedEpoch, error: errorLatestFetchedEpoch } = await rpcClient.policy.getEpochAt(latestActivityBlock)
  if (errorLatestFetchedEpoch) return err(errorLatestFetchedEpoch);
  consola.info('Latest Fetched Epoch:', latestFetchedEpoch)
  // const latestFetchedEpoch = latestActivityBlock

  // Get the total number of validators
  const totalValidators = await useDrizzle()
    .select({ count: count(tables.validators.id) })
    .from(tables.validators)
    .get()
    .then((row) => row?.count ?? 0)
  consola.info('Total Validators:', totalValidators)

  const fetchedEpochs = await useDrizzle()
    .selectDistinct({ epoch: tables.activity.epochBlockNumber })
    .from(tables.activity)
    .orderBy(tables.activity.epochBlockNumber)
    .all()
    .then((rows) => rows.map(row => row.epoch));
  consola.info('Fetched Epochs:', fetchedEpochs)


  const { data: headBlockNumber, error: errorHeadBlockNumber } = await rpcClient.blockchain.getBlockNumber()
  if (errorHeadBlockNumber) return err(errorHeadBlockNumber)
  consola.info('Head Block Number:', headBlockNumber)
  const { data: currentEpoch, error: errorCurrentEpoch } = await rpcClient.blockchain.getEpochNumber()
  if (errorCurrentEpoch) return err(errorCurrentEpoch)
  consola.info('Current Epoch:', currentEpoch)

  const range = await getRange(rpcClient);
  consola.info('Range:', range)
  const missingEpochs = await getMissingEpochs(range);
  consola.info('Missing Epochs:', missingEpochs)

  const isSynced = missingEpochs.length === 0;
  consola.info('Is Synced:', isSynced)
  const flags: HealthFlag[] = []
  if (!isSynced) flags.push(HealthFlag.MissingEpochs)

  // Combine all the data into a HealthStatus object
  const healthStatus: HealthStatus = {
    latestFetchedEpoch,
    totalValidators,
    headBlockNumber,
    currentEpoch,
    range,
    missingEpochs,
    isSynced,
    flags,
    fetchedEpochs,
  };
  consola.info('Health Status:', healthStatus)

  // Return the health status
  setResponseStatus(event, 200);
  return healthStatus;
});