<script setup lang="ts">
const colorMode = useColorMode()
const toggleDark = () => colorMode.value = colorMode.value === 'light' ? 'dark' : 'light'
</script>

<template>
  <div>
    <header flex="~ gap-32 col lg:row items-center" mx-auto max-h-screen max-w-700 px-32 py-40>
      <!-- Change the color of the logo for dark mode! -->
      <div i-nimiq:logos-nimiq-vertical text-90 dark:i-nimiq:logos-nimiq-white-vertical />

      <div>
        <h1 text-32 font-bold>
          You did it!
        </h1>

        <p text-18>
          You've successfully created a project with
          <NuxtLink to="https://nuxt.com/">
            Vue 3
          </NuxtLink> +
          <NuxtLink to="https://onmax.github.io/nimiq-developer-center/">
            Nimiq
          </NuxtLink>.
          What's next?
        </p>

        <nav flex="~ gap-32 wrap" mt-12>
          <NuxtLink to="/" arrow>
            Home
          </NuxtLink>
          <NuxtLink to="/about" arrow>
            About
          </NuxtLink>

          <button ml-auto pill-sm pill-blue @click="() => toggleDark()">
            Change theme
          </button>
        </nav>
      </div>
    </header>

    <main mx-auto max-w-700 pb-92 pt-64>
      <slot />
    </main>
  </div>
</template>
