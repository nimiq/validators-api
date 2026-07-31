import type {
  Range,
  Result,
  ResultSync,
  ScoreParams,
  ScoreV2Epoch,
} from 'nimiq-validator-trustscore/types'
import type { NewScore, ScoreVersion, Score as StoredScore } from './drizzle'
import { and, desc, eq, gte, isNull, lt, lte, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import {
  classifyValidatorEpoch,
  ValidatorEpochStatus,
} from 'nimiq-validator-trustscore/epoch-status'
import { getRange } from 'nimiq-validator-trustscore/range'
import { computeScore, getDominance } from 'nimiq-validator-trustscore/score'
import {
  computeScoreV2,
  getRecentAvailabilityV2,
} from 'nimiq-validator-trustscore/score-v2'
import { activity } from '../db/schema'
import {
  calculateActivityCoverage,
  getRecentEpochRange,
} from './activity-epochs'
import { inferMissingNonElections } from './non-election-inference'
import { isScoreLagMissing } from './score-freshness'
import { getStoredValidatorsId } from './validators'

const SCORE_UPSERT_CHUNK_SIZE = 5
const SCORE_V2_BACKFILL_LIMIT = 2

interface ScoreCounts {
  v1: number
  v2: number
}

interface CalculateScoreResult {
  range: Range
  scores: ({ params: ScoreParams } & Score)[]
  dataStatus: 'complete' | 'stale'
  missingEpochs: number[]
  scoreCounts: ScoreCounts
  recentCoverage: number
  longTermCoverage: number
  backfilledEpochs: number[]
}

export interface ScoreSyncOptions {
  onProgress?: (message: string) => void
}

interface ScoreActivityRow {
  validatorId: number
  epoch: number
  likelihood: number
  missed: number
  rewarded: number
  dominanceViaSlots: number
  dominanceViaBalance: number
  balance: number
  stakers: number
}

export type ScoreV2Mode = 'off' | 'shadow' | 'active'

interface ScoreRollout {
  writeV1: true
  writeV2: boolean
  activeVersion: 1 | 2
}

type ScoreV2ActivityRow = ScoreActivityRow

interface BuildScoreV2EpochsParams {
  validatorId: number
  range: Pick<Range, 'fromEpoch' | 'toEpoch'>
  activities: readonly ScoreV2ActivityRow[]
}

interface LongTermPair {
  longTermAvailability: number
  reliability: number
}

interface PriorLongTermState extends LongTermPair {
  longTermAsOfEpoch: number
}

interface ResolveLongTermStateParams {
  coverage: number
  targetEpoch: number
  computed?: LongTermPair
  prior?: PriorLongTermState
}

interface ResolvedLongTermState extends PriorLongTermState {
  longTermCoverage: number
}

export function parseScoreV2Mode(value: string | undefined): ScoreV2Mode {
  if (value === undefined)
    return 'off'
  if (value === 'off' || value === 'shadow' || value === 'active')
    return value
  throw new Error(`Invalid score v2 mode: ${value}`)
}

export function getScoreRollout(mode: ScoreV2Mode): ScoreRollout {
  switch (mode) {
    case 'off':
      return { writeV1: true, writeV2: false, activeVersion: 1 }
    case 'shadow':
      return { writeV1: true, writeV2: true, activeVersion: 1 }
    case 'active':
      return { writeV1: true, writeV2: true, activeVersion: 2 }
    default:
      throw new Error(`Invalid score v2 mode: ${String(mode)}`)
  }
}

export function buildScoreV2Epochs(
  params: BuildScoreV2EpochsParams,
): ResultSync<ScoreV2Epoch[]> {
  const { validatorId, range, activities } = params
  if (!Number.isInteger(validatorId) || validatorId < 1)
    return [false, `Invalid validator id: ${validatorId}`, undefined]
  if (
    !Number.isInteger(range.fromEpoch)
    || !Number.isInteger(range.toEpoch)
    || range.fromEpoch < 0
    || range.toEpoch < range.fromEpoch
  ) {
    return [false, `Invalid score v2 range: ${JSON.stringify(range)}`, undefined]
  }

  const activityByEpoch = new Map<number, ScoreV2ActivityRow>()
  for (const row of activities) {
    if (row.validatorId !== validatorId)
      continue
    if (!Number.isInteger(row.epoch) || row.epoch < range.fromEpoch || row.epoch > range.toEpoch)
      return [false, `Validator activity epoch ${row.epoch} is outside the finalized range`, undefined]
    if (activityByEpoch.has(row.epoch))
      return [false, `Duplicate validator activity for epoch ${row.epoch}`, undefined]
    activityByEpoch.set(row.epoch, row)
  }

  const epochs: ScoreV2Epoch[] = []
  const inferredNonElections = inferMissingNonElections({
    fromEpoch: range.fromEpoch,
    toEpoch: range.toEpoch,
    activities: activities.map(row => ({
      epochNumber: row.epoch,
      dominanceRatioViaBalance: row.dominanceViaBalance,
      dominanceRatioViaSlots: row.dominanceViaSlots,
    })),
  })
  for (let epochNumber = range.toEpoch; epochNumber >= range.fromEpoch; epochNumber--) {
    const row = activityByEpoch.get(epochNumber)
    if (!row) {
      epochs.push({
        epochNumber,
        status: inferredNonElections.get(epochNumber)?.status
          ?? ValidatorEpochStatus.NotElectedRandomness,
        rewarded: -1,
        missed: -1,
      })
      continue
    }

    const { status } = classifyValidatorEpoch({
      likelihood: row.likelihood,
      dominanceRatioViaSlots: row.dominanceViaSlots,
      balance: row.balance,
      stakers: row.stakers,
      rewarded: row.rewarded,
      missed: row.missed,
    })
    if (status === ValidatorEpochStatus.UnknownPlaceholder) {
      return [
        false,
        `Activity integrity error: placeholder in finalized epoch ${epochNumber}`,
        undefined,
      ]
    }

    epochs.push({
      epochNumber,
      status,
      rewarded: row.rewarded,
      missed: row.missed,
    })
  }

  return [true, undefined, epochs]
}

export function resolveLongTermState(
  params: ResolveLongTermStateParams,
): ResolvedLongTermState | null {
  const { coverage, targetEpoch, computed, prior } = params
  if (!isUnitValue(coverage))
    throw new Error(`Invalid long-term coverage: ${coverage}`)
  if (!Number.isInteger(targetEpoch) || targetEpoch < 0)
    throw new Error(`Invalid target score epoch: ${targetEpoch}`)

  if (coverage === 1) {
    if (!computed)
      return null
    validateLongTermPair(computed)
    return {
      ...computed,
      longTermCoverage: coverage,
      longTermAsOfEpoch: targetEpoch,
    }
  }

  if (!prior)
    return null
  validateLongTermPair(prior)
  if (!Number.isInteger(prior.longTermAsOfEpoch) || prior.longTermAsOfEpoch < 0)
    throw new Error(`Invalid long-term as-of epoch: ${prior.longTermAsOfEpoch}`)
  if (prior.longTermAsOfEpoch > targetEpoch)
    return null

  return {
    ...prior,
    longTermCoverage: coverage,
  }
}

export function planV2Backfill(
  v1Epochs: readonly number[],
  v2Epochs: readonly number[],
  limit: number,
): number[] {
  if (!Number.isInteger(limit) || limit <= 0)
    throw new Error(`Invalid v2 backfill limit: ${limit}`)

  for (const epoch of [...v1Epochs, ...v2Epochs]) {
    if (!Number.isInteger(epoch) || epoch < 0)
      throw new Error(`Invalid score epoch: ${epoch}`)
  }

  const existingV2 = new Set(v2Epochs)
  return [...new Set(v1Epochs)]
    .filter(epoch => !existingV2.has(epoch))
    .sort((a, b) => b - a)
    .slice(0, limit)
}

function isUnitValue(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1
}

function validateLongTermPair(pair: LongTermPair): void {
  if (!isUnitValue(pair.longTermAvailability))
    throw new Error(`Invalid long-term availability: ${pair.longTermAvailability}`)
  if (!isUnitValue(pair.reliability))
    throw new Error(`Invalid retained reliability: ${pair.reliability}`)
}

function getLatestDominanceRatio(activities: readonly ScoreActivityRow[]): number {
  let dominanceRatio = 0
  let latestDominanceEpoch = Number.NEGATIVE_INFINITY

  for (const row of activities) {
    if (row.epoch <= latestDominanceEpoch || (row.dominanceViaBalance < 0 && row.dominanceViaSlots < 0))
      continue
    dominanceRatio = row.dominanceViaBalance >= 0
      ? row.dominanceViaBalance
      : row.dominanceViaSlots
    latestDominanceEpoch = row.epoch
  }

  return dominanceRatio
}

function calculateScore(
  range: Range,
  validatorId: number,
  activities: readonly ScoreActivityRow[],
): ResultSync<CalculateScoreResult['scores'][number]> {
  const epochData = new Map<number, { rewarded: number, missed: number }>()

  for (const row of activities)
    epochData.set(row.epoch, { missed: row.missed, rewarded: row.rewarded })

  const inherentsPerEpoch = new Map<number, { rewarded: number, missed: number }>()
  const activeEpochStates: (0 | 1)[] = []
  for (let epoch = range.fromEpoch; epoch <= range.toEpoch; epoch++) {
    const data = epochData.get(epoch) || { missed: -1, rewarded: -1 }
    inherentsPerEpoch.set(epoch, data)
    activeEpochStates.push(data.missed === 0 && data.rewarded === 0 ? 0 : 1)
  }

  const params: ScoreParams = {
    availability: { activeEpochStates },
    dominance: { dominanceRatio: getLatestDominanceRatio(activities) },
    reliability: { inherentsPerEpoch },
  }
  const [scoreAreOk, errorScore, scoreValues] = computeScore(params)
  if (!scoreAreOk)
    return [false, errorScore, undefined]

  const score: Score = {
    ...scoreValues,
    validatorId,
    epochNumber: range.toEpoch,
    scoreVersion: 1,
    recentAvailability: null,
    longTermAvailability: null,
    dataStatus: 'complete',
    longTermCoverage: null,
    longTermAsOfEpoch: null,
  }
  return [true, undefined, { ...score, params }]
}

async function getFinalizedEpochNumbers(
  range: Pick<Range, 'fromEpoch' | 'toEpoch'>,
): Promise<number[]> {
  return useDrizzle()
    .select({ epochNumber: tables.activityEpochs.epochNumber })
    .from(tables.activityEpochs)
    .where(and(
      eq(tables.activityEpochs.status, 'finalized'),
      gte(tables.activityEpochs.epochNumber, range.fromEpoch),
      lte(tables.activityEpochs.epochNumber, range.toEpoch),
    ))
    .execute()
    .then(markers => markers.map(marker => marker.epochNumber))
}

async function getScoreActivityRows(
  range: Pick<Range, 'fromEpoch' | 'toEpoch'>,
): Promise<ScoreActivityRow[]> {
  return useDrizzle()
    .select({
      validatorId: activity.validatorId,
      epoch: activity.epochNumber,
      likelihood: activity.likelihood,
      missed: activity.missed,
      rewarded: activity.rewarded,
      dominanceViaSlots: activity.dominanceRatioViaSlots,
      dominanceViaBalance: activity.dominanceRatioViaBalance,
      balance: activity.balance,
      stakers: activity.stakers,
    })
    .from(activity)
    .where(and(
      gte(activity.epochNumber, range.fromEpoch),
      lte(activity.epochNumber, range.toEpoch),
    ))
    .execute()
}

function groupActivityByValidator(
  activities: readonly ScoreActivityRow[],
): Map<number, ScoreActivityRow[]> {
  const activityByValidatorId = new Map<number, ScoreActivityRow[]>()
  for (const row of activities) {
    const validatorActivity = activityByValidatorId.get(row.validatorId) || []
    validatorActivity.push(row)
    activityByValidatorId.set(row.validatorId, validatorActivity)
  }
  return activityByValidatorId
}

function findFinalizedPlaceholder(
  activities: readonly ScoreActivityRow[],
  finalizedEpochs: ReadonlySet<number>,
): string | undefined {
  for (const row of activities) {
    if (!finalizedEpochs.has(row.epoch))
      continue
    const { status } = classifyValidatorEpoch({
      likelihood: row.likelihood,
      dominanceRatioViaSlots: row.dominanceViaSlots,
      balance: row.balance,
      stakers: row.stakers,
      rewarded: row.rewarded,
      missed: row.missed,
    })
    if (status === ValidatorEpochStatus.UnknownPlaceholder)
      return `Activity integrity error: placeholder in finalized epoch ${row.epoch}`
  }
}

async function getPriorLongTermStates(
  targetEpoch: number,
): Promise<Map<number, PriorLongTermState>> {
  const priorRows = await useDrizzle()
    .select({
      validatorId: tables.scores.validatorId,
      epochNumber: tables.scores.epochNumber,
      longTermAvailability: tables.scores.longTermAvailability,
      reliability: tables.scores.reliability,
      longTermAsOfEpoch: tables.scores.longTermAsOfEpoch,
    })
    .from(tables.scores)
    .where(and(
      eq(tables.scores.scoreVersion, 2),
      lte(tables.scores.epochNumber, targetEpoch),
    ))
    .orderBy(desc(tables.scores.epochNumber))
    .execute()

  const priorByValidatorId = new Map<number, PriorLongTermState>()
  for (const row of priorRows) {
    if (
      priorByValidatorId.has(row.validatorId)
      || row.longTermAvailability === null
      || row.longTermAsOfEpoch === null
      || row.longTermAsOfEpoch > targetEpoch
    ) {
      continue
    }
    priorByValidatorId.set(row.validatorId, {
      longTermAvailability: row.longTermAvailability,
      reliability: row.reliability,
      longTermAsOfEpoch: row.longTermAsOfEpoch,
    })
  }
  return priorByValidatorId
}

interface CalculateV2ScoresParams {
  targetEpoch: number
  recentRange: Pick<Range, 'fromEpoch' | 'toEpoch'>
  longTermRange: Pick<Range, 'fromEpoch' | 'toEpoch'>
  longTermCoverage: number
  validatorIds: readonly number[]
  activities: readonly ScoreActivityRow[]
}

async function calculateV2Scores(
  params: CalculateV2ScoresParams,
): Promise<ResultSync<Score[]>> {
  const {
    targetEpoch,
    recentRange,
    longTermRange,
    longTermCoverage,
    validatorIds,
    activities,
  } = params
  const activityByValidatorId = groupActivityByValidator(activities)
  const priorByValidatorId = longTermCoverage < 1
    ? await getPriorLongTermStates(targetEpoch)
    : new Map<number, PriorLongTermState>()
  const scores: Score[] = []

  for (const validatorId of validatorIds) {
    const validatorActivity = activityByValidatorId.get(validatorId) || []
    const recentActivity = validatorActivity.filter(
      row => row.epoch >= recentRange.fromEpoch && row.epoch <= recentRange.toEpoch,
    )
    const [recentEpochsSuccess, recentEpochsError, recentEpochs] = buildScoreV2Epochs({
      validatorId,
      range: recentRange,
      activities: recentActivity,
    })
    if (!recentEpochsSuccess)
      return [false, recentEpochsError, undefined]

    if (recentEpochs.every(epoch => epoch.status === ValidatorEpochStatus.NotElectedRandomness))
      continue

    const dominanceRatio = getLatestDominanceRatio(validatorActivity)
    if (longTermCoverage === 1) {
      const longTermActivity = validatorActivity.filter(
        row => row.epoch >= longTermRange.fromEpoch && row.epoch <= longTermRange.toEpoch,
      )
      const [longTermEpochsSuccess, longTermEpochsError, longTermEpochs] = buildScoreV2Epochs({
        validatorId,
        range: longTermRange,
        activities: longTermActivity,
      })
      if (!longTermEpochsSuccess)
        return [false, longTermEpochsError, undefined]

      const [scoreSuccess, scoreError, score] = computeScoreV2({
        dominance: { dominanceRatio },
        recentEpochs,
        longTermEpochs,
      })
      if (!scoreSuccess)
        return [false, scoreError, undefined]

      scores.push({
        ...score,
        validatorId,
        epochNumber: targetEpoch,
        scoreVersion: 2,
        dataStatus: 'complete',
        longTermCoverage,
        longTermAsOfEpoch: targetEpoch,
      })
      continue
    }

    let longTermState: ResolvedLongTermState | null
    try {
      longTermState = resolveLongTermState({
        coverage: longTermCoverage,
        targetEpoch,
        prior: priorByValidatorId.get(validatorId),
      })
    }
    catch (error) {
      return [false, `Invalid retained long-term state: ${String(error)}`, undefined]
    }
    if (!longTermState)
      continue

    const [recentSuccess, recentError, recentAvailability] = getRecentAvailabilityV2(recentEpochs)
    if (!recentSuccess)
      return [false, recentError, undefined]
    const [dominanceSuccess, dominanceError, dominance] = getDominance({ dominanceRatio })
    if (!dominanceSuccess)
      return [false, dominanceError, undefined]

    const availability = 0.5 * longTermState.longTermAvailability + 0.5 * recentAvailability
    const total = dominance * availability * longTermState.reliability
    if (![dominance, availability, total].every(isUnitValue))
      return [false, `Invalid retained score v2 output for validator ${validatorId}`, undefined]

    scores.push({
      validatorId,
      epochNumber: targetEpoch,
      scoreVersion: 2,
      dominance,
      recentAvailability,
      longTermAvailability: longTermState.longTermAvailability,
      availability,
      reliability: longTermState.reliability,
      total,
      dataStatus: 'complete',
      longTermCoverage: longTermState.longTermCoverage,
      longTermAsOfEpoch: longTermState.longTermAsOfEpoch,
    })
  }

  return [true, undefined, scores]
}

function createHistoricalRange(range: Range, targetEpoch: number): Range {
  const fromEpoch = Math.max(1, targetEpoch - range.epochCount + 1)
  return {
    ...range,
    headEpoch: targetEpoch + 1,
    epochCount: targetEpoch - fromEpoch + 1,
    fromEpoch,
    toEpoch: targetEpoch,
    snapshotEpoch: targetEpoch + 1,
  }
}

async function prepareV2Backfill(
  range: Range,
  options: ScoreSyncOptions,
): Promise<ResultSync<{ epochs: number[], scores: Score[] }>> {
  const v2Scores = alias(tables.scores, 'v2_scores')
  options.onProgress?.('checking v2 backfill candidates')
  const candidates = await useDrizzle()
    .selectDistinct({ epochNumber: tables.scores.epochNumber })
    .from(tables.scores)
    .leftJoin(v2Scores, and(
      eq(v2Scores.validatorId, tables.scores.validatorId),
      eq(v2Scores.epochNumber, tables.scores.epochNumber),
      eq(v2Scores.scoreVersion, 2),
    ))
    .where(and(
      eq(tables.scores.scoreVersion, 1),
      lt(tables.scores.epochNumber, range.toEpoch),
      isNull(v2Scores.validatorId),
    ))
    .orderBy(desc(tables.scores.epochNumber))
    .limit(SCORE_V2_BACKFILL_LIMIT)
    .execute()
  options.onProgress?.(`backfill found ${candidates.length} candidate epoch(s)`)
  const backfilledEpochs: number[] = []
  const backfillScores: Score[] = []

  for (const [index, { epochNumber: targetEpoch }] of candidates.entries()) {
    const progress = `backfill epoch ${targetEpoch} (${index + 1}/${candidates.length})`
    options.onProgress?.(`${progress}: checking coverage`)
    const historicalRange = createHistoricalRange(range, targetEpoch)
    const recentRange = getRecentEpochRange(historicalRange)
    const finalizedEpochs = await getFinalizedEpochNumbers(historicalRange)
    const recentCoverage = calculateActivityCoverage(
      recentRange.fromEpoch,
      recentRange.toEpoch,
      finalizedEpochs,
    )
    if (recentCoverage.coverage !== 1)
      continue

    const longTermCoverage = calculateActivityCoverage(
      historicalRange.fromEpoch,
      historicalRange.toEpoch,
      finalizedEpochs,
    )
    const missingValidatorRows = await useDrizzle()
      .select({ validatorId: tables.scores.validatorId })
      .from(tables.scores)
      .leftJoin(v2Scores, and(
        eq(v2Scores.validatorId, tables.scores.validatorId),
        eq(v2Scores.epochNumber, tables.scores.epochNumber),
        eq(v2Scores.scoreVersion, 2),
      ))
      .where(and(
        eq(tables.scores.scoreVersion, 1),
        eq(tables.scores.epochNumber, targetEpoch),
        isNull(v2Scores.validatorId),
      ))
      .execute()
    const validatorIds = [...new Set(missingValidatorRows.map(row => row.validatorId))]
    if (validatorIds.length === 0)
      continue

    options.onProgress?.(`${progress}: loading activity`)
    const activities = await getScoreActivityRows(historicalRange)
    const finalizedEpochSet = new Set(finalizedEpochs)
    const finalizedActivities = activities.filter(row => finalizedEpochSet.has(row.epoch))
    const placeholderError = findFinalizedPlaceholder(finalizedActivities, finalizedEpochSet)
    if (placeholderError)
      return [false, placeholderError, undefined]
    options.onProgress?.(`${progress}: calculating ${validatorIds.length} validator(s)`)
    const [success, error, scores] = await calculateV2Scores({
      targetEpoch,
      recentRange,
      longTermRange: historicalRange,
      longTermCoverage: longTermCoverage.coverage,
      validatorIds,
      activities: finalizedActivities,
    })
    if (!success)
      return [false, error, undefined]
    if (scores.length === 0)
      continue

    options.onProgress?.(`${progress}: prepared ${scores.length} score(s)`)
    backfilledEpochs.push(targetEpoch)
    backfillScores.push(...scores)
  }

  return [true, undefined, {
    epochs: backfilledEpochs,
    scores: backfillScores,
  }]
}

async function upsertScoreRows(
  scores: readonly (Score | CalculateScoreResult['scores'][number])[],
  label: string,
  options: ScoreSyncOptions,
): Promise<void> {
  options.onProgress?.(`writing ${label}: ${scores.length} score(s)`)
  for (let i = 0; i < scores.length; i += SCORE_UPSERT_CHUNK_SIZE) {
    const newScores = scores
      .slice(i, i + SCORE_UPSERT_CHUNK_SIZE)
      .map(score => ({ ...score, params: undefined })) as NewScore[]
    await useDrizzle()
      .insert(tables.scores)
      .values(newScores)
      .onConflictDoUpdate({
        target: [
          tables.scores.validatorId,
          tables.scores.epochNumber,
          tables.scores.scoreVersion,
        ],
        set: {
          total: sql`excluded.total`,
          availability: sql`excluded.availability`,
          recentAvailability: sql`excluded.recent_availability`,
          longTermAvailability: sql`excluded.long_term_availability`,
          dominance: sql`excluded.dominance`,
          reliability: sql`excluded.reliability`,
          dataStatus: sql`excluded.data_status`,
          longTermCoverage: sql`excluded.long_term_coverage`,
          longTermAsOfEpoch: sql`excluded.long_term_as_of_epoch`,
        },
      })
      .execute()
    options.onProgress?.(`stored ${label} rows ${i + newScores.length}/${scores.length}`)
  }
}

/**
 * Computes and persists the current score snapshot, preserving v1 for rollback.
 */
export async function upsertScoresSnapshotEpoch(
  options: ScoreSyncOptions = {},
): Result<CalculateScoreResult> {
  const runtimeConfig = useSafeRuntimeConfig() as ReturnType<typeof useSafeRuntimeConfig> & {
    scoreV2Mode?: string
  }
  const publicConfig = runtimeConfig.public as typeof runtimeConfig.public & { scoreV2Mode?: string }
  const scoreV2Mode = parseScoreV2Mode(runtimeConfig.scoreV2Mode ?? publicConfig.scoreV2Mode)
  const rollout = getScoreRollout(scoreV2Mode)
  const { nimiqNetwork: network } = publicConfig
  const [rangeSuccess, errorRange, range] = await getRange({ network })
  if (!rangeSuccess || !range)
    return [false, errorRange || 'No range', undefined]
  options.onProgress?.(`range ${range.fromEpoch}-${range.toEpoch}; v2 mode ${scoreV2Mode}`)

  const recentRange = getRecentEpochRange(range)
  options.onProgress?.('loading finalized activity markers')
  const finalizedEpochs = await getFinalizedEpochNumbers(range)
  const recentCoverage = calculateActivityCoverage(
    recentRange.fromEpoch,
    recentRange.toEpoch,
    finalizedEpochs,
  )
  const longTermCoverage = calculateActivityCoverage(
    range.fromEpoch,
    range.toEpoch,
    finalizedEpochs,
  )
  options.onProgress?.(
    `coverage recent ${(recentCoverage.coverage * 100).toFixed(1)}%; long-term ${(longTermCoverage.coverage * 100).toFixed(1)}%`,
  )
  if (recentCoverage.coverage !== 1) {
    return [true, undefined, {
      range,
      scores: [],
      dataStatus: 'stale',
      missingEpochs: recentCoverage.missingEpochs,
      scoreCounts: { v1: 0, v2: 0 },
      recentCoverage: recentCoverage.coverage,
      longTermCoverage: longTermCoverage.coverage,
      backfilledEpochs: [],
    }]
  }

  options.onProgress?.('loading validators')
  const validatorsId = await getStoredValidatorsId()
  options.onProgress?.(`loaded ${validatorsId.length} validator(s); loading activity`)
  const activityRows = await getScoreActivityRows(range)
  options.onProgress?.(`loaded ${validatorsId.length} validator(s), ${activityRows.length} activity row(s)`)
  const finalizedEpochSet = new Set(finalizedEpochs)
  const finalizedActivityRows = activityRows.filter(row => finalizedEpochSet.has(row.epoch))
  const placeholderError = findFinalizedPlaceholder(finalizedActivityRows, finalizedEpochSet)
  if (placeholderError)
    return [false, placeholderError, undefined]

  const activityByValidatorId = groupActivityByValidator(activityRows)
  options.onProgress?.(`calculating current v1 for ${validatorsId.length} validator(s) at epoch ${range.toEpoch}`)
  const maybeV1Scores = validatorsId.map(validatorId => calculateScore(
    range,
    validatorId,
    activityByValidatorId.get(validatorId) || [],
  ))
  const failedV1Scores = maybeV1Scores.filter(score => !score[0])
  if (failedV1Scores.length > 0)
    return [false, failedV1Scores.map(score => score[1]).join(', '), undefined]
  const v1Scores = maybeV1Scores.map(score => score[2]!)
  await upsertScoreRows(v1Scores, 'current v1', options)

  let v2Scores: Score[] = []
  let backfilledEpochs: number[] = []
  if (rollout.writeV2) {
    options.onProgress?.(`calculating current v2 for ${validatorsId.length} validator(s) at epoch ${range.toEpoch}`)
    const [v2Success, v2Error, calculatedV2Scores] = await calculateV2Scores({
      targetEpoch: range.toEpoch,
      recentRange,
      longTermRange: range,
      longTermCoverage: longTermCoverage.coverage,
      validatorIds: validatorsId,
      activities: finalizedActivityRows,
    })
    if (!v2Success)
      return [false, v2Error, undefined]
    v2Scores = calculatedV2Scores
    await upsertScoreRows(v2Scores, 'current v2', options)

    const [backfillSuccess, backfillError, backfill] = await prepareV2Backfill(range, options)
    if (!backfillSuccess)
      return [false, backfillError, undefined]
    backfilledEpochs = backfill.epochs
    await upsertScoreRows(backfill.scores, 'v2 backfill', options)
  }

  return [true, undefined, {
    scores: v1Scores,
    range,
    dataStatus: 'complete',
    missingEpochs: [],
    scoreCounts: {
      v1: v1Scores.length,
      v2: v2Scores.length,
    },
    recentCoverage: recentCoverage.coverage,
    longTermCoverage: longTermCoverage.coverage,
    backfilledEpochs,
  }]
}

export async function getLatestScoreEpoch(scoreVersion: ScoreVersion = 1): Promise<number | null> {
  const latestScoreEpoch = await useDrizzle()
    .select({
      latestScoreEpoch: sql<number>`max(${tables.scores.epochNumber})`,
    })
    .from(tables.scores)
    .where(eq(tables.scores.scoreVersion, scoreVersion))
    .get()
    .then((res) => {
      const value = res?.latestScoreEpoch
      if (value === null || value === undefined)
        return null
      if (typeof value === 'number')
        return value

      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : null
    })

  return latestScoreEpoch
}

export async function getLatestScoreState(
  scoreVersion: ScoreVersion = 1,
): Promise<Pick<StoredScore, 'epochNumber' | 'dataStatus'> | null> {
  return await useDrizzle()
    .select({
      epochNumber: tables.scores.epochNumber,
      dataStatus: tables.scores.dataStatus,
    })
    .from(tables.scores)
    .where(eq(tables.scores.scoreVersion, scoreVersion))
    .orderBy(desc(tables.scores.epochNumber))
    .limit(1)
    .get() ?? null
}

export async function isScoreMissingWithLag(
  range: Range,
  allowedLagEpochs = 1,
  latestScoreEpoch?: number | null,
): Promise<boolean> {
  const epoch = latestScoreEpoch === undefined ? await getLatestScoreEpoch() : latestScoreEpoch
  return isScoreLagMissing({
    toEpoch: range.toEpoch,
    latestScoreEpoch: epoch,
    allowedLagEpochs,
  })
}
