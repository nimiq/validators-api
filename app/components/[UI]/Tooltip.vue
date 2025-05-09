<script setup lang="ts">
defineProps<{ dark?: boolean }>()
</script>

<template>
  <PopoverRoot>
    <PopoverTrigger v-bind="$attrs" h-max bg-transparent>
      <slot name="trigger">
        <div text-12 text-neutral-700 i-nimiq:info />
      </slot>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent as-child class="tooltip-animation" :side-offset="8" :collision-padding="8" side="bottom" flex="~ col" max-w-360>
        <div :class="dark ? 'bg-white' : 'bg-gradient-neutral shadow dark'" z-300 rounded-8 p-16 text="f-sm neutral-900/80" whitespace-pre-wrap>
          <slot />
        </div>
        <PopoverArrow as-child>
          <div rotate-180 :class="{ dark }">
            <div aria-hidden mt--1 h-8 w-16 i-nimiq:tooltip-triangle class="tooltip-animation" text="neutral dark:white" />
          </div>
        </PopoverArrow>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style scoped>
.tooltip-animation {
  transform-origin: var(--reka-tooltip-content-transform-origin);
  animation: fadeInSlideUp 150ms cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes fadeInSlideUp {
  from {
    opacity: 0;
    scale: 0.98;
    translate: 0 4px;
  }
  to {
    opacity: 1;
    translate: 0 0;
    scale: 1;
  }
}
</style>
