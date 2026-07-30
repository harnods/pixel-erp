<script setup lang="ts">
import {
  MpIcon, MpBadge,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import ApprovalLogPopover from '~/components/patterns/ApprovalLogPopover.vue'
import ApprovalCommentPopover from '~/components/patterns/ApprovalCommentPopover.vue'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'
import RejectTransactionModal from '~/components/patterns/RejectTransactionModal.vue'
import TransactionTypeCascadeMenu from '~/components/patterns/TransactionTypeCascadeMenu.vue'
import InboxFiltersDrawer, { emptyInboxFilters, type InboxFiltersValue } from '~/components/patterns/InboxFiltersDrawer.vue'
import type { AmountComparator } from '~/components/patterns/AmountComparatorField.vue'
import { taskTypeGroups, formatTaskNumber, stockDetailsLabel, approvalLevelsFor, approvalRequestedBy, commentsFor, type Task } from '~/data/tasks'

const props = defineProps<{
  /** Underlying dataset for this tab (Awaiting approval / Actions required) */
  tasks: Task[]
  /** Unique id prefix so per-row popover/select ids don't collide across tabs */
  idPrefix: string
  /** When set, limits the Transaction type dropdown to these docType values only */
  allowedDocTypes?: string[] | null
  /** When true, hides the Transaction type filter entirely (e.g. Expenses tab) */
  hideTransactionType?: boolean
  /** When true, the Transaction type filter allows selecting multiple doc types
   *  via checkboxes (only the Inbox "All transactions" submenu opts in) */
  multiSelectTransactionType?: boolean
  /** Column keys to force-hide regardless of user column settings */
  hiddenColumns?: string[]
  /** Hides the "All filters" drawer's Reason field (e.g. Purchase/Expense/Warehouse tabs) */
  hideReasonFilter?: boolean
  /** Hides the "All filters" drawer's Due date field (e.g. Warehouse tab) */
  hideDueDateFilter?: boolean
  /** When true, renders the Details column before Warehouse instead of after
   *  (Products tab — the reverse of the Warehouse tab's column order) */
  detailsBeforeWarehouse?: boolean
}>()

const toggleAirene = inject<() => void>('toggleAirene')

// ─── Approve / Reject actions ─────────────────────────────────────────────────
const approvedIds = ref<Set<number>>(new Set())
const rejectedIds = ref<Set<number>>(new Set())
const activeTasks = computed(() =>
  props.tasks.filter(t => !approvedIds.value.has(t.id) && !rejectedIds.value.has(t.id))
)

function approveTask(row: Task) {
  approvedIds.value = new Set([...approvedIds.value, row.id])
  toast.notify({
    variant: 'success',
    title: `${row.docType} approved`,
    rootProps: { class: 'toast-enterprise' },
  })
}

// ─── Bulk approve / reject (row-selection checkboxes, merged into the Date
// column by ErpTablePage's has-checkbox prop) — selectedRows holds indices
// into the current page (`paginated`), same as every other ErpTablePage
// bulk-actions consumer. ─────────────────────────────────────────────────────
function rowsFromSelection(selected: Set<number>): Task[] {
  return Array.from(selected)
    .map((i) => paginated.value[i])
    .filter((r): r is Task => !!r)
}

function bulkApprove(selected: Set<number>, deselectAll: () => void) {
  const rows = rowsFromSelection(selected)
  if (!rows.length) return
  approvedIds.value = new Set([...approvedIds.value, ...rows.map((r) => r.id)])
  toast.notify({
    variant: 'success',
    title: `${rows.length} transaction${rows.length === 1 ? '' : 's'} approved`,
    rootProps: { class: 'toast-enterprise' },
  })
  deselectAll()
}

// ─── Reject modal — shared by the single-row kebab action and the bulk-bar
// Reject button; bulkRejectRows is set only for the latter. ──────────────────
const rejectTarget = ref<Task | null>(null)
const bulkRejectRows = ref<Task[] | null>(null)
const rejectModalOpen = computed(() => rejectTarget.value !== null || bulkRejectRows.value !== null)
const rejectModalDocType = computed(() => {
  if (bulkRejectRows.value) return `${bulkRejectRows.value.length} transaction${bulkRejectRows.value.length === 1 ? '' : 's'}`
  return rejectTarget.value?.docType ?? ''
})
let bulkRejectDeselectAll: (() => void) | null = null

function openRejectModal(row: Task) {
  rejectTarget.value = row
}

function openBulkRejectModal(selected: Set<number>, deselectAll: () => void) {
  const rows = rowsFromSelection(selected)
  if (!rows.length) return
  bulkRejectRows.value = rows
  bulkRejectDeselectAll = deselectAll
}

function handleReject(_reason: string) {
  if (bulkRejectRows.value) {
    const rows = bulkRejectRows.value
    rejectedIds.value = new Set([...rejectedIds.value, ...rows.map((r) => r.id)])
    toast.notify({
      variant: 'success',
      title: `${rows.length} transaction${rows.length === 1 ? '' : 's'} rejected`,
      rootProps: { class: 'toast-enterprise' },
    })
    bulkRejectRows.value = null
    bulkRejectDeselectAll?.()
    bulkRejectDeselectAll = null
    return
  }
  const row = rejectTarget.value
  if (!row) return
  rejectedIds.value = new Set([...rejectedIds.value, row.id])
  const label = row.docType.toLowerCase()
  toast.notify({
    variant: 'success',
    title: `${label.charAt(0).toUpperCase()}${label.slice(1)} rejected`,
    rootProps: { class: 'toast-enterprise' },
  })
  rejectTarget.value = null
}

function closeRejectModal() {
  rejectTarget.value = null
  bulkRejectRows.value = null
  bulkRejectDeselectAll = null
}

// ─── Column definitions ───────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'date',        label: 'Date',         width: '120px',                                sortType: 'date'   },
  { key: 'number',       label: 'Number',       width: '240px', sortable: true,                sortType: 'number' },
  { key: 'warehouse',    label: 'Warehouse',    width: '160px', sortable: true,                sortType: 'text'   },
  { key: 'details',      label: 'Details',      width: '260px', sortable: true,                sortType: 'text'   },
  { key: 'reason',       label: 'Reason',       width: '200px', sortable: true,                sortType: 'text'   },
  { key: 'requestedBy',  label: 'Requested by', width: '160px', sortable: true,                sortType: 'text'   },
  { key: 'balanceDue',   label: 'Balance due',  width: '160px', align: 'right', sortable: true, sortType: 'number' },
  { key: 'total',        label: 'Total',        width: '160px', align: 'right', sortable: true, sortType: 'number' },
  { key: 'dueDate',      label: 'Due date',     width: '120px',                                sortType: 'date'   },
]

// Column show/hide — Date & Number are always on (locked in the menu).
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(columns.map((c) => [c.key, true])))
// Warehouse is only offered as a toggle on the inner tabs that force-show it
// (Warehouse/Products submenus) — everywhere else it's in hiddenColumns, so
// drop it from the menu entirely instead of showing a toggle that can't
// actually reveal a column.
const columnItems = computed(() =>
  columns
    .filter((c) => !props.hiddenColumns?.includes(c.key))
    .map((c) => ({ key: c.key, label: c.label, disabled: c.key === 'date' || c.key === 'number' })),
)
const visibleColumns = computed<TableColumn[]>(() => {
  const cols = columns.filter((c) => columnVisibility[c.key] && !props.hiddenColumns?.includes(c.key))
  if (!props.detailsBeforeWarehouse) return cols
  const warehouseIdx = cols.findIndex((c) => c.key === 'warehouse')
  const detailsIdx = cols.findIndex((c) => c.key === 'details')
  if (warehouseIdx === -1 || detailsIdx === -1) return cols
  const swapped = [...cols]
  ;[swapped[warehouseIdx], swapped[detailsIdx]] = [swapped[detailsIdx]!, swapped[warehouseIdx]!]
  return swapped
})
function hideColumn(key: string) { columnVisibility[key] = false }

// ─── Date range filter (default: last 30 days) — AdvancedDateRangePicker
// replicates the Pixel "Advance" date-picker pattern (sidebar presets +
// day/month/year calendar views) with its own label + field. ─────────────────

function dayStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }

// Parses MpDatePicker's format="DD/MM/YYYY" string output.
function parseDMY(s: string): Date {
  const [d, m, y] = s.split('/').map(Number)
  return new Date(y!, m! - 1, d!)
}
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x }

const today = dayStart(new Date())
const dateRangeValue = ref<Date[]>([addDays(today, -30), today])

const dateRange = computed<[Date, Date] | null>(() => {
  const [start, end] = dateRangeValue.value
  return start && end ? [dayStart(start), dayStart(end)] : null
})

// ─── Transaction type filter — two-level cascade (parent category → child
// doc type); selecting a leaf sets transactionTypeFilter to its raw docType
// string, same as the table's other filters. When allowedDocTypes already
// narrows things to a single category (e.g. the Inbox "Sales" inner tab),
// showing that one category as a cascade parent is redundant — flatten it
// into a plain list of its doc types instead. ───────────────────────────────

const cascadeGroups = computed(() => {
  const filtered = taskTypeGroups
    .map((g) => ({
      label: g.label,
      children: g.children.filter((c) => !props.allowedDocTypes || props.allowedDocTypes.includes(c.value)),
    }))
    .filter((g) => g.children.length > 0)

  if (props.allowedDocTypes && filtered.length === 1) {
    return filtered[0]!.children.map((c) => ({ label: c.label, children: [c] }))
  }
  return filtered
})

const transactionTypeFilter = ref<string[]>([])

// ─── "All filters" drawer — a second, independent filter layer. Its Date range
// and Transaction type fields never mirror the toolbar's own controls above
// (opening the drawer restores only what was last Applied FROM the drawer);
// both layers are ANDed together in the table's filterFn below. ───────────────
const filtersOpen = ref(false)
const appliedFilters = reactive<InboxFiltersValue>(emptyInboxFilters())
// Warehouse checklist mirrors the Warehouse *column*'s own visibility rule —
// both are driven by whether the parent forced it into hiddenColumns (i.e.
// whether this is the Inbox "Warehouse" inner tab).
const showWarehouseFilter = computed(() => !props.hiddenColumns?.includes('warehouse'))
const reasonOptions = computed(() => [...new Set(props.tasks.map((t) => t.reason))].sort())
const requestedByOptions = computed(() => [...new Set(props.tasks.map((t) => t.requestedBy))].sort())
const warehouseOptions = computed(() => [...new Set(props.tasks.map((t) => t.warehouse))].sort())

function applyDrawerFilters(v: InboxFiltersValue) { Object.assign(appliedFilters, v) }

// Total / Balance due drawer filters — "Is greater than"/"Is less than" read a
// single value field, "Is between" reads the min/max pair.
function matchesAmountFilter(amount: number, comparator: AmountComparator, value: string, min: string, max: string): boolean {
  if (comparator === 'gt') return value === '' || amount > Number(value)
  if (comparator === 'lt') return value === '' || amount < Number(value)
  const lo = min === '' ? -Infinity : Number(min)
  const hi = max === '' ? Infinity : Number(max)
  return amount >= lo && amount <= hi
}

// ─── Table state ──────────────────────────────────────────────────────────────

// Newest request first by default — sorted on the source itself (not via
// setSort) so the Date column doesn't render as the "active" sort column;
// its sort icon stays hover-only, same as every other column, until the
// user actually picks a sort option from it.
const defaultSortedTasks = computed(() => [...activeTasks.value].sort((a, b) => b.date.localeCompare(a.date)))

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState(defaultSortedTasks, {
  filterFn: (row: Task, s) => {
    const matchesSearch = !s
      || formatTaskNumber(row).toLowerCase().includes(s)
      || row.details.toLowerCase().includes(s)
      || row.requestedBy.toLowerCase().includes(s)
    const matchesType = transactionTypeFilter.value.length === 0 || transactionTypeFilter.value.includes(row.docType)
    let matchesDate = true
    const range = dateRange.value
    if (range) {
      const d = dayStart(new Date(row.date))
      matchesDate = d >= range[0] && d <= range[1]
    }

    // ── Drawer filters (independent of the toolbar's Date range / Transaction type) ──
    const f = appliedFilters
    const matchesDrawerType = f.transactionType.length === 0 || f.transactionType.includes(row.docType)
    let matchesDrawerDate = true
    if (f.dateRange) {
      const d = dayStart(new Date(row.date))
      matchesDrawerDate = d >= dayStart(f.dateRange[0]!) && d <= dayStart(f.dateRange[1]!)
    }
    const matchesReason = f.reason.length === 0 || f.reason.includes(row.reason)
    const matchesRequestedBy = f.requestedBy.length === 0 || f.requestedBy.includes(row.requestedBy)
    const matchesWarehouse = f.warehouse.length === 0 || f.warehouse.includes(row.warehouse)
    const matchesDueDate = !f.dueDate || !row.dueDate
      || dayStart(new Date(row.dueDate)).getTime() === dayStart(parseDMY(f.dueDate)).getTime()
    const matchesTotal = matchesAmountFilter(row.total, f.totalComparator, f.totalValue, f.totalMin, f.totalMax)
    const matchesBalanceDue = matchesAmountFilter(row.balanceDue, f.balanceDueComparator, f.balanceDueValue, f.balanceDueMin, f.balanceDueMax)

    return matchesSearch && matchesType && matchesDate
      && matchesDrawerType && matchesDrawerDate && matchesReason && matchesRequestedBy
      && matchesWarehouse && matchesDueDate && matchesTotal && matchesBalanceDue
  },
})

// reset to page 1 when the extra (non-built-in) filters change
watch([transactionTypeFilter, dateRangeValue, appliedFilters], () => setPage(1))

const isDrawerFilterActive = computed(() => {
  const f = appliedFilters
  return !!f.dateRange || f.transactionType.length > 0 || f.reason.length > 0
    || f.requestedBy.length > 0 || f.warehouse.length > 0 || !!f.dueDate
    || f.totalValue !== '' || f.totalMin !== '' || f.totalMax !== ''
    || f.balanceDueValue !== '' || f.balanceDueMin !== '' || f.balanceDueMax !== ''
})

const hasActiveFilter = computed(() => !!search.value || transactionTypeFilter.value.length > 0 || isDrawerFilterActive.value)

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatIDR(amount: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 2,
  }).format(amount).replace(/^(Rp)\s/, '$1')
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso))
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
    :has-active-filter="hasActiveFilter"
    actions-width="228px"
    has-checkbox
    bulk-label="transaction"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
  >

    <!-- ── Bulk bar → approve / reject selected rows ── -->
    <template #bulk-actions="{ selectedRows, deselectAll }">
      <button
        class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm"
        @click="bulkApprove(selectedRows as Set<number>, deselectAll)"
      >
        Approve
      </button>
      <button
        class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm"
        :class="css({ color: 'var(--mp-text-critical, var(--mp-text-danger))' })"
        @click="openBulkRejectModal(selectedRows as Set<number>, deselectAll)"
      >
        Reject
      </button>
    </template>

    <!-- ── Filter bar (existing pattern: filters, icon buttons, search) ── -->
    <template #filters>
      <div class="filter-left">
        <!-- Date range — Pixel "Advance" date-picker pattern (sidebar presets +
             day/month/year calendar), label outside/above the field -->
        <AdvancedDateRangePicker :id="`${idPrefix}-tasks-daterange`" v-model="dateRangeValue" />

        <!-- Transaction type — two-level cascade menu (parent category, then
             child doc type); see TransactionTypeCascadeMenu.vue. -->
        <TransactionTypeCascadeMenu
          v-if="!hideTransactionType"
          :id="`${idPrefix}-tasks-txntype-cascade`"
          v-model="transactionTypeFilter"
          :groups="cascadeGroups"
          :multiple="multiSelectTransactionType"
        />

        <button class="filter-all-btn" :class="{ 'filter-all-btn--active': isDrawerFilterActive }" @click="filtersOpen = true">
          <MpIcon name="filter" size="sm" />
          All filters
        </button>
      </div>

      <div class="filter-right">
        <div class="filter-btn-group">
          <ColumnSettingsMenu :id="`${idPrefix}-tasks-columns`" :items="columnItems" :visibility="columnVisibility" />
          <button class="filter-icon-btn" aria-label="Export">
            <MpIcon name="download" size="md" />
          </button>
        </div>

        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input v-model="search" class="filter-search-input" type="text" placeholder="Search..." />
        </div>
      </div>
    </template>

    <!-- ── Cell: Date ── -->
    <template #cell-date="{ value }">
      {{ formatDate(value as string) }}
    </template>

    <!-- ── Cell: Number — View details chip on hover (same as Bills) ── -->
    <template #cell-number="{ row }">
      <div class="cell-with-action">
        <span class="cell-text">{{ formatTaskNumber(row as Task) }}</span>
        <button class="row-hover-btn" @click.stop>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="row-hover-btn__label">VIEW DETAILS</span>
        </button>
      </div>
    </template>

    <!-- ── Cell: Warehouse ── -->
    <template #cell-warehouse="{ value }">
      {{ value }}
    </template>

    <!-- ── Cell: Details — Stock Count / Stock In/Out show a movement label
         (Stock Count, or the In/Out category) instead of a counterparty;
         Product Conversion shows the converted product name + qty converted;
         everything else is plain text (contact / warehouse route). ── -->
    <template #cell-details="{ value, row }">
      <ProductCell
        v-if="(row as Task).docType === 'Product Conversion'"
        :name="(row as Task).productName!"
        :desc="(row as Task).qtyDesc"
      />
      <template v-else-if="stockDetailsLabel(row as Task)">{{ stockDetailsLabel(row as Task) }}</template>
      <template v-else>{{ value }}</template>
    </template>

    <!-- ── Cell: Reason — MpBadge tableStatus. "Internal rule" (Warehouse doc
         types) is a policy trigger, not a collections/limit trigger, so it gets
         the neutral gray (announcement) badge instead of warning. ── -->
    <template #cell-reason="{ value }">
      <MpBadge for="tableStatus" :type="value === 'Internal rule' ? 'announcement' : 'warning'">
        {{ value }}
      </MpBadge>
    </template>

    <!-- ── Cell: Requested by ── -->
    <template #cell-requestedBy="{ value }">
      {{ value }}
    </template>

    <!-- ── Cell: Balance due — dash for non-financial doc types (0 = N/A) ── -->
    <template #cell-balanceDue="{ value }">
      {{ value ? formatIDR(value as number) : '–' }}
    </template>

    <!-- ── Cell: Total — dash for non-financial doc types (0 = N/A) ── -->
    <template #cell-total="{ value }">
      {{ value ? formatIDR(value as number) : '–' }}
    </template>

    <!-- ── Cell: Due date — dash for non-financial doc types ('' = N/A) ── -->
    <template #cell-dueDate="{ value }">
      {{ value ? formatDate(value as string) : '–' }}
    </template>

    <!-- ── Actions: same approval button group pattern as Bills, plus the
         Approval log / Comments popover pattern (self-contained trigger +
         popover, bottom-end/4px gap, plain-CSS tooltip — see memory) ── -->
    <template #actions="{ row }">
      <div class="row-actions">
        <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" @click.stop="approveTask(row as Task)">Approve</button>
        <div class="row-actions__icons">
          <ApprovalLogPopover
            :id="`${idPrefix}-applog-${(row as Task).id}`"
            :subject="formatTaskNumber(row as Task)"
            :requested="approvalRequestedBy(row as Task)"
            :levels="approvalLevelsFor(row as Task)"
          />
          <ApprovalCommentPopover
            :id="`${idPrefix}-comments-${(row as Task).id}`"
            :comments="commentsFor(row as Task)"
          />
          <MpPopover :id="`${idPrefix}-row-actions-${(row as Task).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <button class="row-icon-btn" aria-label="More actions" @click.stop>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="12" cy="5" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="12" cy="19" r="2" />
                </svg>
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem>View details</MpPopoverListItem>
                <MpPopoverListItem variant="danger" @click.stop="openRejectModal(row as Task)">Reject</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>
    </template>
  </ErpTablePage>

  <RejectTransactionModal
    :is-open="rejectModalOpen"
    :doc-type="rejectModalDocType"
    @close="closeRejectModal"
    @reject="handleReject"
  />

  <InboxFiltersDrawer
    :id="`${idPrefix}-tasks-allfilters`"
    :is-open="filtersOpen"
    :model-value="appliedFilters"
    :cascade-groups="cascadeGroups"
    :reason-options="reasonOptions"
    :requested-by-options="requestedByOptions"
    :warehouse-options="warehouseOptions"
    :show-warehouse="showWarehouseFilter"
    :hide-reason="hideReasonFilter"
    :hide-due-date="hideDueDateFilter"
    @update:is-open="filtersOpen = $event"
    @apply="applyDrawerFilters"
  />
</template>

<style scoped>
/* Cell with hover action button (same as Bills' Number/Beneficiary cells) */
.cell-with-action {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
}

.cell-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.row-hover-btn {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  display: none;
  align-items: center;
  gap: var(--mp-spacing-1\.5);
  padding: var(--mp-spacing-1) var(--mp-spacing-1\.5);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-sm);
  cursor: pointer;
  white-space: nowrap;
  line-height: 1;
}

.row-hover-btn__label {
  font-size: var(--mp-font-sizes-2xs, 10px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xs, 12px);
  color: var(--mp-text-secondary);
  text-transform: uppercase;
  letter-spacing: var(--mp-letter-spacings-normal);
}

:global(.erp-tr:hover .row-hover-btn) {
  display: flex;
}

/* Actions cell: left padding 8px only */
:global(.erp-td--actions) {
  padding-left: var(--mp-spacing-2) !important; /* 8px */
}

/* Row actions: Approve button + icon button group (same as Bills awaiting approval),
   flushed to the right edge of the sticky actions column (erp-td--actions is
   text-align:right, but that has no effect on this flex child — justify-content
   does the actual flush). */
/* Actions cell: left padding 8px only */
:global(.erp-td--actions) {
  padding-left: var(--mp-spacing-2) !important; /* 8px */
}

:deep(.erp-td--actions) {
  padding-left: 16px !important;
}
:deep(.erp-filter-bar) {
  align-items: flex-end;
}

.row-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-6);
  padding-left: 0;
}

.row-actions__icons {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-5); /* 20px (8px more than before) */
}

.row-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--mp-spacing-1);
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--mp-radii-sm);
  color: var(--mp-text-subtle);
}
.row-icon-btn:hover {
  background: var(--mp-background-neutral-hovered);
  color: var(--mp-text-default);
}

/* ── Filter bar (copied from BillsAwaitingApprovalPage) ──────────────────── */

.filter-left {
  display: flex;
  align-items: flex-end;
  gap: var(--mp-spacing-4);
}


.filter-right {
  display: flex;
  align-items: flex-end;
  gap: var(--mp-spacing-3);
}

.filter-all-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
  cursor: pointer;
  white-space: nowrap;
}
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-all-btn--active {
  background: var(--mp-background-selected, var(--mp-background-information));
  border-color: var(--mp-border-selected, var(--mp-border-information));
  color: var(--mp-text-selected, var(--mp-text-information));
}

.filter-btn-group {
  display: flex;
  align-items: center;
}

.filter-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-9, 36px);
  height: var(--mp-sizes-9, 36px);
  padding: var(--mp-spacing-2);
  border: none;
  background: transparent;
  border-radius: var(--mp-radii-md);
  cursor: pointer;
  color: var(--mp-text-default);
}
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-icon-btn--airene { color: var(--mp-airene-default); }

.filter-search {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  width: 248px;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  color: var(--mp-text-subtle);
}

.filter-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
  min-width: 0;
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }

/* Enterprise toast — fully rounded with enterprise styling */
:global(.toast-enterprise) {
  border-radius: var(--mp-radii-full, 999px) !important;
  border-color: var(--mp-border-success) !important;
  background-color: var(--mp-background-neutral) !important;
}
</style>
