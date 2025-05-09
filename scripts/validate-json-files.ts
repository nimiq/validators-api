import type { Result } from 'nimiq-validator-trustscore/types'
import type { ValidatorJSON } from '../server/utils/schemas'
import { execSync } from 'node:child_process'
import process from 'node:process'
import { consola } from 'consola'
import { importValidators } from '../server/utils/json-files'
import { validatorsSchema } from '../server/utils/schemas'

async function validateValidators(source: 'filesystem' | 'github', nimiqNetwork: string, gitBranch: string): Result<ValidatorJSON[]> {
  const [importOk, errorReading, validatorsData] = await importValidators(source, { nimiqNetwork, shouldStore: false, gitBranch })
  if (!importOk)
    return [false, errorReading, undefined]

  const { success, data: validators, error } = validatorsSchema.safeParse(validatorsData)
  if (!success || !validators || error)
    return [false, `Invalid validators data: ${error || 'Unknown error'}`, undefined]

  return [true, undefined, validators]
}

// get flag from --source. should be either 'filesystem' or 'github'
const args = process.argv.slice(2)
const source = args[0] || 'filesystem'
if (source !== 'filesystem' && source !== 'github') {
  consola.error('Invalid source. Use either "filesystem" or "github".')
  process.exit(1)
}

const gitBranch = execSync('git branch --show-current', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
if (!gitBranch) {
  consola.error('Unable to get git branch. Make sure you are in a git repository.')
  process.exit(1)
}

const [okMain, errorMain, validatorsMain] = await validateValidators(source, 'main-albatross', gitBranch)
if (!okMain) {
  consola.error(errorMain)
  process.exit(1)
}
consola.success(`The ${validatorsMain.length} validators for main-albatross are valid in ${source}!`)

const [okTest, errorTest, validatorsTest] = await validateValidators(source, 'test-albatross', gitBranch)
if (!okTest) {
  consola.error(errorTest)
  process.exit(1)
}
consola.success(`The ${validatorsTest.length} validators for test-albatross are valid in ${source}!`)
