<script setup lang="ts" generic="T extends [number, number]">
import { VisArea, VisAxis, VisCrosshair, VisLine, VisTooltip, VisXYContainer } from '@unovis/vue'
import { render } from 'vue'

const { data: _data } = defineProps<{ data?: T[] }>()
const slots = defineSlots<{ default?: (props: { data: T }) => any }>()

const x = (d: T) => d[0]
const y = (d: T) => d[1]

function tooltip(v: T) {
  const div = document.createElement('div')
  render(h(slots.default!, { data: v }), div)
  return div.innerHTML
}
</script>

<template>
  <VisXYContainer :data>
    <VisArea color="url('assets/vertical-stripes.svg#vertical-stripes')" :x :y />
    <VisLine :x :y color="rgb(var(--nq-green))" />
    <VisTooltip />
    <VisAxis type="x" :grid-line="false" />
    <VisCrosshair data-crosshair color="rgb(var(--nq-blue))" :template="tooltip" />
  </VisXYContainer>
</template>

<style scoped>
[data-vis-xy-container] {
  background:
    repeating-linear-gradient(
      0deg,
      rgb(var(--nq-neutral-300) / 1) 0,
      rgb(var(--nq-neutral-300) / 1) 1.5px,
      transparent 1.5px,
      transparent 64px
    ),
    linear-gradient(0deg, rgb(var(--nq-neutral-0) / 1), rgb(var(--nq-neutral-0) / 1));
  background-size:
    100% 64px,
    100% 100%;
  --vis-crosshair-line-stroke-color: rgb(var(--nq-blue) / 1);
  --vis-crosshair-line-stroke-width: 1.5px;
  --vis-crosshair-circle-stroke-color: rgb(var(--nq-blue) / 1);
  --vis-tooltip-padding: 0;
  --vis-tooltip-background-color: transparent;
  --vis-tooltip-border-color: transparent;
}
</style>
