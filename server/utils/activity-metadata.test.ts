import { describe, expect, it } from 'vitest'
import { resolveLiveActivityMetadata } from './activity-metadata'

describe('activity metadata', () => {
  it('uses live fallback when production activity has no balance or stakers', () => {
    expect(resolveLiveActivityMetadata(
      { balance: -1, stakers: 0 },
      { balance: -1, stakers: 0 },
      { balance: 123, stakers: 4 },
    )).toEqual({ balance: 123, stakers: 4 })
  })

  it('keeps live zero stakers when balance proves metadata was fetched', () => {
    expect(resolveLiveActivityMetadata(
      { balance: -1, stakers: 0 },
      { balance: 123, stakers: 0 },
    )).toEqual({ balance: 123, stakers: 0 })
  })
})
