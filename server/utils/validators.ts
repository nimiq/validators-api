import type { SQLWrapper } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { ElectedValidator, Range, Result, UnelectedValidator } from 'nimiq-validator-trustscore/types'
import type { Activity, Score, Validator } from './drizzle'
import type { ValidatorJSON } from './schemas'
import type { CurrentEpochValidators, FetchedValidator } from './types'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { consola } from 'consola'
import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { fetchCurrentEpoch } from '~~/packages/nimiq-validator-trustscore/src/fetcher'
import { tables, useDrizzle } from './drizzle'
import { handleValidatorLogo } from './logo'
import { defaultValidatorJSON, validatorsSchema } from './schemas'

export const getStoredValidatorsId = () => useDrizzle().select({ id: tables.validators.id }).from(tables.validators).execute().then(r => r.map(v => v.id))
export const getStoredValidatorsAddress = () => useDrizzle().select({ address: tables.validators.address }).from(tables.validators).execute().then(r => r.map(v => v.address))

const validators = new Map<string, number>()

interface StoreValidatorOptions {
  /**
   * If true, it will store the validator even if it already exists in the database.
   * @default false
   */
  upsert?: boolean
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

  const { upsert = false } = options

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
  try {
    if (validatorId) {
      await useDrizzle()
        .update(tables.validators)
        .set({ ...rest, ...brandingParameters })
        .where(eq(tables.validators.id, validatorId))
        .execute()
    }
    else {
      validatorId = await useDrizzle()
        .insert(tables.validators)
        .values({ ...rest, address, ...brandingParameters })
        .returning()
        .get()
        .then(r => r.id)
    }
  }
  catch (e) {
    consola.error(`There was an error while writing ${address} into the database`, e)
  }

  validators.set(address, validatorId!)
  return validatorId
}

export type FetchValidatorsOptions = Zod.infer<typeof mainQuerySchema> & { epochNumber: number }

export async function fetchValidators(_event: H3Event, params: FetchValidatorsOptions): Result<FetchedValidator[]> {
  const { 'payout-type': payoutType, 'only-known': onlyKnown = false, 'with-identicons': withIdenticons = false, epochNumber } = params

  const filters: SQLWrapper[] = []
  if (payoutType)
    filters.push(eq(tables.validators.payoutType, payoutType))
  if (onlyKnown)
    filters.push(sql`lower(${tables.validators.name}) NOT LIKE lower('%Unknown validator%')`)

  try {
    // Fixed subqueries to correctly reference the validator_id column
    const maxScoreEpochSubquery = sql`(
      SELECT MAX(s.epoch_number) 
      FROM scores s 
      WHERE s.validator_id = validators.id 
      AND s.epoch_number <= ${epochNumber}
    )`

    const maxActivityEpochSubquery = sql`(
      SELECT MAX(a.epoch_number) 
      FROM activity a 
      WHERE a.validator_id = validators.id 
      AND a.epoch_number <= ${epochNumber + 1}
    )`

    const dbValidators = await useDrizzle().query.validators.findMany({
      where: and(...filters),
      with: {
        scores: {
          where: eq(tables.scores.epochNumber, maxScoreEpochSubquery),
          columns: { total: true, availability: true, dominance: true, reliability: true, epochNumber: true },
          limit: 1,
        },
        activity: {
          where: eq(tables.activity.epochNumber, maxActivityEpochSubquery),
          columns: { dominanceRatioViaBalance: true, dominanceRatioViaSlots: true, balance: true, stakers: true, epochNumber: true },
          limit: 1,
        },
      },
    })

    const validators = dbValidators.map((validator) => {
      const { scores, logo, contact, activity, hasDefaultLogo, ...rest } = validator

      if (scores.length === 0) {
        // Gracefully handle the case where the validator has no score equal or lower than the requested epoch
        consola.warn(`Validator ${validator.address} has no score for epoch ${epochNumber} or earlier`)
        scores.push({ availability: -1, dominance: -1, reliability: -1, total: -1, epochNumber: -1 })
      }

      if (activity.length === 0) {
        // Gracefully handle the case where the validator has no activity equal or lower than the requested next epoch
        consola.warn(`Validator ${validator.address} has no activity for epoch ${epochNumber + 1} or earlier`)
        activity.push({ dominanceRatioViaBalance: -1, dominanceRatioViaSlots: -1, balance: -1, stakers: 0, epochNumber: -1 })
      }

      const { dominanceRatioViaBalance = -1, dominanceRatioViaSlots = -1, balance = -1, stakers = 0 } = activity[0]!
      const score: FetchedValidator['score'] = {
        availability: scores[0]!.availability === -1 ? null : scores[0]!.availability,
        reliability: scores[0]!.reliability === -1 ? null : scores[0]!.reliability,
        dominance: scores[0]!.dominance === -1 ? null : scores[0]!.dominance,
        total: !Object.values(scores[0]!).includes(-1) ? scores[0]!.total : null,
        epochNumber: scores[0]!.epochNumber,
      }

      return {
        ...rest,
        score,
        hasDefaultLogo,
        logo: !withIdenticons && hasDefaultLogo ? undefined : logo,
        dominanceRatio: dominanceRatioViaBalance || dominanceRatioViaSlots,
        balance,
        stakers,
      } satisfies FetchedValidator
    })

    // TODO Remove this when the issue is fixed. See comment above
    const sorted = validators.sort((a, b) => a.score.total! < b.score.total! ? 1 : -1)

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
    const validator = await useDrizzle().query.validators.findFirst({
      where: eq(tables.validators.address, address),
      with: {
        // Returns all the scores in the range to visualize
        scores: {
          where: ({ validatorId: id }) => and(eq(tables.scores.validatorId, id), gte(tables.scores.epochNumber, fromEpoch), lte(tables.scores.epochNumber, toEpoch)),
        },
        // Returns all the activity in the range to visualize
        activity: {
          where: ({ validatorId: id }) =>
            and(eq(tables.activity.validatorId, id), gte(tables.activity.epochNumber, fromEpoch), lte(tables.activity.epochNumber, toEpoch)),
        },
      },
    })

    if (!validator)
      return [false, `Validator with address ${address} not found`, undefined]
    const score = validator?.scores?.sort((a, b) => a.epochNumber < b.epochNumber ? 1 : -1).at(0)
    return [true, undefined, { ...validator, score }]
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
 * Import validators from a folder containing .json files.
 *
 * This function is expected to be used when initializing the database with validators, so it will throw
 * an error if the files are not valid and the program should stop.
 */
async function importValidatorsFromFiles(folderPath: string): Result<any[]> {
  const allFiles = await readdir(folderPath)
  const files = allFiles
    .filter(f => path.extname(f) === '.json')
    .filter(f => !f.endsWith('.example.json'))

  const rawValidators: any[] = []
  for (const file of files) {
    const filePath = path.join(folderPath, file)
    const fileContent = await readFile(filePath, 'utf8')

    try {
      rawValidators.push(JSON.parse(fileContent))
    }
    catch (error) {
      return [false, `Invalid JSON in file: ${file}. Error: ${error}`, undefined]
    }
  }
  return [true, undefined, rawValidators]
}

/**
 * Import validators from GitHub. Useful since in cloudflare runtime we don't have access to the file system.
 */
async function importValidatorsFromGitHub(path: string): Result<any[]> {
  const { gitBranch } = useRuntimeConfig().public
  const url = `https://ungh.cc/repos/nimiq/validators-api/files/${gitBranch}`
  let response
  try {
    response = await $fetch<{ files: { path: string }[] }>(url)
  }
  catch (e) {
    consola.warn(`Error fetching file: ${e}`)
  }
  if (!response || !response.files)
    return [false, 'No files found', undefined]

  const fileUrls = response.files
    .filter(file => file.path.startsWith(`${path}/`) && file.path.endsWith('.json') && !file.path.endsWith('.example.json'))
  const files = await Promise.all(fileUrls.map(async (fileUrl) => {
    const fullFileUrl = `${url}/${fileUrl.path}`
    const file = await $fetch<{ file: { contents: string } }>(fullFileUrl)
    if (!file) {
      consola.warn(`File ${fileUrl.path} not found`)
      return undefined
    }
    return file.file.contents
  }))
  const validatorsJson = files.filter(Boolean).map(contents => JSON.parse(contents!))
  return [true, undefined, validatorsJson]
}

export async function importValidators(source: 'filesystem' | 'github'): Result<ValidatorJSON[]> {
  const { nimiqNetwork } = useRuntimeConfig().public
  const path = `public/validators/${nimiqNetwork}`
  const [importOk, errorReading, validatorsData] = source === 'filesystem'
    ? await importValidatorsFromFiles(path)
    : await importValidatorsFromGitHub(path)
  if (!importOk)
    return [false, errorReading, undefined]

  const { success, data: validators, error } = validatorsSchema.safeParse(validatorsData)
  if (!success || !validators || error)
    return [false, `Invalid validators data: ${error}`, undefined]

  const res = await Promise.allSettled(validators.map(validator => storeValidator(validator.address, validator, { upsert: true })))
  const errors = res.filter(r => r.status === 'rejected')
  if (errors.length > 0)
    return [false, `There were errors while importing the validators: ${errors.map(e => e.reason)}`, undefined]
  return [true, undefined, validators]
}

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
 */
export async function categorizeValidatorsCurrentEpoch(): Result<CurrentEpochValidators> {
  const { nimiqNetwork: network } = useRuntimeConfig().public
  const [epochOk, error, epoch] = await fetchCurrentEpoch(getRpcClient(), { network })
  if (!epochOk)
    return [false, error, undefined]

  const dbAddresses = await getStoredValidatorsAddress()
  const electedValidators = epoch.validators.filter(v => v.elected) as ElectedValidator[]
  const unelectedValidators = epoch.validators.filter(v => !v.elected) as UnelectedValidator[]
  const untrackedValidators = electedValidators.filter(v => !dbAddresses.includes(v.address)) as (ElectedValidator & UnelectedValidator)[]

  return [true, undefined, {
    epochNumber: epoch.epochNumber,
    electedValidators,
    unelectedValidators,
    untrackedValidators,
  }]
}
