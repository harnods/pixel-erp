<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, MpIcon, MpTooltip,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton, MpDatePicker, MpSelect, MpButton, MpBadge, toast, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpPagination from '~/components/patterns/ErpPagination.vue'
import ClampText from '~/components/patterns/ClampText.vue'
import ActivityLogModal from '~/components/patterns/ActivityLogModal.vue'
import NewLocationDrawer from '~/components/patterns/NewLocationDrawer.vue'
import StockSerialDrawer from '~/components/patterns/StockSerialDrawer.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import { getWarehouseDetail, type WarehouseStockItem } from '~/data/warehouseDetails'
import { warehouses, getWarehouseActivity, archiveWarehouses, unarchiveWarehouses } from '~/data/warehouses'
import { getStorageTree, deleteLocation, type LocNode } from '~/data/storageLocations'
import { TODAY } from '~/data/master'
import { useUrlModal } from '@ds/proto-review'

const props = defineProps<{ orderId: string }>()
const router = useRouter()

const warehouse = computed(() => getWarehouseDetail(props.orderId))
const activityOpen = ref(false)

// Activity log — the REAL log recorded on create/edit (newest first, real timestamps
// + only the fields that actually changed). Seed warehouses that were never touched
// via the form get a synthesized "Created" baseline from their current fields.
const activityEntries = computed(() => {
  const w = warehouse.value
  if (!w) return []
  const logged = getWarehouseActivity(w.id).map((r) => ({ date: r.date, user: r.user, activity: r.activity, details: r.details }))
  if (logged.some((e) => e.activity === 'Created')) return logged

  const createdBaseline = {
    date: new Date(w.updatedAt).toISOString(),
    user: w.updatedBy,
    activity: 'Created',
    details: [
      { label: 'Name', value: dash(w.name) },
      { label: 'Code', value: dash(w.code) },
      { label: 'PIC', value: w.pics.map((p) => p.name).join(', ') || EM_DASH },
      { label: 'Address', value: dash(w.address) },
      { label: 'Description', value: dash(w.description) },
    ],
  }
  return [...logged, createdBaseline]
})

// WMS Ops + Ops 2 operate within a single warehouse — hide the "Warehouses"
// breadcrumb (no list to go back to) and the Transactions tab in those scenarios.
const { activeScenario } = useScenario()
const isWmsOps = computed(
  () => activeScenario.value === 'WMS Ops' || activeScenario.value === 'WMS Ops 2',
)
const showBreadcrumb = computed(() => !isWmsOps.value)

// empty-state illustration (runtime public path, not a build-time import)
const emptyIllustration = '/illustrations/empty-folder.png'

const toggleAirene = inject<() => void>('toggleAirene')

// Any missing / unfilled value renders as an em dash (—) — never blank, never "-".
const EM_DASH = '—'
function dash(v?: string | null): string {
  const t = (v ?? '').trim()
  return t && t !== '-' ? t : EM_DASH
}

// ── Warehouse info rows (horizontal label / value, per Figma) ──────────────────
const infoRows = computed(() => {
  const w = warehouse.value
  if (!w) return []
  return [
    { key: 'name', label: 'Warehouse name', value: dash(w.name) },
    { key: 'code', label: 'Warehouse code', value: dash(w.code) },
    { key: 'pic', label: 'PIC', value: dash(w.pic) },
    { key: 'address', label: 'Address', value: dash(w.address) },
    { key: 'description', label: 'Description', value: dash(w.description) },
  ]
})

// ── Actions dropdown (top-right): Edit · Archive/Unarchive · Delete (if applicable)
const canArchive = computed(() => warehouse.value && !warehouse.value.isDefault)
const isArchived = computed(() => warehouse.value?.status === 'archived')
const canDelete = computed(
  () => warehouse.value && !warehouse.value.isDefault && !warehouse.value.hasTransactions,
)

const deleteModalOpen = ref(false)
const archiveModalOpen = ref(false)

function goEdit() {
  // edit form not in scope for this story — navigate to the (future) edit route
  router.push(`/warehouses/${props.orderId}/edit`)
}
function confirmArchive() {
  if (!warehouse.value) return
  archiveWarehouses([warehouse.value.id])
  archiveModalOpen.value = false
  toast.notify({ variant: 'success', title: 'Warehouse archived' })
}
/** Unarchive is a low-friction, reversible action — no confirmation modal (matches the index). */
function unarchive() {
  if (!warehouse.value) return
  unarchiveWarehouses([warehouse.value.id])
  toast.notify({ variant: 'success', title: 'Warehouse unarchived' })
}
function confirmDelete() {
  deleteModalOpen.value = false
  toast.notify({ variant: 'success', title: 'Warehouse deleted' })
  router.push('/warehouses')
}

// ── Products table (Products tab) — ErpTablePage (read-only, single page) ──────
const allStockColumns: TableColumn[] = [
  { key: 'name',                label: 'Name',                 width: '320px', sortType: 'text'   },
  { key: 'sku',                 label: 'SKU',                  width: '200px', sortType: 'text'   },
  { key: 'barcode',             label: 'Barcode',              width: '170px', sortType: 'text'   },
  { key: 'category',            label: 'Category',             width: '150px', sortType: 'text'   },
  { key: 'locations',           label: 'Location',             width: '230px' },
  { key: 'onHand',              label: 'On hand qty',          width: '120px', align: 'right', sortType: 'number' },
  { key: 'reserved',            label: 'Reserved qty',         width: '120px', align: 'right', sortType: 'number' },
  { key: 'available',           label: 'Available qty',        width: '120px', align: 'right', sortType: 'number' },
  { key: 'onTheWay',            label: 'On the way qty',       width: '130px', align: 'right', sortType: 'number' },
  { key: 'minStock',            label: 'Min. stock',           width: '130px', align: 'right', sortType: 'number' },
  { key: 'unit',                label: 'Unit',                 width: '90px',  sortType: 'text'   },
]
// Column show/hide — first column (Name) always on; Last updated appended, hidden by default.
const allStockCols: TableColumn[] = [...allStockColumns, { key: 'lastUpdated', label: 'Last updated', width: '200px' }]
const stockColVisibility = reactive<Record<string, boolean>>(
  Object.fromEntries(allStockCols.map(c => [c.key, c.key !== 'lastUpdated'])),
)
const stockColItems = allStockCols.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const stockColumns = computed<TableColumn[]>(() => allStockCols.filter(c => stockColVisibility[c.key]))
// Sort menu's "Hide column" flips a column off; ColumnSettings turns it back on.
function hideStockColumn(key: string) { stockColVisibility[key] = false }

// Products-tab sort (this table uses manual pagination, not useTableState).
const stockSortKey = ref('')
const stockSortDir = ref<'asc' | 'desc'>('asc')
function setStockSort(key: string, dir: 'asc' | 'desc') {
  stockSortKey.value = key
  stockSortDir.value = dir
  productsPage.value = 1
}

// Column show/hide for the Batches / Serial custom tables (Product + SKU always on).
const batchColItems = [
  { key: 'product', label: 'Product', disabled: true },
  { key: 'sku', label: 'SKU', disabled: true },
  { key: 'batch', label: 'Batch' },
  { key: 'location', label: 'Location' },
  { key: 'expiry', label: 'Expiry date' },
  { key: 'onHand', label: 'On hand qty' },
  { key: 'reserved', label: 'Reserved qty' },
  { key: 'available', label: 'Available qty' },
  { key: 'unit', label: 'Unit' },
  { key: 'lastUpdated', label: 'Last updated' },
]
const batchColVisibility = reactive<Record<string, boolean>>(Object.fromEntries(batchColItems.map(c => [c.key, c.key !== 'lastUpdated'])))
const serialColItems = [
  { key: 'product', label: 'Product', disabled: true },
  { key: 'sku', label: 'SKU', disabled: true },
  { key: 'available', label: 'Available qty' },
  { key: 'reserved', label: 'Reserved qty' },
  { key: 'lastUpdated', label: 'Last updated' },
]
const serialColVisibility = reactive<Record<string, boolean>>(Object.fromEntries(serialColItems.map(c => [c.key, c.key !== 'lastUpdated'])))

// ── Storage locations (tree) — persisted per warehouse via the data module ────────
const locTree = ref<LocNode[]>([])
const expandedLoc = ref<Set<string>>(new Set())
const locSearch = ref('')
watch(() => warehouse.value?.id, (id) => {
  locTree.value = id ? getStorageTree(id) : []
  expandedLoc.value = new Set()
}, { immediate: true })

function locNameMatch(node: LocNode, q: string): boolean {
  return node.name.toLowerCase().includes(q) || node.children.some(c => locNameMatch(c, q))
}
// Flattened visible rows (respecting expand state; a search expands all matching paths).
const flatLocations = computed(() => {
  const q = locSearch.value.trim().toLowerCase()
  const out: { node: LocNode; depth: number; hasChildren: boolean; open: boolean }[] = []
  const walk = (nodes: LocNode[], depth: number) => {
    for (const node of nodes) {
      if (q && !locNameMatch(node, q)) continue
      const hasChildren = node.children.length > 0
      const open = q ? true : expandedLoc.value.has(node.id)
      out.push({ node, depth, hasChildren, open })
      if (hasChildren && open) walk(node.children, depth + 1)
    }
  }
  walk(locTree.value, 0)
  return out
})
function toggleLoc(node: LocNode) {
  if (!node.children.length) return
  const s = new Set(expandedLoc.value)
  s.has(node.id) ? s.delete(node.id) : s.add(node.id)
  expandedLoc.value = s
}
function deleteLoc(node: LocNode) {
  if (warehouse.value) deleteLocation(warehouse.value.id, node.id)
}
function viewLocation(node: LocNode) {
  if (warehouse.value) router.push(`/warehouses/${warehouse.value.id}/locations/${node.id}`)
}

// Add-location drawer (shared <NewLocationDrawer>). parentId null = root location.
// URL-driven (?overlay=new-location) via proto-review's useUrlModal so review
// comments left inside it scope to it and reopen it from the All comments panel.
const newLocOpen = useUrlModal('new-location')
const newLocParentId = ref<string | null>(null)
function openNewLoc() {
  newLocParentId.value = null
  newLocOpen.value = true
}
function addSubLoc(node: LocNode) {
  newLocParentId.value = node.id
  newLocOpen.value = true
}
function onLocSaved(parentId: string | null) {
  if (parentId) expandedLoc.value = new Set([...expandedLoc.value, parentId])
}

const search = ref('')
// If any product in this warehouse has multiple bin locations, all table columns get side borders
const hasMultiLocProduct = computed(() => warehouse.value?.stock.some((s) => s.locations.length > 1) ?? false)
// tracks which product rows have their category list expanded (beyond 3)
const expandedCategories = reactive<Set<string>>(new Set())
function toggleCategories(id: string) {
  if (expandedCategories.has(id)) expandedCategories.delete(id)
  else expandedCategories.add(id)
}
const CAT_MAX = 3

const filteredStock = computed(() => {
  const q = search.value.trim().toLowerCase()
  // Batch-tracked products belong only in Batches tab; serial-tracked only in Serial numbers tab
  const list = (warehouse.value?.stock ?? []).filter(s => !s.batches?.length && !s.serials)
  if (!q) return list
  return list.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.sku.toLowerCase().includes(q) ||
      s.barcode.toLowerCase().includes(q) ||
      (s.categories ?? [s.category]).some(c => c.toLowerCase().includes(q)),
  )
})
// column-sort (mirrors useTableState's compare: numeric diff, else natural string compare)
const sortedStock = computed(() => {
  if (!stockSortKey.value) return filteredStock.value
  return [...filteredStock.value].sort((a, b) => {
    const av = (a as Record<string, unknown>)[stockSortKey.value]
    const bv = (b as Record<string, unknown>)[stockSortKey.value]
    let cmp: number
    if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
    else cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true, sensitivity: 'base' })
    return stockSortDir.value === 'asc' ? cmp : -cmp
  })
})
// real pagination — only render the current page (warehouses can hold 1000+ SKUs)
const productsPage = ref(1)
const productsPerPage = ref(25)
const pagedStock = computed(() => {
  const start = (productsPage.value - 1) * productsPerPage.value
  return sortedStock.value.slice(start, start + productsPerPage.value)
})
function onProductsPageChange(page: number) { productsPage.value = page }
function onProductsPerPageChange(per: number) { productsPerPage.value = per; productsPage.value = 1 }
// reset to page 1 when the search or the warehouse changes
watch([search, () => props.orderId], () => { productsPage.value = 1 })

// ── Split-row height sync: make qty rows match the height of their location counterpart ──
const productsTableRef = ref<InstanceType<typeof ErpTablePage> | null>(null)
let splitRowObserver: ResizeObserver | null = null

function syncLocQtyRowHeights() {
  const el = productsTableRef.value?.$el as HTMLElement | undefined
  if (!el) return
  el.querySelectorAll('tr').forEach((tr) => {
    const locCell = tr.querySelector<HTMLElement>('td[data-col="locations"]')
    if (!locCell) return
    const locRows = Array.from(locCell.querySelectorAll<HTMLElement>('.wh-col-row'))
    if (locRows.length <= 1) return
    // Reset before measuring so natural heights are used
    ;(['onHand', 'reserved', 'available'] as const).forEach((col) => {
      tr.querySelector(`td[data-col="${col}"]`)?.querySelectorAll<HTMLElement>('.wh-col-row')
        .forEach((r) => { r.style.minHeight = '' })
    })
    const heights = locRows.map((r) => r.offsetHeight)
    ;(['onHand', 'reserved', 'available'] as const).forEach((col) => {
      const qtyCell = tr.querySelector<HTMLElement>(`td[data-col="${col}"]`)
      if (!qtyCell) return
      qtyCell.querySelectorAll<HTMLElement>('.wh-col-row').forEach((r, i) => {
        if (heights[i]) r.style.minHeight = `${heights[i]}px`
      })
    })
  })
}

onMounted(() => nextTick(() => {
  syncLocQtyRowHeights()
  const el = productsTableRef.value?.$el as HTMLElement | undefined
  if (el) {
    splitRowObserver = new ResizeObserver(() => nextTick(syncLocQtyRowHeights))
    splitRowObserver.observe(el)
  }
}))
onUnmounted(() => splitRowObserver?.disconnect())
watch(pagedStock, () => nextTick(syncLocQtyRowHeights))

// ── Batches table (Batches tab) — custom table with merged (rowspan) Product/SKU
const batchSearch = ref('')
const batchProducts = computed(() =>
  (warehouse.value?.stock ?? []).filter((s) => s.batches && s.batches.length > 0),
)
// expand state — default-expand the first batch product (matches the design)
const expandedBatches = ref<Set<string>>(new Set())
watch(batchProducts, (list) => {
  if (list.length && expandedBatches.value.size === 0) expandedBatches.value = new Set([list[0].id])
}, { immediate: true })

function toggleBatch(id: string) {
  const s = new Set(expandedBatches.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expandedBatches.value = s
}

// ── Expiry range filter (Batches tab) ─────────────────────────────────────────
const expiryPreset = ref('')   // '' | expired | thismonth | next2m | next3m | custom
const expiryFrom  = ref('')    // DD/MM/YYYY — only used when preset === 'custom'
const expiryTo    = ref('')

const expiryPresets = [
  { label: 'Already expired',  value: 'expired'    },
  { label: 'This month',       value: 'thismonth'  },
  { label: 'Next 2 months',    value: 'next2m'     },
  { label: 'Next 3 months',    value: 'next3m'     },
  { label: 'Custom range',     value: 'custom'     },
]
const expiryLabel = computed(() => {
  if (expiryPreset.value === 'custom')
    return expiryFrom.value && expiryTo.value ? `${expiryFrom.value} – ${expiryTo.value}` : 'Custom range'
  return expiryPresets.find((o) => o.value === expiryPreset.value)?.label ?? ''
})

function dayStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function parseDMY(s: string): Date | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null
}

const expiryRange = computed<[Date, Date] | null>(() => {
  const today = dayStart(TODAY)
  switch (expiryPreset.value) {
    case 'expired':   return [new Date(0), new Date(today.getTime() - 1)]
    case 'thismonth': return [
      new Date(today.getFullYear(), today.getMonth(), 1),
      new Date(today.getFullYear(), today.getMonth() + 1, 0),
    ]
    case 'next2m': return [today, new Date(today.getFullYear(), today.getMonth() + 2, today.getDate())]
    case 'next3m': return [today, new Date(today.getFullYear(), today.getMonth() + 3, today.getDate())]
    case 'custom': {
      const from = parseDMY(expiryFrom.value)
      const to   = parseDMY(expiryTo.value)
      return from && to ? [dayStart(from), dayStart(to)] : null
    }
    default: return null
  }
})

function clearExpiryFilter() { expiryPreset.value = ''; expiryFrom.value = ''; expiryTo.value = '' }

function visibleBatches(p: { batches?: { expiryDate: string }[] }) {
  const batches = p.batches ?? []
  const range = expiryRange.value
  if (!range) return batches
  const [from, to] = range
  to.setHours(23, 59, 59, 999)
  return batches.filter((b) => { const d = new Date(b.expiryDate); return d >= from && d <= to })
}

const filteredBatchProducts = computed(() => {
  const q = batchSearch.value.trim().toLowerCase()
  return batchProducts.value.filter((s) => {
    const matchesQuery = !q || s.name.toLowerCase().includes(q) || s.sku.toLowerCase().includes(q)
    return matchesQuery && visibleBatches(s).length > 0
  })
})

function isBatchExpanded(id: string) { return expandedBatches.value.has(id) }
function batchCountLabel(n: number) { return `${n} ${n === 1 ? 'batch' : 'batches'}` }

// ── Serial numbers tab (grouped, expandable per product) ───────────────────────
const serialSearch = ref('')
const serialProducts = computed(() =>
  (warehouse.value?.stock ?? []).filter((s) => s.serials &&
    (s.serials.available.length > 0 || s.serials.reserved.length > 0)),
)
const filteredSerialProducts = computed(() => {
  const q = serialSearch.value.trim().toLowerCase()
  if (!q) return serialProducts.value
  return serialProducts.value.filter(
    (s) => s.name.toLowerCase().includes(q) || s.sku.toLowerCase().includes(q),
  )
})
function serialCountLabel(n: number) { return `${n} ${n === 1 ? 'serial number' : 'serial numbers'}` }
const hasBatchMergedRows = computed(() => filteredBatchProducts.value.length > 0)
const hasSerialMergedRows = computed(() => filteredSerialProducts.value.length > 0)

const serialDrawerProduct = ref<WarehouseStockItem | null>(null)
const serialDrawerOpen    = ref(false)
const serialDrawerTab     = ref<'available' | 'reserved'>('available')
function openSerialDrawer(p: WarehouseStockItem, tab: 'available' | 'reserved' = 'available') {
  serialDrawerProduct.value = p
  serialDrawerTab.value     = tab
  serialDrawerOpen.value    = true
}

function formatDateNumeric(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}
function daysToExpiry(iso: string) {
  return Math.ceil((new Date(iso).getTime() - TODAY.getTime()) / 86_400_000)
}
// A batch is flagged when it's already expired or expiring within 30 days.
function isExpiryWarning(iso: string) {
  return daysToExpiry(iso) < 30
}
function expiryTooltip(iso: string) {
  const d = formatDateNumeric(iso)
  const days = daysToExpiry(iso)
  if (days < 0) return `Expired on ${d}`
  if (days === 0) return `Expires today (${d})`
  return `Expiring in ${days} day${days === 1 ? '' : 's'} (${d})`
}

function formatNum(n: number) {
  return n.toLocaleString('id-ID')
}

// Split a multi-location row into per-location qty breakdowns
// 2 locations: 60% / 40%; 3 locations: 50% / 30% / 20%
function locBreakdown(row: { locations: string[]; onHand: number; reserved: number }) {
  const locs = row.locations
  if (locs.length <= 1) return null
  const weights = locs.length === 2 ? [0.6, 0.4] : [0.5, 0.3, 0.2]
  const split = (total: number) => {
    const parts = weights.slice(0, -1).map((w) => Math.round(total * w))
    parts.push(Math.max(0, total - parts.reduce((a, b) => a + b, 0)))
    return parts
  }
  const ohs = split(row.onHand)
  const rvs = split(row.reserved)
  return locs.map((loc, i) => {
    const oh = ohs[i] ?? 0
    const rv = Math.min(rvs[i] ?? 0, oh)
    return { loc, onHand: oh, reserved: rv, available: oh - rv }
  })
}

function formatUpdatedAt(iso: string) {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return `${date}, ${time}`
}

function goBack() { router.push('/warehouses') }

// ── Jump-to-warehouse switcher ─────────────────────────────────────────────
const jumpSearch = ref('')
const jumpResults = computed(() => {
  const active = warehouses.filter((w) => !w.isDefault && w.id !== props.orderId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const q = jumpSearch.value.trim().toLowerCase()
  const matched = q
    ? active.filter((w) => w.name.toLowerCase().includes(q) || w.code.toLowerCase().includes(q))
    : active
  return matched.slice(0, 5)
})
function jumpTo(id: string) {
  jumpSearch.value = ''
  router.push(`/warehouses/${id}`)
}

// ── Scroll-position-aware sticky columns ───────────────────────────────────────
// The kebab (actions) column is sticky-right from the start (wide table); at the
// far-right scroll end it un-sticks. The Name column is NOT sticky at the start;
// it becomes sticky-left (with a right separator) once the user scrolls right.
// ErpTablePage only detects overflow, not scroll position — so we track it here
// and toggle `wh-scroll-start` / `wh-scroll-end` classes on the table wrapper.
const productsTableEl = ref<HTMLElement | null>(null)

function applyStickyState(el: HTMLElement) {
  const max = el.scrollWidth - el.clientWidth
  el.classList.toggle('wh-scroll-start', el.scrollLeft <= 0)
  el.classList.toggle('wh-scroll-end', el.scrollLeft >= max - 1)
}
// scroll events don't bubble but DO propagate in the capture phase — one capturing
// listener on the wrapper div catches the inner table's scroll regardless of when
// ErpTablePage mounts its scroll container.
function onTableScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el?.classList?.contains('erp-table-wrapper')) applyStickyState(el)
}
function refreshStickyState() {
  const el = productsTableEl.value?.querySelector<HTMLElement>('.erp-table-wrapper')
  if (el) applyStickyState(el)
}
function initStickyState(tries = 0) {
  const el = productsTableEl.value?.querySelector<HTMLElement>('.erp-table-wrapper')
  if (el) { applyStickyState(el); return }
  if (tries < 30) requestAnimationFrame(() => initStickyState(tries + 1))
}

onMounted(() => {
  initStickyState()
  window.addEventListener('resize', refreshStickyState)
})
onUnmounted(() => window.removeEventListener('resize', refreshStickyState))
// recompute when rows change (filter, warehouse switch, tab re-render)
watch(filteredStock, () => nextTick(() => initStickyState()))
</script>

<template>
  <div v-if="warehouse" class="detail-page">

    <!-- ── Title bar (breadcrumb + title + Actions dropdown) ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button v-if="showBreadcrumb" class="detail-breadcrumb" @click="goBack">Warehouses</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ warehouse.name }}</h1>

          <!-- Chevron → jump-to-warehouse switcher -->
          <MpPopover id="wh-detail-jump" use-portal :is-keep-alive="false" placement="bottom-start">
            <MpPopoverTrigger>
              <button class="detail-jump-chevron" aria-label="Switch warehouse">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ width: '304px' })">
              <div class="detail-jump">
                <div class="detail-jump-search-wrap">
                  <input v-model="jumpSearch" class="detail-jump-search" type="text" placeholder="Search warehouse…" />
                </div>
                <div class="detail-jump-list">
                  <button v-for="w in jumpResults" :key="w.id" class="detail-jump-item" @click="jumpTo(w.id)">
                    <span class="detail-jump-item-name">{{ w.name }}</span>
                    <span class="detail-jump-item-sub">{{ w.code }}</span>
                  </button>
                  <p v-if="!jumpResults.length" class="detail-jump-empty">No warehouses found.</p>
                </div>
              </div>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>

      <!-- Actions dropdown: Edit · Archive/Unarchive · Delete (if applicable) -->
      <MpPopover id="wh-detail-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="detail-btn detail-btn--primary">
            Actions
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="goEdit">Edit</MpPopoverListItem>
            <MpPopoverListItem v-if="canArchive" @click="isArchived ? unarchive() : (archiveModalOpen = true)">
              {{ isArchived ? 'Unarchive' : 'Archive' }}
            </MpPopoverListItem>
            <MpPopoverListItem
              v-if="canDelete"
              :class="css({ color: 'var(--mp-text-critical)' })"
              @click="deleteModalOpen = true"
            >
              Delete
            </MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="detail-stage">

      <!-- ── Warehouse info ── -->
      <section class="wh-info">
        <h2 class="wh-info-title">Warehouse info</h2>
        <dl class="wh-info-list">
          <div v-for="row in infoRows" :key="row.label" class="wh-info-row">
            <dt class="wh-info-label">{{ row.label }}</dt>
            <dd v-if="row.key === 'pic'" class="wh-info-value">
              <span v-if="warehouse.pics.length" class="wh-pic-tags">
                <span v-for="p in warehouse.pics" :key="p.id" class="wh-pic-tag">{{ p.name }}</span>
              </span>
              <template v-else>—</template>
            </dd>
            <dd v-else class="wh-info-value">{{ row.value }}</dd>
          </div>
        </dl>
        <a class="detail-updated" @click.prevent="activityOpen = true">
          Last updated by {{ warehouse.updatedBy }} on {{ formatUpdatedAt(warehouse.updatedAt) }}
        </a>
      </section>

      <!-- ── Tabs ── -->
      <MpTabs id="wh-detail-tabs" :default-value="0" variant-color="green" class="detail-tabs">
        <MpTabList>
          <MpTab id="wh-tab-products" value="products">Products</MpTab>
          <MpTab id="wh-tab-batches" value="batches">Batches</MpTab>
          <MpTab id="wh-tab-serial" value="serial">Serial numbers</MpTab>
          <MpTab v-if="!isWmsOps" id="wh-tab-transactions" value="transactions">Transactions</MpTab>
          <MpTab id="wh-tab-locations" value="locations">Storage locations</MpTab>
        </MpTabList>
        <MpTabPanels>
          <MpTabPanel value="products">
            <div ref="productsTableEl" class="wh-products-table" @scroll.capture="onTableScroll">
            <ErpTablePage
              ref="productsTableRef"
              :class="['erp-products', { 'erp-products--bordered': hasMultiLocProduct }]"
              :columns="stockColumns"
              :rows="pagedStock"
              :total="filteredStock.length"
              :current-page="productsPage"
              :per-page="productsPerPage"
              :sort-key="stockSortKey"
              :sort-dir="stockSortDir"
              :has-active-filter="!!search"
              @page-change="onProductsPageChange"
              @per-page-change="onProductsPerPageChange"
              @sort-change="setStockSort"
              @hide-column="hideStockColumn"
              @clear-filters="search = ''"
            >
              <!-- toolbar: airene · columns · export · search (right-aligned) -->
              <template #filters>
                <div class="wh-toolbar">
                  <MpTooltip id="wh-tt-airene" label="Ask Airene" placement="bottom" use-portal>
                    <button class="wh-tool-btn wh-tool-btn--airene" aria-label="Ask Airene" @click="toggleAirene?.()">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                        <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                        <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
                      </svg>
                    </button>
                  </MpTooltip>
                  <ColumnSettingsMenu id="wh-tt-columns" :items="stockColItems" :visibility="stockColVisibility" />
                  <MpTooltip id="wh-tt-export" label="Export" placement="bottom" use-portal>
                    <button class="wh-tool-btn" aria-label="Export">
                      <MpIcon name="download" size="md" />
                    </button>
                  </MpTooltip>
                  <div class="wh-search">
                    <MpIcon name="search" size="md" />
                    <input v-model="search" class="wh-search-input" type="text" placeholder="Search..." />
                  </div>
                </div>
              </template>

              <!-- Name: product photo + name + subtitle, with "View details" on row hover -->
              <template #cell-name="{ row }">
                <div class="cell-with-action">
                  <div class="wh-product">
                    <img class="wh-thumb" :src="(row as any).photo" :alt="(row as any).name" loading="lazy" />
                    <span class="wh-product-text">
                      <span class="wh-product-name">{{ (row as any).name }}</span>
                      <ClampText class="wh-product-sub" :text="(row as any).subtitle" />
                    </span>
                  </div>
                  <button class="row-hover-btn" @click.stop>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span class="row-hover-btn__label">VIEW DETAILS</span>
                  </button>
                </div>
              </template>

              <!-- qty columns: always wrapped with top-align + 10px padding; split per location when multi-bin -->
              <template #cell-onHand="{ row, value }">
                <template v-if="locBreakdown(row as any)">
                  <div v-for="bd in locBreakdown(row as any)!" :key="bd.loc" class="wh-col-row wh-col-row--right">{{ formatNum(bd.onHand) }}</div>
                </template>
                <div v-else class="wh-col-row wh-col-row--right">{{ formatNum(value as number) }}</div>
              </template>
              <template #cell-reserved="{ row, value }">
                <template v-if="locBreakdown(row as any)">
                  <div v-for="bd in locBreakdown(row as any)!" :key="bd.loc" class="wh-col-row wh-col-row--right">{{ formatNum(bd.reserved) }}</div>
                </template>
                <div v-else class="wh-col-row wh-col-row--right">{{ formatNum(value as number) }}</div>
              </template>
              <template #cell-available="{ row, value }">
                <template v-if="locBreakdown(row as any)">
                  <div v-for="bd in locBreakdown(row as any)!" :key="bd.loc" class="wh-col-row wh-col-row--right">{{ formatNum(bd.available) }}</div>
                </template>
                <div v-else class="wh-col-row wh-col-row--right">{{ formatNum(value as number) }}</div>
              </template>
              <template #cell-onTheWay="{ value }">{{ formatNum(value as number) }}</template>
              <template #cell-minStock="{ value }">{{ formatNum(value as number) }}</template>

              <!-- category: multi-category list with view more/less -->
              <template #cell-category="{ row }">
                <template v-if="(row as any).categories?.length">
                  <ul class="wh-cat-list">
                    <li v-for="cat in (expandedCategories.has((row as any).id) ? (row as any).categories : (row as any).categories.slice(0, CAT_MAX))" :key="cat" class="wh-cat-item">{{ cat }}</li>
                  </ul>
                  <button v-if="(row as any).categories.length > CAT_MAX" class="wh-cat-toggle" type="button" @click.stop="toggleCategories((row as any).id)">
                    {{ expandedCategories.has((row as any).id) ? 'View less' : `+${(row as any).categories.length - CAT_MAX} more` }}
                  </button>
                </template>
                <template v-else>{{ (row as any).category }}</template>
              </template>

              <!-- location: always bordered left+right (via :deep td[data-col]); split rows per bin when multi-bin -->
              <template #cell-locations="{ row }">
                <template v-if="locBreakdown(row as any)">
                  <div v-for="bd in locBreakdown(row as any)!" :key="bd.loc" class="wh-col-row wh-col-row--loc">{{ bd.loc }}</div>
                </template>
                <div v-else class="wh-col-row wh-col-row--loc">{{ (row as any).locations[0] }}</div>
              </template>

              <!-- money columns -->
              <template #cell-lastUpdated="{ row }">
                <LastUpdatedCell v-bind="lastUpdatedFor((row as Record<string, unknown>).id as string)" />
              </template>

              <!-- per-row kebab (sticky-right actions column; un-sticks at scroll end) -->
              <template #actions="{ row }">
                <MpPopover :id="`wh-stock-${(row as any).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                  <MpPopoverTrigger>
                    <button class="row-kebab" aria-label="More actions">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                      </svg>
                    </button>
                  </MpPopoverTrigger>
                  <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
                    <MpPopoverList>
                      <MpPopoverListItem>View product</MpPopoverListItem>
                      <MpPopoverListItem>Adjust stock</MpPopoverListItem>
                    </MpPopoverList>
                  </MpPopoverContent>
                </MpPopover>
              </template>

              <!-- full empty state -->
              <template #empty>
                <div class="empty-full">
                  <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
                  <p class="empty-full-title">No products</p>
                  <p class="empty-full-desc">Products in this warehouse will appear here.</p>
                </div>
              </template>
            </ErpTablePage>
            </div>
          </MpTabPanel>

          <MpTabPanel value="batches">
            <!-- toolbar: expiry filter (left) + airene · columns · export · search (right) -->
            <div class="wh-filter-bar">
              <div class="wh-expiry-filter">
                <MpPopover id="wh-expiry-preset" :is-close-on-select="false" use-portal placement="bottom-start">
                  <MpPopoverTrigger>
                    <MpSelect
                      id="wh-expiry-select"
                      placeholder="Expiry date range"
                      :model-value="expiryPreset"
                      is-clearable
                      @mousedown.prevent
                      @clear="clearExpiryFilter"
                    >
                      <option v-if="expiryPreset" :value="expiryPreset">{{ expiryLabel }}</option>
                    </MpSelect>
                  </MpPopoverTrigger>
                  <MpPopoverContent :class="css({ minWidth: '220px', width: 'max-content' })">
                    <MpPopoverList>
                      <MpPopoverListItem
                        v-for="opt in expiryPresets"
                        :key="opt.value"
                        :is-active="opt.value === expiryPreset"
                        @click="expiryPreset = opt.value"
                      >{{ opt.label }}</MpPopoverListItem>
                    </MpPopoverList>
                    <div v-if="expiryPreset === 'custom'" class="wh-expiry-custom">
                      <MpDatePicker id="wh-expiry-from" v-model="expiryFrom" placeholder="From" format="DD/MM/YYYY" use-portal />
                      <MpDatePicker id="wh-expiry-to"   v-model="expiryTo"   placeholder="To"   format="DD/MM/YYYY" use-portal />
                    </div>
                  </MpPopoverContent>
                </MpPopover>
              </div>
              <div class="wh-toolbar">
                <MpTooltip id="wh-bt-airene" label="Ask Airene" placement="bottom" use-portal>
                  <button class="wh-tool-btn wh-tool-btn--airene" aria-label="Ask Airene" @click="toggleAirene?.()">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                      <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
                    </svg>
                  </button>
                </MpTooltip>
                <ColumnSettingsMenu id="wh-bt-columns" :items="batchColItems" :visibility="batchColVisibility" />
                <MpTooltip id="wh-bt-export" label="Export" placement="bottom" use-portal>
                  <button class="wh-tool-btn" aria-label="Export"><MpIcon name="download" size="md" /></button>
                </MpTooltip>
                <div class="wh-search">
                  <MpIcon name="search" size="md" />
                  <input v-model="batchSearch" class="wh-search-input" type="text" placeholder="Search..." />
                </div>
              </div>
            </div>

            <!-- custom table: Product & SKU are merged (rowspan) across each group's batch rows -->
            <div v-if="filteredBatchProducts.length" class="wh-batch-scroll">
              <table :class="['wh-batch-table', { 'wh-batch-table--bordered': hasBatchMergedRows }]">
                <colgroup>
                  <col style="width: 320px" />
                  <col v-if="batchColVisibility.sku" style="width: 200px" />
                  <col v-if="batchColVisibility.batch" style="width: 160px" />
                  <col v-if="batchColVisibility.location" style="width: 210px" />
                  <col v-if="batchColVisibility.expiry" style="width: 170px" />
                  <col v-if="batchColVisibility.onHand" style="width: 120px" />
                  <col v-if="batchColVisibility.reserved" style="width: 120px" />
                  <col v-if="batchColVisibility.available" style="width: 120px" />
                  <col v-if="batchColVisibility.unit" style="width: 90px" />
                  <col v-if="batchColVisibility.lastUpdated" style="width: 200px" />
                </colgroup>
                <thead>
                  <tr>
                    <th class="wh-bth">Product</th>
                    <th v-if="batchColVisibility.sku" class="wh-bth">SKU</th>
                    <th v-if="batchColVisibility.batch" class="wh-bth">Batch</th>
                    <th v-if="batchColVisibility.location" class="wh-bth">Location</th>
                    <th v-if="batchColVisibility.expiry" class="wh-bth">Expiry date</th>
                    <th v-if="batchColVisibility.onHand" class="wh-bth wh-bth--num">On hand qty</th>
                    <th v-if="batchColVisibility.reserved" class="wh-bth wh-bth--num">Reserved qty</th>
                    <th v-if="batchColVisibility.available" class="wh-bth wh-bth--num">Available qty</th>
                    <th v-if="batchColVisibility.unit" class="wh-bth">Unit</th>
                    <th v-if="batchColVisibility.lastUpdated" class="wh-bth">Last updated</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="p in filteredBatchProducts" :key="p.id">
                    <!-- group summary row — Product & SKU span the whole group;
                         click anywhere on the row toggles the accordion -->
                    <tr class="wh-batch-group-row" @click="toggleBatch(p.id)">
                      <td
                        class="wh-btd wh-btd--product wh-batch-cell"
                        :rowspan="isBatchExpanded(p.id) ? visibleBatches(p).length + 1 : 1"
                      >
                        <div class="wh-batch-product">
                          <button
                            class="wh-expand-btn"
                            :aria-label="isBatchExpanded(p.id) ? 'Collapse' : 'Expand'"
                          >
                            <svg
                              width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                              class="wh-expand-chevron" :class="{ 'wh-expand-chevron--open': isBatchExpanded(p.id) }"
                            >
                              <path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                          </button>
                          <div class="wh-product">
                            <img class="wh-thumb" :src="p.photo" :alt="p.name" loading="lazy" />
                            <span class="wh-product-text">
                              <span class="wh-product-name">{{ p.name }}</span>
                              <ClampText class="wh-product-sub" :text="p.subtitle" />
                            </span>
                          </div>
                        </div>
                        <button class="row-hover-btn row-hover-btn--top" @click.stop>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                          <span class="row-hover-btn__label">VIEW DETAILS</span>
                        </button>
                      </td>
                      <td v-if="batchColVisibility.sku" class="wh-btd wh-btd--sku" :rowspan="isBatchExpanded(p.id) ? visibleBatches(p).length + 1 : 1">
                        {{ p.sku }}
                      </td>
                      <td v-if="batchColVisibility.batch" class="wh-btd" :colspan="batchColVisibility.location ? 2 : 1"><span class="wh-batch-summary">{{ batchCountLabel(visibleBatches(p).length) }}</span></td>
                      <td v-if="!batchColVisibility.batch && batchColVisibility.location" class="wh-btd"></td>
                      <td v-if="batchColVisibility.expiry" class="wh-btd"></td><!-- Expiry date -->
                      <td v-if="batchColVisibility.onHand" class="wh-btd wh-btd--num">{{ formatNum(p.onHand) }}</td>
                      <td v-if="batchColVisibility.reserved" class="wh-btd wh-btd--num">{{ formatNum(p.reserved) }}</td>
                      <td v-if="batchColVisibility.available" class="wh-btd wh-btd--num">{{ formatNum(p.available) }}</td>
                      <td v-if="batchColVisibility.unit" class="wh-btd">{{ p.unit }}</td>
                      <td v-if="batchColVisibility.lastUpdated" class="wh-btd"><LastUpdatedCell v-bind="lastUpdatedFor(p.id)" /></td>
                    </tr>
                    <!-- batch rows (only when expanded) -->
                    <tr v-for="b in (isBatchExpanded(p.id) ? visibleBatches(p) : [])" :key="b.batchNo" class="wh-batch-child-row">
                      <td v-if="batchColVisibility.batch" class="wh-btd wh-batch-cell">
                        <span>{{ b.batchNo }}</span>
                        <button class="row-hover-btn" @click.stop>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                          <span class="row-hover-btn__label">VIEW DETAILS</span>
                        </button>
                      </td>
                      <td v-if="batchColVisibility.location" class="wh-btd wh-loc-cell">{{ b.location }}</td>
                      <td v-if="batchColVisibility.expiry" class="wh-btd">
                        <span class="wh-expiry-cell" :class="{ 'wh-expiry-cell--danger': isExpiryWarning(b.expiryDate) }">
                          {{ formatDateNumeric(b.expiryDate) }}
                          <MpTooltip
                            v-if="isExpiryWarning(b.expiryDate)"
                            :id="`wh-tt-exp-${p.id}-${b.batchNo}`"
                            :label="expiryTooltip(b.expiryDate)"
                            placement="top"
                            use-portal
                          >
                            <span class="wh-expiry-warn" @click.stop>
                              <MpIcon name="warning-triangle" size="sm" />
                            </span>
                          </MpTooltip>
                        </span>
                      </td>
                      <td v-if="batchColVisibility.onHand" class="wh-btd wh-btd--num">{{ formatNum(b.onHand) }}</td>
                      <td v-if="batchColVisibility.reserved" class="wh-btd wh-btd--num">{{ formatNum(b.reserved) }}</td>
                      <td v-if="batchColVisibility.available" class="wh-btd wh-btd--num">{{ formatNum(b.available) }}</td>
                      <td v-if="batchColVisibility.unit" class="wh-btd">{{ p.unit }}</td>
                      <td v-if="batchColVisibility.lastUpdated" class="wh-btd" />
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>

            <!-- empty state (no horizontal scroll — replaces the table entirely) -->
            <div v-else class="empty-full">
              <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
              <p class="empty-full-title">No batches</p>
              <p class="empty-full-desc">Batch-tracked products in this warehouse will appear here.</p>
            </div>

            <ErpPagination
              v-if="filteredBatchProducts.length"
              :current-page="1"
              :per-page="25"
              :total="filteredBatchProducts.length"
            />
          </MpTabPanel>
          <MpTabPanel value="serial">
            <!-- toolbar: airene · columns · export · search (right-aligned) -->
            <div class="wh-filter-bar wh-filter-bar--end">
              <div class="wh-toolbar">
                <MpTooltip id="wh-st-airene" label="Ask Airene" placement="bottom" use-portal>
                  <button class="wh-tool-btn wh-tool-btn--airene" aria-label="Ask Airene" @click="toggleAirene?.()">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                      <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
                    </svg>
                  </button>
                </MpTooltip>
                <ColumnSettingsMenu id="wh-st-columns" :items="serialColItems" :visibility="serialColVisibility" />
                <MpTooltip id="wh-st-export" label="Export" placement="bottom" use-portal>
                  <button class="wh-tool-btn" aria-label="Export"><MpIcon name="download" size="md" /></button>
                </MpTooltip>
                <div class="wh-search">
                  <MpIcon name="search" size="md" />
                  <input v-model="serialSearch" class="wh-search-input" type="text" placeholder="Search..." />
                </div>
              </div>
            </div>

            <!-- custom table: Product & SKU merged (rowspan); expanded row lists serials -->
            <div v-if="filteredSerialProducts.length" class="wh-batch-scroll">
              <table class="wh-batch-table">
                <colgroup>
                  <col style="width: 320px" />
                  <col v-if="serialColVisibility.sku" style="width: 200px" />
                  <col v-if="serialColVisibility.available" style="width: 260px" />
                  <col v-if="serialColVisibility.reserved" style="width: 260px" />
                  <col v-if="serialColVisibility.lastUpdated" style="width: 200px" />
                </colgroup>
                <thead>
                  <tr>
                    <th class="wh-bth">Product</th>
                    <th v-if="serialColVisibility.sku" class="wh-bth">SKU</th>
                    <th v-if="serialColVisibility.available" class="wh-bth">Available qty</th>
                    <th v-if="serialColVisibility.reserved" class="wh-bth">Reserved qty</th>
                    <th v-if="serialColVisibility.lastUpdated" class="wh-bth">Last updated</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="p in filteredSerialProducts" :key="p.id">
                    <tr class="wh-batch-group-row">
                      <td class="wh-btd wh-btd--product wh-batch-cell">
                        <div class="wh-batch-product">
                          <div class="wh-product">
                            <img class="wh-thumb" :src="p.photo" :alt="p.name" loading="lazy" />
                            <span class="wh-product-text">
                              <span class="wh-product-name">{{ p.name }}</span>
                              <ClampText class="wh-product-sub" :text="p.subtitle" />
                            </span>
                          </div>
                        </div>
                        <button class="row-hover-btn row-hover-btn--top" @click.stop>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                          <span class="row-hover-btn__label">VIEW DETAILS</span>
                        </button>
                      </td>
                      <td v-if="serialColVisibility.sku" class="wh-btd wh-btd--sku">{{ p.sku }}</td>
                      <td v-if="serialColVisibility.available" class="wh-btd">
                        <div class="cell-with-action">
                          <span class="wh-serial-count">{{ serialCountLabel(p.serials.available.length) }}</span>
                          <button class="row-hover-btn" @click.stop="openSerialDrawer(p, 'available')">
                            <span class="row-hover-btn__label">VIEW DETAILS</span>
                          </button>
                        </div>
                      </td>
                      <td v-if="serialColVisibility.reserved" class="wh-btd">
                        <div class="cell-with-action">
                          <span class="wh-serial-count">{{ serialCountLabel(p.serials.reserved.length) }}</span>
                          <button class="row-hover-btn" @click.stop="openSerialDrawer(p, 'reserved')">
                            <span class="row-hover-btn__label">VIEW DETAILS</span>
                          </button>
                        </div>
                      </td>
                      <td v-if="serialColVisibility.lastUpdated" class="wh-btd"><LastUpdatedCell v-bind="lastUpdatedFor(p.id)" /></td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>

            <!-- empty state (no horizontal scroll — replaces the table entirely) -->
            <div v-else class="empty-full">
              <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
              <p class="empty-full-title">No serial numbers</p>
              <p class="empty-full-desc">Serial-tracked products in this warehouse will appear here.</p>
            </div>

            <ErpPagination
              v-if="filteredSerialProducts.length"
              :current-page="1"
              :per-page="25"
              :total="filteredSerialProducts.length"
            />
          </MpTabPanel>
          <MpTabPanel v-if="!isWmsOps" value="transactions">
            <div class="empty-full">
              <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
              <p class="empty-full-title">No transactions</p>
              <p class="empty-full-desc">Transactions in this warehouse will appear here.</p>
            </div>
          </MpTabPanel>

          <!-- Storage locations — tree table (Floor → Zone → Rack → Bin) -->
          <MpTabPanel value="locations">
            <!-- empty state (e.g. the default warehouse has no locations) -->
            <div v-if="!locTree.length" class="empty-full">
              <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
              <p class="empty-full-title">No storage locations</p>
              <p class="empty-full-desc">Storage locations for this warehouse will appear here.</p>
              <MpButton variant="tertiary" is-rounded left-icon="add" class="wh-loc-empty-cta" @click="openNewLoc">New location</MpButton>
            </div>

            <template v-else>
            <div class="wh-loc-filterbar">
              <div class="wh-search">
                <MpIcon name="search" size="md" />
                <input v-model="locSearch" class="wh-search-input" type="text" placeholder="Search location..." />
              </div>
              <MpButton variant="tertiary" is-rounded left-icon="add" @click="openNewLoc">New location</MpButton>
            </div>

            <div class="wh-loc-scroll">
              <table class="wh-loc-table">
                <colgroup>
                  <col style="width: 420px" />
                  <col style="width: 120px" />
                  <col /><!-- filler: pushes the action button to the far right -->
                </colgroup>
                <thead>
                  <tr>
                    <th class="wh-bth">Location name</th>
                    <th class="wh-bth">SKU qty</th>
                    <th class="wh-bth" />
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in flatLocations"
                    :key="row.node.id"
                    class="wh-loc-row"
                    :class="{ 'wh-loc-row--branch': row.hasChildren }"
                    @click="toggleLoc(row.node)"
                  >
                    <td class="wh-btd wh-loc-name-td">
                      <div class="wh-loc-name" :style="{ paddingLeft: `${row.depth * 24}px` }">
                        <svg
                          v-if="row.hasChildren"
                          class="wh-loc-chevron" :class="{ 'wh-loc-chevron--open': row.open }"
                          width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                        >
                          <path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        <span v-else class="wh-loc-chevron-spacer" />
                        <MpTooltip
                          :id="`wh-loc-type-${row.node.id}`"
                          :label="row.node.type"
                          placement="top"
                          use-portal
                        >
                          <MpIcon
                            :name="row.node.type === 'Storage' ? 'products' : 'folder-close'"
                            size="md"
                            class="wh-loc-type-icon"
                            :class="row.node.type === 'Storage' ? 'wh-loc-type-icon--storage' : 'wh-loc-type-icon--org'"
                          />
                        </MpTooltip>
                        <span class="wh-loc-name-text">{{ row.node.name }}</span>
                        <button class="wh-loc-view" @click.stop="viewLocation(row.node)">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                          <span class="row-hover-btn__label">VIEW DETAILS</span>
                        </button>
                      </div>
                    </td>
                    <td class="wh-btd">{{ formatNum(row.node.skuQty) }}</td>
                    <td class="wh-btd wh-loc-td--action">
                      <MpPopover :id="`wh-loc-actions-${row.node.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                        <MpPopoverTrigger>
                          <button class="row-kebab" aria-label="More actions" @click.stop>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
                            </svg>
                          </button>
                        </MpPopoverTrigger>
                        <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
                          <MpPopoverList>
                            <MpPopoverListItem @click="addSubLoc(row.node)">Add sub-location</MpPopoverListItem>
                            <MpPopoverListItem :class="css({ color: 'var(--mp-text-critical)' })" @click="deleteLoc(row.node)">Delete</MpPopoverListItem>
                          </MpPopoverList>
                        </MpPopoverContent>
                      </MpPopover>
                    </td>
                  </tr>
                  <tr v-if="!flatLocations.length">
                    <td class="wh-btd wh-loc-empty" colspan="3">No storage locations found.</td>
                  </tr>
                </tbody>
              </table>
            </div>
            </template>
          </MpTabPanel>
        </MpTabPanels>
      </MpTabs>

    </div><!-- /detail-stage -->

    <!-- ── Archive confirmation modal (same content as the index page's) ── -->
    <MpModal
      id="wh-detail-archive-modal"
      :is-open="archiveModalOpen"
      size="md"
      is-close-on-esc
      is-close-on-overlay-click
      :is-keep-alive="false"
      @close="archiveModalOpen = false"
    >
      <MpModalContent>
        <MpModalHeader>
          Archive warehouse?
          <MpModalCloseButton />
        </MpModalHeader>
        <MpModalBody>
          <div class="archive-modal-body">
            <p>Archiving this warehouse will:</p>
            <ul>
              <li>Hide it from all transaction forms.</li>
              <li>Stop recurring transactions in Sales and Purchases.</li>
              <li>Block draft transactions linked to this warehouse from being approved.</li>
              <li>Disable multilevel storage.</li>
              <li>May cause sync issues with Moka POS.</li>
            </ul>
            <p class="archive-modal-body__note">To avoid disruption, reassign open transactions to another warehouse before archiving.</p>
          </div>
        </MpModalBody>
        <MpModalFooter>
          <div class="modal-footer-btns">
            <button class="btn-enterprise btn-enterprise--ghost" @click="archiveModalOpen = false">Cancel</button>
            <button class="btn-enterprise btn-enterprise--primary" @click="confirmArchive">Archive</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- ── Delete confirmation modal ── -->
    <MpModal
      id="wh-detail-delete-modal"
      :is-open="deleteModalOpen"
      size="sm"
      is-close-on-esc
      is-close-on-overlay-click
      :is-keep-alive="false"
      @close="deleteModalOpen = false"
    >
      <MpModalContent>
        <MpModalHeader>
          Delete warehouse?
          <MpModalCloseButton />
        </MpModalHeader>
        <MpModalBody>
          Deleted warehouse cannot be restored.
        </MpModalBody>
        <MpModalFooter>
          <div class="modal-footer-btns">
            <button class="btn-enterprise btn-enterprise--ghost" @click="deleteModalOpen = false">Cancel</button>
            <button class="btn-enterprise btn-enterprise--danger" @click="confirmDelete">Delete</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <ActivityLogModal
      v-if="warehouse"
      :is-open="activityOpen"
      :subject="warehouse.name"
      :entries="activityEntries"
      @close="activityOpen = false"
    />

    <!-- New location drawer (shared component) -->
    <NewLocationDrawer
      v-if="warehouse"
      :is-open="newLocOpen"
      :warehouse-id="warehouse.id"
      :parent-id="newLocParentId"
      @update:is-open="newLocOpen = $event"
      @saved="onLocSaved"
    />

    <StockSerialDrawer
      :open="serialDrawerOpen"
      :product="serialDrawerProduct"
      :initial-tab="serialDrawerTab"
      @update:open="serialDrawerOpen = $event"
    />

  </div>
</template>

<style scoped>
/* ── Storage locations (tree table) ── */
.wh-loc-filterbar { display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-4); }
.wh-loc-scroll { overflow-x: auto; }
.wh-loc-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.wh-loc-table .wh-btd { vertical-align: middle; }
.wh-loc-row--branch { cursor: pointer; }
.wh-loc-table tbody tr:hover .wh-btd { background: var(--mp-background-neutral-hovered); }
.wh-loc-name { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.wh-loc-name-text { color: var(--mp-text-default); }
/* type marker: folder = Organizational (grouping), box = Storage (holds stock) */
.wh-loc-type-icon { flex-shrink: 0; display: inline-flex; }
.wh-loc-type-icon--org { color: var(--mp-icon-default, var(--mp-text-secondary)); }
.wh-loc-type-icon--storage { color: var(--mp-icon-brand, var(--mp-colors-emerald-600, #0f9d58)); }
.wh-loc-code { text-transform: uppercase; flex-shrink: 0; }
/* "View details" chip sits inline right after the name/code. Kept in layout with
   visibility (not display) + a fixed height so revealing it on hover never shifts
   the row height. */
.wh-loc-view {
  visibility: hidden;
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1\.5);
  margin-left: var(--mp-spacing-2); flex-shrink: 0;
  height: 20px; box-sizing: border-box; padding: 0 var(--mp-spacing-1\.5);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-sm); cursor: pointer; color: var(--mp-text-secondary);
}
.wh-loc-view .row-hover-btn__label { font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase; color: var(--mp-text-secondary); }
.wh-loc-row:hover .wh-loc-view { visibility: visible; }
.wh-loc-chevron { flex-shrink: 0; transition: transform 0.15s ease; color: var(--mp-icon-default, var(--mp-text-secondary)); }
.wh-loc-chevron--open { transform: rotate(90deg); }
.wh-loc-chevron-spacer { display: inline-block; width: 16px; flex-shrink: 0; }
/* trim vertical padding so the 32px kebab keeps the row at 40px (not 52px).
   Two-class selector to beat `.wh-btd`'s shorthand padding declared later in the file. */
.wh-loc-table .wh-loc-td--action { text-align: right; padding-top: var(--mp-spacing-1); padding-bottom: var(--mp-spacing-1); }
.wh-loc-empty { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-6); }
.wh-loc-empty-cta { margin-top: var(--mp-spacing-3); }

.detail-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* ── Title bar ── */
.detail-bar {
  flex-shrink: 0;
  height: var(--mp-sizes-18, 72px);
  box-sizing: border-box;
  background: var(--mp-background-neutral-subtle);
  padding: 0 var(--mp-spacing-6);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
}
.detail-bar-left {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0;
  min-width: 0;
}
.detail-breadcrumb {
  align-self: flex-start;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: 12px;
  color: var(--mp-text-link);
  line-height: var(--mp-line-heights-md);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
}
.detail-title {
  margin: 0;
  font-size: var(--mp-font-sizes-2xl, 24px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px;
  letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}

/* Jump-to-warehouse chevron + popover */
.detail-jump-chevron {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px);
  background: none; border: none; padding: 0;
  border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default);
}
.detail-jump-chevron:hover { background: var(--mp-background-neutral-hovered); }
.detail-jump { display: flex; flex-direction: column; }
.detail-jump-search-wrap { padding: var(--mp-spacing-3); }
.detail-jump-search {
  width: 100%; box-sizing: border-box;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none;
  background: var(--mp-background-surface);
}
.detail-jump-search:focus { border-color: var(--mp-border-brand-bold, #029861); }
.detail-jump-search::placeholder { color: var(--mp-text-placeholder); }
.detail-jump-list { display: flex; flex-direction: column; }
.detail-jump-item {
  display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5);
  width: 100%; text-align: left; background: none; border: none; cursor: pointer;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
}
.detail-jump-item:hover { background: var(--mp-background-neutral-subtle); }
.detail-jump-item-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.detail-jump-item-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-jump-empty { margin: 0; padding: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* Actions button (primary, emerald) */
.detail-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer;
  border: 1px solid transparent;
  white-space: nowrap;
  font-family: inherit;
}
.detail-btn--primary {
  background: var(--mp-colors-emerald-700, #029861);
  border-color: var(--mp-colors-emerald-700, #029861);
  color: var(--mp-text-inverse);
}
.detail-btn--primary:hover {
  background: var(--mp-colors-emerald-800, #186f4a);
  border-color: var(--mp-colors-emerald-800, #186f4a);
}

/* ── Stage ── */
.detail-stage {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-8);
}

/* ── Warehouse info ── */
.wh-info { display: flex; flex-direction: column; }
.wh-info-title {
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px);
  color: var(--mp-text-default);
}
.wh-info-list { margin: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.wh-info-row { display: flex; align-items: flex-start; gap: var(--mp-spacing-4); }
.wh-info-label {
  flex-shrink: 0;
  width: 160px;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
}
.wh-info-value {
  margin: 0;
  flex: 1;
  max-width: 640px;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
}

/* Last updated link */
.detail-updated {
  margin-top: var(--mp-spacing-8);
  align-self: flex-start;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-link);
  cursor: pointer;
}
.detail-updated:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Tabs ── */
.detail-tabs { margin-top: 0; }
.detail-tabs :deep(.mp-tab--isSelected_true),
.detail-tabs :deep(.mp-tab--isSelected_true:hover) {
  color: var(--mp-text-selected) !important;
}
/* colour the underline ONLY on the active tab (each tab ships its own border node) */
.detail-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) {
  background-color: var(--mp-border-selected, #029861) !important;
}
.detail-tabs :deep([data-pixel-component="MpTabList"]) {
  margin-bottom: var(--mp-spacing-5) !important;
}
.wh-tab-empty {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}

/* ── Batches filter bar (expiry filter left, toolbar right) ── */
.wh-filter-bar {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-3);
  margin-bottom: var(--mp-spacing-5);   /* 20px gap to the table */
}
.wh-filter-bar .wh-toolbar { width: auto; }
/* serial tab has only the toolbar (no expiry filter) → push it to the right */
.wh-filter-bar--end { justify-content: flex-end; }
.wh-expiry-filter { flex-shrink: 0; }
.wh-expiry-custom {
  display: flex; flex-direction: column; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-3);
  border-top: 1px solid var(--mp-border-default);
}

/* ── Products toolbar (right-aligned inside ErpTablePage's #filters slot) ── */
.wh-toolbar {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: flex-end;
  gap: var(--mp-spacing-2);
}
.wh-tool-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-9, 36px);
  height: var(--mp-sizes-9, 36px);
  border-radius: var(--mp-radii-md);
  background: none;
  border: none;
  cursor: pointer;
  color: var(--mp-icon-default);
}
.wh-tool-btn:hover { background: var(--mp-background-neutral-hovered); }
.wh-tool-btn--airene { color: var(--mp-airene-default, #651fff); }
.wh-search {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral);
  color: var(--mp-text-secondary);
  min-width: 220px;
}
/* neutral slate focus, consistent with all ERP form fields (border-bold = #8C9596) */
.wh-search:focus-within {
  border-color: var(--mp-border-bold);
  box-shadow: 0 0 0 1px var(--mp-border-bold);
}
.wh-search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md);
  outline: none;
}
.wh-search-input::placeholder { color: var(--mp-text-placeholder); }

/* ── Product cell (Name column: product photo + name + subtitle) ── */
.cell-with-action { position: relative; display: flex; align-items: flex-start; width: 100%; min-width: 0; }
.wh-product { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); min-width: 0; }
/* "View details" chip — revealed on row hover (ErpTablePage row-hover pattern) */
.row-hover-btn {
  position: absolute;
  right: var(--mp-spacing-4);   /* 16px gap from the cell's right edge */
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
  color: var(--mp-text-secondary);
}
.row-hover-btn__label {
  font-size: var(--mp-font-sizes-2xs, 10px);
  font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase;
  color: var(--mp-text-secondary);
}
/* reveal on hovering the Name cell — self-contained (same scope), so it works
   even though the Name column is position:sticky and rendered via a slot */
.cell-with-action:hover .row-hover-btn { display: flex; }
/* also reveal on full-row hover where that selector resolves (parity with index) */
:global(.erp-tr:hover .row-hover-btn) { display: flex; }
.wh-thumb {
  flex-shrink: 0;
  width: var(--mp-sizes-8, 32px);
  height: var(--mp-sizes-8, 32px);
  border-radius: var(--mp-radii-sm);
  object-fit: cover;
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default);
}
.wh-product-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.wh-product-name { color: var(--mp-text-default); }
.wh-product-sub {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-subtle);
  margin-top: var(--mp-spacing-0\.5);
}
/* Strip td padding on the 4 wrapper columns so .wh-col-row fills the full cell */
:deep(.erp-products td[data-col="locations"]),
:deep(.erp-products td[data-col="onHand"]),
:deep(.erp-products td[data-col="reserved"]),
:deep(.erp-products td[data-col="available"]) {
  padding: 0;
}
/* If any product has multiple locations, border ALL columns in the whole table.
   border-collapse: collapse on the table prevents double borders between adjacent cells. */
:deep(.erp-products--bordered td:not(.erp-td--actions)),
:deep(.erp-products--bordered th:not(.erp-th--actions)) {
  border-right: 1px solid var(--mp-border-default);
}

/* Row within a bordered td — restores the cell padding and handles multi-row split */
.wh-col-row {
  min-height: var(--mp-sizes-10);
  display: flex;
  align-items: center;
  padding: 0 var(--mp-spacing-4) 0 var(--mp-spacing-2);
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
  box-sizing: border-box;
}
/* Location: top-aligned, 10px padding top/bottom */
.wh-col-row--loc {
  align-items: flex-start;
  padding-top: var(--mp-spacing-2\.5);
  padding-bottom: var(--mp-spacing-2\.5);
}
/* Qty: right-aligned, top-aligned, 10px top/bottom padding */
.wh-col-row--right {
  align-items: flex-start;
  justify-content: flex-end;
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-2) var(--mp-spacing-2\.5) var(--mp-spacing-4);
  font-variant-numeric: tabular-nums;
}
/* Divider between split sub-rows */
.wh-col-row:not(:last-child) {
  border-bottom: 1px solid var(--mp-border-default);
}
.wh-cat-list { margin: 0; padding: 0 0 0 var(--mp-spacing-4); list-style: disc; display: flex; flex-direction: column; gap: 2px; }
.wh-cat-item { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: normal; }
.wh-cat-toggle {
  margin-top: var(--mp-spacing-1); padding: 0; border: none; background: none;
  cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link);
  white-space: nowrap;
}
.wh-cat-toggle:hover { text-decoration: underline; }

/* ── Batch table cells ── */
.wh-batch-product { display: flex; align-items: flex-start; gap: var(--mp-spacing-1); min-width: 0; }
.wh-expand-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-6, 24px);
  height: var(--mp-sizes-6, 24px);
  margin-top: var(--mp-spacing-1);
  border: none;
  background: none;
  cursor: pointer;
  border-radius: var(--mp-radii-sm);
  color: var(--mp-icon-default);
}
.wh-expand-btn:hover { background: var(--mp-background-neutral-hovered); }
.wh-expand-chevron { transition: transform 0.15s ease; }
.wh-expand-chevron--open { transform: rotate(90deg); }
/* summary row: "N batches" semibold; child row: batch no. default */
.wh-batch-summary { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.wh-serial-count { color: var(--mp-text-default); }
.wh-btd.wh-btd--top { vertical-align: top; }
/* "View details" chip on hover — Product cell + each Batch cell */
.wh-batch-cell { position: relative; }
.wh-batch-cell:hover .row-hover-btn { display: flex; }
/* the Product cell is a tall (rowspan) merged cell → anchor the chip near the
   top so it sits beside the product name, not the middle of the whole group */
.row-hover-btn--top { top: var(--mp-spacing-2-5, 10px); transform: none; }
.wh-batch-no { color: var(--mp-text-default); }
.wh-expiry-cell { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); white-space: nowrap; }
.wh-expiry-cell--danger { color: var(--mp-text-danger, #a8352d); }
.wh-expiry-warn { display: inline-flex; align-items: center; color: var(--mp-text-danger, #a8352d); flex-shrink: 0; cursor: default; }

.row-kebab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-8, 32px);
  height: var(--mp-sizes-8, 32px);
  border-radius: var(--mp-radii-md);
  background: none;
  border: none;
  cursor: pointer;
  color: var(--mp-icon-default);
}
.row-kebab:hover { background: var(--mp-background-neutral-hovered); }

/* ── Products empty state (full, illustrated — matches index pages) ── */
.empty-full {
  display: flex;
  flex-direction: column;
  align-items: center;   /* spacing set per element below, no flex gap */
}
.empty-illustration {
  width: auto;
  height: 240px;         /* natural 288×240 → keep aspect ratio */
  object-fit: contain;
}
.empty-full-title {
  margin: 0 0 var(--mp-spacing-0\.5);   /* 2px → description */
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.empty-full-desc {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}

/* ── Batches custom table (merged Product/SKU via rowspan) ── */
/* horizontal overflow → just a scroll container, NO outer bordered panel
   (the bordered panel is only for the vertical internal-scroll case, >10 rows) */
.wh-batch-scroll {
  overflow-x: auto;
}
.wh-batch-table {
  width: 100%;
  min-width: max-content;
  border-collapse: collapse;
}
/* header — ErpTablePage spec: neutral-subtle gray, 28px, 12px/600 uppercase */
.wh-bth {
  height: var(--mp-sizes-7, 28px);
  text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary);
  text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.wh-bth--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
/* rows — 10px vertical padding; dividers between every row (right columns) */
.wh-btd {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  vertical-align: middle;
  white-space: nowrap;
  background: var(--mp-background-neutral);
}
.wh-btd--num { text-align: right; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }
.wh-btd--product, .wh-btd--sku {
  vertical-align: top;
  white-space: normal;
}
.wh-btd--empty { color: var(--mp-text-secondary); white-space: normal; text-align: center; padding: var(--mp-spacing-6); }
/* batch Location cell — wrap long location paths instead of bleeding */
.wh-loc-cell { white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
/* All-column borders when merged rows exist. border-collapse collapses adjacent rights — no doubling.
   No border-left on first col, no border-right on last col. */
.wh-batch-table--bordered .wh-btd,
.wh-batch-table--bordered .wh-bth { border-right: 1px solid var(--mp-border-default); }
.wh-batch-table--bordered .wh-btd:last-child,
.wh-batch-table--bordered .wh-bth:last-child { border-right: none; }
/* last group has no trailing border (panel border closes it) */
.wh-batch-table tbody tr:hover .wh-btd { background: var(--mp-background-neutral-hovered); }
.wh-batch-group-row { cursor: pointer; }
/* summary cells (Batch/Serial count, qty) align to the top so they line up with the
   first line of the tall product cell — including before the row is expanded */
.wh-batch-group-row .wh-btd { vertical-align: top; }

/* ── PIC tag chips (warehouse info) ── */
.wh-pic-tags { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-1); }
.wh-pic-tag {
  display: inline-flex;
  align-items: center;
  padding: 0 var(--mp-spacing-2);
  height: var(--mp-sizes-6, 24px);
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-default);
  white-space: nowrap;
}

/* ── Scroll-position-aware sticky columns ─────────────────────────────────────
 * Name (first) column is pinned left, but its right separator only appears once
 * the user has scrolled right (`wh-scroll-start` toggled off). The kebab (actions)
 * column is sticky-right by default and un-sticks at the far-right end
 * (`wh-scroll-end`). Classes are toggled in JS (ErpTablePage only knows overflow). */
.detail-tabs :deep(.erp-th:first-child) {
  position: sticky;
  left: 0;
  z-index: 4;
  background: var(--mp-background-neutral-subtle);
}
.detail-tabs :deep(.erp-td:first-child) {
  position: sticky;
  left: 0;
  z-index: 1;
  background: inherit;
}
/* sticky cell uses `inherit` (row bg) which would override ErpTablePage's hover
   rule — re-apply the hovered bg so the Name cell matches the rest of the row */
.detail-tabs :deep(.erp-tr:hover .erp-td:first-child) {
  background: var(--mp-background-neutral-hovered);
}
/* Name right separator — only while scrolled away from the left edge */
.detail-tabs :deep(.erp-table-wrapper.is-overflowing:not(.wh-scroll-start) .erp-th:first-child),
.detail-tabs :deep(.erp-table-wrapper.is-overflowing:not(.wh-scroll-start) .erp-td:first-child) {
  box-shadow: inset -2px 0 var(--mp-border-default);
}
/* Actions column un-sticks (and drops its separator) at the far-right scroll end */
.detail-tabs :deep(.erp-table-wrapper.wh-scroll-end .erp-th--fixed),
.detail-tabs :deep(.erp-table-wrapper.wh-scroll-end .erp-td--fixed) {
  position: static !important;
  box-shadow: none !important;
}

/* ── Modal footer ── */
.modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); width: 100%; }

/* Archive modal body (matches the index page's WarehousesPage.vue) */
.archive-modal-body { display: flex; flex-direction: column; gap: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); }
.archive-modal-body p { margin: 0; }
.archive-modal-body ul { margin: 0; padding-left: var(--mp-spacing-5); display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.archive-modal-body li { list-style: disc; }
.archive-modal-body__note { color: var(--mp-text-secondary); }
</style>
