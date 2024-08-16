import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

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
    public: {
      nimiqNetwork: process.env.NUXT_PUBLIC_NIMIQ_NETWORK || '',
    }
  },

  experimental: {
    // when using generate, payload js assets included in sw precache manifest
    // but missing on offline, disabling extraction it until fixed
    payloadExtraction: false,
    renderJsonPayloads: true,
    typedPages: true,
    viewTransition: true,
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

  nitro: {
    minify: false,
    esbuild: {
      options: {
        target: 'esnext',
      },
    },
    experimental: {
      tasks: true,
      openAPI: true,
    },

    scheduledTasks: {
      '0 */12 * * *': ['fetch', 'seed', 'score'],
    }
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

  features: {
    // For UnoCSS
    inlineStyles: false,
  },

  // eslint: {
  //   config: {
  //     standalone: false,
  //   },
  // },

  colorMode: {
    classSuffix: '',
  },

  imports: {
    mergeExisting: true,
    presets: ['@vueuse/core'],
  },

  compatibilityDate: '2024-08-15',
  future: {
    compatibilityVersion: 4
  }
})