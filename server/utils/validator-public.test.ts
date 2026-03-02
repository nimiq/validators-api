import { describe, expect, it } from 'vitest'
import { stripInternalValidatorFields } from './validator-public'

describe('validator public payload', () => {
  it('removes isListed from payload objects', () => {
    const payload = stripInternalValidatorFields({
      id: 7,
      address: 'NQ00 TEST',
      isListed: true,
      name: 'Pool',
    })

    expect(payload).toEqual({
      id: 7,
      address: 'NQ00 TEST',
      name: 'Pool',
    })
    expect('isListed' in payload).toBe(false)
  })
})
