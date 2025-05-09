<script setup lang="ts">
import type { SortDirection, SortingState } from '@tanstack/vue-table'
import type { FetchedValidator } from '~~/server/utils/types'
import { getCoreRowModel, getSortedRowModel, useVueTable } from '@tanstack/vue-table'

// @unocss-include

const { validators } = defineProps<{ validators: FetchedValidator[] }>()

// toggle state
const showUnknown = useLocalStorage('show-unknown-validators', false)
const filteredValidators = computed(() => showUnknown.value ? validators : validators.filter(v => v.name !== 'Unknown validator'))

// sorting state
const sorting = ref<SortingState>([])

function getSortingIcon(sort?: SortDirection | false) {
  if (sort === 'asc')
    return 'i-nimiq:triangle-up'
  if (sort === 'desc')
    return 'i-nimiq:triangle-down'
  return ''
}

// create the table instance
const table = useVueTable({
  data: filteredValidators,
  columns: [
    { accessorKey: 'name', id: 'name' },
    { accessorKey: 'address', id: 'address' },
    { accessorKey: 'balance', id: 'balance', enableSorting: true },
    { accessorKey: 'dominanceRatio', id: 'dominance', enableSorting: true },
    { accessorKey: 'fee', id: 'fee', enableSorting: true },
    { accessorKey: 'stakers', id: 'stakers', enableSorting: true },
    { accessorKey: 'score', id: 'score', enableSorting: true },
  ],
  state: { sorting: sorting.value },
  onSortingChange: (updater) => {
    sorting.value = typeof updater === 'function' ? updater(sorting.value) : updater
  },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
})

const apiUrl = computed(() => {
  let base = '/api/v1/validators'
  if (showUnknown.value)
    base += '?only-known=false'
  return base
})
</script>

<template>
  <div of-x-auto mx--32 px-32>
    <!-- filter toggle -->
    <div shadow bg-neutral-0 f-px-md f-py-sm flex="~ items-center gap-32" f-mb-lg f-text-xs outline="~ 1.5 offset--1.5 neutral-200" rounded-8>
      <NuxtLink :to="apiUrl" flex="~ items-center" target="_blank" nq-arrow un-text="f-xs neutral-700  hocus:neutral-800" transition-colors font-semibold>
        <div i-nimiq:code mr-8 />
        API
      </NuxtLink>

      <NuxtLink to="https://www.nimiq.com/developers/validators/validator-trustscore" external flex="~ items-center" target="_blank" nq-arrow un-text="f-xs neutral-700 hocus:neutral-800" font-semibold transition-colors>
        <div i-nimiq:verified mr-8 />
        Trust Score
      </NuxtLink>

      <label flex="~ items-center gap-8" w-max ml-auto>
        <span nq-label text="11 neutral-700/70" font-semibold select-none>
          All validators
        </span>
        <input v-model="showUnknown" type="checkbox" nq-switch>
      </label>
    </div>

    <table min-w-full border-collapse>
      <colgroup>
        <col w-56>
        <col w-max>
        <col w-auto>
        <col w-max>
        <col w-max>
        <col w-max>
        <col w-max>
      </colgroup>

      <thead>
        <tr>
          <th />

          <!-- Name (no sort) -->
          <th nq-label text="11 neutral-700 left" py-2>
            Name
          </th>

          <!-- Address (no sort) -->
          <th nq-label font-bold text="11 neutral-700 left" py-2>
            Address
          </th>

          <!-- Balance / NIM -->
          <th nq-label text="11 neutral-700" py-2 flex="~ items-center justify-end gap-6" cursor-pointer @click="table.getColumn('balance')?.toggleSorting()">
            <div class="i-nimiq:logos-nimiq" />
            NIM
            <div :class="getSortingIcon(table.getColumn('balance')?.getIsSorted())" />
          </th>

          <!-- Fee -->
          <th nq-label text="11 neutral-700 right" py-2 cursor-pointer @click="table.getColumn('fee')?.toggleSorting()">
            Fee
            <div :class="getSortingIcon(table.getColumn('fee')?.getIsSorted())" />
          </th>

          <!-- Stakers -->
          <th nq-label text="11 neutral-700 right" py-2 cursor-pointer @click="table.getColumn('stakers')?.toggleSorting()">
            Stakers
            <div :class="getSortingIcon(table.getColumn('stakers')?.getIsSorted())" />
          </th>

          <!-- Score -->
          <th nq-label text="11 neutral-700 center" py-2 cursor-pointer @click="table.getColumn('score')?.toggleSorting()">
            Score
            <div :class="getSortingIcon(table.getColumn('score')?.getIsSorted())" />
          </th>
        </tr>
      </thead>

      <tbody>
        <tr
          v-for="row in table.getRowModel().rows" :key="row.id"
          border="t neutral-200" bg="even:neutral-50 hocus:neutral-200 hocus:even:neutral-300" transition-colors cursor-pointer align-middle
          @click="navigateTo(`/validator/${row.original.address}`)"
        >
          <td>
            <Identicon v-bind="row.original" size-32 object-contain my-6 :style="{ 'view-transition-name': `logo-${row.original.id}` }" />
          </td>

          <!-- Name + Verified -->
          <td class="mr-24">
            <h2 text-14 op-90 lh-none font-light w-max :style="{ 'view-transition-name': `h-${row.original.id}` }">
              {{ row.original.name }}
            </h2>
            <div v-if="row.original.isMaintainedByNimiq" i-nimiq:verified-filled text="13 green/70" title="Maintained by Nimiq" />
          </td>

          <td>
            <Copyable :content="row.original.address" :style="{ 'view-transition-name': `address-${row.original.id}` }" />
          </td>

          <!-- Balance -->
          <td text-right>
            <div flex="~ col justify-center" pr-12>
              <span font-semibold text="neutral-700 f-xs " lh-none>
                {{ nimFormatter.format(Math.max(0, row.original.balance / 1e5)) }}
              </span>
              <span v-if="row.original.dominanceRatio" lh-none text="neutral-700/70 f-2xs" font-semibold>
                {{ percentageFormatter.format(Math.max(0, row.original.dominanceRatio)) }}
              </span>
            </div>
          </td>

          <!-- Fee -->
          <td text-right>
            <span font-semibold text="neutral-700/80 f-xs">
              {{ row.original.fee ? percentageFormatter.format(row.original.fee) : 'N/A' }}
            </span>
          </td>

          <!-- Stakers -->
          <td text-right>
            <span font-semibold text="neutral-700 f-xs">
              {{ Math.max(0, row.original.stakers) }}
            </span>
          </td>

          <!-- ScorePie -->
          <td class="text-center">
            <ScorePie size-32 text-12 mx-auto :score="row.original.score.total!" :decimals="0" :style="{ 'view-transition-name': `score-${row.original.id}` }" />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
