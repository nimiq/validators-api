<script setup lang="ts">
import type { EnvItemType } from './utils/environments'
import { environments, getEnvironmentItem } from './utils/environments'
import { mergeScoreVersionQuery, resolveDashboardScoreVersion } from './utils/score-version'

const route = useRoute()
const { scoreVersionRequestQuery, setScoreVersion } = useScoreVersionQuery()
const { data: status, status: statusRequest, refresh: refreshStatus, error } = await useFetch('/api/v1/status', {
  server: true,
  lazy: false,
  query: scoreVersionRequestQuery,
})
const selectedScoreVersion = computed(() =>
  resolveDashboardScoreVersion(
    route.query['score-version'],
    status.value?.selectedScoreVersion,
  ),
)
const scoreVersionLinkQuery = computed(() =>
  mergeScoreVersionQuery({}, selectedScoreVersion.value),
)

const colorMode = useColorMode()
const toggleDark = () => colorMode.value = colorMode.value === 'light' ? 'dark' : 'light'

const validatorDetail = computed(() => !!route.params.address)

type HealthKind = 'current' | 'synchronizing' | 'failed' | 'stale' | 'no_score' | 'live_unavailable'

const health = computed<{ kind: HealthKind, label: string }>(() => {
  if (statusRequest.value === 'pending')
    return { kind: 'synchronizing', label: 'Synchronizing' }
  if (error.value || status.value?.failedEpochs.length)
    return { kind: 'failed', label: 'Failed' }
  if (status.value?.syncingEpochs.length)
    return { kind: 'synchronizing', label: 'Synchronizing' }
  if (!status.value?.range)
    return { kind: 'live_unavailable', label: 'Live unavailable' }
  if (status.value.scoreStatus === 'no_score')
    return { kind: 'no_score', label: 'No score' }
  if (
    status.value.recentCoverage !== 1
    || status.value.longTermCoverage !== 1
    || status.value.scoreStatus === 'stale'
  ) {
    return { kind: 'stale', label: 'Stale' }
  }
  return { kind: 'current', label: 'Current' }
})

const healthClasses = computed(() => {
  if (health.value.kind === 'current') {
    return {
      container: 'outline-green-500 text-green-1100',
      badge: 'bg-green-400',
    }
  }
  if (health.value.kind === 'synchronizing' || health.value.kind === 'live_unavailable') {
    return {
      container: 'outline-neutral-400 text-neutral-800',
      badge: 'bg-neutral-400',
    }
  }
  return {
    container: 'outline-red-500 text-red-1100',
    badge: 'bg-red-400',
  }
})

const healthDetails = computed(() => {
  const details: string[] = []
  if (error.value)
    details.push('Status request failed.')
  if (!status.value)
    return details
  if (!status.value.range)
    details.push('Live blockchain range is unavailable. Stored synchronization state is shown.')
  if (status.value.failedEpochs.length)
    details.push(`Failed activity epochs: ${status.value.failedEpochs.map(epoch => epoch.epochNumber).join(', ')}.`)
  if (status.value.syncingEpochs.length)
    details.push(`Synchronizing activity epochs: ${status.value.syncingEpochs.map(epoch => epoch.epochNumber).join(', ')}.`)
  details.push(`Recent activity coverage: ${status.value.recentCoverage === null ? 'unavailable' : percentageFormatter.format(status.value.recentCoverage)}.`)
  details.push(`Long-term activity coverage: ${status.value.longTermCoverage === null ? 'unavailable' : percentageFormatter.format(status.value.longTermCoverage)}.`)
  details.push(`Score v${status.value.selectedScoreVersion}: ${status.value.scoreStatus.replace('_', ' ')}.`)
  return details
})

const showHealthWarning = computed(() =>
  statusRequest.value !== 'pending' && (health.value.kind !== 'current' || Boolean(error.value)),
)

const { nimiqNetwork } = useSafeRuntimeConfig().public
const [DefineEnvItem, EnvItem] = createReusableTemplate<{ item: EnvItemType, component: string }>()

const currentEnvItem = getEnvironmentItem(nimiqNetwork) ?? { network: nimiqNetwork, link: '' }
</script>

<template>
  <DefineEnvItem v-slot="{ item: { network, link }, component }">
    <component :is="component" :href="component === 'a' ? link : undefined" flex="~ col gap-2" f-px-2xs :title="`Nimiq network: ${network}.`">
      <div text="current f-xs" flex="~ gap-4 items-center">
        <div i-nimiq:globe scale-80 text-neutral-600 />
        <span nq-label text="9 neutral-800">{{ network }}</span>
      </div>
    </component>
  </DefineEnvItem>

  <div flex="~ col gap-64" mx-auto size-screen max-h-screen max-w-1200 px-32 py-20>
    <header flex="~ gap-32 row items-center" class="max-sm:flex-wrap max-sm:gap-12">
      <NuxtLink
        :to="{
          path: '/',
          query: scoreVersionLinkQuery,
        }"
        flex
      >
        <div aria-hidden class="i-nimiq:logos-nimiq-horizontal dark:i-nimiq:logos-nimiq-white-horizontal !ml-16 !h-24 !w-90" />
        <span ml-8 text-16 font-light tracking-0.75>Validators</span>
      </NuxtLink>
      <NuxtLink
        v-if="validatorDetail"
        :to="{
          path: '/',
          query: scoreVersionLinkQuery,
        }"
        block w-max nq-arrow-back nq-ghost-btn
      >
        Go back
      </NuxtLink>
      <div ml-auto flex="~ items-center gap-12" class="max-sm:order-2 max-sm:ml-0 max-sm:w-full max-sm:justify-between">
        <ScoreVersionSelect
          :model-value="selectedScoreVersion"
          :disabled="statusRequest === 'pending'"
          @update:model-value="setScoreVersion"
        />
        <div flex="~ items-center gap-8" outline="~ 1.5" :class="healthClasses.container" rounded-6 f-text-2xs font-semibold of-clip>
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

          <div flex="~ items-center gap-8" f-px-2xs py-6 whitespace-nowrap :title="`Status for nimiq+${nimiqNetwork}`" :class="healthClasses.badge">
            <template v-if="health.kind === 'synchronizing'">
              <div class="i-nimiq:spinner" />
              {{ health.label }}
            </template>
            <template v-else-if="health.kind === 'current'">
              <div i-nimiq:duotone-fluctuations f-text-xl />
              {{ health.label }}
            </template>
            <template v-else>
              <div i-nimiq:alert op-70 f-text-xs />
              {{ health.label }}
            </template>
          </div>
        </div>
      </div>
      <NuxtLink to="https://github.com/nimiq/validators-api" i-nimiq:logos-github-mono target="_blank" />
      <button class="i-nimiq:moon" @click="() => toggleDark()" />
    </header>
    <main flex-1>
      <div v-if="showHealthWarning && $route.path === '/'" bg="red/8" outline="1.5 ~ red-600" rounded-12 f-p-md text="14 red-1100" nq-prose-compact children:max-w-none f-mb-lg>
        <h1 flex="~ items-center gap-12" text-red-1100 f-text-lg>
          <div i-nimiq:alert op-70 text-0.9em m-0 />
          {{ health.label }}
        </h1>
        <p f-mt-2xs>
          API data is not fully current. Stored data remains available where possible.
        </p>
        <ul v-if="healthDetails.length" f-mt-xs>
          <li v-for="detail in healthDetails" :key="detail">
            {{ detail }}
          </li>
        </ul>

        <pre v-if="error" bg="red/6" text="f-2xs red-1100" outline="red/30" w-inherit>{{ JSON.stringify(error, null, 2) }}</pre>

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

        <p f-mt-md text="f-sm red-1100/80">
          <strong>Note:</strong> Data synchronization is handled automatically by scheduled tasks that run every hour. A score lag of up to 1 epoch can be expected between sync cycles.
        </p>
      </div>

      <NuxtPage />
    </main>
  </div>
</template>
