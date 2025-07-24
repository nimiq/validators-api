import type { Result } from 'nimiq-validator-trustscore/types'
import type { ValidatorJSON } from '../server/utils/schemas'
import { execSync } from 'node:child_process'
import process from 'node:process'
import { consola } from 'consola'
import { importValidators } from '../server/utils/json-files'

async function validateValidators(source: 'filesystem' | 'github', nimiqNetwork: string, gitBranch: string): Result<ValidatorJSON[]> {
  const [importOk, errorReading, validators] = await importValidators(source, { nimiqNetwork, shouldStore: false, gitBranch })
  if (!importOk)
    return [false, errorReading, undefined]
  return [true, undefined, validators]
}

// get flag from --source. should be either 'filesystem' or 'github'
const args = process.argv.slice(2)
const source = args[0] || 'filesystem'
if (source !== 'filesystem' && source !== 'github') {
  consola.error('Invalid source. Use either "filesystem" or "github".')
  process.exit(1)
}
consola.info(`Validating validators from ${source}...`)

// Try to get git branch, with fallbacks for GitHub Actions environment
let gitBranch: string = ''

try {
  gitBranch = execSync('git branch --show-current', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
} catch (error) {
  // Fallback for GitHub Actions - git command might fail in detached HEAD state
  consola.warn('Unable to get current branch from git command, trying environment variables...')
}

// If git command failed or returned empty, try GitHub Actions environment variables
if (!gitBranch) {
  // For pull requests, use the head ref (source branch)
  gitBranch = process.env.GITHUB_HEAD_REF || 
              // For pushes, use the ref name  
              process.env.GITHUB_REF_NAME ||
              // Last resort: use the commit SHA
              process.env.GITHUB_SHA ||
              ''
}

if (!gitBranch) {
  consola.error('Unable to determine git branch or commit reference. Make sure you are in a git repository or running in a GitHub Actions environment.')
  process.exit(1)
}

consola.info(`Using git reference: ${gitBranch}`)

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
