import { getRpcClient } from '~~/server/lib/client'

export default defineEventHandler(async () => {
  const { data: epochNumber, error: errorEpochNumber } = await getRpcClient().blockchain.getEpochNumber()
  if (errorEpochNumber)
    throw createError(errorEpochNumber)

  // Get all validators that have no balance for the current epoch
  const validators = await useDrizzle()
    .select({ id: tables.validators.id, address: tables.validators.address })
    .from(tables.validators)
    .leftJoin(tables.activity, eq(tables.activity.validatorId, tables.validators.id))
    .where(and(eq(tables.activity.epochNumber, epochNumber), eq(tables.activity.balance, -1)))
    .all()

  // Array to store issues
  const issues: { address: string, error: any }[] = []

  // Get the balance of each validator and update the database
  const validatorsWithBalances = await Promise.allSettled(validators.map(async ({ address, id }) => {
    // Get the validator balance
    const { data, error } = await getRpcClient().blockchain.getValidatorByAddress(address)
    if (error || !data) {
      issues.push({ address, error })
      return
    }

    // update the balance of the validator
    await useDrizzle()
      .update(tables.activity)
      .set({ balance: data.balance })
      .where(and(eq(tables.activity.validatorId, id), eq(tables.activity.epochNumber, epochNumber)))
  }))

  return { data: validatorsWithBalances, issues }
})
