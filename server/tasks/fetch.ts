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
  const { data, error } = await retrieveActivity(client)
  if (!data || error)
    return { result: error || 'Error fetching data' }
  const { missingEpochs, missingValidators, addressesCurrentValidators } = data
  return { result: `New ${missingEpochs.length} epochs fetched and ${missingValidators.length} validators of the current epoch stored ${JSON.stringify(addressesCurrentValidators)}` }
}
