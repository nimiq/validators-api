import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core'

export const validators = sqliteTable('validators', {
  id: integer('id').primaryKey({ autoIncrement: true, onConflict: 'replace' }),
  name: text('name').default('Unknown validator'),
  address: text('address').notNull().unique(),
  fee: real('fee').default(-1),
  payoutType: text('payout_type').default('unknown'),
  description: text('description'),
  icon: text('icon').notNull(),
  tag: text('tag').default('unknown'),
  website: text('website'),
})

export const scores = sqliteTable('scores', {
  id: integer('score_id').notNull().primaryKey(),
  validatorId: integer('validator_id').notNull().references(() => validators.id).unique(),
  total: real('total').notNull(),
  liveness: real('liveness').notNull(),
  size: real('size').notNull(),
  reliability: real('reliability').notNull(),
})

export const activity = sqliteTable('activity', {
  validatorId: integer('validator_id').notNull().references(() => validators.id),
  epochBlockNumber: integer('epoch_block_number').notNull(),
  assigned: integer('assigned').notNull(),
  missed: integer('missed').notNull(),
}, ({ epochBlockNumber, validatorId }) => ({ pk: primaryKey({ columns: [validatorId, epochBlockNumber] }) }))
