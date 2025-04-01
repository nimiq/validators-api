<script setup lang="ts">
const { data: status, status: statusRequest } = await useFetch('/api/v1/status', { server: true, lazy: false })
const colorMode = useColorMode()
const toggleDark = () => colorMode.value = colorMode.value === 'light' ? 'dark' : 'light'

const route = useRoute()
const validatorDetail = computed(() => !!route.params.address)
// TOD Add window size stat
// TODO add clock to next epoch

const isHealthy = computed(() => Boolean(status.value?.missingEpochs?.length === 0))

const { gitBranch, nimiqNetwork } = useRuntimeConfig().public

interface EnvItemType { branch: string, network: string, link: string }

const environments: EnvItemType[] = [
  { branch: 'main', network: 'main-albatross', link: 'https://validators-api-mainnet.pages.dev/' },
  { branch: 'main', network: 'test-albatross', link: 'https://validators-api-testnet.pages.dev/' },
  { branch: 'dev', network: 'main-albatross', link: 'https://dev.validators-api-mainnet.pages.dev/' },
  { branch: 'dev', network: 'test-albatross', link: 'https://dev.validators-api-testnet.pages.dev/' },

]
const [DefineEnvItem, EnvItem] = createReusableTemplate<{ item: EnvItemType, component: string }>()

const currentEnvItem = { branch: gitBranch, network: nimiqNetwork, link: environments.find(env => env.branch === gitBranch && env.network === nimiqNetwork)?.link || '' }
</script>

<template>
  <DefineEnvItem v-slot="{ item: { branch, network, link }, component }">
    <component :is="component" :href="component === 'a' ? link : undefined" flex="~ col gap-2" f-px-2xs :title="`Nimiq network: ${network}.\nGit branch: ${branch}.`">
      <div text="current f-xs" flex="~ gap-4 items-center">
        <div i-nimiq:globe scale-80 text-neutral-600 />
        <span nq-label text="9 neutral-800">{{ network }}</span>
      </div>
      <div text="current f-xs" flex="~ gap-4 items-center">
        <div i-tabler:git-branch text-neutral-600 />
        <span nq-label text="9 neutral-800">{{ branch }}</span>
      </div>
    </component>
  </DefineEnvItem>

  <div flex="~ col gap-64" mx-auto size-screen max-h-screen max-w-1200 px-32 py-20>
    <header flex="~ gap-32 row items-center">
      <NuxtLink to="/" flex>
        <div aria-hidden i-nimiq:logos-nimiq-horizontal class="!ml-16 !h-24 !w-90" dark:i-nimiq:logos-nimiq-white-horizontal />
        <span ml-8 text-16 font-light tracking-0.75>Validators</span>
      </NuxtLink>
      <NuxtLink v-if="validatorDetail" to="/" block w-max nq-arrow-back nq-ghost-btn>
        Go back
      </NuxtLink>
      <div ml-auto>
        <div flex="~ items-center gap-8" outline="~ 1.5" :class="statusRequest === 'pending' ? 'outline-neutral/10 text-neutral-800' : isHealthy ? 'outline-green-400 text-green-1100' : 'outline-red-1100 text-red-900'" rounded-6 f-text-2xs font-semibold of-clip>
          <CollapsibleRoot w-full>
            <CollapsibleTrigger bg-transparent w-full relative group rounded="6 reka-open:b-0" transition-border-radius of-clip>
              <EnvItem :item="currentEnvItem" component="div" />
              <div absolute right-0 top-8 text-neutral-600 i-nimiq:chevron-top-down transition-opacity op="80 group-hocus:100" scale-80 />
            </CollapsibleTrigger>

            <CollapsibleContent w="$reka-collapsible-content-width" mt-0>
              <div absolute z-90 shadow bg-neutral-50 outline="~ 1.5 offset--1.5 neutral-300" rounded-6 animate-collapsible w="[calc(100%-30px)]" divide="y-1.5 neutral-200" w-max>
                <EnvItem v-for="item in environments" :key="item.link" :item="item" component="a" f-py-2xs w-max />
              </div>
            </CollapsibleContent>
          </CollapsibleRoot>

          <div flex="~ items-center gap-8" f-px-2xs py-6 :title="`Status for git+${gitBranch}@nimiq+${nimiqNetwork}`" :class="statusRequest === 'pending' ? 'bg-neutral-400' : isHealthy ? 'bg-green-400' : 'bg-red-400'">
            <template v-if="statusRequest === 'pending'">
              <div i-nimiq:spinner />
              Getting health
            </template>
            <template v-else-if="isHealthy">
              <div i-nimiq:duotone-fluctuations f-text-xl />
              API synced
            </template>
            <template v-else>
              <div i-nimiq:alert f-text-xl />
              API out of sync
            </template>
          </div>
        </div>
      </div>
      <NuxtLink to="https://github.com/nimiq/validators-api" i-nimiq:logos-github-mono target="_blank" />
      <button i-nimiq:moon @click="() => toggleDark()" />
    </header>
    <main flex-1>
      <NuxtPage />
    </main>
  </div>
</template>
