import { describe, expect, it } from 'vitest'
import {
  canonicalizeAddressSet,
  canonicalizeValidatorAddress,
  compareCanonicalAddressSets,
  hashCanonicalAddressSet,
} from './activity-integrity'

const ADDRESS_A = 'NQ02 31N6 3KM5 T6G5 22TN EPF5 5XPY RLHK RMB3'
const ADDRESS_A_CANONICAL = 'NQ0231N63KM5T6G522TNEPF55XPYRLHKRMB3'
const ADDRESS_B = 'NQ29 FBVT B4GM S27H UBP4 1MTC GNKQ VPBT 099M'
const ADDRESS_B_CANONICAL = 'NQ29FBVTB4GMS27HUBP41MTCGNKQVPBT099M'
const ADDRESS_C = 'NQ40 FC4D HAT6 9N1H P52H P4FX QL8P CE6Y 10VT'
const ADDRESS_C_CANONICAL = 'NQ40FC4DHAT69N1HP52HP4FXQL8PCE6Y10VT'

describe('activity integrity address sets', () => {
  it('canonicalizes validator identity by removing whitespace and uppercasing', () => {
    expect(canonicalizeValidatorAddress('  nq02\t31n6 3km5\n t6g5 22tn epf5 5xpy rlhk rmb3  '))
      .toBe(ADDRESS_A_CANONICAL)
  })

  it('returns a deterministically sorted canonical set without mutating the input', () => {
    const addresses = [ADDRESS_C, ADDRESS_A.toLowerCase(), ADDRESS_B]

    expect(canonicalizeAddressSet(addresses)).toEqual([
      ADDRESS_A_CANONICAL,
      ADDRESS_B_CANONICAL,
      ADDRESS_C_CANONICAL,
    ])
    expect(addresses).toEqual([ADDRESS_C, ADDRESS_A.toLowerCase(), ADDRESS_B])
  })

  it('rejects duplicate canonical identities', () => {
    expect(() => canonicalizeAddressSet([
      ADDRESS_A,
      ` ${ADDRESS_A_CANONICAL.toLowerCase()} `,
    ])).toThrow(/duplicate/i)
  })

  it('compares exact membership independently of formatting and order', () => {
    expect(compareCanonicalAddressSets(
      [ADDRESS_A, ADDRESS_B],
      [ADDRESS_B.toLowerCase(), ADDRESS_A_CANONICAL],
    )).toEqual({ matches: true, missing: [], unexpected: [] })
  })

  it('reports sorted missing and unexpected canonical identities', () => {
    expect(compareCanonicalAddressSets(
      [ADDRESS_B, ADDRESS_A],
      [ADDRESS_C.toLowerCase(), ADDRESS_B_CANONICAL],
    )).toEqual({
      matches: false,
      missing: [ADDRESS_A_CANONICAL],
      unexpected: [ADDRESS_C_CANONICAL],
    })
  })

  it('rejects duplicates instead of hiding them during comparison', () => {
    expect(() => compareCanonicalAddressSets(
      [ADDRESS_A, ADDRESS_A_CANONICAL.toLowerCase()],
      [ADDRESS_A],
    )).toThrow(/duplicate/i)
  })

  it('produces a stable SHA-256 hash for equivalent canonical sets', async () => {
    const hash = await hashCanonicalAddressSet([ADDRESS_C, ADDRESS_A, ADDRESS_B])

    expect(hash).toMatch(/^[a-f\d]{64}$/)
    await expect(hashCanonicalAddressSet([
      ADDRESS_B_CANONICAL.toLowerCase(),
      ADDRESS_C.toLowerCase(),
      ADDRESS_A_CANONICAL,
    ])).resolves.toBe(hash)
    await expect(hashCanonicalAddressSet([ADDRESS_A, ADDRESS_B])).resolves.not.toBe(hash)
  })

  it('rejects duplicates before hashing', async () => {
    await expect(hashCanonicalAddressSet([
      ADDRESS_A,
      ADDRESS_A_CANONICAL.toLowerCase(),
    ])).rejects.toThrow(/duplicate/i)
  })
})
