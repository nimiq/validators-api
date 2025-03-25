import type { EventHandlerRequest, H3Event } from 'h3'
import type { NimiqRPCClient } from 'nimiq-rpc-client-ts'
import type { Range } from 'nimiq-validator-trustscore/types'
import type { Result } from './types'
import { consola } from 'consola'
import { getRange } from 'nimiq-validator-trustscore/utils'
import { rangeQuerySchema } from './schemas'

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

  const range = await getRange(rpcClient, { toEpochIndex: epoch })
  return range
}
