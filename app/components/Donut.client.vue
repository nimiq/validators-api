<script setup lang="ts">
import { VisDonut, VisSingleContainer, VisTooltip } from '@unovis/vue'
import { Donut } from '@unovis/ts'
import { render } from 'vue'
import ScorePies from './ScorePies.vue'

defineProps<{ data: ValidatorScore[] }>()

const isMounted = useMounted()

const value = (d: ValidatorScore) => d.sizeRatio
const label = (d: ValidatorScore) => d.name || d.address

const colors = ['red', 'orange', 'blue', 'green', 'gold']
const color = (d: number, i: number) => `rgb(var(--nq-${colors[i % colors.length]}))`

// @unocss-include
function template(v: ValidatorScore) {
  const div = document.createElement('div')
  render(h(ScorePies, { validator: v, class: 'text-14' }), div)
  const address = `${v.address.slice(0, 10)}  ...  ${v.address.slice(-10)}`
  return `
  <div flex="~ col gap-8" bg-neutral-0 p-16 rounded-6 nq-shadow>
    <h4 text="13 neutral-900" m-0>${v.name}</h4>
    <p text="11 neutral-900" m-0>${address}</p>
    ${div.innerHTML}
  </div>
  `
}
</script>

<template>
  <VisSingleContainer :data :style="{ height: isMounted ? '100%' : 'auto' }" :margin="{ left: 20, right: 20 }">
    <VisTooltip :triggers="{ [Donut.selectors.segment]: (item) => template(item.data) }" style="--vis-tooltip-padding: 0 0" />
    <VisDonut :value :label :arc-width="40" :color />
  </VisSingleContainer>
</template>

<style>
:root {
  --vis-tooltip-padding: 0;
}
</style>
