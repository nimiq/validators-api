import { describe, expect, it, beforeEach } from 'vitest'
import { getLiveness } from './score'

describe('should compute livenes correctly', () => {
  const fromEpoch = 3075210
  const toEpoch = 5062410
  const blocksPerEpoch = 43200
  const activeEpochBlockNumbers = Array.from({ length: Math.floor((toEpoch - fromEpoch) / blocksPerEpoch) }, (_, i) => fromEpoch + i * blocksPerEpoch)
  const weightFactor = 0.5
  
  it('exported', () => {
    const liveness = getLiveness({fromEpoch, toEpoch, weightFactor, activeEpochBlockNumbers, blocksPerEpoch })
    expect(liveness).toBeGreaterThan(0.5)
  })
})
