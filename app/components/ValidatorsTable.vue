<script setup lang="ts">
defineProps<{ validators: ValidatorScore[] }>()
</script>

<template>
  <div
    v-if="validators.length > 0" grid="~ gap-x-32" style="grid-template-columns: 56px max-content 1fr max-content"
    of-x-auto mx--32 px-32
  >
    <div />
    <div nq-label font-bold text="11 neutral-700" py-2>
      Name
    </div>
    <div nq-label font-bold text="11 neutral-700" py-2>
      Address
    </div>
    <div nq-label font-bold text="11 neutral-700" py-2 text-center>
      Score
    </div>
    <NuxtLink
      v-for="validator in validators" :key="validator.address" :to="`/validator/${validator.address}`"
      border="t neutral-200" grid="~ rows-subgrid cols-subgrid col-span-full items-center"
      bg="transparent even:neutral-50 hocus:neutral-200 hocus:even:neutral-300" transition-colors py-16
    >
      <Identicon
        :validator :alt="validator.name!" size-32 mr--20 ml-20 object-contain
        :style="{ 'view-transition-name': `logo-${validator.id}` }"
      />

      <div mr-24 flex="~ items-center gap-8">
        <h2 text-14 op-90 lh-none font-light w-max :style="{ 'view-transition-name': `h-${validator.id}` }">
          {{ validator.name }}
        </h2>
        <div
          v-if="validator.isMaintainedByNimiq" i-nimiq:icons-lg-verified-filled text="13 green/70"
          title="Maintained by Nimiq"
        />
      </div>

      <Copyable :content="validator.address" :style="{ 'view-transition-name': `address-${validator.id}` }" />

      <ScorePie
        size-32 text-12 mx-auto :score="validator.total"
        :style="{ 'view-transition-name': `score-${validator.id}` }"
      />
    </NuxtLink>
  </div>
  <div v-else>
    There are no validators to display.
  </div>
</template>
