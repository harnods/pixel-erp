<script setup lang="ts">
/**
 * Warehouses › Stock requests — the warehouse/PPIC dashboard.
 *
 * Built to the PRD "Work Order Material Reservation, Stock Request & Project
 * Stock" › UC-11; requirement IDs (W-1…W-8) are cited on the code they drive.
 *
 * A stock request is never created by hand — saving a work order raises one
 * (PRD C-4). That is why the title bar has no "+ New" action and the full empty
 * state has no CTA. Two views read the same requests (W-1): **By product**
 * (default) aggregates the same component across every open WO with a per-WO
 * breakdown; **By transaction** lists one row per request. Work orders are the
 * only transaction type that raises a stock request today.
 */
import {
  MpButton, MpButtonGroup, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpIcon, MpTooltip, MpSegmentedControl, toast, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import AdvanceDateFilter from '~/components/patterns/AdvanceDateFilter.vue'
import ScenarioFab from '~/components/patterns/ScenarioFab.vue'
import ExportModal from '~/components/patterns/ExportModal.vue'
import StockRequestFiltersDrawer, {
  emptyStockRequestFilters, type StockRequestFiltersValue,
} from '~/components/patterns/StockRequestFiltersDrawer.vue'
import { formatDate } from '~/utils/date'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import { dateFilterMatches, type DateFilterValue } from '~/utils/dateFilter'
import { TODAY, TODAY_ISO } from '~/data/master'
import {
  stockRequests, stockRequestStatus, stockRequestStatusOptions, skuDemandGroups,
  requestRequiredQty, isAwaitingTab, isTerminalRequest, isOnDashboard, isActionable, workOrderFor, isOverdue,
  reserveStock, reserveProductEverywhere, rejectRequestLine, canReject, canRejectLine,
  isLineOverdue,
  type StockRequest, type StockRequestLine, type StockRequestLineTag, type SkuDemandGroup,
} from '~/data/stockRequests'

const toggleAirene = inject<() => void>('toggleAirene')
const { t } = useLocale()
const route = useRoute()
const router = useRouter()

// ─── Tabs (W-4) — page-level tabs from `pageTabs` in [...slug].vue, driven by
// ?tab=. The split is work vs not-work:
//
//   • **Awaiting** (default) — demand the warehouse still has to fulfil: anything
//     not fully reserved, on a request that is neither rejected nor canceled.
//   • **Rejected / canceled** — the two TERMINAL states (W-3). A declined line and a
//     cancelled job's request are still records worth finding, but they are not
//     work, so they do not sit in a tab the stockist works down.
//
// Because the two tabs now carry the terminal states, those states are not also
// offered in the Status filter — see `statusFilterOptions`. ───────────────────
const isTerminalTab = computed(() => route.query.tab === 'Rejected / canceled')

// ─── Group by (W-1) — By product is the default.
//
// The second grouping is by TRANSACTION, not by work order: a stock request is
// raised by whatever transaction needs the material, and a work order is simply
// the only kind that raises one today. Each row names its own type ("Work order
// WO-2026-0001"), so the view keeps reading correctly as more types are added
// without renaming anything. ─────────────────────────────────────────────────
type GroupBy = 'product' | 'transaction'
const view = ref<GroupBy>('product')
/**
 * W-1 — the two views are a "which view am I on" switch, not a filter: picking one
 * changes what a row IS (a component vs a transaction), not which rows pass. So it
 * is a segmented control above the filter bar (rule/segmented-control-pill) rather
 * than a select inside it, where it read as a third filter.
 */
// MpSegmentedControl needs an `id` per item — without one the radios don't bind
// and the switch silently does nothing.
const viewOptions = [
  { id: 'sr-view-product',     label: t('By product'),     value: 'product'     },
  { id: 'sr-view-transaction', label: t('By transaction'), value: 'transaction' },
]

// ─── Columns — semantic `kind`s only, no pixel widths (rule/table-column-kind) ──
// By transaction (W-2 covers the product view; this one mirrors the request record).
/**
 * By transaction. Every column is chosen so it means the SAME KIND of thing on a
 * request row and on the component rows underneath it — a request's qty and its
 * line's qty, a request's earliest required date and its line's required date.
 * The expanded rows used to borrow whatever column happened to sit there, which
 * is how component quantities ended up under a "Start date" header.
 *
 * The row IS the work order, so its date and status need no "WO" prefix — the
 * first column already says what the row is.
 */
const woColumns: TableColumn[] = [
  { key: 'workOrderNumber',     label: t('Work order number'),     kind: 'number', sortable: true, sortType: 'text' },
  // W-7 — the line tags get a column of their own rather than stacking under the
  // number, where they pushed the row to three lines and read as part of it.
  { key: 'lineTags',            label: t('Request type'),          kind: 'tags' },
  { key: 'qty',                 label: t('Required qty'),                          sortable: true, sortType: 'number', align: 'right' },
  { key: 'requiredDate',        label: t('Required date'),         kind: 'date',   sortable: true, sortType: 'date' },
  { key: 'status',              label: t('Status'),                kind: 'status',                 sortType: 'text' },
  { key: 'destinationWarehouse', label: t('Destination warehouse'), kind: 'name',  sortable: true, sortType: 'text' },
]
/**
 * By product — PRD v0.5 W-2, kept at one row per SKU PER DESTINATION WAREHOUSE.
 *
 * W-2 names the columns Component · Open transactions · Earliest required ·
 * Required · Reserved · Remaining · Consumed · Available · Status, and says
 * availability is shown per warehouse and NEVER summed across them. The
 * per-warehouse row split is how this build satisfies that: rather than one row
 * carrying several availability figures, each destination gets its own row, so
 * every number on a row belongs to one warehouse.
 *
 * "Component" is split into product name + SKU, which is how every other product
 * table in this app reads: the name leads, because that is what a stockist scans
 * for, and the SKU qualifies it.
 */
const skuColumns: TableColumn[] = [
  { key: 'lane',        label: '',                       width: '56px', noHeader: true },
  { key: 'product',     label: t('Product name'),        kind: 'name',   sortable: true, sortType: 'text' },
  { key: 'sku',         label: t('SKU'),                 kind: 'number', sortable: true, sortType: 'text' },
  // W-7 — a tag belongs to a LINE, so it reads on the breakdown rows, in its own
  // column rather than tucked beside the work order number.
  { key: 'lineTags',    label: t('Request type'),        kind: 'tags' },
  { key: 'openWorkOrders', label: t('Open transactions'),                sortable: true, sortType: 'number', align: 'right' },
  { key: 'earliestRequired', label: t('Earliest required'), kind: 'date', sortable: true, sortType: 'date' },
  // Status sits beside the date it depends on — a row is late or not against its
  // earliest required date, so the two read together.
  { key: 'status',      label: t('Status'),              kind: 'status',                 sortType: 'text' },
  { key: 'required',    label: t('Required qty'),                            sortable: true, sortType: 'number', align: 'right' },
  { key: 'reserved',    label: t('Reserved qty'),                            sortable: true, sortType: 'number', align: 'right' },
  { key: 'remaining',   label: t('Remaining qty'),                           sortable: true, sortType: 'number', align: 'right' },
  { key: 'consumed',    label: t('Consumed qty'),                            sortable: true, sortType: 'number', align: 'right' },
  { key: 'destinationWarehouse', label: t('Destination warehouse'), kind: 'name', sortable: true, sortType: 'text' },
  { key: 'available',   label: t('Available qty'),                           sortable: true, sortType: 'number', align: 'right' },
]

// Column show/hide — first column always on; "Last updated" is opt-in (off by default).
const allWoCols: TableColumn[] = [
  ...woColumns,
  { key: 'woStartDate', label: t('Start date'),   kind: 'date', sortable: true, sortType: 'date' },
  { key: 'lastUpdated', label: t('Last updated'), kind: 'date' },
]
// W-2's full column set runs to twelve, past what fits comfortably, so the product
// view gets the same show/hide menu the transaction view already has. Consumed is
// off by default — it only matters once a job has started drawing material.
const allSkuCols: TableColumn[] = skuColumns
const columnVisibility = reactive<Record<string, boolean>>({
  // Start date and Last updated are opt-in: neither is demand data.
  ...Object.fromEntries(allWoCols.map(c => [c.key, c.key !== 'lastUpdated' && c.key !== 'woStartDate'])),
  ...Object.fromEntries(allSkuCols.map(c => [`sku.${c.key}`, c.key !== 'consumed'])),
})
const columnItems = computed(() => (view.value === 'product'
  // The lane column is layout, not data — never offered in the menu.
  ? allSkuCols.filter(c => c.key !== 'lane').map((c, i) => ({ key: `sku.${c.key}`, label: c.label, disabled: i === 0 }))
  : allWoCols.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))))
const visibleWoColumns = computed<TableColumn[]>(() => allWoCols.filter(c => columnVisibility[c.key]))
const visibleSkuColumns = computed<TableColumn[]>(() =>
  allSkuCols.filter(c => c.key === 'lane' || columnVisibility[`sku.${c.key}`]))
function hideColumn(key: string) { columnVisibility[key] = false }

// ─── Prototype scenario (ScenarioFab, bottom-right): populated vs empty ────────
const previewMode = ref<'data' | 'empty'>('data')
const sourceRequests = computed<StockRequest[]>(() => previewMode.value === 'empty' ? [] : stockRequests)

// ─── Quick filter: Request date (second of the two allowed quick filters) ──────
const dateFilter = ref<DateFilterValue | null>(null)

// ─── "All filters" drawer — a second, independent filter layer ANDed with the
// toolbar's own Status select, Request date and search. ───────────────────────
const filtersOpen = ref(false)
const appliedFilters = reactive<StockRequestFiltersValue>(emptyStockRequestFilters())
function applyDrawerFilters(v: StockRequestFiltersValue) { Object.assign(appliedFilters, v) }

function dayStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
// AdvancedDateRangePicker emits a [start, end] Date pair (or null = not applied).
function matchesDateRange(iso: string, range: Date[] | null): boolean {
  if (!range) return true
  const time = dayStart(new Date(iso)).getTime()
  return time >= dayStart(range[0]!).getTime() && time <= dayStart(range[1]!).getTime()
}

// ─── Rows — By transaction ─────────────────────────────────────────────────────
// Story 2 — the Order view lists the WORK ORDER: its number, start date, status
// and destination warehouse. Canceled work orders never appear; Done ones show
// only under All, with no actions.
type WoRow = StockRequest & {
  status: string; qty: number; overdue: boolean
  /** Earliest required date across the request's lines — the column the overdue
      note belongs under, because that is the date being missed. */
  requiredDate: string
  woStartDate: string; destinationWarehouse: string; actionable: boolean
  /** Everyone who has changed a line on this request (OPEN-17) — per line, so a
      request can name several people; searched and displayed as one list. */
  requestors: string
}
const woRows = computed<WoRow[]>(() =>
  sourceRequests.value
    .filter(isOnDashboard)
    .filter(r => isTerminalTab.value ? isTerminalRequest(r) : isAwaitingTab(r))
    .map(r => {
      const w = workOrderFor(r)
      return {
        ...r,
        // The dashboard shows the WORK ORDER's status, not the readiness rollup —
        // except on the terminal tab, where what put the row there is the REQUEST's
        // own status. A row sitting under "Rejected / canceled" while its badge
        // read "In progress" (the job runs on; its extra demand was declined)
        // looked like a filter bug.
        status: (isTerminalTab.value ? stockRequestStatus(r) : (w?.status ?? stockRequestStatus(r))) as string,
        qty: requestRequiredQty(r),
        overdue: isOverdue(r, TODAY_ISO),
        requiredDate: [...r.lines].map(l => l.requiredDate).sort()[0] ?? r.requestDate,
        woStartDate: w?.planStartDate ?? r.requestDate,
        destinationWarehouse: [...new Set(r.lines.map(l => l.destinationWarehouse))].join(', '),
        actionable: isActionable(r),
        requestors: [...new Set(r.lines.map(l => l.requestor))].join(', '),
      }
    })
    .sort((a, b) => b.requestDate.localeCompare(a.requestDate)),
)

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<WoRow>(woRows, {
  perPage: 25,
  filterFn: (row, s, status) => matchesWoRow(row, s, status),
})

function matchesWoRow(row: WoRow, s: string, status: string): boolean {
  const matchesSearch = !s
    || row.workOrderNumber.toLowerCase().includes(s)
    || row.requestors.toLowerCase().includes(s)
    || row.lines.some(l => l.product.toLowerCase().includes(s) || l.sku.toLowerCase().includes(s))
  const matchesStatus = !status || row.status === status
  const matchesQuickDate = dateFilterMatches(row.requestDate, dateFilter.value, TODAY)

  const f = appliedFilters
  const kw = f.keyword.toLowerCase().trim()
  const matchesKeyword = !kw
    || row.workOrderNumber.toLowerCase().includes(kw)
    || row.requestors.toLowerCase().includes(kw)
    || row.lines.some(l => l.product.toLowerCase().includes(kw) || l.sku.toLowerCase().includes(kw))
  const matchesDrawerStatus = f.status.length === 0 || f.status.includes(row.status)
  const matchesDrawerDate = matchesDateRange(row.requestDate, f.requestDate)

  return matchesSearch && matchesStatus && matchesQuickDate
    && matchesKeyword && matchesDrawerStatus && matchesDrawerDate
}

// ─── Rows — By product (W-1, W-2, W-5) ─────────────────────────────────────────
// Status is NOT applied to the requests first: a SKU's status is its own rollup,
// so it is matched after aggregation. The date range filters component lines by
// *required* date (W-5); the WO view filters by request date instead.
const skuRows = computed<SkuDemandGroup[]>(() => {
  const s = search.value.trim().toLowerCase()
  const kw = appliedFilters.keyword.trim().toLowerCase()
  const inScope = sourceRequests.value
    .filter(isOnDashboard)
    .filter(r => isTerminalTab.value ? isTerminalRequest(r) : isAwaitingTab(r))
    .filter(r => dateFilterMatches(r.requestDate, dateFilter.value, TODAY))
  const lineFilter = (line: StockRequestLine) => matchesDateRange(line.requiredDate, appliedFilters.requestDate)

  return skuDemandGroups(inScope, lineFilter)
    .filter(g => !s || `${g.product} ${g.sku}`.toLowerCase().includes(s)
      || g.entries.some(e => e.workOrderNumber.toLowerCase().includes(s)))
    .filter(g => !kw || `${g.product} ${g.sku}`.toLowerCase().includes(kw))
    .filter(g => !statusFilter.value || g.status === statusFilter.value)
    .filter(g => appliedFilters.status.length === 0 || appliedFilters.status.includes(g.status))
})

// The SKU view aggregates its own rows, so it carries its own page state rather
// than useTableState's (which is bound to the work-order rows).
const skuTotal = computed(() => skuRows.value.length)
const skuPage = ref(1)
const skuPerPage = ref(25)
const skuPaginated = computed(() =>
  skuRows.value.slice((skuPage.value - 1) * skuPerPage.value, skuPage.value * skuPerPage.value),
)
watch(skuTotal, () => {
  const lastPage = Math.max(1, Math.ceil(skuTotal.value / skuPerPage.value))
  if (skuPage.value > lastPage) skuPage.value = lastPage
})

// ─── Filter state shared by both views ─────────────────────────────────────────
watch(appliedFilters, () => setPage(1))
watch([dateFilter, view, isTerminalTab], () => { setPage(1); skuPage.value = 1 })

const activeFilterCount = computed(() => {
  const f = appliedFilters
  let n = 0
  if (f.keyword) n++
  if (f.status.length > 0) n++
  if (f.requestDate) n++
  return n
})
const isDrawerFilterActive = computed(() => activeFilterCount.value > 0)
const hasActiveFilter = computed(() =>
  !!search.value || !!statusFilter.value || !!dateFilter.value || isDrawerFilterActive.value)

function clearFilters() {
  search.value = ''
  statusFilter.value = ''
  dateFilter.value = null
  Object.assign(appliedFilters, emptyStockRequestFilters())
}

// Switching to the terminal tab takes its Status and All-filters controls away,
// so anything already set through them is cleared with it — a filter nobody can
// see is a filter nobody can undo.
watch(isTerminalTab, (terminal) => {
  if (!terminal) return
  statusFilter.value = ''
  Object.assign(appliedFilters, emptyStockRequestFilters())
})

// ─── First-load skeleton (page/per-page skeletons are ErpTablePage's own job) ──
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

const emptyIllustration = '/illustrations/empty-folder.png'

// ─── SKU rows: accordion expand — every component starts collapsed ─────────────
const expanded = reactive<Record<string, boolean>>({})
function toggleExpand(key: string) { expanded[key] = !expanded[key] }

// ─── Row actions (W-1 row menu, W-7 reject) ────────────────────────────────────
// "View details" opens the stock request; the work order is one click further in.
function viewDetails(requestId: string) { router.push(`/stock-requests/${requestId}`) }
function reserve(req: StockRequest) {
  const qty = reserveStock(req.id, { source: 'stock-request' })
  if (qty === undefined) {
    toast.notify({ variant: 'error', title: t('Failed to reserve. No stock at the destination warehouse'), maxWidth: 'max-content' })
    return
  }
  toast.notify({ variant: 'success', title: `${qty} ${t('unit reserved for')} ${req.workOrderNumber}`, maxWidth: 'max-content' })
}
// The two groupings raise documents from different scopes, so they pass
// different params: a transaction row carries a request id, a product row
// carries the component whose demand is short across every open request.
function createWarehouseTransfer(query: Record<string, string>) {
  router.push({ path: '/warehouse-transfers/new', query })
}
function createPurchaseRequest(query: Record<string, string>) {
  router.push({ path: '/purchase-requests/new', query })
}
const byRequest = (requestId: string) => ({ fromStockRequest: requestId })

/**
 * W-1 — reserve one COMPONENT across every open transaction that needs it, which
 * is the action the by-product view is for: the stockist is settling a component's
 * demand, not one job's. Each line takes what its destination can give.
 */
function reserveComponent(group: SkuDemandGroup) {
  const r = reserveProductEverywhere(group.productId)
  if (r.qty === 0) {
    toast.notify({
      variant: 'error',
      title: t('Failed to reserve. No stock at the destination warehouse'),
      maxWidth: 'max-content',
    })
    return
  }
  const parts = [`${r.qty} ${t('unit reserved for')} ${r.transactions} ${r.transactions === 1 ? t('transaction') : t('transactions')}`]
  if (r.skipped > 0) parts.push(`${r.skipped} ${t('line still short')}`)
  toast.notify({ variant: 'success', title: parts.join(' · '), maxWidth: 'max-content' })
}

/**
 * W-7 from a product row — decline the tagged lines this component has across the
 * open transactions. Original component lines are never rejectable, so a row with
 * no tagged line offers nothing.
 */
const rejectableEntries = (group: SkuDemandGroup) =>
  group.entries.filter(e => e.tag && !e.rejected)

function rejectComponent(group: SkuDemandGroup) {
  let count = 0
  for (const entry of rejectableEntries(group)) {
    const req = stockRequests.find(r => r.id === entry.requestId)
    const line = req?.lines.find(l => l.productId === group.productId && l.tag === entry.tag && !l.rejected)
    if (req && line && rejectRequestLine(req.id, line)) count++
  }
  if (count === 0) return
  toast.notify({
    variant: 'success',
    title: `${count} ${count === 1 ? t('line rejected') : t('lines rejected')} — ${group.product}`,
    maxWidth: 'max-content',
  })
}
const byComponent = (productIds: string[]) => ({ fromComponent: productIds.join(',') })
/**
 * W-7 — rejection is per LINE: only Additional stock and Adjustment lines can be
 * declined, never the components the work order itself committed to. From the
 * transaction row this declines every line on the request that is eligible.
 */
function reject(req: StockRequest) {
  const rejectable = req.lines.filter(canRejectLine)
  if (rejectable.length === 0) return
  for (const line of rejectable) rejectRequestLine(req.id, line)
  toast.notify({
    variant: 'success',
    title: `${rejectable.length} ${rejectable.length === 1 ? t('line rejected on') : t('lines rejected on')} ${req.workOrderNumber}`,
    maxWidth: 'max-content',
  })
}

// Row casts for the template — ErpTablePage hands every row back as a plain
// record, and this page feeds it two different row shapes depending on the view.
function sku(row: unknown): SkuDemandGroup { return row as SkuDemandGroup }
function wo(row: unknown): WoRow { return row as WoRow }

/** The distinct tags a request's LINES carry (W-7) — its "Request type" column. */
function lineTags(row: WoRow): StockRequestLineTag[] {
  return [...new Set(row.lines.map(l => l.tag).filter(Boolean))] as StockRequestLineTag[]
}

function selectedSkuIds(sel: Set<number>): string[] {
  return [...sel].map(i => skuPaginated.value[i]?.productId).filter(Boolean) as string[]
}

// Pagination is routed to whichever view is showing.
function onPageChange(page: number) {
  if (view.value === 'product') skuPage.value = page
  else setPage(page)
}
function onPerPageChange(n: number) {
  if (view.value === 'product') { skuPerPage.value = n; skuPage.value = 1 }
  else setPerPage(n)
}

// ─── Export ───────────────────────────────────────────────────────────────────
const exportOpen = ref(false)
const exportColumns = computed(() => {
  const cols = view.value === 'product' ? skuColumns : allWoCols
  return cols.map(c => ({ key: c.key, label: c.label, ...(c.key === cols[0]!.key ? { required: true } : {}) }))
})
</script>

<template>
  <ErpTablePage
    data-devchange="sr-requested-tab"
    align-top
    :columns="view === 'product' ? visibleSkuColumns : visibleWoColumns"
    :rows="(view === 'product' ? skuPaginated : paginated) as unknown as Record<string, unknown>[]"
    :total="view === 'product' ? skuTotal : total"
    :current-page="view === 'product' ? skuPage : currentPage"
    :per-page="view === 'product' ? skuPerPage : perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    :loading="loading"
    :has-active-filter="hasActiveFilter"
    :search="search"
    :filter-empty-label="view === 'product' ? 'component' : 'stock request'"
    :has-checkbox="view === 'product'"
    bulk-label="component"
    @page-change="onPageChange"
    @per-page-change="onPerPageChange"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >
    <!-- ── View switch (W-1) — above the filter bar, because it changes what a row
         IS rather than which rows pass (rule/segmented-control-pill). ── -->
    <template #stats>
      <div class="sr-viewbar">
        <MpSegmentedControl id="sr-group-by" name="sr-group-by" v-model="view" :data="viewOptions" />
      </div>
    </template>

    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <!-- The Rejected / canceled tab IS a status filter, and the All-filters
             drawer only adds status and keyword on top of it. Both are hidden
             there rather than disabled: a control that can only narrow a list to
             itself is one to take away, not to grey out. -->
        <ErpFilterSelect
          v-if="!isTerminalTab" id="sr-status" v-model="statusFilter"
          :placeholder="t('Status')" :options="stockRequestStatusOptions"
        />
        <AdvanceDateFilter id="sr-date-filter" v-model="dateFilter" :today="TODAY" :placeholder="t('Request date')" />
        <MpButton
          v-if="!isTerminalTab"
          variant="secondary" left-icon="filter" is-rounded
          class="filter-all-btn" :class="{ 'filter-all-btn--active': isDrawerFilterActive }"
          @click="filtersOpen = true"
        >{{ t('All filters') }}{{ activeFilterCount > 0 ? ` (${activeFilterCount})` : '' }}</MpButton>
      </div>

      <!-- rule/filter-bar-icon-group, rule/filter-bar-search-export -->
      <div class="filter-right">
        <MpButtonGroup class="filter-btn-group">
          <MpTooltip :label="t('Ask Airene')" placement="bottom">
            <MpButton class="filter-airene-btn" variant="ghost" left-icon="airene-brand" :aria-label="t('Ask Airene')" is-rounded @click="toggleAirene?.()" />
          </MpTooltip>
          <ColumnSettingsMenu id="sr-columns" :items="columnItems" :visibility="columnVisibility" />
          <MpTooltip :label="t('Export')" placement="bottom">
            <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded @click="exportOpen = true" />
          </MpTooltip>
        </MpButtonGroup>

        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')">
          <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
            <MpIcon name="close" size="sm" />
          </button>
        </div>
      </div>
    </template>

    <!-- Bulk (SKU view) — one document covering every selected component (W-8) -->
    <template #bulk-actions="{ selectedRows }">
      <MpPopover id="sr-bulk-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
        <MpPopoverTrigger>
          <MpButton size="sm" variant="secondary" right-icon="chevrons-down" is-rounded>{{ t('Actions') }}</MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem @click="createPurchaseRequest(byComponent(selectedSkuIds(selectedRows as Set<number>)))">{{ t('Create purchase request') }}</MpPopoverListItem>
            <MpPopoverListItem @click="createWarehouseTransfer(byComponent(selectedSkuIds(selectedRows as Set<number>)))">{{ t('Create warehouse transfer') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ══ By product ════════════════════════════════════════════════════════ -->

    <!-- Product name — the first column, so it carries the accordion toggle -->
    <template #cell-product="{ row }">
      <span
        class="sr-component" role="button"
        :aria-expanded="!!expanded[sku(row).key]"
        @click.stop="toggleExpand(sku(row).key)"
      >
        <span class="sr-component-main">
          <span class="sr-component-name" :title="sku(row).product">{{ sku(row).product }}</span>
          <span class="sr-expand" :class="{ 'sr-expand--open': expanded[sku(row).key] }" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
        </span>
      </span>
      <!-- W-6 — stock went minus after a backdated transaction -->
      <span v-if="sku(row).backdate" class="sr-note">
        <MpIcon name="warning" size="sm" />
        {{ t('Stock minus after recalculation') }} — {{ sku(row).backdate!.transaction }}
      </span>
    </template>

    <template #cell-sku="{ row }">
      <span class="cell-text">{{ sku(row).sku }}</span>
    </template>

    <template #cell-destinationWarehouse="{ row }">
      <span class="cell-text">{{ view === 'product' ? sku(row).destinationWarehouse : wo(row).destinationWarehouse }}</span>
    </template>

    <template #cell-earliestRequired="{ row, value }">
      {{ formatDate(value as string) }}
      <!-- W-7 — overdue reads the same in both views; a product row is demand too,
           and the note sits under the date that has passed. -->
      <p v-if="sku(row).overdue" class="sr-note">{{ t('Overdue') }}</p>
    </template>
    <template #cell-openWorkOrders="{ row }">{{ sku(row).openWorkOrders }}</template>
    <template #cell-required="{ row }">{{ sku(row).required }} {{ sku(row).unit }}</template>
    <template #cell-reserved="{ row }">{{ sku(row).reserved }} {{ sku(row).unit }}</template>
    <template #cell-consumed="{ row }">
      {{ sku(row).consumed > 0 ? `${sku(row).consumed} ${sku(row).unit}` : '—' }}
    </template>

    <!-- Remaining = Required − Reserved − Consumed (W-2). Consumed counts as
         covered, so a partly issued line never reads as under-reserved. -->
    <template #cell-remaining="{ row }">
      <span :class="{ 'sr-short': sku(row).remaining > 0 }">
        {{ sku(row).remaining > 0 ? `${sku(row).remaining} ${sku(row).unit}` : '—' }}
      </span>
    </template>

    <!-- Available — minus and red once a backdated transaction pushed it under zero (W-6) -->
    <template #cell-available="{ row }">
      <span :class="{ 'sr-short': sku(row).available < 0 }">{{ sku(row).available }} {{ sku(row).unit }}</span>
    </template>

    <!-- Expanded rows. Product view lists the work orders behind this SKU at this
         warehouse; order view lists the SKUs the work order needs (story 2). -->
    <template #row-extra="{ row, columns: cols, showSpacer }">
      <template v-if="view === 'product'">
        <tr
          v-for="entry in (expanded[sku(row).key] ? sku(row).entries : [])"
          :key="`${sku(row).key}-${entry.workOrderId}`"
          class="sr-child"
        >
          <td v-for="col in cols" :key="col.key" class="sr-child-td" :class="{ 'sr-child-td--right': col.align === 'right' }">
            <template v-if="col.key === 'lane'" />
            <!-- The work order sits under the first data column, which is now
                 Product name — a breakdown row names its transaction first. -->
            <span v-else-if="col.key === 'product'" class="sr-child-wo">
              <span class="cell-link cell-text" @click="viewDetails(entry.requestId)">{{ entry.workOrderNumber }}</span>
            </span>
            <!-- Requestor: who last CHANGED this line's demand (OPEN-17). -->
            <span v-else-if="col.key === 'sku'" class="cell-text" :title="entry.requestor">{{ entry.requestor }}</span>
            <!-- W-7 — the line's own tag, under the Request type column. -->
            <span v-else-if="col.key === 'lineTags'">
              <span v-if="entry.tag" class="sr-tag" :class="`sr-tag--${entry.tag}`">{{ entry.tag === 'additional' ? t('Additional stock') : t('Adjustment') }}</span>
              <span v-else class="sr-muted">—</span>
            </span>
            <template v-else-if="col.key === 'earliestRequired'">{{ formatDate(entry.requiredDate) }}</template>
            <template v-else-if="col.key === 'required'">{{ entry.qty }} {{ sku(row).unit }}</template>
            <template v-else-if="col.key === 'reserved'">{{ entry.covered }} {{ sku(row).unit }}</template>
            <template v-else-if="col.key === 'available'">{{ entry.destAvailable }} {{ sku(row).unit }}</template>
            <template v-else-if="col.key === 'status'">
              <ErpStatusBadge :status="entry.status" />
            </template>
          </td>
          <td v-if="showSpacer" class="sr-child-td sr-child-td--spacer" />
          <td class="sr-child-td sr-child-td--actions" />
        </tr>
      </template>

      <template v-else>
        <tr
          v-for="line in (expanded[wo(row).id] ? wo(row).lines : [])"
          :key="`${wo(row).id}-${line.productId}`"
          class="sr-child"
        >
          <td v-for="col in cols" :key="col.key" class="sr-child-td" :class="{ 'sr-child-td--right': col.align === 'right' }">
            <!-- The component name wraps rather than truncating: a breakdown row
                 may be taller than its parent, and the name is the thing the
                 stockist is reading. -->
            <span v-if="col.key === 'workOrderNumber'" class="sr-child-sku">
              <span class="sr-child-sku-name">{{ line.product }}</span>
              <span class="sr-child-sku-code">{{ line.sku }}</span>
            </span>
            <!-- Each cell now means on a line what its header means on the request
                 above it: the line's own tag, qty, required date, readiness and
                 destination. No borrowed columns, so no component quantity sitting
                 under a date header. -->
            <span v-else-if="col.key === 'lineTags'">
              <span v-if="line.tag" class="sr-tag" :class="`sr-tag--${line.tag}`">
                {{ line.tag === 'additional' ? t('Additional stock') : t('Adjustment') }}
              </span>
              <span v-else>—</span>
            </span>
            <span v-else-if="col.key === 'qty'" class="cell-text">{{ line.qty }} {{ line.unit }}</span>
            <span v-else-if="col.key === 'requiredDate'" class="cell-text">
              {{ formatDate(line.requiredDate) }}
              <span v-if="isLineOverdue(line, TODAY_ISO)" class="sr-note">{{ t('Overdue') }}</span>
            </span>
            <span v-else-if="col.key === 'woStartDate'" class="cell-text">—</span>
            <span v-else-if="col.key === 'destinationWarehouse'" class="cell-text" :title="line.destinationWarehouse">{{ line.destinationWarehouse }}</span>
          </td>
          <td v-if="showSpacer" class="sr-child-td sr-child-td--spacer" />
          <td class="sr-child-td sr-child-td--actions" />
        </tr>
      </template>
    </template>

    <!-- ══ By transaction ════════════════════════════════════════════════════ -->

    <!-- Transaction — the originating work order plus its request tag (W-7) -->
    <template #cell-workOrderNumber="{ row }">
      <span class="sr-txn">
        <span class="sr-expand" :class="{ 'sr-expand--open': expanded[wo(row).id] }" role="button"
              :aria-label="expanded[wo(row).id] ? t('Collapse') : t('Expand')" @click.stop="toggleExpand(wo(row).id)">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
        <!-- The header says "Work order number", so the cell carries the number
             alone — repeating "Work order" on every row only ate the column. -->
        <span class="cell-link cell-text" @click.stop="viewDetails(wo(row).id)">{{ wo(row).workOrderNumber }}</span>
      </span>
    </template>

    <!-- W-7 — a tag is a property of a LINE, never of the request or the product
         above it. The parent row leaves this column empty and each breakdown row
         shows its own; chips on the parent only ever summarised what the rows
         underneath already say, two lines taller. -->
    <template #cell-lineTags>
      <span class="sr-muted" data-devchange="sr-request-type">—</span>
    </template>

    <template #cell-woStartDate="{ row }">{{ formatDate(wo(row).woStartDate) }}</template>

    <template #cell-qty="{ row }">{{ wo(row).qty }}</template>

    <!-- W-7 — the overdue note belongs under the date being missed. -->
    <template #cell-requiredDate="{ row }">
      {{ formatDate(wo(row).requiredDate) }}
      <p v-if="wo(row).overdue" class="sr-note">{{ t('Overdue') }}</p>
    </template>

    <template #cell-lastUpdated="{ row }">
      <LastUpdatedCell v-bind="lastUpdatedFor((row as Record<string, unknown>).id as string)" />
    </template>

    <!-- ══ Shared ════════════════════════════════════════════════════════════ -->

    <!-- Status — the WORK ORDER's status, in the transaction view only. A product
         row aggregates several transactions whose statuses differ, so one rolled-up
         badge there claimed more than the row knows; the breakdown rows carry the
         status instead. The badge alone: overdue is not a status, it is a date that
         has passed, so it sits under the date it passed (W-7). -->
    <template #cell-status="{ row }">
      <ErpStatusBadge v-if="view === 'transaction'" :status="wo(row).status" />
      <!-- The em dash is deliberate: an empty cell would fall through to
           ErpTablePage's raw-value fallback and print the unformatted status. -->
      <span v-else class="sr-muted">—</span>
    </template>

    <!-- Full empty state — no CTA: requests are raised by work orders (see header).
         The description carries the tab's own modifier, so an empty Rejected /
         canceled tab doesn't read as "no stock requests at all". -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240">
        <p class="empty-full-title">{{ t('No stock request') }}</p>
        <p class="empty-full-desc">
          {{ isTerminalTab
            ? t('Rejected and canceled stock requests will appear here.')
            : t('Stock requests awaiting fulfillment will appear here.') }}
        </p>
      </div>
    </template>

    <!-- Actions — View details always first (rule/table-actions-no-tooltip) -->
    <template #actions="{ row }">
      <MpPopover :id="`sr-actions-${view}-${view === 'product' ? sku(row).key : wo(row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <!-- SKU row — raise one document for this component, or open its work orders -->
          <template v-if="view === 'product'">
            <MpPopoverList data-devchange="sr-product-actions">
              <MpPopoverListItem v-if="sku(row).remaining > 0" @click="reserveComponent(sku(row))">{{ t('Reserve stock') }}</MpPopoverListItem>
              <MpPopoverListItem @click="createPurchaseRequest(byComponent([sku(row).productId]))">{{ t('Create purchase request') }}</MpPopoverListItem>
              <MpPopoverListItem @click="createWarehouseTransfer(byComponent([sku(row).productId]))">{{ t('Create warehouse transfer') }}</MpPopoverListItem>
              <MpPopoverListItem @click="toggleExpand(sku(row).key)">{{ expanded[sku(row).key] ? t('Hide transactions') : t('Show transactions') }}</MpPopoverListItem>
            </MpPopoverList>
            <template v-if="rejectableEntries(sku(row)).length">
              <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
              <MpPopoverList>
                <MpPopoverListItem :class="css({ color: 'var(--mp-text-critical)' })" @click="rejectComponent(sku(row))">{{ t('Reject added lines') }}</MpPopoverListItem>
              </MpPopoverList>
            </template>
          </template>

          <!-- Work order row -->
          <template v-if="view === 'transaction'">
            <MpPopoverList>
              <MpPopoverListItem @click="viewDetails(wo(row).id)">{{ t('View details') }}</MpPopoverListItem>
              <template v-if="!wo(row).rejected && wo(row).status !== 'reserved' && wo(row).status !== 'issued / picked'">
                <MpPopoverListItem @click="reserve(wo(row))">{{ t('Reserve stock') }}</MpPopoverListItem>
                <MpPopoverListItem @click="createWarehouseTransfer(byRequest(wo(row).id))">{{ t('Create warehouse transfer') }}</MpPopoverListItem>
                <MpPopoverListItem @click="createPurchaseRequest(byRequest(wo(row).id))">{{ t('Create purchase request') }}</MpPopoverListItem>
              </template>
            </MpPopoverList>
            <template v-if="canReject(wo(row))">
              <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
              <MpPopoverList>
                <MpPopoverListItem :class="css({ color: 'var(--mp-text-critical)' })" @click="reject(wo(row))">{{ t('Reject request') }}</MpPopoverListItem>
              </MpPopoverList>
            </template>
          </template>
        </MpPopoverContent>
      </MpPopover>
    </template>
  </ErpTablePage>

  <StockRequestFiltersDrawer
    id="sr-allfilters"
    :is-open="filtersOpen"
    :model-value="appliedFilters"
    :status-options="stockRequestStatusOptions"
    @update:is-open="filtersOpen = $event"
    @apply="applyDrawerFilters"
  />

  <ExportModal
    :open="exportOpen" :title="t('Export stock requests')" entity-label="stock requests"
    :columns="exportColumns" :total="view === 'product' ? skuTotal : total"
    @close="exportOpen = false" @export="exportOpen = false"
  />

  <!-- ── Prototype scenario FAB (bottom-right): populated vs empty ── -->
  <ScenarioFab v-model="previewMode" />
</template>

<style scoped>
/* ── Cell helpers ───────────────────────────────────────────────────────── */
.cell-text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; max-width: 100%; }
.sr-txn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; flex-wrap: wrap; }

/* Component cell — name over SKU, with the accordion chevron */
.sr-component { display: flex; flex-direction: column; min-width: 0; cursor: pointer; }
/* The name takes the room and the chevron holds the right edge, so every row's
   toggle sits on one line instead of drifting with the length of the name. */
.sr-component-main { display: flex; align-items: center; gap: var(--mp-spacing-1); min-width: 0; width: 100%; }
.sr-expand {
  display: inline-flex; flex-shrink: 0; margin-left: auto;
  color: var(--mp-text-subtle, #656f80); transition: transform 150ms ease;
}
.sr-expand--open { transform: rotate(180deg); }
.sr-component:hover .sr-expand { color: var(--mp-text-default, #080d0e); }
/* Table body text is regular weight, never semibold (docs/table-design.md). */
.sr-component-name { color: var(--mp-text-default, #080d0e); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sr-component-sku { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary, #3a4749); }

/* A shortfall, a negative Available, and an outstanding child line all read red */
.sr-short { color: var(--mp-text-critical, #a8352d); font-weight: var(--mp-font-weights-semi-bold); }

/* Note under a status badge — overdue reminder (W-7) / backdate flag (W-6) */
.sr-note {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-1);
  margin: var(--mp-spacing-1) 0 0; min-width: 0;
  font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-critical, #a8352d);
  /* The status column is a fixed-width `kind` — let the note wrap and grow the
     row instead of overflowing into the next column. */
  white-space: normal; overflow-wrap: anywhere;
}
.sr-note :deep(svg) { flex-shrink: 0; }

/* Request tags (W-7) */
.sr-tag {
  display: inline-flex; align-items: center; flex-shrink: 0;
  padding: 0 var(--mp-spacing-2); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  white-space: nowrap;
}
.sr-tag--additional { background: var(--mp-background-warning-subtle, #fff3e0); color: var(--mp-text-warning, #a35200); }
.sr-tag--adjustment { background: var(--mp-background-information-subtle, #eaf2fd); color: var(--mp-text-link, #165082); }
/* A request can carry both tags; they wrap inside their own column. */
.sr-tag-list { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-1); }
/* An empty cell still needs a mark, or the column reads as broken rather than blank. */
.sr-muted { color: var(--mp-text-secondary, #3a4749); }

/* Per-WO breakdown rows under an expanded component */
/* Child cells mirror ErpTablePage's .erp-td metrics so they line up under the same
   headers. They can't reuse that class: it lives in ErpTablePage's OWN scoped
   style, and slot content carries this component's scope id instead. The cell
   COUNT must equal the parent row's or the <colgroup> stops lining up. */
.sr-child-td {
  height: var(--mp-sizes-10);
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-4) var(--mp-spacing-2\.5) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary, #3a4749);
  vertical-align: top;
  white-space: nowrap;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-bottom: 1px solid var(--mp-border-subtle, #e5e7e7);
}
.sr-child-td--right {
  text-align: right;
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-2) var(--mp-spacing-2\.5) var(--mp-spacing-4);
  font-variant-numeric: tabular-nums;
}
.sr-child-td--spacer { padding: 0; min-width: 0; }
/* The actions column is sticky-right on parent rows (ErpTablePage's .erp-td--fixed).
   A breakdown row renders its own cells, so it has to repeat that here — otherwise
   the column detaches from its header and from the rows above as soon as the table
   scrolls sideways. The separator border follows the same "only while actually
   overflowing" rule the parent uses. */
.sr-child-td--actions {
  position: sticky; right: 0; z-index: 1;
  width: var(--erp-actions-width, 44px);
  min-width: var(--erp-actions-width, 44px);
  max-width: var(--erp-actions-width, 44px);
  text-align: center; vertical-align: top; padding: var(--mp-sizes-0\.5, 2px) 3px;
}
.erp-table-wrapper.is-overflowing .sr-child-td--actions {
  box-shadow: inset 1px 0 0 0 var(--mp-border-default, #e3e7e9); /* pixel-police-allow-shadow */
}
.has-ai .sr-child-td--actions { right: var(--mp-sizes-7); }
/* Indent the first cell so the child reads as nested under its component. */
.sr-child-td:first-child { padding-left: var(--mp-spacing-8); }
.sr-child-sku { display: flex; flex-direction: column; min-width: 0; }
.sr-child-sku-name {
  color: var(--mp-text-default, #080d0e);
  white-space: normal; overflow-wrap: anywhere;
}
.sr-child-sku-code { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary, #3a4749); }
.sr-child-wo { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
/* A breakdown cell labels its own value, because the header above it describes
   the parent row, not this one. */
.sr-child-field { display: flex; flex-direction: column; min-width: 0; }
.sr-child-label {
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary, #3a4749);
  white-space: nowrap;
}
.sr-child-state { white-space: nowrap; }
.sr-covered { color: var(--mp-text-success, #186f4a); }

/* ── View switch ──────────────────────────────────────────────────────────
   Sits in ErpTablePage's #stats slot, which is the band above the filter bar.
   That slot is built for stat tiles and carries their bottom margin, so the
   gap is reset to a normal control gap here. */
.sr-viewbar { display: flex; align-items: center; }
:deep(.erp-stats-bar) { margin-bottom: var(--mp-spacing-4); }

/* ── Filter bar ───────────────────────────────────────────────────────────
   Only `.filter-search` is global (erp.css); the group layout is per page.
   Both groups wrap with a real row gap instead of being squeezed edge-to-edge
   once the bar runs out of room. */
/* 8px between controls, matching the Production request filter bar. `flex: 0 0 auto`
   keeps the left group from wrapping while the right still has width to give — the
   search shrinks first, and only once it hits its floor do the groups wrap. */
.filter-left {
  display: flex; align-items: center; flex-wrap: wrap; flex: 0 0 auto;
  column-gap: var(--mp-spacing-2); row-gap: var(--mp-spacing-2);
}
.filter-right {
  display: flex; align-items: center; flex-wrap: wrap; justify-content: flex-end;
  flex: 1 1 auto; min-width: 0;
  column-gap: var(--mp-spacing-2); row-gap: var(--mp-spacing-2);
}
.filter-divider {
  width: 0; height: var(--mp-sizes-5, 20px); flex-shrink: 0;
  border-left: 1px solid var(--mp-border-default, #e3e7e9);
}

.filter-all-btn { white-space: nowrap; }
.filter-all-btn--active {
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-color: var(--mp-border-bold, #8c9596);
  color: var(--mp-text-default, #080d0e);
}

.filter-btn-group { display: flex; align-items: center; }
/* icon tools sit 8px apart (MpButtonGroup default) — rule/btn-group-gap-8 */
.filter-btn-group :deep(.mp-pixel-button-group) { gap: var(--mp-spacing-2); }
.filter-airene-btn :deep(svg) { color: var(--mp-airene-default, #6938ef); }

/* The search gives up ~48px before anything wraps, so the whole bar still fits on
   one row at 1280px; below that the groups wrap on the row-gap above. */
.filter-search { flex: 1 1 248px; min-width: 200px; max-width: 248px; }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

/* ── Full empty state ───────────────────────────────────────────────────── */
.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: auto; height: 240px; object-fit: contain; }
.empty-full-title {
  margin: 0 0 var(--mp-spacing-0\.5);
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default, #080d0e);
}
.empty-full-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary, #3a4749); }
</style>
