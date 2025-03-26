import type { SQLWrapper } from 'drizzle-orm'
import type { Result } from 'nimiq-validator-trustscore/types'
import type { Validator } from './drizzle'
import type { ValidatorJSON } from './schemas'
import type { ValidatorScore } from './types'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { consola } from 'consola'
import { and, desc, eq, inArray, max, sql } from 'drizzle-orm'
import { tables, useDrizzle } from './drizzle'
import { handleValidatorLogo } from './logo'
import { defaultValidatorJSON, validatorsSchema } from './schemas'

export async function getStoredValidatorsAddress(): Promise<string[]> {
  return useDrizzle()
    .select({ address: tables.validators.address })
    .from(tables.validators)
    .execute()
    .then(r => r.map(r => r.address))
}

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

export async function fetchValidatorsScoreByIds(validatorIds: number[]): Result<ValidatorScore[]> {
  const validators = await useDrizzle()
    .select({
      id: tables.validators.id,
      name: tables.validators.name,
      address: tables.validators.address,
      fee: tables.validators.fee,
      payoutType: tables.validators.payoutType,
      description: tables.validators.description,
      logo: tables.validators.logo,
      isMaintainedByNimiq: tables.validators.isMaintainedByNimiq,
      website: tables.validators.website,
      total: tables.scores.total,
      availability: tables.scores.availability,
      dominance: tables.scores.dominance,
    })
    .from(tables.validators)
    .leftJoin(tables.scores, eq(tables.validators.id, tables.scores.validatorId))
    .where(inArray(tables.validators.id, validatorIds))
    .groupBy(tables.validators.id)
    .orderBy(desc(tables.scores.total))
    .all() as ValidatorScore[]
  return { data: validators, error: undefined }
}

export type FetchValidatorsOptions = Zod.infer<typeof mainQuerySchema> & { epochNumber?: number }

type FetchedValidator = Omit<Validator, 'logo' | 'contact'> & {
  logo?: string
  score?: { total: number | null, availability: number | null, reliability: number | null, dominance: number | null }
  dominanceRatio?: number
  balance?: number
}

export async function fetchValidators(params: FetchValidatorsOptions): Result<FetchedValidator[]> {
  const { 'payout-type': payoutType, 'only-known': onlyKnown = false, 'with-identicons': withIdenticons = false } = params

  const filters: SQLWrapper[] = []
  if (payoutType)
    filters.push(eq(tables.validators.payoutType, payoutType))
  if (onlyKnown)
    filters.push(sql`lower(${tables.validators.name}) NOT LIKE lower('%Unknown validator%')`)

  const epochNumber = params.epochNumber || await useDrizzle().select({ epochNumber: max(tables.scores.epochNumber) }).from(tables.scores).then(r => r.at(0)?.epochNumber)
  if (!epochNumber)
    return { data: undefined, error: 'No epoch number found' }

  try {
    const dbValidators = await useDrizzle().query.validators.findMany({
      where: and(...filters),
      with: {
        scores: {
          where: eq(tables.scores.epochNumber, epochNumber),
          limit: 1,
          columns: {
            total: true,
            availability: true,
            dominance: true,
            reliability: true,
          },
        },
        activity: {
          where: eq(tables.scores.epochNumber, epochNumber + 1),
          columns: {
            dominanceRatioViaBalance: true,
            dominanceRatioViaSlots: true,
            balance: true,
          },
          limit: 1,
        },
      },
    })

    const validators = dbValidators.map((validator) => {
      const { scores, logo, contact, activity, hasDefaultLogo, ...rest } = validator

      const score: FetchedValidator['score'] = scores[0]
      if (score) {
        const { availability, dominance, reliability } = scores[0]!
        if (reliability === -1 || reliability === null) {
          score.reliability = null
          score.total = null
        }
        if (availability === -1 || availability === null) {
          score.availability = null
          score.total = null
        }
        if (dominance === -1 || dominance === null) {
          score.dominance = null
          score.total = null
        }
      }

      const { dominanceRatioViaBalance, dominanceRatioViaSlots, balance } = activity?.[0] || {}

      return {
        ...rest,
        score,
        hasDefaultLogo,
        logo: !withIdenticons && hasDefaultLogo ? undefined : logo,
        dominanceRatio: dominanceRatioViaBalance || dominanceRatioViaSlots,
        balance,
      } satisfies FetchedValidator
    })

    return { data: validators, error: undefined }
  }
  catch (error) {
    consola.error(`Error fetching validators: ${error}`)
    return { data: undefined, error: JSON.stringify(error) }
  }
}

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
      return { error: `Invalid JSON in file: ${file}. Error: ${error}` }
    }
  }
  return { data: rawValidators }
}

/**
 * Import validators from GitHub. Useful since in cloudflare runtime we don't have access to the file system.
 */
async function importValidatorsFromGitHub(path: string): Result<any[]> {
  let validatorsJson
  try {
    const { gitBranch } = useRuntimeConfig()
    const url = `https://ungh.cc/repos/nimiq/validators-api/files/${gitBranch}`
    const response = await $fetch<{ files: { path: string }[] }>(`${url}/${path}`)
    const fileUrls = response.files.map(file => `${url}/${path}/${file.path}`)
    consola.info(`Fetching ${fileUrls.length} files from GitHub`)
    const files = await Promise.all(fileUrls.map(url => $fetch<{ contents: string }>(url)))
    validatorsJson = files.map(file => JSON.parse(file.contents))
  }
  catch (e) {
    return { error: JSON.stringify(e) }
  }

  return { data: validatorsJson }
}

export async function importValidators(source: 'filesystem' | 'github'): Result<boolean> {
  const { nimiqNetwork } = useRuntimeConfig().public
  const path = `public/validators/${nimiqNetwork}`
  const { data: validatorsData, error: errorReading } = source === 'filesystem'
    ? await importValidatorsFromFiles(path)
    : await importValidatorsFromGitHub(path)
  if (errorReading || !validatorsData)
    return { error: errorReading }

  const { success, data: validators, error } = validatorsSchema.safeParse(validatorsData)
  if (!success || !validators || error)
    return { error: `Invalid validators data: ${error}` }

  const res = await Promise.allSettled(validators.map(validator => storeValidator(validator.address, validator, { upsert: true })))
  const errors = res.filter(r => r.status === 'rejected')
  if (errors.length > 0)
    return { error: `There were errors while importing the validators: ${errors.map(e => e.reason)}` }
  return { data: true }
}
