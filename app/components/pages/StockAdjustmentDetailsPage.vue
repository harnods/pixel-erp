<script setup lang="ts">
import { ref, reactive, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpTooltip, MpIcon, MpSpinner, MpSelect, MpToggle,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpAccordion, MpAccordionHeader, MpAccordionIcon, MpAccordionItem, MpAccordionPanel,
  css, toast,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import ActivityLogModal from '~/components/patterns/ActivityLogModal.vue'
import ApprovalLogModal from '~/components/patterns/ApprovalLogModal.vue'
import ViewBatchDrawer from '~/components/patterns/ViewBatchDrawer.vue'
import ViewSerialDrawer from '~/components/patterns/ViewSerialDrawer.vue'
import { formatDateLong, formatDateTimeLong, formatDateTime } from '~/utils/date'
import {
  stockAdjustments, getAdjustment, adjustmentLineItems, adjustmentMemo, adjustmentAttachments,
  adjustmentUpdatedBy, adjustmentUpdatedAt, accountCodeFor, canCancelAdjustment, cancelAdjustment, approveAdjustment,
  adjustmentApprovalLog,
  type AdjustmentLine,
} from '~/data/stockAdjustments'
import { wmsStockAdjustments, getWmsAdjustment, canCancelWmsAdjustment, cancelWmsAdjustment, canCloseWmsCount, closeWmsCount, startWmsCount, approveWmsAdjustment } from '~/data/wmsStockAdjustments'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { useApprovalViewAs } from '~/composables/useApprovalViewAs'
import { putAwayTasks } from '~/data/putAwayTasks'
import { getPutAwayLineItems } from '~/data/putAwayTaskDetails'
import { pickingTasks } from '~/data/pickingTasks'
import { getPickingLineItems } from '~/data/pickingTaskDetails'

// The catch-all route binds the id via the generic `orderId` prop for every detail page.
const props = defineProps<{ orderId: string }>()
const router = useRouter()

const isWmsRecord = computed(() => props.orderId.startsWith('wsa-') || props.orderId.startsWith('cc-'))
const adjustment = computed(() => isWmsRecord.value ? getWmsAdjustment(props.orderId) : getAdjustment(props.orderId))
const isCount = computed(() => adjustment.value?.kind === 'count')
const isWmsCount = computed(() => isWmsRecord.value && isCount.value)
// Also true for 'closed' — closing discards a.lines, so there's no real
// counted data left to show either, same as a task that never started.
const isNotStarted = computed(() => isWmsCount.value && (adjustment.value?.status === 'not_started' || adjustment.value?.status === 'closed'))

// /stock-adjustments/:id also serves WMS Cycle count records — tell the sidebar
// this detail page belongs under "Cycle counts" so it doesn't default to
// highlighting the ERP "Stock adjustments" menu item. (Stock in/out isn't a
// reachable sidebar entry in the ERP nav tree, so it's left on the default
// URL-derived resolution rather than pointed at a section that doesn't exist.)
const { setActiveSectionOverride } = useNavigation()
const sidebarSection = computed(() => (isWmsCount.value ? 'Cycle counts' : null))
watch(sidebarSection, (label) => setActiveSectionOverride(label), { immediate: true })
onUnmounted(() => setActiveSectionOverride(null))
const lineItems = computed(() => adjustment.value ? adjustmentLineItems(adjustment.value) : [])
const memo = computed(() => adjustment.value ? adjustmentMemo(adjustment.value) : '')
const attachments = computed(() => adjustment.value ? adjustmentAttachments(adjustment.value) : [])
const lastUpdatedBy = computed(() => adjustment.value ? adjustmentUpdatedBy(adjustment.value) : '')
const lastUpdatedAt = computed(() => adjustment.value ? adjustmentUpdatedAt(adjustment.value) : new Date().toISOString())
const accountCode = computed(() => adjustment.value ? accountCodeFor(adjustment.value.account) : '')

// ── Linked cycle count (ERP Stock Count only) ──────────────────────────────────
const linkedCycleCount = computed(() => {
  if (isWmsRecord.value || !isCount.value) return null
  const id = adjustment.value?.linkedCycleCountId
  if (!id) return null
  const wmsAdj = getWmsAdjustment(id)
  return wmsAdj?.kind === 'count' ? wmsAdj : null
})

// ── Linked stock count (WMS Cycle count only, once Completed) — the reverse of
// linkedCycleCount above: approveWmsAdjustment() mirrors a completed cycle count
// into the ERP Stock counts index as a single new record, tagged back to this one. ──
const linkedStockCount = computed(() => {
  if (!isWmsCount.value || adjustment.value?.status !== 'completed') return null
  const id = adjustment.value?.id
  if (!id) return null
  return stockAdjustments.find((a) => a.linkedCycleCountId === id) ?? null
})
const linkedStockCountAccountCode = computed(() => linkedStockCount.value ? accountCodeFor(linkedStockCount.value.account) : '')
function agingLabel(startIso?: string, endIso?: string): string {
  if (!startIso) return ''
  const start = new Date(startIso).getTime()
  const end = endIso ? new Date(endIso).getTime() : Date.now()
  const totalMin = Math.max(0, Math.floor((end - start) / 60000))
  const days = Math.floor(totalMin / 1440)
  const hrs  = Math.floor((totalMin % 1440) / 60)
  const min  = totalMin % 60
  if (days > 0) return hrs > 0 ? `${days}d ${hrs}h` : `${days}d`
  if (hrs > 0)  return min > 0 ? `${hrs}h ${min}m` : `${hrs}h`
  return `${min}m`
}

// ── Batch / serial detection ───────────────────────────────────────────────────
const warehouseStockMap = computed(() => {
  if (!adjustment.value) return {}
  const wh = getWarehouseDetail(adjustment.value.warehouseId)
  if (!wh) return {}
  return Object.fromEntries(wh.stock.map(s => [s.sku, s]))
})
function isBatchTrackedSku(sku: string) { return !!warehouseStockMap.value[sku]?.batches }
function isSerialTrackedSku(sku: string) { return !!warehouseStockMap.value[sku]?.serials }

// ── View batch drawer ──────────────────────────────────────────────────────────
const viewBatchOpen = ref(false)
const viewBatchItem = ref<AdjustmentLine | null>(null)
function openViewBatch(item: AdjustmentLine) {
  viewBatchItem.value = item
  viewBatchOpen.value = true
}

// ── View serial drawer ─────────────────────────────────────────────────────────
const viewSerialOpen = ref(false)
const viewSerialItem = ref<AdjustmentLine | null>(null)
function openViewSerial(item: AdjustmentLine) {
  viewSerialItem.value = item
  viewSerialOpen.value = true
}

function fmt(n: number) { return n.toLocaleString('id-ID') }
function diffLabel(n: number) { return n > 0 ? `+${fmt(n)}` : fmt(n) }
function formatIDR(amount: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2 }).format(amount)
}

// ── WMS stock count: view mode + search ───────────────────────────────────────
const locViewMode = ref<'location' | 'sku'>('location')
const locSearch = ref('')

function openViewSerialForSku(row: { sku: string; product: { name: string; img: string; desc: string; unit: string; averageCost: number }; prevOnHand: number; counted: number; difference: number; unit: string; locations: string[] }) {
  viewSerialItem.value = {
    key: row.sku, sku: row.sku, product: row.product as AdjustmentLine['product'],
    prevOnHand: row.prevOnHand, counted: row.counted, difference: row.difference,
    unit: row.unit, averageCost: 0, storageLocation: row.locations[0] ?? '—',
  }
  viewSerialOpen.value = true
}

function openViewBatchForSku(row: { sku: string; product: { name: string; img: string; desc: string; unit: string; averageCost: number }; prevOnHand: number; counted: number; difference: number; unit: string; locations: string[] }) {
  viewBatchItem.value = {
    key: row.sku, sku: row.sku, product: row.product as AdjustmentLine['product'],
    prevOnHand: row.prevOnHand, counted: row.counted, difference: row.difference,
    unit: row.unit, averageCost: 0, storageLocation: row.locations[0] ?? '—',
  }
  viewBatchOpen.value = true
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** For WMS stock count: expand batch-tracked SKUs into per-batch per-location rows.
 *  Non-batch items pass through unchanged. */
const wmsCountLines = computed((): AdjustmentLine[] => {
  if (!isWmsCount.value || !adjustment.value) return lineItems.value
  const wh = getWarehouseDetail(adjustment.value.warehouseId)
  if (!wh) return lineItems.value

  const allWhLocs = [...new Set(wh.stock.flatMap(s => [
    ...s.locations,
    ...(s.batches?.map(b => b.location) ?? []),
  ]))]

  const result: AdjustmentLine[] = []
  for (const item of lineItems.value) {
    const whItem = warehouseStockMap.value[item.sku]
    if (!whItem?.batches?.length) {
      result.push(item)
      continue
    }
    // Split the SKU's REAL counted total (0 for a freshly-started task with
    // nothing saved yet, or the actual/seed value otherwise) proportionally
    // across its batches by on-hand share — never invent an independent
    // per-batch delta, or a genuinely-uncounted task would show fabricated
    // variance the moment its status flips to in_progress.
    const totalBatchOnHand = whItem.batches.reduce((s, b) => s + b.onHand, 0) || 1
    for (let b = 0; b < whItem.batches.length; b++) {
      const batch = whItem.batches[b]!
      const bh = hashStr(batch.batchNo + String(b))
      const shouldSplit = bh % 3 !== 0 // ~67% of batches span 2 locations
      if (shouldSplit) {
        const otherLocs = allWhLocs.filter(l => l !== batch.location)
        const loc2 = otherLocs.length ? otherLocs[bh % otherLocs.length]! : null
        if (loc2) {
          const qty1 = Math.ceil(batch.onHand * 0.6)
          const qty2 = batch.onHand - qty1
          const counted1 = Math.round(item.counted * qty1 / totalBatchOnHand)
          const counted2 = Math.round(item.counted * qty2 / totalBatchOnHand)
          result.push({ key: `${item.sku}~${batch.batchNo}~a`, sku: item.sku, product: item.product, unit: item.unit, averageCost: item.averageCost, prevOnHand: qty1, counted: counted1, difference: counted1 - qty1, storageLocation: batch.location, batchNumber: batch.batchNo, batchExpiry: batch.expiryDate })
          result.push({ key: `${item.sku}~${batch.batchNo}~b`, sku: item.sku, product: item.product, unit: item.unit, averageCost: item.averageCost, prevOnHand: qty2, counted: counted2, difference: counted2 - qty2, storageLocation: loc2, batchNumber: batch.batchNo, batchExpiry: batch.expiryDate })
          continue
        }
      }
      const counted = Math.round(item.counted * batch.onHand / totalBatchOnHand)
      result.push({ key: `${item.sku}~${batch.batchNo}`, sku: item.sku, product: item.product, unit: item.unit, averageCost: item.averageCost, prevOnHand: batch.onHand, counted, difference: counted - batch.onHand, storageLocation: batch.location, batchNumber: batch.batchNo, batchExpiry: batch.expiryDate })
    }
  }
  return result
})

const groupedBySku = computed(() => {
  if (!isWmsCount.value) return []
  const q = locSearch.value.trim().toLowerCase()
  const map = new Map<string, { sku: string; product: typeof lineItems.value[0]['product']; prevOnHand: number; counted: number; difference: number; unit: string; locations: string[] }>()
  for (const item of wmsCountLines.value) {
    const loc = item.storageLocation || '—'
    if (map.has(item.sku)) {
      const e = map.get(item.sku)!
      e.prevOnHand += item.prevOnHand
      e.counted += item.counted
      e.difference += item.difference
      if (!e.locations.includes(loc)) e.locations.push(loc)
    } else {
      map.set(item.sku, { sku: item.sku, product: item.product, prevOnHand: item.prevOnHand, counted: item.counted, difference: item.difference, unit: item.unit, locations: [loc] })
    }
  }
  const all = [...map.values()]
  if (!q) return all
  return all.filter(r =>
    r.sku.toLowerCase().includes(q) ||
    r.product.name.toLowerCase().includes(q) ||
    r.locations.some(l => l.toLowerCase().includes(q))
  )
})
const bySkuHasSerial = computed(() => groupedBySku.value.some(r => isSerialTrackedSku(r.sku)))
// The main (non-WMS-count) items table splits its qty cell into stacked qty + view
// action for any batch/serial SKU — so it needs column dividers whenever one is present.
const itemsHaveTracked = computed(() => lineItems.value.some(i => isBatchTrackedSku(i.sku) || isSerialTrackedSku(i.sku)))

// ── Variance reason (Counted status only — manager reviews each variance before approving) ──
// A no-variance row has nothing to explain, so its reason select stays disabled.
const isCountedStatus = computed(() => isWmsCount.value && adjustment.value?.status === 'counted')
const REASON_OPTIONS = [
  'Miscount / human error',
  'Damage / spoilage',
  'Theft / shrinkage',
  'System error / sync gap',
  'Misplacement (wrong bin)',
  'Expiry write-off',
]
function hasVariance(difference: number): boolean { return difference !== 0 }
// Keyed by SKU (not by line) so the reason stays consistent whether the operator
// is looking at the By location or By SKU grouping of the same variance.
const varianceReasons = reactive<Record<string, string>>({})
// Every SKU with a variance must have a reason picked before the manager can
// approve — checked against wmsCountLines (the finest-grained source) so it's
// correct regardless of which grouping (By location / By SKU) is on screen.
const missingReasonSkus = computed(() => {
  if (!isCountedStatus.value) return []
  const skus = new Set<string>()
  for (const item of wmsCountLines.value) {
    if (hasVariance(item.difference)) skus.add(item.sku)
  }
  return [...skus].filter((sku) => !varianceReasons[sku])
})

// ── WMS stock count: merge batch-split rows into one per (SKU, location) — the
// Batch no. column moves into the View batch drawer instead of separate rows,
// matching the counting page's row-merging. ─────────────────────────────────
const mergedWmsRows = computed((): AdjustmentLine[] => {
  if (!isWmsCount.value) return []
  const map = new Map<string, AdjustmentLine>()
  for (const item of wmsCountLines.value) {
    const loc = item.storageLocation || '—'
    const key = `${item.sku}::${loc}`
    const row = map.get(key)
    if (row) {
      row.prevOnHand += item.prevOnHand
      row.counted += item.counted
      row.difference += item.difference
    } else {
      map.set(key, { key, sku: item.sku, product: item.product, prevOnHand: item.prevOnHand, counted: item.counted, difference: item.difference, unit: item.unit, averageCost: item.averageCost, storageLocation: loc })
    }
  }
  return [...map.values()]
})

// ── WMS stock count: group line items by storage location (accordion) ──────────
const groupedByLocation = computed(() => {
  if (!isWmsCount.value) return []
  const q = locSearch.value.trim().toLowerCase()
  const groups = new Map<string, AdjustmentLine[]>()
  for (const item of mergedWmsRows.value) {
    const loc = item.storageLocation || '—'
    if (!groups.has(loc)) groups.set(loc, [])
    groups.get(loc)!.push(item)
  }
  const all = [...groups.entries()].map(([location, items]) => ({ location, items }))
  if (!q) return all
  return all
    .map(g => ({
      location: g.location,
      items: g.location.toLowerCase().includes(q)
        ? g.items
        : g.items.filter(i => i.sku.toLowerCase().includes(q) || i.product.name.toLowerCase().includes(q)),
    }))
    .filter(g => g.items.length > 0)
})
// ── Line items — auto lazy-load, internal scroll & border past 10 rows ─────────
const PAGE_SIZE = 10
const shownCount = ref(PAGE_SIZE)
const loadingMore = ref(false)
const visibleItems = computed(() => lineItems.value.slice(0, shownCount.value))
const hasMoreItems = computed(() => shownCount.value < lineItems.value.length)
const itemsProgressive = computed(() => lineItems.value.length > PAGE_SIZE)
// Documented rule (details-page-format.md): a scrolling items table — vertical
// (>10 rows) OR horizontal (wide) — becomes a contained panel with a border-bold
// outer outline. Track horizontal overflow so wide tables get the outline too.
const itemsOverflowX = ref(false)
const itemsBordered = computed(() => itemsProgressive.value || itemsOverflowX.value)

function loadMoreItems() {
  if (loadingMore.value || !hasMoreItems.value) return
  loadingMore.value = true
  setTimeout(() => {
    shownCount.value = Math.min(shownCount.value + PAGE_SIZE, lineItems.value.length)
    loadingMore.value = false
  }, 500)
}

const itemsScrollEl = ref<HTMLElement | null>(null)
const itemsTableEl = ref<HTMLElement | null>(null)
const itemsSentinelEl = ref<HTMLElement | null>(null)
let itemsObserver: IntersectionObserver | null = null
function setupItemsObserver() {
  itemsObserver?.disconnect()
  if (!itemsScrollEl.value || !itemsSentinelEl.value) return
  itemsObserver = new IntersectionObserver(
    (entries) => { if (entries[0]!.isIntersecting) loadMoreItems() },
    { root: itemsScrollEl.value, rootMargin: '0px 0px 120px 0px' },
  )
  itemsObserver.observe(itemsSentinelEl.value)
}
onMounted(() => nextTick(setupItemsObserver))
onUnmounted(() => itemsObserver?.disconnect())
watch(() => props.orderId, () => {
  shownCount.value = PAGE_SIZE
  loadingMore.value = false
  nextTick(() => {
    if (itemsScrollEl.value) itemsScrollEl.value.scrollTop = 0
    setupItemsObserver()
    checkOverflow()
  })
})

/** File-type → Pixel document icon for an attachment. */
function attachmentIcon(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf') return 'pdf-document'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic'].includes(ext)) return 'image-document'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'excel-document'
  if (['doc', 'docx'].includes(ext)) return 'word-document'
  return 'attachment'
}
function formatUpdatedAt(iso: string) {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return `${date}, ${time}`
}

const activityOpen = ref(false)
const activityEntries = computed(() => {
  const a = adjustment.value
  if (!a) return []
  return [{
    date: lastUpdatedAt.value,
    user: lastUpdatedBy.value,
    activity: 'Created',
    details: [
      { label: 'Transaction no.', value: a.number },
      { label: 'Transaction date', value: formatDateLong(a.date) },
      { label: 'Warehouse', value: a.warehouseName },
      ...(a.kind !== 'count' ? [{ label: 'Category', value: a.category }] : []),
      ...(!isWmsRecord.value ? [{ label: 'Account', value: accountCode.value ? `${accountCode.value} ${a.account}` : a.account }] : []),
      ...(isWmsCount.value && a.assignee ? [{ label: 'Assignee', value: a.assignee }] : []),
      ...(isWmsCount.value && a.startDate ? [{ label: 'Start date', value: formatDateTimeLong(a.startDate) }] : []),
      ...(isWmsCount.value && a.endDate ? [{ label: 'End date', value: formatDateTimeLong(a.endDate) }] : []),
    ],
  }]
})

// ── Jump-to-transaction switcher (title-bar chevron) ───────────────────────────
const jumpSearch = ref('')
const jumpResults = computed(() => {
  const q = jumpSearch.value.trim().toLowerCase()
  const kind = adjustment.value?.kind
  const source = (isWmsRecord.value ? wmsStockAdjustments : stockAdjustments).filter(a => a.kind === kind)
  const matched = q
    ? source.filter(a => a.number.toLowerCase().includes(q) || a.warehouseName.toLowerCase().includes(q) || a.category.toLowerCase().includes(q))
    : source
  return matched.slice(0, 6)
})
// Cycle count tasks live under /cycle-counts/:id (not /stock-adjustments/:id) —
// see backPath() below for the same distinction on the list-level route.
function detailBasePath(): string { return isWmsCount.value ? '/cycle-counts' : '/stock-adjustments' }
function jumpTo(id: string) { jumpSearch.value = ''; router.push(`${detailBasePath()}/${id}`) }

// Shared approval view toggle (manager vs user) — same singleton as the index page.
const { viewAs, setViewAs } = useApprovalViewAs()
const viewAsOptions: { value: 'user' | 'manager'; label: string }[] = [
  { value: 'user', label: 'As user' },
  { value: 'manager', label: 'As manager' },
]
const approvalLog = computed(() => adjustment.value ? adjustmentApprovalLog(adjustment.value) : null)
const approvalLogOpen = ref(false)
const canApprove = computed(() => viewAs.value === 'manager' && (
  adjustment.value?.status === 'draft' || (isWmsCount.value && adjustment.value?.status === 'counted')
))

function backPath() {
  if (!isWmsRecord.value) return '/stock-adjustments'
  return adjustment.value?.kind === 'in-out' ? '/stock-inout' : '/cycle-counts'
}
function goBack() { router.push(backPath()) }
function preview() { /* opens the printable preview — not built in this prototype */ }
function printPdf() { /* generates the adjustment PDF — not built in this prototype */ }

// ── Start-counting guard: an inbound (put-away) or outbound (picking) task in
// the SAME warehouse still in progress on a SKU this count also covers means
// stock is actively moving under the operator's feet — counting it now would
// just record a number that's already wrong by the time it's saved. Only
// gates the Open → In progress transition; once a count has genuinely
// started, re-entering it (Continue counting) is never blocked. ─────────────
interface ActiveConflict { type: 'Put-away' | 'Picking'; taskNo: string; skus: string[] }
const cycleCountSkus = computed(() => new Set(lineItems.value.map(l => l.sku)))
// Scenario toggle — this codebase has no real-time inbound/outbound activity
// simulator, so this lets the conflict-blocked flow be demoed on demand
// regardless of what the seeded put-away/picking data happens to contain.
const simulateActiveConflict = ref(false)
function realActiveConflicts(): ActiveConflict[] {
  if (!adjustment.value) return []
  const whId = adjustment.value.warehouseId
  const skus = cycleCountSkus.value
  const conflicts: ActiveConflict[] = []
  for (const t of putAwayTasks) {
    if (t.warehouseId !== whId || t.status !== 'in progress') continue
    const shared = [...new Set(getPutAwayLineItems(t.id).map(l => l.skuCode).filter(s => skus.has(s)))]
    if (shared.length) conflicts.push({ type: 'Put-away', taskNo: t.taskNo, skus: shared })
  }
  for (const t of pickingTasks) {
    if (t.warehouseId !== whId || (t.status !== 'in progress' && t.status !== 'partially picked')) continue
    const shared = [...new Set(getPickingLineItems(t).map(l => l.skuCode).filter(s => skus.has(s)))]
    if (shared.length) conflicts.push({ type: 'Picking', taskNo: t.taskNo, skus: shared })
  }
  return conflicts
}
const activeConflicts = computed((): ActiveConflict[] => {
  if (simulateActiveConflict.value) {
    const demoSku = [...cycleCountSkus.value][0]
    return [
      { type: 'Put-away', taskNo: 'PA-20231', skus: demoSku ? [demoSku] : [] },
      { type: 'Picking', taskNo: 'PICK-10098', skus: demoSku ? [demoSku] : [] },
    ]
  }
  return realActiveConflicts()
})

const startBlockedOpen = ref(false)
function startCounting() {
  if (!adjustment.value) return
  if (adjustment.value.status === 'not_started') {
    if (activeConflicts.value.length) {
      startBlockedOpen.value = true
      return
    }
    startWmsCount(adjustment.value.id)
  }
  router.push(`${detailBasePath()}/${props.orderId}/count`)
}
function editAdjustment() { router.push(`${detailBasePath()}/${props.orderId}/edit`) }
function approve() {
  if (!adjustment.value) return
  if (missingReasonSkus.value.length) {
    toast.notify({ variant: 'error', title: 'Select a reason for every variance before approving', maxWidth: 'max-content' })
    return
  }
  if (isWmsRecord.value) approveWmsAdjustment(adjustment.value.id)
  else approveAdjustment(adjustment.value.id)
  toast.notify({ variant: 'success', title: `${adjustment.value.number} approved` , maxWidth: 'max-content'})
}

// ── Cancel (single) — only while not yet applied to real stock: ERP draft, or a
// WMS cycle count not yet finished. A WMS Stock In/Out is completed the instant
// it's created (no draft window), so it's never cancelable at all. ────────────
const canCancelRecord = computed(() => {
  if (!adjustment.value) return false
  return isWmsRecord.value ? canCancelWmsAdjustment(adjustment.value) : canCancelAdjustment(adjustment.value)
})
const cancelOpen = ref(false)
function askCancel() { cancelOpen.value = true }
function confirmCancel() {
  if (!adjustment.value) return
  isWmsRecord.value ? cancelWmsAdjustment(props.orderId) : cancelAdjustment(props.orderId)
  cancelOpen.value = false
  toast.notify({ variant: 'success', title: `${adjustment.value.number} canceled`, maxWidth: 'max-content' })
  router.push(backPath())
}

// ── Close task (WMS cycle count only) — an operator walking away from a count
// mid-task, distinct from Cancel: any counted quantities saved so far are
// discarded, and the task becomes a terminal, view-only record. ──────────────
const canCloseTask = computed(() => isWmsCount.value && !!adjustment.value && canCloseWmsCount(adjustment.value))
const closeOpen = ref(false)
function askClose() { closeOpen.value = true }
function confirmClose() {
  if (!adjustment.value) return
  closeWmsCount(props.orderId)
  closeOpen.value = false
  toast.notify({ variant: 'success', title: `${adjustment.value.number} closed`, maxWidth: 'max-content' })
}

// Footer divider appears only when the stage actually scrolls.
const stageEl = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)
function checkOverflow() {
  const el = stageEl.value; if (el) stageOverflowing.value = el.scrollHeight > el.clientHeight + 1
  const it = itemsScrollEl.value; if (it) itemsOverflowX.value = it.scrollWidth > it.clientWidth + 1
}
let ro: ResizeObserver | null = null
onMounted(() => nextTick(() => {
  checkOverflow()
  ro = new ResizeObserver(checkOverflow)
  if (stageEl.value) { ro.observe(stageEl.value); stageEl.value.addEventListener('scroll', checkOverflow, { passive: true }) }
  // Observe BOTH the scroll container AND the table itself, so content-driven width
  // growth (fonts/columns) is caught — a container-only observer misses it.
  if (itemsScrollEl.value) ro.observe(itemsScrollEl.value)
  if (itemsTableEl.value) ro.observe(itemsTableEl.value)
  window.addEventListener('resize', checkOverflow)
}))
onUnmounted(() => {
  ro?.disconnect()
  stageEl.value?.removeEventListener('scroll', checkOverflow)
  window.removeEventListener('resize', checkOverflow)
})
</script>

<template>
  <div v-if="adjustment" class="detail-page">

    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goBack">{{ isWmsRecord ? (adjustment?.kind === 'in-out' ? 'Stock in/out' : 'Cycle counts') : 'All stock adjustments' }}</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ adjustment.number }}</h1>
          <ErpStatusBadge
            v-if="isWmsCount || adjustment.status === 'draft' || adjustment.status === 'canceled'"
            :status="adjustment.status" badge-for="additionalInformation" size="md"
          />
          <MpPopover id="sad-jump" use-portal :is-keep-alive="false" placement="bottom-start">
            <MpPopoverTrigger>
              <button class="detail-jump-chevron" aria-label="Switch transaction">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ width: '304px' })">
              <div class="detail-jump">
                <div class="detail-jump-search-wrap">
                  <input v-model="jumpSearch" class="detail-jump-search" type="text" placeholder="Search transaction…" />
                  <button v-if="jumpSearch" class="search-clear-btn search-clear-btn--overlay" type="button" aria-label="Clear search" @click="jumpSearch = ''">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                    </svg>
                  </button>
                </div>
                <div class="detail-jump-list">
                  <button v-for="a in jumpResults" :key="a.id" class="detail-jump-item" @click="jumpTo(a.id)">
                    <span class="detail-jump-item-number">{{ a.number }}</span>
                    <span class="detail-jump-item-customer">{{ a.warehouseName }} · {{ a.category }}</span>
                  </button>
                  <p v-if="!jumpResults.length" class="detail-jump-empty">No transactions found</p>
                </div>
              </div>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>

      <div class="detail-titlerow-right">
        <button v-if="canApprove && !isWmsCount" class="btn-enterprise btn-enterprise--primary" @click="approve">Approve</button>
        <template v-if="!isWmsRecord">
          <MpTooltip id="sad-tt-approval" label="Approval log" placement="bottom" use-portal>
            <button class="detail-icon-btn" aria-label="Approval log" @click="approvalLogOpen = true"><MpIcon name="task-todo" size="md" /></button>
          </MpTooltip>
          <MpTooltip id="sad-tt-comments" label="Comments" placement="bottom" use-portal>
            <button class="detail-icon-btn" aria-label="Comments"><MpIcon name="comment" size="md" /></button>
          </MpTooltip>
        </template>
      </div>
    </header>

    <div ref="stageEl" class="detail-stage">

      <!-- Header summary -->
      <section class="sad-summary">
        <!-- WMS Stock count layout -->
        <template v-if="isWmsCount">
          <div class="content-list-col">
            <ContentList label="Transaction no." :value="adjustment.number" />
          </div>
          <div class="content-list-col">
            <ContentList label="Warehouse">
              <div class="wh-link-wrap">
                <span>{{ adjustment.warehouseName }}</span>
                <button class="row-hover-btn" @click.stop="router.push(`/warehouses/${adjustment.warehouseId}`)">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <span class="row-hover-btn__label">VIEW DETAILS</span>
                </button>
              </div>
            </ContentList>
          </div>
          <div class="content-list-col">
            <ContentList label="Assignee" :value="adjustment.assignee || '—'" />
          </div>
        </template>

        <!-- Default layout (ERP + WMS Stock in/out) -->
        <template v-else>
          <div class="content-list-col">
            <ContentList label="Transaction date" :value="formatDateLong(adjustment.date)" />
            <ContentList v-if="!isWmsRecord" label="Account" :value="accountCode ? `${accountCode} ${adjustment.account}` : adjustment.account" />
          </div>
          <div class="content-list-col">
            <ContentList label="Transaction no." :value="adjustment.number" />
            <ContentList label="Warehouse">
              <div class="wh-link-wrap">
                <span>{{ adjustment.warehouseName }}</span>
                <button class="row-hover-btn" @click.stop="router.push(`/warehouses/${adjustment.warehouseId}`)">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <span class="row-hover-btn__label">VIEW DETAILS</span>
                </button>
              </div>
            </ContentList>
          </div>
          <div class="content-list-col">
            <ContentList v-if="!isCount" label="Category" :value="adjustment.category" />
            <ContentList label="Tags">
              <ErpTagList v-if="adjustment.tags.length" :tags="adjustment.tags" />
              <span v-else class="detail-note-text">—</span>
            </ContentList>
          </div>
          <a v-if="!isWmsRecord" class="sad-journal" @click.prevent>View journal entry</a>
        </template>
      </section>

      <!-- Filter bar (WMS stock count only) -->
      <div v-if="isWmsCount" class="detail-loc-filterbar">
        <div class="detail-loc-toggle">
          <button class="detail-loc-toggle-btn" :class="{ 'detail-loc-toggle-btn--active': locViewMode === 'location' }" @click="locViewMode = 'location'">By location</button>
          <button class="detail-loc-toggle-btn" :class="{ 'detail-loc-toggle-btn--active': locViewMode === 'sku' }" @click="locViewMode = 'sku'">By SKU</button>
        </div>
        <div class="detail-loc-search-wrap">
          <svg class="detail-loc-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.5"/>
            <path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input v-model="locSearch" class="detail-loc-search" type="text" placeholder="Search..." />
          <button v-if="locSearch" class="search-clear-btn search-clear-btn--overlay" type="button" aria-label="Clear search" @click="locSearch = ''">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Line items: WMS stock count → accordion grouped by storage location -->
      <div v-if="isWmsCount && locViewMode === 'location' && !groupedByLocation.length" class="empty-inline">
        <img src="/illustrations/empty-folder.png" alt="" class="empty-inline-illustration" width="288" height="240" />
        <p class="empty-inline-title">No results match your filters</p>
        <p class="empty-inline-desc">Recheck the filters you have applied and try filtering again.</p>
        <a class="empty-inline-clear" @click="locSearch = ''">Clear all filters</a>
      </div>
      <MpAccordion v-if="isWmsCount && locViewMode === 'location' && groupedByLocation.length" is-allow-multiple is-allow-toggle class="detail-loc-accordions">
        <MpAccordionItem
          v-for="group in groupedByLocation"
          :key="group.location"
          :id="`sad-acc-${group.location}`"
          is-default-open
          icon-position="start"
        >
          <MpAccordionHeader>
            <MpAccordionIcon />
            <span class="detail-acc-label">{{ group.location === '—' ? 'No location assigned' : group.location }}</span>
            <span class="detail-acc-meta">SKUs: {{ new Set(group.items.map(i => i.sku)).size }}</span>
          </MpAccordionHeader>
          <MpAccordionPanel>
            <div class="detail-acc-body">
              <div class="detail-loc-scroll" :class="{ 'detail-loc-scroll--split': group.items.some(i => isSerialTrackedSku(i.sku)) }">
                <table class="detail-items detail-items--fixed detail-items--cyclecount" :class="{ 'detail-items--with-reason': isCountedStatus }">
                  <colgroup>
                    <col class="detail-col-product" />
                    <col class="detail-col-sku" />
                    <col class="detail-col-num" />
                    <col class="detail-col-num" />
                    <col v-if="isCountedStatus" class="detail-col-num" />
                    <col class="detail-col-unit" />
                    <col class="detail-col-action" />
                    <col v-if="isCountedStatus" class="detail-col-reason" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th class="detail-th">Product</th>
                      <th class="detail-th">SKU</th>
                      <th class="detail-th detail-th--num">On hand qty</th>
                      <th class="detail-th detail-th--num">Counted qty</th>
                      <th v-if="isCountedStatus" class="detail-th detail-th--num">Variance</th>
                      <th class="detail-th">Unit</th>
                      <th class="detail-th detail-th--action" />
                      <th v-if="isCountedStatus" class="detail-th detail-th--reason">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="item in group.items" :key="item.key" class="detail-item-row">
                      <td class="detail-td detail-td--product"><ProductCell :name="item.product.name" :desc="item.product.desc" :image="item.product.img" /></td>
                      <td class="detail-td">{{ item.sku }}</td>
                      <td class="detail-td detail-td--num">{{ fmt(item.prevOnHand) }}</td>
                      <td class="detail-td detail-td--num">{{ isNotStarted ? '—' : fmt(item.counted) }}</td>
                      <td v-if="isCountedStatus" class="detail-td detail-td--num" :class="{ 'detail-diff--pos': item.difference > 0, 'detail-diff--neg': item.difference < 0 }">{{ diffLabel(item.difference) }}</td>
                      <td class="detail-td">{{ item.unit }}</td>
                      <td class="detail-td detail-td--action">
                        <template v-if="!isNotStarted">
                          <MpTooltip v-if="isBatchTrackedSku(item.sku)" :id="`sad-tt-batch-${item.key}`" label="View batch" placement="top" use-portal>
                            <button class="detail-view-btn" type="button" aria-label="View batch" @click="openViewBatch(item)">
                              <MpIcon name="competencies" size="md" />
                            </button>
                          </MpTooltip>
                          <MpTooltip v-else-if="isSerialTrackedSku(item.sku)" :id="`sad-tt-serial-${item.key}`" label="View serial number" placement="top" use-portal>
                            <button class="detail-view-btn" type="button" aria-label="View serial number" @click="openViewSerial(item)">
                              <MpIcon name="competencies" size="md" />
                            </button>
                          </MpTooltip>
                        </template>
                      </td>
                      <td v-if="isCountedStatus" class="detail-td detail-td--reason">
                        <MpPopover v-if="hasVariance(item.difference)" :id="`reason-loc-${item.key}`" is-close-on-select use-portal placement="bottom-start">
                          <MpPopoverTrigger>
                            <MpSelect
                              :id="`reason-loc-sel-${item.key}`" placeholder="Select reason" is-full-width size="sm"
                              :model-value="varianceReasons[item.sku] || undefined"
                              @mousedown.prevent
                            >
                              <option v-if="varianceReasons[item.sku]" :value="varianceReasons[item.sku]">{{ varianceReasons[item.sku] }}</option>
                            </MpSelect>
                          </MpPopoverTrigger>
                          <MpPopoverContent :class="css({ minWidth: '220px', width: 'max-content' })">
                            <MpPopoverList>
                              <MpPopoverListItem
                                v-for="r in REASON_OPTIONS" :key="r"
                                :is-active="varianceReasons[item.sku] === r" @click="varianceReasons[item.sku] = r"
                              >{{ r }}</MpPopoverListItem>
                            </MpPopoverList>
                          </MpPopoverContent>
                        </MpPopover>
                        <MpSelect v-else placeholder="Select reason" is-disabled is-full-width size="sm" />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </MpAccordionPanel>
        </MpAccordionItem>
      </MpAccordion>

      <!-- Line items: WMS stock count → by SKU flat table -->
      <section v-if="isWmsCount && locViewMode === 'sku'" class="detail-items-section" :class="{ 'detail-items-section--bordered': groupedBySku.length > 10 }">
        <div class="detail-items-scroll">
          <table class="detail-items detail-items--cyclecount" :class="{ 'detail-items--split': bySkuHasSerial }">
            <thead>
              <tr>
                <th class="detail-th">Product</th>
                <th class="detail-th">SKU</th>
                <th class="detail-th detail-th--num">On hand qty</th>
                <th class="detail-th detail-th--num">Counted qty</th>
                <th v-if="isCountedStatus" class="detail-th detail-th--num">Variance</th>
                <th class="detail-th">Unit</th>
                <th class="detail-th">Storage locations</th>
                <th v-if="isCountedStatus" class="detail-th detail-th--reason">Reason</th>
                <th class="detail-th detail-th--action" />
              </tr>
            </thead>
            <tbody>
              <tr v-if="!groupedBySku.length">
                <td :colspan="isCountedStatus ? 9 : 7" class="detail-td detail-td--empty">
                  <div class="empty-inline">
                    <img src="/illustrations/empty-folder.png" alt="" class="empty-inline-illustration" width="288" height="240" />
                    <p class="empty-inline-title">No results found</p>
                    <p class="empty-inline-desc">Try adjusting your search or filters.</p>
                    <a class="empty-inline-clear" @click="locSearch = ''">Clear all filters</a>
                  </div>
                </td>
              </tr>
              <tr v-for="row in groupedBySku" :key="row.sku" class="detail-item-row">
                <td class="detail-td detail-td--product"><ProductCell :name="row.product.name" :desc="row.product.desc" :image="row.product.img" /></td>
                <td class="detail-td">{{ row.sku }}</td>
                <td class="detail-td detail-td--num">{{ fmt(row.prevOnHand) }}</td>
                <td class="detail-td detail-td--num">{{ isNotStarted ? '—' : fmt(row.counted) }}</td>
                <td v-if="isCountedStatus" class="detail-td detail-td--num" :class="{ 'detail-diff--pos': row.difference > 0, 'detail-diff--neg': row.difference < 0 }">{{ diffLabel(row.difference) }}</td>
                <td class="detail-td">{{ row.unit }}</td>
                <td class="detail-td">
                  <div class="detail-loc-tags">
                    <span v-for="loc in row.locations" :key="loc" class="detail-loc-tag">{{ loc === '—' ? 'No location assigned' : loc }}</span>
                  </div>
                </td>
                <td v-if="isCountedStatus" class="detail-td detail-td--reason">
                  <MpPopover v-if="hasVariance(row.difference)" :id="`reason-sku-${row.sku}`" is-close-on-select use-portal placement="bottom-start">
                    <MpPopoverTrigger>
                      <MpSelect
                        :id="`reason-sku-sel-${row.sku}`" placeholder="Select reason" is-full-width size="sm"
                        :model-value="varianceReasons[row.sku] || undefined"
                        @mousedown.prevent
                      >
                        <option v-if="varianceReasons[row.sku]" :value="varianceReasons[row.sku]">{{ varianceReasons[row.sku] }}</option>
                      </MpSelect>
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ minWidth: '220px', width: 'max-content' })">
                      <MpPopoverList>
                        <MpPopoverListItem
                          v-for="r in REASON_OPTIONS" :key="r"
                          :is-active="varianceReasons[row.sku] === r" @click="varianceReasons[row.sku] = r"
                        >{{ r }}</MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                  <MpSelect v-else placeholder="Select reason" is-disabled is-full-width size="sm" />
                </td>
                <td class="detail-td detail-td--action">
                  <template v-if="!isNotStarted">
                    <MpTooltip v-if="isBatchTrackedSku(row.sku)" :id="`sad-tt-batch-sku-${row.sku}`" label="View batch" placement="top" use-portal>
                      <button class="detail-view-btn" type="button" aria-label="View batch" @click="openViewBatchForSku(row)">
                        <MpIcon name="competencies" size="md" />
                      </button>
                    </MpTooltip>
                    <MpTooltip v-else-if="isSerialTrackedSku(row.sku)" :id="`sad-tt-serial-sku-${row.sku}`" label="View serial number" placement="top" use-portal>
                      <button class="detail-view-btn" type="button" aria-label="View serial number" @click="openViewSerialForSku(row)">
                        <MpIcon name="competencies" size="md" />
                      </button>
                    </MpTooltip>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="detail-items-count">
          <span>Showing {{ groupedBySku.length }} SKU{{ groupedBySku.length !== 1 ? 's' : '' }}</span>
        </div>
      </section>

      <!-- Line items: flat table (ERP + WMS stock in/out) -->
      <section v-if="!isWmsCount" class="detail-items-section" :class="{ 'detail-items-section--bordered': itemsBordered }">
        <div ref="itemsScrollEl" class="detail-items-scroll">
          <table ref="itemsTableEl" class="detail-items" :class="{ 'detail-items--split': itemsHaveTracked }">
            <thead>
              <tr>
                <th class="detail-th">Product</th>
                <th class="detail-th">SKU</th>
                <template v-if="isCount">
                  <th class="detail-th detail-th--num">Prev. on hand qty</th>
                  <th class="detail-th detail-th--num">Counted</th>
                  <th class="detail-th detail-th--num">Difference</th>
                </template>
                <th v-else class="detail-th detail-th--num">Qty in/out</th>
                <th class="detail-th">Unit</th>
                <th v-if="!isWmsRecord" class="detail-th detail-th--num">Average cost</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in visibleItems" :key="item.key" class="detail-item-row"
                :class="{ 'detail-item-row--batch': isBatchTrackedSku(item.sku) || isSerialTrackedSku(item.sku) }"
              >
                <td class="detail-td detail-td--product"><ProductCell :name="item.product.name" :desc="item.product.desc" :image="item.product.img" /></td>
                <td class="detail-td">{{ item.sku }}</td>
                <template v-if="isCount">
                  <td class="detail-td detail-td--num">{{ fmt(item.prevOnHand) }}</td>
                  <td v-if="isBatchTrackedSku(item.sku)" class="detail-td detail-td--counted-batch" style="padding: 0;">
                    <div class="detail-counted-qty">{{ fmt(item.counted) }}</div>
                    <div class="detail-counted-action">
                      <button class="detail-view-link" type="button" @click="openViewBatch(item)">View batch</button>
                    </div>
                  </td>
                  <td v-else-if="isSerialTrackedSku(item.sku)" class="detail-td detail-td--counted-batch" style="padding: 0;">
                    <div class="detail-counted-qty">{{ fmt(item.counted) }}</div>
                    <div class="detail-counted-action">
                      <button class="detail-view-link" type="button" @click="openViewSerial(item)">View serial numbers</button>
                    </div>
                  </td>
                  <td v-else class="detail-td detail-td--num">{{ fmt(item.counted) }}</td>
                  <td class="detail-td detail-td--num">{{ diffLabel(item.difference) }}</td>
                </template>
                <template v-else>
                  <td v-if="isBatchTrackedSku(item.sku)" class="detail-td detail-td--counted-batch" style="padding: 0;">
                    <div class="detail-counted-qty detail-counted-qty--delta" :class="{ 'detail-diff--pos': item.difference > 0, 'detail-diff--neg': item.difference < 0 }">{{ diffLabel(item.difference) }}</div>
                    <div class="detail-counted-action">
                      <button class="detail-view-link" type="button" @click="openViewBatch(item)">View batch</button>
                    </div>
                  </td>
                  <td v-else-if="isSerialTrackedSku(item.sku)" class="detail-td detail-td--counted-batch" style="padding: 0;">
                    <div class="detail-counted-qty detail-counted-qty--delta" :class="{ 'detail-diff--pos': item.difference > 0, 'detail-diff--neg': item.difference < 0 }">{{ diffLabel(item.difference) }}</div>
                    <div class="detail-counted-action">
                      <button class="detail-view-link" type="button" @click="openViewSerial(item)">View serial numbers</button>
                    </div>
                  </td>
                  <td v-else class="detail-td detail-td--num">{{ diffLabel(item.difference) }}</td>
                </template>
                <td class="detail-td">{{ item.unit }}</td>
                <td v-if="!isWmsRecord" class="detail-td detail-td--num">{{ formatIDR(item.averageCost) }}</td>
              </tr>
            </tbody>
          </table>
          <div ref="itemsSentinelEl" class="detail-items-sentinel" aria-hidden="true" />
          <div v-if="loadingMore" class="detail-loading detail-items-loading">
            <MpSpinner size="sm" /> Loading products…
          </div>
        </div>
        <div class="detail-items-count">
          <span>Showing {{ visibleItems.length }} of {{ lineItems.length }} products</span>
        </div>
      </section>

      <!-- Linked cycle count (ERP Stock Count only) -->
      <section v-if="linkedCycleCount" class="detail-linked-section">
        <h3 class="detail-linked-heading">Cycle counts (1)</h3>
        <div class="detail-linked-wrap">
          <table class="detail-linked">
            <thead>
              <tr>
                <th class="detail-th">Number</th>
                <th class="detail-th">Warehouse</th>
                <th class="detail-th">Assignee</th>
                <th class="detail-th">Status</th>
                <th class="detail-th">Start date</th>
                <th class="detail-th">End date</th>
              </tr>
            </thead>
            <tbody>
              <tr class="detail-item-row">
                <td class="detail-td detail-td--number">
                  <div class="cell-with-action">
                    <span class="linked-num">{{ linkedCycleCount.number }}</span>
                    <button class="row-hover-btn" @click.stop="router.push(`/cycle-counts/${linkedCycleCount.id}`)">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                      <span class="row-hover-btn__label">VIEW DETAILS</span>
                    </button>
                  </div>
                </td>
                <td class="detail-td">{{ linkedCycleCount.warehouseName }}</td>
                <td class="detail-td">{{ linkedCycleCount.assignee || '—' }}</td>
                <td class="detail-td"><ErpStatusBadge :status="linkedCycleCount.status" /></td>
                <td class="detail-td">{{ formatDateTime(linkedCycleCount.startDate) }}</td>
                <td class="detail-td">
                  <span class="linked-end">
                    <span v-if="linkedCycleCount.endDate">{{ formatDateTime(linkedCycleCount.endDate) }}</span>
                    <span v-else class="linked-end__muted">—</span>
                    <span v-if="linkedCycleCount.startDate" class="linked-aging">{{ agingLabel(linkedCycleCount.startDate, linkedCycleCount.endDate) }}</span>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Linked stock count (WMS Cycle count only, once Completed) -->
      <section v-if="linkedStockCount" class="detail-linked-section">
        <h3 class="detail-linked-heading">Stock counts (1)</h3>
        <div class="detail-linked-wrap">
          <table class="detail-linked">
            <thead>
              <tr>
                <th class="detail-th">Number</th>
                <th class="detail-th">Date</th>
                <th class="detail-th">Warehouse</th>
                <th class="detail-th">Category</th>
                <th class="detail-th">Account</th>
                <th class="detail-th">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr class="detail-item-row">
                <td class="detail-td detail-td--number">
                  <div class="cell-with-action">
                    <span class="linked-num">{{ linkedStockCount.number }}</span>
                    <button class="row-hover-btn" @click.stop="router.push(`/stock-adjustments/${linkedStockCount.id}`)">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                      <span class="row-hover-btn__label">VIEW DETAILS</span>
                    </button>
                  </div>
                </td>
                <td class="detail-td">{{ formatDateLong(linkedStockCount.date) }}</td>
                <td class="detail-td">{{ linkedStockCount.warehouseName }}</td>
                <td class="detail-td">{{ linkedStockCount.category }}</td>
                <td class="detail-td">{{ linkedStockCountAccountCode ? `${linkedStockCountAccountCode} ${linkedStockCount.account}` : linkedStockCount.account }}</td>
                <td class="detail-td"><ErpStatusBadge :status="linkedStockCount.status" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Memo + attachment -->
      <section class="detail-notes-left">
        <ContentList label="Memo">
          <p class="detail-note-text">{{ memo || '—' }}</p>
        </ContentList>
        <ContentList :label="`Attachment (${attachments.length})`">
          <div v-if="attachments.length" class="detail-attach-list">
            <a v-for="(a, i) in attachments" :key="i" class="detail-attach" @click.prevent>
              <span class="detail-attach-icon"><MpIcon :name="attachmentIcon(a.name)" size="md" /></span>
              <span class="detail-attach-meta">
                <span class="detail-attach-name">{{ a.name }}</span>
                <span class="detail-attach-size">{{ a.sizeKB.toFixed(1) }} KB</span>
              </span>
            </a>
          </div>
          <p v-else class="detail-note-text">—</p>
        </ContentList>
      </section>

      <a class="detail-updated" @click.prevent="activityOpen = true">Last updated by {{ lastUpdatedBy }} on {{ formatUpdatedAt(lastUpdatedAt) }} (GMT+7)</a>

    </div>

    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">

      <!-- WMS stock count footer -->
      <template v-if="isWmsCount">
        <button v-if="canCloseTask" class="detail-btn detail-btn--secondary" @click="askClose">Close task</button>
        <button class="detail-btn detail-btn--secondary" @click="printPdf">Print stock card</button>
        <button v-if="canApprove" class="detail-btn detail-btn--primary" @click="approve">Approve</button>
        <!-- Not started / In progress: split button. Completed/Closed: no
             actions left, terminal record. -->
        <div v-if="adjustment.status === 'not_started' || adjustment.status === 'in_progress'" class="detail-split-btn">
          <button class="detail-btn detail-btn--primary detail-split-btn__main" @click="startCounting">
            {{ adjustment.status === 'in_progress' ? 'Continue counting' : 'Start counting' }}
          </button>
          <MpPopover id="sad-wms-actions" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
            <MpPopoverTrigger>
              <button class="detail-btn detail-btn--primary detail-split-btn__chevron" aria-label="More actions">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem @click="editAdjustment">Edit</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </template>

      <!-- ERP + WMS stock in/out footer -->
      <template v-else>
        <button class="detail-btn detail-btn--secondary" @click="printPdf">Print PDF</button>
        <MpPopover id="sad-actions" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
          <MpPopoverTrigger>
            <button class="detail-btn detail-btn--primary">
              Actions
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem @click="preview">Preview</MpPopoverListItem>
              <template v-if="canCancelRecord">
                <div role="separator" style="height:1px;margin:4px 0;background:var(--mp-border-default);" />
                <MpPopoverListItem @click="editAdjustment">Edit</MpPopoverListItem>
                <MpPopoverListItem :class="css({ color: 'var(--mp-text-critical)' })" @click="askCancel">Cancel</MpPopoverListItem>
              </template>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </template>

    </footer>

    <ActivityLogModal
      :is-open="activityOpen"
      :subject="adjustment.number"
      :updated-by="lastUpdatedBy"
      :updated-at="lastUpdatedAt"
      :entries="activityEntries"
      @close="activityOpen = false"
    />

    <ViewBatchDrawer
      v-if="viewBatchItem"
      :open="viewBatchOpen"
      :sku="viewBatchItem.sku"
      :warehouse-id="adjustment.warehouseId"
      :kind="isCount ? 'count' : 'in-out'"
      :counted-total="isCount ? viewBatchItem.counted : undefined"
      :delta-total="isCount ? undefined : viewBatchItem.difference"
      :product-name="viewBatchItem.product.name"
      :product-img="viewBatchItem.product.img"
      @update:open="viewBatchOpen = $event"
    />

    <ViewSerialDrawer
      v-if="viewSerialItem"
      :open="viewSerialOpen"
      :sku="viewSerialItem.sku"
      :warehouse-id="adjustment.warehouseId"
      :counted-total="viewSerialItem.counted"
      :product-name="viewSerialItem.product.name"
      :product-img="viewSerialItem.product.img"
      :storage-location="viewSerialItem.storageLocation || undefined"
      @update:open="viewSerialOpen = $event"
    />

    <!-- Cancel stock adjustment -->
    <MpModal
      id="sad-cancel" :is-open="cancelOpen" size="md"
      is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="cancelOpen = false"
    >
      <MpModalContent>
        <MpModalHeader>Cancel stock adjustment?<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          <p>This adjustment will be canceled and can no longer be approved. This can't be undone.</p>
        </MpModalBody>
        <MpModalFooter>
          <div class="modal-footer-btns">
            <button class="btn-enterprise btn-enterprise--ghost" @click="cancelOpen = false">Keep adjustment</button>
            <button class="btn-enterprise btn-enterprise--danger" @click="confirmCancel">Cancel adjustment</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- Close task (WMS cycle count) -->
    <MpModal
      id="sad-close" :is-open="closeOpen" size="md"
      is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="closeOpen = false"
    >
      <MpModalContent>
        <MpModalHeader>Close this count task?<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          <p>Counted data will be canceled and can't be resumed. This task will become read-only with a Closed status.</p>
        </MpModalBody>
        <MpModalFooter>
          <div class="modal-footer-btns">
            <button class="btn-enterprise btn-enterprise--ghost" @click="closeOpen = false">Cancel</button>
            <button class="btn-enterprise btn-enterprise--danger" @click="confirmClose">Close</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- Start-counting blocked: an inbound/outbound task sharing a SKU is still in progress -->
    <MpModal
      id="sad-start-blocked" :is-open="startBlockedOpen" size="md"
      is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="startBlockedOpen = false"
    >
      <MpModalContent>
        <MpModalHeader>Can't start counting yet<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          <p class="sad-blocked-intro">The following tasks are still in progress in this warehouse and share products with this count:</p>
          <ul class="sad-blocked-list">
            <li v-for="(c, i) in activeConflicts" :key="i">{{ c.type }} {{ c.taskNo }} — {{ c.skus.join(', ') }}</li>
          </ul>
          <p>Wait until they're completed before starting this count.</p>
        </MpModalBody>
        <MpModalFooter>
          <div class="modal-footer-btns">
            <button class="btn-enterprise btn-enterprise--primary" @click="startBlockedOpen = false">Got it</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

  </div>

  <div v-else class="sad-not-found">
    <p>Stock adjustment not found.</p>
    <button class="detail-breadcrumb" @click="goBack">Back to stock adjustments</button>
  </div>

  <ApprovalLogModal
    :is-open="approvalLogOpen"
    :subject="adjustment?.number ?? ''"
    :log="approvalLog"
    @close="approvalLogOpen = false"
  />

  <!-- Demo scenario FAB — approval view toggle (ERP) + Start-counting conflict
       simulator (WMS cycle count, while still Open) share the one FAB. -->
  <MpPopover
    v-if="!isWmsRecord || (isWmsCount && adjustment?.status === 'not_started')"
    id="sad-demo-fab" is-close-on-select use-portal placement="top-end"
  >
    <MpPopoverTrigger>
      <button class="demo-fab" aria-label="Change scenario state">
        <MpIcon name="sliders" size="md" color="icon.inverse" />
      </button>
    </MpPopoverTrigger>
    <MpPopoverContent :class="css({ minWidth: '220px', width: 'max-content' })">
      <template v-if="!isWmsRecord">
        <p class="demo-fab-heading">Approval view</p>
        <MpPopoverList>
          <MpPopoverListItem
            v-for="v in viewAsOptions" :key="v.value"
            :is-active="v.value === viewAs" @click="setViewAs(v.value)"
          >{{ v.label }}</MpPopoverListItem>
        </MpPopoverList>
      </template>
      <template v-if="isWmsCount && adjustment?.status === 'not_started'">
        <p class="demo-fab-heading">Scenario testing</p>
        <div class="demo-fab-toggle-row">
          <span class="demo-fab-toggle-label">Simulate active inbound/outbound conflict</span>
          <MpToggle v-model:is-checked="simulateActiveConflict" aria-label="Simulate active inbound/outbound conflict" />
        </div>
      </template>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
.detail-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px); }
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-titlerow-right { display: flex; align-items: center; gap: var(--mp-spacing-1); flex-shrink: 0; }
.detail-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); border-radius: var(--mp-radii-md); background: none; border: none; cursor: pointer; color: var(--mp-icon-default); }
.detail-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.detail-jump-chevron { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px); background: none; border: none; padding: 0; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.detail-jump-chevron:hover { background: var(--mp-background-neutral-hovered); }
.detail-jump { display: flex; flex-direction: column; }
.detail-jump-search-wrap { padding: var(--mp-spacing-3); position: relative; }
.detail-jump-search { width: 100%; box-sizing: border-box; padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; padding-right: 34px; }
.detail-jump-search:focus { border-color: var(--mp-border-brand-bold, #029861); }
.detail-jump-search::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }
.detail-jump-search-wrap .search-clear-btn--overlay { position: absolute; right: 18px; top: 50%; transform: translateY(-50%); }
.detail-jump-list { display: flex; flex-direction: column; }
.detail-jump-item { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); width: 100%; text-align: left; background: none; border: none; cursor: pointer; padding: var(--mp-spacing-2) var(--mp-spacing-3); border-radius: var(--mp-radii-md); }
.detail-jump-item:hover { background: var(--mp-background-neutral-subtle); }
.detail-jump-item-number { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.detail-jump-item-customer { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-jump-empty { margin: 0; padding: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }

.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-6); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); display: flex; flex-direction: column; gap: var(--mp-spacing-8); }
/* 3 content columns + a trailing column that pushes "View journal entry" to the right. */
.sad-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 318px)) 1fr; column-gap: var(--mp-spacing-6); row-gap: 0; }
.content-list-col { display: flex; flex-direction: column; }
.sad-journal { justify-self: end; align-self: start; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); cursor: pointer; white-space: nowrap; }
.sad-journal:hover { text-decoration: underline; text-underline-offset: 2px; }

/* Filter bar (WMS stock count) */
.detail-loc-filterbar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.detail-loc-toggle { display: flex; align-items: center; background: var(--mp-background-neutral-subtle); border-radius: var(--mp-radii-full); padding: 2px; gap: 2px; }
.detail-loc-toggle-btn { height: 28px; padding: 0 var(--mp-spacing-3); border: none; border-radius: var(--mp-radii-full); background: none; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); cursor: pointer; white-space: nowrap; }
.detail-loc-toggle-btn:hover { color: var(--mp-text-default); }
.detail-loc-toggle-btn--active { background: var(--mp-background-stage, #fff); color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold); box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.detail-loc-search-wrap { position: relative; display: flex; align-items: center; }
.detail-loc-search-icon { position: absolute; left: var(--mp-spacing-3); color: var(--mp-icon-subtle); pointer-events: none; flex-shrink: 0; }
.detail-loc-search { height: 36px; padding: 0 var(--mp-spacing-3) 0 calc(var(--mp-spacing-3) + 16px + var(--mp-spacing-2)); padding-right: 30px; border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full); background: var(--mp-background-neutral); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; width: 240px; box-sizing: border-box; }
.detail-loc-search:focus { border-color: var(--mp-border-brand-bold, #029861); }
.detail-loc-search::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn--overlay { position: absolute; right: var(--mp-spacing-3, 12px); top: 50%; transform: translateY(-50%); }
.detail-td--empty { padding: 0; }
.empty-inline { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1); padding: var(--mp-spacing-10, 40px) 0; }
.empty-inline-illustration { width: 288px; height: 240px; object-fit: contain; margin-bottom: var(--mp-spacing-1); }
.empty-inline-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-inline-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.empty-inline-clear { margin-top: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); cursor: pointer; }

/* Storage location accordion (WMS stock count) */
/* Storage location accordion (WMS stock count) */
.detail-loc-accordions :deep(*:not(td):not(th):not(.detail-counted-qty)) { border-top: none !important; border-bottom: none !important; }
.detail-loc-accordions { }
.detail-acc-label { flex: 1; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.detail-acc-meta { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); white-space: nowrap; }
.detail-acc-body { padding: var(--mp-spacing-4) var(--mp-spacing-4) var(--mp-spacing-4) 0; }
.detail-loc-scroll { overflow-x: auto; }
/* table-layout:fixed with a %-width table + one flexible (unwidthed) column
   (Product) — the fixed-px columns keep their width and Product absorbs
   whatever space is left, so the table always fills its container instead of
   leaving dead space when the container is wider than the columns' sum. */
.detail-items--fixed { table-layout: fixed; width: 100%; min-width: 950px; }
.detail-col-sku { width: 90px; }
.detail-col-num { width: 110px; }
.detail-col-unit { width: 90px; }
.detail-col-action { width: 56px; }
.detail-col-reason { width: 220px; }
.detail-items--fixed.detail-items--with-reason { min-width: 1280px; }
/* Reason select fills the FULL row height (flat, edge-to-edge trigger) instead of
   floating as a short pill inside a taller row — matches the row-select convention
   used elsewhere (e.g. Other cost account rows). Percentage heights don't reliably
   resolve against a <td> (its height is a table-layout result, not a specified
   value), so the select is absolutely positioned against the cell's own box instead. */
/* min-width matters where this column has no <colgroup> (the By SKU table uses
   auto layout) — with the select absolutely positioned it no longer contributes
   its own content width to that calculation, so the column must reserve it. */
.detail-td--reason, .detail-th--reason {
  border-left: 1px solid var(--mp-border-default); border-right: 1px solid var(--mp-border-default);
}
/* Approving-cycle-count tables (By location / By SKU): a vertical divider on the
   right of every column, on every row — not just the Reason column. */
.detail-items--cyclecount .detail-td, .detail-items--cyclecount .detail-th {
  border-right: 1px solid var(--mp-border-default);
}
/* Everything but Reason is read-only in this review — a disabled fill makes that
   at a glance, leaving the one actionable column (Reason) visually distinct. */
.detail-items--cyclecount .detail-td:not(.detail-td--reason) {
  background: var(--mp-background-disabled, rgba(29, 31, 36, 0.04));
}
.detail-td--reason { padding: 0; position: relative; vertical-align: middle; min-width: 180px; }
.detail-td--reason :deep(.mp-select__root) { position: absolute; inset: 0; width: 100%; height: 100%; }
.detail-td--reason :deep(.mp-select__control) {
  height: 100%; width: 100%; border: none; border-radius: 0; background: transparent;
}
.detail-td--reason :deep(.mp-select__control):not(:disabled):hover { background: var(--mp-background-neutral-hovered); }
.detail-loc-scroll--split .detail-th,
.detail-items--split .detail-th { border-left: 1px solid var(--mp-border-default); border-right: 1px solid var(--mp-border-default); }
.detail-loc-scroll--split .detail-th:first-child,
.detail-items--split .detail-th:first-child { border-left: none; }
.detail-loc-scroll--split .detail-th:last-child,
.detail-items--split .detail-th:last-child { border-right: none; }
.detail-loc-scroll--split .detail-td,
.detail-items--split .detail-td { border-left: 1px solid var(--mp-border-default); border-right: 1px solid var(--mp-border-default); }
.detail-loc-scroll--split .detail-td:first-child,
.detail-items--split .detail-td:first-child { border-left: none; }
.detail-loc-scroll--split .detail-td:last-child,
.detail-items--split .detail-td:last-child { border-right: none; }

/* Every row closes with a right border — including the last column (overrides the
   split-mode suppression above) so each table reads as a bounded row on this page. */
.detail-th:last-child, .detail-td:last-child { border-right: 1px solid var(--mp-border-default); }

.detail-loc-tags { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.detail-loc-tag { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.detail-items-section { display: flex; flex-direction: column; flex-shrink: 0; }
.detail-items-section--bordered { border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md); overflow: hidden; }
.detail-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: auto; }
.detail-items { width: 100%; border-collapse: collapse; table-layout: auto; }
.detail-th { height: var(--mp-sizes-7, 28px); text-align: left; padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2); background: var(--mp-background-neutral-subtle); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-transform: uppercase; border-bottom: 1px solid var(--mp-border-default); white-space: nowrap; }
.detail-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.detail-td { padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); vertical-align: top; }
.detail-items .detail-th { position: sticky; top: 0; z-index: 1; }
.detail-items-sentinel { height: 1px; }
.detail-loading { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); color: var(--mp-text-secondary); }
.detail-items-loading { justify-content: center; padding: var(--mp-spacing-3); }
.detail-items-count { display: flex; align-items: center; margin: 0; padding: var(--mp-spacing-3) var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); border-bottom: 1px solid var(--mp-border-default); }
.detail-td--num { text-align: right; white-space: nowrap; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }

/* Batch/serial 2-row counted cell */
.detail-item-row--batch .detail-td { vertical-align: top; }
.detail-td--product { padding-top: 10px; padding-bottom: 10px; }
.detail-td--counted-batch { display: table-cell; vertical-align: top; }
.detail-counted-qty {
  height: 40px; display: flex; align-items: center; justify-content: flex-end;
  padding: 0 var(--mp-spacing-2) 0 var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.detail-counted-action {
  height: 40px; display: flex; align-items: center; justify-content: flex-end;
  padding: 0 var(--mp-spacing-2) 0 var(--mp-spacing-4);
}
.detail-counted-qty--delta { justify-content: flex-end; }
.detail-diff--pos { color: var(--mp-text-success, #18794e); }
.detail-diff--neg { color: var(--mp-text-danger, #a8352d); }
.detail-view-link {
  background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-link);
  white-space: nowrap;
}
.detail-view-link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* View batch/serial action column (WMS cycle count tables) */
.detail-th--action { text-align: center; white-space: nowrap; }
.detail-td--action { text-align: center; white-space: nowrap; }
.detail-view-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border-radius: var(--mp-radii-md); background: none; border: none;
  cursor: pointer; color: var(--mp-icon-default);
}
.detail-view-btn:hover { background: var(--mp-background-neutral-hovered); }

.detail-notes-left { display: flex; flex-direction: column; }
.detail-note-text { margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default); white-space: pre-line; }
.detail-attach-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.detail-attach { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); cursor: pointer; width: fit-content; }
.detail-attach-icon { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.detail-attach-meta { display: flex; flex-direction: column; }
.detail-attach-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.detail-attach:hover .detail-attach-name { text-decoration: underline; text-underline-offset: 2px; }
.detail-attach-size { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-updated { margin: 0; align-self: flex-start; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); cursor: pointer; }
.detail-updated:hover { text-decoration: underline; text-underline-offset: 2px; }

.detail-footer { flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage); border-top: 1px solid transparent; }
.detail-footer--floating { border-top-color: var(--mp-border-default); }
.detail-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer; border: 1px solid transparent; white-space: nowrap; }
.detail-btn--secondary { background: var(--mp-background-neutral); border-color: var(--mp-border-bold); color: var(--mp-text-default); }
.detail-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }
.detail-btn--primary { background: var(--mp-background-brand-bold, #029861); border-color: transparent; color: var(--mp-text-on-color, #fff); }
.detail-btn--primary:hover { background: var(--mp-background-brand-bold-hovered, #027a4e); }

.detail-split-btn { display: flex; }
.detail-split-btn__main { border-top-right-radius: 0; border-bottom-right-radius: 0; padding-right: var(--mp-spacing-3); border-right: 1px solid rgba(255,255,255,0.25); }
.detail-split-btn__chevron { border-top-left-radius: 0; border-bottom-left-radius: 0; padding: var(--mp-spacing-2) var(--mp-spacing-3); }

.sad-not-found { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-4); flex: 1; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.sad-menu-divider { display: block; height: 1px; margin: var(--mp-spacing-1) 0; background: var(--mp-border-default); }

/* Cancel modal */
.modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); width: 100%; }

/* Start-counting blocked modal */
.sad-blocked-intro { margin-bottom: var(--mp-spacing-2); }
.sad-blocked-list { margin: 0 0 var(--mp-spacing-3); padding-left: var(--mp-spacing-5); display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.sad-blocked-list li { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

/* Linked cycle counts section */
.detail-linked-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); flex-shrink: 0; }
.detail-linked-heading { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.detail-linked-wrap { overflow-x: auto; }
.detail-linked {
  width: 100%; min-width: 700px; border-collapse: collapse; table-layout: auto;
  border-top: 1px solid var(--mp-border-default);
}
.detail-linked .detail-th { background: var(--mp-background-neutral-subtle); }
.detail-td--number { position: relative; }
.cell-with-action { display: flex; align-items: center; width: 100%; min-width: 0; }
.linked-num { color: var(--mp-text-link); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.row-hover-btn {
  position: absolute; right: var(--mp-spacing-2); top: 50%; transform: translateY(-50%); display: none;
  align-items: center; gap: var(--mp-spacing-1\.5);
  padding: var(--mp-spacing-1) var(--mp-spacing-1\.5);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-sm); cursor: pointer; white-space: nowrap; line-height: 1;
}
.row-hover-btn__label {
  font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xs, 12px); color: var(--mp-text-secondary); text-transform: uppercase;
}
.detail-item-row:hover .row-hover-btn { display: flex; }
.wh-link-wrap { position: relative; display: inline-flex; align-items: center; }
.wh-link-wrap:hover .row-hover-btn { display: flex; }
.linked-end { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.linked-end__muted { color: var(--mp-text-secondary); }
.linked-aging {
  display: inline-flex; align-items: center;
  padding: 0 var(--mp-spacing-1\.5); border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral-subtle);
  color: var(--mp-text-secondary);
  font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg, 20px); white-space: nowrap;
}

/* Demo scenario FAB */
.demo-fab {
  position: fixed; left: var(--mp-spacing-6); bottom: var(--mp-spacing-6);
  width: var(--mp-spacing-12, 48px); height: var(--mp-spacing-12, 48px);
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-inverse, #080d0e); color: #fff;
  cursor: pointer; z-index: 1200;
  box-shadow: 0 4px 6px -2px rgba(0,0,0,0.1), 0 10px 15px -3px rgba(0,0,0,0.2);
}
.demo-fab:hover { opacity: 0.9; }
.demo-fab-heading { padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.demo-fab-toggle-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-1) var(--mp-spacing-3) var(--mp-spacing-2); }
.demo-fab-toggle-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); max-width: 160px; }
</style>
