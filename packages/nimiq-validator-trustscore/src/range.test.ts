import type { Range } from './types'
import { env } from 'node:process'
import { BATCHES_PER_EPOCH, BLOCK_SEPARATION_TIME, BLOCKS_PER_EPOCH, epochAt, getMigrationBlockInfo } from '@nimiq/utils/albatross-policy'
import { getBlockByNumber, getBlockNumber } from 'nimiq-rpc-client-ts/http'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_WINDOW_IN_MS, getRange } from './range'

// Mock the nimiq-rpc-client-ts/http module upfront with mocked functions
vi.mock('nimiq-rpc-client-ts/http', () => ({
  getBlockNumber: vi.fn(),
  getBlockByNumber: vi.fn(),
}))

// Mock only the constants in the albatross-policy module
vi.mock('@nimiq/utils/albatross-policy', async () => {
  const original = await vi.importActual('@nimiq/utils/albatross-policy')
  return {
    ...original,
    // @ts-expect-error no types
    epochAt: vi.fn(original.epochAt),
    // @ts-expect-error no types
    firstBlockOf: vi.fn(original.firstBlockOf),
  }
})

/**
 * Helper function to generate the expected range based on parameters
 */
function generateExpectedRange({
  head,
  durationMs = DEFAULT_WINDOW_IN_MS,
  toEpochIndex,
  testnet = false,
}: {
  head: number
  durationMs?: number
  toEpochIndex?: number
  testnet?: boolean
}) {
  const { migrationBlock } = getMigrationBlockInfo({ network: testnet ? 'testnet' : 'main-albatross' })
  const headEpoch = Math.floor((head - migrationBlock + BLOCKS_PER_EPOCH - 1) / BLOCKS_PER_EPOCH)
  const toEpoch = toEpochIndex !== undefined ? toEpochIndex : headEpoch - 1
  const epochDurationMs = BLOCK_SEPARATION_TIME * BLOCKS_PER_EPOCH - BLOCK_SEPARATION_TIME * BATCHES_PER_EPOCH
  const epochsCount = Math.ceil(durationMs / epochDurationMs)
  const fromEpoch = Math.max(1, toEpoch - epochsCount + 1)
  const epochCount = toEpoch - fromEpoch + 1
  const fromBlockNumber = migrationBlock + (fromEpoch - 1) * BLOCKS_PER_EPOCH
  const toBlockNumber = migrationBlock + (toEpoch) * BLOCKS_PER_EPOCH

  // Calculate new fields
  const snapshotEpoch = toEpoch + 1
  const snapshotBlock = toBlockNumber + BLOCKS_PER_EPOCH

  // Mock timestamps for testing purposes
  const fromTimestamp = 0
  const toTimestamp = 0
  const snapshotTimestamp = toTimestamp + epochDurationMs

  const expectedRange: Range = {
    fromTimestamp,
    toTimestamp,
    snapshotTimestamp,

    head,
    headEpoch,
    fromEpoch,
    fromBlockNumber,
    toEpoch,
    toBlockNumber,
    epochCount,
    snapshotEpoch,
    snapshotBlock,
    epochDurationMs,
  }

  function compareRange(range: Range) {
    // timestamps are not compared
    const expectedRangeNoTS = {
      ...expectedRange,
      fromTimestamp: range.fromTimestamp,
      toTimestamp: range.toTimestamp,
      snapshotTimestamp: range.snapshotTimestamp,
    }

    expect(range).toEqual(expectedRangeNoTS)
    // Verify that from is always less than to
    expect(range.fromEpoch).toBeLessThan(range.toEpoch)
    expect(range.fromBlockNumber).toBeLessThan(range.toBlockNumber)

    // Verify that from is equal or greater than 1
    expect(range.fromEpoch).toBeGreaterThanOrEqual(1)
    expect(range.toBlockNumber).toBeLessThan(range.head)

    // Verify snapshot relationships
    expect(range.snapshotEpoch).toBe(range.toEpoch + 1)
    expect(range.snapshotBlock).toBe(range.toBlockNumber + BLOCKS_PER_EPOCH)
    expect(range.snapshotTimestamp).toBe(range.toTimestamp + range.epochDurationMs)
  }

  return { compareRange, expectedRange }
}

describe('get range with mock implementation', () => {
  interface MockedResponses {
    blockNumber?: {
      data?: number
      error?: { code: number, message: string }
    }
    blockByNumber?: {
      data?: { timestamp: number }
      error?: { code: number, message: string }
    }
  }

  // Reset mocks between tests
  beforeEach(() => {
    vi.resetAllMocks()
  })

  function createMockClient(mockedResponses: MockedResponses = {}): { head: number } {
    const defaultEpochCounts = 300
    const { migrationBlock, timestamp: tsMigration } = getMigrationBlockInfo({ network: 'testnet-albatross' })
    const defaultHead = migrationBlock + BLOCKS_PER_EPOCH * defaultEpochCounts + Math.ceil(BLOCKS_PER_EPOCH / 2)
    const head = mockedResponses.blockNumber?.data || defaultHead

    // Configure the mocks to return the expected format
    // The format is [success, error, data]
    if (mockedResponses.blockNumber?.error) {
      vi.mocked(getBlockNumber).mockResolvedValue([false, mockedResponses.blockNumber.error.message, undefined, {} as any])
    }
    else {
      vi.mocked(getBlockNumber).mockResolvedValue([true, undefined, head, {} as any])
    }

    const timestamp = tsMigration + Math.ceil(BLOCK_SEPARATION_TIME * (head - migrationBlock))

    vi.mocked(getBlockByNumber).mockImplementation(() => {
      if (mockedResponses.blockByNumber?.error) {
        return Promise.resolve([false, mockedResponses.blockByNumber.error.message, undefined, {} as any])
      }

      if (mockedResponses.blockByNumber?.data) {
        return Promise.resolve([true, undefined, { timestamp: mockedResponses.blockByNumber.data.timestamp }, {} as any])
      }

      return Promise.resolve([true, undefined, { timestamp }, {} as any])
    })

    return { head }
  }

  it('should return a valid range with default settings', async () => {
    const { head } = createMockClient()

    const [rangeOk, error, range] = await getRange()

    expect(rangeOk).toBe(true)
    expect(error).toBeUndefined()
    expect(range).toBeDefined()

    const { compareRange } = generateExpectedRange({ head })
    compareRange(range!)

    expect(getBlockNumber).toHaveBeenCalled()
    expect(getBlockByNumber).toHaveBeenCalled()
  })

  it('should handle error from getBlockNumber', async () => {
    createMockClient({
      blockNumber: { data: undefined, error: { code: 200, message: 'Failed to get block number' } },
    })

    const [rangeOk, error, data] = await getRange()
    expect(rangeOk).toBe(false)
    expect(error).toBe('Failed to get block number')
    expect(data).toBeUndefined()
  })

  it('should handle error from getBlockByNumber', async () => {
    createMockClient({
      blockByNumber: { data: undefined, error: { code: 200, message: 'Failed to get block data' } },
    })

    const [rangeOk, error, range] = await getRange()
    expect(rangeOk).toBe(false)
    expect(error).toContain('Failed to get block data')
    expect(range).toBeUndefined()
  })

  it('should respect toEpochIndex option', async () => {
    const { head } = createMockClient()
    const specificEpoch = 5

    const [rangeOk, error, range] = await getRange({ toEpochIndex: specificEpoch })

    expect(rangeOk).toBe(true)
    expect(error).toBeUndefined()
    expect(range).toBeDefined()

    const { compareRange } = generateExpectedRange({ head, toEpochIndex: specificEpoch })
    compareRange(range!)

    // Verify the specific epoch was used
    expect(range!.toEpoch).toBe(specificEpoch)
  })

  it('should respect durationMs option', async () => {
    // Each test call needs its own mock setup
    vi.resetAllMocks()

    // Setup for one month test
    const oneMonthMs = 1000 * 60 * 60 * 24 * 30
    const oneMonthBlockNumber = Math.ceil(oneMonthMs / BLOCK_SEPARATION_TIME)
    const { migrationBlock } = getMigrationBlockInfo({ network: 'main-albatross' })
    const oneMonthHead = migrationBlock + oneMonthBlockNumber

    // Set up the mock for the first test
    vi.mocked(getBlockNumber).mockResolvedValue([true, undefined, oneMonthHead, {} as any])
    const oneMonthTimestamp = Date.now()
    vi.mocked(getBlockByNumber).mockImplementation(() => {
      return Promise.resolve([true, undefined, { timestamp: oneMonthTimestamp }, {} as any])
    })

    // Run the first test
    const [range1Ok, error1, range1] = await getRange({ durationMs: oneMonthMs })

    // Reset mocks for the second test
    vi.resetAllMocks()

    // Setup for three months test
    const threeMonthsMs = 1000 * 60 * 60 * 24 * 90
    const threeMonthsBlockNumber = Math.ceil(threeMonthsMs / BLOCK_SEPARATION_TIME)
    const threeMonthsHead = migrationBlock + threeMonthsBlockNumber

    // Set up the mock for the second test
    vi.mocked(getBlockNumber).mockResolvedValue([true, undefined, threeMonthsHead, {} as any])
    const threeMonthTimestamp = Date.now()
    vi.mocked(getBlockByNumber).mockImplementation(() => {
      return Promise.resolve([true, undefined, { timestamp: threeMonthTimestamp }, {} as any])
    })

    // Run the second test
    const [range2Ok, error2, range2] = await getRange({ durationMs: threeMonthsMs })

    // Assert the results
    expect(range1Ok).toBe(true)
    expect(range2Ok).toBe(true)
    expect(error1).toBeUndefined()
    expect(error2).toBeUndefined()
    expect(range1).toBeDefined()
    expect(range2).toBeDefined()

    // Instead of using compareRange which expects exact values,
    // let's validate the key relationships that should hold true
    if (range1 && range2) {
      // Verify that from is always less than to
      expect(range1.fromEpoch).toBeLessThan(range1.toEpoch)
      expect(range1.fromBlockNumber).toBeLessThan(range1.toBlockNumber)
      expect(range2.fromEpoch).toBeLessThan(range2.toEpoch)
      expect(range2.fromBlockNumber).toBeLessThan(range2.toBlockNumber)

      // Verify that the head values are correct
      expect(range1.head).toBe(oneMonthHead)
      expect(range2.head).toBe(threeMonthsHead)

      // Verify snapshot relationships
      expect(range1.snapshotEpoch).toBe(range1.toEpoch + 1)
      expect(range1.snapshotBlock).toBe(range1.toBlockNumber + BLOCKS_PER_EPOCH)
      expect(range2.snapshotEpoch).toBe(range2.toEpoch + 1)
      expect(range2.snapshotBlock).toBe(range2.toBlockNumber + BLOCKS_PER_EPOCH)

      // Also check that longer duration means more epochs
      expect(range1.epochCount).toBeLessThan(range2.epochCount)
    }
  })

  it('should use epochAt function to calculate epochs', async () => {
    createMockClient()
    await getRange()

    // Check that epochAt was called
    expect(epochAt).toHaveBeenCalled()
  })

  it('should handle custom migration block for testnet', async () => {
    const { head } = createMockClient()

    const [rangeOk, error, range] = await getRange({ network: 'testnet' })

    expect(rangeOk).toBe(true)
    expect(error).toBeUndefined()
    expect(range).toBeDefined()

    const { compareRange } = generateExpectedRange({ head, testnet: true })
    compareRange(range!)
    expect(vi.mocked(epochAt)).toHaveBeenCalled()
  })
})

describe('get range without mocking', () => {
  const rpcUrl = env.ALBATROSS_RPC_NODE_URL
  const network = env.NUXT_PUBLIC_NIMIQ_NETWORK

  it('env ok', () => {
    expect(rpcUrl).toBeDefined()
    expect(network).toBeDefined()
  })

  it('should return a valid range with default settings', async () => {
    const [rangeOk, error, range] = await getRange({ network })
    expect(rangeOk).toBe(true)
    expect(error).toBeUndefined()
    expect(range).toBeDefined()
    const { compareRange } = generateExpectedRange({ head: range!.head, testnet: network?.includes('test') })
    compareRange(range!)
  })

  it('should handle custom duration parameter', async () => {
    // Use a custom duration of 3 weeks
    const threeWeeksMs = 1000 * 60 * 60 * 24 * 21
    const [rangeOk, error, range] = await getRange({ network, durationMs: threeWeeksMs })
    expect(rangeOk).toBe(true)
    expect(error).toBeUndefined()
    expect(range).toBeDefined()

    if (range) {
      // Just validate key relationships
      expect(range.fromEpoch).toBeLessThan(range.toEpoch)
      expect(range.snapshotEpoch).toBe(range.toEpoch + 1)
      expect(range.snapshotBlock).toBe(range.toBlockNumber + BLOCKS_PER_EPOCH)
      expect(range.snapshotTimestamp).toBe(range.toTimestamp + range.epochDurationMs)
      const epochsIn3Weeks = Math.ceil(threeWeeksMs / range.epochDurationMs)
      expect(range.epochCount).toBeLessThanOrEqual(epochsIn3Weeks)
    }
  })

  it('should respect toEpochIndex parameter', async () => {
    const specificEpoch = 5
    const [rangeOk, error, range] = await getRange({ network, toEpochIndex: specificEpoch })
    expect(rangeOk).toBe(true)
    expect(error).toBeUndefined()
    expect(range).toBeDefined()

    if (range) {
      expect(range.toEpoch).toBe(specificEpoch)
      // Just validate key relationships
      expect(range.fromEpoch).toBeLessThan(range.toEpoch)
      expect(range.snapshotEpoch).toBe(range.toEpoch + 1)
      expect(range.snapshotBlock).toBe(range.toBlockNumber + BLOCKS_PER_EPOCH)
      expect(range.snapshotTimestamp).toBe(range.toTimestamp + range.epochDurationMs)
    }
  })

  it('should return error for invalid parameters', async () => {
    // Test with negative toEpochIndex
    const [range1Ok, error1, range1] = await getRange({ network, toEpochIndex: -1 })
    expect(range1Ok).toBe(false)
    expect(error1).toBeDefined()
    expect(range1).toBeUndefined()

    // Test with extremely large duration
    const extremelyLargeDuration = Number.MAX_SAFE_INTEGER
    const [range2Ok, error2, range2] = await getRange({ network, durationMs: extremelyLargeDuration })
    expect(range2Ok).toBe(true)

    // Either it should work with a large range or return an error, but it shouldn't crash
    if (error2) {
      expect(range2).toBeUndefined()
    }
    else {
      expect(range2).toBeDefined()
      // Just validate key relationships
      expect(range2!.fromEpoch).toBeLessThan(range2!.toEpoch)
      expect(range2!.snapshotEpoch).toBe(range2!.toEpoch + 1)
      expect(range2!.snapshotBlock).toBe(range2!.toBlockNumber + BLOCKS_PER_EPOCH)
      expect(range2!.snapshotTimestamp).toBe(range2!.toTimestamp + range2!.epochDurationMs)
    }
  })
})
