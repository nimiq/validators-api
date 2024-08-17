import { max, count, } from 'drizzle-orm';
import { Range, getRange } from 'nimiq-vts';

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
  console.log('GET /vts/health')
  const url = useRuntimeConfig().rpcUrl
  if (!url) 
    throw new Error('Missing RPC URL in runtime config')
  console.log('RPC URL:', url)
  // const rpcClient = new NimiqRPCClient(new URL(url))
  // console.log('RPC Client:', rpcClient)

  // Get the latest epoch number in the activity table
  const latestActivityBlock = await useDrizzle()
    .select({ epoch: max(tables.activity.epochBlockNumber) })
    .from(tables.activity)
    .get()
    .then((row) => row?.epoch ?? -1);
    console.log('Latest Activity Block:', latestActivityBlock)

  // const { data: latestFetchedEpoch, error: errorLatestFetchedEpoch } = await rpcClient.policy.getEpochAt(latestActivityBlock)
  // if (errorLatestFetchedEpoch)
  //   throw errorLatestFetchedEpoch;
  // console.log('Latest Fetched Epoch:', latestFetchedEpoch)

  // Get the total number of validators
  const totalValidators = await useDrizzle()
    .select({ count: count(tables.validators.id) })
    .from(tables.validators)
    .get()
    .then((row) => row?.count ?? 0)
  console.log('Total Validators:', totalValidators)

  const fetchedEpochs = await useDrizzle()
    .selectDistinct({ epoch: tables.activity.epochBlockNumber })
    .from(tables.activity)
    .orderBy(tables.activity.epochBlockNumber)
    .all()
    .then((rows) => rows.map(row => row.epoch));
  console.log('Fetched Epochs:', fetchedEpochs)


  // const { data: headBlockNumber, error: errorHeadBlockNumber } = await rpcClient.blockchain.getBlockNumber()
  // if (errorHeadBlockNumber)
  //   throw errorHeadBlockNumber;
  // console.log('Head Block Number:', headBlockNumber)
  // const { data: currentEpoch, error: errorCurrentEpoch } = await rpcClient.blockchain.getEpochNumber()
  // if (errorCurrentEpoch)
  //   throw errorCurrentEpoch;
  // console.log('Current Epoch:', currentEpoch)

  // const range = await getRange(rpcClient);
  // console.log('Range:', range)
  // const missingEpochs = await getMissingEpochs(range);
  // console.log('Missing Epochs:', missingEpochs)

  // const isSynced = missingEpochs.length === 0;
  // console.log('Is Synced:', isSynced)
  const flags: HealthFlag[] = []
  // if (!isSynced) flags.push(HealthFlag.MissingEpochs)

  // Combine all the data into a HealthStatus object
  // const healthStatus: HealthStatus = {
  //   latestFetchedEpoch,
  //   totalValidators,
  //   headBlockNumber,
  //   currentEpoch,
  //   range,
  //   missingEpochs,
  //   isSynced,
  //   flags,
  //   fetchedEpochs,
  // };
  // console.log('Health Status:', healthStatus)

  // Return the health status
  setResponseStatus(event, 200);
  return { status: 'ok' } as const;
});