<script setup lang="ts">
import type { FetchedValidatorDetails } from '~~/server/utils/validators'
import { CurveType } from 'vue-chrts'
import { mapScoreDisplay } from '~/utils/score-display'

const props = defineProps<{ validator: FetchedValidatorDetails }>()
const validatorRef = computed(() => props.validator)
const { scoreTrendAllData, scoreTrendAllXFormatter, stakersData, stakersXFormatter, stakersYDomain, activityStats, feeDisplay, payoutDisplay } = useValidatorCharts(validatorRef)
const scoreState = computed(() => mapScoreDisplay(props.validator.score))

const allScoreCategories = {
  total: { name: 'Total', color: 'var(--colors-green)' },
  availability: { name: 'Availability', color: 'var(--colors-blue)' },
  dominance: { name: 'Dominance', color: 'var(--colors-purple)' },
  reliability: { name: 'Reliability', color: 'var(--colors-orange)' },
}
const stakersCategories = { stakers: { name: 'Stakers', color: 'var(--colors-blue)' } }

// Combined balance + score data for DualChart
const dualChartData = computed(() => {
  if (!props.validator?.activity || !props.validator?.scores)
    return []
  const activityByEpoch = new Map(props.validator.activity.map(activity => [activity.epochNumber, activity]))
  const scores = prepareScoreHistory(
    props.validator.scores,
    props.validator.score.scoreVersion,
    ['total'],
  )
  return scores.flatMap((score) => {
    if (
      typeof score.epochNumber !== 'number'
      || !Number.isFinite(score.epochNumber)
      || typeof score.total !== 'number'
      || !Number.isFinite(score.total)
    ) {
      return []
    }
    const activity = activityByEpoch.get(score.epochNumber)
    return activity
      ? [{
          epoch: score.epochNumber,
          balance: activity.balance / 1e5,
          score: score.total,
        }]
      : []
  })
})
const dualChartXFormatter = computed(() => (index: number) => {
  const epoch = dualChartData.value[Math.round(index)]?.epoch
  return epoch === undefined ? '' : `E${epoch}`
})
const dualBarCategories = { balance: { name: 'Balance (NIM)', color: 'var(--colors-gold)' } }
const dualLineCategories = { score: { name: 'Score', color: 'var(--colors-green)' } }
</script>

<template>
  <div flex="~ col" f-mt-md>
    <!-- Hero: Score -->
    <div flex="~ col items-center" bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md>
      <span nq-label text="11 neutral-800">Current Score</span>
      <ScorePie size-128 text-40 :score="scoreState.value" mt-16 />
      <span text-14 text-neutral-700 mt-8>
        {{ scoreState.versionLabel }} · {{ scoreState.statusLabel }}
      </span>
      <span text-14 text-neutral-700 mt-4>Epoch {{ validator.score.scoreEpoch ?? 'N/A' }}</span>
      <ScorePies v-bind="validator.score" text-28 mt-24 />
    </div>

    <!-- Score trends: 4 overlapping areas -->
    <div bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md f-mt-md>
      <span nq-label text="11 neutral-800" mb-8 block>Score Trends</span>
      <AreaChart
        :data="scoreTrendAllData" :height="280" :categories="allScoreCategories"
        :x-formatter="scoreTrendAllXFormatter" :y-formatter="(t: number) => `${Math.round(t * 100)}`"
        :y-domain="[0, 1]" :curve-type="CurveType.MonotoneX"
      />
    </div>

    <!-- Balance vs Score: DualChart -->
    <div bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md f-mt-md>
      <span nq-label text="11 neutral-800" mb-8 block>Balance vs Score</span>
      <DualChart
        :data="dualChartData" :height="240"
        :bar-categories="dualBarCategories" :line-categories="dualLineCategories"
        :bar-y-axis="['balance']" :line-y-axis="['score']"
        :x-formatter="dualChartXFormatter"
      />
    </div>

    <!-- Two-col: Stakers + Activity stats & Batches -->
    <div grid="~ cols-2 sm:cols-1" gap-16 f-mt-md>
      <div bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md>
        <span nq-label text="11 neutral-800" mb-8 block>Stakers</span>
        <LineChart
          :data="stakersData" :height="200" :categories="stakersCategories"
          :x-formatter="stakersXFormatter" :y-domain="stakersYDomain" hide-legend :curve-type="CurveType.MonotoneX"
        />
      </div>
      <div flex="~ col gap-16">
        <div bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md>
          <span nq-label text="11 neutral-800" mb-12 block>Activity Stats</span>
          <div grid="~ cols-3" gap-8>
            <Stat>
              <template #value>
                {{ largeNumberFormatter.format(activityStats.rewarded) }}
              </template>
              <template #description>
                Rewarded
              </template>
            </Stat>
            <Stat>
              <template #value>
                {{ largeNumberFormatter.format(activityStats.missed) }}
              </template>
              <template #description>
                Missed
              </template>
            </Stat>
            <Stat>
              <template #value>
                {{ percentageFormatter.format(activityStats.missRate) }}
              </template>
              <template #description>
                Miss Rate
              </template>
            </Stat>
          </div>
        </div>
        <div bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md>
          <span nq-label text="11 neutral-800" mb-12 block>Batches</span>
          <Batches :activity="validator.activity" />
        </div>
      </div>
    </div>

    <!-- Footer: Validator info -->
    <div bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md f-mt-md flex="~ gap-24 wrap">
      <div>
        <span nq-label text="11 neutral-800">Fee</span>
        <p text-18 font-semibold mt-4>
          {{ feeDisplay }}
        </p>
      </div>
      <div>
        <span nq-label text="11 neutral-800">Payout</span>
        <p text-18 font-semibold mt-4>
          {{ payoutDisplay }}
        </p>
      </div>
      <NuxtLink v-if="validator.website" :to="validator.website" target="_blank" nq-pill nq-arrow nq-pill-tertiary self-center>
        {{ validator.website?.replace(/https?:\/\//, '') }}
      </NuxtLink>
      <p v-if="validator.description" text="14 neutral-700" flex-1>
        {{ validator.description }}
      </p>
    </div>
  </div>
</template>
