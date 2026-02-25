import type { SQLWrapper } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { ElectedValidator, Range, Result, UnelectedValidator } from 'nimiq-validator-trustscore/types'
import type { Activity, Score, Validator } from './drizzle'
import type { MainQuerySchema, ValidatorJSON } from './schemas'
import type { FetchedValidator, SnapshotEpochValidators } from './types'
import { consola } from 'consola'
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { fetchSnapshotEpoch } from '~~/packages/nimiq-validator-trustscore/src/fetcher'
import { tables, useDrizzle } from './drizzle'
import { handleValidatorLogo } from './logo'
import { defaultValidatorJSON } from './schemas'
import { PayoutType } from './types'
import { getUnlistedActiveValidatorAddresses, isKnownValidatorProfile } from './validator-listing'

export const getStoredValidatorsId = () => useDrizzle().select({ id: tables.validators.id }).from(tables.validators).execute().then(r => r.map(v => v.id))
export const getStoredValidatorsAddress = () => useDrizzle().select({ address: tables.validators.address }).from(tables.validators).execute().then(r => r.map(v => v.address))

function isMissingIsListedColumnError(error: unknown) {
  const message = String(error)
  return message.includes('is_listed')
    && (message.includes('no such column') || message.includes('has no column named'))
}

let hasWarnedMissingIsListedColumn = false

export async function getStoredValidatorsListState() {
  try {
    return await useDrizzle()
      .select({ address: tables.validators.address, isListed: tables.validators.isListed })
      .from(tables.validators)
      .execute()
  }
  catch (error) {
    if (!isMissingIsListedColumnError(error))
      throw error

    if (!hasWarnedMissingIsListedColumn) {
      hasWarnedMissingIsListedColumn = true
      consola.warn('`validators.is_listed` column is missing, using backwards-compatible fallback until migration is applied')
    }

    const addresses = await getStoredValidatorsAddress()
    return addresses.map(address => ({ address, isListed: null }))
  }
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
  if (!upsert && validators.has(address)) {
    return validators.get(address)
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
  const valuesWithoutListState = { ...rest, ...brandingParameters }
  const valuesWithListState = { ...valuesWithoutListState, isListed }

  try {
    if (validatorId) {
      await useDrizzle()
        .update(tables.validators)
        .set(valuesWithListState)
        .where(eq(tables.validators.id, validatorId))
        .execute()
    }
    else {
      validatorId = await useDrizzle()
        .insert(tables.validators)
        .values({ ...valuesWithListState, address })
        .returning()
        .get()
        .then(r => r.id)
    }
  }
  catch (e) {
    if (!isMissingIsListedColumnError(e)) {
      consola.error(`There was an error while writing ${address} into the database`, e)
    }
    else {
      if (!hasWarnedMissingIsListedColumn) {
        hasWarnedMissingIsListedColumn = true
        consola.warn('`validators.is_listed` column is missing, storing validators without list state until migration is applied')
      }

      try {
        if (validatorId) {
          await useDrizzle()
            .update(tables.validators)
            .set(valuesWithoutListState)
            .where(eq(tables.validators.id, validatorId))
            .execute()
        }
        else {
          validatorId = await useDrizzle()
            .insert(tables.validators)
            .values({ ...valuesWithoutListState, address })
            .returning()
            .get()
            .then(r => r.id)
        }
      }
      catch (fallbackError) {
        consola.error(`There was an error while writing ${address} into the database`, fallbackError)
      }
    }
  }

  validators.set(address, validatorId!)
  return validatorId
}

export async function markValidatorsAsUnlisted(addresses: string[]) {
  await Promise.all(addresses.map(async (address) => {
    const brandingParameters = await handleValidatorLogo(address, defaultValidatorJSON)
    const valuesWithoutListState = {
      name: 'Unknown validator',
      description: null,
      fee: null,
      payoutType: PayoutType.None,
      payoutSchedule: '',
      isMaintainedByNimiq: false,
      website: null,
      contact: null,
      ...brandingParameters,
    }

    try {
      await useDrizzle()
        .update(tables.validators)
        .set({
          ...valuesWithoutListState,
          isListed: false,
        })
        .where(eq(tables.validators.address, address))
        .execute()
    }
    catch (error) {
      if (!isMissingIsListedColumnError(error))
        throw error

      await useDrizzle()
        .update(tables.validators)
        .set(valuesWithoutListState)
        .where(eq(tables.validators.address, address))
        .execute()
    }
  }))
}

export type FetchValidatorsOptions = MainQuerySchema & { epochNumber: number }

export async function fetchValidators(_event: H3Event, params: FetchValidatorsOptions): Result<FetchedValidator[]> {
  const { 'payout-type': payoutType, 'only-known': onlyKnown = false, 'with-identicons': withIdenticons, epochNumber } = params

  // Add safety check for epochNumber
  if (epochNumber === null || epochNumber === undefined || !Number.isInteger(epochNumber)) {
    consola.error(`Invalid epochNumber: ${epochNumber}`)
    return [false, `Invalid epochNumber: ${epochNumber}`, undefined]
  }

  const filters: SQLWrapper[] = []
  if (payoutType)
    filters.push(eq(tables.validators.payoutType, payoutType))

  try {
    const validatorsQuery = useDrizzle().select().from(tables.validators)
    const dbValidators = filters.length > 0
      ? await validatorsQuery.where(and(...filters)).execute()
      : await validatorsQuery.execute()

    const visibleValidators = onlyKnown ? dbValidators.filter(isKnownValidatorProfile) : dbValidators
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
        lte(tables.scores.epochNumber, epochNumber),
        inArray(tables.scores.validatorId, validatorIds),
      ))
      .groupBy(tables.scores.validatorId)
      .as('max_scores')

    const scoresRows = await useDrizzle()
      .select({
        validatorId: tables.scores.validatorId,
        total: tables.scores.total,
        availability: tables.scores.availability,
        dominance: tables.scores.dominance,
        reliability: tables.scores.reliability,
        epochNumber: tables.scores.epochNumber,
      })
      .from(tables.scores)
      .innerJoin(maxScoreEpochs, and(
        eq(tables.scores.validatorId, maxScoreEpochs.validatorId),
        eq(tables.scores.epochNumber, maxScoreEpochs.epochNumber),
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

    const scoresByValidatorId = new Map(scoresRows.map(row => [row.validatorId, row]))
    const activityByValidatorId = new Map(activityRows.map(row => [row.validatorId, row]))

    const validators = visibleValidators.map((validator) => {
      const { logo, contact, hasDefaultLogo, ...rest } = validator
      const scoreRow = scoresByValidatorId.get(validator.id)
      const activityRow = activityByValidatorId.get(validator.id)

      if (!scoreRow) {
        // Gracefully handle the case where the validator has no score equal or lower than the requested epoch
        consola.warn(`Validator ${validator.address} has no score for epoch ${epochNumber} or earlier`)
      }

      const scoreData = scoreRow || { availability: -1, dominance: -1, reliability: -1, total: -1, epochNumber: -1 }
      const activityData = activityRow || { dominanceRatioViaBalance: -1, dominanceRatioViaSlots: -1, balance: -1, stakers: 0, epochNumber: -1 }

      const { dominanceRatioViaBalance = -1, dominanceRatioViaSlots = -1, balance = -1, stakers = 0 } = activityData
      const score: FetchedValidator['score'] = {
        availability: scoreData.availability === -1 ? null : scoreData.availability,
        reliability: scoreData.reliability === -1 ? null : scoreData.reliability,
        dominance: scoreData.dominance === -1 ? null : scoreData.dominance,
        total: !Object.values(scoreData).includes(-1) ? scoreData.total : null,
        epochNumber: scoreData.epochNumber,
      }

      return {
        ...rest,
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
  getKey: (_event, p) => `validators:${p['only-known']}:${p['with-identicons']}:${p['payout-type']}:${p.epochNumber}`,
})

export interface FetchValidatorOptions { address: string, range: Range }
export type FetchedValidatorDetails = Validator & { activity: Activity[], scores: Score[], score?: Score }

export async function fetchValidator(_event: H3Event, params: FetchValidatorOptions): Result<FetchedValidatorDetails> {
  const { address, range: { fromEpoch, toEpoch } } = params

  try {
    const validator = await useDrizzle()
      .select()
      .from(tables.validators)
      .where(eq(tables.validators.address, address))
      .get()

    if (!validator)
      return [false, `Validator with address ${address} not found`, undefined]

    const scores = await useDrizzle()
      .select()
      .from(tables.scores)
      .where(and(
        eq(tables.scores.validatorId, validator.id),
        gte(tables.scores.epochNumber, fromEpoch),
        lte(tables.scores.epochNumber, toEpoch),
      ))
      .execute()

    const activity = await useDrizzle()
      .select()
      .from(tables.activity)
      .where(and(
        eq(tables.activity.validatorId, validator.id),
        gte(tables.activity.epochNumber, fromEpoch),
        lte(tables.activity.epochNumber, toEpoch),
      ))
      .execute()

    const score = scores.sort((a, b) => a.epochNumber < b.epochNumber ? 1 : -1).at(0)
    return [true, undefined, { ...validator, scores, activity, score }]
  }
  catch (error) {
    consola.error(`Error fetching validator ${address}: ${error}`)
    return [false, JSON.stringify(error), undefined]
  }
}

export const cachedFetchValidator = defineCachedFunction((_event: H3Event, params: FetchValidatorOptions) => fetchValidator(_event, params), {
  maxAge: import.meta.dev ? 0.01 : 10 * 60, // 10 minutes
  name: 'validator',
  getKey: (_event, p) => `validator:${p.address}:${p.range.fromEpoch}:${p.range.toEpoch}`,
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
