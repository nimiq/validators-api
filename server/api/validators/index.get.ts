import { desc, eq, isNotNull, not } from 'drizzle-orm';

export interface Validator {
  id: number
  name: string
  address: string
  fee: number
  payoutType: string
  description: string
  icon: string
  tag: string
  website: string
  total: number
  liveness: number
  size: number
  reliability: number
}

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
      total: tables.scores.total,
      liveness: tables.scores.liveness,
      size: tables.scores.size,
      reliability: tables.scores.reliability,
    })
    .from(tables.validators)
    .leftJoin(tables.scores, eq(tables.validators.id, tables.scores.validatorId))
    .where(isNotNull(tables.scores.validatorId))
    .groupBy(tables.validators.id)
    .orderBy(desc(tables.scores.total))
    .all()

  setResponseStatus(event, 200)
  return data as Validator[]
})
