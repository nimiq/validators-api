import { Client } from 'nimiq-rpc-client-ts'
import { fetchEpochsActivity } from './fetcher'
import { computeScore } from './score'
import { getEpochRange, getValidatorsParams } from './utils'
import { NewScore } from '../utils/drizzle'
import { getMissingEpochs, storeActivities, storeScores } from '../database/utils'

let client: Client
function getClient(url: string) {
  if (!url) throw new Error('Missing URL for VTS')
  if (!client) client = new Client(new URL(url))
  return client
}

export async function fetchVTSData(url: string) {
  const client = getClient(url)

  // The ranges that we will consider
  const ranges = await getEpochRange(client)

  // Only fetch the missing epochs that are not in the database
  const epochsIndexes = await getMissingEpochs(ranges)

  // Fetch the activity for the given epochs
  const activities = await fetchEpochsActivity(client, epochsIndexes)

  // Store the activities in the database
  await storeActivities(activities)
}

export async function computeVTSScore(url: string) {
  const client = getClient(url)

  // Get the parameters for the validators
  const params = await getValidatorsParams(client)

  // Compute the scores
  const scoresValues = params.map(p => ({ validatorId: p.validatorId, ...computeScore(p.params) } satisfies NewScore))
  await storeScores(scoresValues)
  return scoresValues
}

