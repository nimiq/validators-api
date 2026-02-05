import { posSupplyAt } from '@nimiq/utils/supply-calculator'
import { not, sql } from 'drizzle-orm'
import { initRpcClient } from 'nimiq-rpc-client-ts/client'
import { getLatestBlock } from 'nimiq-rpc-client-ts/http'
import { getRpcUrl } from '~~/server/utils/rpc'

export default defineCachedEventHandler(async () => {
  const rpcUrl = getRpcUrl()
  if (!rpcUrl)
    throw createError('No Albatross RPC Node URL')
  initRpcClient({ url: rpcUrl })
  const db = useDrizzle()

  const result = await db.select({
    totalStaked: sql<number>`sum(${tables.activity.balance})`,
  })
    .from(tables.activity)
    .where(
      and(
        not(sql`${tables.activity.balance} = -1`),
        sql`${tables.activity.epochNumber} = (
          SELECT MAX(epoch_number)
          FROM activity a2
          WHERE a2.validator_id = ${tables.activity.validatorId} AND balance != 1
        )`,
      ),
    )
    .get()

  const staked = (result?.totalStaked ?? 0) / 1e5

  const [latestBlockOk, latestBlockError, latestBlock] = await getLatestBlock()
  if (!latestBlockOk)
    throw createError(latestBlockError)

  const network = useRuntimeConfig().public.nimiqNetwork as 'test-albatross' | 'main-albatross'
  const circulating = posSupplyAt(latestBlock.timestamp, { network })

  const stakedRatio = staked / circulating
  return { staked, circulating, stakedRatio }
}, {
  maxAge: import.meta.dev ? 0 : 60 * 60, // 60 minutes
  name: 'distribution',
})
