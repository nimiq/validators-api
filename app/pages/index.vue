<script setup lang="ts">
import { calculateStakingRewards } from '@nimiq/utils/rewards-calculator'
import { formatTimeAgo } from '@vueuse/core'

// Helper function to convert Luna to NIM for display
function formatLunaAsNim(lunaValue: number): string {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(lunaValue / 1e5)
}

const { data: status, status: statusFetch, error: statusError } = await useFetch('/api/v1/status')
const { data: validators, status: validatorsStatus, error: validatorsError } = await useFetch('/api/v1/validators', {
  query: { 'only-known': false },
})
const { data: supply } = await useFetch('/api/v1/supply')
const { averageAPY, averageScore, averageStakeSize, totalPools, totalRegistered, totalStakers, averageFee, windowSizeMonths, totalValidators, totalElected } = useStats()

const [DefineStat, Stat] = createReusableTemplate<{ value?: number | string, label: string, color?: string, paddingXs?: boolean, tooltip: MaybeRef<string> }>()

const formatTooltipText = (text: MaybeRef<string>) => toValue(text).split('. ').map(s => `${s.trim()}.`).filter(Boolean)

const tooltips = {
  stakers: computed(() => `There are ${totalStakers.value} stakers across ${totalValidators.value} validators in the network.`),
  averageStake: computed(() => `The average stake size is ${formatLunaAsNim(averageStakeSize.value)} NIM`),
  averageAPY: computed(() => `The average Annual Percentage Yield (APY) is ${averageAPY.value}%. The APY is calculated based on the staked supply ratio and the average fee of the pools. This is the return on investment for stakers`),
  stakeDistribution: computed(() => `The stake distribution shows the percentage of the stake that is in circulation`),
  dominanceDistribution: `The dominance distribution shows the percentage of the total stake held by each validator. The dominance of that validator's slice is proportional to the amount of stake they hold and the number of blocks they produce`,
  scoreEpochWindow: computed(() => `The score measures the dominance, reliability and availability of a validator. It is based on the epochs ${status.value?.range?.fromEpoch} to ${status.value?.range?.toEpoch}, covering approximately the last ~${windowSizeMonths.value}. This period is called the "window". Immediately after this window closes, we have the "snapshot epoch" (${status.value?.range?.snapshotEpoch}) which contains the parameters to calculate the dominance. Internally, this data structure is called "range"`),
  validators: computed(() => `There are ${totalElected.value} elected validators in the current epoch out of ${totalValidators.value} validators in the network`),
  averageScore: computed(() => `The average score of the validators for epoch ${status.value?.range?.snapshotEpoch}.`),
  pools: computed(() => `There are ${totalPools.value} pools in the network. A pool is a special kind of validator that shares their rewards with their stakers with a fee`),
  tracked: `The total number of validators who have submitted information about themselves to our centralised system`,
  averageFee: `The average fee of the pools in the network. The fee is the percentage of the rewards that the pool takes for itself`,
}

function useStats() {
  const network = useRuntimeConfig().public.nimiqNetwork as 'test-albatross' | 'main-albatross'

  const averageScore = computed(() => {
    if (!validators?.value?.length)
      return 0
    const scores = validators.value.map(validator => validator.score?.total).filter(t => !!t) as number[]
    const totalScore = scores?.reduce((acc, score) => acc + score, 0) || 0
    return totalScore / scores.length
  })

  const totalStakers = computed(() => validators.value?.reduce((acc, validator) => acc + validator.stakers, 0) || 0)
  const averageStakeSize = computed(() => (supply.value?.staking || 0) / totalStakers.value)
  const pools = computed(() => validators.value?.filter(validator => validator.payoutType !== 'none') || [])
  const totalPools = computed(() => pools.value.length)
  const totalRegistered = computed(() => validators.value?.reduce((acc, validator) => acc + (validator.name !== 'Unknown validator' ? 1 : 0), 0) || 0)
  const totalValidators = computed(() => Object.values(status.value?.validators || []).flat().length)
  const totalElected = computed(() => status.value?.validators?.electedValidators?.length || 0)

  const windowSizeMonths = computed(() => {
    if (!status.value?.range)
      return 0
    const { fromTimestamp } = status.value.range
    const ago = formatTimeAgo(new Date(fromTimestamp))
    return ago.replace(' ago', '')
  })

  const averageFee = computed(() => pools.value.reduce((acc, pool) => acc + (pool.fee || 0), 0) / pools.value.length)
  const averageAPY = computed(() => {
    if (!supply.value?.circulating || !supply.value?.staking)
      return 0
    const stakedRatio = supply.value.staking / supply.value.circulating
    return calculateStakingRewards({ stakedSupplyRatio: stakedRatio, network, fee: averageFee.value }).gainRatio
  })

  return {
    totalElected,
    totalValidators,
    averageScore,
    windowSizeMonths,
    totalStakers,
    averageStakeSize,
    totalPools,
    totalRegistered,
    averageAPY,
    averageFee,
  }
}
</script>

<template>
  <div>
    <DefineStat v-slot="{ label, value, color, $slots, paddingXs, tooltip }">
      <div flex="~ col" group outline="~ 1.5 neutral/6" rounded-8 :class="paddingXs ? 'f-p-xs gap-4' : 'f-p-md gap-12'" shadow relative z-1 bg-neutral-0>
        <div flex="~ items-center gap-8">
          <span nq-label text="11 neutral-800">
            {{ label }}
          </span>
          <Tooltip z-10>
            <template #trigger>
              <div text="f-2xs neutral-600" i-nimiq:info transition-opacity op="60 group-hocus:100" />
            </template>

            <p v-for="sentence in formatTooltipText(tooltip)" :key="sentence">
              {{ sentence }}
            </p>
          </Tooltip>
        </div>

        <div font-semibold lh-none v-bind="$attrs" flex="~ items-center" :class="paddingXs && typeof value === 'string' && value.length > 6 ? 'f-text-xl' : 'f-text-2xl'" :style="`color: var(--nq-${color})`" h-full>
          <component :is="$slots.default" v-if="value === undefined" />
          <span v-else justify-self-start w-max padding-xs font-semibold>
            {{ value }}
          </span>
        </div>
      </div>
    </DefineStat>

    <div v-if="statusFetch === 'pending' || validatorsStatus === 'pending'">
      Loading...
    </div>
    <div v-else-if="statusFetch === 'error' || validatorsStatus === 'error'">
      There was an error: {{ JSON.stringify({ statusFetchError: statusError,
                                              validatorsStatusError: validatorsError }) }}
    </div>
    <div v-else-if="statusFetch === 'success' && validatorsStatus === 'success' && validators" flex="~ col" pt-64 pb-128>
      <div
        grid
        grid-cols="19 md:12 sm:2 xs:1"
        grid-rows="5 md:8 sm:auto xs:auto"
        grid-gap="30 md:24 sm:20 xs:16"
        isolate-auto
      >
        <Stat :value="largeNumberFormatter.format(totalStakers)" label="Stakers" color="gold" :padding-xs="true" :tooltip="tooltips.stakers.value" grid-col="1/6 md:1/4 sm:span-1" grid-row="1" />
        <Stat :value="`${formatLunaAsNim(averageStakeSize)} NIM`" label="Avg. Stake" color="green" class="!text-24" :padding-xs="true" :tooltip="tooltips.averageStake.value" grid-col="6/11 md:4/7 sm:span-1" grid-row="1" />
        <Stat :value="percentageFormatter.format(averageAPY)" label="Avg. APY" color="neutral" class="!text-24" :padding-xs="true" :tooltip="tooltips.averageAPY.value" grid-col="11/16 md:7/10 sm:span-1" grid-row="1" />
        <Stat label="Validators" :padding-xs="true" :tooltip="tooltips.validators.value" grid-col="16/20 md:10/13 sm:span-1" grid-row="1">
          <span>
            <span text-blue>
              {{ totalElected }}
            </span>
            <span text="neutral-600 f-sm"> / {{ totalValidators }}</span>
          </span>
        </Stat>

        <Stat :value="decimalsFormatter.format(averageScore * 100)" label="Avg. Score" color="purple" :padding-xs="true" :tooltip="tooltips.averageScore.value" grid-col="1/6 md:1/4 sm:span-1" grid-row="2" />
        <Stat :value="totalPools" label="Pools" color="red" :padding-xs="true" :tooltip="tooltips.pools.value" grid-col="6/11 md:4/7 sm:span-1" grid-row="2" />
        <Stat :value="percentageFormatter.format(averageFee)" label="Avg. Fee" color="orange" :padding-xs="true" :tooltip="tooltips.averageFee" grid-col="11/16 md:7/10 sm:span-1" grid-row="2" />
        <Stat :value="totalRegistered" label="Tracked" color="blue" :padding-xs="true" :tooltip="tooltips.tracked" grid-col="16/20 md:10/13 sm:span-1" grid-row="2" />

        <Stat label="Stake distribution" :tooltip="tooltips.stakeDistribution.value" grid-col="1/7 md:1/5 sm:span-2" grid-row="3 md:3/6 sm:auto">
          <StakingDistributionDonut />
        </Stat>
        <Stat label="Validator distribution" :tooltip="tooltips.dominanceDistribution" grid-col="7/12 md:5/9 sm:span-2" grid-row="3 md:3/6 sm:auto">
          <ValidatorDistributionDonut :validators />
        </Stat>
        <Stat label="Top validators" relative :tooltip="tooltips.dominanceDistribution" of-y-clip grid-col="12/20 md:9/13 sm:span-2" grid-row="3 md:3/6 sm:auto" pb-0>
          <ScrollAreaRoot absolute flex-1 relative of-hidden style="--scrollbar-size: 8px" h-251 max-w-350 w-full>
            <div absolute top-0 z-10 w-full h-16 bg-gradient-to-t from-transparent to-neutral-0 rounded-tr-8 />
            <ScrollAreaViewport size-full>
              <ul f-p-xs flex="~ col gap-12">
                <li v-for="validator in validators" :key="validator.id" f-text-xs flex="~ justify-between items-center gap-8" f-text-sm>
                  <Identicon v-bind="validator" f-size-md />
                  <div flex="~ col" flex-1>
                    <div flex="~ justify-between gap-32 items-baseline">
                      <span text-ellipsis max-w-25ch>
                        {{ validator.name }}
                      </span>
                      <span flex op-80>
                        {{ formatLunaAsNim(validator.balance) }} NIM
                      </span>
                    </div>
                    <span nq-label letter-spacing="0px">
                      {{ validator.address.slice(0, 4) }}...{{ validator.address.slice(-4) }}
                    </span>
                  </div>
                </li>
              </ul>
            </ScrollAreaViewport>
            <ScrollAreaScrollbar flex select-none touch-none p-1 z-20 bg="neutral-100 hocus:neutral-200" transition-colors duration-160 ease-out w-12 overscroll-contain rounded-r-8>
              <ScrollAreaThumb flex-1 bg-neutral="300 hocus:400" relative before="absolute top-50% left-50% translate-x-50% translate-y-50% size-full min-w-40 min-h-40" rounded-full />
            </ScrollAreaScrollbar>
            <div absolute bottom-0 z-10 w-full h-16 bg-gradient-to-b from-transparent to-neutral-0 rounded-br-8 />
          </ScrollAreaRoot>
        </Stat>

        <Stat label="Score epoch window" z-20 relative :tooltip="tooltips.scoreEpochWindow.value" grid-col="1/20 md:1/13 sm:span-2" grid-row="4 md:6/8 sm:auto">
          <Window v-if="status?.range" :range="status.range" />
        </Stat>
      </div>

      <ValidatorsTable :validators mt-96 />
    </div>
  </div>
</template>
