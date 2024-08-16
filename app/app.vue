<script setup lang="ts">
const colorMode = useColorMode()
const toggleDark = () => colorMode.value = colorMode.value === 'light' ? 'dark' : 'light'

const route = useRoute()
const validatorDetail = computed(() => !!route.params.address)

const networkName = useRuntimeConfig().public.nimiqNetwork

const { data: health } = useFetch('/api/vts/health')
</script>

<template>
  <div flex="~ col gap-64" mx-auto size-screen max-h-screen max-w-1200 px-32 py-20>
    <header flex="~ gap-32 row items-center">
      <NuxtLink to="/" flex>
        <div aria-hidden i-nimiq:logos-nimiq-horizontal class="!ml-16 !h-24 !w-90" dark:i-nimiq:logos-nimiq-white-horizontal />
        <span font-light text-16 tracking-0.75 ml-8>Validators</span>
        <span top--6 relative h-max py-2 px-6 ml-6 nq-label text-orange bg="orange/10" rounded-2 text-9>{{ networkName }}</span>
      </NuxtLink>
      <NuxtLink v-if="validatorDetail" to="/" block w-max nq-arrow-back nq-ghost-btn>
        Go back
      </NuxtLink>
      <div flex-auto />
      <NuxtLink to="/vts/health" :class="{ 'bg-green/10 text-green': health?.isSynced, 'bg-red/10 text-red': !health?.isSynced}" px-12 py-4 rounded-full text-11 flex="~ items-center gap-6">
        <div  text-10 :class="health?.isSynced ? 'i-nimiq:check' : 'i-nimiq:alert'"/>
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
