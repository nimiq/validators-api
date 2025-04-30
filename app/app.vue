<script setup lang="ts">
const { data: status, status: statusRequest, refresh: refreshStatus, error } = await useFetch('/api/v1/status', { server: true, lazy: false })

const debouncedRefresh = useDebounceFn(() => {
  refreshStatus()
  refreshNuxtData(['/api/v1/validators', '/api/v1/distribution', '/api/v1/status'])
}, 300)

// const { execute: syncData, status: statusSync, error: syncError } = useFetch('/api/v1/sync', {
//   lazy: true,
//   immediate: false,
//   onResponse: () => debouncedRefresh(),
//   onResponseError: error => console.error('Sync failed:', error),
// })

const { status: statusSync, data: dataSync, error: syncError, close: closeSync, open: syncData } = useEventSource('/api/v1/sync', [], { immediate: false })
watch(() => [dataSync, syncError], debouncedRefresh)

const colorMode = useColorMode()
const toggleDark = () => colorMode.value = colorMode.value === 'light' ? 'dark' : 'light'

const route = useRoute()
const validatorDetail = computed(() => !!route.params.address)
const isActivitySync = computed(() => Boolean(status.value?.missingEpochs?.length === 0))
const isScoreSync = computed(() => status.value?.missingScore === false)
const isSynced = computed(() => isActivitySync.value && isScoreSync.value)

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
        <div flex="~ items-center gap-8" outline="~ 1.5" :class="statusRequest === 'pending' ? 'outline-neutral/10 text-neutral-800' : isSynced ? 'outline-green-500 text-green-1100' : 'outline-red-500 text-red-1100'" rounded-6 f-text-2xs font-semibold of-clip>
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

          <div flex="~ items-center gap-8" f-px-2xs py-6 whitespace-nowrap :title="`Status for git+${gitBranch}@nimiq+${nimiqNetwork}`" :class="statusRequest === 'pending' ? 'bg-neutral-400' : isSynced ? 'bg-green-400' : 'bg-red-400'">
            <template v-if="statusRequest === 'pending'">
              <div i-nimiq:spinner />
              Getting health
            </template>
            <template v-else-if="isSynced">
              <div i-nimiq:duotone-fluctuations f-text-xl />
              API synced
            </template>
            <template v-else>
              <div i-nimiq:alert op-70 f-text-xs />
              Error
            </template>
          </div>
        </div>
      </div>
      <NuxtLink to="https://github.com/nimiq/validators-api" i-nimiq:logos-github-mono target="_blank" />
      <button i-nimiq:moon @click="() => toggleDark()" />
    </header>
    <main flex-1>
      <div v-if="(!isSynced || error || syncError) && $route.path === '/'" bg="red/8" outline="1.5 ~ red-600" rounded-12 f-p-md text="14 red-1100" nq-prose-compact children:max-w-none f-mb-lg>
        <h1 flex="~ items-center gap-12" text-red-1100 f-text-lg>
          <div i-nimiq:alert op-70 text-0.9em m-0 />
          <template v-if="!isActivitySync">
            Activity out of sync
          </template>
          <template v-else-if="!isScoreSync">
            Score not computed
          </template>
        </h1>
        <p f-mt-2xs>
          The database is not fully synchronized with the blockchain. The API may not return the most recent data.
        </p>

        <pre v-if="syncError || error" bg="red/6" text="f-2xs red-1100" outline="red/30" w-inherit>{{ JSON.stringify(syncError || error, null, 2) }}</pre>

        <template v-if="status">
          <h2 f-mt-md text-red-1100 f-text-md flex="~ items-center gap-12">
            <div i-nimiq:duotone-fluctuations text-1em m-0 />
            Status
            <button
              bg-transparent rounded-full outline="1.5 ~ red-600" mx-0 text="red-1100" p-4
              title="Refresh status"
              :disabled="statusRequest === 'pending'"
              @click="() => refreshStatus()"
            >
              <div :class="statusRequest === 'pending' ? 'i-nimiq:spinner' : 'i-nimiq:restore'" text-12 />
            </button>
          </h2>
          <details v-for="key in Object.keys(status)" :key="key" f-mt-sm max-w-full>
            <summary nq-label mx-0 text-red-1100>
              {{ key.replaceAll(/([a-z])([A-Z])/g, '$1 $2').replaceAll(/([A-Z])([A-Z][a-z])/g, '$1 $2') }}
            </summary>
            <pre v-if="key in status" f-p-2xs bg="red/6" text="f-2xs red-1100" w-inherit outline="red/30" whitespace-normal>{{ (status as Record<string, any>)[key] }}</pre>
          </details>
        </template>

        <hr f-my-sm border-red-600>

        <div flex="~ items-baseline gap-8" mx-0 f-mt-md>
          <button
            mx-0 nq-pill nq-pill-red outline="~ 1.5 offset--1.5 red-1100/40"
            :disabled="statusSync === 'OPEN'"
            @click="() => syncData()"
          >
            <div :class="statusSync === 'OPEN' ? 'i-nimiq:spinner' : 'i-nimiq:restore'" mr-6 />
            <span>
              {{ statusSync === 'OPEN' ? 'Syncing...' : 'Sync now' }}
            </span>
          </button>

          <button v-if="statusSync === 'OPEN'" mx-0 nq-pill-tertiary @click="() => closeSync()">
            <div i-nimiq:cross mr-6 scale-70 />
            Cancel
          </button>

          <div flex-1 flex="~ items-center justify-end">
            <code w-max mr-0>SSE: {{ statusSync }}</code>
          </div>
        </div>

        <pre v-if="dataSync" bg="red/6" lh-none text="f-2xs red-1100" outline="red/30" w-inherit max-h-80vh of-auto>{{ dataSync }}</pre>
      </div>

      <NuxtPage />
    </main>
  </div>
</template>
