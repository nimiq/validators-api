import type { ElectionSet, EpochActivity } from 'nimiq-validator-trustscore/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { synchronizeCompletedEpoch } from './activity-sync'

vi.mock('./drizzle', () => ({
  tables: {
    activity: {
      epochNumber: 'epoch_number',
      likelihood: 'likelihood',
      missed: 'missed',
      rewarded: 'rewarded',
      validatorId: 'validator_id',
    },
    validators: {
      id: 'id',
      address: 'address',
    },
  },
  useDrizzle: vi.fn(),
}))

vi.mock('./activities', () => ({
  repairCompletedEpoch: vi.fn(),
  resolveCompletedEpochValidatorIds: vi.fn(),
}))

vi.mock('./activity-epochs', () => ({
  beginActivityEpochAttempt: vi.fn(),
  finalizeVerifiedCompletedEpoch: vi.fn(),
  markActivityEpochFailed: vi.fn(),
}))

vi.mock('~~/packages/nimiq-validator-trustscore/src/fetcher', () => ({
  fetchActivity: vi.fn(),
  fetchElectionSet: vi.fn(),
}))

const EPOCH = 42
const ADDRESS_A = 'NQ02 31N6 3KM5 T6G5 22TN EPF5 5XPY RLHK RMB3'
const ADDRESS_B = 'NQ29 FBVT B4GM S27H UBP4 1MTC GNKQ VPBT 099M'

const electionSet: ElectionSet = {
  epochIndex: EPOCH,
  electionBlockNumber: 123_456,
  validators: [
    { address: ADDRESS_A, numSlots: 256 },
    { address: ADDRESS_B, numSlots: 256 },
  ],
}

const activity: EpochActivity = {
  [ADDRESS_A]: {
    address: ADDRESS_A,
    elected: true,
    likelihood: 256,
    missed: 0,
    rewarded: 720,
    dominanceRatioViaBalance: -1,
    dominanceRatioViaSlots: 0.5,
    balance: -1,
    stakers: 0,
  },
  [ADDRESS_B]: {
    address: ADDRESS_B,
    elected: true,
    likelihood: 256,
    missed: 0,
    rewarded: 720,
    dominanceRatioViaBalance: -1,
    dominanceRatioViaSlots: 0.5,
    balance: -1,
    stakers: 0,
  },
}

function createDependencies() {
  return {
    beginActivityEpochAttempt: vi.fn().mockResolvedValue(true),
    fetchElectionSet: vi.fn().mockResolvedValue([true, undefined, electionSet]),
    fetchActivity: vi.fn().mockResolvedValue([true, undefined, activity]),
    getStoredFinalizedElectedAddresses: vi.fn().mockResolvedValue([ADDRESS_B.replaceAll(' ', ''), ADDRESS_A]),
    finalizeVerifiedEpoch: vi.fn().mockResolvedValue(undefined),
    repairCompletedEpoch: vi.fn().mockResolvedValue(undefined),
    markActivityEpochFailed: vi.fn().mockResolvedValue(undefined),
    now: vi.fn().mockReturnValue(new Date('2026-07-29T12:00:00.000Z')),
  }
}

describe('synchronizeCompletedEpoch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('verifies an exact stored elected-address set without a full activity fetch', async () => {
    const dependencies = createDependencies()

    await expect(synchronizeCompletedEpoch(EPOCH, 'testnet', dependencies)).resolves.toEqual({
      epochNumber: EPOCH,
      status: 'verified',
    })

    expect(dependencies.fetchElectionSet).toHaveBeenCalledWith(EPOCH, { network: 'testnet' })
    expect(dependencies.getStoredFinalizedElectedAddresses).toHaveBeenCalledWith(EPOCH)
    expect(dependencies.fetchActivity).not.toHaveBeenCalled()
    expect(dependencies.finalizeVerifiedEpoch).toHaveBeenCalledWith(
      EPOCH,
      electionSet,
      '2026-07-29T12:00:00.000Z',
    )
    expect(dependencies.repairCompletedEpoch).not.toHaveBeenCalled()
  })

  it('refetches and atomically repairs a mismatched stored elected-address set', async () => {
    const dependencies = createDependencies()
    dependencies.getStoredFinalizedElectedAddresses.mockResolvedValue([ADDRESS_A])

    await expect(synchronizeCompletedEpoch(EPOCH, 'testnet', dependencies)).resolves.toEqual({
      epochNumber: EPOCH,
      status: 'repaired',
    })

    expect(dependencies.fetchActivity).toHaveBeenCalledWith(EPOCH, expect.objectContaining({
      network: 'testnet',
      electionSet,
      maxRetries: 1,
    }))
    expect(dependencies.repairCompletedEpoch).toHaveBeenCalledWith(
      EPOCH,
      electionSet,
      activity,
      '2026-07-29T12:00:00.000Z',
    )
    expect(dependencies.finalizeVerifiedEpoch).not.toHaveBeenCalled()
  })

  it('returns a failed outcome and records marker failure when full activity fetch fails', async () => {
    const dependencies = createDependencies()
    dependencies.getStoredFinalizedElectedAddresses.mockResolvedValue([])
    dependencies.fetchActivity.mockResolvedValue([false, 'RPC unavailable', undefined])

    await expect(synchronizeCompletedEpoch(EPOCH, 'testnet', dependencies)).resolves.toEqual({
      epochNumber: EPOCH,
      status: 'failed',
      error: 'RPC unavailable',
      repairAttempted: true,
    })

    expect(dependencies.markActivityEpochFailed).toHaveBeenCalledWith(
      EPOCH,
      expect.objectContaining({ message: 'RPC unavailable' }),
      '2026-07-29T12:00:00.000Z',
    )
    expect(dependencies.repairCompletedEpoch).not.toHaveBeenCalled()
  })

  it('returns already_finalized without fetching when attempt claim is refused', async () => {
    const dependencies = createDependencies()
    dependencies.beginActivityEpochAttempt.mockResolvedValue(false)

    await expect(synchronizeCompletedEpoch(EPOCH, 'testnet', dependencies)).resolves.toEqual({
      epochNumber: EPOCH,
      status: 'already_finalized',
    })

    expect(dependencies.fetchElectionSet).not.toHaveBeenCalled()
    expect(dependencies.getStoredFinalizedElectedAddresses).not.toHaveBeenCalled()
    expect(dependencies.fetchActivity).not.toHaveBeenCalled()
    expect(dependencies.finalizeVerifiedEpoch).not.toHaveBeenCalled()
    expect(dependencies.repairCompletedEpoch).not.toHaveBeenCalled()
    expect(dependencies.markActivityEpochFailed).not.toHaveBeenCalled()
  })
})
