import type { FetchEpochsOptions } from './fetcher'
import type { ElectionSet } from './types'
import { InherentType } from 'nimiq-rpc-client-ts/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { electionBlockToElectionSet, fetchActivity, fetchElectionSet, fetchEpochs } from './fetcher'

const rpcMocks = vi.hoisted(() => ({
  getBlockByNumber: vi.fn(),
  getEpochNumber: vi.fn(),
  getInherentsByBatchNumber: vi.fn(),
  getStakersByValidatorAddress: vi.fn(),
  getValidatorByAddress: vi.fn(),
  getValidators: vi.fn(),
}))

vi.mock('@nimiq/utils/albatross-policy', () => ({
  batchAt: (blockNumber: number) => blockNumber,
  BATCHES_PER_EPOCH: 1,
  electionBlockOf: (epochIndex: number) => epochIndex * 1000,
  firstBlockOf: (epochIndex: number) => (epochIndex - 1) * 1000 + 1,
  isElectionBlockAt: () => true,
  SLOTS: 512,
}))

vi.mock('nimiq-rpc-client-ts/http', () => rpcMocks)

const ADDRESS_A = 'NQ02 31N6 3KM5 T6G5 22TN EPF5 5XPY RLHK RMB3'
const ADDRESS_A_COMPACT = 'nq0231n63km5t6g522tnepf55xpyrlhkrmb3'
const ADDRESS_B = 'NQ29 FBVT B4GM S27H UBP4 1MTC GNKQ VPBT 099M'

function createElectionSet(epochIndex: number, validators: ElectionSet['validators'] = [{ address: ADDRESS_A, numSlots: 3 }]): ElectionSet {
  return {
    epochIndex,
    electionBlockNumber: (epochIndex - 1) * 1000,
    validators,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  rpcMocks.getBlockByNumber.mockImplementation(async () => [
    true,
    undefined,
    {
      isElectionBlock: true,
      slots: [{ validator: ADDRESS_A, numSlots: 3 }],
    },
  ])
  rpcMocks.getEpochNumber.mockResolvedValue([true, undefined, 100])
  rpcMocks.getInherentsByBatchNumber.mockResolvedValue([
    true,
    undefined,
    [{ type: InherentType.Reward, validatorAddress: ADDRESS_A }],
  ])
})

describe('election block conversion', () => {
  it('converts election slots into a deterministically sorted election set', () => {
    expect(electionBlockToElectionSet(42, 123_456, {
      isElectionBlock: true,
      slots: [
        { validator: ADDRESS_B, numSlots: 9 },
        { validator: ADDRESS_A, numSlots: 3 },
      ],
    })).toEqual([
      true,
      undefined,
      {
        epochIndex: 42,
        electionBlockNumber: 123_456,
        validators: [
          { address: ADDRESS_A, numSlots: 3 },
          { address: ADDRESS_B, numSlots: 9 },
        ],
      },
    ])
  })

  it('rejects a block that is not an election block', () => {
    const result = electionBlockToElectionSet(42, 123_456, {
      isElectionBlock: false,
      slots: [],
    })

    expect(result[0]).toBe(false)
    expect(result[1]).toMatch(/not an election block/i)
    expect(result[2]).toBeUndefined()
  })

  it('rejects an election block without a slots array', () => {
    const result = electionBlockToElectionSet(42, 123_456, {
      isElectionBlock: true,
    })

    expect(result[0]).toBe(false)
    expect(result[1]).toMatch(/slots/i)
    expect(result[2]).toBeUndefined()
  })
})

describe('fetchActivity election set use', () => {
  it('uses preceding epoch election block for activity epoch election set', async () => {
    const [ok, , electionSet] = await fetchElectionSet(42)

    expect(ok).toBe(true)
    expect(rpcMocks.getBlockByNumber).toHaveBeenCalledWith({ blockNumber: 41_000, includeBody: false })
    expect(electionSet?.electionBlockNumber).toBe(41_000)
  })

  it('makes no election-block request when an election set is preloaded', async () => {
    const [ok] = await fetchActivity(42, { electionSet: createElectionSet(42) })

    expect(ok).toBe(true)
    expect(rpcMocks.getBlockByNumber).not.toHaveBeenCalled()
  })

  it('makes exactly one election-block request by default', async () => {
    const [ok] = await fetchActivity(42)

    expect(ok).toBe(true)
    expect(rpcMocks.getBlockByNumber).toHaveBeenCalledTimes(1)
    expect(rpcMocks.getBlockByNumber).toHaveBeenCalledWith({ blockNumber: 41_000, includeBody: false })
  })

  it('rejects an unfinished epoch before fetching activity batches', async () => {
    rpcMocks.getEpochNumber.mockResolvedValue([true, undefined, 42])

    const [ok, error] = await fetchActivity(42, { electionSet: createElectionSet(42) })

    expect(ok).toBe(false)
    expect(error).toMatch(/not finished yet/i)
    expect(rpcMocks.getInherentsByBatchNumber).not.toHaveBeenCalled()
  })

  it('matches differently formatted inherent addresses to the formatted storage key', async () => {
    rpcMocks.getInherentsByBatchNumber.mockResolvedValue([
      true,
      undefined,
      [{ type: InherentType.Reward, validatorAddress: ADDRESS_A_COMPACT }],
    ])

    const [ok, , activity] = await fetchActivity(42, { electionSet: createElectionSet(42) })

    expect(ok).toBe(true)
    expect(activity?.[ADDRESS_A]?.rewarded).toBe(1)
    expect(activity?.[ADDRESS_A_COMPACT]).toBeUndefined()
  })

  it('rejects duplicate canonical addresses in a preloaded election set', async () => {
    const [ok, error] = await fetchActivity(42, {
      electionSet: createElectionSet(42, [
        { address: ADDRESS_A, numSlots: 3 },
        { address: ADDRESS_A_COMPACT, numSlots: 4 },
      ]),
    })

    expect(ok).toBe(false)
    expect(error).toMatch(/duplicate validator/i)
    expect(rpcMocks.getInherentsByBatchNumber).not.toHaveBeenCalled()
  })
})

describe('fetchEpochs election set isolation', () => {
  it('does not reuse one preloaded election set for a different epoch', async () => {
    const results = []
    const unsafeOptions = { electionSet: createElectionSet(42) } as unknown as FetchEpochsOptions

    for await (const result of fetchEpochs([42, 43], unsafeOptions))
      results.push(result)

    expect(results).toHaveLength(2)
    expect(results.every(([ok]) => ok)).toBe(true)
    expect(rpcMocks.getBlockByNumber).toHaveBeenCalledTimes(2)
    expect(rpcMocks.getBlockByNumber).toHaveBeenNthCalledWith(1, { blockNumber: 41_000, includeBody: false })
    expect(rpcMocks.getBlockByNumber).toHaveBeenNthCalledWith(2, { blockNumber: 42_000, includeBody: false })
  })
})
