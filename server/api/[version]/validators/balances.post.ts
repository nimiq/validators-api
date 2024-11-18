import { getRpcClient } from '~~/server/lib/client'

interface BalanceResponse {
  data: Array<PromiseSettledResult<{ id: number, balance: number } | undefined>>
  issues: Array<{ address: string, error: any }>
}

export default defineEventHandler(async (): Promise<BalanceResponse> => {
  const { data: epochNumber, error: errorEpochNumber } = await getRpcClient().blockchain.getEpochNumber()
  if (errorEpochNumber)
    throw createError({ statusCode: 500, message: 'Failed to fetch epoch number', cause: errorEpochNumber })

  const db = useDrizzle()

  // Get all validators that have no balance for the current epoch
  const validators = await db
    .select({ id: tables.validators.id, address: tables.validators.address })
    .from(tables.validators)
    .leftJoin(tables.activity, eq(tables.activity.validatorId, tables.validators.id))
    .where(and(eq(tables.activity.epochNumber, epochNumber), eq(tables.activity.balance, -1)))
    .all()

  if (!validators.length)
    return { data: [], issues: [] }

  const issues: { address: string, error: any }[] = []
  const batchSize = 10 // Limit concurrent RPC calls
  const results: Array<PromiseSettledResult<{ id: number, balance: number } | undefined>> = []

  // Process validators in batches to avoid overwhelming the RPC
  for (let i = 0; i < validators.length; i += batchSize) {
    const batch = validators.slice(i, i + batchSize)
    const batchResults = await Promise.allSettled(batch.map(async ({ address, id }) => {
      const { data, error } = await getRpcClient().blockchain.getValidatorByAddress(address)
      if (error || !data) {
        issues.push({ address, error: error || new Error('No data returned') })
        return
      }

      // Skip validators that are inactive, jailed, or retired
      if (Boolean(data.inactivityFlag) || Boolean(data.jailedFrom) || data.retired)
        return

      await db
        .update(tables.activity)
        .set({ balance: data.balance })
        .where(and(
          eq(tables.activity.validatorId, id),
          eq(tables.activity.epochNumber, epochNumber),
        ))

      return { id, balance: data.balance }
    }))
    results.push(...batchResults)
  }

  const data = results.filter(({ status }) => status === 'fulfilled')
  return { data, issues }
})
