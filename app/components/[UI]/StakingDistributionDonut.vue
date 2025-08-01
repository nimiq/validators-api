<script setup lang="ts">
import type { StyleValue } from 'vue'
import type { DonutDatum } from './Donut.client.vue'

const { data: supply, status, error } = await useFetch('/api/v1/supply')

// Helper function to convert Luna to NIM for display
function formatLunaAsNim(lunaValue: number): string {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(lunaValue / 1e5)
}

const stakedRatio = computed(() => {
  if (!supply.value?.circulating || !supply.value?.staking)
    return 0
  return supply.value.staking / supply.value.circulating
})

const datum = computed(() => {
  if (!stakedRatio.value)
    return []
  return [
    { color: `var(--colors-green)`, value: stakedRatio.value || 0, label: `${percentageFormatter.format(stakedRatio.value * 100)} staked`, annotation: { bottom: '40px', right: '-72px' } },
    { color: `var(--colors-neutral-200)`, value: 1 - stakedRatio.value || 1, label: 'Circulating', annotation: { top: '40px', left: '-42px' } },
  ] satisfies (DonutDatum & { label: string, annotation: StyleValue })[]
})

// Center the donut chart so the staked amount center points to the right
const startAngle = computed(() => (90 - 180 * (datum.value.at(0)?.value || 0)))

const formattedCirculating = computed(() => `${formatLunaAsNim(supply.value?.circulating || 0)} NIM`)
const formattedStakedAmount = computed(() => `${formatLunaAsNim(supply.value?.staking || 0)} NIM`)
</script>

<template>
  <div v-if="status === 'success'" relative flex="~ col items-center" w-max>
    <Donut :data="datum" :start-angle :size="140" :central-label="formattedCirculating" />
    <div absolute right="-100%" top="[calc(50%-14px)]">
      <div outline="~ 1.5 offset--1.5 white/15" rounded-full f-px-xs py-6 text="green-1100 f-sm" font-semibold bg-green-400>
        {{ percentageFormatter.format(stakedRatio!) }} staked
      </div>
      <div flex="~ items-center gap-6 justify-center" text=" neutral-800 f-2xs" font-semibold mt-2>
        {{ formattedStakedAmount }}
      </div>
    </div>
  </div>
  <div v-else-if="status === 'error'" flex="~ items-center gap-12" w-max f-text-md text-red-1100>
    <div i-nimiq:alert op-80 />
    {{ error }}
  </div>
  <div v-else flex="~ items-center gap-12" w-max f-text-md>
    <div i-nimiq:spinner />
    Loading
  </div>
</template>
