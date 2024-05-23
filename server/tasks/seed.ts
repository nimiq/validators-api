import { seedDatabase } from "../database/seed"
import { consola } from 'consola'

export default defineTask({
  meta: {
    name: "db:seed",
    description: "Deletes all data from the database",
  },
  async run() {
    consola.info("Seeding validators table...")
    await seedDatabase()
    return { result: "Database seeded" }
  },
})
