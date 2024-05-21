import { Address, Client, PolicyConstants } from 'nimiq-rpc-client-ts'
import { fetchEpochsActivity } from './fetcher'
import { ComputeScoreConst, computeScore } from './score'
import { consola } from 'consola'
import { gte, lte } from 'drizzle-orm'
import defu from 'defu'

let client: Client
function getClient(url: string) {
  if (!url) throw new Error('Missing URL for VTS')
  if (!client) client = new Client(new URL(url))
  return client
}

export async function fetchVTSData(url: string) {
  fetchEpochsActivity(getClient(url))
}

export async function computeVTSScore(url: string) {
  const params = await getValidatorsParams(getClient(url))
  const scores = await Promise.all(params.map(p => computeScore(p.validatorId, p.params)))

  const validatorIds = scores.map(s => s.validatorId)

  // We need to insert the scores into the database
  // I don't know if we can do an upsert. Some validators might not have a score yet so we delete and then insert
  await useDrizzle().delete(tables.scores).where(or(...validatorIds.map(id => eq(tables.scores.validatorId, id))))
  await useDrizzle().insert(tables.scores).values(scores)

  return scores
}

const WINDOW_SIZE = 9 * 30 * 24 * 60 * 60 * 1000 // 9 months

async function getValidatorsParams(client: Client) {
  const { data: activeValidators, error: errorActiveValdators } = await client.blockchain.getActiveValidators()
  if (errorActiveValdators || !activeValidators) throw new Error(errorActiveValdators.message || 'No active validators')

  const totalBalance = activeValidators.reduce((acc, v) => acc + v.balance, 0)

  const getBalance = (address: Address) => activeValidators.find(v => v.address === address)?.balance || 0

  const knownValidators = await useDrizzle()
    .select()
    .from(tables.validators)
    .where(or(...activeValidators.map(v => eq(tables.validators.address, v.address))))

  const unknownValidators = activeValidators.filter(v => !knownValidators.find(kv => kv.address === v.address))
  if (unknownValidators.length > 0)
    consola.warn(`Ignoring ${unknownValidators.length} unknown validators.`)

  const { data: policy, error: errorPolicy } = await client.policy.getPolicyConstants()
  if (errorPolicy || !policy) throw new Error(errorPolicy.message || 'No policy constants')

  const { data: head, error: errorHead } = await client.blockchain.getBlockNumber()
  if (errorHead || !head) throw new Error(errorHead?.message || 'No head block number')

  const { blockSeparationTime } = policy as PolicyConstants & { blockSeparationTime: number }

  const blocksDifference = Math.ceil(WINDOW_SIZE / blockSeparationTime)
  const fromEpoch = head - blocksDifference
  const toEpoch = head

  const defaultScoreParams: ComputeScoreConst = { size: { totalBalance }, liveness: { fromEpoch, toEpoch } }
  const params: { validatorId: number, params: ComputeScoreConst }[] = await Promise.all(knownValidators.map(async (v) => {
    const activeEpochIndexes = await useDrizzle().select({ epochIndex: tables.activity.epochIndex }).from(tables.activity).where(and(
      eq(tables.activity.validatorId, v.id),
      lte(tables.activity.epochIndex, toEpoch),
      gte(tables.activity.epochIndex, fromEpoch)
    )).then(r => r.map(e => e.epochIndex))
    const vParams: ComputeScoreConst = { liveness: { activeEpochIndexes }, size: { balance: getBalance(v.address as Address) } }
    return { validatorId: v.id, params: defu(defaultScoreParams, vParams) }
  }))

  return params
}
