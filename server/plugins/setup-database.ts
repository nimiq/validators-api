import { consola } from 'consola'
import { migrate } from 'drizzle-orm/d1/migrator'
import { importValidatorsFromFiles } from '../utils/validators'

export default defineNitroPlugin(async () => {
  if (!import.meta.dev)
    return

  onHubReady(async () => {
    // Migrate database
    await migrate(useDrizzle(), { migrationsFolder: 'server/database/migrations' })
      .then(() => {
        consola.success('Database migrations done')
      })
      .catch((err) => {
        consola.error('Database migrations failed', JSON.stringify(err))
      })

    const { nimiqNetwork } = useRuntimeConfig().public

    // Import validators
    await importValidatorsFromFiles(`./public/validators/${nimiqNetwork}/`)

    // Fetch missing data
    await runTask('fetch')
  })
})
