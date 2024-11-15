<script setup lang="ts">
// import type { Donut } from '@unovis/ts'
import { VisDonut, VisSingleContainer } from '@unovis/vue'

const data: Item[] = [
  { label: '42% staked', value: 42, color: 'rgb(var(--nq-green) / 1)', x: 0, y: 0 },
  { label: 'Total staked', value: 58, color: 'rgb(var(--nq-gold) / 1)', x: 0, y: 0 },
]

interface Item { label: string, value: number, color: string, x: number, y: number }

const value = (d: Item) => d.value
const color = (d: Item) => d.color
const label = (d: Item) => d.label

const donut = ref()
onMounted(async () => {
  if (import.meta.server)
    return
  await nextTick()
  // console.log(toValue(donut.value))
  // createArc()
  // const gElement = toValue(toValue(toValue(donut.value.component).arcGroup)._groups[0][0]) as SVGGElement
  // const segments = gElement.querySelectorAll(`path`) as NodeListOf<SVGPathElement>
  // select all paths that are children of a g element with exactly 4 direct path children
  // const a = document.querySelectorAll(`[data-donut] svg > g > g > path:nth-child(${data.length})`)
  // const a = document.querySelectorAll(`[data-donut] svg g g path`)
  // console.log(donut.value.component.arcGroup)
  // await nextTick()
  // setTimeout(() => {
  //   const segments = document.querySelectorAll(`.${VisDonutSelectors.segment}`) as NodeListOf<SVGPathElement>
  //   console.log({ segments, a: `.${VisDonutSelectors.segment}` })
  //   for (const [i, segment] of Object.entries(segments)) {
  //     const { x, y } = segment.getBoundingClientRect()
  //     data[Number(i)]!.x = x
  //     data[Number(i)]!.y = y
  //   }
  // }, 200)
})

const startAngle = 0.22
const angleRange: [number, number] = [startAngle, 2 * Math.PI + startAngle]

// const donut2 = new Donut({
//   value,
//   color,
//   // label,
//   angleRange,
//   cornerRadius: 8,
//   arcWidth: 64,
//   padAngle: 0.05,
//   showBackground: false,

// })
// donut2.setData(data)
// donut2._render()

// useMutationObserver(donut, async (value) => {
//   console.log(value)
//   await nextTick()
//   const gElement = toValue(toValue(toValue(donut.value.component).arcGroup)) as SVGGElement
//   console.log(gElement)
//   console.log(`.${VisDonutSelectors.segment}`)
//   const segments = gElement.querySelectorAll(`path`) as NodeListOf<SVGPathElement>
//   console.log(segments)
// }, { childList: true, subtree: true, characterData: true })
</script>

<template>
  <VisSingleContainer mx-auto :height="280" :width="280" relative data-donut>
    <VisDonut ref="donut" :duration="0" :data :angle-range :color :value :label :corner-radius="8" :arc-width="64" :pad-angle="0.05" :show-background="false" />
    <!-- <div data-vis-component /> -->
    <div absolute inset-0>
      <div v-for="(d, i) in data" :key="i" :style="{ 'left': `${d.x}px`, 'top': `${d.y}px`, '--c': `${d.color}` }" text-neutral bg-neutral-0 ring="1.5 $c" font-semibold px-12 py-6 w-max over rounded-full m-3 relative>
        <p>{{ d.label }}</p>
      </div>
      {{ donut?.value?.component }}
    </div>
  </VisSingleContainer>
</template>
