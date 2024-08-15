export enum ValidatorEpochState {
  Active = 1,
  Inactive = 0,
}

export interface ScoreParams {
  liveness: {
    /**
     * The weight factor is a number between 0 and 1 that controls the rate at which the importance of each epoch decreases.
     * - 0: All epochs have equal importance.
     * - 1: Importance decreases linearly from 1 (most recent epoch) to 0 (oldest epoch).
     */
    weightFactor?: number,

    /**
     * An array of 0s and 1s representing the validator's activity in each epoch.
     * - 1: The validator was active in the epoch.
     * - 0: The validator was inactive in the epoch.
     * The number of items in the array should match the total number of epochs being considered.
     */
    activeEpochStates?: ValidatorEpochState[]
  },

  size: {
    /**
     * The percentage of the total network stake at which a validator begins to receive a reduced score.
     * Validators with a stake percentage below this threshold receive a maximum score.
     * @default 0.1
     */
    threshold: number

    /**
     * Controls how quickly the size score decreases once the validator's stake percentage surpasses the threshold.
     * A higher value results in a steeper decline in the score.
     * @default 7.5
     */
    steepness: number,

    /**
     * The balance or stake amount of the validator.
     */
    balance: number,

    /**
     * The total balance or stake amount across all validators in the network.
     */
    totalBalance: number
  },

  reliability: {
    /**
     * The weight factor is a number between 0 and 1 that controls the rate at which the importance of each epoch decreases over time.
     * - 0: All epochs have equal importance.
     * - 1: Importance decreases linearly from the most recent epoch to the oldest.
     * @default 0.5
     */
    weightFactor?: number,

    /**
     * Determines the adjustment applied to the reliability score based on a circular curve.
     * This value represents the x-coordinate of the circle's center in the reliability adjustment graph.
     * A more negative value increases the penalty for low reliability scores.
     * @default -0.16
     */
    curveCenter?: number,

    /**
     * A mapping of each epoch number to an object containing the counts of rewarded and missed blocks.
     * - `rewarded`: The number of blocks for which the validator received rewards in the epoch.
     * - `missed`: The number of blocks the validator was expected to produce but did not.
     */
    inherentsPerEpoch?: Record<number, {
        rewarded: number
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

