<script setup lang="ts">
import type { ScoreVersion } from '~/utils/score-version'

defineProps<{ disabled?: boolean }>()

const model = defineModel<ScoreVersion>({ required: true })
</script>

<template>
  <label flex="~ items-center gap-6" text="11 neutral-700" font-semibold>
    <span nq-label text="9 neutral-700">Score</span>
    <span relative>
      <select
        v-model.number="model"
        aria-label="Score version"
        :disabled
        appearance-none bg-neutral-0 outline="~ 1.5 neutral-300 hocus:blue"
        rounded-6 py-6 pl-10 pr-26 text="11 neutral-800" font-semibold
        cursor-pointer disabled:cursor-wait disabled:op-60
      >
        <option :value="1">
          v1
        </option>
        <option :value="2">
          v2
        </option>
      </select>
      <span
        aria-hidden
        pointer-events-none absolute right-7 top="50%" translate-y="-50%"
        i-nimiq:chevron-top-down text="10 neutral-600"
      />
    </span>
  </label>
</template>
