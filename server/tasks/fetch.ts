import { consola } from 'consola'
import { fetchParams } from '../lib/fetch'
import { getRpcClient } from '../lib/client'

export default defineTask({
  meta: {
    name: 'fetch',
    description: 'Fetches the necessary data from the blockchain',
  },
  async run() {
    consola.info('Running fetch task...')
    const client = getRpcClient()
    const res = await fetchParams(client)
    if (!res)
      return { result: 'No new epochs fetched' }
    return { result: `New ${res.missingEpochs.length} epochs fetched and ${res.missingValidators.length} validators of the current epoch stored ${JSON.stringify(res.addressesCurrentValidators)}` }
  },
})
