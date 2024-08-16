import { max, count, } from 'drizzle-orm';
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
  latestActivityEpoch: number | undefined
  totalValidators: number
  headBlockNumber: number
  currentEpoch: number
  missingEpochs: number[]
  range: Range

  isSynced: boolean
  flags: HealthFlag[]
}


export default defineEventHandler(async (event) => {
  const db = await useDrizzle();

  // Get the latest epoch number in the scores table

  // Get the latest epoch number in the activity table
  const latestActivityEpoch = await db
    .select({ epoch: max(tables.activity.epochBlockNumber) })
    .from(tables.activity)
    .get()
    .then((row) => row?.epoch ?? -1);

  // Get the total number of validators
  const totalValidators = await db
    .select({ count: count(tables.validators.id) })
    .from(tables.validators)
    .get()
    .then((row) => row?.count ?? 0);

  const rpcClient = await getRpcClient();

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
    latestActivityEpoch,
    totalValidators,
    headBlockNumber,
    currentEpoch,
    range,
    missingEpochs,
    isSynced,
    flags,
  };

  // Return the health status
  setResponseStatus(event, 200);
  return healthStatus;
});