export const useApiStore = defineStore('api-store', () => {
  const { data: health, error: errorHealth, status: statusHealth, execute: fetchHealth } = useFetch('/api/v1/scores/health', { lazy: true })
  const { data, error: errorValidators, status: statusValidators, execute: fetchValidators } = useFetch('/api/v1/scores', { lazy: true })

  const range = computed(() => {
    if (!data.value || !('range' in data.value))
      return
    return data.value.range
  })

  const validators = computed(() => {
    if (!data.value || !('validators' in data.value))
      return []
    return data.value.validators
  })

  function fetch() {
    callOnce(fetchHealth)
    callOnce(fetchValidators)
  }

  function getValidatorByAddress(address: string) {
    if (!data.value || !('validators' in data.value))
      return
    return data.value.validators.find(validator => validator.address === address)
  }

  return {
    fetch,

    health,
    errorHealth,
    statusHealth,

    errorValidators,
    statusValidators,
    getValidatorByAddress,

    range,
    validators,
  }
})
