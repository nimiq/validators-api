import type { SQLWrapper } from 'drizzle-orm'
import type { Validator } from './drizzle'
import type { ValidatorJSON } from './schemas'
import type { Result, ValidatorScore } from './types'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { consola } from 'consola'
import { desc, inArray, isNotNull } from 'drizzle-orm'
import { handleValidatorLogo } from './logo'
import { defaultValidatorJSON, validatorSchema } from './schemas'

/**
 * Given a list of validator addresses, it returns the addresses that are missing in the database.
 * This is useful when we are fetching the activity for a range of epochs and we need to check if the validators are already in the database.
 * They should be present in the database because the fetch function needs to be run in order to compute the score.
 */
export async function findMissingValidators(addresses: string[]) {
  const existingAddresses = await useDrizzle()
    .select({ address: tables.validators.address })
    .from(tables.validators)
    .where(inArray(tables.validators.address, addresses))
    .execute()
    .then(r => r.map(r => r.address))

  const missingAddresses = addresses.filter(a => !existingAddresses.includes(a))
  return missingAddresses
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

export type FetchValidatorsOptions = Zod.infer<typeof mainQuerySchema> & { addresses: string[], epochNumber: number }

type FetchedValidator = Omit<Validator, 'logo' | 'contact'> & {
  logo?: string
  score?: { total: number | null, availability: number | null, reliability: number | null, dominance: number | null }
  dominanceRatioViaBalance?: number
  dominanceRatioViaSlots?: number
}

export async function fetchValidators(params: FetchValidatorsOptions): Result<FetchedValidator[]> {
  const { 'payout-type': payoutType, addresses = [], 'only-known': onlyKnown = false, 'with-identicons': withIdenticons = false, epochNumber } = params

  const filters: SQLWrapper[] = []
  if (payoutType)
    filters.push(eq(tables.validators.payoutType, payoutType))
  if (addresses?.length > 0)
    filters.push(inArray(tables.validators.address, addresses))
  if (onlyKnown)
    filters.push(sql`lower(${tables.validators.name}) NOT LIKE lower('%Unknown validator%')`)

  try {
    const validators = await useDrizzle()
      .select({
        id: tables.validators.id,
        name: tables.validators.name,
        address: tables.validators.address,
        description: tables.validators.description,
        fee: tables.validators.fee,
        payoutType: tables.validators.payoutType,
        payoutSchedule: tables.validators.payoutSchedule,
        isMaintainedByNimiq: tables.validators.isMaintainedByNimiq,
        website: tables.validators.website,
        logo: tables.validators.logo,
        logoPath: tables.validators.logo,
        hasDefaultLogo: tables.validators.hasDefaultLogo,
        accentColor: tables.validators.accentColor,
        dominanceRatioViaBalance: tables.activity.dominanceRatioViaBalance,
        dominanceRatioViaSlots: tables.activity.dominanceRatioViaSlots,
        score: {
          total: tables.scores.total,
          availability: tables.scores.availability,
          reliability: tables.scores.reliability,
          dominance: tables.scores.dominance,
        },
      })
      .from(tables.validators)
      .where(and(...filters))
      .leftJoin(
        tables.scores,
        and(
          eq(tables.validators.id, tables.scores.validatorId),
          eq(tables.scores.epochNumber, epochNumber),
          isNotNull(tables.scores.total),
        ),
      )
      .leftJoin(
        tables.activity,
        and(
          eq(tables.validators.id, tables.activity.validatorId),
          eq(tables.activity.epochNumber, epochNumber),
        ),
      )
      // .orderBy(desc(tables.scores.total))
      .all() as FetchedValidator[]

    if (!withIdenticons)
      validators.filter(v => v.hasDefaultLogo).forEach(v => delete v.logo)

    // Don't return score if any of the values not [0, 1]
    validators.forEach((v) => {
      if (!v.score)
        return
      if ((v.score.dominance === null && v.score.dominance! < 0) || (v.score.reliability === null && v.score.reliability! < 0) || (v.score.availability === null && v.score.availability! < 0)) {
        v.score.total = null
      }
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
