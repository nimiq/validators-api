import type { Result } from 'nimiq-validator-trustscore/types'
import { validatorsSchema, type ValidatorJSON } from '../server/utils/schemas'
import { execSync } from 'node:child_process'
import process from 'node:process'
import { consola } from 'consola'
import { importValidators } from '../server/utils/json-files'

interface ValidationErrorDetails {
  validatorIndex: number
  field: string
  value: any
  message: string
  path: (string | number)[]
}

function formatValidationErrors(error: any): ValidationErrorDetails[] {
  if (!error?.issues)
    return []

  return error.issues.map((issue: any) => {
    const validatorIndex = (issue.path?.[0] ?? -1) as number
    const field = issue.path?.slice(1).join('.') || 'root'

    return {
      validatorIndex,
      field,
      value: issue.input,
      message: issue.message || 'Unknown validation error',
      path: issue.path || [],
    }
  })
}

function logValidationErrors(errors: ValidationErrorDetails[], source: string, network: string) {
  consola.error(`\n❌ Validation failed for ${network} validators from ${source}:\n`)

  // Group errors by validator index
  const errorsByValidator = errors.reduce((acc, error) => {
    if (!acc[error.validatorIndex]) {
      acc[error.validatorIndex] = []
    }
    acc[error.validatorIndex]!.push(error)
    return acc
  }, {} as Record<number, ValidationErrorDetails[]>)

  Object.entries(errorsByValidator).forEach(([index, validatorErrors]) => {
    consola.error(`🔴 Validator #${index}:`)
    validatorErrors.forEach((error) => {
      const valueStr = error.value !== undefined
        ? `"${String(error.value).substring(0, 100)}${String(error.value).length > 100 ? '...' : ''}"`
        : 'undefined'

      consola.error(`   └─ ${error.field}: ${error.message}`)
      if (error.value !== undefined) {
        consola.error(`      Current value: ${valueStr}`)
      }
    })
    consola.error('') // Empty line between validators
  })

  consola.info(`\n💡 Tips for fixing these errors:`)

  const uniqueFields = [...new Set(errors.map(e => e.field))]
  if (uniqueFields.includes('address')) {
    consola.info(`   • Nimiq addresses should follow format: "NQ## #### #### #### #### #### #### #### ####"`)
  }
  if (uniqueFields.includes('logo')) {
    consola.info(`   • Logos should be data URLs starting with "data:image/png,", "data:image/svg+xml," or "data:image/webp,"`)
  }
  if (uniqueFields.some(f => f.includes('contact'))) {
    consola.info(`   • Social media handles should not include '@' symbol or should follow platform-specific format rules`)
  }
  if (uniqueFields.includes('website')) {
    consola.info(`   • Websites must be valid URLs starting with http:// or https://`)
  }
}

async function validateValidators(source: 'filesystem' | 'github', nimiqNetwork: string, gitBranch: string): Result<ValidatorJSON[]> {
  const [importOk, errorReading, _validators] = await importValidators(source, { nimiqNetwork, shouldStore: false, gitBranch })
  if (!importOk)
    return [false, errorReading, undefined]

  const result = validatorsSchema.safeParse(_validators)
  if (!result.success) {
    const errors = formatValidationErrors(result.error)
    logValidationErrors(errors, source, nimiqNetwork)
    return [false, `Found ${errors.length} validation error(s)`, undefined]
  }

  return [true, undefined, result.data]
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
}
catch {
  // Fallback for GitHub Actions - git command might fail in detached HEAD state
  consola.warn('Unable to get current branch from git command, trying environment variables...')
}

// If git command failed or returned empty, try GitHub Actions environment variables
if (!gitBranch) {
  // For pull requests, use the head ref (source branch)
  gitBranch = process.env.GITHUB_HEAD_REF
  // For pushes, use the ref name
    || process.env.GITHUB_REF_NAME
  // Last resort: use the commit SHA
    || process.env.GITHUB_SHA
    || ''
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
consola.success(`✅ All ${validatorsMain.length} validators for main-albatross are valid in ${source}!`)

const [okTest, errorTest, validatorsTest] = await validateValidators(source, 'test-albatross', gitBranch)
if (!okTest) {
  consola.error(errorTest)
  process.exit(1)
}
consola.success(`✅ All ${validatorsTest.length} validators for test-albatross are valid in ${source}!`)
