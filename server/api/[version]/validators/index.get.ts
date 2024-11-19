import type { Validator } from 'nimiq-rpc-client-ts'
import { getRpcClient } from '~~/server/lib/client'
import { mainQuerySchema } from '~~/server/utils/schemas'
import { fetchValidators } from '~~/server/utils/validators'
import { consola } from 'consola'
import { getRange } from 'nimiq-validators-trustscore'

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

  const range = await getRange(getRpcClient())
  if (!(await checkIfScoreExistsInDb(range))) {
    const { data, error } = await calculateScores(range)
    if (!data || error)
      consola.warn(`Error calculating scores for range ${range}`, error)
  }

  const { data: validators, error: errorValidators } = await fetchValidators({ ...params, addresses })
  if (errorValidators || !validators)
    throw createError(errorValidators)

  return validators
}, {
  maxAge: import.meta.dev ? 0 : 60 * 10, // 10 minutes
})
