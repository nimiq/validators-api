<script setup lang="ts">
import type { Range } from 'nimiq-validator-trustscore/types'

const { range } = defineProps<{ range: Range }>()

const [DefineEpoch, Epoch] = createReusableTemplate()

// Formatting for display
const fromBlockFormatted = largeNumberFormatter.format(range.fromBlockNumber)
const toBlockFormatted = largeNumberFormatter.format(range.toBlockNumber)
const snapshotBlockFormatted = largeNumberFormatter.format(range.snapshotBlock)

// For progress calculation
const now = useNow({ interval: 1_000 })
const currentEpochProgress = computed(() =>
  Math.ceil(100 - Math.max(0, Math.max(0, ((range.snapshotTimestamp - now.value.getTime()) / range.epochDurationMs) * 100))),
)

const snapshotTimestamp = new Date(range.snapshotTimestamp)
const countdown = computed(() => {
  const timeLeft = snapshotTimestamp.getTime() - now.value.getTime()
  const hoursLeft = String(Math.floor(timeLeft / 3_600_000)).padStart(2, '0')
  const minutesLeft = String(Math.floor((timeLeft / 60_000) % 60)).padStart(2, '0')
  const secondsLeft = String(Math.floor((timeLeft / 1_000) % 60)).padStart(2, '0')
  return `ends in ~${hoursLeft}:${minutesLeft}:${secondsLeft}`
})
const snapshotInThePast = computed(() => {
  const now = new Date()
  return snapshotTimestamp.getTime() < now.getTime()
})
</script>

<template>
  <DefineEpoch v-slot="{ epochNumber, timestamp, blockNumberFormatted }">
    <div flex="~ col items-center" relative z-10>
      <div outline="1.5 ~ offset--1.5 neutral/10" bg-neutral-50 rounded-8 f-p-2xs size-80 flex="~ col justify-center items-center gap-2">
        <span font-bold text="f-md neutral-900">{{ epochNumber }}</span>
        <span text="neutral-700 10">{{ blockNumberFormatted }}</span>
      </div>
      <RelativeTime v-if="timestamp" :timestamp />
    </div>
  </DefineEpoch>

  <div flex="~ items-center" w-full>
    <Epoch
      :epoch-number="range.fromEpoch"
      :block-number="range.fromBlockNumber"
      :block-number-formatted="fromBlockFormatted"
      :timestamp="range.fromTimestamp"
    />
    <div min-w-20 border="dashed 3 neutral-300" relative h-0 />
    <div text-9 z-1 nq-label py-4 w-max px-8 rounded-6 bg-neutral-0 outline="1.5 ~ offset--1.5 neutral/10" text="neutral-700" text-center>
      Window<br>context
    </div>
    <div min-w-20 border="dashed 3 neutral-300" relative h-0 />
    <Epoch
      :epoch-number="range.toEpoch"
      :block-number="range.toBlockNumber"
      :block-number-formatted="toBlockFormatted"
      :timestamp="range.toTimestamp"
    />
    <div flex-1 relative>
      <ProgressRoot v-model="currentEpochProgress" data-allow-mismatch flex="~ col" of-hidden bg-neutral-300 h-12 w-full :style="`--progress: ${currentEpochProgress}%; --offset-x: calc(var(--progress) - 100%)`" outline="~ 1.5 neutral-0" :class="{ 'bg-red-400': snapshotInThePast }">
        <ProgressIndicator v-if="!snapshotInThePast" class="progress-indicator" data-allow-mismatch />
      </ProgressRoot>
      <span v-if="!snapshotInThePast" data-allow-mismatch h-max absolute bottom--16 text="f-2xs neutral-800 center" inset-x-0 whitespace-nowrap :timestamp="range.snapshotTimestamp">
        {{ countdown }}
      </span>
      <span v-else h-max absolute bottom--24 flex="~ items-center justify-center gap-8" text="f-2xs red-1100" inset-x-0 mx-auto f-px-sm>
        <div i-nimiq:alert op-80 scale-80 />
        <p>
          The current epoch {{ range.snapshotEpoch }} has ended<br> but not yet been processed.
        </p>
      </span>
    </div>
    <Epoch
      :epoch-number="range.snapshotEpoch"
      :block-number="range.snapshotBlock"
      :block-number-formatted="snapshotBlockFormatted"
    />
  </div>
</template>

<style>
@keyframes progress {
  0% {
    background-position: 0 0;
  }
  100% {
    background-position: 30px 30px;
  }
}

.progress-indicator {
  --uno: 'block relative  bg-blue size-full h-16 translate-x-$offset-x rounded-r-2';
  transition: transform 660ms cubic-bezier(0.65, 0, 0.35, 1);

  &::after {
    content: '';
    animation: progress 2.5s linear infinite;
    position: absolute;
    inset: 0;
    background: linear-gradient(
      -45deg,
      rgba(255, 255, 255, 0.1) 25%,
      transparent 25%,
      transparent 50%,
      rgba(255, 255, 255, 0.1) 50%,
      rgba(255, 255, 255, 0.1) 75%,
      transparent 75%,
      transparent
    );
    background-size: 30px 30px;
  }
}
</style>
