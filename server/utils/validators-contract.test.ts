import { describe, expect, it } from 'vitest'

import { mainQuerySchema } from './schemas'
import { filterVisibleValidators } from './validators'

interface WalletValidatorShape {
  id: number
  name: string
  address: string
  description: string | null
  fee: number | null
  payoutType: 'none' | 'restake' | 'direct'
  payoutSchedule: string
  isMaintainedByNimiq: boolean
  logo: string
  hasDefaultLogo: boolean
  accentColor: string
  website: string | null
  contact: unknown
  isListed: boolean | null
  score: Record<string, number> | null
  dominanceRatio: number | null
  balance: number
  stakers: number
}

describe('validators API contract', () => {
  const fixtures: WalletValidatorShape[] = [
    {
      id: 1,
      name: 'Visible pool',
      address: 'NQ00 TEST 0000 0000 0000 0000 0000 0000 0000 0000',
      description: 'Known and visible',
      fee: 0.05,
      payoutType: 'restake',
      payoutSchedule: '7d',
      isMaintainedByNimiq: false,
      logo: 'data:image/png;base64,AA==',
      hasDefaultLogo: false,
      accentColor: '#ff0000',
      website: 'https://example.com',
      contact: null,
      isListed: true,
      score: { availability: 0.9, dominance: 0.5, reliability: 0.8, total: 0.7, epochNumber: 123 },
      dominanceRatio: 0.42,
      balance: 1000,
      stakers: 10,
    },
    {
      id: 2,
      name: 'Removed pool',
      address: 'NQ00 TEST 0000 0000 0000 0000 0000 0000 0000 0001',
      description: null,
      fee: null,
      payoutType: 'none',
      payoutSchedule: '',
      isMaintainedByNimiq: false,
      logo: 'data:image/png;base64,AA==',
      hasDefaultLogo: true,
      accentColor: '#00ff00',
      website: null,
      contact: null,
      isListed: false,
      score: null,
      dominanceRatio: 0,
      balance: 0,
      stakers: 0,
    },
    {
      id: 3,
      name: 'Unknown validator',
      address: 'NQ00 TEST 0000 0000 0000 0000 0000 0000 0000 0002',
      description: null,
      fee: null,
      payoutType: 'none',
      payoutSchedule: '',
      isMaintainedByNimiq: false,
      logo: 'data:image/png;base64,AA==',
      hasDefaultLogo: true,
      accentColor: '#0000ff',
      website: null,
      contact: null,
      isListed: null,
      score: null,
      dominanceRatio: 0,
      balance: 0,
      stakers: 0,
    },
  ]

  it('defaults to only known validators', () => {
    const parsed = mainQuerySchema.parse({})
    expect(parsed['only-known']).toBe(true)
    expect(filterVisibleValidators(fixtures, parsed['only-known']).map(v => v.address)).toEqual([
      'NQ00 TEST 0000 0000 0000 0000 0000 0000 0000 0000',
    ])
  })

  it('includes unlisted and unknown validators when only-known=false', () => {
    expect(filterVisibleValidators(fixtures, false)).toHaveLength(3)
    expect(filterVisibleValidators(fixtures, false).map(v => v.address)).toEqual([
      'NQ00 TEST 0000 0000 0000 0000 0000 0000 0000 0000',
      'NQ00 TEST 0000 0000 0000 0000 0000 0000 0000 0001',
      'NQ00 TEST 0000 0000 0000 0000 0000 0000 0000 0002',
    ])
  })

  it('keeps wallet-facing payload keys stable when filtering is applied', () => {
    const visible = filterVisibleValidators(fixtures, false)[0]

    expect(Object.keys(visible)).toEqual(expect.arrayContaining([
      'id',
      'name',
      'address',
      'description',
      'fee',
      'payoutType',
      'payoutSchedule',
      'isMaintainedByNimiq',
      'score',
      'dominanceRatio',
      'balance',
      'stakers',
      'website',
      'contact',
      'isListed',
    ]))
  })
})
