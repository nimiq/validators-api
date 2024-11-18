export default defineCachedEventHandler(async () => {
  const db = useDrizzle()
  const latestBalances = await db
    .select({
      validatorId: tables.activity.validatorId, // Added for debugging
      epoch: tables.activity.epochNumber, // Added for debugging
      balance: tables.activity.balance,
    })
    .from(tables.activity)
    .innerJoin(
      db
        .select({
          validatorId: tables.activity.validatorId,
          maxEpoch: sql<number>`MAX(${tables.activity.epochNumber})`,
        })
        .from(tables.activity)
        .groupBy(tables.activity.validatorId)
        .as('latest'),
      join =>
        and(
          eq(tables.activity.validatorId, join.validatorId),
          eq(tables.activity.epochNumber, join.maxEpoch),
        ),
    )

  const total = latestBalances.reduce((sum, row) => sum + row.balance, 0)

  return {
    staked: total,
  }
}, {
  maxAge: import.meta.dev ? 0 : 60 * 60, // 60 minutes
})
