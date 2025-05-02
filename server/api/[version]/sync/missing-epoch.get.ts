import { initRpcClient } from 'nimiq-rpc-client-ts/config'
import { fetchActivity } from '~~/packages/nimiq-validator-trustscore/src/fetcher'
import { getRange } from '~~/packages/nimiq-validator-trustscore/src/range'
import { storeActivities } from '~~/server/utils/activities'

export default defineEventHandler(async () => {
  if (!useRuntimeConfig().albatrossRpcNodeUrl)
    throw createError('No Albatross RPC Node URL')
  initRpcClient({ url: useRuntimeConfig().albatrossRpcNodeUrl })

  const [rangeOk, rangeError, range] = await getRange({ network: useRuntimeConfig().public.nimiqNetwork })
  if (!rangeOk)
    throw createError(rangeError || 'Unable to fetch range')

  const missingEpochs = await findMissingEpochs(range)
  if (!missingEpochs)
    throw createError('Unable to fetch missing epochs')

  if (missingEpochs.length === 0)
    return { isSynced: true, next: null, syncedEpoch: null, totalMissing: 0 }

  const missingEpoch = missingEpochs.at(0)!
  const [activityOk, activityError, epochActivity] = await fetchActivity(missingEpoch)
  if (!activityOk || !epochActivity)
    throw createError(activityError || 'Unable to fetch activity')
  await storeActivities({ [`${missingEpoch}`]: epochActivity })

  // Subtract 1 from totalMissing as we've just synced one epoch
  const totalMissing = missingEpochs.length - 1

  return totalMissing === 0
    ? { isSynced: true, next: null, syncedEpoch: missingEpoch, totalMissing }
    : { isSynced: false, next: missingEpochs[1], syncedEpoch: missingEpoch, totalMissing }
})
