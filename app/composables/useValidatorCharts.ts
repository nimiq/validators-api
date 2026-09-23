import type { Activity } from '~~/server/utils/drizzle'
import type { ScoreApiValue } from '~~/server/utils/types'

interface ValidatorData {
  scores: ScoreApiValue[]
  activity: Activity[]
  score: ScoreApiValue
  fee: number | null
  payoutType: string | null
}

interface EpochData {
  epoch: number
}

interface ScoreHistoryRow {
  epochNumber: number | null
  scoreVersion: 1 | 2
}

interface ActivityHistoryRow {
  epochNumber: number | null
  inferred?: boolean
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0
}

export function prepareActivityHistory<
  T extends ActivityHistoryRow,
  K extends keyof T,
>(activity: readonly T[], requiredFields: readonly K[]): T[] {
  return activity
    .filter(row =>
      !row.inferred
      && isFiniteNumber(row.epochNumber)
      && Number.isInteger(row.epochNumber)
      && requiredFields.every(field => isNonNegativeFiniteNumber(row[field])),
    )
    .sort((left, right) => {
      if (!isFiniteNumber(left.epochNumber) || !isFiniteNumber(right.epochNumber))
        return 0
      return left.epochNumber - right.epochNumber
    })
}

export function prepareScoreHistory<
  T extends ScoreHistoryRow,
  K extends keyof T,
>(scores: readonly T[], scoreVersion: 1 | 2, requiredFields: readonly K[]): T[] {
  return scores
    .filter((score) => {
      if (
        score.scoreVersion !== scoreVersion
        || !isFiniteNumber(score.epochNumber)
        || !Number.isInteger(score.epochNumber)
      ) {
        return false
      }

      return requiredFields.every((field) => {
        const value = score[field]
        return isFiniteNumber(value)
      })
    })
    .sort((left, right) => {
      if (!isFiniteNumber(left.epochNumber) || !isFiniteNumber(right.epochNumber))
        return 0
      return left.epochNumber - right.epochNumber
    })
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
  const selectedScoreVersion = computed(() => validator.value?.score.scoreVersion ?? 1)

  const scoreTrendData = computed(() => {
    if (!validator.value?.scores)
      return []
    const scores = prepareScoreHistory(
      validator.value.scores,
      selectedScoreVersion.value,
      ['total'],
    )
    return ensureDrawableLineData(scores.flatMap(score =>
      isFiniteNumber(score.epochNumber) && isFiniteNumber(score.total)
        ? [{ epoch: score.epochNumber, total: score.total }]
        : [],
    ))
  })

  const scoreTrendAllData = computed(() => {
    if (!validator.value?.scores)
      return []
    const scores = prepareScoreHistory(
      validator.value.scores,
      selectedScoreVersion.value,
      ['total', 'availability', 'dominance', 'reliability'],
    )
    return ensureDrawableLineData(scores.flatMap(score =>
      isFiniteNumber(score.epochNumber)
      && isFiniteNumber(score.total)
      && isFiniteNumber(score.availability)
      && isFiniteNumber(score.dominance)
      && isFiniteNumber(score.reliability)
        ? [{
            epoch: score.epochNumber,
            total: score.total,
            availability: score.availability,
            dominance: score.dominance,
            reliability: score.reliability,
          }]
        : [],
    ))
  })

  const balanceData = computed(() => {
    if (!validator.value?.activity)
      return []
    return prepareActivityHistory(validator.value.activity, ['balance'])
      .map(activity => ({ epoch: activity.epochNumber, balance: activity.balance / 1e5 }))
  })

  const stakersData = computed(() => {
    if (!validator.value?.activity)
      return []
    return prepareActivityHistory(validator.value.activity, ['stakers'])
      .map(activity => ({ epoch: activity.epochNumber, stakers: activity.stakers }))
  })

  const activityData = computed(() => {
    if (!validator.value?.activity)
      return []
    return prepareActivityHistory(validator.value.activity, ['rewarded', 'missed'])
      .map(activity => ({
        epoch: activity.epochNumber,
        rewarded: activity.rewarded,
        missed: activity.missed,
      }))
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
    return balanceData.value.at(-1)?.balance ?? 0
  })

  const currentStakers = computed(() => {
    return stakersData.value.at(-1)?.stakers ?? 0
  })

  // Donut data for sub-scores
  const donutScoreData = computed(() => {
    const score = validator.value?.score
    if (
      !score
      || typeof score.availability !== 'number'
      || !Number.isFinite(score.availability)
      || typeof score.dominance !== 'number'
      || !Number.isFinite(score.dominance)
      || typeof score.reliability !== 'number'
      || !Number.isFinite(score.reliability)
    ) {
      return []
    }
    return [score.availability, score.dominance, score.reliability]
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
