import { AsyncResult } from './types'
import { NewScore, Validator } from '../utils/drizzle'
import { defu } from "defu"

export async function getSize({ balance, threshold, steepness, totalBalance }: Required<ComputeScoreConst['size']>): AsyncResult<number> {
  if (balance < 0 || totalBalance < 0) throw new Error("Balance or total balance is negative")
  const size = balance / totalBalance
  const s = Math.max(0, 1 - Math.pow(size / threshold, steepness))
  return { data: s, error: undefined }
}

export async function getLiveness({ decayRate, totalEpochs, connectedDates, disconnectedDates }: Required<ComputeScoreConst['liveness']>): AsyncResult<number> {
  if (decayRate < 0 || decayRate > 1) throw new Error("Decay rate must be between 0 and 1")
  if (totalEpochs < 0) throw new Error("Total epochs must be positive")
  if (connectedDates.length === 0) throw new Error("At least one connected date is needed")
  if (connectedDates.some(date => date < 0) || disconnectedDates.some(date => date < 0)) throw new Error("Dates must be positive")

  // Initialize liveness observations with 0
  const livenessObservations = new Array(totalEpochs).fill(0)

  // Update liveness observations based on connectedDates and disconnectedDates
  connectedDates.forEach(date => {
    const epochIndex = Math.floor(date / (24 * 60 * 60 * 1000)) // Assuming epoch is in days
    if (epochIndex < totalEpochs) livenessObservations[epochIndex] = 1
  })

  disconnectedDates.forEach(date => {
    const epochIndex = Math.floor(date / (24 * 60 * 60 * 1000)) // Assuming epoch is in days
    if (epochIndex < totalEpochs) livenessObservations[epochIndex] = 0
  })

  // Calculate the weighted sum and normalization factor
  const weightedSum = livenessObservations.reduce((acc: number, x_i, i) => acc + (1 - decayRate * (i / (totalEpochs - 1))) * x_i, 0)
  const normalizationFactor = livenessObservations.reduce((acc: number, _, i) => acc + (1 - decayRate * (i / (totalEpochs - 1))), 0)
  const livenessScore = weightedSum / normalizationFactor

  // Adjust the liveness score
  const adjustedLivenessScore = -Math.pow(livenessScore, 2) + 2 * livenessScore

  return { data: adjustedLivenessScore, error: undefined }
}

export async function getReliability({ }: Required<ComputeScoreConst['reliability']>): AsyncResult<number> {
  return { data: Math.random(), error: undefined }
}
// export async function getReliability({ decayRate, totalBatches, slots, rewardedSlots, circleCenterAdjustment }: Required<ComputeScoreConst['reliability']>): AsyncResult<number> {
// if (decayRate < 0 || decayRate > 1) throw new Error("Decay rate must be between 0 and 1");
// if (totalBatches < 0) throw new Error("Total batches must be positive");
// if (slots.length === 0) throw new Error("At least one slot is needed");
// if (slots.some(slot => slot < 0) || rewardedSlots.some(slot => slot < 0)) throw new Error("Slots must be positive");

// // Initialize reliability observations with 0
// const reliabilityObservations = new Array(totalBatches).fill(0);

// // Update reliability observations based on slots and rewardedSlots
// slots.forEach((slot, i) => {
//   if (i < totalBatches) reliabilityObservations[i] = slot;
// });

// rewardedSlots.forEach((rewardedSlot, i) => {
//   if (i < totalBatches && reliabilityObservations[i] !== 0) {
//     reliabilityObservations[i] = rewardedSlot / reliabilityObservations[i];
//   }
// });

// // Calculate the weighted sum and normalization factor
// const weightedSum = reliabilityObservations.reduce((acc: number, x_i, i) => acc + (1 - decayRate * (i / (totalBatches - 1))) * x_i, 0);
// const normalizationFactor = reliabilityObservations.reduce((acc: number, _, i) => acc + (1 - decayRate * (i / (totalBatches - 1))), 0);
// const reliabilityScore = weightedSum / normalizationFactor;

// // Adjust the reliability score
// const adjustedReliabilityScore = -circleCenterAdjustment + 1 - Math.sqrt(-Math.pow(reliabilityScore, 2) + 2 * circleCenterAdjustment * reliabilityScore + Math.pow(circleCenterAdjustment - 1, 2));

// return { data: adjustedReliabilityScore, error: undefined };
// }

// The default values for the computeScore function
// Negative values and empty arrays are used to indicate that the user must provide the values or an error will be thrown
const defaultComputeScoreConst = {
  liveness: { decayRate: 0.5, totalEpochs: -1, connectedDates: [] as number[], disconnectedDates: [] as number[] },
  size: { threshold: 0.25, steepness: 4, balance: -1, totalBalance: -1 },
  reliability: { decayRate: 0.5, circleCenterAdjustment: -0.16, totalBatches: -1, slots: [] as number[], rewardedSlots: [] as number[] }
}

export type ComputeScoreConst = {
  liveness: Partial<typeof defaultComputeScoreConst['liveness']>,
  size: Partial<typeof defaultComputeScoreConst['size']>,
  reliability: Partial<typeof defaultComputeScoreConst['reliability']>
}

export async function computeScore(validatorId: Validator["id"], userParams: ComputeScoreConst) {
  const computeScoreParams = defu(userParams, defaultComputeScoreConst)
  const sizeScorePromise = getSize(computeScoreParams.size)
  const livenessScorePromise = getLiveness(computeScoreParams.liveness)
  const reliabilityScorePromise = getReliability(computeScoreParams.reliability)
  const [{ data: size, error: sizeError }, { data: liveness, error: livenessError }, { data: reliability, error: reliabilityError }] = await Promise.all([sizeScorePromise, livenessScorePromise, reliabilityScorePromise]);
  if (sizeError || livenessError || reliabilityError || !size || !liveness || !reliability)
    throw new Error("Could not get size, liveness, or reliability scores: " + JSON.stringify({ sizeError, livenessError, reliabilityError }));

  const score: NewScore = { validatorId, size, liveness, reliability, score: size * liveness * reliability };
  return score;
}
