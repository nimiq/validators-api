import { getRange } from '~~/packages/nimiq-validators-trustscore/dist/index.mjs'
import { getRpcClient } from '~~/server/lib/client'
import { consola } from 'consola'

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
