import { z } from 'zod'
import { PayoutType } from './types'
import { DEFAULT_WINDOW_IN_DAYS, DEFAULT_WINDOW_IN_MS } from '~~/packages/nimiq-validators-score/src'

export const rangeQuerySchema = z.object({
  epoch: z.literal('latest').or(z.number().min(1)).default('latest'),
  epochsCount: z.number().min(1).default(DEFAULT_WINDOW_IN_DAYS),
  durationWindowMs: z.number().min(1).default(DEFAULT_WINDOW_IN_MS),
}).refine(({ epochsCount, durationWindowMs }) => {
  const defaultCounts = epochsCount === DEFAULT_WINDOW_IN_DAYS
  const defaultWindow = durationWindowMs === DEFAULT_WINDOW_IN_MS
  return (!epochsCount || !durationWindowMs) || (defaultCounts && defaultWindow) || (!defaultCounts && !defaultWindow)
})

export const validatorSchema = z.object({
  name: z.string().optional(),
  address: z.string().regex(/^NQ\d{2}(\s\w{4}){8}$/, 'Invalid Nimiq address format'),
  fee: z.number().min(0).max(1),
  payoutType: z.nativeEnum(PayoutType).default(PayoutType.None),
  isMaintainedByNimiq: z.boolean().optional(),
  description: z.string().optional(),
  website: z.string().url().optional(),
  icon: z.string().optional(),
})

export const mainQuerySchema = z.object({
  pools: z.literal('true').or(z.literal('false')).default('false').transform(v => v === 'true'),
  active: z.literal('true').or(z.literal('false')).default('true').transform(v => v === 'true'),
})
