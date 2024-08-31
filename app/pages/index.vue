<script setup lang="ts">
const { validators, range, statusValidators, errorValidators } = useApiStore()

const averageScore = computed(() => {
  if (!validators?.length)
    return 0
  const scores = validators.map(validator => validator.total).filter(t => !!t) as number[]
  const totalScore = scores?.reduce((acc, score) => acc + score, 0) || 0
  return totalScore / validators.length
})
</script>

<template>
  <div v-if="statusValidators === 'pending'">
    Loading...
  </div>
  <div v-else-if="statusValidators === 'error'">
    There was an error: {{ JSON.stringify(errorValidators) }}
  </div>

  <div v-else-if="statusValidators === 'success'" flex="~ col" pt-64 pb-128>
    <div flex="~ wrap gap-96 justify-center" of-x-auto mx--32 px-32 pb-64>
      <Stat text-green>
        <template #value>
          {{ validators?.length }}
        </template>
        <template #description>
          Validators
        </template>
      </Stat>
      <Stat text-blue>
        <template #value>
          {{ range?.toEpoch }}
        </template>
        <template #description>
          Epoch
        </template>
      </Stat>
      <Stat text-red>
        <template #value>
          {{ (averageScore * 100).toFixed(2) }}
        </template>
        <template #description>
          Avg. score
        </template>
      </Stat>
    </div>

    <ValidatorsTable :validators mt-96 />

    <h2 text-center mt-128>
      Size distribution
    </h2>

    <Donut :data="validators" mt-48 />
  </div>
</template>
