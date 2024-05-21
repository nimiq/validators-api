import { Client, ElectionMacroBlock, PolicyConstants } from "nimiq-rpc-client-ts";
import { consola } from 'consola'
import { AsyncOption, AsyncResult } from "./types";
import { count } from "drizzle-orm";
import { getKnownValidator } from "./known-validators";

const validatorCache = new Map<string, number>();

async function storeValidator(address: string) {
  if (validatorCache.has(address))
    return validatorCache.get(address)!;

  // Make sure we already store all that information
  const maybeValidatorId = await useDrizzle()
    .select({ id: tables.validators.id })
    .from(tables.validators)
    .where(eq(tables.validators.address, address)).get();
  if (maybeValidatorId && maybeValidatorId.id) {
    validatorCache.set(address, maybeValidatorId.id);
    return maybeValidatorId.id;
  }

  const { icon, description, fee, name, payoutType, tag, website } = await getKnownValidator(address);
  const { id } = await useDrizzle()
    .insert(tables.validators)
    .values({ address, icon, description, fee, name, payoutType, tag, website })
    .returning({ id: tables.validators.id }).get();

  validatorCache.set(address, id);
  return id;
}

async function storeActivity(epochIndex: number, activity: ActivityEpoch) {
  const values: Newactivity[] = []
  for (const { validator, assigned, missed } of activity) {
    const validatorId = await storeValidator(validator)
    values.push({ assigned, missed, epochIndex, validatorId })
  }

  await useDrizzle().insert(tables.activity).values(values)
}

async function isActivityInDB(epochIndex: number): Promise<boolean> {
  const epochAlreadyFetched = await useDrizzle()
    .select({ value: count() })
    .from(tables.activity)
    .where(eq(tables.activity.epochIndex, epochIndex))
    .get()
    .then(res => (res?.value || 0) > 0)
  return epochAlreadyFetched
}


export type ActivityEpoch = { validator: string, assigned: number, missed: number }[]
export async function fetchEpoch(client: Client, blockNumber: number, missed: number): AsyncResult<ActivityEpoch> {
  const { data: block, error } = await client.blockchain.getBlockByNumber(blockNumber, { includeTransactions: true })
  if (error || !block) return { data: undefined, error: error.message || "Block not found" }
  const data = (block as ElectionMacroBlock).slots.map(({ numSlots, validator }) => ({ validator, assigned: numSlots, missed }))
  return { data, error: undefined };
}

interface fetchBlockOptions { epochIndex: number, blockNumber: number }
async function fetchActivity(client: Client, { epochIndex, blockNumber }: fetchBlockOptions): AsyncOption<string> {
  if (await isActivityInDB(epochIndex)) return
  const { data: epoch, error } = await fetchEpoch(client, blockNumber, 0)
  if (error || !epoch) return error + JSON.stringify({ epochIndex, blockNumber }) || "Epoch not found"
  await storeActivity(epochIndex, epoch)
}

type fetchEpochOptions = { from?: number, to?: number };
export async function fetchEpochsActivity(client: Client, options: fetchEpochOptions = {}): AsyncOption<string> {
  // TODO Balance should be update somewhere

  const { data: policy, error: errorPolicy } = await client.policy.getPolicyConstants()
  if (errorPolicy) return errorPolicy.message
  const { blocksPerEpoch, genesisBlockNumber } = policy as PolicyConstants & { genesisBlockNumber: number }


  if (!options.from)
    options.from = genesisBlockNumber
  if (!options.to) {
    const { data: epochNumber, error } = await client.blockchain.getEpochNumber()
    if (error) return error.message
    options.to = genesisBlockNumber + (epochNumber - 1) * blocksPerEpoch
  }

  const blockToEpochIndex = (n: number) => Math.max(0, Math.floor((n - genesisBlockNumber + blocksPerEpoch - 1) / blocksPerEpoch))
  const epochIndexToBlock = (i: number) => genesisBlockNumber + i * blocksPerEpoch

  const fromEpoch = blockToEpochIndex(options.from)
  const toEpoch = blockToEpochIndex(options.to)
  const totalEpochs = toEpoch - fromEpoch + 1;

  consola.info(`Retrieving epochs from ${fromEpoch} to ${toEpoch} (${totalEpochs} epochs)`)

  for (let epochIndex = toEpoch; epochIndex >= fromEpoch; epochIndex--)
    await fetchActivity(client, { epochIndex, blockNumber: epochIndexToBlock(epochIndex) })

  consola.success(`fetchd ${totalEpochs} epochs`)
}
