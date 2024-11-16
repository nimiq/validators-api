import type { NewValidator, Validator } from './drizzle'
import type { PayoutType, Result, ValidatorScore } from './types'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { consola } from 'consola'
import { desc, inArray, not } from 'drizzle-orm'
import { createIdenticon, getIdenticonsParams } from 'identicons-esm'
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
  rest: Omit<NewValidator, 'address' | 'icon' | 'accentColor'> & { icon?: string, accentColor?: string } = {},
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
      return { icon: rest.icon, accentColor: rest.accentColor! }
    }
    const icon = await createIdenticon(address, { format: 'image/svg+xml' })
    const { colors: { background: accentColor } } = await getIdenticonsParams(address)
    return { icon, accentColor }
  }

  const brandingParameters = await getBrandingParameters()
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

export interface FetchValidatorsOptions {
  payoutType?: PayoutType
  addresses?: string[]
  onlyKnown?: boolean
}

export async function fetchValidators({ payoutType, addresses = [], onlyKnown = false }: FetchValidatorsOptions): Result<Validator[]> {
  const filters = []
  if (payoutType)
    filters.push(eq(tables.validators.payoutType, payoutType))
  if (addresses?.length > 0)
    filters.push(inArray(tables.validators.address, addresses))
  if (onlyKnown)
    filters.push(not(eq(tables.validators.name, 'Unknown validator')))

  const validators = await useDrizzle()
    .select()
    .from(tables.validators)
    .where(and(...filters))
    .groupBy(tables.validators.id)
    .all()
  return { data: validators, error: undefined }
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
