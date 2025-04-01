import { posSupplyAt } from '@nimiq/utils/supply-calculator'
import { not, sql } from 'drizzle-orm'
import { getRpcClient } from '~~/server/utils/client'

export default defineCachedEventHandler(async () => {
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

  const { data: latestBlock, error } = await getRpcClient().blockchain.getLatestBlock()
  if (error)
    throw createError(error)

  const network = useRuntimeConfig().public.nimiqNetwork as 'test-albatross' | 'main-albatross'
  const circulating = posSupplyAt(latestBlock.timestamp, { network })

  const stakedRatio = staked / circulating
  return { staked, circulating, stakedRatio }
}, {
  maxAge: import.meta.dev ? 0 : 60 * 60, // 60 minutes
  name: 'distribution',
})
