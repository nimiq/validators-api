import type { Result } from 'nimiq-validator-trustscore/types'
import type { ValidatorJSON } from './schemas'
import { validatorSchema } from './schemas'
import { storeValidator } from './validators'

interface ImportValidatorsBundledOptions {
  shouldStore?: boolean
}

export async function importValidatorsBundled(nimiqNetwork?: string, options: ImportValidatorsBundledOptions = {}): Result<ValidatorJSON[]> {
  if (!nimiqNetwork)
    return [false, 'Nimiq network is required', undefined]

  const { shouldStore = true } = options
  const storage = useStorage('assets:public')
  const keys = await storage.getKeys(`validators/${nimiqNetwork}`)

  const validators: ValidatorJSON[] = []
  for (const key of keys) {
    if (!key.endsWith('.json') || key.endsWith('.example.json'))
      continue

    const data = await storage.getItem(key)
    const parsed = validatorSchema.safeParse(data)
    if (!parsed.success)
      return [false, `Invalid validator data at ${key}: ${parsed.error}`, undefined]
    validators.push(parsed.data)
  }

  if (!shouldStore)
    return [true, undefined, validators]

  if (validators.length === 0)
    return [false, `No bundled validators found for network: ${nimiqNetwork}`, undefined]

  const results = await Promise.allSettled(validators.map(v => storeValidator(v.address, v, { upsert: true })))
  const failures = results.filter(r => r.status === 'rejected')
  if (failures.length > 0)
    return [false, `Errors importing validators: ${failures.map((f: any) => f.reason).join(', ')}`, undefined]

  return [true, undefined, validators]
}
