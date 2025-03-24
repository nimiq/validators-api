import type { EventHandlerRequest, H3Event } from 'h3'
import type { NimiqRPCClient } from 'nimiq-rpc-client-ts'
import type { Range } from 'nimiq-validator-trustscore/types'
import type { Result } from './types'
import { consola } from 'consola'
import { getRange } from 'nimiq-validator-trustscore/utils'
import { rangeQuerySchema } from './schemas'

/**
 * To compute the score for a validator for a given range, it is mandatory that we have the activity for that validator
 * in the last epoch of the range. If we don't have the activity for that epoch, we can't compute the score.
 * Instead of throwing an error, we will modify the range so the last epoch is the last epoch where we have activity.
 */
// export async function adjustRangeForAvailableData(expectedRange: Range): Result<Range> {
//   const highestScoreEpoch = await useDrizzle()
//     .select({ toEpoch: max(tables.scores.toEpoch) })
//     .from(tables.scores)
//     .where(and(
//       gte(tables.scores.fromEpoch, expectedRange.fromEpoch),
//       lte(tables.scores.toEpoch, expectedRange.toEpoch),
//     ))
//     .get()
//     .then(r => r?.toEpoch)
//   consola.info({ highestScoreEpoch })
//   if (!highestScoreEpoch)
//     return { error: `No scores found between epochs ${expectedRange.fromEpoch} and ${expectedRange.toEpoch}. Run the fetch task first.`, data: undefined }

//   const toEpoch = Math.min(highestScoreEpoch, expectedRange.toEpoch)
//   const toBlockNumber = expectedRange.epochIndexToBlockNumber(toEpoch)
//   const range: Range = { ...expectedRange, toEpoch, toBlockNumber }
//   return { data: range, error: undefined }
// }

export async function extractRangeFromRequest(rpcClient: NimiqRPCClient, event: H3Event<EventHandlerRequest>): Result<Range> {
  const { data: currentEpoch, error: currentEpochError } = await rpcClient.blockchain.getEpochNumber()
  if (currentEpochError || !currentEpoch)
    return { error: JSON.stringify(currentEpochError), data: undefined }
  const { epoch: userEpoch } = await getValidatedQuery(event, rangeQuerySchema.parse)

  let epoch
  if (userEpoch === 'latest')
    epoch = currentEpoch - 1
  else if (currentEpoch <= userEpoch)
    return { error: `Epoch ${epoch} is in the future or it didn't finished yet. The newest epoch you can fetch is ${currentEpoch - 1}.`, data: undefined }
  else
    epoch = userEpoch

  consola.info(`Fetching data for epoch ${epoch}`)
  let range: Range
  try {
    range = await getRange(rpcClient, { toEpochIndex: epoch })
  }
  catch (error) { return { error: (error as Error).message, data: undefined } }
  return { data: range, error: undefined }
}
