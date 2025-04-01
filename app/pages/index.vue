<script setup lang="ts">
const { data: status, status: statusFetch, error: statusError } = await useFetch('/api/v1/status')
const { data: validators, status: validatorsStatus, error: validatorsError } = await useFetch('/api/v1/validators')
const averageScore = computed(() => {
  if (!validators?.value?.length)
    return 0
  const scores = validators.value.map(validator => validator.score?.total).filter(t => !!t) as number[]
  const totalScore = scores?.reduce((acc, score) => acc + score, 0) || 0
  return totalScore / scores.length
})

const [DefineStat, Stat] = createReusableTemplate<{ value?: number | string, label: string, color?: string }>()
</script>

<template>
  <div>
    <DefineStat v-slot="{ label, value, color, $slots }">
      <div flex="~ col gap-12" outline="~ 1.5 neutral/6" rounded-8 f-p-md shadow relative z-1 bg-neutral-0>
        <span nq-label text="11 neutral-800">
          {{ label }}
        </span>
        <div text-32 font-semibold lh-none v-bind="$attrs" flex="~ items-center" :style="`color: rgb(var(--nq-${color}))`" h-full>
          <component :is="$slots.default" v-if="!value" />
          <span v-else justify-self-start w-max font-semibold>
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
      <div grid="~ cols-6 gap-24" isolate-auto>
        <Stat label="Validators">
          <span>
            <span :title="`${status?.validators?.selectedValidators?.length} selected validators`" text-gold>
              {{ status?.validators?.selectedValidators?.length }}
            </span>
            <span text="neutral-600 f-sm" :title="`${status?.validators?.unselectedValidators?.length} tracked validators`"> / {{ status?.validators?.unselectedValidators?.length }}</span>
          </span>
        </Stat>
        <Stat :value="status!.range.currentEpoch" label="Stakers" color="purple" row-start-2 />
        <Stat label="Stake distribution" col-span-2 row-span-2>
          <StakingDistributionDonut />
        </Stat>
        <Stat label="Validator distribution" col-span-3 row-span-2 relative>
          <div flex="~ gap-32 items-center">
            <ValidatorDistributionDonut :validators />
            <div absolute right--0 top--0>
              <ScrollAreaRoot absolute flex-1 relative of-hidden style="--scrollbar-size: 8px" h-256>
                <div absolute top-0 z-10 w-full h-16 bg-gradient-to-t from-transparent to-white rounded-tr-8 />
                <ScrollAreaViewport size-full>
                  <ul f-p-xs flex="~ col gap-12">
                    <li v-for="validator in validators" :key="validator.id" f-text-xs flex="~ justify-between items-center gap-8" f-text-sm>
                      <Identicon :validator f-size-md />
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
                <div absolute bottom-0 z-10 w-full h-16 bg-gradient-to-b from-transparent to-white rounded-br-8 />
              </ScrollAreaRoot>
            </div>
          </div>
        </Stat>
        <Stat label="Score epoch window" col-span-4 z-20>
          <Window v-if="status?.range" :range="status.range" />
        </Stat>
        <Stat :value="decimalsFormatter.format(averageScore * 100)" label="Avg. Score" color="purple" col-span-1 />
      </div>

      <ValidatorsTable :validators mt-96 />
    </div>
  </div>
</template>
