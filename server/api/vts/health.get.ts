import { max, count, } from 'drizzle-orm';
import { NimiqRPCClient } from 'nimiq-rpc-client-ts';
import { Range, getRange } from 'nimiq-vts';
import { getMissingEpochs } from '~~/server/database/utils';

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


export default defineEventHandler(async (event) => {
  const url = useRuntimeConfig().rpcUrl
  if (!url) 
    throw new Error('Missing RPC URL in runtime config')
  const rpcClient = new NimiqRPCClient(new URL(url))

  // Get the latest epoch number in the activity table
  const latestActivityBlock = await useDrizzle()
    .select({ epoch: max(tables.activity.epochBlockNumber) })
    .from(tables.activity)
    .get()
    .then((row) => row?.epoch ?? -1);

  const { data: latestFetchedEpoch, error: errorLatestFetchedEpoch } = await rpcClient.policy.getEpochAt(latestActivityBlock)
  if (errorLatestFetchedEpoch)
    throw errorLatestFetchedEpoch;

  // Get the total number of validators
  const totalValidators = await useDrizzle()
    .select({ count: count(tables.validators.id) })
    .from(tables.validators)
    .get()
    .then((row) => row?.count ?? 0);

  const fetchedEpochs = await useDrizzle()
    .selectDistinct({ epoch: tables.activity.epochBlockNumber })
    .from(tables.activity)
    .orderBy(tables.activity.epochBlockNumber)
    .all()
    .then((rows) => rows.map(row => row.epoch));


  const { data: headBlockNumber, error: errorHeadBlockNumber } = await rpcClient.blockchain.getBlockNumber()
  if (errorHeadBlockNumber)
    throw errorHeadBlockNumber;
  
  const { data: currentEpoch, error: errorCurrentEpoch } = await rpcClient.blockchain.getEpochNumber()
  if (errorCurrentEpoch)
    throw errorCurrentEpoch;

  const range = await getRange(rpcClient);
  const missingEpochs = await getMissingEpochs(range);

  const isSynced = missingEpochs.length === 0;
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

  // Return the health status
  setResponseStatus(event, 200);
  return healthStatus;
});