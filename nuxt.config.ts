import { execSync } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { consola } from 'consola'
import topLevelAwait from 'vite-plugin-top-level-await'
import wasm from 'vite-plugin-wasm'
import { z } from 'zod'
import { description, name, version } from './package.json'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: ['@vueuse/nuxt', '@unocss/nuxt', '@nuxtjs/color-mode', '@nuxt/eslint', '@nuxthub/core', '@nuxt/image', '@nuxt/fonts', 'reka-ui/nuxt', 'nuxt-safe-runtime-config', 'nuxt-charts'],

  hub: {
    db: 'sqlite',
    blob: true,
    cache: true,
  },

  runtimeConfig: {
    albatrossRpcNodeUrl: process.env.ALBATROSS_RPC_NODE_URL || '',
    slackWebhookUrl: process.env.NUXT_SLACK_WEBHOOK_URL || '',
    public: {
      gitBranch: execSync('git branch --show-current', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(),
      nimiqNetwork: process.env.NUXT_PUBLIC_NIMIQ_NETWORK || '',
    },
  },

  safeRuntimeConfig: {
    $schema: z.object({
      albatrossRpcNodeUrl: z.string().describe('Albatross RPC Node URL is required'),
      slackWebhookUrl: z.string().describe('Slack webhook URL must be a valid string'),
      public: z.object({
        gitBranch: z.string().describe('Git branch is required'),
        nimiqNetwork: z.string().describe('Nimiq network is required').refine(value => !value || ['main-albatross', 'test-albatross'].includes(value), {
          message: 'Nimiq network must be one of: main-albatross, test-albatross',
        }),
      }),
    }),
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
        // Add alias for data files
        'css-tree': 'css-tree/dist/csstree.esm.js',
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
      const gitBranch = execSync('git branch --show-current', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
      const nimiqNetwork = nuxt.options.runtimeConfig.public.nimiqNetwork

      nuxt.options.runtimeConfig.public.gitBranch = gitBranch

      consola.info(`Nimiq network: \`${nimiqNetwork}\``)
      consola.info(`Git branch: \`${gitBranch}\``)
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
  fonts: {
    families: [
      { name: 'Mulish', weights: [400, 600, 700] },
      { name: 'Fira Code', weights: [400] },
    ],
  },

  nitro: {
    preset: 'cloudflare_module',
    experimental: {
      openAPI: true,
      tasks: true,
    },
    scheduledTasks: {
      // 12-hour sync: wrapper task records run + executes sync tasks
      '0 */12 * * *': ['cron:sync'],
    },
    openAPI: {
      meta: { title: name, description, version },
      production: 'runtime',
    },

    externals: {
      external: ['ws', '@unovis/ts', '@unovis/vue', 'vue-chrts', 'elkjs'],
    },
  },

  compatibilityDate: '2025-03-21',
})
