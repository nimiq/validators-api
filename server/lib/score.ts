import { AsyncResult } from './types'
import { Event } from '../utils/drizzle'
import { consola } from 'consola'
import { NewScore, Validator } from '../utils/drizzle'
import { defu } from "defu"

export async function getSize({ balance, threshold, steepness, totalBalance }: Required<ComputeScoreConst['size']>): AsyncResult<number> {
  if (balance < 0 || totalBalance < 0) throw new Error("Balance or total balance is negative")
  const size = balance / totalBalance
  const s = Math.max(0, 1 - Math.pow(size / threshold, steepness))
  return { data: s, error: undefined }
}

export async function getLiveness({ }: Required<ComputeScoreConst['liveness']>): AsyncResult<number> {
  return { data: Math.random(), error: undefined }
}
// export async function getLiveness({ decayRate, totalEpochs, events, epochDuration, firstEpochTs }: Required<ComputeScoreConst['liveness']>): AsyncResult<number> {
//   if (decayRate < 0 || decayRate > 1) throw new Error("Decay rate must be between 0 and 1")
//   if (totalEpochs < 0) throw new Error("Total epochs must be positive")
//   if (events.length === 0) throw new Error("At least one event is needed")
//   if (events.some(event => event.timestamp.getTime() < 0)) throw new Error("Event timestamps must be positive")

//   const livenessObservations = new Array(totalEpochs).fill(0)
//   const sortedEvents = events.map(event => ({ ...event, timestamp: event.timestamp.getTime() })).sort((a, b) => a.timestamp - b.timestamp)

//   let currentState = 0

//   // Determine the initial state based on events before the first epoch
//   const firstEpochStart = 0
//   sortedEvents.forEach(event => {
//     if (event.timestamp < firstEpochStart) {
//       switch (event.event) {
//         case EventName.CreateValidator:
//         case EventName.ReactivateValidator:
//           currentState = 1
//           break
//         case EventName.DeactivateValidator:
//         case EventName.RetireValidator:
//         case EventName.DeleteValidator:
//           currentState = 0
//           break
//       }
//     }
//   })

//   // Iterate through the epochs and apply the events
//   for (let i = 0; i < totalEpochs; i++) {
//     const epochStart = i * epochDuration + firstEpochTs
//     const epochEnd = epochStart + epochDuration

//     sortedEvents.forEach(event => {
//       if (event.timestamp >= epochStart && event.timestamp < epochEnd) {
//         switch (event.event) {
//           case EventName.CreateValidator:
//           case EventName.ReactivateValidator:
//             currentState = 1
//             break
//           case EventName.DeactivateValidator:
//           case EventName.RetireValidator:
//           case EventName.DeleteValidator:
//             currentState = 0
//             break
//         }
//       }
//     })

//     livenessObservations[i] = currentState
//   }

//   let weightedSum = 0;
//   let normalizationFactor = 0;

//   for (let i = 0; i < totalEpochs; i++) {
//     const weight = 1 - decayRate * (i / (totalEpochs - 1));
//     weightedSum += weight * livenessObservations[i];
//     normalizationFactor += weight;
//   }
//   const livenessScore = weightedSum / normalizationFactor

//   const adjustedLivenessScore = -Math.pow(livenessScore, 2) + 2 * livenessScore

//   return { data: adjustedLivenessScore, error: undefined }
// }

export async function getReliability({ }: Required<ComputeScoreConst['reliability']>): AsyncResult<number> {
  return { data: Math.random(), error: undefined }
}
// export async function getReliability({ decayRate, totalBatches, slots, rewardedSlots, circleCenterAdjustment }: Required<ComputeScoreConst['reliability']>): AsyncResult<number> {
// if (decayRate < 0 || decayRate > 1) throw new Error("Decay rate must be between 0 and 1")
// if (totalBatches < 0) throw new Error("Total batches must be positive")
// if (slots.length === 0) throw new Error("At least one slot is needed")
// if (slots.some(slot => slot < 0) || rewardedSlots.some(slot => slot < 0)) throw new Error("Slots must be positive")

// // Initialize reliability observations with 0
// const reliabilityObservations = new Array(totalBatches).fill(0)

// // Update reliability observations based on slots and rewardedSlots
// slots.forEach((slot, i) => {
//   if (i < totalBatches) reliabilityObservations[i] = slot
// })

// rewardedSlots.forEach((rewardedSlot, i) => {
//   if (i < totalBatches && reliabilityObservations[i] !== 0) {
//     reliabilityObservations[i] = rewardedSlot / reliabilityObservations[i]
//   }
// })

// // Calculate the weighted sum and normalization factor
// const weightedSum = reliabilityObservations.reduce((acc: number, x_i, i) => acc + (1 - decayRate * (i / (totalBatches - 1))) * x_i, 0)
// const normalizationFactor = reliabilityObservations.reduce((acc: number, _, i) => acc + (1 - decayRate * (i / (totalBatches - 1))), 0)
// const reliabilityScore = weightedSum / normalizationFactor

// // Adjust the reliability score
// const adjustedReliabilityScore = -circleCenterAdjustment + 1 - Math.sqrt(-Math.pow(reliabilityScore, 2) + 2 * circleCenterAdjustment * reliabilityScore + Math.pow(circleCenterAdjustment - 1, 2))

// return { data: adjustedReliabilityScore, error: undefined }
// }

// The default values for the computeScore function
// Negative values and empty arrays are used to indicate that the user must provide the values or an error will be thrown
const defaultComputeScoreConst = {
  liveness: { decayRate: 0.5, totalEpochs: -1, events: [] as Event[], epochDuration: -1, firstEpochTs: -1 },
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
  const [
    { data: size, error: sizeError },
    { data: liveness, error: livenessError },
    { data: reliability, error: reliabilityError }]
    = await Promise.all([sizeScorePromise, livenessScorePromise, reliabilityScorePromise])

  if (sizeError || livenessError || reliabilityError || size === undefined || liveness === undefined || reliability === undefined)
    throw new Error("Could not get size, liveness, or reliability scores: " + JSON.stringify({ sizeError, livenessError, reliabilityError, size, liveness, reliability }))

  const score: NewScore = { validatorId, size, liveness, reliability, score: size * liveness * reliability }
  return score
}
