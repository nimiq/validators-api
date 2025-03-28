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

const [DefineStat, Stat] = createReusableTemplate<{ value?: number, label: string }>()
</script>

<template>
  <div>
    <DefineStat v-slot="{ label, value }">
      <div flex="~ col">
        <span text-32 font-semibold lh-none v-bind="$attrs">
          <slot name="default">{{ value }}</slot>
        </span>
        <span nq-label text="11 neutral-800">
          {{ label }}
        </span>
      </div>
    </DefineStat>

    <div v-if="statusFetch === 'pending' || validatorsStatus === 'pending'">
      Loading...
    </div>
    <div v-else-if="statusFetch === 'error' || validatorsStatus === 'error'">
      There was an error: {{ JSON.stringify({ statusFetchError: statusError, validatorsStatusError: validatorsError }) }}
    </div>
    <div v-else-if="statusFetch === 'success' && validatorsStatus === 'success' && validators" flex="~ col" pt-64 pb-128>
      <div flex="~ wrap gap-96 justify-center" of-x-auto mx--32 px-32 pb-64>
        <Stat label="Validators" text-gold>
          <template #default>
            {{ status?.validators?.selectedValidators?.length }} <span text="neutral-600 f-sm">out of {{ status?.validators?.unselectedValidators?.length }}</span>
          </template>
        </Stat>
        <Stat :value="status!.range.currentEpoch" label="Current epoch" text-green />
        <Stat :value="averageScore" label="Avg. Score" text-purple />
      </div>

      <ValidatorsTable :validators mt-96 />

      <h2 text-center mt-128>
        Dominance distribution
      </h2>

      <Donut :data="validators" mt-48 />
    </div>
  </div>
</template>
