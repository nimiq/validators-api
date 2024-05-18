<script setup lang="ts">
defineProps<{ validator: Validator }>()
</script>

<template>
  <p text-neutral-800 text-12 font-semibold whitespace-nowrap lh-none tracking-wide>
    {{ validator.address }}
  </p>
</template>
