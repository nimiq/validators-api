import type { Validator } from 'nimiq-rpc-client-ts'
import { getRpcClient } from '~~/server/lib/client'
import { mainQuerySchema } from '~~/server/utils/schemas'
import { fetchValidators } from '~~/server/utils/validators'

export default defineCachedEventHandler(async (event) => {
  const params = await getValidatedQuery(event, mainQuerySchema.parse)

  let addresses: string[] = []
  let activeValidators: Validator[] = []
  if (params['only-active']) {
    const { data: _activeValidators, error: errorActiveValidators } = await getRpcClient().blockchain.getActiveValidators()
    if (errorActiveValidators)
      return createError(errorActiveValidators)
    activeValidators = _activeValidators
    addresses = activeValidators.map(v => v.address)
  }

  let epochNumber = -1
  if (params['with-scores']) {
    const { data: currentEpoch, error: errorCurrentEpoch } = await getRpcClient().blockchain.getEpochNumber()
    if (errorCurrentEpoch)
      return createError(errorCurrentEpoch)
    epochNumber = currentEpoch - 1
  }

  const { data: validators, error: errorValidators } = await fetchValidators({ ...params, addresses, epochNumber })
  if (errorValidators || !validators)
    throw createError(errorValidators)

  return validators
}, {
  maxAge: import.meta.dev ? 1 : 60 * 10, // 10 minutes
})
