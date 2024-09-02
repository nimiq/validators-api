import { drizzle } from 'drizzle-orm/d1'

import * as schema from '../database/schema'

export { sql, eq, and, or } from 'drizzle-orm'

export const tables = schema

export function useDrizzle() {
  return drizzle(hubDatabase(), { schema })
}

export type Validator = typeof schema.validators.$inferSelect
export type NewValidator = typeof schema.validators.$inferInsert
export type Activity = typeof schema.activity.$inferSelect
export type NewActivity = typeof schema.activity.$inferInsert
export type Score = typeof schema.scores.$inferSelect
export type NewScore = typeof schema.scores.$inferInsert
