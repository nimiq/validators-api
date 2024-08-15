<script setup lang="ts">
const store = useValidatorsStore()
</script>

<template>
  <ValidatorsTable :validators="store.validators || []" />
</template>
