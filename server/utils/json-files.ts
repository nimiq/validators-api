import type { Result } from 'nimiq-validator-trustscore/types'
import type { ValidatorJSON } from './schemas'
import { readdir, readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { join } from 'pathe'
import { validatorSchema } from './schemas'

/**
 * Import validators from a folder containing .json files.
 * Used by the validation script to check files on disk.
 */
export async function importValidators(nimiqNetwork: string): Result<ValidatorJSON[]> {
  if (!nimiqNetwork)
    return [false, 'Nimiq network is required', undefined]

  const folderPath = `public/validators/${nimiqNetwork}`
  const allFiles = await readdir(folderPath)
  const files = allFiles
    .filter(f => extname(f) === '.json')
    .filter(f => !f.endsWith('.example.json'))

  const validators: ValidatorJSON[] = []
  for (const file of files) {
    const filePath = join(folderPath, file)
    const fileContent = await readFile(filePath, 'utf8')

    let raw: unknown
    try {
      raw = JSON.parse(fileContent)
    }
    catch (error) {
      return [false, `Invalid JSON in file: ${file}. Error: ${error}`, undefined]
    }

    const parsed = validatorSchema.safeParse(raw)
    if (!parsed.success)
      return [false, `Invalid validator ${file}: ${parsed.error}`, undefined]
    validators.push(parsed.data)
  }

  return [true, undefined, validators]
}
