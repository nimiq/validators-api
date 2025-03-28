<script setup lang="ts">
const { data: status, execute: refetchStatus } = await useFetch('/api/v1/status')
const colorMode = useColorMode()
const toggleDark = () => colorMode.value = colorMode.value === 'light' ? 'dark' : 'light'

const route = useRoute()
const validatorDetail = computed(() => !!route.params.address)
// TOD Add window size stat
// TODO add clock to next epoch

const { nimiqNetwork } = useRuntimeConfig().public

const { status: syncStatus, execute: sync } = await useFetch('/api/v1/sync', { lazy: true, onResponse: refetchStatus })
</script>

<template>
  <div flex="~ col gap-64" mx-auto size-screen max-h-screen max-w-1200 px-32 py-20>
    <header flex="~ gap-32 row items-center">
      <NuxtLink to="/" flex>
        <div aria-hidden i-nimiq:logos-nimiq-horizontal class="!ml-16 !h-24 !w-90" dark:i-nimiq:logos-nimiq-white-horizontal />
        <span ml-8 text-16 font-light tracking-0.75>Validators</span>
        <span bg="orange/10" relative top--6 ml-6 h-max rounded-2 px-6 py-2 text-9 text-orange nq-label>{{ nimiqNetwork }}</span>
      </NuxtLink>
      <NuxtLink v-if="validatorDetail" to="/" block w-max nq-arrow-back nq-ghost-btn>
        Go back
      </NuxtLink>
      <div ml-auto>
        <button v-if="status?.missingEpochs?.length" nq-pill :disabled="syncStatus === 'pending'" @click="() => sync()">
          Sync
        </button>
      </div>
      <NuxtLink to="https://github.com/nimiq/validators-api" i-nimiq:logos-github-mono target="_blank" />
      <button i-nimiq:moon @click="() => toggleDark()" />
    </header>
    <main flex-1>
      <NuxtPage />
    </main>
  </div>
</template>
