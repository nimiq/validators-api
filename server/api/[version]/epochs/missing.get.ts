import { consola } from 'consola'
import { getRange } from 'nimiq-validators-score'
import { getRpcClient } from '~~/server/lib/client'

function err(error: any) {
  consola.error(error)
  return createError(error)
}

export default defineEventHandler(async () => {
  const rpcClient = getRpcClient()

  const range = await getRange(rpcClient)
  if (!range)
    return err('Could not get range')

  const missingEpochs = await findMissingEpochs(range)
  return missingEpochs
})
