import { describe, expect, it } from 'vitest'
import { isFinalizedEpochActivity } from './activity-completeness'

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
})
