<script setup lang="ts">
const route = useRoute()
const { data: validator } = await useFetch(`/api/v1/validators/${route.params.address}`)
</script>

<template>
  <div v-if="validator">
    <div flex="~ gap-16 items-center">
      <Identicon
        :validator size-64 shrink-0 object-contain
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
        v-if="validator.isMaintainedByNimiq" nq-pill-sm self-start bg-green-400 text-green-1100 nq-pill-secondary
        flex="~ items-center gap-8"
      >
        <div aria-hidden i-nimiq:verified-filled />
        <span>Maintained by Nimiq</span>
      </div>
      <NuxtLink v-if="validator.website" :to="validator.website" target="_blank" nq-pill-sm ml-auto self-start nq-arrow nq-pill-tertiary>
        {{ validator.website?.replace(/https?:\/\//, '') }}
      </NuxtLink>
    </div>
    <p v-if="validator.description" f-mt-xs ml-80 text="neutral-800 f-sm">
      {{ validator.description }}
    </p>

    <div flex="~ col items-center justify-center" mt-96>
      <h3 text="center neutral-900" mb-0 font-bold>
        {{ validator.name }}'s score is
      </h3>
      <ScorePie
        mx-auto mt-32 size-128 text-40 :score="validator.score.total || 0"
        :style="{ 'view-transition-name': `score-${validator.id}` }"
      />

      <ScorePies :validator mt-64 text-28 />

      <details>
        <summary text-neutral-900 font-semibold mt-32 w-full>
          More details
        </summary>
        <code nq-prose mt-32 block max-w-700 text-neutral-900>
          {{ JSON.stringify(validator, null, 2) }}
        </code>
      </details>
    </div>
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
