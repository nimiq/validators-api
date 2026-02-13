import type { Result } from 'nimiq-validator-trustscore/types'
import type { ValidatorJSON } from './schemas'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { validatorSchema } from './schemas'
import { storeValidator } from './validators'

interface ImportValidatorsBundledOptions {
  shouldStore?: boolean
}

// In dev, Nitro's asset storage doesn't enumerate files via getKeys().
// We list them from the filesystem and then read via storage.
function getValidatorKeys(nimiqNetwork: string): string[] {
  if (import.meta.dev) {
    try {
      const dir = join(process.cwd(), 'server', 'assets', 'validators', nimiqNetwork)
      return readdirSync(dir)
        .filter(f => f.endsWith('.json') && !f.endsWith('.example.json'))
        .map(f => `${nimiqNetwork}:${f}`)
    }
    catch { return [] }
  }
  return []
}

export async function importValidatorsBundled(nimiqNetwork?: string, options: ImportValidatorsBundledOptions = {}): Result<ValidatorJSON[]> {
  if (!nimiqNetwork)
    return [false, 'Nimiq network is required', undefined]

  const { shouldStore = true } = options
  const storage = useStorage('assets:server:validators')

  // Try storage getKeys first (works in production), fall back to filesystem (dev)
  let keys = await storage.getKeys(`${nimiqNetwork}`)
  if (keys.length === 0)
    keys = getValidatorKeys(nimiqNetwork)

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
