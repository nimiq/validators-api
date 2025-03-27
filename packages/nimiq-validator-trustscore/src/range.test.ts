import type { Range } from './types'
import { env } from 'node:process'
import { BLOCK_SEPARATION_TIME, BLOCKS_PER_EPOCH, epochAt, PROOF_OF_STAKE_MIGRATION_BLOCK, PROOF_OF_STAKE_MIGRATION_BLOCK_TESTNET } from '@nimiq/utils/albatross-policy'
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
}): Range {
  const migrationBlock = testnet ? PROOF_OF_STAKE_MIGRATION_BLOCK_TESTNET : PROOF_OF_STAKE_MIGRATION_BLOCK
  const currentEpoch = Math.floor((head - migrationBlock + BLOCKS_PER_EPOCH - 1) / BLOCKS_PER_EPOCH)
  const toEpoch = toEpochIndex !== undefined ? toEpochIndex : currentEpoch - 1
  const epochsCount = Math.ceil(durationMs / (BLOCK_SEPARATION_TIME * BLOCKS_PER_EPOCH))
  const fromEpoch = Math.max(1, toEpoch - epochsCount + 1)
  const epochCount = toEpoch - fromEpoch + 1
  const fromBlockNumber = migrationBlock + (fromEpoch - 1) * BLOCKS_PER_EPOCH
  const toBlockNumber = migrationBlock + (toEpoch - 1) * BLOCKS_PER_EPOCH - 1

  return {
    epochCount,
    fromEpoch,
    fromBlockNumber,
    toEpoch,
    toBlockNumber,
    currentEpoch,
    head,
  }
}

/**
 * Helper function to validate common range properties
 */
function validateRangeProperties(range: Range): void {
  // Verify that from is always less than to
  expect(range.fromEpoch).toBeLessThan(range.toEpoch)
  expect(range.fromBlockNumber).toBeLessThan(range.toBlockNumber)

  // Verify that from is equal or greater than 1
  expect(range.fromEpoch).toBeGreaterThanOrEqual(1)
  expect(range.toBlockNumber).toBeLessThan(range.head)
}

describe('get range with mock implementation', () => {
  interface MockedResponses {
    blockNumber?: {
      data?: number
      error?: { code: number, message: string }
    }
  }

  function createMockClient(mockedResponses: MockedResponses = {}): NimiqRPCClient {
    const defaultEpochNumber = 10
    const defaultBlockNumber = PROOF_OF_STAKE_MIGRATION_BLOCK + Math.ceil(BLOCKS_PER_EPOCH * defaultEpochNumber + (BLOCKS_PER_EPOCH / 2))
    return {
      blockchain: {
        getBlockNumber: vi.fn().mockResolvedValue(
          mockedResponses.blockNumber || { data: defaultBlockNumber, error: undefined },
        ),
      },
    } as unknown as NimiqRPCClient
  }

  it('should return a valid range with default settings', async () => {
    const mockClient = createMockClient()
    const defaultBlockNumber = await mockClient.blockchain.getBlockNumber().then(r => r.data)

    const { data: range, error } = await getRange(mockClient as NimiqRPCClient)

    expect(error).toBeUndefined()
    expect(range).toBeDefined()

    const expectedRange = generateExpectedRange({
      head: defaultBlockNumber!,
    })

    expect(range).toEqual(expectedRange)
    validateRangeProperties(range!)
    expect(mockClient.blockchain.getBlockNumber).toHaveBeenCalled()
  })

  it('should handle error from getBlockNumber', async () => {
    const mockClient = createMockClient({
      blockNumber: { data: undefined, error: { code: 200, message: 'Failed to get block number' } },
    })

    const { data, error } = await getRange(mockClient as NimiqRPCClient)

    expect(error).toBe('Failed to get block number')
    expect(data).toBeUndefined()
  })

  it('should respect toEpochIndex option', async () => {
    const mockClient = createMockClient()
    const defaultBlockNumber = await mockClient.blockchain.getBlockNumber().then(r => r.data)
    const specificEpoch = 5

    const { data: range } = await getRange(mockClient as NimiqRPCClient, { toEpochIndex: specificEpoch })

    const expectedRange = generateExpectedRange({
      head: defaultBlockNumber!,
      toEpochIndex: specificEpoch,
    })

    expect(range).toEqual(expectedRange)
    validateRangeProperties(range!)
    expect(range?.toEpoch).toBe(specificEpoch)
  })

  it('should respect durationMs option', async () => {
    // Setup for one month test
    const oneMonthMs = 1000 * 60 * 60 * 24 * 30
    const oneMonthBlockNumber = Math.ceil(oneMonthMs / BLOCK_SEPARATION_TIME)
    const mockClientOneMonth = createMockClient({
      blockNumber: { data: PROOF_OF_STAKE_MIGRATION_BLOCK + oneMonthBlockNumber, error: undefined },
    })

    // Setup for three months test
    const threeMonthsMs = 1000 * 60 * 60 * 24 * 90
    const threeMonthsBlockNumber = Math.ceil(threeMonthsMs / BLOCK_SEPARATION_TIME)
    const mockClientThreeMonths = createMockClient({
      blockNumber: { data: PROOF_OF_STAKE_MIGRATION_BLOCK + threeMonthsBlockNumber, error: undefined },
    })

    // Run the tests
    const oneMonthHead = await mockClientOneMonth.blockchain.getBlockNumber().then(r => r.data)
    const threeMonthsHead = await mockClientThreeMonths.blockchain.getBlockNumber().then(r => r.data)

    const { data: range1, error: error1 } = await getRange(mockClientOneMonth as NimiqRPCClient, { durationMs: oneMonthMs })
    const { data: range2, error: error2 } = await getRange(mockClientThreeMonths as NimiqRPCClient, { durationMs: threeMonthsMs })

    // Generate expected ranges
    const expectedRange1 = generateExpectedRange({ head: oneMonthHead!, durationMs: oneMonthMs })
    const expectedRange2 = generateExpectedRange({ head: threeMonthsHead!, durationMs: threeMonthsMs })

    // Assertions
    expect(error1).toBeUndefined()
    expect(error2).toBeUndefined()
    expect(range1).toEqual(expectedRange1)
    expect(range2).toEqual(expectedRange2)
    validateRangeProperties(range1!)
    validateRangeProperties(range2!)
    expect(range1!.epochCount).toBeLessThan(range2!.epochCount)
  })

  it('should use epochAt function to calculate epochs', async () => {
    const mockClient = createMockClient()
    await getRange(mockClient as NimiqRPCClient)

    // Check that epochAt was called
    expect(epochAt).toHaveBeenCalled()
  })

  it('should handle custom migration block for testnet', async () => {
    const mockClient = createMockClient()
    const defaultBlockNumber = await mockClient.blockchain.getBlockNumber().then(r => r.data)

    const { data: range } = await getRange(mockClient as NimiqRPCClient, { testnet: true })

    const expectedRange = generateExpectedRange({
      head: defaultBlockNumber!,
      testnet: true,
    })

    expect(range).toEqual(expectedRange)
    expect(vi.mocked(epochAt)).toHaveBeenCalled()
  })
})

describe('get range without mocking', () => {
  const rpcUrl = env.NUXT_RPC_URL
  const nimiqNetwork = env.NUXT_PUBLIC_NIMIQ_NETWORK
  const isTestnet = nimiqNetwork === 'test-albatross'

  it('env ok', () => {
    expect(rpcUrl).toBeDefined()
    expect(nimiqNetwork).toBeDefined()
  })

  let client: NimiqRPCClient
  beforeEach(() => {
    client = new NimiqRPCClient(rpcUrl!)
  })

  it('should return a valid range with default settings', async () => {
    const { data: range, error } = await getRange(client, { testnet: isTestnet })

    expect(error).toBeUndefined()
    expect(range).toBeDefined()

    if (range) {
      const expectedRange = generateExpectedRange({
        head: range.head,
        testnet: isTestnet,
      })

      expect(range).toEqual(expectedRange)
      validateRangeProperties(range)
    }
  })

  it('should handle custom duration parameter', async () => {
    // Use a custom duration of 2 weeks
    const twoWeeksMs = 1000 * 60 * 60 * 24 * 14
    const { data: range, error } = await getRange(client, { testnet: isTestnet, durationMs: twoWeeksMs })

    expect(error).toBeUndefined()
    expect(range).toBeDefined()

    if (range) {
      const expectedRange = generateExpectedRange({
        head: range.head,
        durationMs: twoWeeksMs,
        testnet: isTestnet,
      })

      expect(range).toEqual(expectedRange)
      validateRangeProperties(range)

      const epochsIn2Weeks = Math.ceil(twoWeeksMs / (BLOCK_SEPARATION_TIME * BLOCKS_PER_EPOCH))
      expect(range.epochCount).toBeLessThanOrEqual(epochsIn2Weeks)
    }
  })

  it('should respect toEpochIndex parameter', async () => {
    const specificEpoch = 5
    const { data: range, error } = await getRange(client, { testnet: isTestnet, toEpochIndex: specificEpoch })

    expect(error).toBeUndefined()
    expect(range).toBeDefined()

    if (range) {
      const expectedRange = generateExpectedRange({
        head: range.head,
        toEpochIndex: specificEpoch,
        testnet: isTestnet,
      })

      expect(range).toEqual(expectedRange)
      validateRangeProperties(range)
      expect(range.toEpoch).toBe(specificEpoch)
    }
  })

  it('should return error for invalid parameters', async () => {
    // Test with negative toEpochIndex
    const { data: range1, error: error1 } = await getRange(client, { testnet: isTestnet, toEpochIndex: -1 })

    expect(error1).toBeDefined()
    expect(range1).toBeUndefined()

    // Test with extremely large duration
    const extremelyLargeDuration = Number.MAX_SAFE_INTEGER
    const { data: range2, error: error2 } = await getRange(client, { testnet: isTestnet, durationMs: extremelyLargeDuration })

    // Either it should work with a large range or return an error, but it shouldn't crash
    if (error2)
      expect(range2).toBeUndefined()
    else
      expect(range2).toBeDefined()
  })
})
