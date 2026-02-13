<script setup lang="ts">
import type { FetchedValidatorDetails } from '~~/server/utils/validators'
import { CurveType } from 'vue-chrts'

const props = defineProps<{ validator: FetchedValidatorDetails }>()
const validatorRef = computed(() => props.validator)
const { scoreTrendData, balanceData, stakersData, activityStats, feeDisplay, payoutDisplay, currentBalance, currentStakers } = useValidatorCharts(validatorRef)

const scoreCategories = { total: { name: 'Score', color: 'var(--nq-green)' } }
const balanceCategories = { balance: { name: 'Balance (NIM)', color: 'var(--nq-gold)' } }
const stakersCategories = { stakers: { name: 'Stakers', color: 'var(--nq-blue)' } }
</script>

<template>
  <div flex="~ col" f-mt-md>
    <!-- Profile card -->
    <div bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md flex="~ gap-24 items-center">
      <Identicon v-bind="validator" size-80 shrink-0 object-contain />
      <div flex="~ col gap-8" flex-1>
        <h2 text-32 font-bold lh-none m-0>
          {{ validator.name }}
        </h2>
        <Copyable :content="validator.address" text-14 />
        <p v-if="validator.description" text="14 neutral-700" mt-4 mb-0>
          {{ validator.description }}
        </p>
        <div flex="~ gap-8 wrap" mt-8>
          <span v-if="validator.isMaintainedByNimiq" nq-pill-sm bg-green-400 text-green-1100 flex="~ items-center gap-4">
            <div aria-hidden i-nimiq:verified-filled />
            Maintained by Nimiq
          </span>
          <span nq-pill-sm nq-pill-tertiary>Fee: {{ feeDisplay }}</span>
          <span nq-pill-sm nq-pill-tertiary>Payout: {{ payoutDisplay }}</span>
          <NuxtLink v-if="validator.website" :to="validator.website" target="_blank" nq-pill-sm nq-arrow nq-pill-tertiary>
            {{ validator.website?.replace(/https?:\/\//, '') }}
          </NuxtLink>
        </div>
      </div>
    </div>

    <!-- Two-column layout -->
    <div grid="~ cols-[3fr_2fr] sm:cols-1" gap-16 f-mt-md>
      <!-- Left 60% -->
      <div flex="~ col gap-16">
        <!-- Score card -->
        <div bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md flex="~ items-center gap-24">
          <ScorePie size-96 text-32 :score="validator.score?.total || 0" />
          <ScorePies v-if="validator.score" v-bind="validator.score" text-24 />
        </div>

        <!-- Score trend -->
        <div bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md>
          <span nq-label text="11 neutral-800" mb-8 block>Score Trend</span>
          <AreaChart
            :data="scoreTrendData" :height="200" :categories="scoreCategories"
            :x-formatter="(t: number) => `E${t}`" :y-formatter="(t: number) => `${Math.round(t * 100)}`"
            :y-domain="[0, 1]" hide-legend :curve-type="CurveType.MonotoneX"
          />
        </div>

        <!-- Batches -->
        <div bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md>
          <span nq-label text="11 neutral-800" mb-12 block>Epoch Batches</span>
          <Batches :activity="validator.activity" />
        </div>
      </div>

      <!-- Right 40% -->
      <div flex="~ col gap-16">
        <!-- Balance card -->
        <div bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md>
          <span nq-label text="11 neutral-800">Balance</span>
          <p text-36 font-bold text-gold lh-none mt-8 mb-0>
            {{ nimFormatter.format(currentBalance) }} <span text-18 font-normal>NIM</span>
          </p>
        </div>

        <!-- Stakers card -->
        <div bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md>
          <span nq-label text="11 neutral-800">Stakers</span>
          <p text-36 font-bold text-blue lh-none mt-8 mb-0>
            {{ largeNumberFormatter.format(currentStakers) }}
          </p>
        </div>

        <!-- Balance chart -->
        <div bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md>
          <LineChart
            :data="balanceData" :height="140" :categories="balanceCategories"
            :x-formatter="(t: number) => `E${t}`" :y-formatter="(t: number) => formatLunaAsNim(t * 1e5)"
            hide-legend :curve-type="CurveType.MonotoneX"
          />
        </div>

        <!-- Stakers chart -->
        <div bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md>
          <LineChart
            :data="stakersData" :height="140" :categories="stakersCategories"
            :x-formatter="(t: number) => `E${t}`" hide-legend :curve-type="CurveType.MonotoneX"
          />
        </div>

        <!-- Activity stats -->
        <div bg-neutral-0 outline="~ 1.5 neutral/6" rounded-8 shadow f-p-md>
          <span nq-label text="11 neutral-800" mb-12 block>Activity</span>
          <div flex="~ col gap-12">
            <div flex="~ justify-between">
              <span text-14 text-neutral-700>Rewarded</span>
              <span text-14 font-semibold text-green>{{ largeNumberFormatter.format(activityStats.rewarded) }}</span>
            </div>
            <div flex="~ justify-between">
              <span text-14 text-neutral-700>Missed</span>
              <span text-14 font-semibold text-red>{{ largeNumberFormatter.format(activityStats.missed) }}</span>
            </div>
            <div flex="~ justify-between" border="t neutral/10" pt-8>
              <span text-14 text-neutral-700>Miss Rate</span>
              <span text-14 font-semibold>{{ percentageFormatter.format(activityStats.missRate) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
