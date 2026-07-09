import { describe, expect, it } from 'vitest'
import { isCompleteFinalizedEpochActivity, isElectedSnapshotPlaceholder, isFinalizedEpochActivity } from './activity-completeness'

describe('activity completeness', () => {
  it('does not treat current-epoch snapshot placeholders as finalized activity', () => {
    expect(isFinalizedEpochActivity({ likelihood: 0.1, missed: -1, rewarded: -1 })).toBe(false)
  })

  it('treats finalized elected rows with zero rewards and misses as finalized activity', () => {
    expect(isFinalizedEpochActivity({ likelihood: 0.1, missed: 0, rewarded: 0 })).toBe(true)
  })

  it('does not treat unelected rows as finalized activity', () => {
    expect(isFinalizedEpochActivity({ likelihood: -1, missed: -1, rewarded: -1 })).toBe(false)
  })

  it('identifies elected current-epoch placeholders', () => {
    expect(isElectedSnapshotPlaceholder({ likelihood: 0.1, missed: -1, rewarded: -1 })).toBe(true)
  })

  it('does not identify finalized activity as a snapshot placeholder', () => {
    expect(isElectedSnapshotPlaceholder({ likelihood: 0.1, missed: 0, rewarded: 720 })).toBe(false)
  })

  it('does not treat an epoch as complete while any elected placeholder remains', () => {
    expect(isCompleteFinalizedEpochActivity([
      { likelihood: 0.1, missed: 0, rewarded: 720 },
      { likelihood: 0.1, missed: -1, rewarded: -1 },
    ])).toBe(false)
  })

  it('treats an epoch as complete when finalized rows have no elected placeholders', () => {
    expect(isCompleteFinalizedEpochActivity([
      { likelihood: 0.1, missed: 0, rewarded: 720 },
      { likelihood: -1, missed: 0, rewarded: 0 },
    ])).toBe(true)
  })
})
