<script setup lang="ts">
const { data: health, status, error } = useFetch('/api/health')
const network = useRuntimeConfig().public.nimiqNetwork
</script>

<template>
  <div class="nq-prose">
    <div flex="~ items-center justify-between">
      <h1 max-w-inherit my-32>Network <code px-4 rounded-6>{{ network }}</code></h1>
      <NuxtLink to="/api/health" target="_blank" nq-arrow nq-pill-tertiary text-12 op-80>
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
      <p v-if="health.isSynced">The network is <span text-green font-bold>synced</span></p>
      <p v-else>The network is <span text-red font-bold>not synced</span></p>

      <p v-if="health.flags.length > 0">
        {{ JSON.stringify(health.flags) }}
      </p>

      <div mt-32>
        <p>
          Range: [{{ health.range.fromEpoch }} - {{ health.range.toEpoch }}] ({{ health.range.epochCount }} epochs)
        </p>
        <p text-neutral-700 text-13 m-0>
          The range of blocks used to compute the score of the validators. We don't consider the first epoch as it is an speacial epoch.
        </p>
      </div>


      <div mt-16>
        <p>
          Current Epoch: {{ health.currentEpoch }}
        </p>
        <p m-0>
          Latest Fetched Epoch: {{ health.latestFetchedEpoch }}
        </p>
        <p text-neutral-700 text-13 m-0>
          We only use finished epochs to compute the score of the validators.
        </p>
      </div>

      <template v-if="health.missingEpochs.length > 0">
        <h3>Missing Epochs</h3>
        <p v-for="epoch in health.missingEpochs" :key="epoch">{{ epoch }}</p>
      </template>

        <p mt-32>
          {{ health.fetchedEpochs.length }} epochs fetched
        </p>
        <p text-11 m-0>
          {{ health.fetchedEpochs.join(', ') }}
        </p>

      <p mt-32>
        {{ health.missingEpochs.length }} epochs missing
      </p>
      <p v-if="health.missingEpochs.length > 0" text-11 m-0>
        {{ health.missingEpochs.join(', ') }}
      </p>

      <details mt-32>
        <summary>Details</summary>
        <pre px-2 font-12>{{ JSON.stringify(health, null, 2) }}</pre>
      </details>
    </div>
    
  </div>
</template>
