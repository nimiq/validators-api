import process from 'node:process'
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
    'radix-vue/nuxt',
  ],

  hub: {
    database: true,
  },

  runtimeConfig: {
    rpcUrl: process.env.NUXT_RPC_URL || '',
    GITHUB_ACTIONS: process.env.GITHUB_ACTIONS || '',
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
  },

  hooks: {
    'build:before': async () => {
      const nimiqNetwork = process.env.NUXT_PUBLIC_NIMIQ_NETWORK as string
      const validNimiqNetworks = ['albatross', 'test-albatross']
      if (!validNimiqNetworks.includes(nimiqNetwork)) {
        throw new Error(`Invalid nimiqNetwork: ${nimiqNetwork}. Please make sure it is one of: ${validNimiqNetworks.join(', ')}`)
      }
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
    '~~/packages/nimiq-validators-score',
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
