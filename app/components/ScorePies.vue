<script setup lang="ts">
import type { ScoreApiValue } from '~~/server/utils/types'

type ScorePiesProps = Pick<
  ScoreApiValue,
  | 'availability'
  | 'dataStatus'
  | 'dominance'
  | 'longTermAsOfEpoch'
  | 'longTermAvailability'
  | 'longTermCoverage'
  | 'recentAvailability'
  | 'recentCoverage'
  | 'reliability'
  | 'scoreEpoch'
  | 'scoreVersion'
>

const props = defineProps<ScorePiesProps>()

const statusLabel = computed(() => ({
  current: 'Current',
  stale: 'Stale',
  no_score: 'No score',
})[props.dataStatus])

function formatCoverage(value: number | null) {
  return value !== null && Number.isFinite(value)
    ? percentageFormatter.format(value)
    : 'N/A'
}
</script>

<template>
  <div flex="~ col items-center gap-12">
    <div flex="~ items-center gap-2em wrap justify-center">
      <div>
        <h4 nq-label text="0.5em center">
          dominance
        </h4>
        <ScorePie text="neutral/70" mx-auto mt-6 size-2.75em :score="dominance" />
      </div>
      <div v-if="scoreVersion === 1">
        <h4 nq-label text="0.5em center">
          availability
        </h4>
        <ScorePie text="neutral/70" mx-auto mt-6 size-2.75em :score="availability" />
      </div>
      <template v-else>
        <div>
          <h4 nq-label text="0.5em center" whitespace-nowrap>
            recent availability
            <span block mt-1 text="0.8em neutral/50" font-normal tracking-normal normal-case>
              Last 14 days
            </span>
          </h4>
          <ScorePie text="neutral/70" mx-auto mt-4 size-2.75em :score="recentAvailability" />
        </div>
        <div>
          <h4 nq-label text="0.5em center" whitespace-nowrap>
            long-term availability
            <span block mt-1 text="0.8em neutral/50" font-normal tracking-normal normal-case>
              About 9 months
            </span>
          </h4>
          <ScorePie text="neutral/70" mx-auto mt-4 size-2.75em :score="longTermAvailability" />
        </div>
        <div>
          <h4 nq-label text="0.5em center" whitespace-nowrap>
            combined availability
            <span block mt-1 text="0.8em neutral/50" font-normal tracking-normal normal-case>
              50% recent + 50% long-term
            </span>
          </h4>
          <ScorePie text="neutral/70" mx-auto mt-4 size-2.75em :score="availability" />
        </div>
      </template>
      <div>
        <h4 nq-label text="0.5em center">
          reliability
        </h4>
        <ScorePie text="neutral/70" mx-auto mt-6 size-2.75em :score="reliability" />
      </div>
    </div>
    <div>
      <span nq-pill nq-pill-tertiary>v{{ scoreVersion }}</span>
      <span nq-pill nq-pill-tertiary ml-4>{{ statusLabel }}</span>
      <template v-if="scoreVersion === 2">
        <span nq-pill nq-pill-tertiary ml-4>Recent coverage {{ formatCoverage(recentCoverage) }}</span>
        <span nq-pill nq-pill-tertiary ml-4>Long coverage {{ formatCoverage(longTermCoverage) }}</span>
        <span nq-pill nq-pill-tertiary ml-4>Score epoch {{ scoreEpoch ?? 'N/A' }}</span>
        <span nq-pill nq-pill-tertiary ml-4>Long-term as of {{ longTermAsOfEpoch ?? 'N/A' }}</span>
      </template>
    </div>
  </div>
</template>
