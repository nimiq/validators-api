<script setup lang="ts">
import type { FetchedValidatorDetails } from '~~/server/utils/validators'
import { CurveType } from 'vue-chrts'

const props = defineProps<{ validator: FetchedValidatorDetails }>()
const validatorRef = computed(() => props.validator)
const { scoreTrendData, balanceData, activityData, feeDisplay, payoutDisplay, currentStakers, donutScoreData } = useValidatorCharts(validatorRef)

const scoreCategories = { total: { name: 'Score', color: 'var(--nq-green)' } }
const balanceCategories = { balance: { name: 'Balance (NIM)', color: 'var(--nq-gold)' } }
const activityCategories = { rewarded: { name: 'Rewarded', color: 'var(--nq-green-400)' }, missed: { name: 'Missed', color: 'var(--nq-red-400)' } }
const donutCategories = { 0: { name: 'Availability', color: 'var(--nq-blue)' }, 1: { name: 'Dominance', color: 'var(--nq-purple)' }, 2: { name: 'Reliability', color: 'var(--nq-orange)' } }
</script>

<template>
  <div flex="~ col" f-mt-md>
    <!-- Stats row -->
    <div grid="~ cols-5 md:cols-3 sm:cols-2" gap-16>
      <div bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md>
        <span nq-label text="11 neutral-800">Fee</span>
        <p text-24 font-bold text-orange lh-none mt-4>
          {{ feeDisplay }}
        </p>
      </div>
      <div bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md>
        <span nq-label text="11 neutral-800">Payout</span>
        <p text-24 font-bold text-blue lh-none mt-4>
          {{ payoutDisplay }}
        </p>
      </div>
      <div bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md>
        <span nq-label text="11 neutral-800">Balance</span>
        <p text-24 font-bold text-gold lh-none mt-4>
          {{ formatLunaAsNim(validator.activity?.at(-1)?.balance ?? 0) }} NIM
        </p>
      </div>
      <div bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md>
        <span nq-label text="11 neutral-800">Stakers</span>
        <p text-24 font-bold text-blue lh-none mt-4>
          {{ largeNumberFormatter.format(currentStakers) }}
        </p>
      </div>
      <div bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md flex="~ items-center gap-12">
        <div>
          <span nq-label text="11 neutral-800">Score</span>
          <p text-24 font-bold text-green lh-none mt-4>
            {{ Math.round((validator.score?.total ?? 0) * 100) }}
          </p>
        </div>
        <ScorePie size-40 text-14 :score="validator.score?.total || 0" />
      </div>
    </div>

    <!-- Charts row 1: Donut + Score trend -->
    <div grid="~ cols-2 sm:cols-1" gap-16 f-mt-md>
      <div bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md>
        <span nq-label text="11 neutral-800" mb-8 block>Sub-Scores</span>
        <DonutChart
          :data="donutScoreData" :radius="80" :arc-width="16" :pad-angle="0.03"
          :categories="donutCategories" hide-legend
        />
        <div flex="~ justify-center gap-16" mt-12>
          <ScorePies v-if="validator.score" v-bind="validator.score" text-20 />
        </div>
      </div>
      <div bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md>
        <span nq-label text="11 neutral-800" mb-8 block>Score Trend</span>
        <AreaChart
          :data="scoreTrendData" :height="200" :categories="scoreCategories"
          :x-formatter="(t: number) => `E${t}`" :y-formatter="(t: number) => `${Math.round(t * 100)}`"
          :y-domain="[0, 1]" hide-legend :curve-type="CurveType.MonotoneX"
        />
      </div>
    </div>

    <!-- Charts row 2: Activity + Balance -->
    <div grid="~ cols-2 sm:cols-1" gap-16 f-mt-md>
      <div bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md>
        <span nq-label text="11 neutral-800" mb-8 block>Activity (Rewarded / Missed)</span>
        <BarChart
          :data="activityData" :height="200" :categories="activityCategories"
          :y-axis="['rewarded', 'missed']" stacked hide-legend
          :x-formatter="(t: number) => `E${t}`"
        />
      </div>
      <div bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md>
        <span nq-label text="11 neutral-800" mb-8 block>Balance</span>
        <LineChart
          :data="balanceData" :height="200" :categories="balanceCategories"
          :x-formatter="(t: number) => `E${t}`" :y-formatter="(t: number) => formatLunaAsNim(t * 1e5)"
          hide-legend :curve-type="CurveType.MonotoneX"
        />
      </div>
    </div>

    <!-- Batches -->
    <div bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md f-mt-md>
      <span nq-label text="11 neutral-800" mb-12 block>Epoch Batches</span>
      <Batches :activity="validator.activity" />
    </div>
  </div>
</template>
