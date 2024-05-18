export const useValidatorsStore = defineStore('validators', () => {
  const validators = ref<Validator[]>()

  async function fetchValidators() {
    const body = { query: 'SELECT * FROM validators', params: [] }
    const { data, error } = await useFetch<{ results: Validator[] }>('/api/_hub/database/all', { body, method: 'POST' })
    if (error || !data.value)
      console.error(error)
    validators.value = data.value?.results || []
    return data
  }

  return {
    validators,
    fetchValidators
  }
})
