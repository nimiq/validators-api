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
      <div flex="~ col gap-12" outline="~ 1.5 neutral/6" rounded-8 f-p-md shadow>
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
      <div grid="~ cols-6 gap-24">
        <Stat label="Validators" col-span-2>
          <span>
            <span :title="`${status?.validators?.selectedValidators?.length} selected validators`" text-gold>
              {{ status?.validators?.selectedValidators?.length }}
            </span>
            <span text="neutral-600 f-sm" :title="`${status?.validators?.unselectedValidators?.length} tracked validators`"> / {{ status?.validators?.unselectedValidators?.length }}</span>
          </span>
        </Stat>
        <Stat :value="status!.range.currentEpoch" label="Current epoch" color="green" col-span-2 />
        <Stat :value="averageScore" label="Avg. Score" color="purple" col-span-2 />
        <Stat label="Score window" col-span-3>
          <Window v-if="status?.range" :range="status.range" />
        </Stat>
        <Stat label="Stake distribution" col-span-3>
          <StakingDistributionDonut />
        </Stat>
      </div>

      <ValidatorsTable :validators mt-96 />
    </div>
  </div>
</template>
