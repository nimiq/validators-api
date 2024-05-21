import type { ValidatorInfo } from "~/server/api/types"

export const useValidatorsStore = defineStore('validators', () => {
  const validators = ref<ValidatorInfo[]>()

  async function fetchValidators() {
    validators.value = await $fetch('/api/validators')
  }

  return {
    validators,
    fetchValidators
  }
})
