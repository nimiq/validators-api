export default defineEventHandler(async (event) => {
  const data = await useDrizzle()
    .select({
      id: tables.validators.id,
      name: tables.validators.name,
      address: tables.validators.address,
      fee: tables.validators.fee,
      payoutType: tables.validators.payoutType,
      description: tables.validators.description,
      icon: tables.validators.icon,
      tag: tables.validators.tag,
      website: tables.validators.website,
      balance: tables.validators.balance,
      total: tables.scores.total,
      liveness: tables.scores.liveness,
      size: tables.scores.size,
      reliability: tables.scores.reliability,
    })
    .from(tables.validators)
    .leftJoin(tables.scores, eq(tables.validators.id, tables.scores.validatorId))
    .groupBy(tables.validators.id)
    .all()

  setResponseStatus(event, 200)
  return data
})
