<script setup lang="ts">
// todo change to use validator prop
const props = defineProps<{ score: number | null }>()

const viewBoxSize = 100
const center = viewBoxSize / 2
const strokeWidth = 10
const radius = center - strokeWidth / 2

function generateArcPath(score: number) {
  if (score >= 0.999) score = 0.99 // TODO Improve this
  const startAngle = -Math.PI / 2 // start at the top of the circle
  const endAngle = startAngle + score * 2 * Math.PI

  const x1 = center + radius * Math.cos(startAngle)
  const y1 = center + radius * Math.sin(startAngle)
  const x2 = center + radius * Math.cos(endAngle)
  const y2 = center + radius * Math.sin(endAngle)

  const largeArcFlag = score > 0.5 ? 1 : 0
  const sweepFlag = 1
  return `M ${x1},${y1} A ${radius},${radius} 0 ${largeArcFlag},${sweepFlag} ${x2},${y2}`
}

const strokeColor = computed(() => {
  if (!props.score || props.score < 0.6) return 'stroke-red'
  if (props.score < 0.85) return 'stroke-gold'
  return 'stroke-green'
})
</script>

<template>
  <div grid="~ cols-1 rows-1 place-content-center *:row-span-full *:col-span-full">
    <template v-if="score !== null">
      <div font-bold size-full grid="~ place-content-center">{{ (score * 100).toFixed(0) }}</div>
      <svg
bg-transparent :viewBox="`0 0 ${viewBoxSize} ${viewBoxSize}`" height="100%" width="100%"
        preserveAspectRatio="xMidYMid slice">
        <circle :r="radius" :cx="center" :cy="center" stroke-neutral-400 fill-none :stroke-width="strokeWidth" />
        <path
:d="generateArcPath(score)" :class="strokeColor" fill-none :stroke-width="strokeWidth"
          stroke-linecap="round" />
      </svg>
    </template>
    <template v-else>
      <div font-bold size-full grid="~ place-content-center">NA</div>
      <svg
bg-transparent :viewBox="`0 0 ${viewBoxSize} ${viewBoxSize}`" height="100%" width="100%"
        preserveAspectRatio="xMidYMid slice">
        <circle :r="radius" :cx="center" :cy="center" stroke-neutral-400 fill-none :stroke-width="strokeWidth" />
      </svg>
    </template>
  </div>
</template>
