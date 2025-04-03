<script setup lang="ts" generic="T extends { logo: string | null, address: string, name: string }">
import { createIdenticon } from 'identicons-esm'

const { validator } = defineProps<{ validator: T }>()
const logo = computed(() => validator.logo || createIdenticon(validator.address, { format: 'image/svg+xml' }))
</script>

<template>
  <NuxtImg :src="logo" object-contain :alt="validator.name" />
</template>
