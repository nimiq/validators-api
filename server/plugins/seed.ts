import { seedDatabase } from '../database/seed'

export default defineNitroPlugin(async () => {
  if (!import.meta.dev) return
  onHubReady(seedDatabase)
})
