import type { SQLWrapper } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { ElectedValidator, Range, Result, UnelectedValidator } from 'nimiq-validator-trustscore/types'
import type { ScoreVersion, Validator } from './drizzle'
import type { MainQuerySchema, ValidatorJSON } from './schemas'
import type { FetchedValidator, ScoreApiValue, SnapshotEpochValidators } from './types'
import type { ActivityWithStatus } from './validator-activity-status'
import { consola } from 'consola'
import { and, asc, desc, eq, gte, inArray, lte, or, sql } from 'drizzle-orm'
import { fetchSnapshotEpoch } from '~~/packages/nimiq-validator-trustscore/src/fetcher'
import { resolveLiveActivityMetadata } from './activity-metadata'
import { tables, useDrizzle } from './drizzle'
import { handleValidatorLogo } from './logo'
import { defaultValidatorJSON } from './schemas'
import { selectScoreHistory, toScoreApiValue } from './score-api'
import { buildValidatorActivityTimeline, withValidatorEpochStatus } from './validator-activity-status'
import { getUnlistedActiveValidatorAddresses, isKnownValidatorProfile } from './validator-listing'

export const getStoredValidatorsId = () => useDrizzle().select({ id: tables.validators.id }).from(tables.validators).execute().then(r => r.map(v => v.id))
export const getStoredValidatorsAddress = () => useDrizzle().select({ address: tables.validators.address }).from(tables.validators).execute().then(r => r.map(v => v.address))
const validatorFieldsWithListState = {
  id: tables.validators.id,
  name: tables.validators.name,
  address: tables.validators.address,
  description: tables.validators.description,
  fee: tables.validators.fee,
  payoutType: tables.validators.payoutType,
  payoutSchedule: tables.validators.payoutSchedule,
  isMaintainedByNimiq: tables.validators.isMaintainedByNimiq,
  logo: tables.validators.logo,
  hasDefaultLogo: tables.validators.hasDefaultLogo,
  accentColor: tables.validators.accentColor,
  website: tables.validators.website,
  contact: tables.validators.contact,
  isListed: tables.validators.isListed,
}

async function selectValidatorsWithListState(filters: SQLWrapper[] = []) {
  const query = useDrizzle().select(validatorFieldsWithListState).from(tables.validators)
  return filters.length > 0
    ? await query.where(and(...filters)).execute()
    : await query.execute()
}

export function filterVisibleValidators<T extends { isListed: boolean | null, name: string }>(validators: T[], onlyKnown: boolean): T[] {
  if (!onlyKnown)
    return validators

  return validators.filter(isKnownValidatorProfile)
}

export async function getStoredValidatorsListState() {
  return useDrizzle()
    .select({ address: tables.validators.address, isListed: tables.validators.isListed })
    .from(tables.validators)
    .execute()
}

const validators = new Map<string, number>()

interface StoreValidatorOptions {
  /**
   * If true, it will store the validator even if it already exists in the database.
   * @default false
   */
  upsert?: boolean

  /**
   * Controls if the validator should appear in `only-known=true`.
   * @default false
   */
  isListed?: boolean

  throwOnError?: boolean
}

export async function storeValidator(address: string, rest: ValidatorJSON = defaultValidatorJSON, options: StoreValidatorOptions = {}): Promise<number | undefined> {
  try {
    // TODO Use @nimiq/utils
    // Address.fromString(address)
  }
  catch (error: unknown) {
    consola.error(`Invalid address: ${address}. Error: ${JSON.stringify(error)}`)
    return
  }

  const { upsert = false, isListed = false } = options

  // If the validator is cached and upsert is not true, return it
  if (!upsert) {
    const cachedValidatorId = validators.get(address)
    if (cachedValidatorId !== undefined)
      return cachedValidatorId
    validators.delete(address)
  }

  // Check if the validator already exists in the database
  let validatorId = await useDrizzle()
    .select({ id: tables.validators.id })
    .from(tables.validators)
    .where(eq(tables.validators.address, address))
    .get()
    .then(r => r?.id)

  // If the validator exists and upsert is not true, return it
  if (!upsert && validatorId) {
    consola.info(`Validator ${address} already exists in the database`)
    validators.set(address, validatorId)
    return validatorId
  }

  consola.info(`${upsert ? 'Updating' : 'Storing'} validator ${address}`)

  const brandingParameters = await handleValidatorLogo(address, rest)
  const values = { ...rest, ...brandingParameters, isListed }

  try {
    if (validatorId) {
      await useDrizzle()
        .update(tables.validators)
        .set(values)
        .where(eq(tables.validators.id, validatorId))
        .execute()
    }
    else {
      validatorId = await useDrizzle()
        .insert(tables.validators)
        .values({ ...values, address })
        .returning()
        .get()
        .then(r => r.id)
    }
  }
  catch (error) {
    if (options.throwOnError) {
      throw error
    }

    consola.error(`There was an error while writing ${address} into the database`, error)
  }

  if (validatorId !== undefined)
    validators.set(address, validatorId)
  return validatorId
}

export async function storeValidatorStrict(address: string, rest: ValidatorJSON = defaultValidatorJSON): Promise<number> {
  const validatorId = await storeValidator(address, rest, { throwOnError: true })
  if (validatorId === undefined)
    throw new Error(`Failed to resolve validator ID for ${address}`)
  return validatorId
}

export async function markValidatorsAsUnlisted(addresses: string[]) {
  await Promise.all(addresses.map(async (address) => {
    await useDrizzle()
      .update(tables.validators)
      .set({ isListed: false })
      .where(eq(tables.validators.address, address))
      .execute()
  }))
}

export type FetchValidatorsOptions = MainQuerySchema & {
  epochNumber: number
  scoreVersion: ScoreVersion
  recentCoverage?: number
}

export async function fetchValidators(_event: H3Event, params: FetchValidatorsOptions): Result<FetchedValidator[]> {
  const {
    'payout-type': payoutType,
    'only-known': onlyKnown = true,
    'with-identicons': withIdenticons,
    epochNumber,
    recentCoverage = 0,
    scoreVersion,
  } = params

  // Add safety check for epochNumber
  if (epochNumber === null || epochNumber === undefined || !Number.isInteger(epochNumber)) {
    consola.error(`Invalid epochNumber: ${epochNumber}`)
    return [false, `Invalid epochNumber: ${epochNumber}`, undefined]
  }

  const filters: SQLWrapper[] = []
  if (payoutType)
    filters.push(eq(tables.validators.payoutType, payoutType))

  try {
    const dbValidators = await selectValidatorsWithListState(filters)

    const visibleValidators = filterVisibleValidators(dbValidators, onlyKnown)
    const validatorIds = visibleValidators.map(v => v.id)
    if (validatorIds.length === 0)
      return [true, undefined, []]

    const maxScoreEpochs = useDrizzle()
      .select({
        validatorId: tables.scores.validatorId,
        epochNumber: sql<number>`max(${tables.scores.epochNumber})`.as('epochNumber'),
      })
      .from(tables.scores)
      .where(and(
        eq(tables.scores.scoreVersion, scoreVersion),
        lte(tables.scores.epochNumber, epochNumber),
        inArray(tables.scores.validatorId, validatorIds),
      ))
      .groupBy(tables.scores.validatorId)
      .as('max_scores')

    const scoresRows = await useDrizzle()
      .select({
        validatorId: tables.scores.validatorId,
        scoreVersion: tables.scores.scoreVersion,
        total: tables.scores.total,
        availability: tables.scores.availability,
        recentAvailability: tables.scores.recentAvailability,
        longTermAvailability: tables.scores.longTermAvailability,
        dominance: tables.scores.dominance,
        reliability: tables.scores.reliability,
        epochNumber: tables.scores.epochNumber,
        dataStatus: tables.scores.dataStatus,
        longTermCoverage: tables.scores.longTermCoverage,
        longTermAsOfEpoch: tables.scores.longTermAsOfEpoch,
      })
      .from(tables.scores)
      .innerJoin(maxScoreEpochs, and(
        eq(tables.scores.validatorId, maxScoreEpochs.validatorId),
        eq(tables.scores.epochNumber, maxScoreEpochs.epochNumber),
        eq(tables.scores.scoreVersion, scoreVersion),
      ))
      .execute()

    const maxActivityEpochs = useDrizzle()
      .select({
        validatorId: tables.activity.validatorId,
        epochNumber: sql<number>`max(${tables.activity.epochNumber})`.as('epochNumber'),
      })
      .from(tables.activity)
      .where(and(
        lte(tables.activity.epochNumber, epochNumber + 1),
        inArray(tables.activity.validatorId, validatorIds),
      ))
      .groupBy(tables.activity.validatorId)
      .as('max_activity')

    const activityRows = await useDrizzle()
      .select({
        validatorId: tables.activity.validatorId,
        dominanceRatioViaBalance: tables.activity.dominanceRatioViaBalance,
        dominanceRatioViaSlots: tables.activity.dominanceRatioViaSlots,
        balance: tables.activity.balance,
        stakers: tables.activity.stakers,
        epochNumber: tables.activity.epochNumber,
      })
      .from(tables.activity)
      .innerJoin(maxActivityEpochs, and(
        eq(tables.activity.validatorId, maxActivityEpochs.validatorId),
        eq(tables.activity.epochNumber, maxActivityEpochs.epochNumber),
      ))
      .execute()

    const maxLiveActivityEpochs = useDrizzle()
      .select({
        validatorId: tables.activity.validatorId,
        epochNumber: sql<number>`max(${tables.activity.epochNumber})`.as('epochNumber'),
      })
      .from(tables.activity)
      .where(and(
        inArray(tables.activity.validatorId, validatorIds),
        or(
          gte(tables.activity.balance, 0),
          gte(tables.activity.stakers, 1),
        ),
      ))
      .groupBy(tables.activity.validatorId)
      .as('max_live_activity')

    const latestActivityMetadataRows = await useDrizzle()
      .select({
        validatorId: tables.activity.validatorId,
        balance: tables.activity.balance,
        stakers: tables.activity.stakers,
      })
      .from(tables.activity)
      .innerJoin(maxLiveActivityEpochs, and(
        eq(tables.activity.validatorId, maxLiveActivityEpochs.validatorId),
        eq(tables.activity.epochNumber, maxLiveActivityEpochs.epochNumber),
      ))
      .execute()

    const scoresByValidatorId = new Map(scoresRows.map(row => [row.validatorId, row]))
    const activityByValidatorId = new Map(activityRows.map(row => [row.validatorId, row]))
    const latestActivityMetadataByValidatorId = new Map(latestActivityMetadataRows.map(row => [row.validatorId, row]))

    const validators = visibleValidators.map((validator) => {
      const { logo, hasDefaultLogo, contact: _contact, isListed, ...rest } = validator
      const scoreRow = scoresByValidatorId.get(validator.id)
      const activityRow = activityByValidatorId.get(validator.id)
      const latestActivityMetadata = latestActivityMetadataByValidatorId.get(validator.id)

      if (!scoreRow) {
        // Gracefully handle the case where the validator has no score equal or lower than the requested epoch
        consola.warn(`Validator ${validator.address} has no score for epoch ${epochNumber} or earlier`)
      }

      const activityData = activityRow || { dominanceRatioViaBalance: -1, dominanceRatioViaSlots: -1, balance: -1, stakers: 0, epochNumber: -1 }
      const activityMetadata = resolveLiveActivityMetadata(activityData, activityData, latestActivityMetadata)

      const { dominanceRatioViaBalance = -1, dominanceRatioViaSlots = -1 } = activityData
      const { balance, stakers } = activityMetadata
      const score = toScoreApiValue(scoreRow ?? null, {
        requestedEpoch: epochNumber,
        scoreVersion,
        recentCoverage,
      })

      return {
        ...rest,
        isListed,
        score,
        hasDefaultLogo,
        logo: withIdenticons === false && hasDefaultLogo ? undefined : logo,
        dominanceRatio: dominanceRatioViaBalance || dominanceRatioViaSlots,
        balance,
        stakers,
      } satisfies FetchedValidator
    })

    // Drizzle's current relational API does not apply orderBy specified inside a nested with block to the outer query.
    // https://github.com/drizzle-team/drizzle-orm/issues/696?utm_source=chatgpt.com

    const sorted = validators.sort((a, b) => {
      const totalA = a.score.total ?? -Infinity
      const totalB = b.score.total ?? -Infinity
      if (totalA !== totalB)
        return totalB - totalA // descending by score.total
      return b.balance - a.balance // tie-breaker: descending by activity.balance
    })

    return [true, undefined, sorted]
  }
  catch (error) {
    consola.error(`Error fetching validators: ${error}`)
    return [false, JSON.stringify(error), undefined]
  }
}

export const cachedFetchValidators = defineCachedFunction((_event: H3Event, params: FetchValidatorsOptions) => fetchValidators(_event, params), {
  maxAge: import.meta.dev ? 0.01 : 10 * 60, // 10 minutes
  name: 'validators',
  getKey: (_event, p) => `validators:${p['only-known']}:${p['with-identicons']}:${p['payout-type']}:${p.epochNumber}:${p.scoreVersion}`,
})

export interface FetchValidatorOptions {
  address: string
  range: Range
  scoreVersion: ScoreVersion
  recentCoverage?: number
}
export type FetchedValidatorDetails = Validator & {
  activity: ActivityWithStatus[]
  scores: ScoreApiValue[]
  score: ScoreApiValue
}

export async function fetchValidator(_event: H3Event, params: FetchValidatorOptions): Result<FetchedValidatorDetails> {
  const {
    address,
    range: { fromEpoch, toEpoch },
    recentCoverage = 0,
    scoreVersion,
  } = params

  try {
    const validator = (await selectValidatorsWithListState([eq(tables.validators.address, address)])).at(0)

    if (!validator)
      return [false, `Validator with address ${address} not found`, undefined]

    const scores = await useDrizzle()
      .select()
      .from(tables.scores)
      .where(and(
        eq(tables.scores.validatorId, validator.id),
        eq(tables.scores.scoreVersion, scoreVersion),
        gte(tables.scores.epochNumber, fromEpoch),
        lte(tables.scores.epochNumber, toEpoch),
      ))
      .orderBy(asc(tables.scores.epochNumber))
      .execute()

    const selectedScores = selectScoreHistory(scores, scoreVersion)
    const score = toScoreApiValue(selectedScores.at(-1) ?? null, {
      requestedEpoch: toEpoch,
      scoreVersion,
      recentCoverage,
    })
    const scoreHistory = selectedScores.map(historyScore => toScoreApiValue(historyScore, {
      requestedEpoch: toEpoch,
      scoreVersion,
      recentCoverage,
    }))

    const activity = await useDrizzle()
      .select()
      .from(tables.activity)
      .where(and(
        eq(tables.activity.validatorId, validator.id),
        gte(tables.activity.epochNumber, fromEpoch),
        lte(tables.activity.epochNumber, toEpoch),
      ))
      .orderBy(asc(tables.activity.epochNumber))
      .execute()

    const finalizedEpochs = scoreVersion === 2
      ? await useDrizzle()
          .select({ epochNumber: tables.activityEpochs.epochNumber })
          .from(tables.activityEpochs)
          .where(and(
            eq(tables.activityEpochs.status, 'finalized'),
            gte(tables.activityEpochs.epochNumber, fromEpoch),
            lte(tables.activityEpochs.epochNumber, toEpoch),
          ))
          .execute()
          .then(rows => new Set(rows.map(row => row.epochNumber)))
      : undefined

    const latestActivityMetadata = await useDrizzle()
      .select({
        balance: tables.activity.balance,
        stakers: tables.activity.stakers,
      })
      .from(tables.activity)
      .where(and(
        eq(tables.activity.validatorId, validator.id),
        or(
          gte(tables.activity.balance, 0),
          gte(tables.activity.stakers, 1),
        ),
      ))
      .orderBy(desc(tables.activity.epochNumber))
      .limit(1)
      .then(rows => rows.at(0))

    const activityWithLiveMetadata = activity.map(row => ({
      ...row,
      ...resolveLiveActivityMetadata(row, row, latestActivityMetadata),
    }))

    return [true, undefined, {
      ...validator,
      scores: scoreHistory,
      activity: scoreVersion === 2
        ? buildValidatorActivityTimeline(
            { fromEpoch, toEpoch },
            activityWithLiveMetadata,
            finalizedEpochs,
          )
        : activityWithLiveMetadata.map(withValidatorEpochStatus),
      score,
    }]
  }
  catch (error) {
    consola.error(`Error fetching validator ${address}: ${error}`)
    return [false, JSON.stringify(error), undefined]
  }
}

export const cachedFetchValidator = defineCachedFunction((_event: H3Event, params: FetchValidatorOptions) => fetchValidator(_event, params), {
  maxAge: import.meta.dev ? 0.01 : 10 * 60, // 10 minutes
  name: 'validator',
  getKey: (_event, p) => `validator:${p.address}:${p.range.fromEpoch}:${p.range.toEpoch}:${p.scoreVersion}`,
})

/**
 * Gets the validators in the current epoch and categorizes them into:
 * - electedTrackedValidators: elected validators that are tracked in the database
 * - unelectedTrackedValidators: unelected validators that are tracked in the database
 * - electedUntrackedValidators: elected validators that are not tracked in the database
 * - unelectedUntrackedValidators: unelected validators that are not tracked in the database
 *
 * Untracked validators are not the same as anonymous validators:
 * - anonymous validators are the ones that didn't submit any information, but we do track them
 * - untracked validators are the ones that are not in the database, because they were recently added. Having
 *   untracked validators is a rare exception since, we rarely have new validators.
 *
 * Deleted validators are the ones that are not in the staking contract anymore, but are still in the database.
 */
export async function categorizeValidatorsSnapshotEpoch(): Result<SnapshotEpochValidators> {
  const { nimiqNetwork: network } = useSafeRuntimeConfig().public
  const [epochOk, error, epoch] = await fetchSnapshotEpoch({ network })
  if (!epochOk)
    return [false, error, undefined]

  const storedValidators = await getStoredValidatorsListState()
  const dbAddresses = storedValidators.map(v => v.address)
  const electedValidators = epoch.validators.filter(v => v.elected) as ElectedValidator[]
  const unelectedValidators = epoch.validators.filter(v => !v.elected) as UnelectedValidator[]
  const untrackedValidators = electedValidators.filter(v => !dbAddresses.includes(v.address)) as (ElectedValidator & UnelectedValidator)[]
  const deletedValidators = dbAddresses.filter(dbAddress => !epoch.validators.map(v => v.address).includes(dbAddress))
  const unlistedActiveValidators = getUnlistedActiveValidatorAddresses(epoch.validators, storedValidators)

  return [true, undefined, {
    epochNumber: epoch.epochNumber,
    electedValidators,
    unelectedValidators,
    untrackedValidators,
    deletedValidators,
    unlistedActiveValidators,
  }]
}
