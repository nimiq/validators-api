import { drizzle } from 'drizzle-orm/d1'
export { sql, eq, and, or } from 'drizzle-orm'

import * as schema from '../database/schema'

export const tables = schema

export function useDrizzle() {
  return drizzle(hubDatabase(), { schema })
}

export enum ValidatorState {
  Active = 'active',
  Inactive = 'inactive',
  Retired = 'retired',
}

export enum ValidatorTag {
  Nimiq = 'Nimiq',
  Community = 'Community',
}

export enum PayoutType {
  Restake = 'restake',
  Direct = 'direct',
}

export enum EventName {
  CreateValidator = 'create-validator',
  DeactivateValidator = 'deactivate-validator',
  ReactivateValidator = 'reactivate-validator',
  RetireValidator = 'retire-validator',
  DeleteValidator = 'delete-validator',
}

export type Validator = typeof schema.validators.$inferSelect
export type NewValidator = typeof schema.validators.$inferInsert
export type Event = typeof schema.events.$inferSelect
export type NewEvent = typeof schema.events.$inferInsert
export type Score = typeof schema.scores.$inferSelect
export type NewScore = typeof schema.scores.$inferInsert
