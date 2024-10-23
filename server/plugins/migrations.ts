import { migrate } from 'drizzle-orm/d1/migrator'
import { consola } from 'consola'
import { importValidatorsFromFiles } from '../utils/validators'

let validatorImported = false

export default defineNitroPlugin(async () => {
  if (!import.meta.dev)
    return

  onHubReady(async () => {
    await migrate(useDrizzle(), { migrationsFolder: 'server/database/migrations' })
      .then(() => {
        consola.success('Database migrations done')
      })
      .catch((err) => {
        consola.error('Database migrations failed', JSON.stringify(err))
      })
    // TODO Find a way to only run this once
    if (!validatorImported) {
      await importValidatorsFromFiles('./public/validators')
      validatorImported = true
    }
  })
})
