import { describe, expect, it } from 'vitest'

import { getUnlistedActiveValidatorAddresses, isKnownValidatorProfile } from './validator-listing'

describe('validator-listing', () => {
  describe('isKnownValidatorProfile', () => {
    it('respects explicit isListed=false', () => {
      expect(isKnownValidatorProfile({ isListed: false, name: 'Visible pool' })).toBe(false)
    })

    it('respects explicit isListed=true', () => {
      expect(isKnownValidatorProfile({ isListed: true, name: 'Unknown validator' })).toBe(true)
    })

    it('falls back to name for legacy isListed=null rows', () => {
      expect(isKnownValidatorProfile({ isListed: null, name: 'Example pool' })).toBe(true)
      expect(isKnownValidatorProfile({ isListed: null, name: 'Unknown validator' })).toBe(false)
    })
  })

  it('filters only active unlisted addresses from current epoch', () => {
    const epochValidators = [{ address: 'A' }, { address: 'B' }, { address: 'C' }]
    const storedValidators = [
      { address: 'A', isListed: false },
      { address: 'B', isListed: true },
      { address: 'C', isListed: null },
    ]

    expect(getUnlistedActiveValidatorAddresses(epochValidators, storedValidators)).toEqual(['A'])
  })
})
