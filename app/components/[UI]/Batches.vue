<script setup lang="ts">
import type { Activity } from '~~/server/utils/drizzle'

defineProps<{ activity: Activity[] }>()

const [DefineBatchState, BatchState] = createReusableTemplate<Activity & { title?: string }>()

function getTitle({ missed, rewarded, epochNumber }: Partial<Activity>) {
  if (missed === -1 && rewarded === -1)
    return `Validator not elected in epoch ${epochNumber}.`
  return `Epoch ${epochNumber}.\nMissed: ${missed}.\nRewarded: ${rewarded}.`
}
</script>

<template>
  <ul grid="~ cols-50 gap-4">
    <DefineBatchState v-slot="{ missed, rewarded, epochNumber, title }">
      <div
        :title="title || getTitle({ missed, rewarded, epochNumber })"
        size-16 rounded-full outline="~ 1 offset--1 white/20"
        :class="{
          'bg-green-400': missed === 0 && rewarded >= 0,
          'bg-red-500': missed > 0,
        }"
      />
    </DefineBatchState>

    <li v-for="a in activity" :key="a.epochNumber">
      <BatchState v-bind="a" />
    </li>
  </ul>
</template>
