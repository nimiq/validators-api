import { Client } from 'nimiq-rpc-client-ts'
import { fetchEpochsActivity } from './fetcher'
import { computeScore } from './score'
import { getValidatorsParams } from './score-params'

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

