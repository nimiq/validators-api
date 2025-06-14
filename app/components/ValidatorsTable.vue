<script setup lang="ts">
import type { ColumnDef, SortDirection, SortingState } from '@tanstack/vue-table'
import type { FetchedValidator } from '~~/server/utils/types'
import { getCoreRowModel, getFilteredRowModel, getSortedRowModel, useVueTable } from '@tanstack/vue-table'

// @unocss-include

const { validators } = defineProps<{ validators: FetchedValidator[] }>()

// Helper function to convert Luna to NIM for display
function formatLunaAsNim(lunaValue: number): string {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(lunaValue / 1e5)
}

// Filter and search state
const showUnknown = useLocalStorage('show-unknown-validators', false)
const globalFilter = ref('')
const sorting = ref<SortingState>([{ id: 'balance', desc: true }])

// Filter validators based on unknown toggle
const filteredValidators = computed(() =>
  showUnknown.value ? validators : validators.filter(v => v.name !== 'Unknown validator'),
)

function getSortingIcon(sort?: SortDirection | false) {
  if (sort === 'asc')
    return 'i-nimiq:triangle-up scale-70'
  if (sort === 'desc')
    return 'i-nimiq:triangle-down scale-70'
  return 'i-nimiq:chevron-top-down'
}

// Column definitions - simplified without complex cell renderers
const columns: ColumnDef<FetchedValidator>[] = [
  {
    id: 'identicon',
    header: '',
    enableSorting: false,
    enableGlobalFilter: false,
    size: 56,
  },
  {
    accessorKey: 'name',
    id: 'name',
    header: 'Name',
    enableSorting: true,
    filterFn: (row, id, value) => {
      const name = row.getValue(id) as string
      return name ? name.toLowerCase().includes(value.toLowerCase()) : false
    },
  },
  {
    accessorKey: 'address',
    id: 'address',
    header: 'Address',
    enableSorting: true,
    filterFn: (row, id, value) => {
      const address = row.getValue(id) as string
      return address ? address.toLowerCase().includes(value.toLowerCase()) : false
    },
  },
  {
    accessorKey: 'balance',
    id: 'balance',
    header: 'NIM',
    enableSorting: true,
    enableGlobalFilter: false,
    sortingFn: (a, b) => (a.original.balance || 0) - (b.original.balance || 0),
  },
  {
    accessorKey: 'fee',
    id: 'fee',
    header: 'Fee',
    enableSorting: true,
    enableGlobalFilter: false,
    sortingFn: (a, b) => (a.original.fee || 0) - (b.original.fee || 0),
  },
  {
    accessorKey: 'stakers',
    id: 'stakers',
    header: 'Stakers',
    enableSorting: true,
    enableGlobalFilter: false,
  },
  {
    accessorKey: 'score',
    id: 'score',
    header: 'Score',
    enableSorting: true,
    enableGlobalFilter: false,
    sortingFn: (a, b) => (a.original.score?.total || 0) - (b.original.score?.total || 0),
  },
]

// Create the table instance
const table = useVueTable({
  get data() {
    return filteredValidators.value
  },
  columns,
  get state() {
    return {
      sorting: sorting.value,
      globalFilter: globalFilter.value,
    }
  },
  onSortingChange: (updater) => {
    sorting.value = typeof updater === 'function' ? updater(sorting.value) : updater
  },
  onGlobalFilterChange: (updater) => {
    globalFilter.value = typeof updater === 'function' ? updater(globalFilter.value) : updater
  },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  globalFilterFn: (row, columnId, filterValue) => {
    const searchValue = filterValue.toLowerCase()
    return row.original.name.toLowerCase().includes(searchValue)
      || row.original.address.toLowerCase().includes(searchValue)
  },
})

const apiUrl = computed(() => {
  let base = '/api/v1/validators'
  if (showUnknown.value)
    base += '?only-known=false'
  return base
})

// Clear search with proper state management
async function clearSearch() {
  globalFilter.value = ''
  // Wait for next tick to ensure DOM updates are complete
  await nextTick()
}

// Debug function to handle column header clicks
function handleHeaderClick(header: any) {
  if (header.column.getCanSort()) {
    header.column.toggleSorting()
  }
}

// Computed for table rows with error handling - use sorted and filtered rows
const tableRows = computed(() => {
  try {
    // Get the final processed rows (filtered and sorted)
    return table.getRowModel().rows
  }
  catch (error) {
    console.warn('Error getting table rows:', error)
    return []
  }
})

// Computed for filtered rows count with error handling
const filteredRowsCount = computed(() => {
  try {
    return table.getFilteredRowModel().rows.length
  }
  catch (error) {
    console.warn('Error getting filtered rows count:', error)
    return 0
  }
})
</script>

<template>
  <div>
    <!-- Controls section -->
    <div
      shadow bg-neutral-0 f-px-md f-py-sm flex="~ items-center gap-32 wrap" f-mb-lg f-text-xs
      outline="~ 1.5 offset--1.5 neutral-200" rounded-8
    >
      <!-- API and Trust Score links -->
      <div flex="~ items-center gap-32">
        <NuxtLink
          :to="apiUrl" class="flex items-center" target="_blank" nq-arrow
          un-text="f-xs neutral-700 hocus:neutral-800" transition-colors font-semibold
        >
          <div i-nimiq:code mr-8 />
          API
        </NuxtLink>

        <NuxtLink
          to="https://www.nimiq.com/developers/validators/validator-trustscore" external class="flex items-center"
          target="_blank" nq-arrow un-text="f-xs neutral-700 hocus:neutral-800" font-semibold transition-colors
        >
          <div i-nimiq:verified mr-8 />
          Trust Score
        </NuxtLink>
      </div>

      <!-- Search -->
      <div flex="~ items-center gap-8" flex-1 min-w-200>
        <div relative flex-1>
          <input v-model="globalFilter" type="text" placeholder="Search validators..." nq-input-box>
          <button
            v-if="globalFilter"
            class="absolute right-8 top-50% transform -translate-y-50% text-neutral-500 hover:text-neutral-700 transition-colors"
            type="button" @click="clearSearch"
          >
            <div i-nimiq:cross text-12 />
          </button>
          <div
            v-else i-nimiq:magnifying-glass absolute right-8 top="50%" transform="-translate-y-50%" text-neutral-400
            text-12
          />
        </div>
      </div>

      <!-- Show unknown toggle -->
      <label flex="~ items-center gap-8" w-max>
        <span nq-label text="11 neutral-700/70" font-semibold select-none>
          All validators
        </span>
        <input v-model="showUnknown" type="checkbox" nq-switch>
      </label>
    </div>

    <!-- Results count and sorting status -->
    <div v-if="globalFilter || !showUnknown || sorting.length > 0" f-mb-sm text="f-xs neutral-700" flex="~ items-center justify-between gap-16 wrap">
      <span v-if="globalFilter || !showUnknown">
        {{ filteredRowsCount }} of {{ validators.length }} validators
        <span v-if="globalFilter">matching "{{ globalFilter }}"</span>
      </span>
      <span v-if="sorting.length > 0">
        Sorted by: {{ sorting.map(s => `${s.id} (${s.desc ? 'desc' : 'asc'})`).join(', ') }}
      </span>
    </div>

    <!-- Responsive table container -->
    <div class="table-container">
      <table class="validators-table" min-w-full border-collapse>
        <colgroup>
          <col class="col-identicon">
          <col class="col-name">
          <col class="col-address">
          <col class="col-balance">
          <col class="col-fee">
          <col class="col-stakers">
          <col class="col-score">
        </colgroup>

        <thead>
          <tr>
            <th
              v-for="header in table.getFlatHeaders()" :key="header.id"
              class="py-12 px-8 font-semibold text-11 text-neutral-700 border-none whitespace-nowrap rounded-4" :class="[
                header.column.getCanSort() ? 'cursor-pointer select-none hover:text-neutral-800 hover:bg-neutral-50 active:bg-neutral-100' : '',
                header.id === 'identicon' ? 'w-56' : '',
                header.id === 'name' ? 'text-left' : '',
                header.id === 'address' ? 'text-left' : '',
                ['balance', 'fee', 'stakers', 'score'].includes(header.id) ? 'text-right' : '',
              ]"
              @click="handleHeaderClick(header)"
            >
              <div v-if="header.id === 'balance'" flex="~ items-center justify-end gap-6">
                <div class="i-nimiq:logos-nimiq" />
                NIM
                <div
                  v-if="header.column.getCanSort()"
                  :class="getSortingIcon(header.column.getIsSorted())"
                  class="size-14 opacity-70 transition-all duration-200 flex-shrink-0"
                  :style="{
                    opacity: header.column.getIsSorted() ? '1' : '0.5',
                    color: header.column.getIsSorted() ? 'var(--nq-neutral-700)' : 'var(--nq-neutral-500)',
                  }"
                />
              </div>
              <div
                v-else-if="header.column.getCanSort()" flex="~ items-center gap-6"
                :class="header.id === 'name' || header.id === 'address' ? 'justify-start' : 'justify-end'"
              >
                {{ header.isPlaceholder ? null : header.column.columnDef.header }}
                <div
                  :class="getSortingIcon(header.column.getIsSorted())"
                  class="w-14 h-14 opacity-70 transition-all duration-200 flex-shrink-0"
                  :style="{
                    opacity: header.column.getIsSorted() ? '1' : '0.5',
                    color: header.column.getIsSorted() ? 'rgb(var(--nq-blue))' : 'rgb(var(--nq-neutral-500))',
                  }"
                />
              </div>
              <div v-else>
                {{ header.isPlaceholder ? null : header.column.columnDef.header }}
              </div>
            </th>
          </tr>
        </thead>

        <tbody>
          <tr
            v-for="row in tableRows" :key="`validator-${row.original.id}-${globalFilter}`" class="table-row"
            @click="navigateTo(`/validator/${row.original.address}`)"
          >
            <td class="cell-identicon">
              <Identicon
                v-bind="row.original" size-32 object-contain my-6
                :style="{ 'view-transition-name': `logo-${row.original.id}-${globalFilter}` }"
              />
            </td>

            <td class="cell-name">
              <h2
                text-14 op-90 lh-none font-light w-max
                :style="{ 'view-transition-name': `h-${row.original.id}-${globalFilter}` }"
              >
                {{ row.original.name }}
              </h2>
              <div
                v-if="row.original.isMaintainedByNimiq" i-nimiq:verified-filled text="13 green/70"
                title="Maintained by Nimiq"
              />
            </td>

            <td class="cell-address">
              <Copyable
                :content="row.original.address"
                :style="{ 'view-transition-name': `address-${row.original.id}-${globalFilter}` }"
              />
            </td>

            <td class="cell-balance">
              <div flex="~ col justify-center" pr-12>
                <span font-semibold text="neutral-700 f-xs" lh-none>
                  {{ formatLunaAsNim(Math.max(0, row.original.balance)) }}
                </span>
                <span v-if="row.original.dominanceRatio" lh-none text="neutral-700/70 f-2xs" font-semibold>
                  {{ percentageFormatter.format(Math.max(0, row.original.dominanceRatio)) }}
                </span>
              </div>
            </td>

            <td class="cell-fee">
              <span font-semibold text="neutral-700/80 f-xs">
                {{ row.original.fee ? percentageFormatter.format(row.original.fee) : 'N/A' }}
              </span>
            </td>

            <td class="cell-stakers">
              <span font-semibold text="neutral-700 f-xs">
                {{ Math.max(0, row.original.stakers) }}
              </span>
            </td>

            <td class="cell-score">
              <ScorePie
                size-32 text-12 mx-auto :score="row.original.score.total!" :decimals="0"
                :style="{ 'view-transition-name': `score-${row.original.id}-${globalFilter}` }"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Empty state -->
    <div v-if="filteredRowsCount === 0" class="empty-state">
      <div text="center neutral-500" py-32>
        <div i-nimiq:magnifying-glass text-32 mb-16 />
        <p font-semibold mb-8>
          No validators found
        </p>
        <p text-sm>
          <span v-if="globalFilter">Try adjusting your search terms</span>
          <span v-else>Try enabling "All validators" to see more results</span>
        </p>
        <button
          v-if="globalFilter"
          class="mt-16 px-16 py-8 bg-blue-500 text-white rounded-6 hover:bg-blue-600 transition-colors text-sm font-semibold"
          @click="clearSearch"
        >
          Clear search
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.table-container {
  overflow-x: auto;
  margin: 0 -32px;
  padding: 0 32px;
}

.validators-table {
  width: 100%;
  border-collapse: collapse;
}

.col-identicon {
  width: 56px;
}

.col-name {
  width: auto;
  min-width: 150px;
}

.col-address {
  width: auto;
  min-width: 200px;
}

.col-balance {
  width: auto;
  min-width: 120px;
}

.col-fee {
  width: auto;
  min-width: 80px;
}

.col-stakers {
  width: auto;
  min-width: 80px;
}

.col-score {
  width: auto;
  min-width: 80px;
}

.table-row {
  border-top: 1px solid rgb(var(--nq-neutral-200));
  background-color: transparent;
  transition: background-color 0.2s ease;
  cursor: pointer;
  vertical-align: middle;
}

.table-row:nth-child(even) {
  background-color: rgb(var(--nq-neutral-50));
}

.table-row:hover {
  background-color: rgb(var(--nq-neutral-200));
}

.table-row:nth-child(even):hover {
  background-color: rgb(var(--nq-neutral-300));
}

.table-row td {
  padding: 12px 0;
  border: none;
}

.cell-name {
  padding-right: 24px;
}

.cell-balance,
.cell-fee,
.cell-stakers {
  text-align: right;
}

.cell-score {
  text-align: center;
}

/* Responsive design */
@media (max-width: 1024px) {
  .col-address {
    display: none;
  }

  .cell-address {
    display: none;
  }
}

@media (max-width: 768px) {
  .table-container {
    margin: 0 -16px;
    padding: 0 16px;
  }

  .col-fee {
    display: none;
  }

  .cell-fee {
    display: none;

    .col-stakers {
      display: none;
    }

    .cell-stakers {
      display: none;
    }
  }
}

@media (max-width: 480px) {
  .validators-table {
    font-size: 14px;
  }

  .header-cell {
    font-size: 10px;
  }

  .cell-name h2 {
    font-size: 12px;
  }
}
</style>
