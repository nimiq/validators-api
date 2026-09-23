import { relations, sql } from 'drizzle-orm'
import { check, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { PayoutType } from '../utils/types'

export const ActivityEpochStatus = {
  Syncing: 'syncing',
  Finalized: 'finalized',
  Failed: 'failed',
} as const

export type ScoreVersion = 1 | 2
export type ScoreDataStatus = 'complete' | 'stale'

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
  isListed: integer('is_listed', { mode: 'boolean' }),
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
  scoreVersion: integer('score_version').$type<ScoreVersion>().notNull().default(1),
  total: real('total').notNull(),
  availability: real('availability').notNull(),
  recentAvailability: real('recent_availability'),
  longTermAvailability: real('long_term_availability'),
  dominance: real('dominance').notNull(),
  reliability: real('reliability').notNull(),
  dataStatus: text('data_status').$type<ScoreDataStatus>().notNull().default('complete'),
  longTermCoverage: real('long_term_coverage'),
  longTermAsOfEpoch: integer('long_term_as_of_epoch'),
}, table => [
  index('idx_validator_id').on(table.validatorId),
  index('idx_scores_validator_version_epoch').on(table.validatorId, table.scoreVersion, table.epochNumber),
  primaryKey({ columns: [table.validatorId, table.epochNumber, table.scoreVersion] }),
  check('scores_version_check', sql.raw('score_version IN (1, 2)')),
  check('scores_data_status_check', sql.raw('data_status IN (\'complete\', \'stale\')')),
])

export const scoresRelations = relations(scores, ({ one }) => ({
  validator: one(validators, {
    fields: [scores.validatorId],
    references: [validators.id],
  }),
}))

export const scoreBackfillState = sqliteTable('score_backfill_state', {
  id: integer('id').primaryKey(),
  lastScannedEpoch: integer('last_scanned_epoch').notNull(),
}, table => [
  check('score_backfill_state_singleton_check', sql`${table.id} = 1`),
])

export const activity = sqliteTable('activity', {
  validatorId: integer('validator_id').notNull().references(() => validators.id, { onDelete: 'cascade' }),
  epochNumber: integer('epoch_number').notNull(),
  likelihood: integer('likelihood').notNull(),
  rewarded: integer('rewarded').notNull(),
  missed: integer('missed').notNull(),
  dominanceRatioViaBalance: integer('dominance_ratio_via_balance').notNull(),
  dominanceRatioViaSlots: integer('dominance_ratio_via_slots').notNull(),
  balance: real('balance').notNull().default(-1),
  stakers: integer('stakers').notNull().default(0),
}, table => [
  index('idx_election_block').on(table.epochNumber),
  primaryKey({ columns: [table.validatorId, table.epochNumber] }),
])

export const activityEpochs = sqliteTable('activity_epochs', {
  epochNumber: integer('epoch_number').primaryKey(),
  status: text('status', {
    enum: [ActivityEpochStatus.Syncing, ActivityEpochStatus.Finalized, ActivityEpochStatus.Failed],
  }).notNull(),
  expectedElectedCount: integer('expected_elected_count'),
  storedElectedCount: integer('stored_elected_count'),
  electedSetHash: text('elected_set_hash'),
  attemptCount: integer('attempt_count').notNull().default(0),
  startedAt: text('started_at').notNull(),
  finalizedAt: text('finalized_at'),
  lastError: text('last_error'),
}, table => [
  index('idx_activity_epochs_status').on(table.status),
  index('idx_activity_epochs_finalized').on(table.status, table.epochNumber),
  check(
    'activity_epochs_status_check',
    sql`${table.status} IN ('syncing', 'finalized', 'failed')`,
  ),
  check(
    'activity_epochs_counts_check',
    sql`(${table.expectedElectedCount} IS NULL OR ${table.expectedElectedCount} >= 0)
      AND (${table.storedElectedCount} IS NULL OR ${table.storedElectedCount} >= 0)
      AND ${table.attemptCount} >= 0`,
  ),
  check(
    'activity_epochs_finalized_check',
    sql`${table.status} != 'finalized' OR (
      ${table.expectedElectedCount} IS NOT NULL
      AND ${table.storedElectedCount} IS NOT NULL
      AND ${table.expectedElectedCount} = ${table.storedElectedCount}
      AND ${table.electedSetHash} IS NOT NULL
      AND length(trim(${table.electedSetHash}, ' ' || char(9) || char(10) || char(13))) > 0
      AND length(trim(${table.startedAt}, ' ' || char(9) || char(10) || char(13))) > 0
      AND ${table.finalizedAt} IS NOT NULL
      AND length(trim(${table.finalizedAt}, ' ' || char(9) || char(10) || char(13))) > 0
      AND ${table.lastError} IS NULL
    )`,
  ),
])

export const cronRuns = sqliteTable('cron_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cron: text('cron').notNull(),
  network: text('network').notNull(),
  gitBranch: text('git_branch'),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  status: text('status').notNull(),
  errorMessage: text('error_message'),
  meta: text('meta', { mode: 'json' }),
}, table => [
  index('idx_cron_runs_started_at').on(table.startedAt),
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
