export function canonicalizeValidatorAddress(address: string): string {
  return address.replace(/\s/g, '').toUpperCase()
}

export function canonicalizeAddressSet(addresses: readonly string[]): string[] {
  const canonicalAddresses = addresses.map(canonicalizeValidatorAddress)
  const seenAddresses = new Set<string>()

  for (const address of canonicalAddresses) {
    if (seenAddresses.has(address))
      throw new Error(`Duplicate validator address: ${address}`)
    seenAddresses.add(address)
  }

  return canonicalAddresses.sort()
}

export function compareCanonicalAddressSets(expected: readonly string[], actual: readonly string[]): {
  matches: boolean
  missing: string[]
  unexpected: string[]
} {
  const canonicalExpected = canonicalizeAddressSet(expected)
  const canonicalActual = canonicalizeAddressSet(actual)
  const expectedSet = new Set(canonicalExpected)
  const actualSet = new Set(canonicalActual)
  const missing = canonicalExpected.filter(address => !actualSet.has(address))
  const unexpected = canonicalActual.filter(address => !expectedSet.has(address))

  return {
    matches: missing.length === 0 && unexpected.length === 0,
    missing,
    unexpected,
  }
}

export async function hashCanonicalAddressSet(addresses: readonly string[]): Promise<string> {
  const canonicalAddresses = canonicalizeAddressSet(addresses)
  const encodedAddresses = new TextEncoder().encode(canonicalAddresses.join('\n'))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encodedAddresses)

  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
