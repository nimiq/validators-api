import type { Range } from './types'
import { env } from 'node:process'
import { BATCHES_PER_EPOCH, BLOCK_SEPARATION_TIME, BLOCKS_PER_EPOCH, epochAt, getMigrationBlockInfo } from '@nimiq/utils/albatross-policy'
import { NimiqRPCClient } from 'nimiq-rpc-client-ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_WINDOW_IN_MS, getRange } from './range'

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
  const currentEpoch = Math.floor((head - migrationBlock + BLOCKS_PER_EPOCH - 1) / BLOCKS_PER_EPOCH)
  const toEpoch = toEpochIndex !== undefined ? toEpochIndex : currentEpoch - 1
  const epochsCount = Math.ceil(durationMs / (BLOCK_SEPARATION_TIME * BLOCKS_PER_EPOCH))
  const fromEpoch = Math.max(1, toEpoch - epochsCount + 1)
  const epochCount = toEpoch - fromEpoch + 1
  const fromBlockNumber = migrationBlock + (fromEpoch - 1) * BLOCKS_PER_EPOCH
  const toBlockNumber = migrationBlock + (toEpoch) * BLOCKS_PER_EPOCH

  // Calculate new fields
  const snapshotEpoch = toEpoch + 1
  const snapshotBlock = toBlockNumber + BLOCKS_PER_EPOCH
  const epochDurationMs = BLOCK_SEPARATION_TIME * BLOCKS_PER_EPOCH - BLOCK_SEPARATION_TIME * BATCHES_PER_EPOCH

  // Mock timestamps for testing purposes
  const fromTimestamp = 0
  const toTimestamp = 0
  const snapshotTimestamp = toTimestamp + epochDurationMs

  const expectedRange: Range = {
    fromTimestamp,
    toTimestamp,
    snapshotTimestamp,

    head,
    currentEpoch,
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

  function createMockClient(mockedResponses: MockedResponses = {}): { mockClient: NimiqRPCClient, head: number } {
    const defaultEpochCounts = 300
    const { migrationBlock, timestamp: tsMigration } = getMigrationBlockInfo({ network: 'testnet-albatross' })
    const defaultHead = migrationBlock + BLOCKS_PER_EPOCH * defaultEpochCounts + Math.ceil(BLOCKS_PER_EPOCH / 2)
    const head = mockedResponses.blockNumber?.data || defaultHead
    const headResponse = mockedResponses.blockNumber || { data: head || defaultHead }
    const timestamp = tsMigration + Math.ceil(BLOCK_SEPARATION_TIME * (head - migrationBlock))

    return {
      head,
      mockClient: {
        blockchain: {
          getBlockNumber: vi.fn().mockResolvedValue(headResponse),
          getBlockByNumber: vi.fn().mockImplementation(() => {
            if (mockedResponses.blockByNumber)
              return mockedResponses.blockByNumber
            return Promise.resolve({ data: { timestamp }, error: undefined })
          }),
        },
      } as unknown as NimiqRPCClient,
    }
  }

  it('should return a valid range with default settings', async () => {
    const { mockClient, head } = createMockClient()

    const [rangeOk, error, range] = await getRange(mockClient as NimiqRPCClient)

    expect(rangeOk).toBe(true)
    expect(error).toBeUndefined()
    expect(range).toBeDefined()

    const { compareRange } = generateExpectedRange({ head })
    compareRange(range!)

    expect(mockClient.blockchain.getBlockNumber).toHaveBeenCalled()
    expect(mockClient.blockchain.getBlockByNumber).toHaveBeenCalled()
  })

  it('should handle error from getBlockNumber', async () => {
    const { mockClient } = createMockClient({
      blockNumber: { data: undefined, error: { code: 200, message: 'Failed to get block number' } },
    })

    const [rangeOk, error, data] = await getRange(mockClient as NimiqRPCClient)
    expect(rangeOk).toBe(false)
    expect(error).toBe('Failed to get block number')
    expect(data).toBeUndefined()
  })

  it('should handle error from getBlockByNumber', async () => {
    const { mockClient } = createMockClient({
      blockByNumber: { data: undefined, error: { code: 200, message: 'Failed to get block data' } },
    })

    const [rangeOk, error, range] = await getRange(mockClient as NimiqRPCClient)
    expect(rangeOk).toBe(false)
    expect(error).toContain('Failed to get block data')
    expect(range).toBeUndefined()
  })

  it('should respect toEpochIndex option', async () => {
    const { mockClient, head } = createMockClient()
    const specificEpoch = 5

    const [rangeOk, error, range] = await getRange(mockClient as NimiqRPCClient, { toEpochIndex: specificEpoch })

    expect(rangeOk).toBe(true)
    expect(error).toBeUndefined()
    expect(range).toBeDefined()

    const { compareRange } = generateExpectedRange({ head, toEpochIndex: specificEpoch })
    compareRange(range!)

    // Verify the specific epoch was used
    expect(range!.toEpoch).toBe(specificEpoch)
  })

  it('should respect durationMs option', async () => {
    // Setup for one month test
    const oneMonthMs = 1000 * 60 * 60 * 24 * 30
    const oneMonthBlockNumber = Math.ceil(oneMonthMs / BLOCK_SEPARATION_TIME)
    const { migrationBlock } = getMigrationBlockInfo({ network: 'main-albatross' })
    const { mockClient: mockClientOneMonth } = createMockClient({
      blockNumber: { data: migrationBlock + oneMonthBlockNumber, error: undefined },
    })

    // Setup for three months test
    const threeMonthsMs = 1000 * 60 * 60 * 24 * 90
    const threeMonthsBlockNumber = Math.ceil(threeMonthsMs / BLOCK_SEPARATION_TIME)
    const { mockClient: mockClientThreeMonths } = createMockClient({
      blockNumber: { data: migrationBlock + threeMonthsBlockNumber, error: undefined },
    })

    // Run the tests
    const oneMonthHead = await mockClientOneMonth.blockchain.getBlockNumber().then(r => r.data)
    const threeMonthsHead = await mockClientThreeMonths.blockchain.getBlockNumber().then(r => r.data)

    const [range1Ok, error1, range1] = await getRange(mockClientOneMonth as NimiqRPCClient, { durationMs: oneMonthMs })
    const [range2Ok, error2, range2] = await getRange(mockClientThreeMonths as NimiqRPCClient, { durationMs: threeMonthsMs })

    expect(range1Ok).toBe(true)
    expect(range2Ok).toBe(true)
    expect(error1).toBeUndefined()
    expect(error2).toBeUndefined()
    expect(range1).toBeDefined()
    expect(range2).toBeDefined()

    const { compareRange: compareRange1 } = generateExpectedRange({ head: oneMonthHead!, durationMs: oneMonthMs })
    const { compareRange: compareRange2 } = generateExpectedRange({ head: threeMonthsHead!, durationMs: threeMonthsMs })

    compareRange1(range1!)
    compareRange2(range2!)

    // Also check that longer duration means more epochs
    expect(range1!.epochCount).toBeLessThan(range2!.epochCount)
  })

  it('should use epochAt function to calculate epochs', async () => {
    const { mockClient } = createMockClient()
    await getRange(mockClient as NimiqRPCClient)

    // Check that epochAt was called
    expect(epochAt).toHaveBeenCalled()
  })

  it('should handle custom migration block for testnet', async () => {
    const { mockClient, head } = createMockClient()

    const [rangeOk, error, range] = await getRange(mockClient as NimiqRPCClient, { network: 'testnet' })

    expect(rangeOk).toBe(true)
    expect(error).toBeUndefined()
    expect(range).toBeDefined()

    const { compareRange } = generateExpectedRange({ head, testnet: true })
    compareRange(range!)
    expect(vi.mocked(epochAt)).toHaveBeenCalled()
  })
})

describe('get range without mocking', () => {
  const rpcUrl = env.NUXT_RPC_URL
  const network = env.NUXT_PUBLIC_NIMIQ_NETWORK

  it('env ok', () => {
    expect(rpcUrl).toBeDefined()
    expect(network).toBeDefined()
  })

  let client: NimiqRPCClient
  beforeEach(() => {
    client = new NimiqRPCClient(rpcUrl!)
  })

  it('should return a valid range with default settings', async () => {
    const [rangeOk, error, range] = await getRange(client, { network })
    expect(rangeOk).toBe(true)
    expect(error).toBeUndefined()
    expect(range).toBeDefined()
    const { compareRange } = generateExpectedRange({ head: range!.head, testnet: network?.includes('test') })
    compareRange(range!)
  })

  it('should handle custom duration parameter', async () => {
    // Use a custom duration of 2 weeks
    const twoWeeksMs = 1000 * 60 * 60 * 24 * 14
    const [rangeOk, error, range] = await getRange(client, { network, durationMs: twoWeeksMs })
    expect(rangeOk).toBe(true)
    expect(error).toBeUndefined()
    expect(range).toBeDefined()

    if (range) {
      // Just validate key relationships
      expect(range.fromEpoch).toBeLessThan(range.toEpoch)
      expect(range.snapshotEpoch).toBe(range.toEpoch + 1)
      expect(range.snapshotBlock).toBe(range.toBlockNumber + BLOCKS_PER_EPOCH)
      expect(range.snapshotTimestamp).toBe(range.toTimestamp + range.epochDurationMs)
      const epochsIn2Weeks = Math.ceil(twoWeeksMs / (BLOCK_SEPARATION_TIME * BLOCKS_PER_EPOCH))
      expect(range.epochCount).toBeLessThanOrEqual(epochsIn2Weeks)
    }
  })

  it('should respect toEpochIndex parameter', async () => {
    const specificEpoch = 5
    const [rangeOk, error, range] = await getRange(client, { network, toEpochIndex: specificEpoch })
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
    const [range1Ok, error1, range1] = await getRange(client, { network, toEpochIndex: -1 })
    expect(range1Ok).toBe(false)
    expect(error1).toBeDefined()
    expect(range1).toBeUndefined()

    // Test with extremely large duration
    const extremelyLargeDuration = Number.MAX_SAFE_INTEGER
    const [range2Ok, error2, range2] = await getRange(client, { network, durationMs: extremelyLargeDuration })
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
