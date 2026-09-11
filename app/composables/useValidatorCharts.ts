import type { Activity, Score } from '~~/server/utils/drizzle'

interface ValidatorData {
  scores: Score[]
  activity: Activity[]
  score?: Score
  fee: number | null
  payoutType: string | null
}

interface EpochData {
  epoch: number
}

export function createEpochFormatter(data: readonly EpochData[]) {
  return (index: number) => {
    const roundedIndex = Math.round(index)
    if (Math.abs(index - roundedIndex) > 0.01)
      return ''

    const epoch = data[roundedIndex]?.epoch
    return epoch === undefined ? '' : `E${epoch}`
  }
}

export function ensureDrawableLineData<T>(data: readonly T[]): T[] {
  return data.length === 1 ? [data[0]!, { ...data[0]! }] : [...data]
}

export function createPaddedDomain<T extends Record<string, number>>(data: readonly T[], key: keyof T): [number, number] | undefined {
  const values = data.map(row => row[key]).filter(Number.isFinite)
  if (values.length === 0)
    return

  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min !== max)
    return [min, max]

  const padding = Math.max(Math.abs(min) * 0.005, 1)
  return [min - padding, max + padding]
}

export function useValidatorCharts(validator: Ref<ValidatorData | null>) {
  const scoreTrendData = computed(() => {
    if (!validator.value?.scores)
      return []
    return ensureDrawableLineData(validator.value.scores.map(s => ({ epoch: s.epochNumber, total: s.total })))
  })

  const scoreTrendAllData = computed(() => {
    if (!validator.value?.scores)
      return []
    return ensureDrawableLineData(validator.value.scores.map(s => ({
      epoch: s.epochNumber,
      total: s.total,
      availability: s.availability,
      dominance: s.dominance,
      reliability: s.reliability,
    })))
  })

  const balanceData = computed(() => {
    if (!validator.value?.activity)
      return []
    return validator.value.activity.map(a => ({ epoch: a.epochNumber, balance: a.balance / 1e5 }))
  })

  const stakersData = computed(() => {
    if (!validator.value?.activity)
      return []
    return validator.value.activity.map(a => ({ epoch: a.epochNumber, stakers: a.stakers }))
  })

  const activityData = computed(() => {
    if (!validator.value?.activity)
      return []
    return validator.value.activity.map(a => ({ epoch: a.epochNumber, rewarded: a.rewarded, missed: a.missed }))
  })

  const scoreTrendXFormatter = computed(() => createEpochFormatter(scoreTrendData.value))
  const scoreTrendAllXFormatter = computed(() => createEpochFormatter(scoreTrendAllData.value))
  const balanceXFormatter = computed(() => createEpochFormatter(balanceData.value))
  const balanceYDomain = computed(() => createPaddedDomain(balanceData.value, 'balance'))
  const stakersXFormatter = computed(() => createEpochFormatter(stakersData.value))
  const stakersYDomain = computed(() => createPaddedDomain(stakersData.value, 'stakers'))
  const activityXFormatter = computed(() => createEpochFormatter(activityData.value))

  const activityStats = computed(() => {
    if (!validator.value?.activity?.length)
      return { rewarded: 0, missed: 0, missRate: 0 }
    const totals = validator.value.activity.reduce((acc, a) => {
      if (a.rewarded >= 0)
        acc.rewarded += a.rewarded
      if (a.missed >= 0)
        acc.missed += a.missed
      return acc
    }, { rewarded: 0, missed: 0 })
    const total = totals.rewarded + totals.missed
    return { ...totals, missRate: total > 0 ? totals.missed / total : 0 }
  })

  const feeDisplay = computed(() => {
    if (!validator.value || validator.value.fee === null || validator.value.fee < 0)
      return 'N/A'
    return percentageFormatter.format(validator.value.fee)
  })

  const payoutDisplay = computed(() => {
    if (!validator.value)
      return 'N/A'
    const map: Record<string, string> = { restake: 'Restake', direct: 'Direct', none: 'None' }
    return map[validator.value.payoutType ?? ''] || validator.value.payoutType || 'N/A'
  })

  const currentBalance = computed(() => {
    if (!validator.value?.activity?.length)
      return 0
    return validator.value.activity.at(-1)!.balance / 1e5
  })

  const currentStakers = computed(() => {
    if (!validator.value?.activity?.length)
      return 0
    return validator.value.activity.at(-1)!.stakers
  })

  // Donut data for sub-scores
  const donutScoreData = computed(() => {
    if (!validator.value?.score)
      return [0, 0, 0]
    return [validator.value.score.availability, validator.value.score.dominance, validator.value.score.reliability]
  })

  return {
    scoreTrendData,
    scoreTrendAllData,
    balanceData,
    balanceXFormatter,
    balanceYDomain,
    stakersData,
    stakersXFormatter,
    stakersYDomain,
    activityData,
    activityXFormatter,
    activityStats,
    feeDisplay,
    payoutDisplay,
    scoreTrendXFormatter,
    scoreTrendAllXFormatter,
    currentBalance,
    currentStakers,
    donutScoreData,
  }
}
