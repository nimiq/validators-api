<script setup lang="ts" generic="T extends DonutDatum">
import { Donut } from '@unovis/ts'
import { VisDonut, VisSingleContainer, VisTooltip } from '@unovis/vue'
import { render } from 'vue'

const { startAngle: _startAngle = 15, data, size = 280 } = defineProps<{ data?: T[], startAngle?: number, size?: number }>()
const slots = defineSlots<{ default?: (props: T) => any }>()
const arcWidth = computed(() => 0.25 * size)
const angleToRadians = (angle: number) => angle * Math.PI / 180
const startAngle = angleToRadians(_startAngle)
const angleRange: [number, number] = [startAngle, 360 - startAngle]

const value = (d: DonutDatum) => d.value
const color = (d: DonutDatum) => d.color

function template(v: { data: T }) {
  const div = document.createElement('div')
  render(h(slots.default!, v.data), div)
  return div.innerHTML
}
</script>

<script lang="ts">
export interface DonutDatum { color: string, value: number }
</script>

<template>
  <div flex="~ col items-center">
    <VisSingleContainer :data :height="size" :width="size" relative :style="{ height: `${size}px` }" aspect-square>
      <VisDonut :color :value :angle-range v-bind="$attrs" :corner-radius="8" :arc-width :pad-angle="0.045" :show-background="false" />
      <VisTooltip v-if="slots.default" :triggers="{ [Donut.selectors.segment]: template }" />
    </VisSingleContainer>
  </div>
</template>

<style scoped>
[data-vis-single-container] {
  --vis-tooltip-padding: 0;
  --vis-tooltip-background-color: transparent;
  --vis-dark-tooltip-background-color: transparent;
  --vis-tooltip-border-color: transparent;
  --vis-dark-tooltip-border-color: transparent;
  --vis-tooltip-shadow-color: none;
  --vis-tooltip-backdrop-filter: none;
  --vis-dark-tooltip-shadow-color: none;

  --vis-donut-central-label-font-size: 12px;
  --vis-donut-central-label-font-weight: var(--nq-font-sans);
  --vis-donut-central-label-text-color: rgb(var(--nq-neutral-800));
  --vis-donut-central-label-font-weight: 600;

  div:has(> [data-tooltip-container]) {
    --uno: 'shadow';
  }
}
</style>
