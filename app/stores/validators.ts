import type { Validator } from "~~/server/api/validators/index.get"

export const useValidatorsStore = defineStore('validators', () => {
  const { data: validators, execute: fetchValidators } = useFetch('/api/validators', { lazy: true, default: () => [] as Validator[] })

  return {
    validators,
    fetchValidators,

    averageScore: computed(() => {
      const scores = validators.value?.map(validator => validator.total).filter(t => !!t) as number[]
      const totalScore = scores?.reduce((acc, score) => acc + score, 0) || 0
      return totalScore / validators.value?.length
    })
  }
})
