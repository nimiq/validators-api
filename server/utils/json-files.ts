import type { Result } from 'nimiq-validator-trustscore/types'
import type { ValidatorJSON } from './schemas'
import { readdir, readFile } from 'node:fs/promises'
import { consola } from 'consola'
import { extname, join } from 'pathe'
import { validatorsSchema } from './schemas'

/**
 * Import validators from a folder containing .json files.
 *
 * This function is expected to be used when initializing the database with validators, so it will throw
 * an error if the files are not valid and the program should stop.
 */
export async function importValidatorsFromFiles(folderPath: string): Result<any[]> {
  const allFiles = await readdir(folderPath)
  const files = allFiles
    .filter(f => extname(f) === '.json')
    .filter(f => !f.endsWith('.example.json'))

  const rawValidators: any[] = []
  for (const file of files) {
    const filePath = join(folderPath, file)
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
