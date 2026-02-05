import type { Result } from 'nimiq-validator-trustscore/types'
import type { ValidatorJSON } from './schemas'
import { validatorSchema } from './schemas'
import { storeValidator } from './validators'

interface ImportValidatorsBundledOptions {
  shouldStore?: boolean
}

function normalizePath(value: string) {
  return value.replace(/\\/g, '/')
}

function extractNetworkFromPath(path: string) {
  const normalized = normalizePath(path)
  const match = normalized.match(/\/public\/validators\/([^/]+)\/[^/]+\.json$/)
  return match?.[1]
}

export async function importValidatorsBundled(nimiqNetwork?: string, options: ImportValidatorsBundledOptions = {}): Result<ValidatorJSON[]> {
  if (!nimiqNetwork)
    return [false, 'Nimiq network is required', undefined]

  const { shouldStore = true } = options
  const modules = import.meta.glob('../../public/validators/*/*.json', { eager: true, import: 'default' })

  const validators: ValidatorJSON[] = []
  for (const [path, mod] of Object.entries(modules)) {
    if (path.endsWith('.example.json'))
      continue

    const network = extractNetworkFromPath(path)
    if (network !== nimiqNetwork)
      continue

    const data = (mod as any)?.default ?? mod
    const parsed = validatorSchema.safeParse(data)
    if (!parsed.success) {
      return [false, `Invalid validator data at ${path}: ${parsed.error}`, undefined]
    }
    validators.push(parsed.data)
  }

  if (!shouldStore)
    return [true, undefined, validators]

  const results = await Promise.allSettled(validators.map(v => storeValidator(v.address, v, { upsert: true })))
  const failures = results.filter(r => r.status === 'rejected')
  if (failures.length > 0)
    return [false, `Errors importing validators: ${failures.map((f: any) => f.reason).join(', ')}`, undefined]

  return [true, undefined, validators]
}
