import { config } from 'dotenv'
import { join } from 'pathe'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: [
      { find: '~~', replacement: __dirname },
      {
        find: /^nimiq-validator-trustscore\/(.+)$/,
        replacement: join(__dirname, 'packages/nimiq-validator-trustscore/src/$1.ts'),
      },
    ],
  },
  test: {
    env: config({ path: join(__dirname, '.env.local') }).parsed,
  },
})
