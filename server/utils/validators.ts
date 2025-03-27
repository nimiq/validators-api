import type { SQLWrapper } from 'drizzle-orm'
import type { Result, SelectedValidator, UnselectedValidator } from 'nimiq-validator-trustscore/types'
import type { Validator } from './drizzle'
import type { ValidatorJSON } from './schemas'
import type { CurrentEpochValidators } from './types'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { consola } from 'consola'
import { and, eq, sql } from 'drizzle-orm'
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

type FetchedValidator = Omit<Validator, 'logo' | 'contact'> & {
  logo?: string
  score: { total: number | null, availability: number | null, reliability: number | null, dominance: number | null }
  dominanceRatio: number | null
  balance: number
  activeInEpoch: boolean
}

export async function fetchValidators(params: FetchValidatorsOptions): Result<FetchedValidator[]> {
  const { 'payout-type': payoutType, 'only-known': onlyKnown = false, 'with-identicons': withIdenticons = false, epochNumber } = params

  const filters: SQLWrapper[] = []
  if (payoutType)
    filters.push(eq(tables.validators.payoutType, payoutType))
  if (onlyKnown)
    filters.push(sql`lower(${tables.validators.name}) NOT LIKE lower('%Unknown validator%')`)

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

      if (!scores.at(0) || !activity.at(0)) {
        throw new Error(`Validator ${validator.address} has no scores or activity for epoch ${epochNumber}`)
      }

      const score: FetchedValidator['score'] = {
        availability: scores[0]!.availability === -1 ? null : scores[0]!.availability,
        reliability: scores[0]!.reliability === -1 ? null : scores[0]!.reliability,
        dominance: scores[0]!.dominance === -1 ? null : scores[0]!.dominance,
        total: !Object.values(scores[0]!).includes(-1) ? scores[0]!.total : null,
      }

      const { dominanceRatioViaBalance, dominanceRatioViaSlots, balance } = activity[0]!

      return {
        ...rest,
        score,
        hasDefaultLogo,
        logo: !withIdenticons && hasDefaultLogo ? undefined : logo,
        dominanceRatio: dominanceRatioViaBalance || dominanceRatioViaSlots,
        balance: balance!,
        activeInEpoch: !!(dominanceRatioViaBalance || dominanceRatioViaSlots),
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

/**
 * Gets the validators in the current epoch and categorizes them into:
 * - selectedTrackedValidators: selected validators that are tracked in the database
 * - unselectedTrackedValidators: unselected validators that are tracked in the database
 * - selectedUntrackedValidators: selected validators that are not tracked in the database
 * - unselectedUntrackedValidators: unselected validators that are not tracked in the database
 *
 * Untracked validators are not the same as anonymous validators:
 * - anonymous validators are the ones that didn't submit any information, but we do track them
 * - untracked validators are the ones that are not in the database, because they were recently added. Having
 *   untracked validators is a rare exception since, we rarely have new validators.
 */
export async function categorizeValidatorsCurrentEpoch(): Result<CurrentEpochValidators> {
  const { networkName } = useRuntimeConfig().public
  const { data: epoch, error } = await fetchCurrentEpoch(getRpcClient(), { testnet: networkName === 'test-albatross' })
  if (!epoch || error)
    return { error: error || 'No data' }

  const dbAddresses = await getStoredValidatorsAddress()
  const selectedValidators = epoch.validators

  const selectedTrackedValidators = selectedValidators.filter(v => v.selected && dbAddresses.includes(v.address)) as SelectedValidator[]
  const unselectedTrackedValidators = selectedValidators.filter(v => !v.selected && dbAddresses.includes(v.address)) as UnselectedValidator[]
  const selectedUntrackedValidators = selectedValidators.filter(v => v.selected && !dbAddresses.includes(v.address)) as SelectedValidator[]
  const unselectedUntrackedValidators = selectedValidators.filter(v => !v.selected && !dbAddresses.includes(v.address)) as UnselectedValidator[]

  return {
    data: {
      epochNumber: epoch.epochNumber,
      selectedValidators,
      validators: {
        selectedTrackedValidators,
        unselectedTrackedValidators,
        selectedUntrackedValidators,
        unselectedUntrackedValidators,
      },
    },
  }
}
