import { execSync } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { consola } from 'consola'
import topLevelAwait from 'vite-plugin-top-level-await'
import wasm from 'vite-plugin-wasm'
import { description, name, version } from './package.json'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },

  modules: ['@vueuse/nuxt', '@unocss/nuxt', '@nuxtjs/color-mode', '@nuxt/eslint', '@nuxthub/core', '@nuxt/image', 'reka-ui/nuxt', 'nuxt-time'],

  hub: {
    database: true,
    blob: true,
    cache: true,
  },

  runtimeConfig: {
    rpcUrl: process.env.NUXT_RPC_URL || '',
    public: {
      gitBranch: 'dev', // Modified in the build hook
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

  components: [
    { path: '~/components/[UI]', pathPrefix: false },
    '~/components',
  ],

  hooks: {
    'build:before': async () => {
    },
    'ready': (nuxt) => {
      // 1. Modify runtimeConfig
      const gitBranch = execSync('git branch --show-current', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
      nuxt.options.runtimeConfig.public.gitBranch = gitBranch

      // 2. Log runtimeConfig
      const nimiqNetwork = nuxt.options.runtimeConfig.public.nimiqNetwork
      const validNimiqNetworks = ['main-albatross', 'test-albatross']
      if (!validNimiqNetworks.includes(nimiqNetwork)) {
        consola.warn(`Invalid nimiqNetwork: ${nimiqNetwork}. Please make sure it is one of: ${validNimiqNetworks.join(', ')}`)
      }
      consola.info(`Nimiq network: \`${nimiqNetwork}\``)

      consola.info(`Git branch: \`${gitBranch}\``)

      const { projectUrl, env } = nuxt.options.runtimeConfig.hub
      consola.info(`Remote NuxtHub: \`${projectUrl || 'local'}@${env}\``)
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

  nitro: {
    preset: 'cloudflare_module',
    experimental: {
      openAPI: true,
    },
    openAPI: {
      meta: { title: name, description, version },
      production: 'runtime',
    },
  },

  compatibilityDate: '2025-03-21',
  future: {
    compatibilityVersion: 4,
  },
})
