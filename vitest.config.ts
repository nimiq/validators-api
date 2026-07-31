import { config } from 'dotenv'
import { join } from 'pathe'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '~~': __dirname,
    },
  },
  test: {
    env: config({ path: join(__dirname, '.env.local') }).parsed,
  },
})
