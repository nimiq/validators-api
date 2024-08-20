<template>
  <div flex="~ col">
    <span text-32 font-semibold lh-none>
      <slot name="value" />
    </span>
    <span nq-label text="11 neutral-800">
      <slot name="description" />
    </span>
  </div>
</template>
