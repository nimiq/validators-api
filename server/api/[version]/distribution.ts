import { posSupplyAt } from '~~/packages/nimiq-supply-calculator/src'
import { getRpcClient } from '~~/server/lib/client'
import { not, sql } from 'drizzle-orm'

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
          WHERE a2.validator_id = ${tables.activity.validatorId}
        )`,
      ),
    )
    .get()

  const staked = result?.totalStaked ?? 0

  const { data: currentEpoch, error: errorCurrentEpoch } = await getRpcClient().blockchain.getEpochNumber()
  if (errorCurrentEpoch)
    return createError(errorCurrentEpoch)
  const circulating = posSupplyAt(currentEpoch) * 1e5

  const ratio = staked / circulating
  return { staked, circulating, ratio }
}, {
  maxAge: import.meta.dev ? 0 : 60 * 60, // 60 minutes
})
