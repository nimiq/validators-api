import type { Result } from 'nimiq-validator-trustscore/types'
import type { ValidatorJSON } from './schemas'
import { bundledValidatorsByNetwork } from '../generated/validators-bundle.generated'
import { validatorSchema } from './schemas'
import { getUnlistedAddresses } from './validator-listing'

interface ImportValidatorsBundledOptions {
  shouldStore?: boolean
}

export async function importValidatorsBundled(nimiqNetwork?: string, options: ImportValidatorsBundledOptions = {}): Result<ValidatorJSON[]> {
  if (!nimiqNetwork)
    return [false, 'Nimiq network is required', undefined]

  const { shouldStore = true } = options
  const bundledValidators = bundledValidatorsByNetwork[nimiqNetwork as keyof typeof bundledValidatorsByNetwork]
  if (!bundledValidators || bundledValidators.length === 0)
    return [false, `No bundled validators found for network: ${nimiqNetwork}`, undefined]

  const validators: ValidatorJSON[] = []
  for (const data of bundledValidators) {
    const parsed = validatorSchema.safeParse(data)
    if (!parsed.success)
      return [false, `Invalid bundled validator data: ${parsed.error}`, undefined]
    validators.push(parsed.data)
  }

  if (!shouldStore)
    return [true, undefined, validators]

  const nimiqpoolesAddress = 'NQ08 RS08 LTKL 62QL B954 S9YP 0G3R XVKM RU2Y'

  const { getStoredValidatorsAddress, markValidatorsAsUnlisted, storeValidator } = await import('./validators')
  const bundledAddresses = new Set(validators.map(v => v.address))
  if (bundledAddresses.has(nimiqpoolesAddress)) {
    console.warn(`bundledAddresses has RU2Y`)
  }
  else {
    console.warn(`bundledAddresses does not have RU2Y`)
  }
  const storedAddresses = await getStoredValidatorsAddress()
  if (storedAddresses.includes(nimiqpoolesAddress)) {
    console.warn(`storedAddresses has RU2Y`)
  }
  else {
    console.warn(`storedAddresses does not have RU2Y`)
  }
  const unlistedAddresses = getUnlistedAddresses(storedAddresses, bundledAddresses)
  if (unlistedAddresses.includes(nimiqpoolesAddress)) {
    console.warn(`unlistedAddresses has RU2Y`)
  }
  else {
    console.warn(`unlistedAddresses does not have RU2Y`)
  }

  const results = await Promise.allSettled(validators.map(v => storeValidator(v.address, v, { upsert: true, isListed: true })))
  const failures = results.filter(r => r.status === 'rejected')
  if (failures.length > 0)
    return [false, `Errors importing validators: ${failures.map((f: any) => f.reason).join(', ')}`, undefined]

  await markValidatorsAsUnlisted(unlistedAddresses)

  return [true, undefined, validators]
}
