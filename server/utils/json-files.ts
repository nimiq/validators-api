import type { Result } from 'nimiq-validator-trustscore/types'
import type { ValidatorJSON } from './schemas'
import { readdir, readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import process from 'node:process'
import { consola } from 'consola'
import { $fetch } from 'ofetch'
import { join } from 'pathe'
import { validatorSchema } from './schemas'
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
 * Import validators from GitHub using the official GitHub REST API.
 */
async function importValidatorsFromGitHub(path: string, { gitBranch }: Pick<ImportValidatorsFromFilesOptions, 'gitBranch'>): Result<any[]> {
  // Default to main branch if not specified
  const branch = gitBranch || 'main'

  // Check if running in a fork PR (GitHub Actions sets GITHUB_HEAD_REPOSITORY)
  const headRepo = process.env.GITHUB_HEAD_REPOSITORY // format: "owner/repo"
  const baseRepo = process.env.GITHUB_REPOSITORY || 'nimiq/validators-api'

  // Use head repo if it's different from base (fork PR scenario)
  const [owner, repo] = (headRepo && headRepo !== baseRepo ? headRepo : baseRepo).split('/')

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`

  // 1. List directory contents
  let listing: Array<{
    name: string
    path: string
    type: 'file' | 'dir'
    download_url: string
  }>

  const headers: HeadersInit = { 'User-Agent': 'request' }
  try {
    listing = await $fetch(apiUrl, { headers })
  }
  catch (e) {
    consola.warn(`Error listing validators folder on GitHub: ${e}`)
    return [false, `Could not list validators on GitHub ${apiUrl} | ${e}`, undefined]
  }

  // 2. Filter only .json files (skip .example.json)
  const jsonFiles = listing.filter(file =>
    file.type === 'file'
    && file.name.endsWith('.json')
    && !file.name.endsWith('.example.json'),
  )

  // 3. Fetch each file’s raw contents
  const rawContents = await Promise.all(jsonFiles.map(async (file) => {
    try {
      return await $fetch<string>(file.download_url, { headers })
    }
    catch (e) {
      consola.warn(`Failed to download ${file.path}: ${e}`)
      return [false, `Failed to download ${file.path}: ${e}`, undefined]
    }
  }))

  // 4. Parse JSON and return
  const parsed = rawContents.filter((c): c is string => Boolean(c)).map(c => JSON.parse(c!))

  return [true, undefined, parsed]
}

interface ImportValidatorsFromFilesOptions {
  nimiqNetwork?: string
  gitBranch?: string
  shouldStore?: boolean
}

/**
 * Import validators from either the filesystem or GitHub, then validate & store.
 */
export async function importValidators(source: 'filesystem' | 'github', options: ImportValidatorsFromFilesOptions = {}): Result<ValidatorJSON[]> {
  const { nimiqNetwork, shouldStore = true, gitBranch } = options
  if (!nimiqNetwork)
    return [false, 'Nimiq network is required', undefined]

  const path = `public/validators/${nimiqNetwork}`

  const [ok, readError, data] = source === 'filesystem'
    ? await importValidatorsFromFiles(path)
    : await importValidatorsFromGitHub(path, { gitBranch })

  if (!ok)
    return [false, readError, undefined]

  const validators: ValidatorJSON[] = []
  for (const validator of data) {
    const { data, success, error } = validatorSchema.safeParse(validator)
    if (!success)
      return [false, `Invalid validator ${validator.name}(${validator.address}) data: ${error || 'Unknown error'}. ${JSON.stringify({ path, gitBranch, source })}`, undefined]
    validators.push(data)
  }

  if (!shouldStore)
    return [true, undefined, validators]

  const results = await Promise.allSettled(validators.map(v => storeValidator(v.address, v, { upsert: true })))
  const failures = results.filter(r => r.status === 'rejected')
  if (failures.length > 0)
    return [false, `Errors importing validators: ${failures.map((f: any) => f.reason).join(', ')}`, undefined]

  return [true, undefined, validators]
}
