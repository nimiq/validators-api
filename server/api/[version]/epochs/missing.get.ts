import { getRpcClient } from '~~/server/lib/client'
import { getRange } from 'nimiq-validators-trustscore'

export default defineEventHandler(async () => {
  const rpcClient = getRpcClient()

  const range = await getRange(rpcClient)
  const missingEpochs = await findMissingEpochs(range)
  return missingEpochs
})
