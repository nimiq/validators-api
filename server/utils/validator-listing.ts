interface ValidatorListState {
  isListed: boolean | null
}

interface ValidatorAddress {
  address: string
}

interface StoredValidatorAddressState extends ValidatorAddress {
  isListed: boolean | null
}

export function isKnownValidatorProfile({ isListed }: ValidatorListState) {
  return isListed === true
}

export function getUnlistedAddresses(storedAddresses: string[], bundledAddresses: Set<string>) {
  return storedAddresses.filter(address => !bundledAddresses.has(address))
}

export function getUnlistedActiveValidatorAddresses(
  epochValidators: ValidatorAddress[],
  storedValidators: StoredValidatorAddressState[],
) {
  const unlistedAddresses = new Set(
    storedValidators
      .filter(v => v.isListed === false)
      .map(v => v.address),
  )
  return epochValidators
    .filter(v => unlistedAddresses.has(v.address))
    .map(v => v.address)
}
