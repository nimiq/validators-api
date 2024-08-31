<script setup lang="ts">
const colorMode = useColorMode()
const toggleDark = () => colorMode.value = colorMode.value === 'light' ? 'dark' : 'light'

const route = useRoute()
const validatorDetail = computed(() => !!route.params.address)

const networkName = useRuntimeConfig().public.nimiqNetwork

const { data: health } = useFetch('/api/v1/scores/health')
</script>

<template>
  <div flex="~ col gap-64" mx-auto size-screen max-h-screen max-w-1200 px-32 py-20>
    <header flex="~ gap-32 row items-center">
      <NuxtLink to="/" flex>
        <div aria-hidden i-nimiq:logos-nimiq-horizontal class="!ml-16 !h-24 !w-90" dark:i-nimiq:logos-nimiq-white-horizontal />
        <span ml-8 text-16 font-light tracking-0.75>Validators</span>
        <span bg="orange/10" relative top--6 ml-6 h-max rounded-2 px-6 py-2 text-9 text-orange nq-label>{{ networkName }}</span>
      </NuxtLink>
      <NuxtLink v-if="validatorDetail" to="/" block w-max nq-arrow-back nq-ghost-btn>
        Go back
      </NuxtLink>
      <div flex-auto />
      <NuxtLink to="/scores/health" :class="{ 'bg-green/10 text-green': health?.isSynced, 'bg-red/10 text-red': !health?.isSynced }" rounded-full px-12 py-4 text-11 flex="~ items-center gap-6">
        <div text-10 :class="health?.isSynced ? 'i-nimiq:check' : 'i-nimiq:alert'" />
        <span font-semibold>{{ health?.isSynced ? 'Synced' : 'Not Synced' }}</span>
      </NuxtLink>
      <NuxtLink to="https://github.com/onmax/nimiq-validators" i-nimiq:logos-github-mono target="_blank" />
      <button i-nimiq:moon @click="() => toggleDark()" />
    </header>

    <main flex-1>
      <NuxtPage />
    </main>
  </div>
</template>
