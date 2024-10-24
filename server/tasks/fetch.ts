import { consola } from 'consola'
import { getRpcClient } from '../lib/client'
import { retrieveActivity } from '../lib/fetch'

export default defineTask({
  meta: {
    name: 'fetch',
    description: 'Fetches the necessary data from the blockchain',
  },
  async run() {
    return await fetch()
  },
})

export async function fetch() {
  consola.info('Running fetch task...')
  const client = getRpcClient()
  const res = await retrieveActivity(client)
  if (!res)
    return { result: 'No new epochs fetched' }
  return { result: `New ${res.missingEpochs.length} epochs fetched and ${res.missingValidators.length} validators of the current epoch stored ${JSON.stringify(res.addressesCurrentValidators)}` }
}
