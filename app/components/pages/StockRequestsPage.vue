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
  MpPopoverList, MpPopoverListItem, MpIcon, MpTooltip, toast, css,
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
  requestRequiredQty, needsAction, isOverdue, reserveStock, rejectRequest, canReject,
  type StockRequest, type StockRequestLine, type SkuDemandGroup,
} from '~/data/stockRequests'

const toggleAirene = inject<() => void>('toggleAirene')
const { t } = useLocale()
const route = useRoute()
const router = useRouter()

// ─── Tabs (W-4) — page-level status tabs from `pageTabs` in [...slug].vue, driven
// by ?tab=. "Requested" (default) shows rows that aren't fully covered. ─────────
const showAll = computed(() => route.query.tab === 'All')

// ─── Group by (W-1) — By product is the default. A dropdown rather than a
// segmented control: two long labels eat the filter bar, and this is a "pick one
// of a list" choice, not a 2-state switch. Not clearable — there is always a
// grouping.
//
// The second grouping is by TRANSACTION, not by work order: a stock request is
// raised by whatever transaction needs the material, and a work order is simply
// the only kind that raises one today. Each row names its own type ("Work order
// WO-2026-0001"), so the view keeps reading correctly as more types are added
// without renaming anything. ─────────────────────────────────────────────────
type GroupBy = 'product' | 'transaction'
const view = ref<GroupBy>('product')
const viewOptions = [
  { label: t('By product'),     value: 'product'     },
  { label: t('By transaction'), value: 'transaction' },
]

// ─── Columns — semantic `kind`s only, no pixel widths (rule/table-column-kind) ──
// By transaction (W-2 covers the product view; this one mirrors the request record).
const woColumns: TableColumn[] = [
  { key: 'workOrderNumber', label: t('Transaction'),  kind: 'number', sortable: true, sortType: 'text'   },
  { key: 'qty',             label: t('Qty'),                          sortable: true, sortType: 'number', align: 'right' },
  { key: 'requestDate',     label: t('Request date'), kind: 'date',   sortable: true, sortType: 'date'   },
  { key: 'requestor',       label: t('Requestor'),    kind: 'name',   sortable: true, sortType: 'text'   },
  { key: 'status',          label: t('Status'),       kind: 'status',                 sortType: 'text'   },
]
// By product (W-2) — Available sits left of Status; quantities right-aligned.
const skuColumns: TableColumn[] = [
  // Lane — the row checkbox and the child-row indent gutter, same idea as the
  // Production request table's 56px thumbnail lane. Layout column, so it keeps an
  // explicit width rather than a semantic `kind`.
  { key: 'lane',             label: '',                     width: '56px', noHeader: true },
  { key: 'product',          label: t('Component'),         kind: 'name', sortable: true, sortType: 'text'   },
  { key: 'openWorkOrders',   label: t('Open WOs'),                        sortable: true, sortType: 'number', align: 'right' },
  { key: 'earliestRequired', label: t('Earliest required'), kind: 'date', sortable: true, sortType: 'date'   },
  { key: 'required',         label: t('Required'),                        sortable: true, sortType: 'number', align: 'right' },
  { key: 'reserved',         label: t('Reserved'),                        sortable: true, sortType: 'number', align: 'right' },
  { key: 'remaining',        label: t('Remaining'),                       sortable: true, sortType: 'number', align: 'right' },
  { key: 'available',        label: t('Available'),                       sortable: true, sortType: 'number', align: 'right' },
  { key: 'status',           label: t('Status'),            kind: 'status',              sortType: 'text'   },
]

// Column show/hide — first column always on; "Last updated" is opt-in (off by default).
const allWoCols: TableColumn[] = [...woColumns, { key: 'lastUpdated', label: t('Last updated'), kind: 'date' }]
const columnVisibility = reactive<Record<string, boolean>>(
  Object.fromEntries(allWoCols.map(c => [c.key, c.key !== 'lastUpdated'])),
)
const columnItems = allWoCols.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleWoColumns = computed<TableColumn[]>(() => allWoCols.filter(c => columnVisibility[c.key]))
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
type WoRow = StockRequest & { status: string; qty: number; overdue: boolean }
const woRows = computed<WoRow[]>(() =>
  sourceRequests.value
    .map(r => ({
      ...r,
      status: stockRequestStatus(r) as string,
      qty: requestRequiredQty(r),
      overdue: isOverdue(r, TODAY_ISO),
    }))
    .filter(r => showAll.value || needsAction(r))
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
    || row.requestor.toLowerCase().includes(s)
    || row.lines.some(l => l.product.toLowerCase().includes(s) || l.sku.toLowerCase().includes(s))
  const matchesStatus = !status || row.status === status
  const matchesQuickDate = dateFilterMatches(row.requestDate, dateFilter.value, TODAY)

  const f = appliedFilters
  const kw = f.keyword.toLowerCase().trim()
  const matchesKeyword = !kw
    || row.workOrderNumber.toLowerCase().includes(kw)
    || row.requestor.toLowerCase().includes(kw)
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
  const inScope = sourceRequests.value.filter(r =>
    dateFilterMatches(r.requestDate, dateFilter.value, TODAY),
  )
  const lineFilter = (line: StockRequestLine) => matchesDateRange(line.requiredDate, appliedFilters.requestDate)

  return skuDemandGroups(inScope, lineFilter)
    .filter(g => showAll.value || !g.sufficient)
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
watch([dateFilter, view, showAll], () => { setPage(1); skuPage.value = 1 })

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

// ─── First-load skeleton (page/per-page skeletons are ErpTablePage's own job) ──
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

const emptyIllustration = '/illustrations/empty-folder.png'

// ─── SKU rows: accordion expand — every component starts collapsed ─────────────
const expanded = reactive<Record<string, boolean>>({})
function toggleExpand(productId: string) { expanded[productId] = !expanded[productId] }

// ─── Row actions (W-1 row menu, W-7 reject) ────────────────────────────────────
// "View details" opens the stock request; the work order is one click further in.
function viewDetails(requestId: string) { router.push(`/stock-requests/${requestId}`) }
function reserveById(requestId: string) {
  const req = stockRequests.find(r => r.id === requestId)
  if (req) reserve(req)
}
function reserve(req: StockRequest) {
  const qty = reserveStock(req.id)
  if (qty === undefined) {
    toast.notify({ variant: 'error', title: t('Not enough stock to reserve any line in full'), maxWidth: 'max-content' })
    return
  }
  toast.notify({ variant: 'success', title: `${qty} ${t('unit reserved for')} ${req.workOrderNumber}`, maxWidth: 'max-content' })
}
function createWarehouseTransfer(ids: string[]) {
  router.push({ path: '/warehouse-transfers/new', query: { fromStockRequest: ids.join(',') } })
}
function createPurchaseRequest(ids: string[]) {
  router.push({ path: '/purchase-requests/new', query: { fromStockRequest: ids.join(',') } })
}
function reject(req: StockRequest) {
  if (!rejectRequest(req.id)) return
  toast.notify({ variant: 'success', title: `${req.workOrderNumber} ${t('request rejected')}`, maxWidth: 'max-content' })
}

// Row casts for the template — ErpTablePage hands every row back as a plain
// record, and this page feeds it two different row shapes depending on the view.
function sku(row: unknown): SkuDemandGroup { return row as SkuDemandGroup }
function wo(row: unknown): WoRow { return row as WoRow }

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
    :columns="view === 'product' ? skuColumns : visibleWoColumns"
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
    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <!-- Group by (W-1) — how the table is grouped, not what it filters, so it
             sits ahead of the divider. Always set, so it is not clearable. -->
        <ErpFilterSelect
          id="sr-group-by" v-model="view" :placeholder="t('Group by')"
          :options="viewOptions" :is-clearable="false"
        />
        <span class="filter-divider" aria-hidden="true" />
        <ErpFilterSelect id="sr-status" v-model="statusFilter" :placeholder="t('Status')" :options="stockRequestStatusOptions" />
        <AdvanceDateFilter id="sr-date-filter" v-model="dateFilter" :today="TODAY" :placeholder="t('Request date')" />
        <MpButton
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
          <ColumnSettingsMenu v-if="view === 'transaction'" id="sr-columns" :items="columnItems" :visibility="columnVisibility" />
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
            <MpPopoverListItem @click="createPurchaseRequest(selectedSkuIds(selectedRows as Set<number>))">{{ t('Create purchase request') }}</MpPopoverListItem>
            <MpPopoverListItem @click="createWarehouseTransfer(selectedSkuIds(selectedRows as Set<number>))">{{ t('Create warehouse transfer') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ══ By product ════════════════════════════════════════════════════════ -->

    <!-- Component — name + rotating chevron, SKU underneath. The whole cell is
         the toggle (rule/table-accordion-row-click); the chevron is affordance only. -->
    <template #cell-product="{ row }">
      <span
        class="sr-component" role="button"
        :aria-expanded="!!expanded[sku(row).productId]"
        @click.stop="toggleExpand(sku(row).productId)"
      >
        <span class="sr-component-main">
          <span class="sr-component-name">{{ sku(row).product }}</span>
          <span class="sr-expand" :class="{ 'sr-expand--open': expanded[sku(row).productId] }" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
        </span>
        <span class="sr-component-sku">SKU: {{ sku(row).sku }}</span>
        <!-- W-6 — the note sits under the component, not the status badge: the
             status column is a fixed-width `kind` and would wrap it to shreds. -->
        <span v-if="sku(row).backdate" class="sr-note">
          <MpIcon name="warning" size="sm" />
          {{ t('Stock minus after recalculation') }} — {{ sku(row).backdate!.transaction }}
        </span>
      </span>
    </template>

    <template #cell-earliestRequired="{ value }">{{ formatDate(value as string) }}</template>
    <template #cell-required="{ row }">{{ sku(row).required }} {{ sku(row).unit }}</template>
    <template #cell-reserved="{ row }">{{ sku(row).reserved }} {{ sku(row).unit }}</template>

    <!-- Remaining — still uncovered after reservations AND on-hand stock -->
    <template #cell-remaining="{ row }">
      <span :class="{ 'sr-short': sku(row).remaining > 0 }">
        {{ sku(row).remaining > 0 ? `${sku(row).remaining} ${sku(row).unit}` : '—' }}
      </span>
    </template>

    <!-- Available — minus and red once a backdated transaction pushed it under zero (W-6) -->
    <template #cell-available="{ row }">
      <span :class="{ 'sr-short': sku(row).available < 0 }">{{ sku(row).available }} {{ sku(row).unit }}</span>
    </template>

    <!-- Per-WO breakdown — one child row per work order needing this component
         (W-1). Cells mirror the parent columns one-for-one so the <colgroup>
         lines them up under the same headers; the trailing spacer + actions
         cells keep the kebab column aligned too. -->
    <template #row-extra="{ row, columns: cols, showSpacer }">
      <tr
        v-for="entry in (expanded[sku(row).productId] ? sku(row).entries : [])"
        :key="`${sku(row).productId}-${entry.workOrderId}`"
        class="sr-child"
      >
        <td v-for="col in cols" :key="col.key" class="sr-child-td" :class="{ 'sr-child-td--right': col.align === 'right' }">
          <!-- Lane column stays empty — it is the child indent gutter -->
          <template v-if="col.key === 'lane'" />
          <!-- Component column — the work order this demand came from -->
          <span v-else-if="col.key === 'product'" class="sr-child-wo">
            <span class="cell-link" @click="viewDetails(entry.requestId)">{{ entry.workOrderNumber }}</span>
            <span v-if="entry.kind" class="sr-tag" :class="`sr-tag--${entry.kind}`">{{ entry.kind === 'additional' ? t('Additional stock') : t('Adjustment') }}</span>
          </span>
          <template v-else-if="col.key === 'openWorkOrders'">{{ entry.requestor }}</template>
          <template v-else-if="col.key === 'earliestRequired'">{{ formatDate(entry.requiredDate) }}</template>
          <template v-else-if="col.key === 'required'">{{ entry.qty }} {{ sku(row).unit }}</template>
          <template v-else-if="col.key === 'reserved'">{{ entry.covered }} {{ sku(row).unit }}</template>
          <template v-else-if="col.key === 'remaining'">
            <span :class="{ 'sr-short': entry.covered < entry.qty }">
              {{ entry.covered >= entry.qty ? '—' : `${entry.qty - entry.covered} ${sku(row).unit}` }}
            </span>
          </template>
          <template v-else-if="col.key === 'status'">
            <span class="sr-child-state" :class="entry.covered >= entry.qty ? 'sr-covered' : 'sr-short'">
              {{ entry.covered >= entry.qty ? t('Covered') : t('Not covered') }}
            </span>
          </template>
        </td>
        <td v-if="showSpacer" class="sr-child-td sr-child-td--spacer" />
        <td class="sr-child-td sr-child-td--actions">
          <MpPopover :id="`sr-child-actions-${sku(row).productId}-${entry.workOrderId}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem @click="viewDetails(entry.requestId)">{{ t('View details') }}</MpPopoverListItem>
                <MpPopoverListItem v-if="entry.covered < entry.qty" @click="reserveById(entry.requestId)">{{ t('Reserve stock') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </td>
      </tr>
    </template>

    <!-- ══ By transaction ════════════════════════════════════════════════════ -->

    <!-- Transaction — the originating work order plus its request tag (W-7) -->
    <template #cell-workOrderNumber="{ row }">
      <span class="sr-txn">
        <span class="cell-link cell-text" @click.stop="viewDetails(wo(row).id)">{{ t('Work order') }} {{ wo(row).workOrderNumber }}</span>
        <span v-if="wo(row).kind" class="sr-tag" :class="`sr-tag--${wo(row).kind}`">{{ wo(row).kind === 'additional' ? t('Additional stock') : t('Adjustment') }}</span>
      </span>
    </template>

    <template #cell-qty="{ row }">{{ wo(row).qty }}</template>
    <template #cell-requestDate="{ value }">{{ formatDate(value as string) }}</template>
    <template #cell-requestor="{ value }"><span class="cell-text">{{ value }}</span></template>

    <template #cell-lastUpdated="{ row }">
      <LastUpdatedCell v-bind="lastUpdatedFor((row as Record<string, unknown>).id as string)" />
    </template>

    <!-- ══ Shared ════════════════════════════════════════════════════════════ -->

    <!-- Status — both views; the notes underneath are view-specific (W-6, W-7) -->
    <template #cell-status="{ row }">
      <ErpStatusBadge :status="(row as Record<string, unknown>).status as string" />
      <p v-if="view === 'transaction' && wo(row).overdue" class="sr-note">{{ t('Overdue — reminder sent') }}</p>
    </template>

    <!-- Full empty state — no CTA: requests are raised by work orders (see header) -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240">
        <p class="empty-full-title">{{ t('No stock requests') }}</p>
        <p class="empty-full-desc">{{ t('Stock requests will appear here.') }}</p>
      </div>
    </template>

    <!-- Actions — View details always first (rule/table-actions-no-tooltip) -->
    <template #actions="{ row }">
      <MpPopover :id="`sr-actions-${view}-${view === 'product' ? sku(row).productId : wo(row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <!-- SKU row — raise one document for this component, or open its work orders -->
          <MpPopoverList v-if="view === 'product'">
            <MpPopoverListItem @click="createPurchaseRequest([sku(row).productId])">{{ t('Create purchase request') }}</MpPopoverListItem>
            <MpPopoverListItem @click="createWarehouseTransfer([sku(row).productId])">{{ t('Create warehouse transfer') }}</MpPopoverListItem>
            <MpPopoverListItem @click="toggleExpand(sku(row).productId)">{{ expanded[sku(row).productId] ? t('Hide transactions') : t('Show transactions') }}</MpPopoverListItem>
          </MpPopoverList>

          <!-- Work order row -->
          <template v-else>
            <MpPopoverList>
              <MpPopoverListItem @click="viewDetails(wo(row).id)">{{ t('View details') }}</MpPopoverListItem>
              <template v-if="!wo(row).rejected && wo(row).status !== 'reserved' && wo(row).status !== 'issued / picked'">
                <MpPopoverListItem @click="reserve(wo(row))">{{ t('Reserve stock') }}</MpPopoverListItem>
                <MpPopoverListItem @click="createWarehouseTransfer([wo(row).id])">{{ t('Create warehouse transfer') }}</MpPopoverListItem>
                <MpPopoverListItem @click="createPurchaseRequest([wo(row).id])">{{ t('Request purchase') }}</MpPopoverListItem>
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
.sr-component-main { display: flex; align-items: center; gap: var(--mp-spacing-1); min-width: 0; }
.sr-expand { display: inline-flex; flex-shrink: 0; color: var(--mp-text-subtle, #656f80); transition: transform 150ms ease; }
.sr-expand--open { transform: rotate(180deg); }
.sr-component:hover .sr-expand { color: var(--mp-text-default, #080d0e); }
.sr-component-name { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default, #080d0e); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
  vertical-align: middle;
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
.sr-child-td--actions { text-align: center; vertical-align: top; padding: var(--mp-sizes-0\.5, 2px) 3px; }
/* Indent the first cell so the child reads as nested under its component. */
.sr-child-td:first-child { padding-left: var(--mp-spacing-8); }
.sr-child-wo { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.sr-child-state { white-space: nowrap; }
.sr-covered { color: var(--mp-text-success, #186f4a); }

/* ── Filter bar ───────────────────────────────────────────────────────────
   Only `.filter-search` is global (erp.css); the group layout is per page.
   Group by is separated from the filters by a divider — it changes HOW the
   table is grouped, not WHAT it shows — and both groups wrap with a real row
   gap instead of being squeezed edge-to-edge once the bar runs out of room. */
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
