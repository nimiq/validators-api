<script setup lang="ts">
import type { FetchedValidator } from '~~/server/utils/types'
import type { DonutDatum } from './Donut.client.vue'

const { validators } = defineProps<{ validators: FetchedValidator[] }>()

const data = computed(() => {
  if (!validators)
    return []
  const validatorsList: (DonutDatum & FetchedValidator)[] = []
  const smallValidators = { color: 'rgb(var(--nq-neutral-400))', value: 0, name: 'Others', logo: '', balance: 0 }
  for (const { dominanceRatio, accentColor, ...v } of validators) {
    const ratio = dominanceRatio ?? 0
    if (ratio < 0.02) {
      smallValidators.value += ratio
      smallValidators.balance += v.balance
    }
    else {
      validatorsList.push({ color: accentColor, value: ratio, dominanceRatio: ratio, accentColor, ...v })
    }
  }
  return smallValidators.value > 0 ? [...validatorsList, smallValidators] : validatorsList
})
</script>

<template>
  <div flex="~ col items-center">
    <Donut :data="data!" :size="140">
      <template #default="{ color, value, name, logo, balance }">
        <div :key="name" :style="{ '--c': color }" ring="1.5 $c" data-tooltip-container w-max rounded-8 bg-neutral-0 p-16 text-neutral font-semibold flex="~ items-center gap-16" shadow>
          <img v-if="logo" :src="logo" size-40 loading="lazy">
          <div flex="~ gap-2 col" font-semibold lh-none f-text-sm>
            <h3 f-text-lg>
              {{ name }}
            </h3>
            <div flex="~ justify-between items-baseline gap-12" mt-4>
              <span text-neutral-800 lh-none>
                {{ percentageFormatter.format(value) }}
              </span>
              <p text="green f-xs" font-bold lh-none>
                {{ nimFormatter.format(balance / 1e5) }} NIM
              </p>
            </div>
          </div>
        </div>
      </template>
    </Donut>
  </div>
</template>
