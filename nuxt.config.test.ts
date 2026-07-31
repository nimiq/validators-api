import { afterEach, describe, expect, it, vi } from 'vitest'
import wranglerConfig from './wrangler.json'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('score v2 runtime configuration', () => {
  it('uses the Nitro-compatible NUXT_SCORE_V2_MODE environment variable', async () => {
    vi.stubEnv('NUXT_SCORE_V2_MODE', 'shadow')
    vi.stubGlobal('defineNuxtConfig', (config: unknown) => config)

    const { default: config } = await import('./nuxt.config')

    expect(config.runtimeConfig?.scoreV2Mode).toBe('shadow')
  })

  it('publishes the expected rollout mode in both Wrangler environments', () => {
    expect(wranglerConfig.vars).toEqual(expect.objectContaining({
      NUXT_SCORE_V2_MODE: 'shadow',
    }))
    expect(wranglerConfig.env.testnet.vars).toEqual(expect.objectContaining({
      NUXT_SCORE_V2_MODE: 'off',
    }))
  })
})
