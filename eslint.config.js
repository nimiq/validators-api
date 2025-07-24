// @ts-check
import antfu from '@antfu/eslint-config'
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  antfu({
    formatters: true,
    pnpm: true,
    ignores: [
      'server/database/migrations/*',
    ],
    rules: {
      // Fix deprecated property in vue/object-property-newline rule
      'vue/object-property-newline': ['error', { allowAllPropertiesOnSameLine: false }],
    },
  }),
)
