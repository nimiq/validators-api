import { presetNimiq } from 'nimiq-css'
import { defineConfig, presetAttributify, presetUno } from 'unocss'
import { presetRemToPx } from '@unocss/preset-rem-to-px'

export default defineConfig({
  content: {
    pipeline: {
      include: [
        // the default
        /\.(vue|svelte|[jt]sx|mdx?|astro|elm|php|phtml|html)($|\?)/, './content/**.*.md'
      ],
      // exclude files
      // exclude: []
    },
  },
  presets: [
    presetUno({ attributifyPseudo: true }),
    presetNimiq({
      utilities: true,
      typography: true,
    }),
    presetRemToPx({ baseFontSize: 4 }),
    presetAttributify(),
  ],
  rules: [
    [/^view-transition-([\w-]+)$/, ([, name]: [string, string]) => ({ 'view-transition-name': name })],
  ],
})
