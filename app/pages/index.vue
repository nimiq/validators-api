<script setup lang="ts">
import { calculateStakingRewards } from '@nimiq/utils/rewards-calculator'
import { formatTimeAgo } from '@vueuse/core'

const { data: status, status: statusFetch, error: statusError } = await useFetch('/api/v1/status')
const { data: validators, status: validatorsStatus, error: validatorsError } = await useFetch('/api/v1/validators', {
  query: { 'only-known': false },
})
const { data: distribution } = await useFetch('/api/v1/distribution')
const { averageAPY, averageScore, averageStakeSize, totalPools, totalRegistered, totalStakers, averageFee, windowSizeMonths } = useStats()

const [DefineStat, Stat] = createReusableTemplate<{ value?: number | string, label: string, color?: string, paddingXs?: boolean }>()

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
  const averageStakeSize = computed(() => (distribution.value?.staked || 0) / totalStakers.value)
  const pools = computed(() => validators.value?.filter(validator => validator.payoutType !== 'none') || [])
  const totalPools = computed(() => pools.value.length)
  const totalRegistered = computed(() => validators.value?.reduce((acc, validator) => acc + (validator.name !== 'Unknown validator' ? 1 : 0), 0) || 0)

  const windowSizeMonths = computed(() => {
    if (!status.value?.range)
      return 0
    const { fromTimestamp } = status.value.range
    const ago = formatTimeAgo(new Date(fromTimestamp))
    return ago.replace(' ago', '')
  })

  const averageFee = computed(() => pools.value.reduce((acc, pool) => acc + (pool.fee || 0), 0) / pools.value.length)
  const averageAPY = computed(() => {
    if (!distribution.value?.stakedRatio)
      return 0
    return calculateStakingRewards({ stakedSupplyRatio: distribution.value?.stakedRatio, network, fee: averageFee.value }).gainRatio
  })

  return {
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
    <DefineStat v-slot="{ label, value, color, $slots, paddingXs }">
      <div flex="~ col" outline="~ 1.5 neutral/6" rounded-8 :class="paddingXs ? 'f-p-xs gap-4' : 'f-p-md gap-12'" shadow relative z-1 bg-neutral-0>
        <span nq-label text="11 neutral-800">
          {{ label }}
        </span>
        <div font-semibold lh-none v-bind="$attrs" flex="~ items-center" :class="paddingXs && typeof value === 'string' && value.length > 6 ? 'f-text-xl' : 'f-text-2xl'" :style="`color: rgb(var(--nq-${color}))`" h-full>
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
      There was an error: {{ JSON.stringify({ statusFetchError: statusError, validatorsStatusError: validatorsError }) }}
    </div>
    <div v-else-if="statusFetch === 'success' && validatorsStatus === 'success' && validators" flex="~ col" pt-64 pb-128>
      <div grid="~ cols-16 gap-24" isolate-auto>
        <Stat :value="largeNumberFormatter.format(totalStakers)" label="Stakers" color="gold" :padding-xs="true" col-span-3 />
        <Stat :value="`${nimFormatter.format(averageStakeSize)} NIM`" label="Avg. Stake" color="green" row-start-2 col-span-3 class="!text-24" :padding-xs="true" />
        <Stat :value="percentageFormatter.format(averageAPY)" label="Avg. APY" color="neutral" row-start-3 col-span-3 class="!text-24" :padding-xs="true" />
        <Stat label="Stake distribution" col-span-5 row-span-3>
          <StakingDistributionDonut />
        </Stat>
        <Stat label="Dominance distribution" col-span-8 row-span-3 relative>
          <div flex="~ gap-32 items-center">
            <ValidatorDistributionDonut :validators />
            <div absolute right--0 top--0>
              <ScrollAreaRoot absolute flex-1 relative of-hidden style="--scrollbar-size: 8px" h-251>
                <div absolute top-0 z-10 w-full h-16 bg-gradient-to-t from-transparent to-neutral-0 rounded-tr-8 />
                <ScrollAreaViewport size-full>
                  <ul f-p-xs flex="~ col gap-12">
                    <li v-for="validator in validators" :key="validator.id" f-text-xs flex="~ justify-between items-center gap-8" f-text-sm>
                      <Identicon v-bind="validator" f-size-md />
                      <div flex="~ col" flex-1>
                        <div flex="~ justify-between gap-32 items-baseline">
                          <span text-ellipsis>
                            {{ validator.name }}
                          </span>
                          <span flex op-80>
                            {{ nimFormatter.format(validator.balance / 1e5) }} NIM
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
            </div>
          </div>
        </Stat>
        <Stat label="Score epoch window" col-span-10 z-20 row-span-2 group relative>
          <div flex="~ col" w-full>
            <Window v-if="status?.range" :range="status.range" />
            <div flex="~ items-center gap-8" absolute bottom--20 op="0 group-hocus:100" transition>
              <div text="10 neutral-700" i-nimiq:info />
              <p text="f-2xs neutral-800 " font-400>
                The score is based on epochs {{ status?.range?.fromEpoch }}–{{ status?.range?.toEpoch }}, covering the past {{ windowSizeMonths }} (snapshot epoch {{ status?.range?.snapshotEpoch }}).
              </p>
            </div>
          </div>
        </Stat>
        <Stat label="Validators" :padding-xs="true" col-span-3>
          <span>
            <span :title="`${status?.validators?.electedValidators?.length} elected validators in the current epoch`" text-blue>
              {{ status?.validators?.electedValidators?.length }}
            </span>
            <span text="neutral-600 f-sm" :title="`${status?.validators?.unelectedValidators?.length} tracked validators`"> / {{ status?.validators?.unelectedValidators?.length }}</span>
          </span>
        </Stat>
        <Stat :value="decimalsFormatter.format(averageScore * 100)" col-span-3 label="Avg. Score" color="purple" :padding-xs="true" />
        <Stat :value="totalPools" label="Pools" color="red" col-span-2 :padding-xs="true" />
        <Stat :value="totalRegistered" col-span-2 label="Tracked" color="orange" :padding-xs="true" title="The total amount of validators that have submitted information about them." />
        <Stat :value="percentageFormatter.format(averageFee)" col-span-2 label="Avg. Fee" color="blue" :padding-xs="true" />
      </div>

      <ValidatorsTable :validators mt-96 />
    </div>
  </div>
</template>
