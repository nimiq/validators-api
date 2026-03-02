import { describe, expect, it } from 'vitest'
import { getUnlistedActiveValidatorAddresses, getUnlistedAddresses, isKnownValidatorProfile } from './validator-listing'

describe('validator listing', () => {
  it('treats only explicitly listed validators as known', () => {
    expect(isKnownValidatorProfile({ isListed: true })).toBe(true)
    expect(isKnownValidatorProfile({ isListed: false })).toBe(false)
    expect(isKnownValidatorProfile({ isListed: null })).toBe(false)
  })

  it('finds validators that are not bundled anymore', () => {
    const stored = ['NQ01', 'NQ02', 'NQ03']
    const bundled = new Set(['NQ01', 'NQ03'])

    expect(getUnlistedAddresses(stored, bundled)).toEqual(['NQ02'])
  })

  it('returns active unlisted validators only', () => {
    const epochValidators = [{ address: 'NQ01' }, { address: 'NQ02' }, { address: 'NQ03' }]
    const storedValidators = [
      { address: 'NQ01', isListed: true },
      { address: 'NQ02', isListed: false },
      { address: 'NQ03', isListed: null },
    ]

    expect(getUnlistedActiveValidatorAddresses(epochValidators, storedValidators)).toEqual(['NQ02'])
  })
})
