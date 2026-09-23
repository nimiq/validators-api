<script setup lang="ts">
import type { ActivityWithStatus } from '~~/server/utils/validator-activity-status'
import { ValidatorEpochStatus } from '~~/packages/nimiq-validator-trustscore/src/epoch-status'

defineProps<{ activity: ActivityWithStatus[] }>()

const [DefineBatchState, BatchState] = createReusableTemplate<ActivityWithStatus & { title?: string }>()

function formatMissRate(missRate: number | null | undefined) {
  return missRate === null || missRate === undefined ? 'N/A' : percentageFormatter.format(missRate)
}

function getTitle({ missed, rewarded, epochNumber, status, missRate, randomnessProbability }: Partial<ActivityWithStatus>) {
  if (status === ValidatorEpochStatus.NotElectedRandomness)
    return `Epoch ${epochNumber}: not elected by randomness.`
  if (status === ValidatorEpochStatus.UnknownPlaceholder)
    return `Epoch ${epochNumber}: elected, production data not finalized.`
  if (status === ValidatorEpochStatus.InactiveByChoiceOrRemoved)
    return `Epoch ${epochNumber}: inactive or removed.`
  if (status === ValidatorEpochStatus.InferredOffline)
    return `Epoch ${epochNumber}: likely offline. Random non-election probability: ${randomnessProbability?.toExponential(2) ?? 'N/A'}.`
  if (status === ValidatorEpochStatus.ElectedFailedOrOffline)
    return `Epoch ${epochNumber}: likely offline or failed.\nMissed: ${missed}.\nRewarded: ${rewarded}.\nMiss rate: ${formatMissRate(missRate)}.`
  if (status === ValidatorEpochStatus.ElectedDegraded)
    return `Epoch ${epochNumber}: degraded production.\nMissed: ${missed}.\nRewarded: ${rewarded}.\nMiss rate: ${formatMissRate(missRate)}.`
  return `Epoch ${epochNumber}: elected and online.\nMissed: ${missed}.\nRewarded: ${rewarded}.\nMiss rate: ${formatMissRate(missRate)}.`
}
</script>

<template>
  <ul grid="~ cols-50 gap-4">
    <DefineBatchState v-slot="{ missed, rewarded, epochNumber, status, missRate, randomnessProbability, title }">
      <div
        :title="title || getTitle({
          missed,
          rewarded,
          epochNumber,
          status,
          missRate,
          randomnessProbability,
        })"
        size-16 rounded-full outline="~ 1 offset--1 white/20"
        :class="{
          'bg-green-400': status === ValidatorEpochStatus.ElectedOnline && missed === 0,
          'bg-lime-300': status === ValidatorEpochStatus.ElectedOnline && missed !== 0,
          'bg-yellow-400': status === ValidatorEpochStatus.ElectedDegraded,
          'bg-red-500': status === ValidatorEpochStatus.ElectedFailedOrOffline || status === ValidatorEpochStatus.InferredOffline,
          'bg-zinc-400': status === ValidatorEpochStatus.UnknownPlaceholder,
          'bg-white/20': status === ValidatorEpochStatus.NotElectedRandomness,
          'bg-white/8': status === ValidatorEpochStatus.InactiveByChoiceOrRemoved,
        }"
      />
    </DefineBatchState>

    <li v-for="a in activity" :key="a.epochNumber">
      <BatchState v-bind="a" />
    </li>
  </ul>
</template>
