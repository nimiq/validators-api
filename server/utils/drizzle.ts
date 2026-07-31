import { db, schema } from 'hub:db'

export type { ScoreDataStatus, ScoreVersion } from '../db/schema'

export const tables = schema

export function useDrizzle() {
  return db
}

export type Validator = typeof schema.validators.$inferSelect
export type NewValidator = typeof schema.validators.$inferInsert
export type Activity = typeof schema.activity.$inferSelect
export type NewActivity = typeof schema.activity.$inferInsert
export type ActivityEpoch = typeof schema.activityEpochs.$inferSelect
export type NewActivityEpoch = typeof schema.activityEpochs.$inferInsert
export type Score = typeof schema.scores.$inferSelect
export type NewScore = typeof schema.scores.$inferInsert
export { and, eq, or, sql } from 'drizzle-orm'
export type CronRun = typeof schema.cronRuns.$inferSelect
export type NewCronRun = typeof schema.cronRuns.$inferInsert
