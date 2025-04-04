import { presetNimiq } from 'nimiq-css'
import { defineConfig, presetIcons, presetWind3 } from 'unocss'
import { presetOnmax } from 'unocss-preset-onmax'
import { presetScalePx } from 'unocss-preset-scale-px'

export default defineConfig({
  presets: [
    presetWind3({ attributifyPseudo: true }),
    presetOnmax({ presets: { wind4: false } }),
    presetNimiq({
      utilities: true,
      attributifyUtilities: true,
      typography: true,
    }),
    presetScalePx(),
    presetIcons(),
  ],
  rules: [
    [/^view-transition-([\w-]+)$/, ([, name]) => ({ 'view-transition-name': name })],
  ],
})
