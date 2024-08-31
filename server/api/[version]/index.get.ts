import { mainQuerySchema } from '../../utils/schemas'
import { fetchValidators } from '../../utils/validators'
import { getRpcClient } from '~~/server/lib/client'

export default defineEventHandler(async (event) => {
  const { onlyPools, onlyActive } = await getValidatedQuery(event, mainQuerySchema.parse)

  if (!onlyActive)
    return await fetchValidators({ onlyPools })

  const { data: activeValidators, error: errorActiveValidators } = await getRpcClient().blockchain.getActiveValidators()
  if (errorActiveValidators)
    return createError(errorActiveValidators)
  const { data: validators, error: errorValidators } = await fetchValidators({ onlyPools, addresses: activeValidators.map(v => v.address) })
  if (errorValidators || !validators)
    return createError(errorValidators)

  for (const validator of validators) {
    // @ts-expect-error this is a hack to add the balance to the validator object
    // A better solution would be to add a balance field to the Validator type
    // and update the fetchValidators function to include the balance
    validator.balance = activeValidators.find(v => v.address === validator.address)?.balance
  }

  return validators
})
