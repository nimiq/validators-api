import { getRange } from 'nimiq-validator-trustscore/utils'
import { getRpcClient } from '~~/server/lib/client'

export default defineEventHandler(async () => {
  const rpcClient = getRpcClient()

  const range = await getRange(rpcClient)
  const missingEpochs = await findMissingEpochs(range)
  return missingEpochs
})
