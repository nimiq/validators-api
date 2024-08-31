<script setup lang="ts">
const { data: health, status, error } = useFetch('/api/v1/scores/health')
const network = useRuntimeConfig().public.nimiqNetwork
</script>

<template>
  <div class="nq-prose">
    <div flex="~ items-center justify-between">
      <h1 my-32 max-w-inherit>
        Network <code rounded-6 px-4>{{ network }}</code>
      </h1>
      <NuxtLink to="/api/v1/scores/health" target="_blank" text-12 op-80 nq-arrow nq-pill-tertiary>
        API
      </NuxtLink>
    </div>

    <div v-if="status === 'pending'">
      <p>Loading...</p>
    </div>

    <div v-else-if="status === 'error'">
      <p>Failed to fetch health data</p>
      <pre>{{ error }}</pre>
    </div>

    <div v-else-if="status === 'success' && health" mt-12>
      <p v-if="health.isSynced">
        The network is <span text-green font-bold>synced</span>
      </p>
      <p v-else>
        The network is <span text-red font-bold>not synced</span>
      </p>

      <p v-if="health.flags.length > 0">
        Flags: {{ JSON.stringify(health.flags) }}
      </p>

      <div mt-32>
        <p>
          Range: [{{ health.range.fromEpoch }} ({{ (health.range.fromBlockNumber) }}) - {{ health.range.toEpoch }} ({{ health.range.toBlockNumber }})] ({{ health.range.epochCount }} epochs)
        </p>
        <p m-0 text-13 text-neutral-700>
          The range of blocks used to compute the score of the validators. We don't consider the first epoch (<code>epoch index = 0</code>) as it is an speacial epoch.
        </p>
      </div>

      <div mt-16>
        <p>
          Current Epoch: {{ health.currentEpoch }}
        </p>
        <p m-0>
          Latest Fetched Epoch: {{ health.latestFetchedEpoch }}
        </p>
        <p m-0 text-13 text-neutral-700>
          We only use finished epochs to compute the score of the validators.
        </p>
      </div>

      <template v-if="health.missingEpochs.length > 0">
        <h3>Missing Epochs</h3>
        <p v-for="epoch in health.missingEpochs" :key="epoch">
          {{ epoch }}
        </p>
      </template>

      <p mt-32>
        {{ health.fetchedEpochs.length }} epochs fetched
      </p>
      <p m-0 text-11>
        {{ health.fetchedEpochs.join(', ') }}
      </p>

      <p mt-32>
        {{ health.missingEpochs.length }} epochs missing
      </p>
      <p v-if="health.missingEpochs.length > 0" m-0 text-11>
        {{ health.missingEpochs.join(', ') }}
      </p>

      <details mt-32>
        <summary>Details</summary>
        <pre px-2 font-12>{{ JSON.stringify(health, null, 2) }}</pre>
      </details>
    </div>
  </div>
</template>
