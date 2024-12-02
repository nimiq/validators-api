<script setup lang="ts">
const colorMode = useColorMode()
const toggleDark = () => colorMode.value = colorMode.value === 'light' ? 'dark' : 'light'

const route = useRoute()
const validatorDetail = computed(() => !!route.params.address)

const { fetch, health, statusHealth } = useApiStore()
fetch()

const networkName = useRuntimeConfig().public.nimiqNetwork
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
      <div :class="{ 'bg-green/10 text-green': health?.isSynced, 'bg-red/10 text-red': statusHealth !== 'pending' && !health?.isSynced, 'bg-gold/10 text-gold': statusHealth === 'pending' }" rounded-full px-12 py-4 text-11 children:flex="~ items-center gap-6">
        <NuxtLink v-if="statusHealth === 'success'" to="/scores/health">
          <div text-10 :class="health?.isSynced ? 'i-nimiq:check' : 'i-nimiq:alert'" />
          <span font-semibold>{{ health?.isSynced ? 'Synced' : 'Not Synced' }}</span>
        </NuxtLink>
        <div v-else-if="statusHealth === 'pending'">
          <div text-10 i-nimiq:spinner />
          <span font-semibold>Checking...</span>
        </div>
        <NuxtLink v-else>
          <div text-10 i-nimiq:alert />
          <span font-semibold>Error</span>
        </NuxtLink>
      </div>
      <NuxtLink to="https://github.com/nimiq/validators-api" i-nimiq:logos-github-mono target="_blank" />
      <button i-nimiq:moon @click="() => toggleDark()" />
    </header>
    <main flex-1>
      <NuxtPage />
    </main>
  </div>
</template>
