<script setup lang="ts">
import { ValidatorTag } from '~/server/utils/drizzle'

const { validators } = storeToRefs(useValidatorsStore())

const route = useRoute()
const validator = computed(() => {
  return validators.value?.find(validator => validator.address === route.params.address)
})
</script>

<template>
  <div v-if="validator">
    <!-- TODO Remove w-max  -->
    <div flex="~ gap-16 items-center">
      <NuxtImg :src="validator.icon" :alt="validator.name" size-64 shrink-0 object-contain
        :style="{ 'view-transition-name': `logo-${validator.id}` }" />
      <div flex="~ col gap-2" relative>
        <h1 text-28 lh-none pb-4 :style="{ 'view-transition-name': `h-${validator.id}` }">{{ validator.name }}</h1>
        <Address :validator text-15 tracking-wide :style="{ 'view-transition-name': `address-${validator.id}` }" />
      </div>
      <div flex-auto />
      <div v-if="validator.tag === ValidatorTag.Nimiq" self-start bg-green-400 pill-sm text-green-1100
        flex="~ items-center gap-8">
        <div i-nimiq:icons-lg-verified-filled aria-hidden />
        <span>Maintained by Nimiq</span>
      </div>
      <NuxtLink v-if="validator.website" :to="validator.website" self-start ml-auto arrow pill-sm pill-tertiary>{{
        validator.website?.replace(/https?:\/\//, '') }}</NuxtLink>
    </div>
    <!-- <p v-if="validator.description" mt-8 ml-80 text-neutral-800>{{ validator.description }}</p> -->

    <div flex="~ col items-center justify-center" mt-96>
      <h3 text="center neutral-900" font-bold mb-0>{{ validator.name }}'s score is</h3>
      <ScorePie mt-32 text-40 size-128 mx-auto :score="validator.total"
        :style="{ 'view-transition-name': `score-${validator.id}` }" />
      <div flex="~ items-center gap-48" mt-64>
        <div>
          <h4 label text="12 center">size</h4>
          <ScorePie text="28 neutral/70" mt-6 size-80 mx-auto :score="validator.size" />
        </div>
        <div>
          <h4 label text="12 center">liveness</h4>
          <ScorePie text="28 neutral/70" mt-6 size-80 mx-auto :score="validator.liveness" />
        </div>
        <div>
          <h4 label text="12 center">reliability</h4>
          <ScorePie text="28 neutral/70" mt-6 size-80 mx-auto :score="validator.reliability" />
        </div>
      </div>
      <!-- <div self-stretch  w-2 bg-neutral-300 mx-48 /> -->

      <p text-neutral-900 block max-w-700 mt-32>
        {{ validator }}
      </p>
    </div>
  </div>

  <div v-else>
    <p font-semibold text-center>Validator {{ route.params.address }} not found</p>
    <NuxtLink to="/" arrow-back pill-blue mx-auto mt-16>Go back</NuxtLink>
  </div>
</template>
