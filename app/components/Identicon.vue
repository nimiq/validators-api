<script setup lang="ts">
import { createIdenticon } from 'identicons-esm'

const { validator } = defineProps<{ validator: FetchedValidator }>()
const logo = computed(() => validator.logo || createIdenticon(validator.address, { format: 'image/svg+xml' }))
</script>

<template>
  <NuxtImg :src="logo" object-contain :alt="validator.name" />
</template>
