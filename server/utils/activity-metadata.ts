export interface ActivityMetadata {
  balance: number
  stakers: number
}

function hasLiveMetadata(metadata?: ActivityMetadata): metadata is ActivityMetadata {
  return !!metadata && (metadata.balance >= 0 || metadata.stakers > 0)
}

export function resolveLiveActivityMetadata(
  stored: ActivityMetadata,
  incoming: ActivityMetadata,
  fallback?: ActivityMetadata,
): ActivityMetadata {
  const fallbackHasLiveMetadata = hasLiveMetadata(fallback)

  return {
    balance: incoming.balance >= 0
      ? incoming.balance
      : stored.balance >= 0
        ? stored.balance
        : fallbackHasLiveMetadata
          ? fallback.balance
          : -1,
    stakers: hasLiveMetadata(incoming)
      ? incoming.stakers
      : hasLiveMetadata(stored)
        ? stored.stakers
        : fallbackHasLiveMetadata
          ? fallback.stakers
          : -1,
  }
}
