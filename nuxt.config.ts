import { execSync } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { consola } from 'consola'
import { updateRuntimeConfig } from 'nuxt/kit'
import topLevelAwait from 'vite-plugin-top-level-await'
import wasm from 'vite-plugin-wasm'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },

  modules: [
    '@vueuse/nuxt',
    '@pinia/nuxt',
    '@unocss/nuxt',
    '@nuxtjs/color-mode',
    '@nuxt/eslint',
    '@nuxthub/core',
    '@nuxt/image',
  ],

  hub: {
    database: true,
    blob: true,
    cache: true,
  },

  runtimeConfig: {
    rpcUrl: process.env.NUXT_RPC_URL || '',
    gitBranch: '', // Modify at before:build
    public: {
      nimiqNetwork: process.env.NUXT_PUBLIC_NIMIQ_NETWORK || '',
    },
  },

  imports: {
    dirs: ['./server/utils'],
  },

  experimental: {
    // when using generate, payload js assets included in sw precache manifest
    // but missing on offline, disabling extraction it until fixed
    payloadExtraction: false,
    renderJsonPayloads: true,
    typedPages: true,
    viewTransition: true,
  },

  routeRules: {
    '/api/**': { cors: true },
  },

  vite: {
    plugins: [
      wasm(),
      topLevelAwait(),
    ],
    optimizeDeps: {
      exclude: ['@nimiq/core'],
    },
    resolve: {
      alias: {
        'nimiq-validator-trustscore': './packages/nimiq-validator-trustscore/src/index.ts',
      },
    },
  },

  hooks: {
    'build:before': async () => {
      const nimiqNetwork = process.env.NUXT_PUBLIC_NIMIQ_NETWORK as string
      const validNimiqNetworks = ['main-albatross', 'test-albatross']
      if (!validNimiqNetworks.includes(nimiqNetwork)) {
        consola.warn(`Invalid nimiqNetwork: ${nimiqNetwork}. Please make sure it is one of: ${validNimiqNetworks.join(', ')}`)
      }

      const branch = execSync('git branch --show-current', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
      updateRuntimeConfig({ gitBranch: branch })
    },
  },

  nitro: {
    esbuild: {
      options: {
        target: 'esnext',
      },
    },

    experimental: {
      tasks: true,
      openAPI: true,
    },
  },

  alias: {
    'nimiq-validator-trustscore/*': `${fileURLToPath(new URL('./packages/nimiq-validator-trustscore/src/', import.meta.url))}/*`,
  },

  app: {
    head: {
      htmlAttrs: {
        lang: 'en',
      },
      viewport: 'width=device-width,initial-scale=1',
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      ],
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Your Nimiq-Nuxt Template' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'theme-color', media: '(prefers-color-scheme: light)', content: 'white' },
        { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#1f2348' },
      ],
    },
  },

  watch: [
    '~~/packages/nimiq-validator-trustscore',
  ],

  features: {
    // For UnoCSS
    inlineStyles: false,
  },

  eslint: {
    config: {
      standalone: false,
    },
  },

  colorMode: {
    classSuffix: '',
  },

  compatibilityDate: '2024-08-15',
  future: {
    compatibilityVersion: 4,
  },
})
