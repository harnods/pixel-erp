<script setup lang="ts">
import {
  MpIcon,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ApprovalLogPopover from '~/components/patterns/ApprovalLogPopover.vue'
import ApprovalCommentPopover from '~/components/patterns/ApprovalCommentPopover.vue'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'
import RejectTransactionModal from '~/components/patterns/RejectTransactionModal.vue'
import TransactionTypeCascadeMenu from '~/components/patterns/TransactionTypeCascadeMenu.vue'
import { taskTypeGroups, formatTaskNumber, approvalLevelsFor, approvalRequestedBy, commentsFor, type Task } from '~/data/tasks'

const props = defineProps<{
  /** Underlying dataset for this tab (Awaiting approval / Actions required) */
  tasks: Task[]
  /** Unique id prefix so per-row popover/select ids don't collide across tabs */
  idPrefix: string
  /** When set, limits the Transaction type dropdown to these docType values only */
  allowedDocTypes?: string[] | null
  /** When true, hides the Transaction type filter entirely (e.g. Expenses tab) */
  hideTransactionType?: boolean
  /** Column keys to force-hide regardless of user column settings */
  hiddenColumns?: string[]
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

// ─── Reject modal ─────────────────────────────────────────────────────────────
const rejectTarget = ref<Task | null>(null)
const rejectModalOpen = computed(() => rejectTarget.value !== null)

function openRejectModal(row: Task) {
  rejectTarget.value = row
}

function handleReject(_reason: string) {
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
}

// ─── Column definitions ───────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'date',        label: 'Date',         width: '120px',                                sortType: 'date'   },
  { key: 'number',       label: 'Number',       width: '240px', sortable: true,                sortType: 'number' },
  { key: 'details',      label: 'Details',      width: '260px', sortable: true,                sortType: 'text'   },
  { key: 'requestedBy',  label: 'Requested by', width: '160px', sortable: true,                sortType: 'text'   },
  { key: 'balanceDue',   label: 'Balance due',  width: '160px', align: 'right', sortable: true, sortType: 'number' },
  { key: 'total',        label: 'Total',        width: '160px', align: 'right', sortable: true, sortType: 'number' },
  { key: 'dueDate',      label: 'Due date',     width: '120px',                                sortType: 'date'   },
]

// Column show/hide — Date & Number are always on (locked in the menu).
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(columns.map((c) => [c.key, true])))
const columnItems = columns.map((c) => ({ key: c.key, label: c.label, disabled: c.key === 'date' || c.key === 'number' }))
const visibleColumns = computed<TableColumn[]>(() =>
  columns.filter((c) => columnVisibility[c.key] && !props.hiddenColumns?.includes(c.key))
)
function hideColumn(key: string) { columnVisibility[key] = false }

// ─── Date range filter (default: last 30 days) — AdvancedDateRangePicker
// replicates the Pixel "Advance" date-picker pattern (sidebar presets +
// day/month/year calendar views) with its own label + field. ─────────────────

function dayStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x }

const today = dayStart(new Date())
const dateRangeValue = ref<Date[]>([addDays(today, -30), today])

const dateRange = computed<[Date, Date] | null>(() => {
  const [start, end] = dateRangeValue.value
  return start && end ? [dayStart(start), dayStart(end)] : null
})

// ─── Transaction type filter — two-level cascade (parent category → child
// doc type); selecting a leaf sets transactionTypeFilter to its raw docType
// string, same as the table's other filters. ───────────────────────────────

const transactionTypeFilter = ref('')

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
    const matchesType = !transactionTypeFilter.value || row.docType === transactionTypeFilter.value
    let matchesDate = true
    const range = dateRange.value
    if (range) {
      const d = dayStart(new Date(row.date))
      matchesDate = d >= range[0] && d <= range[1]
    }
    return matchesSearch && matchesType && matchesDate
  },
})

// reset to page 1 when the extra (non-built-in) filters change
watch([transactionTypeFilter, dateRangeValue], () => setPage(1))

const hasActiveFilter = computed(() => !!search.value || !!transactionTypeFilter.value)

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
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
  >

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
          :groups="taskTypeGroups"
        />

        <button class="filter-all-btn">
          <MpIcon name="filter" size="sm" />
          All filters
        </button>
      </div>

      <div class="filter-right">
        <div class="filter-btn-group">
          <button class="filter-icon-btn filter-icon-btn--airene" aria-label="Ask Airene" @click="toggleAirene?.()">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
              <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
            </svg>
          </button>
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

    <!-- ── Cell: Details — Stock In/Out shows product name + qty as a two-line
         product cell; everything else is plain text (contact / warehouse route). ── -->
    <template #cell-details="{ value, row }">
      <ProductCell
        v-if="(row as Task).docType === 'Stock In/Out'"
        :name="(row as Task).productName!"
        :desc="(row as Task).qtyDesc"
      />
      <template v-else>{{ value }}</template>
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
    :doc-type="rejectTarget?.docType ?? ''"
    @close="closeRejectModal"
    @reject="handleReject"
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

.row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
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
  align-items: center;
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
