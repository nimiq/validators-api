import type { Result } from 'nimiq-validator-trustscore/types'
import type { ValidatorJSON } from '../server/utils/schemas'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { consola } from 'consola'
import { dirname, join, resolve } from 'pathe'
import { importValidatorsFromFiles } from '../server/utils/json-files'
import { validatorsSchema } from '../server/utils/schemas'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '../')

async function validateValidators(network: string): Result<ValidatorJSON[]> {
  const validatorsPath = join(PROJECT_ROOT, `public/validators/${network}`)
  const [importOk, errorReading, validatorsData] = await importValidatorsFromFiles(validatorsPath)
  if (!importOk)
    return [false, errorReading, undefined]

  const { success, data: validators, error } = validatorsSchema.safeParse(validatorsData)
  if (!success || !validators || error)
    return [false, `Invalid validators data: ${error || 'Unknown error'}`, undefined]

  return [true, undefined, validators]
}

const [okMain, errorMain, validatorsMain] = await validateValidators('main-albatross')
if (!okMain) {
  consola.error(errorMain)
  process.exit(1)
}
consola.success(`The ${validatorsMain.length} validators for main-albatross are valid!`)

const [okTest, errorTest, validatorsTest] = await validateValidators('test-albatross')
if (!okTest) {
  consola.error(errorTest)
  process.exit(1)
}
consola.success(`The ${validatorsTest.length} validators for test-albatross are valid!`)
