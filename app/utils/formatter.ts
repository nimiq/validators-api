export const nimFormatter = new Intl.NumberFormat('en', {
  notation: 'compact',
  compactDisplay: 'short',
  maximumFractionDigits: 1,
})

export const percentageFormatter = new Intl.NumberFormat('en', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const decimalsFormatter = new Intl.NumberFormat('en', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
  useGrouping: false,
})
