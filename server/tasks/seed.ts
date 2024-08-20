import { consola } from 'consola'
import { seedDatabase } from '../database/seed'

export default defineTask({
  meta: {
    name: 'db:seed',
    description: 'Deletes all data from the database',
  },
  async run() {
    consola.info('Seeding validators table...')
    await seedDatabase()
    return { result: 'Database seeded' }
  },
})
