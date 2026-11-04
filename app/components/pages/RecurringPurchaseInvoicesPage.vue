<script setup lang="ts">
import { formatIDR } from '~/utils/currency'
import {
  MpIcon, MpButton, MpButtonGroup, MpTooltip,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ScenarioFab from '~/components/patterns/ScenarioFab.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { recurringPurchaseInvoices, persistRecurringPurchaseInvoices, type RecurringPurchaseInvoice } from '~/data'

const { t } = useLocale()
const toggleAirene = inject<() => void>('toggleAirene')

const columns: TableColumn[] = [
  { key: 'vendorName',   label: t('Vendor'),        kind: 'name', sortable: true, sortType: 'text' },
  { key: 'frequency',    label: t('Frequency'),      kind: 'status',                sortType: 'text' },
  { key: 'amount',       label: t('Amount'),         kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'nextDate',     label: t('Next invoice'),   kind: 'date',                  sortType: 'date' },
  { key: 'status',       label: t('Status'),         width: 160,                    sortType: 'text' },
  { key: 'createdCount', label: t('Generated'),       kind: 'amount', align: 'right', sortType: 'number' },
]

type Row = RecurringPurchaseInvoice & {
  vendorName: string
}

const previewMode = ref<'data' | 'empty'>('data')

const rows = computed<Row[]>(() =>
  previewMode.value === 'empty'
    ? []
    : recurringPurchaseInvoices.map(r => ({
        ...r,
        vendorName: r.vendor.name,
      }))
)

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState(rows, {
  filterFn: (row: Row, s, status) =>
    (row.vendorName.toLowerCase().includes(s)) &&
    (!status || row.status === status),
})

const statusOptions = [
  { label: t('All status'), value: '' },
  { label: t('Active'),     value: 'active' },
  { label: t('Completed'),  value: 'completed' },
]

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso))
}

const allCols: TableColumn[] = [...columns]
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(allCols.map(c => [c.key, true])))
const columnItems = allCols.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => allCols.filter(c => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }

const emptyIllustration = '/illustrations/empty-folder.png'
function clearFilters() { search.value = ''; statusFilter.value = '' }

// ─── Bulk delete ──────────────────────────────────────────────────────────────
const bulkDeleteOpen = ref(false)
const bulkDeleteIds = ref<string[]>([])
let bulkDeleteDeselect: (() => void) | null = null

function openBulkDelete(sel: Set<number>, deselectAll: () => void) {
  bulkDeleteIds.value = [...sel]
    .map(i => (paginated.value[i] as Row | undefined)?.id)
    .filter(Boolean) as string[]
  bulkDeleteDeselect = deselectAll
  bulkDeleteOpen.value = true
}

function confirmBulkDelete() {
  const ids = new Set(bulkDeleteIds.value)
  const n = ids.size
  for (let i = recurringPurchaseInvoices.length - 1; i >= 0; i--) {
    if (ids.has(recurringPurchaseInvoices[i]!.id)) recurringPurchaseInvoices.splice(i, 1)
  }
  persistRecurringPurchaseInvoices()
  bulkDeleteDeselect?.()
  bulkDeleteDeselect = null
  toast.notify({ variant: 'success', title: `${n} ${n === 1 ? t('recurring purchase invoice') : t('recurring purchase invoices')} ${t('deleted')}` })
}


</script>

<template>
  <ErpTablePage
    :columns="visibleColumns"
    :rows="(paginated as Record<string, unknown>[])"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    has-checkbox
    bulk-label="recurring purchase invoice"
    :search="search"
    :has-active-filter="!!search || !!statusFilter"
    filter-empty-label="recurring purchase invoice"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >

    <!-- ── Bulk actions — Delete sits behind its own confirm (never in a dropdown) ── -->
    <template #bulk-actions="{ selectedRows, deselectAll }">
      <span data-devchange="recurring-bulk-delete" />
      <MpButton
        size="sm"
        variant="secondary"
        is-rounded
        @click="openBulkDelete(selectedRows as Set<number>, deselectAll)"
      >
        {{ t('Delete') }}
      </MpButton>
    </template>

    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <MpButton variant="secondary" left-icon="filter" is-rounded class="filter-all-btn">{{ t('All filters') }}</MpButton>
      </div>

      <div class="filter-right">
        <MpButtonGroup class="filter-btn-group">
          <MpTooltip :label="t('Ask Airene')" placement="bottom">
            <MpButton class="filter-airene-btn" variant="ghost" left-icon="airene-brand" :aria-label="t('Ask Airene')" is-rounded @click="toggleAirene?.()" />
          </MpTooltip>
          <ColumnSettingsMenu id="tt-columns-recurring-pi" :items="columnItems" :visibility="columnVisibility" />
        </MpButtonGroup>

        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input
            v-model="search"
            class="filter-search-input"
            type="text"
            :placeholder="t('Search...')"
          />
          <MpButton v-if="search" variant="secondary" class="search-clear-btn" type="button" left-icon="close" :aria-label="t('Clear search')" @click="search = ''" />
        </div>
      </div>
    </template>

    <!-- ── Cell: Vendor ── -->
    <template #cell-vendorName="{ row, value }">
      <a class="cell-link cell-text" @click.stop="navigateTo(`/purchase-invoices/recurring/${(row as Row).id}`)">{{ value }}</a>
    </template>

    <!-- ── Cell: Frequency ── -->
    <template #cell-frequency="{ value }">
      {{ t(value as string) }}
    </template>

    <!-- ── Cell: Amount ── -->
    <template #cell-amount="{ value }">
      {{ formatIDR(value as number) }}
    </template>

    <!-- ── Cell: Next invoice date ── -->
    <template #cell-nextDate="{ row, value }">
      <template v-if="(row as Row).status !== 'completed'">{{ formatDate(value as string) }}</template>
      <span v-else>—</span>
    </template>

    <!-- ── Cell: Status ── -->
    <template #cell-status="{ value }">
      <ErpStatusBadge :status="value as string" :type="(value as string) === 'completed' ? 'announcement' : undefined" />
    </template>

    <!-- ── Cell: Created count ── -->
    <template #cell-createdCount="{ value }">
      {{ value }}
    </template>

    <!-- ── Actions ── -->
    <template #actions="{ row }">
      <MpPopover :id="`rpi-row-${(row as Row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem>{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem>{{ t('Edit template') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Full empty state ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No recurring purchase invoices yet') }}</p>
        <p class="empty-full-desc">{{ t('Set up a recurring purchase invoice to see it here.') }}</p>
        <MpButton variant="secondary" left-icon="add" is-rounded @click="navigateTo('/purchase-invoices/recurring/new')">{{ t('New recurring purchase invoice') }}</MpButton>
      </div>
    </template>
  </ErpTablePage>

  <!-- ── Bulk delete confirm ── -->
  <ConfirmModal
    v-model:is-open="bulkDeleteOpen"
    :title="`${t('Delete')} ${bulkDeleteIds.length} ${bulkDeleteIds.length === 1 ? t('recurring purchase invoice') : t('recurring purchase invoices')}?`"
    :description="t('Deleted recurring purchase invoices cannot be restored. Purchase invoices already created from them are kept.')"
    :confirm-label="t('Delete')"
    @confirm="confirmBulkDelete"
  />

  <ScenarioFab v-model="previewMode" />
</template>

<style scoped>
.cell-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.empty-full { display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-9) var(--mp-spacing-4); }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { font-size: var(--mp-font-sizes-lg, 1rem); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); margin-bottom: var(--mp-spacing-2); }

/* ── Filter bar ── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-all-btn {
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3);
  font-weight: var(--mp-font-weights-semi-bold);
}
.filter-btn-group { display: flex; align-items: center; }
.filter-btn-group :deep(.mp-pixel-button-group) { gap: var(--mp-spacing-2); }
.filter-airene-btn :deep(svg) { color: var(--mp-airene-default, #6938ef); }

.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2); width: 248px;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  color: var(--mp-text-subtle);
}
.filter-search-input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default); min-width: 0;
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }

</style>
