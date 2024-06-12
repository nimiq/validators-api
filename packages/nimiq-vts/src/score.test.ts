import { describe, expect, it } from 'vitest'
import { getLiveness } from './score'
import type { ValidatorEpochState } from './types'

describe('should compute livenes correctly', () => {
  it('should be 1 with all epoch active', () => {
    const activeEpochStates = Array.from({length: 100}).fill(1) as ValidatorEpochState[]
    const liveness = getLiveness({ weightFactor: 0.5, activeEpochStates })
    expect(liveness).toBeGreaterThan(0.5)
  })
  
  it('should be 0 with all epoch inactive', () => {
    const activeEpochStates = Array.from({length: 100}).fill(0) as ValidatorEpochState[]
    const liveness = getLiveness({ weightFactor: 0.5, activeEpochStates })
    expect(liveness).toBeLessThan(0.5)
  })

  it('should be more than 0.5 with the second half active', () => {
    const activeEpochStates = Array.from({length: 100}).map((_, i) => i < 50 ? 0 : 1) as ValidatorEpochState[]
    const liveness = getLiveness({ weightFactor: 0.5, activeEpochStates })
    expect(liveness).toBeGreaterThan(0.5)
  })
})
