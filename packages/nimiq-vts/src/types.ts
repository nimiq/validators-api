export enum ValidatorEpochState {
  Active = 1,
  Inactive = 0,
}

export type ScoreParams = {
  liveness: {
    // How much the weight decreases for each epoch. 
    //  - 0 means that all epochs have the same weight,
    //  - 1 means that the weight decreases linearly from 1 to 0 over the range of epochs.
    weightFactor?: number,

    // A list of 0s and 1s indicating if the validator was active or inactive in each epoch.
    // The amount of items in the list should be the same as the amount of epochs we are considering.
    activeEpochStates?: ValidatorEpochState[]
  },

  size: {
    // TODO
    threshold: number,

    // TODO
    steepness: number,

    // The balance of the validator.
    balance: number,

    // The total balance of all validators.
    totalBalance: number
  },

  reliability?: {}
}

// The activity of the validator and their block production activity for a given election block
export type Activity = { likelihood: number, missed: number, rewarded: number }

// A map of validator addresses to their activities in a single epoch
export type ValidatorActivity = Record<string, Activity>

// A map of validator addresses to their activities in a single epoch 
export type ValidatorsActivities = Map<{ address: string, epochBlockNumber: number }, Activity>

export type ScoreValues = { liveness: number, reliability: number, size: number, total: number }

export interface Range {
  // The first block number that we will consider
  fromEpoch: number,
  // The last block number that we will consider
  toEpoch: number,

  // Given a block number, it returns the index in the array of epochs
  blockNumberToIndex(blockNumber: number): number,

  blocksPerEpoch: number,

  // The amount of epochs in the range
  epochCount: number
}

