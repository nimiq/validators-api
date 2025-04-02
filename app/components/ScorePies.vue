<script setup lang="ts">
import type { FetchedValidator } from '~~/server/utils/types'

defineProps<{ validator: FetchedValidator }>()
</script>

<template>
  <div flex="~ items-center gap-2em">
    <div>
      <h4 nq-label text="0.5em center">
        dominance
      </h4>
      <ScorePie text="neutral/70" mx-auto mt-6 size-2.75em :score="validator.score.dominance || 0" />
    </div>
    <div>
      <h4 nq-label text="0.5em center">
        availability
      </h4>
      <ScorePie text="neutral/70" mx-auto mt-6 size-2.75em :score="validator.score.availability || 0" />
    </div>
    <div>
      <h4 nq-label text="0.5em center">
        reliability
      </h4>
      <ScorePie text="neutral/70" mx-auto mt-6 size-2.75em :score="validator.score.reliability || 0" />
    </div>
  </div>
</template>
