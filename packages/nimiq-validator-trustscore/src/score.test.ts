import type { ValidatorEpochState } from './types'
import { describe, expect, it } from 'vitest'
import { getAvailability } from './score'

describe('should compute liveness correctly', () => {
  it('should be 1 with all epoch active', () => {
    const activeEpochStates = Array.from({ length: 100 }).fill(1) as ValidatorEpochState[]
    const [,,availability] = getAvailability({ weightFactor: 0.5, activeEpochStates })
    expect(availability).toBeGreaterThan(0.5)
  })

  it('should be 0 with all epoch inactive', () => {
    const activeEpochStates = Array.from({ length: 100 }).fill(0) as ValidatorEpochState[]
    const [,,availability] = getAvailability({ weightFactor: 0.5, activeEpochStates })
    expect(availability).toBeLessThan(0.5)
  })

  it('should be more than 0.5 with the second half active', () => {
    const activeEpochStates = Array.from({ length: 100 }).map((_, i) => i < 50 ? 0 : 1) as ValidatorEpochState[]
    const [,,availability] = getAvailability({ weightFactor: 0.5, activeEpochStates })
    expect(availability).toBeGreaterThan(0.5)
  })
})
