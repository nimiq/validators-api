<script setup lang="ts">
const { timestamp } = defineProps<{ timestamp: number }>()
const title = computed(() => new Date(timestamp).toLocaleString(locale.value, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
}))
</script>

<template>
  <NuxtTime
    text="f-2xs neutral-700" px-4 lh-none whitespace-nowrap
    :title
    :datetime="timestamp"
    date-style="short"
    time-style="short"
    time-zone="UTC"
    :relative="true"
    :locale
  />
</template>
