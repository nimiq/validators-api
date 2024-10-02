import { check, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { PayoutType } from '../utils/types'

export const validators = sqliteTable('validators', {
  id: integer('id').primaryKey({ autoIncrement: true, onConflict: 'replace' }),
  name: text('name').default('Unknown validator').notNull(),
  address: text('address').notNull().unique(),
  description: text('description'),
  fee: real('fee').default(-1),
  payoutType: text('payout_type').default(PayoutType.None),
  isMaintainedByNimiq: integer('is_maintained_by_nimiq', { mode: 'boolean' }).default(false),
  icon: text('icon').notNull(),
  website: text('website'),
}, table => ({
  uniqueAddress: uniqueIndex('validators_address_unique').on(table.address),
  enumCheck: check(
    'enum_check',
    sql`${table.payoutType} IN (${Object.values(PayoutType).map(value => `'${value}'`).join(', ')})`,
  ),
}))

export const scores = sqliteTable('scores', {
  validatorId: integer('validator_id').notNull().references(() => validators.id, { onDelete: 'cascade' }),
  fromEpoch: integer('from_epoch').notNull(),
  toEpoch: integer('to_epoch').notNull(),
  total: real('total').notNull(),
  liveness: real('liveness').notNull(),
  size: real('size').notNull(),
  reliability: real('reliability').notNull(),
}, table => ({
  idxValidatorId: index('idx_validator_id').on(table.validatorId),
  compositePrimaryKey: primaryKey({ columns: [table.validatorId, table.fromEpoch, table.toEpoch] }),
}))

export const activity = sqliteTable('activity', {
  validatorId: integer('validator_id').notNull().references(() => validators.id, { onDelete: 'cascade' }),
  epochNumber: integer('epoch_number').notNull(),
  likelihood: integer('likelihood').notNull(),
  rewarded: integer('rewarded').notNull(),
  missed: integer('missed').notNull(),
  sizeRatio: integer('size_ratio').notNull(),
  // TODO Remove sizeRatioViaSlots bool and instead store also the sizeRatioPrecise
  // sizeRatioViaSlots: integer('size_ratio_via_slots').notNull(),
  sizeRatioViaSlots: integer('size_ratio_via_slots', { mode: 'boolean' }).notNull(),
}, table => ({
  idxElectionBlock: index('idx_election_block').on(table.epochNumber),
  compositePrimaryKey: primaryKey({ columns: [table.validatorId, table.epochNumber] }),
}))
