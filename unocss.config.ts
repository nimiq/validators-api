import { presetRemToPx } from '@unocss/preset-rem-to-px'
import { presetNimiq } from 'nimiq-css'
import { defineConfig, presetAttributify, presetUno } from 'unocss'

export default defineConfig({
  presets: [
    presetUno({ attributifyPseudo: true }),
    presetNimiq({
      utilities: true,
      typography: true,
      attributifyUtilities: true,
    }),
    presetRemToPx({ baseFontSize: 4 }),
    presetAttributify(),
  ],
  rules: [
    [/^view-transition-([\w-]+)$/, ([, name]: [string, string]) => ({ 'view-transition-name': name })],
  ],
})
