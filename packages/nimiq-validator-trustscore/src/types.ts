export enum ValidatorEpochState {
  Active = 1,
  Inactive = 0,
}

export interface ScoreParams {
  availability: {
    /**
     * The weight factor is a number between 0 and 1 that controls the rate at which the importance of each epoch decreases.
     * - 0: All epochs have equal importance.
     * - 1: Importance decreases linearly from 1 (most recent epoch) to 0 (oldest epoch).
     */
    weightFactor?: number

    /**
     * An array of 0s and 1s representing the validator's activity in each epoch.
     * - 1: The validator was active in the epoch.
     * - 0: The validator was inactive in the epoch.
     * The number of items in the array should match the total number of epochs being considered.
     */
    activeEpochStates: ValidatorEpochState[]
  }

  dominance: {
    /**
     * The percentage of the total network stake at which a validator begins to receive a reduced score.
     * Validators with a stake percentage below this threshold receive a maximum score.
     * @default 0.1
     */
    threshold?: number

    /**
     * Controls how quickly the dominance score decreases once the validator's stake percentage surpasses the threshold.
     * A higher value results in a steeper decline in the score.
     * @default 7.5
     */
    steepness?: number

    /**
     * The proportion of the validator's stake relative to the rest of the stake in the epoch.
     */
    dominanceRatio: number
  }

  reliability: {
    /**
     * The weight factor is a number between 0 and 1 that controls the rate at which the importance of each epoch decreases over time.
     * - 0: All epochs have equal importance.
     * - 1: Importance decreases linearly from the most recent epoch to the oldest.
     * @default 0.5
     */
    weightFactor?: number

    /**
     * Determines the adjustment applied to the reliability score based on a circular curve.
     * This value represents the x-coordinate of the circle's center in the reliability adjustment graph.
     * A more negative value increases the penalty for low reliability scores.
     * @default -0.16
     */
    curveCenter?: number

    /**
     * A mapping of each epoch number to an object containing the counts of rewarded and missed blocks.
     * - `rewarded`: The number of blocks for which the validator received rewards in the epoch.
     * - `missed`: The number of blocks the validator was expected to produce but did not.
     */
    inherentsPerEpoch: Map<number, { rewarded: number, missed: number }>
  }
}

// The activity of the validator and their block production activity for a given election block
export interface BaseValidator {
  balance: number
  address: string
  dominanceRatioViaBalance: number
  dominanceRatioViaSlots: number
  stakers: number
}

export interface ElectedValidator extends BaseValidator {
  elected: true
  missed: number
  rewarded: number
  likelihood: number
}

export interface UnelectedValidator extends BaseValidator {
  elected: false
  missed: -1
  rewarded: -1
  likelihood: -1
}

export interface CurrentEpoch {
  epochNumber: number
  validators: (UnelectedValidator | ElectedValidator)[]
}

// A map of validator addresses to their activities in a single epoch
export type EpochActivity<T = ElectedValidator | UnelectedValidator> = Record<string, T>

// A map of validator addresses to their activities across multiple epochs
export type EpochsActivities<T = ElectedValidator | UnelectedValidator> = Record<number /* election block */, EpochActivity<T>>

export interface ScoreValues { availability: number, reliability: number, dominance: number, total: number }

export interface Range {
  // The head number when the range was created
  head: number

  // The current epoch index
  currentEpoch: number

  // The first epoch index that we will consider
  fromEpoch: number

  // The first block number that we will consider
  fromBlockNumber: number

  // The last epoch index that we will consider
  toEpoch: number

  // The last block number that we will consider
  toBlockNumber: number

  // The amount of epochs in the range
  epochCount: number

  // The timestamp of the first block in the range
  fromTimestamp: number

  // The timestamp of the last block in the range
  toTimestamp: number

  /**
   * The epoch used for network size/balance snapshot measurements.
   * This is the epoch immediately following the analysis window (toEpoch + 1).
   * Used to determine validators' stake sizes and network dominance at the end of the analysis period.
   */
  snapshotEpoch: number

  /**
   * The block number of the snapshot election block.
   * This is the block number of the first block of the snapshot epoch.
   */
  snapshotBlock: number

  /**
   * The timestamp of the snapshot election block.
   */
  snapshotTimestamp: number

  /**
   * The duration of the epoch in milliseconds.
   * This is the time it takes to produce a single epoch.
   * Is calculated as:
   * - BLOCK_SEPARATION_TIME * BLOCKS_PER_EPOCH - BLOCK_SEPARATION_TIME * BATCHES_PER_EPOCH
   */
  epochDurationMs: number
}

export type ResultSync<T> = [true, undefined, T] | [false, string, undefined]
export type Result<T> = Promise<ResultSync<T>>
