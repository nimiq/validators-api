import { seedDatabase } from '../database/seed'

export default defineNitroPlugin(async () => {
  if (!import.meta.dev) return
  let seeded = false
  onHubReady(async () => {
    await seedDatabase()
    seeded = true
  })
})
