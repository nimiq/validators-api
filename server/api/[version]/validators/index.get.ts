import type { MainQuerySchema } from '~~/server/utils/schemas'
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
    return err(`Failed to get range from RPC client: ${JSON.stringify(e)}`)
  }

  const { data: _activeValidators, error: errorActiveValidators } = await getRpcClient().blockchain.getActiveValidators()
  if (errorActiveValidators)
    return err(`Failed to get active validators: ${JSON.stringify(errorActiveValidators)}`)
  const activeValidators = _activeValidators

  try {
    const hasMissingScores = await Promise
      .all(activeValidators.map(({ address }) => checkIfScoreExistsInDb(range, address)))
      .then(scores => scores.includes(false))

    if (hasMissingScores) {
      consola.info('Detected missing scores, calculating scores for active validators...')
      const { data, error } = await calculateScores(range)
      if (!data || error)
        return err(`Error calculating scores for range ${JSON.stringify(range)}: ${error}`)

      // Allow a brief moment for database operations to complete if needed
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  catch (e) {
    return err(`Error checking or calculating scores: ${JSON.stringify(e)}`)
  }

  const { data: validators, error: errorValidators } = await fetchValidators({ ...params, epochNumber: range.toEpoch })
  if (errorValidators || !validators)
    return err(`Failed to fetch validators: ${JSON.stringify(errorValidators)}`)

  // TODO: Check if we can have undefined scores in the database
  // If there is a missing score, we will return an error
  if (validators.length > 0 && validators.some(v => v.score === undefined)) {
    const missingScores = validators.filter(v => v.score === undefined)
    return err(`[${new Date().toISOString()}] Missing scores for validators: ${missingScores.map(v => v.address).join(', ')}`)
  }

  return validators
}, {
  maxAge: import.meta.dev ? 1 : 60 * 10, // 10 minutes
  getKey(event) {
    const { 'only-known': onlyKnown, 'with-identicons': withIdenticons, force, 'payout-type': payoutType } = getQuery<MainQuerySchema>(event)
    return `validators:${onlyKnown}:${withIdenticons}:${force}:${payoutType}`
  },
})

function err(message: string, status = 500) {
  consola.error(message)
  return createError({ message, status })
}
