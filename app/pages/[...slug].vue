<template>
  <div class="prose">
    <ContentDoc />
  </div>
</template>

<style>
mjx-container {
  margin: 1rem auto;

  opacity: 0.8;
  li:has(&) {
    display: flex;
    gap: 4px;
    justify-content: center;
    align-items: center;

    mjx-container {
      margin: 0;
      position: relative;
      bottom: -2px;
    }
  }
}
</style>
