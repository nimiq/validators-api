import type { Validator } from 'nimiq-rpc-client-ts'
import { mainQuerySchema } from '../../utils/schemas'
import { fetchValidators } from '../../utils/validators'
import { getRpcClient } from '~~/server/lib/client'

export default defineEventHandler(async (event) => {
  const { pools, active } = await getValidatedQuery(event, mainQuerySchema.parse)

  let addresses: string[] = []
  let activeValidators: Validator[] = []
  if (active) {
    const { data: _activeValidators, error: errorActiveValidators } = await getRpcClient().blockchain.getActiveValidators()
    if (errorActiveValidators)
      return createError(errorActiveValidators)
    activeValidators = _activeValidators
    addresses = activeValidators.map(v => v.address)
  }

  const { data: validators, error: errorValidators } = await fetchValidators({ pools, addresses })
  if (errorValidators || !validators)
    return createError(errorValidators)

  for (const validator of validators) {
    // @ts-expect-error this is a hack to add the balance to the validator object
    // A better solution would be to add a balance field to the Validator type
    // and update the fetchValidators function to include the balance
    validator.balance = activeValidators.find(v => v.address === validator.address)?.balance
  }
  // @ts-expect-error this is a hack to sort the validators by balance
  validators.sort((a, b) => b.balance - a.balance)

  return validators
})
