<script setup lang="ts">
import type { FetchedValidatorDetails } from '~~/server/utils/validators'

const props = defineProps<{ validator: FetchedValidatorDetails }>()
const validatorRef = computed(() => props.validator)
const { scoreTrendAllData, stakersData, activityStats, feeDisplay, payoutDisplay } = useValidatorCharts(validatorRef)

const allScoreCategories = {
  total: { name: 'Total', color: 'var(--nq-green)' },
  availability: { name: 'Availability', color: 'var(--nq-blue)' },
  dominance: { name: 'Dominance', color: 'var(--nq-purple)' },
  reliability: { name: 'Reliability', color: 'var(--nq-orange)' },
}
const stakersCategories = { stakers: { name: 'Stakers', color: 'var(--nq-blue)' } }

// Combined balance + score data for DualChart
const dualChartData = computed(() => {
  if (!props.validator?.activity || !props.validator?.scores)
    return []
  const scoreMap = new Map(props.validator.scores.map(s => [s.epochNumber, s.total]))
  return props.validator.activity.map(a => ({
    epoch: a.epochNumber,
    balance: a.balance / 1e5,
    score: scoreMap.get(a.epochNumber) ?? 0,
  }))
})
const dualBarCategories = { balance: { name: 'Balance (NIM)', color: 'var(--nq-gold)' } }
const dualLineCategories = { score: { name: 'Score', color: 'var(--nq-green)' } }
</script>

<template>
  <div flex="~ col" f-mt-md>
    <!-- Hero: Score -->
    <div flex="~ col items-center" bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md>
      <span nq-label text="11 neutral-800">Current Score</span>
      <ScorePie size-128 text-40 :score="validator.score?.total || 0" mt-16 />
      <span text-14 text-neutral-700 mt-8>Epoch {{ validator.score?.epochNumber }}</span>
      <ScorePies v-if="validator.score" v-bind="validator.score" text-28 mt-24 />
    </div>

    <!-- Score trends: 4 overlapping areas -->
    <div bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md f-mt-md>
      <span nq-label text="11 neutral-800" mb-8 block>Score Trends</span>
      <AreaChart
        :data="scoreTrendAllData" :height="280" :categories="allScoreCategories"
        :x-formatter="(t: number) => `E${t}`" :y-formatter="(t: number) => `${Math.round(t * 100)}`"
        :y-domain="[0, 1]" curve-type="monotoneX"
      />
    </div>

    <!-- Balance vs Score: DualChart -->
    <div bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md f-mt-md>
      <span nq-label text="11 neutral-800" mb-8 block>Balance vs Score</span>
      <DualChart
        :data="dualChartData" :height="240"
        :bar-categories="dualBarCategories" :line-categories="dualLineCategories"
        :bar-y-axis="['balance']" :line-y-axis="['score']"
        :x-formatter="(t: number) => `E${t}`"
      />
    </div>

    <!-- Two-col: Stakers + Activity stats & Batches -->
    <div grid="~ cols-2 sm:cols-1" gap-16 f-mt-md>
      <div bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md>
        <span nq-label text="11 neutral-800" mb-8 block>Stakers</span>
        <LineChart
          :data="stakersData" :height="200" :categories="stakersCategories"
          :x-formatter="(t: number) => `E${t}`" hide-legend curve-type="monotoneX"
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
