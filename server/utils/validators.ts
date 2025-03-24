import type { SQLWrapper } from 'drizzle-orm'
import type { NimiqRPCClient } from 'nimiq-rpc-client-ts'
import type { Validator } from './drizzle'
import type { ValidatorJSON } from './schemas'
import type { Result, ValidatorScore } from './types'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { consola } from 'consola'
import { and, desc, eq, inArray, max, sql } from 'drizzle-orm'
import { tables, useDrizzle } from './drizzle'
import { handleValidatorLogo } from './logo'
import { defaultValidatorJSON, validatorSchema } from './schemas'

interface ValidatorCategorization {
  inactiveValidators: string[]
  missingValidators: string[]
}

/**
 * Given a list of active validator addresses, it returns:
 *   - Addresses missing in the database:
 *   - Addresses inactive in the current epoch
 *
 *          Active validators       "x" represents a validator
 *          ┌─────────────────┐
 *          │   ┌─────────────────┐
 *          │   │       x    x│   │
 *          │   │ x   x       │   │
 *     ┌────┼─x │        x  x │   │
 *     │    │   │   x         │ x─┼─►Validator inactive
 *     ▼    └───│─────────────┘   │
 * Not in DB    └─────────────────┘
 *                 Database validators
 *
 * Note: Albatross Validator have 4 states:
 * Active, Inactive, Deleted and not yet created (validators that will be created).
 * The validators API only handles Active and Inactive validators. Anything that is not active is considered inactive.
 */
export async function categorizeValidators(activeAddresses: string[]): Promise<ValidatorCategorization> {
  const dbAddresses = await useDrizzle()
    .select({ address: tables.validators.address })
    .from(tables.validators)
    .execute()
    .then(r => r.map(r => r.address))
  const missingValidators = activeAddresses.filter(activeAddress => !dbAddresses.includes(activeAddress))
  const inactiveValidators = dbAddresses.filter(dbAddress => !activeAddresses.includes(dbAddress))
  return { inactiveValidators, missingValidators }
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
    // TODO Build broken
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
 * Fetches balances for a list of validator addresses
 * @param client The Nimiq RPC client
 * @param addresses Array of validator addresses to fetch balances for
 * @returns Array of objects containing address and balance
 */
export async function fetchValidatorBalances(client: NimiqRPCClient, addresses: string[]) {
  consola.info(`Fetching balances for ${addresses.length} validators`)

  const balancesPromises = addresses.map(async (address) => {
    try {
      const { data, error } = await client.blockchain.getAccountByAddress(address)
      if (error || !data) {
        consola.warn(`Failed to fetch balance for validator ${address}: ${error?.message || 'Unknown error'}`)
        return null
      }
      return { address, balance: data.balance || 0 }
    }
    catch (error) {
      consola.error(`Error fetching balance for validator ${address}:`, error)
      return null
    }
  })

  const results = await Promise.all(balancesPromises)
  const balances = results.filter(Boolean) as Array<{ address: string, balance: number }>

  consola.info(`Successfully fetched balances for ${balances.length} validators`)
  return balances
}

/**
 * Import validators from a folder containing .json files.
 *
 * This function is expected to be used when initializing the database with validators, so it will throw
 * an error if the files are not valid and the program should stop.
 */
export async function importValidatorsFromFiles(folderPath: string) {
  const allFiles = await readdir(folderPath)
  const files = allFiles
    .filter(f => path.extname(f) === '.json')
    .filter(f => !f.endsWith('.example.json'))

  const validators = []
  for (const file of files) {
    const filePath = path.join(folderPath, file)
    const fileContent = await readFile(filePath, 'utf8')

    // Validate the file content
    let jsonData
    try {
      jsonData = JSON.parse(fileContent)
    }
    catch (error) {
      throw new Error(`Invalid JSON in file: ${file}. Error: ${error}`)
    }
    const { success, data: validator, error } = validatorSchema.safeParse(jsonData)
    if (!success || error)
      throw new Error(`Invalid file: ${file}. Error: ${JSON.stringify(error)}`)

    // Check if the address in the title matches the address in the body
    const fileNameAddress = path.basename(file, '.json')
    if (jsonData.address !== fileNameAddress)
      throw new Error(`Address mismatch in file: ${file}`)

    validators.push(validator)
  }
  const res = await Promise.allSettled(validators.map(validator => storeValidator(validator.address, validator, { upsert: true })))
  const errors = res.filter(r => r.status === 'rejected')
  if (errors.length > 0) {
    throw new Error(`There were errors while importing the validators: ${errors.map(e => e.reason)}`)
  }
}
