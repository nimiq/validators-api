import { db, schema } from 'hub:db'

export { and, eq, or, sql } from 'drizzle-orm'

export const tables = schema

export function useDrizzle() {
  return db
}

export type Validator = typeof schema.validators.$inferSelect
export type NewValidator = typeof schema.validators.$inferInsert
export type Activity = typeof schema.activity.$inferSelect
export type NewActivity = typeof schema.activity.$inferInsert
export type Score = typeof schema.scores.$inferSelect
export type NewScore = typeof schema.scores.$inferInsert
