<script setup lang="ts">
const { validators, averageScore } = storeToRefs(useValidatorsStore())

const { data: validatorsInEpoch } = useFetch('/api/_hub/database/query', {
  method: 'POST',
  body: { query: 'SELECT COUNT(*) AS total FROM scores' },
  transform: (res) => res.results.at(0)?.total,
})

const { data: validatorsInDb } = useFetch('/api/_hub/database/query', {
  method: 'POST',
  body: { query: 'SELECT COUNT(*) AS total FROM validators' },
  transform: (res) => res.results.at(0)?.total,
})
</script>

<template>
  <div flex="~ col" pt-64 pb-128>
    <div flex="~ wrap gap-96 justify-center" of-x-auto mx--32 px-32 pb-64>
      <Stat text-green>
        <template #value>{{ validatorsInEpoch }} <span text="18 neutral-700">/ {{ validatorsInDb }}</span></template>
        <template #description>Validators</template>
      </Stat>
      <Stat text-blue>
        <template #value>85</template>
        <template #description>Epoch</template>
      </Stat>
      <Stat text-red>
        <template #value>{{ (averageScore * 100).toFixed(2) }}</template>
        <template #description>Avg. score</template>
      </Stat>
    </div>
    
    <ValidatorsTable :validators mt-96 />

    <h2 text-center mt-128>Size distribution</h2>

    <Donut :data="validators" mt-48 />
  </div>
</template>
