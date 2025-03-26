import { relations, sql } from 'drizzle-orm'
import { check, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { PayoutType } from '../utils/types'

export const validators = sqliteTable('validators', {
  id: integer('id').primaryKey({ autoIncrement: true, onConflict: 'replace' }),
  name: text('name').default('Unknown validator').notNull(),
  address: text('address').notNull().unique(),
  description: text('description'),
  fee: real('fee').default(-1),
  payoutType: text('payout_type').default(PayoutType.None),
  payoutSchedule: text('payout_schedule'),
  isMaintainedByNimiq: integer('is_maintained_by_nimiq', { mode: 'boolean' }).default(false),
  logo: text('logo').notNull(),
  hasDefaultLogo: integer('has_default_logo', { mode: 'boolean' }).notNull().default(true),
  accentColor: text('accent_color').notNull(),
  website: text('website'),
  contact: text('contact', { mode: 'json' }),
}, table => [
  uniqueIndex('validators_address_unique').on(table.address),
  check(
    'enum_check',
    sql`${table.payoutType} IN ('none', 'restake', 'direct')`, // Make sure to update these values if the PayoutType changes
  ),
])

// The scores only for the default window dominance
export const scores = sqliteTable('scores', {
  validatorId: integer('validator_id').notNull().references(() => validators.id, { onDelete: 'cascade' }),
  epochNumber: integer('epoch_number').notNull(),
  total: real('total').notNull(),
  availability: real('availability').notNull(),
  dominance: real('dominance').notNull(),
  reliability: real('reliability').notNull(),
  reason: text('reason', { mode: 'json' }).notNull(),
}, table => [
  index('idx_validator_id').on(table.validatorId),
  primaryKey({ columns: [table.validatorId, table.epochNumber] }),
])

export const scoresRelations = relations(scores, ({ one }) => ({
  validator: one(validators, {
    fields: [scores.validatorId],
    references: [validators.id],
  }),
}))

export const activity = sqliteTable('activity', {
  validatorId: integer('validator_id').notNull().references(() => validators.id, { onDelete: 'cascade' }),
  epochNumber: integer('epoch_number').notNull(),
  likelihood: integer('likelihood').notNull(),
  rewarded: integer('rewarded').notNull(),
  missed: integer('missed').notNull(),
  dominanceRatioViaBalance: integer('dominance_ratio_via_balance').notNull(),
  dominanceRatioViaSlots: integer('dominance_ratio_via_slots').notNull(),
  balance: real('balance').notNull().default(-1),
}, table => [
  index('idx_election_block').on(table.epochNumber),
  primaryKey({ columns: [table.validatorId, table.epochNumber] }),
])

export const activityRelations = relations(activity, ({ one }) => ({
  validator: one(validators, {
    fields: [activity.validatorId],
    references: [validators.id],
  }),
}))

export const validatorRelations = relations(validators, ({ many }) => ({
  scores: many(scores),
  activity: many(activity),
}))
