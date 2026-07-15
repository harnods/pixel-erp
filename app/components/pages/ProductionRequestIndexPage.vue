<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpIcon, css, toast,
} from '@mekari/pixel3'
import ErpPagination from '~/components/patterns/ErpPagination.vue'
import ColumnSettingsMenu, { type ColumnSettingItem } from '~/components/patterns/ColumnSettingsMenu.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import AdvanceDateFilter from '~/components/patterns/AdvanceDateFilter.vue'
import WorkOrderPreviewDrawer, { type PreviewCtx } from '~/components/WorkOrderPreviewDrawer.vue'
import CreateWorkOrderModal from '~/components/CreateWorkOrderModal.vue'
import RejectProductionRequestModal, { type RejectContext } from '~/components/RejectProductionRequestModal.vue'
import { formatDate } from '~/utils/date'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import { dateFilterMatches, toIso, type DateFilterValue } from '~/utils/dateFilter'
import {
  productionRequestsByStatus, prRequestsOf, prAggregate, prChildRemaining, prEarliestDue,
  rejectProductionRequest,
  type PrProduct, type PrRequest, type PrSource, type PrStatus,
} from '~/data/productionRequests'

const props = withDefaults(defineProps<{ tab?: PrStatus }>(), { tab: 'pending' })

const toggleAirene = inject<() => void>('toggleAirene')

// ─── Demo scenario state (FAB) ─────────────────────────────────────────────────
type DemoState = 'empty' | 'data'
const demoState = ref<DemoState>('data')
const demoStates: { value: DemoState; label: string }[] = [
  { value: 'data', label: 'With data' },
  { value: 'empty', label: 'Empty state' },
]

// ─── Table loading state (skeleton on page/tab load) ────────────────────────────
const loading = ref(true)
let loadTimer: ReturnType<typeof setTimeout> | null = null
onMounted(() => {
  loading.value = true
  loadTimer = setTimeout(() => { loading.value = false }, 900)
})
onUnmounted(() => { if (loadTimer) clearTimeout(loadTimer) })

// ─── Columns ─────────────────────────────────────────────────────────────────
// Accordion layout (per Figma): column 1 = Product/Request — the product on the
// parent row, the Production Request no. on each child row. Column 2 = Sales order
// no. — blank on the parent, the (row-spanning) sales order on the children.
// `blankOnParent` columns are only meaningful per request; the parent leaves them
// empty (sales order, date, memo, last updated).
interface ValCol { key: string; label: string; width: string; align?: 'right'; blankOnParent?: boolean; defaultHidden?: boolean }

// Sales order no. — the merged (row-spanning) column, blank on the parent. Toggleable.
const salesOrderCol: ValCol = { key: 'salesOrder', label: 'Sales order no.', width: '220px', blankOnParent: true }
// "Last updated" — a standard default-hidden column, blank on the parent (per request).
const lastUpdatedCol: ValCol = { key: 'lastUpdated', label: 'Last updated', width: '200px', blankOnParent: true, defaultHidden: true }

const valueColumns = computed<ValCol[]>(() => {
  const requested: ValCol = { key: 'requested', label: 'Requested qty', width: '130px', align: 'right' }
  const unit: ValCol = { key: 'unit', label: 'Unit', width: '90px' }
  const memo: ValCol = { key: 'memo', label: 'Memo', width: '200px', blankOnParent: true }
  if (props.tab === 'rejected') {
    return [
      requested,
      { key: 'rejected', label: 'Rejected qty', width: '130px', align: 'right' },
      unit,
      { key: 'rejectDate', label: 'Reject date', width: '140px', blankOnParent: true },
      memo, lastUpdatedCol,
    ]
  }
  const dateCol: ValCol = props.tab === 'completed'
    ? { key: 'completeDate', label: 'Complete date', width: '140px', blankOnParent: true }
    : { key: 'dueDate', label: 'Due date', width: '140px', blankOnParent: true }
  return [
    requested,
    { key: 'produced', label: 'Produced qty', width: '130px', align: 'right' },
    { key: 'remaining', label: 'Remaining qty', width: '140px', align: 'right' },
    unit, dateCol, memo, lastUpdatedCol,
  ]
})

// Column show/hide — reset whenever the tab (and thus column set) changes.
// `defaultHidden` columns (Last updated) start unchecked; Product/Request is
// always on and can't be toggled off.
const columnVisibility = ref<Record<string, boolean>>({})
watch(valueColumns, (cols) => {
  const v: Record<string, boolean> = { product: true, salesOrder: true }
  for (const c of cols) v[c.key] = !c.defaultHidden
  columnVisibility.value = v
}, { immediate: true })

const salesOrderVisible = computed(() => columnVisibility.value.salesOrder !== false)

const columnSettingItems = computed<ColumnSettingItem[]>(() => [
  { key: 'product', label: 'Product/Request', disabled: true },
  { key: 'salesOrder', label: salesOrderCol.label },
  ...valueColumns.value.map(c => ({ key: c.key, label: c.label })),
])
const visibleValueColumns = computed(() => valueColumns.value.filter(c => columnVisibility.value[c.key] !== false))

// ─── Filters ────────────────────────────────────────────────────────────────────
const search = ref('')

// Date filter — the advanced date popover (Time range presets + Per day/week/
// month/quarter/year/Custom). Filters against the tab's own date field:
// Pending → dueDate, Completed → completeDate, Rejected → rejectDate.
// Pending starts unset (placeholder "Due date"); Completed/Rejected default to
// "Last 30 days" per the design.
const dateFieldForTab: Record<PrStatus, 'dueDate' | 'completeDate' | 'rejectDate'> = {
  pending: 'dueDate', completed: 'completeDate', rejected: 'rejectDate',
}
const dateFilterPlaceholder: Record<PrStatus, string> = {
  pending: 'Due date', completed: 'Complete date', rejected: 'Reject date',
}
const dateFilter = ref<DateFilterValue | null>(props.tab === 'pending' ? null : { mode: 'last30' })

// Reference "today" is anchored to the mock's timeline so the ranges hit real rows.
const TODAY = new Date('2026-07-06T00:00:00')

const baseProducts = computed<PrProduct[]>(() =>
  demoState.value === 'data' ? productionRequestsByStatus(props.tab) : [],
)

const filteredProducts = computed<PrProduct[]>(() => {
  const s = search.value.toLowerCase().trim()
  const field = dateFieldForTab[props.tab]
  const rows = baseProducts.value.filter((p) => {
    const matchesSearch = !s
      || p.productName.toLowerCase().includes(s)
      || p.sku.toLowerCase().includes(s)
      || p.sources.some(src =>
        src.sourceNo.toLowerCase().includes(s)
        || src.requests.some(r => r.requestNo.toLowerCase().includes(s) || (r.memo?.toLowerCase().includes(s) ?? false)))
    const matchesDate = prRequestsOf(p).some(r => dateFilterMatches(r[field], dateFilter.value, TODAY))
    return matchesSearch && matchesDate
  })
  // Stable ordering: Pending sorts by earliest due date.
  if (props.tab !== 'pending') return rows
  return [...rows].sort((a, b) => prEarliestDue(a).localeCompare(prEarliestDue(b)))
})

const hasActiveFilter = computed(() => !!search.value || !!dateFilter.value)
function clearFilters() { search.value = ''; dateFilter.value = null }

// ─── Pagination ─────────────────────────────────────────────────────────────────
const currentPage = ref(1)
const perPage = ref(25)
const total = computed(() => filteredProducts.value.length)
const pagedProducts = computed(() => {
  const start = (currentPage.value - 1) * perPage.value
  return filteredProducts.value.slice(start, start + perPage.value)
})
watch([search, dateFilter, () => props.tab, perPage], () => { currentPage.value = 1 })

// ─── Accordion expand — all products start collapsed ────────────────────────────
const openRows = ref(new Set<string>())
function isOpen(id: string) { return openRows.value.has(id) }
function toggleRow(id: string) {
  const s = new Set(openRows.value)
  s.has(id) ? s.delete(id) : s.add(id)
  openRows.value = s
}
// Collapse everything when the visible set changes (tab / page / filter).
watch([() => props.tab, currentPage], () => { openRows.value = new Set() })

// ─── Cell values ────────────────────────────────────────────────────────────────
function fmt(n: number) { return n.toLocaleString('id-ID') }

function parentCell(p: PrProduct, key: string): string {
  const agg = prAggregate(p)
  switch (key) {
    case 'requested': return fmt(agg.requested)
    case 'produced':  return fmt(agg.produced)
    case 'remaining': return fmt(agg.remaining)
    case 'rejected':  return fmt(agg.rejected)
    case 'unit':      return p.unit
    default:          return '' // requestNo, dates, memo — blank on the parent
  }
}
function childCell(p: PrProduct, r: PrRequest, key: string): string {
  switch (key) {
    case 'requestNo':    return r.requestNo
    case 'requested':    return fmt(r.requestedQty)
    case 'produced':     return fmt(r.producedQty)
    case 'remaining':    return fmt(prChildRemaining(r))
    case 'rejected':     return fmt(r.rejectedQty)
    case 'unit':         return p.unit
    case 'dueDate':      return formatDate(r.dueDate)
    case 'completeDate': return formatDate(r.completeDate)
    case 'rejectDate':   return formatDate(r.rejectDate)
    case 'memo':         return r.memo || '-'
    default:             return ''
  }
}
function childCount(p: PrProduct) { return prRequestsOf(p).length }

function notifySoon(label: string) {
  toast.notify({ variant: 'information', title: `${label} — coming soon` })
}

// Row actions (kebab) — Pending tab only.
const hasActions = computed(() => props.tab === 'pending')

// ─── Reject production request ───────────────────────────────────────────────
// Only ever launched from a production REQUEST (child) row — the product (parent)
// row has no reject option, since there's no single request/qty to reject there.
const rejectModalOpen = ref(false)
const rejectContext = ref<RejectContext | null>(null)
const rejectTarget = ref<{ productId: string; sourceNo: string; requestNo: string } | null>(null)

function openRejectModal(p: PrProduct, src: PrSource, r: PrRequest) {
  rejectTarget.value = { productId: p.id, sourceNo: src.sourceNo, requestNo: r.requestNo }
  rejectContext.value = {
    productName: p.productName, sku: p.sku,
    requestNo: r.requestNo, sourceNo: src.sourceNo,
    maxQty: prChildRemaining(r), unit: p.unit,
  }
  rejectModalOpen.value = true
}

function confirmReject({ rejectedQty, reason }: { rejectedQty: number; reason: string }) {
  const target = rejectTarget.value
  if (!target) return
  rejectProductionRequest({
    ...target, rejectedQty, reason,
    rejectDate: toIso(TODAY),
  })
  rejectModalOpen.value = false
  toast.notify({ variant: 'success', title: 'Production request rejected' })
}

// ─── Work order preview drawer ──────────────────────────────────────────────────
const previewOpen = ref(false)
const previewCtx = ref<PreviewCtx | null>(null)
function openPreview(p: PrProduct, src: PrSource, r: PrRequest) {
  previewCtx.value = {
    productName: p.productName, sku: p.sku,
    requestNo: r.requestNo, sourceNo: src.sourceNo, dueDate: r.dueDate,
  }
  previewOpen.value = true
}

// ─── Create work order modal ────────────────────────────────────────────────────
const bulkModalOpen = ref(false)
const bulkProduct = ref<PrProduct | null>(null)
const bulkSources = ref<PrSource[] | null>(null)
// Parent → all of the product's sales orders (bulk). Child → just that one request.
function createBulkWorkOrder(p: PrProduct) {
  bulkProduct.value = p; bulkSources.value = null; bulkModalOpen.value = true
}
function createWorkOrder(p: PrProduct, src: PrSource, r: PrRequest) {
  bulkProduct.value = p
  bulkSources.value = [{ sourceNo: src.sourceNo, sourceId: src.sourceId, requests: [r] }]
  bulkModalOpen.value = true
}

// Group hover — highlight the merged sales-order cell together with its request
// rows, so it reads as one row rather than a separately-hovered cell.
const hoveredSource = ref('')
function sourceKey(p: PrProduct, sourceNo: string) { return `${p.id}::${sourceNo}` }

// Sales-order attachment — opens a PDF preview in a new tab.
const ATTACHMENT_PDF = 'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf'
function openAttachment() { window.open(ATTACHMENT_PDF, '_blank', 'noopener') }

// Sticky action column separator — shown whenever the table overflows horizontally
// (responsive shrink), not only after scrolling.
const tableWrapEl = ref<HTMLElement | null>(null)
const tableEl = ref<HTMLElement | null>(null)
const isOverflowing = ref(false)
let resizeObserver: ResizeObserver | null = null
function checkOverflow() {
  const w = tableWrapEl.value
  if (w) isOverflowing.value = w.scrollWidth > w.clientWidth + 1
}
onMounted(() => {
  resizeObserver = new ResizeObserver(() => checkOverflow())
  if (tableWrapEl.value) resizeObserver.observe(tableWrapEl.value)
  if (tableEl.value) resizeObserver.observe(tableEl.value)
  nextTick(checkOverflow)
  window.addEventListener('resize', checkOverflow)
})
onUnmounted(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', checkOverflow)
})
watch([pagedProducts, visibleValueColumns, hasActions, openRows], () => nextTick(checkOverflow))

const emptyIllustration = '/illustrations/empty-folder.png'
</script>

<template>
  <div class="pr-page">
    <!-- ── Filter bar ── -->
    <div class="filter-bar">
      <div class="filter-left">
        <!-- Advanced date filter — Time range presets + Per day/week/month/quarter/
             year/Custom, filtered against the tab's own date column. Pending starts
             unset ("Due date" placeholder); Completed/Rejected default to Last 30 days. -->
        <AdvanceDateFilter
          id="pr-date-filter"
          v-model="dateFilter"
          :today="TODAY"
          :placeholder="dateFilterPlaceholder[tab]"
        />
      </div>

      <div class="filter-right">
        <div class="filter-btn-group">
          <span class="pr-tt" data-tooltip="Ask Airene">
            <button class="filter-icon-btn filter-icon-btn--airene" aria-label="Ask Airene" @click="toggleAirene?.()">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
              </svg>
            </button>
          </span>
          <ColumnSettingsMenu
            id="pr-column-settings"
            :items="columnSettingItems"
            :visibility="columnVisibility"
          />
          <span class="pr-tt" data-tooltip="Export">
            <button class="filter-icon-btn" aria-label="Export" @click="notifySoon('Export')">
              <MpIcon name="upload" size="md" />
            </button>
          </span>
        </div>
        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input v-model="search" class="filter-search-input" type="text" placeholder="Search..." />
        </div>
      </div>
    </div>

    <!-- ── Table + pagination ── -->
    <div v-if="loading || pagedProducts.length" class="pr-table-section">
      <div
        ref="tableWrapEl"
        class="pr-table-wrap"
        :class="{ 'pr-table-wrap--overflow': isOverflowing }"
      >
        <table ref="tableEl" class="pr-table">
          <colgroup>
            <col style="width: 56px" />
            <col style="width: 260px" />
            <col v-if="salesOrderVisible" style="width: 220px" />
            <col v-for="col in visibleValueColumns" :key="col.key" :style="{ width: col.width }" />
            <col v-if="hasActions" style="width: 44px" />
          </colgroup>
          <thead>
            <tr>
              <th class="pr-th" colspan="2">Product/Request</th>
              <th v-if="salesOrderVisible" class="pr-th">Sales order no.</th>
              <th
                v-for="col in visibleValueColumns"
                :key="col.key"
                class="pr-th"
                :class="{ 'pr-th--right': col.align === 'right' }"
              >{{ col.label }}</th>
              <th v-if="hasActions" class="pr-th pr-th--actions" />
            </tr>
          </thead>
          <tbody>
            <!-- ── Loading skeleton rows ── -->
            <template v-if="loading">
              <tr v-for="n in 6" :key="`sk-${n}`" class="pr-parent pr-parent--skeleton">
                <td class="pr-td pr-parent-cell" colspan="2">
                  <div class="pr-product">
                    <span class="pr-skel pr-skel--thumb" />
                    <div class="pr-product-body">
                      <span class="pr-skel pr-skel--name" />
                      <span class="pr-skel pr-skel--sku" />
                    </div>
                  </div>
                </td>
                <td v-if="salesOrderVisible" class="pr-td"><span class="pr-skel" /></td>
                <td
                  v-for="col in visibleValueColumns"
                  :key="col.key"
                  class="pr-td"
                  :class="{ 'pr-td--right': col.align === 'right' }"
                ><span class="pr-skel" :class="{ 'pr-skel--sm': col.align === 'right' }" /></td>
                <td v-if="hasActions" class="pr-td pr-td--actions" />
              </tr>
            </template>

            <template v-for="p in pagedProducts" v-else :key="p.id">
              <!-- ── Parent (product) row ── -->
              <tr class="pr-parent" :class="{ 'pr-parent--open': isOpen(p.id) }">
                <td
                  class="pr-td pr-parent-cell"
                  colspan="2"
                  role="button"
                  :aria-expanded="isOpen(p.id)"
                  @click="toggleRow(p.id)"
                >
                  <div class="pr-product">
                    <img class="pr-thumb" :src="p.image" :alt="p.productName" loading="lazy" width="40" height="40" />
                    <div class="pr-product-body">
                      <div class="pr-product-main">
                        <span class="pr-product-name">{{ p.productName }}</span>
                        <span class="pr-expand" :class="{ 'pr-expand--open': isOpen(p.id) }" aria-hidden="true">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                        </span>
                      </div>
                      <span class="pr-product-sku">SKU: {{ p.sku }}</span>
                    </div>
                  </div>
                </td>
                <!-- Sales order — blank on the parent -->
                <td v-if="salesOrderVisible" class="pr-td" />
                <td
                  v-for="col in visibleValueColumns"
                  :key="col.key"
                  class="pr-td"
                  :class="{ 'pr-td--right': col.align === 'right' }"
                >{{ parentCell(p, col.key) }}</td>
                <td v-if="hasActions" class="pr-td pr-td--actions">
                  <MpPopover :id="`pr-actions-${p.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                    <MpPopoverTrigger>
                      <button class="row-kebab" aria-label="More actions" @click.stop>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
                        </svg>
                      </button>
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
                      <MpPopoverList>
                        <!-- No Reject here — rejecting only makes sense against a single
                             production request (child row), never the whole product. -->
                        <MpPopoverListItem @click="createBulkWorkOrder(p)">Create bulk work order</MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </td>
              </tr>

              <!-- ── Child (production request) rows, grouped by source ── -->
              <template v-if="isOpen(p.id)">
                <template v-for="(src, si) in p.sources" :key="src.sourceNo">
                  <tr
                    v-for="(r, ri) in src.requests"
                    :key="r.requestNo"
                    class="pr-child"
                    @mouseenter="hoveredSource = sourceKey(p, src.sourceNo)"
                    @mouseleave="hoveredSource = ''"
                  >
                    <!-- Empty thumbnail lane — spans every child row of the product -->
                    <td v-if="si === 0 && ri === 0" class="pr-td pr-child-lane" :rowspan="childCount(p)" />
                    <!-- Production request no. — one per child row (Product/Request column) -->
                    <td class="pr-td pr-child-td pr-child-request">
                      <div class="pr-request-cell">
                        <span class="pr-request-no">{{ r.requestNo }}</span>
                        <button v-if="r.producedQty > 0" class="pr-preview-btn" @click.stop="openPreview(p, src, r)">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" stroke="currentColor" stroke-width="1.5"/>
                            <circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.5"/>
                          </svg>
                          Open preview
                        </button>
                      </div>
                    </td>
                    <!-- Sales order — spans the requests it raised -->
                    <td
                      v-if="salesOrderVisible && ri === 0"
                      class="pr-td pr-child-source"
                      :class="{ 'pr-child-source--hovered': hoveredSource === sourceKey(p, src.sourceNo) }"
                      :rowspan="src.requests.length"
                    >
                      <span class="pr-source-no">{{ src.sourceNo }}</span>
                      <span class="pr-tt pr-tt--top" data-tooltip="View attachment">
                        <button class="pr-source-attach" aria-label="View attachment" @click.stop="openAttachment">
                          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                            <path d="M14.5 5.5L7.8 12.2a1.9 1.9 0 002.7 2.7l6.7-6.7a3.8 3.8 0 00-5.4-5.4L5.1 9.2a5.7 5.7 0 008 8l6.2-6.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                        </button>
                      </span>
                    </td>
                    <td
                      v-for="col in visibleValueColumns"
                      :key="col.key"
                      class="pr-td pr-child-td"
                      :class="{
                        'pr-td--right': col.align === 'right',
                        'pr-td--muted': col.key === 'memo',
                      }"
                    >
                      <LastUpdatedCell
                        v-if="col.key === 'lastUpdated'"
                        :at="lastUpdatedFor(r.requestNo).at"
                        :by="lastUpdatedFor(r.requestNo).by"
                      />
                      <template v-else>{{ childCell(p, r, col.key) }}</template>
                    </td>
                    <td v-if="hasActions" class="pr-td pr-td--actions pr-child-td">
                      <MpPopover :id="`pr-actions-${r.requestNo}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                        <MpPopoverTrigger>
                          <button class="row-kebab" aria-label="More actions" @click.stop>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
                            </svg>
                          </button>
                        </MpPopoverTrigger>
                        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
                          <MpPopoverList>
                            <MpPopoverListItem @click="createWorkOrder(p, src, r)">Create work order</MpPopoverListItem>
                            <MpPopoverListItem v-if="prChildRemaining(r) > 0" @click="openRejectModal(p, src, r)">Reject</MpPopoverListItem>
                          </MpPopoverList>
                        </MpPopoverContent>
                      </MpPopover>
                    </td>
                  </tr>
                </template>
              </template>
            </template>
          </tbody>
        </table>
      </div>

      <ErpPagination
        v-if="!loading"
        :current-page="currentPage"
        :per-page="perPage"
        :total="total"
        @page-change="currentPage = $event"
        @per-page-change="perPage = $event"
      />
    </div>

    <!-- ── Empty state ── -->
    <div v-else class="empty-full">
      <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
      <p class="empty-full-title">{{ hasActiveFilter ? 'No results found' : 'No production request' }}</p>
      <p class="empty-full-desc">{{ hasActiveFilter ? 'Try adjusting your search.' : 'Production request will appear here.' }}</p>
      <a v-if="hasActiveFilter" class="empty-clear" @click="clearFilters">Clear search</a>
    </div>
  </div>

  <!-- ── Demo scenario FAB ── -->
  <MpPopover id="pr-demo-fab" is-close-on-select use-portal placement="top-end">
    <MpPopoverTrigger>
      <button class="demo-fab" aria-label="Change scenario state"><MpIcon name="sliders" size="md" color="icon.inverse" /></button>
    </MpPopoverTrigger>
    <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
      <p class="demo-fab-heading">Scenario state</p>
      <MpPopoverList>
        <MpPopoverListItem v-for="s in demoStates" :key="s.value" :is-active="s.value === demoState" @click="demoState = s.value">{{ s.label }}</MpPopoverListItem>
      </MpPopoverList>
    </MpPopoverContent>
  </MpPopover>

  <!-- ── Work order preview drawer (Open preview) ── -->
  <WorkOrderPreviewDrawer :open="previewOpen" :ctx="previewCtx" @close="previewOpen = false" />

  <!-- ── Create work order modal (bulk / single) ── -->
  <CreateWorkOrderModal
    :open="bulkModalOpen"
    :product="bulkProduct"
    :sources="bulkSources"
    @close="bulkModalOpen = false"
  />

  <!-- ── Reject production request modal (child row only) ── -->
  <RejectProductionRequestModal
    :open="rejectModalOpen"
    :context="rejectContext"
    @close="rejectModalOpen = false"
    @confirm="confirmReject"
  />
</template>

<style scoped>
.pr-page { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }

/* Filter bar */
.filter-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); min-height: var(--mp-sizes-9, 36px); }
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.filter-btn-group { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.filter-icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary); padding: var(--mp-spacing-2);
}
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-icon-btn--airene { color: var(--mp-airene-default); }
.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary); min-width: 200px;
}
.filter-search-input {
  flex: 1; border: none; background: transparent; outline: none;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md);
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }

/* Custom tooltip (Pixel MpTooltip ships no structural CSS in this build) */
.pr-tt { position: relative; display: inline-flex; }
.pr-tt::after {
  content: attr(data-tooltip);
  position: absolute; left: 50%; top: 100%; transform: translateX(-50%) translateY(6px);
  padding: 5px var(--mp-spacing-2); border-radius: var(--mp-radii-sm);
  background: var(--mp-background-inverse, #080d0e); color: var(--mp-text-inverse, #fff);
  font-size: var(--mp-font-sizes-xs, 11px); font-weight: var(--mp-font-weights-medium, 500); line-height: 1;
  white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity 0.12s ease; z-index: 9999;
}
.pr-tt:hover::after { opacity: 1; }
.pr-tt--top::after { top: auto; bottom: 100%; transform: translateX(-50%) translateY(-6px); }

/* Loading skeleton */
.pr-parent--skeleton .pr-td { background: var(--mp-background-neutral); }
.pr-skel {
  display: inline-block; height: 12px; width: 72px; border-radius: var(--mp-radii-sm, 4px);
  background: linear-gradient(90deg, var(--mp-border-default) 25%, var(--mp-background-neutral-subtle) 37%, var(--mp-border-default) 63%);
  background-size: 400% 100%; animation: pr-skel-shimmer 1.4s ease infinite;
}
.pr-skel--sm { width: 48px; }
.pr-skel--thumb { width: var(--mp-sizes-10, 40px); height: var(--mp-sizes-10, 40px); border-radius: var(--mp-radii-md); flex-shrink: 0; }
.pr-skel--name { width: 160px; height: 14px; }
.pr-skel--sku { width: 90px; height: 12px; margin-top: var(--mp-spacing-1); }
@keyframes pr-skel-shimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }

/* Table */
.pr-table-section { display: flex; flex-direction: column; }
.pr-table-wrap { overflow-x: auto; }
/* min-width: max-content keeps the fixed column widths stable — the table never
   reflows when rows expand/collapse or a scrollbar appears/disappears. */
.pr-table { width: 100%; min-width: max-content; border-collapse: collapse; table-layout: fixed; }
.pr-th {
  position: sticky; top: 0; z-index: 2;
  height: var(--mp-sizes-7, 28px);
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; color: var(--mp-text-default); text-align: left; white-space: nowrap;
}
.pr-th--right { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.pr-th--actions { position: sticky; right: 0; z-index: 3; background: var(--mp-background-neutral-subtle); }

.pr-td {
  height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-4) var(--mp-spacing-2\.5) var(--mp-spacing-2);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  vertical-align: middle; white-space: nowrap; background: inherit;
}
.pr-td--right { text-align: right; padding: var(--mp-spacing-2\.5) var(--mp-spacing-2) var(--mp-spacing-2\.5) var(--mp-spacing-4); font-variant-numeric: tabular-nums; }
.pr-td--muted { color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; }
.pr-req-no { color: var(--mp-text-default); }

/* Parent (product) row */
.pr-parent { background: var(--mp-background-neutral); }
.pr-parent:hover .pr-td { background: var(--mp-background-neutral-hovered); }
/* The whole product cell toggles the accordion */
.pr-parent-cell { white-space: normal; cursor: pointer; }
.pr-parent-cell:hover .pr-product-name { color: var(--mp-text-selected); }
.pr-parent-cell:hover .pr-expand { color: var(--mp-text-default); }
.pr-product { display: flex; align-items: center; gap: var(--mp-spacing-3); min-width: 0; }
.pr-thumb {
  width: var(--mp-sizes-10, 40px); height: var(--mp-sizes-10, 40px);
  border-radius: var(--mp-radii-md); flex-shrink: 0; object-fit: cover;
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-subtle);
}
/* Body fills the cell so the chevron right-aligns to a constant x across every row */
.pr-product-body { flex: 1; display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: 0; }
.pr-product-main { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.pr-product-name {
  flex: 1; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-medium); color: var(--mp-text-default);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pr-product-sku { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
.pr-expand {
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: var(--mp-sizes-6, 24px); height: var(--mp-sizes-6, 24px);
  border: none; background: none; border-radius: var(--mp-radii-sm);
  cursor: pointer; color: var(--mp-text-secondary); padding: 0;
  transition: transform 120ms ease;
}
.pr-expand:hover { background: var(--mp-background-neutral-pressed); color: var(--mp-text-default); }
.pr-expand--open { transform: rotate(180deg); }

/* Child (production request) rows */
.pr-child > .pr-child-td { background: var(--mp-background-neutral); }
.pr-child:hover > .pr-child-td { background: var(--mp-background-neutral-hovered); }
.pr-child-lane {
  background: var(--mp-background-neutral);
  border-right: 1px solid var(--mp-border-default);
}
.pr-child-request { color: var(--mp-text-default); }
/* Production request no. — reveals an "Open preview" button on row hover */
.pr-request-cell { position: relative; display: flex; align-items: center; min-width: 0; }
.pr-request-no { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.pr-preview-btn {
  position: absolute; right: 0; top: 50%; transform: translateY(-50%);
  display: none; align-items: center; gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-sm); cursor: pointer; white-space: nowrap;
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-medium);
  color: var(--mp-text-secondary); line-height: 1;
}
.pr-preview-btn:hover { color: var(--mp-text-default); background: var(--mp-background-neutral-hovered); }
.pr-child:hover .pr-preview-btn { display: inline-flex; }

/* Sales order — merged (row-spanning) cell, boxed with side borders. Highlights
   together with its request rows on hover (not as a separate cell). */
.pr-child-source {
  vertical-align: top;
  background: var(--mp-background-neutral);
  border-left: 1px solid var(--mp-border-default);
  border-right: 1px solid var(--mp-border-default);
  padding-top: var(--mp-spacing-3);
}
.pr-child-source--hovered { background: var(--mp-background-neutral-hovered); }
.pr-source-no { color: var(--mp-text-default); }
.pr-source-attach {
  display: inline-flex; align-items: center; justify-content: center;
  margin-left: var(--mp-spacing-1\.5); padding: var(--mp-spacing-0\.5);
  border: none; background: none; border-radius: var(--mp-radii-sm);
  color: var(--mp-text-secondary); cursor: pointer; vertical-align: middle;
}
.pr-source-attach:hover { background: var(--mp-background-neutral-pressed); color: var(--mp-text-default); }

/* Sticky actions column */
.pr-td--actions {
  position: sticky; right: 0; z-index: 1;
  text-align: right; padding-right: var(--mp-spacing-2);
  background: var(--mp-background-neutral);
}
.pr-parent:hover .pr-td--actions { background: var(--mp-background-neutral-hovered); }
.pr-child:hover > .pr-td--actions { background: var(--mp-background-neutral-hovered); }
.pr-table-wrap--overflow .pr-th--actions,
.pr-table-wrap--overflow .pr-td--actions { box-shadow: inset 2px 0 var(--mp-border-default); }

.row-kebab {
  display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-5, 20px); margin-left: auto;
  border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-secondary);
}
.row-kebab svg { display: block; width: var(--mp-sizes-5, 20px); height: var(--mp-sizes-5, 20px); }
.row-kebab:hover { background: var(--mp-background-neutral-hovered); }

/* Empty state */
.empty-full { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-10, 40px) 0; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.empty-clear { margin-top: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); cursor: pointer; }

/* Demo FAB */
.demo-fab {
  position: fixed; right: var(--mp-spacing-6); bottom: var(--mp-spacing-6);
  width: var(--mp-spacing-12, 48px); height: var(--mp-spacing-12, 48px);
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-inverse, #080d0e); color: #fff; cursor: pointer; z-index: 1200;
  box-shadow: 0 4px 6px -2px rgba(0,0,0,0.1), 0 10px 15px -3px rgba(0,0,0,0.2);
}
.demo-fab:hover { opacity: 0.9; }
.demo-fab-heading { padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
