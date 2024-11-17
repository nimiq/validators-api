import type { ScoreValues } from '~~/packages/nimiq-validators-score/src'
import type { SQLWrapper } from 'drizzle-orm'
import type { NewValidator, Validator } from './drizzle'
import type { Result, ValidatorScore } from './types'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { consola } from 'consola'
import { desc, inArray, isNotNull } from 'drizzle-orm'
import { createIdenticon, getIdenticonsParams } from 'identicons-esm'
import { optimize } from 'svgo'
import { validatorSchema } from './schemas'

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

export async function storeValidator(
  address: string,
  rest: Omit<NewValidator, 'address' | 'icon' | 'accentColor' | 'hasDefaultIcon'> & { icon?: string, accentColor?: string } = {},
  options: StoreValidatorOptions = {},
): Promise<number | undefined> {
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
  if (validatorId && !upsert) {
    validators.set(address, validatorId)
    return validatorId
  }

  consola.info(`${upsert ? 'Updating' : 'Storing'} validator ${address}`)

  async function getBrandingParameters() {
    if (rest.icon) {
      // TODO Once the validators have accent colors, re-enable this check
      // if (!rest.accentColor)
      //   throw new Error(`The validator ${address} does have an icon but not an accent color`)
      if (rest.icon.startsWith('data:image/svg+xml')) {
        rest.icon = optimize(rest.icon, { plugins: [{ name: 'preset-default' }] }).data
      }
      return { icon: rest.icon, accentColor: rest.accentColor!, hasDefaultIcon: false }
    }
    const icon = await createIdenticon(address, { format: 'image/svg+xml' })
    const { colors: { background: accentColor } } = await getIdenticonsParams(address)
    return { icon, accentColor, hasDefaultIcon: true }
  }

  const brandingParameters = await getBrandingParameters()
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
      icon: tables.validators.icon,
      isMaintainedByNimiq: tables.validators.isMaintainedByNimiq,
      website: tables.validators.website,
      liveness: tables.scores.liveness,
      total: tables.scores.total,
      size: tables.scores.size,
      reliability: tables.scores.reliability,
    })
    .from(tables.validators)
    .leftJoin(tables.scores, eq(tables.validators.id, tables.scores.validatorId))
    .where(inArray(tables.validators.id, validatorIds))
    .groupBy(tables.validators.id)
    .orderBy(desc(tables.scores.total))
    .all() as ValidatorScore[]
  return { data: validators, error: undefined }
}

export type FetchValidatorsOptions = Zod.infer<typeof mainQuerySchema> & { addresses: string[], epochNumber?: number }

type FetchedValidator = Omit<Validator, 'icon' | 'contact'> & { icon?: string } & { score?: ScoreValues | null, sizeRatio?: number }

export async function fetchValidators(params: FetchValidatorsOptions): Result<FetchedValidator[]> {
  // This function is a mess. It should be refactored and create better API
  const { 'payout-type': payoutType, addresses = [], 'only-known': onlyKnown = false, 'with-identicons': withIdenticons = false, 'with-scores': withScores = false, epochNumber = -1 } = params
  const filters: SQLWrapper[] = [isNotNull(tables.scores.validatorId)]
  if (payoutType)
    filters.push(eq(tables.validators.payoutType, payoutType))
  if (addresses?.length > 0)
    filters.push(inArray(tables.validators.address, addresses))
  if (onlyKnown)
    filters.push(sql`lower(${tables.validators.name}) NOT LIKE lower('%Unknown validator%')`)

  const baseColumns = {
    id: tables.validators.id,
    name: tables.validators.name,
    address: tables.validators.address,
    fee: tables.validators.fee,
    payoutType: tables.validators.payoutType,
    payoutSchedule: tables.validators.payoutSchedule,
    description: tables.validators.description,
    icon: tables.validators.icon,
    accentColor: tables.validators.accentColor,
    isMaintainedByNimiq: tables.validators.isMaintainedByNimiq,
    hasDefaultIcon: tables.validators.hasDefaultIcon,
    website: tables.validators.website,
  }

  const columns = withScores
    ? {
        ...baseColumns,
        sizeRatio: tables.activity.sizeRatio,
        score: {
          liveness: tables.scores.liveness,
          total: tables.scores.total,
          size: tables.scores.size,
          reliability: tables.scores.reliability,
        },
      }
    : baseColumns

  try {
    let query = useDrizzle().select(columns).from(tables.validators).where(and(...filters)).$dynamic()

    if (withScores) {
      consola.info(`Fetching validators with scores for epoch ${epochNumber}`)
      query = query
        .leftJoin(tables.scores, eq(tables.validators.id, tables.scores.validatorId))
        .leftJoin(tables.activity, and(eq(tables.validators.id, tables.activity.validatorId), eq(tables.activity.epochNumber, epochNumber)))
    }

    const validators = await query.orderBy(desc(tables.scores.total)).all() satisfies FetchedValidator[] as FetchedValidator[]

    if (!withIdenticons)
      validators.filter(v => v.hasDefaultIcon).forEach(v => delete v.icon)

    return { data: transformNullToUndefined(validators), error: undefined }
  }
  catch (error) {
    consola.error(`Error fetching validators: ${error}`)
    return { data: undefined, error: JSON.stringify(error) }
  }
}

function transformNullToUndefined<T>(data: T): T {
  if (Array.isArray(data)) {
    return data.map((item) => {
      if (typeof item === 'object' && item !== null) {
        return transformNullToUndefined(item)
      }
      return item === null ? undefined : item
    }) as T
  }

  if (typeof data === 'object' && data !== null) {
    const entries = Object.entries(data).map(([key, value]) => {
      if (value === null) {
        return [key, undefined]
      }
      if (typeof value === 'object' && value !== null) {
        return [key, transformNullToUndefined(value)]
      }
      return [key, value]
    })
    return Object.fromEntries(entries) as T
  }

  return data
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
    const jsonData = JSON.parse(fileContent)
    const { success, data: validator, error } = validatorSchema.safeParse(jsonData)
    if (!success || error)
      throw new Error(`Invalid file: ${file}. Error: ${JSON.stringify(error)}`)

    // Check if the address in the title matches the address in the body
    const fileNameAddress = path.basename(file, '.json')
    if (jsonData.address !== fileNameAddress)
      throw new Error(`Address mismatch in file: ${file}`)

    validators.push(validator)
  }
  await Promise.allSettled(validators.map(validator => storeValidator(validator.address, validator, { upsert: true })))
}
