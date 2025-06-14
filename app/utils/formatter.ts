export const nimFormatter = new Intl.NumberFormat('en', {
  notation: 'compact',
  compactDisplay: 'short',
  maximumFractionDigits: 1,
})

// Formatter for Luna values - converts Luna to NIM for display
export const lunaFormatter = new Intl.NumberFormat('en', {
  notation: 'compact',
  compactDisplay: 'short',
  maximumFractionDigits: 1,
})

// Helper function to convert Luna to NIM
export function formatLunaAsNim(lunaValue: number): string {
  return lunaFormatter.format(lunaValue / 1e5)
}

export const percentageFormatter = new Intl.NumberFormat(locale.value, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const decimalsFormatter = new Intl.NumberFormat(locale.value, {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
  useGrouping: false,
})

export const largeNumberFormatter = new Intl.NumberFormat(locale.value, {
  style: 'decimal',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  notation: 'standard',
  useGrouping: true,
})
