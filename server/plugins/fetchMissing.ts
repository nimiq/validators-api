import { consola } from 'consola'
import { fetch } from '../tasks/fetch'

export default defineNitroPlugin(async () => {
  if (!import.meta.dev || !useRuntimeConfig().GITHUB_ACTIONS)
    return

  onHubReady(async () => {
    consola.info('Running fetch task...')
    const res = await fetch()
    consola.info(res.result)
  })
})
