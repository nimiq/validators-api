import { presetNimiq } from 'nimiq-css'
import { defineConfig, presetAttributify, presetWind3 } from 'unocss'
import { presetScalePx } from 'unocss-preset-scale-px'

export default defineConfig({
  presets: [
    presetWind3({ attributifyPseudo: true }),
    presetNimiq({
      utilities: true,
      typography: true,
      attributifyUtilities: true,
    }),
    presetScalePx(),
    presetAttributify(),
  ],
  rules: [
    [/^view-transition-([\w-]+)$/, ([, name]) => ({ 'view-transition-name': name })],
  ],
})
