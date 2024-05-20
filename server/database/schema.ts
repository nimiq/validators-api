import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const validators = sqliteTable('validators', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  fee: real('fee').notNull(),
  payoutType: text('payoutType').notNull(),
  description: text('description'),
  icon: text('icon').notNull(),
  tag: text('tag').notNull(),
  website: text('website'),
  state: text('state').notNull(),
  balance: real('balance').notNull(),
})

export const events = sqliteTable('events', {
  id: integer('event_id').notNull().primaryKey(),
  event: text('event').notNull(),
  validatorId: integer('validator_id').notNull().references(() => validators.id),
  hash: text('hash').notNull().unique(),
  timestamp: integer('timestamp', { mode: 'timestamp_ms' }).notNull(),
  blockNumber: integer('block_number').notNull(),
})

export const scores = sqliteTable('scores', {
  id: integer('score_id').notNull().primaryKey(),
  validatorId: integer('validator_id').notNull().references(() => validators.id).unique(),
  score: real('score').notNull(),
  liveness: real('liveness').notNull(),
  size: real('size').notNull(),
  reliability: real('reliability').notNull(),
})
