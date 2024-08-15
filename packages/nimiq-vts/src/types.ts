export enum ValidatorEpochState {
  Active = 1,
  Inactive = 0,
}

export type ScoreParams = {
  liveness: {
    /**
     * The weight factor is a number between 0 and 1 that controls how much the weight decreases for each epoch.
     * - 0 means that all epochs have the same weight,
     * - 1 means that the weight decreases linearly from 1 to 0 over the range of epochs.
     */
    weightFactor?: number,

    /**
     * The activeEpochStates is an array of 0s and 1s indicating if the validator was active or inactive in each epoch.
     * The amount of items in the list should be the same as the amount of epochs we are considering.
     */
    activeEpochStates?: ValidatorEpochState[]
  },

  size: {
    /**
     * The threshold percentage of the total stake.
     * Validators with a stake percentage below this threshold will receive a maximum score.
     * Above this threshold, the score will start to decrease.
     * @default 0.1
     */
    threshold: number

    /**
     * It controls how quickly the score decreases once the stake percentage surpasses the threshold.
     * A higher value will result in a steeper drop in score.
     * @default 7.5
     */
    steepness: number,

    /**
     * The balance of the validator.
     */
    balance: number,

    /**
     * The total balance of all validators.
     */
    totalBalance: number
  },

  reliability: {
     /**
     * The weight factor is a number between 0 and 1 that controls how much the weight decreases for each epoch.
     * - 0 means that all epochs have the same weight,
     * - 1 means that the weight decreases linearly from 1 to 0 over the range of epochs.
     * @default 0.5
     */
    weightFactor?: number,

    /**
     * The curveCenter determines the adjustment applied to the reliability score.
     * This value represents the x-coordinate of the circle's center in the adjustment graph.
     * A more negative value penalizes low reliability scores more severely.
     * @default -0.16
     */
    curveCenter?: number,

    /**
     * A record that maps each epoch number to an object containing the number of rewarded blocks and missed blocks.
     */
    inherentsPerEpoch?: Record<number, {
        /**
         * Number of blocks for which the validator received a reward in the epoch.
         */
        rewarded: number

        /**
         * Number of blocks the validator was expected to produce but missed in the epoch.
         */
        missed: number
    }>
  }
}

// The activity of the validator and their block production activity for a given election block
export type Activity = { likelihood: number, missed: number, rewarded: number }

// A map of validator addresses to their activities in a single epoch
export type ValidatorActivity = Record<string /* address */, Activity>

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

