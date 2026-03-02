export function stripInternalValidatorFields<T extends { isListed?: boolean | null }>(validator: T) {
  const { isListed: _isListed, ...publicValidator } = validator
  return publicValidator
}
