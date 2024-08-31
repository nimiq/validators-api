<script setup lang="ts">
defineProps<{ validator: ValidatorScore }>()
</script>

<template>
  <div flex="~ items-center gap-2em">
    <div>
      <h4 nq-label text="0.5em center">
        size
      </h4>
      <ScorePie text="neutral/70" mx-auto mt-6 size-2.75em :score="validator.size" />
    </div>
    <div>
      <h4 nq-label text="0.5em center">
        liveness
      </h4>
      <ScorePie text="neutral/70" mx-auto mt-6 size-2.75em :score="validator.liveness" />
    </div>
    <div>
      <h4 nq-label text="0.5em center">
        reliability
      </h4>
      <ScorePie text="neutral/70" mx-auto mt-6 size-2.75em :score="validator.reliability" />
    </div>
  </div>
</template>
