import { DEFAULT_WINDOW_IN_DAYS, DEFAULT_WINDOW_IN_MS } from '~~/packages/nimiq-validators-trustscore/src'
import { z } from 'zod'
import { PayoutType } from './types'

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
  fee: z.literal(null).or(z.number().min(0).max(1)).default(null),
  payoutType: z.nativeEnum(PayoutType).default(PayoutType.None),
  payoutSchedule: z.string().optional().default(''),
  isMaintainedByNimiq: z.boolean().optional(),
  description: z.string().optional(),
  website: z.string().url().optional(),
  logo: z.string().regex(/^data:image\/(png|svg\+xml|webp)/).optional(),
  hasDefaultLogo: z.boolean().default(true),
  accentColor: z.string().optional(),
  contact: z.object({
    email: z.string().email().optional(),
    twitter: z.string().regex(/^@?(\w){1,15}$/).optional(),
    telegram: z.string().regex(/^@?(\w){5,32}$/).optional(),
    discordInvitationUrl: z.string().url().optional(),
    bluesky: z.string().regex(/^@?[\w.-]{1,100}$/).optional(),
    github: z.string().regex(/^@?[\w-]{1,39}$/).optional(),
    linkedin: z.string().regex(/^@?[a-z0-9%-]{1,100}$/i).optional(),
    facebook: z.string().regex(/^@?[\w.-]{1,100}$/).optional(),
    instagram: z.string().regex(/^@?(\w){1,30}$/).optional(),
    youtube: z.string().regex(/^@?(\w){1,50}$/).optional(),
  }).optional(),
})
export type ValidatorJSON = z.infer<typeof validatorSchema>

function getDefaults<Schema extends z.AnyZodObject>(schema: Schema) {
  return Object.fromEntries(
    Object.entries(schema.shape).map(([key, value]) => {
      if (value instanceof z.ZodDefault)
        return [key, value._def.defaultValue()]
      return [key, undefined]
    }),
  )
}

export const defaultValidatorJSON = getDefaults(validatorSchema) as ValidatorJSON

export const mainQuerySchema = z.object({
  'payout-type': z.nativeEnum(PayoutType).optional(),
  'only-active': z.literal('true').or(z.literal('false')).default('false').transform(v => v === 'true'),
  'only-known': z.literal('true').or(z.literal('false')).default('true').transform(v => v === 'true'),
  'with-identicons': z.literal('true').or(z.literal('false')).default('false').transform(v => v === 'true'),
  'force': z.literal('true').or(z.literal('false')).default('false').transform(v => v === 'true'),
})
