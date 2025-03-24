import type { Range } from 'nimiq-validators-trustscore'
import { getRpcClient } from '~~/server/lib/client'
import { mainQuerySchema } from '~~/server/utils/schemas'
import { fetchValidators } from '~~/server/utils/validators'
import { consola } from 'consola'
import { getRange } from 'nimiq-validators-trustscore'

export default defineCachedEventHandler(async (event) => {
  const params = await getValidatedQuery(event, mainQuerySchema.parse)

  // If there is no connection to the server, we will return an error
  let range: Range
  try {
    range = await getRange(getRpcClient())
  }
  catch (e) {
    return createError(JSON.stringify(e))
  }

  let epochNumber = 1

  const { data: _activeValidators, error: errorActiveValidators } = await getRpcClient().blockchain.getActiveValidators()
  if (errorActiveValidators)
    return createError(errorActiveValidators)
  const activeValidators = _activeValidators

  const hasMissingScores = await Promise
    .all(activeValidators.map(({ address }) => checkIfScoreExistsInDb(range, address)))
    .then(scores => scores.every(s => s === true))
  if (hasMissingScores) {
    const { data, error } = await calculateScores(range)
    if (!data || error)
      consola.warn(`Error calculating scores for range ${JSON.stringify(range)}`, error)
  }

  const { data, error: errorEpochNumber } = await getRpcClient().blockchain.getEpochNumber()
  if (errorEpochNumber || !data)
    throw createError(errorEpochNumber || 'Epoch number not found')
  epochNumber = data - 1

  const { data: validators, error: errorValidators } = await fetchValidators({ ...params, epochNumber })
  if (errorValidators || !validators)
    throw createError(errorValidators)

  return validators
}, {
  maxAge: import.meta.dev ? 1 : 60 * 10, // 10 minutes
  name: 'validators',
})
