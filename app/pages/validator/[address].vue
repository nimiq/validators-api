<script setup lang="ts">
const route = useRoute()
const { data: validator } = await useFetch(`/api/v1/validators/${route.params.address}`)
const layout = ref<'dashboard' | 'deep-dive' | 'profile'>('dashboard')
const layouts = [
  { key: 'dashboard' as const, label: 'Dashboard' },
  { key: 'deep-dive' as const, label: 'Deep Dive' },
  { key: 'profile' as const, label: 'Profile' },
]
</script>

<template>
  <div v-if="validator">
    <!-- Shared header -->
    <div flex="~ gap-16 items-center">
      <Identicon
        v-bind="validator" size-64 shrink-0 object-contain
        :style="{ 'view-transition-name': `logo-${validator.id}` }"
      />
      <div flex="~ col gap-12" relative>
        <h1 m-0 text-28 lh-none :style="{ 'view-transition-name': `h-${validator.id}` }">
          {{ validator.name }}
        </h1>
        <Copyable :content="validator.address" m-0 text-15 tracking-wide :style="{ 'view-transition-name': `address-${validator.id}` }" />
      </div>
      <div flex-auto />
      <div
        v-if="validator.isMaintainedByNimiq" nq-pill self-start bg-green-400 text-green-1100 nq-pill-secondary
        flex="~ items-center gap-8"
      >
        <div aria-hidden i-nimiq:verified-filled />
        <span>Maintained by Nimiq</span>
      </div>
      <NuxtLink v-if="validator.website" :to="validator.website" target="_blank" nq-pill ml-auto self-start nq-arrow nq-pill-tertiary>
        {{ validator.website?.replace(/https?:\/\//, '') }}
      </NuxtLink>
    </div>
    <p v-if="validator.description" f-mt-xs ml-80 text="neutral-800 f-sm">
      {{ validator.description }}
    </p>

    <!-- Layout switcher -->
    <div flex="~ gap-4" mt-24 bg-neutral-100 rounded-8 p-4 w-fit>
      <button
        v-for="l in layouts" :key="l.key"
        text-14 font-semibold px-16 py-8 rounded-6 transition-colors
        :class="layout === l.key ? 'bg-neutral-0 text-neutral-900 shadow' : 'text-neutral-600 hover:text-neutral-800'"
        @click="layout = l.key"
      >
        {{ l.label }}
      </button>
    </div>

    <!-- Active layout -->
    <ValidatorLayoutDashboard v-if="layout === 'dashboard'" :validator="validator" />
    <ValidatorLayoutDeepDive v-else-if="layout === 'deep-dive'" :validator="validator" />
    <ValidatorLayoutProfile v-else :validator="validator" />
  </div>

  <div v-else>
    <p text-center font-semibold>
      Validator {{ route.params.address }} not found
    </p>
    <NuxtLink to="/" mx-auto mt-16 nq-arrow-back nq-pill-blue>
      Go back
    </NuxtLink>
  </div>
</template>
