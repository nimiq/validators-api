import { z } from 'zod'
import { PayoutType } from './types'

export const logoFormatRe = /^data:image\/(png|svg\+xml|webp|jpeg)(?:;base64)?,/
export const validatorSchema = z.object({
  name: z.string(),
  address: z.string().regex(/^NQ\d{2}(\s\w{4}){8}$/, 'Invalid Nimiq address format'),
  fee: z.literal(null).or(z.number().min(0).max(1)).default(null),
  payoutType: z.enum(PayoutType).default(PayoutType.None),
  payoutScheme: z.string().optional(),
  payoutSchedule: z.string().optional().default(''),
  isMaintainedByNimiq: z.boolean().optional(),
  description: z.string().optional(),
  website: z.string().url().optional(),
  logo: z.string().regex(logoFormatRe).optional(),
  hasDefaultLogo: z.boolean().default(true),
  accentColor: z.string().refine(
    val => val.startsWith('#') && val.length === 7,
    { error: 'accentColor must be a HEX color value' },
  ).optional(),
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
}).superRefine((data, ctx) => {
  // Custom validation across fields

  // If payoutType is "custom", payoutScheme must be provided
  if (data.payoutType === PayoutType.Custom && data.payoutScheme === undefined) {
    ctx.addIssue({
      code: 'invalid_value',
      message: 'payoutScheme is required when payoutType is "custom"',
      values: ['Describe the custom payout scheme here.'],
      input: data.payoutScheme,
    })
  }

  // If logo is provided, accentColor must also be provided
  if (data.logo && !data.accentColor) {
    ctx.addIssue({
      code: 'invalid_value',
      message: 'accentColor is required when logo is provided',
      values: ['Provide a valid accent color in hex format, e.g. #FF5733.'],
      input: data.accentColor,
    })
  }
})
export const validatorsSchema = z.array(validatorSchema)
export type ValidatorJSON = z.infer<typeof validatorSchema>

function getDefaults<Schema extends z.ZodObject<any>>(schema: Schema) {
  return Object.fromEntries(
    Object.entries(schema.shape).map(([key, value]) => {
      if (value instanceof z.ZodDefault)
        return [key, value.parse(undefined)]
      return [key, undefined]
    }),
  )
}

export const defaultValidatorJSON = getDefaults(validatorSchema) as ValidatorJSON

export const mainQuerySchema = z.object({
  'payout-type': z.nativeEnum(PayoutType).optional(),
  'only-known': z.literal('true').or(z.literal('false')).default('true').transform(v => v === 'true'),
  'with-identicons': z.literal('true').or(z.literal('false')).optional().transform(v => v === undefined ? undefined : v === 'true'),
  'force': z.literal('true').or(z.literal('false')).default('false').transform(v => v === 'true'),
  'epoch-number': z.coerce.number().min(1).default(1),
})

export type MainQuerySchema = z.infer<typeof mainQuerySchema>
