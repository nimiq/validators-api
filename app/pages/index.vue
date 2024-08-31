<script setup lang="ts">
const { data, status, error } = useFetch('/api/scores')
const validators = computed(() => data.value?.validators || [])

const averageScore = computed(() => {
  if (!validators.value?.length)
    return 0
  const scores = validators.value.map(validator => validator.total).filter(t => !!t) as number[]
  const totalScore = scores?.reduce((acc, score) => acc + score, 0) || 0
  return totalScore / validators.value.length
})
</script>

<template>
  <div v-if="status === 'pending'">
    Loading...
  </div>
  <div v-else-if="status === 'error'">
    There was an error: {{ JSON.stringify(error) }}
  </div>

  <div v-else-if="status === 'success'" flex="~ col" pt-64 pb-128>
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
          {{ data?.range.toEpoch }}
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
