import type { Result } from 'nimiq-validator-trustscore/types'
import type { ValidatorJSON } from '../server/utils/schemas'
import process from 'node:process'
import { consola } from 'consola'
import { importValidators } from '../server/utils/json-files'
import { validatorsSchema } from '../server/utils/schemas'

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

function logValidationErrors(errors: ValidationErrorDetails[], network: string) {
  consola.error(`\n❌ Validation failed for ${network} validators:\n`)

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
    consola.error('')
  })

  consola.info(`\n💡 Tips for fixing these errors:`)

  const uniqueFields = [...new Set(errors.map(e => e.field))]
  if (uniqueFields.includes('address'))
    consola.info(`   • Nimiq addresses should follow format: "NQ## #### #### #### #### #### #### #### ####"`)
  if (uniqueFields.includes('logo'))
    consola.info(`   • Logos should be data URLs starting with "data:image/png,", "data:image/svg+xml," or "data:image/webp,"`)
  if (uniqueFields.some(f => f.includes('contact')))
    consola.info(`   • Social media handles should not include '@' symbol or should follow platform-specific format rules`)
  if (uniqueFields.includes('website'))
    consola.info(`   • Websites must be valid URLs starting with http:// or https://`)
}

async function validateValidators(nimiqNetwork: string): Result<ValidatorJSON[]> {
  const [importOk, errorReading, _validators] = await importValidators(nimiqNetwork)
  if (!importOk)
    return [false, errorReading, undefined]

  const result = validatorsSchema.safeParse(_validators)
  if (!result.success) {
    const errors = formatValidationErrors(result.error)
    logValidationErrors(errors, nimiqNetwork)
    return [false, `Found ${errors.length} validation error(s)`, undefined]
  }

  return [true, undefined, result.data]
}

const [okMain, errorMain, validatorsMain] = await validateValidators('main-albatross')
if (!okMain) {
  consola.error(errorMain)
  process.exit(1)
}
consola.success(`✅ All ${validatorsMain.length} validators for main-albatross are valid!`)

const [okTest, errorTest, validatorsTest] = await validateValidators('test-albatross')
if (!okTest) {
  consola.error(errorTest)
  process.exit(1)
}
consola.success(`✅ All ${validatorsTest.length} validators for test-albatross are valid!`)
