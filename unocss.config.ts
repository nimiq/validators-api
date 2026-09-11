import { presetNimiq } from 'nimiq-css'
import { defineConfig, presetIcons } from 'unocss'
import { presetOnmax } from 'unocss-preset-onmax'

export default defineConfig({
  presets: [
    presetOnmax(),
    presetNimiq({
      utilities: true,
      attributifyUtilities: true,
      typography: true,
      fonts: false,
    }),
    presetIcons(),
  ],
  rules: [
    [/^view-transition-([\w-]+)$/, ([, name]) => ({ 'view-transition-name': name })],

    // Grid Column Rules
    // grid-col="span-3" -> grid-column: span 3
    [/^grid-col-span-(\d+)$/, ([, span]) => ({ 'grid-column': `span ${span}` })],
    // grid-col="start-2" -> grid-column-start: 2
    [/^grid-col-start-(\d+)$/, ([, start]) => ({ 'grid-column-start': start })],
    // grid-col="end-5" -> grid-column-end: 5
    [/^grid-col-end-(\d+)$/, ([, end]) => ({ 'grid-column-end': end })],
    // grid-col="2/5" -> grid-column: 2 / 5
    [/^grid-col-(\d+)\/(\d+)$/, ([, start, end]) => ({ 'grid-column': `${start} / ${end}` })],
    // grid-col="2" -> grid-column: 2
    [/^grid-col-(\d+)$/, ([, col]) => ({ 'grid-column': col })],

    // Grid Row Rules
    // grid-row="span-2" -> grid-row: span 2
    [/^grid-row-span-(\d+)$/, ([, span]) => ({ 'grid-row': `span ${span}` })],
    // grid-row="start-1" -> grid-row-start: 1
    [/^grid-row-start-(\d+)$/, ([, start]) => ({ 'grid-row-start': start })],
    // grid-row="end-3" -> grid-row-end: 3
    [/^grid-row-end-(\d+)$/, ([, end]) => ({ 'grid-row-end': end })],
    // grid-row="1/3" -> grid-row: 1 / 3
    [/^grid-row-(\d+)\/(\d+)$/, ([, start, end]) => ({ 'grid-row': `${start} / ${end}` })],
    // grid-row="2" -> grid-row: 2
    [/^grid-row-(\d+)$/, ([, row]) => ({ 'grid-row': row })],

    // Grid Template Columns
    // grid-cols="12" -> grid-template-columns: repeat(12, minmax(0, 1fr))
    [/^grid-cols-(\d+)$/, ([, cols]) => ({ 'grid-template-columns': `repeat(${cols}, minmax(0, 1fr))` })],
    // grid-cols="none" -> grid-template-columns: none
    [/^grid-cols-none$/, () => ({ 'grid-template-columns': 'none' })],

    // Grid Template Rows
    // grid-rows="3" -> grid-template-rows: repeat(3, minmax(0, 1fr))
    [/^grid-rows-(\d+)$/, ([, rows]) => ({ 'grid-template-rows': `repeat(${rows}, minmax(0, 1fr))` })],
    // grid-rows="none" -> grid-template-rows: none
    [/^grid-rows-none$/, () => ({ 'grid-template-rows': 'none' })],

    // Grid Gap
    // gap="4" -> gap: 1rem (assuming 4 = 1rem in your scale)
    [/^grid-gap-(\d+)$/, ([, gap]) => ({ gap: `${Number(gap) * 0.25}rem` })],
    [/^grid-gap-x-(\d+)$/, ([, gap]) => ({ 'column-gap': `${Number(gap) * 0.25}rem` })],
    [/^grid-gap-y-(\d+)$/, ([, gap]) => ({ 'row-gap': `${Number(gap) * 0.25}rem` })],

    // Grid Areas (for named grid areas)
    [/^grid-area-([\w-]+)$/, ([, area]) => ({ 'grid-area': area })],
  ],
  content: {
    filesystem: [
      'app/**/*.{vue,ts,js}',
      // ... other existing patterns
    ],
  },
})
