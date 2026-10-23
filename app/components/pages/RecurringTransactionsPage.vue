<script setup lang="ts">
/**
 * Recurring transactions (Other lists) — the cross-module index of every
 * recurring template in the account.
 *
 * Reads the five module-owned stores plus the six cash/journal templates that
 * have no module of their own (see data/recurringTransactions.ts). A row links
 * to its module's recurring detail page where one exists.
 */
import type { Ref } from 'vue'
import { formatIDR } from '~/utils/currency'
import {
  MpIcon, MpButton, MpButtonGroup, MpTooltip,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpAutocomplete, MpFormControl, MpFormLabel, MpFormErrorMessage,
  css, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ScenarioFab from '~/components/patterns/ScenarioFab.vue'
import {
  allRecurringTransactions, deleteRecurringTransaction, RECURRING_TXN_TYPES,
  type RecurringTxnRow, type RecurringTxnType,
} from '~/data'

const { t } = useLocale()
const router = useRouter()
const toggleAirene = inject<() => void>('toggleAirene')

const columns: TableColumn[] = [
  { key: 'name',         label: t('Name'),             kind: 'name',   sortable: true, sortType: 'text' },
  { key: 'type',         label: t('Transaction type'), kind: 'status',                 sortType: 'text' },
  { key: 'frequency',    label: t('Frequency'),        kind: 'status',                 sortType: 'text' },
  { key: 'amount',       label: t('Amount'),           kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'nextDate',     label: t('Next schedule'),    kind: 'date',                   sortType: 'date' },
  { key: 'endRepeat',    label: t('End repeat'),                                       sortType: 'text' },
  { key: 'status',       label: t('Status'),           kind: 'status',                 sortType: 'text' },
  { key: 'createdCount', label: t('Generated'),        kind: 'amount', align: 'right', sortType: 'number' },
]

type Row = RecurringTxnRow & { endRepeat: string }

function formatDateLong(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso))
}
function formatDate(iso: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}

/** Same wording as every recurring detail page's End repeat summary. */
function endRepeatSummary(s: RecurringTxnRow['schedule']): string {
  if (!s) return '—'
  if (s.endRepeat === 'never') return t('Repeat forever')
  if (s.endRepeat === 'after') return `${t('End after')} ${s.endAfterCount} ${t('occurrences')}`
  if (s.endRepeat === 'on' && s.endOnDate) return `${t('End on')} ${formatDateLong(s.endOnDate)}`
  return '—'
}

const previewMode = ref<'data' | 'empty'>('data')

// Bumped after a delete so the aggregate is recomputed — the five module stores
// are plain reactive arrays this page only reads, so it re-reads on demand.
const dataVersion = ref(0)

const rows = computed<Row[]>(() => {
  void dataVersion.value
  return previewMode.value === 'empty'
    ? []
    : allRecurringTransactions().map(r => ({ ...r, endRepeat: endRepeatSummary(r.schedule) }))
})

const typeFilter = ref('')

const TYPE_OPTIONS = [...RECURRING_TXN_TYPES].map(v => ({ value: v, label: t(v) }))
const STATUS_OPTIONS = [
  { value: 'active',    label: t('Active') },
  { value: 'completed', label: t('Completed') },
]

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState(rows, {
  filterFn: (row: Row, s, status) =>
    (!s || row.name.toLowerCase().includes(s) || row.type.toLowerCase().includes(s)) &&
    (!status || row.status === status) &&
    (!typeFilter.value || row.type === typeFilter.value),
})

// useTableState only watches its own statusFilter — a second dropdown must
// reset the page itself or a filtered result can land on an empty page.
watch(typeFilter, () => setPage(1))

const allCols: TableColumn[] = [...columns]
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(allCols.map(c => [c.key, true])))
const columnItems = allCols.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => allCols.filter(c => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }

const emptyIllustration = '/illustrations/empty-folder.png'
function clearFilters() { search.value = ''; statusFilter.value = ''; typeFilter.value = '' }

// ─── New recurring transaction — type picker ─────────────────────────────────
// Opened from the page title bar button, which lives in pages/[...slug].vue and
// signals through an injected counter (same pattern as contactAddSignal).
const newTxnOpen = ref(false)
const newTxnType = ref('')
const newTxnError = ref('')
const NEW_TYPE_OPTIONS = [...RECURRING_TXN_TYPES].map(v => ({ value: v, label: t(v) }))

const newTxnSignal = inject<Ref<number>>('recurringTxnNewSignal', ref(0))
watch(newTxnSignal, () => {
  newTxnType.value = ''
  newTxnError.value = ''
  newTxnOpen.value = true
})

/** Types with a recurring creation form; the rest fall through to the placeholder. */
const NEW_ROUTES: Partial<Record<RecurringTxnType, string>> = {
  'Sales invoice':    '/sales-invoices/recurring/new',
  'Sales order':      '/sales-orders/recurring/new',
  'Purchase invoice': '/purchase-invoices/recurring/new',
  'Purchase order':   '/purchase-orders/recurring/new',
}

function slug(type: string) { return type.toLowerCase().replace(/\s+/g, '-') }

function confirmNewType() {
  const type = newTxnType.value as RecurringTxnType
  if (!type) { newTxnError.value = t('You must select a transaction type'); return }
  newTxnOpen.value = false
  router.push(NEW_ROUTES[type] ?? `/recurring-transactions/new/${slug(type)}`)
}

// ─── Row actions ────────────────────────────────────────────────────────────
/** Edit opens the module's recurring detail page, where the edit drawer lives. */
function editRow(row: Row) {
  router.push(row.to ?? `/recurring-transactions/${row.id}/edit`)
}

// ─── Bulk delete ────────────────────────────────────────────────────────────
// A selection can span several stores, so each row is deleted through its own
// type rather than against one list.
const bulkDeleteOpen = ref(false)
const bulkDeleteRows = ref<Row[]>([])
let bulkDeleteDeselect: (() => void) | null = null

function openBulkDelete(sel: Set<number>, deselectAll: () => void) {
  bulkDeleteRows.value = [...sel]
    .map(i => paginated.value[i] as Row | undefined)
    .filter(Boolean) as Row[]
  bulkDeleteDeselect = deselectAll
  bulkDeleteOpen.value = true
}

function confirmBulkDelete() {
  let n = 0
  for (const row of bulkDeleteRows.value) {
    if (deleteRecurringTransaction(row.type, row.id)) n++
  }
  if (n) dataVersion.value++
  bulkDeleteRows.value = []
  bulkDeleteDeselect?.()
  bulkDeleteDeselect = null
  toast.notify({
    variant: 'success',
    title: `${n} ${n === 1 ? t('recurring transaction') : t('recurring transactions')} ${t('deleted')}`,
  })
}

const deleteOpen = ref(false)
const deleteTarget = ref<Row | null>(null)

function askDelete(row: Row) {
  deleteTarget.value = row
  deleteOpen.value = true
}

function confirmDelete() {
  const row = deleteTarget.value
  if (!row) return
  if (deleteRecurringTransaction(row.type, row.id)) {
    dataVersion.value++
    toast.notify({ variant: 'success', title: t('Recurring transaction deleted') })
  }
  deleteTarget.value = null
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
    bulk-label="recurring transaction"
    :search="search"
    :has-active-filter="!!search || !!statusFilter || !!typeFilter"
    filter-empty-label="recurring transaction"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >

    <!-- ── Bulk actions — Delete sits behind its own confirm (never in a dropdown) ── -->
    <template #bulk-actions="{ selectedRows, deselectAll }">
      <MpButton
        size="sm"
        variant="secondary"
        is-rounded
        @click="openBulkDelete(selectedRows as Set<number>, deselectAll)"
      >
        {{ t('Delete') }}
      </MpButton>
    </template>

    <!-- ── Filter bar: Transaction type + Status | tools + search ── -->
    <template #filters>
      <div class="filter-left">
        <ErpFilterSelect
          id="rtxn-type-filter"
          v-model="typeFilter"
          :placeholder="t('All transaction types')"
          :options="TYPE_OPTIONS"
          width="200px"
          data-devchange="recurring-transactions-index"
        />
        <ErpFilterSelect
          id="rtxn-status-filter"
          v-model="statusFilter"
          :placeholder="t('All status')"
          :options="STATUS_OPTIONS"
          width="160px"
        />
      </div>

      <div class="filter-right">
        <MpButtonGroup class="filter-btn-group">
          <MpTooltip :label="t('Ask Airene')" placement="bottom">
            <MpButton class="filter-airene-btn" variant="ghost" left-icon="airene-brand" :aria-label="t('Ask Airene')" is-rounded @click="toggleAirene?.()" />
          </MpTooltip>
          <ColumnSettingsMenu id="rtxn-columns" :items="columnItems" :visibility="columnVisibility" />
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

    <!-- ── Cell: Name — links to the module's recurring detail page where one exists ── -->
    <template #cell-name="{ row, value }">
      <a v-if="(row as Row).to" class="cell-link cell-text" @click.stop="navigateTo((row as Row).to!)">{{ value }}</a>
      <span v-else class="cell-text">{{ value }}</span>
    </template>

    <!-- ── Cell: Transaction type ── -->
    <template #cell-type="{ value }">
      {{ t(value as string) }}
    </template>

    <!-- ── Cell: Frequency ── -->
    <template #cell-frequency="{ value }">
      {{ t(value as string) }}
    </template>

    <!-- ── Cell: Amount ── -->
    <template #cell-amount="{ value }">
      {{ formatIDR(value as number) }}
    </template>

    <!-- ── Cell: Next schedule ── -->
    <template #cell-nextDate="{ row, value }">
      <template v-if="(row as Row).status !== 'completed'">{{ formatDate(value as string) }}</template>
      <span v-else>—</span>
    </template>

    <!-- ── Cell: Status ── -->
    <template #cell-status="{ value }">
      <ErpStatusBadge :status="value as string" :type="(value as string) === 'completed' ? 'announcement' : undefined" />
    </template>

    <!-- ── Row actions ── -->
    <template #actions="{ row }">
      <MpPopover :id="`rtxn-row-${(row as Row).type}-${(row as Row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem @click="editRow(row as Row)">{{ t('Edit') }}</MpPopoverListItem>
            <MpPopoverListItem class="row-menu-item--danger" @click="askDelete(row as Row)">{{ t('Delete') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Full empty state ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No recurring transactions yet') }}</p>
        <p class="empty-full-desc">{{ t('Set up a recurring transaction to see it here.') }}</p>
      </div>
    </template>
  </ErpTablePage>

  <!-- ── Bulk delete confirm ── -->
  <ConfirmModal
    v-model:is-open="bulkDeleteOpen"
    :title="`${t('Delete')} ${bulkDeleteRows.length} ${bulkDeleteRows.length === 1 ? t('recurring transaction') : t('recurring transactions')}?`"
    :description="t('Deleted recurring transactions cannot be restored. Transactions already created from them are kept.')"
    :confirm-label="t('Delete')"
    @confirm="confirmBulkDelete"
  />

  <!-- ── Delete confirm ── -->
  <ConfirmModal
    v-model:is-open="deleteOpen"
    :title="t('Delete recurring transaction?')"
    :description="deleteTarget
      ? `${deleteTarget.templateName} ${t('will be permanently deleted. This cannot be undone.')}`
      : ''"
    :confirm-label="t('Delete')"
    @confirm="confirmDelete"
  />

  <!-- ── New recurring transaction — pick a transaction type ── -->
  <MpModal
    id="rtxn-new-modal"
    :is-close-on-esc="false"
    :is-close-on-overlay-click="false"
    :is-open="newTxnOpen"
    size="md"
    :is-keep-alive="false"
    @close="newTxnOpen = false"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ t('New recurring transaction') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <p class="rtxn-pick-hint">{{ t('Choose the transaction you want to repeat on a schedule.') }}</p>
        <MpFormControl :is-invalid="!!newTxnError">
          <MpFormLabel for="rtxn-new-type" is-required>{{ t('Transaction type') }}</MpFormLabel>
          <MpAutocomplete
            id="rtxn-new-type"
            v-model="newTxnType"
            :data="NEW_TYPE_OPTIONS"
            label-prop="label"
            value-prop="value"
            is-searchable is-full-width
            :placeholder="t('Select transaction type')"
            @update:model-value="newTxnError = ''"
          />
          <MpFormErrorMessage v-if="newTxnError">{{ newTxnError }}</MpFormErrorMessage>
        </MpFormControl>
      </MpModalBody>
      <MpModalFooter>
        <div class="rtxn-footer-btns">
          <MpButton class="btn-enterprise btn-enterprise--ghost" @click="newTxnOpen = false">{{ t('Cancel') }}</MpButton>
          <MpButton class="btn-enterprise btn-enterprise--primary" @click="confirmNewType">{{ t('Continue') }}</MpButton>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

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

.row-menu-item--danger {
  color: var(--mp-text-critical, var(--mp-text-danger));
}

/* ── New recurring transaction modal ── */
.rtxn-pick-hint {
  margin: 0 0 var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-lg, 20px);
  color: var(--mp-text-secondary);
}
.rtxn-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
</style>
