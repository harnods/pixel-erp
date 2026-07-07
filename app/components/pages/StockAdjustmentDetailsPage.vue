<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpTooltip, MpIcon, MpSpinner,
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
import { formatDateLong, formatDateTimeLong } from '~/utils/date'
import {
  stockAdjustments, getAdjustment, adjustmentLineItems, adjustmentMemo, adjustmentAttachments,
  adjustmentUpdatedBy, adjustmentUpdatedAt, accountCodeFor, deleteAdjustments, approveAdjustment,
  adjustmentApprovalLog,
  type AdjustmentLine,
} from '~/data/stockAdjustments'
import { wmsStockAdjustments, getWmsAdjustment, deleteWmsAdjustments, startWmsCount } from '~/data/wmsStockAdjustments'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { useApprovalViewAs } from '~/composables/useApprovalViewAs'

// The catch-all route binds the id via the generic `orderId` prop for every detail page.
const props = defineProps<{ orderId: string }>()
const router = useRouter()

const isWmsRecord = computed(() => props.orderId.startsWith('wsa-'))
const adjustment = computed(() => isWmsRecord.value ? getWmsAdjustment(props.orderId) : getAdjustment(props.orderId))
const isCount = computed(() => adjustment.value?.kind === 'count')
const isWmsCount = computed(() => isWmsRecord.value && isCount.value)
const isNotStarted = computed(() => isWmsCount.value && adjustment.value?.status === 'not_started')
const lineItems = computed(() => adjustment.value ? adjustmentLineItems(adjustment.value) : [])
const memo = computed(() => adjustment.value ? adjustmentMemo(adjustment.value) : '')
const attachments = computed(() => adjustment.value ? adjustmentAttachments(adjustment.value) : [])
const lastUpdatedBy = computed(() => adjustment.value ? adjustmentUpdatedBy(adjustment.value) : '')
const lastUpdatedAt = computed(() => adjustment.value ? adjustmentUpdatedAt(adjustment.value) : new Date().toISOString())
const accountCode = computed(() => adjustment.value ? accountCodeFor(adjustment.value.account) : '')

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
          const d1 = (bh % 7) - 3
          const d2 = (hashStr(batch.batchNo + 'b') % 5) - 2
          result.push({ key: `${item.sku}~${batch.batchNo}~a`, sku: item.sku, product: item.product, unit: item.unit, averageCost: item.averageCost, prevOnHand: qty1, counted: Math.max(0, qty1 + d1), difference: d1, storageLocation: batch.location, batchNumber: batch.batchNo, batchExpiry: batch.expiryDate })
          result.push({ key: `${item.sku}~${batch.batchNo}~b`, sku: item.sku, product: item.product, unit: item.unit, averageCost: item.averageCost, prevOnHand: qty2, counted: Math.max(0, qty2 + d2), difference: d2, storageLocation: loc2, batchNumber: batch.batchNo, batchExpiry: batch.expiryDate })
          continue
        }
      }
      const d = (bh % 11) - 4
      result.push({ key: `${item.sku}~${batch.batchNo}`, sku: item.sku, product: item.product, unit: item.unit, averageCost: item.averageCost, prevOnHand: batch.onHand, counted: Math.max(0, batch.onHand + d), difference: d, storageLocation: batch.location, batchNumber: batch.batchNo, batchExpiry: batch.expiryDate })
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

// ── WMS stock count: group line items by storage location (accordion) ──────────
const groupedByLocation = computed(() => {
  if (!isWmsCount.value) return []
  const q = locSearch.value.trim().toLowerCase()
  const groups = new Map<string, AdjustmentLine[]>()
  for (const item of wmsCountLines.value) {
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
        : g.items.filter(i => i.sku.toLowerCase().includes(q) || i.product.name.toLowerCase().includes(q) || (i.batchNumber ?? '').toLowerCase().includes(q)),
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
function jumpTo(id: string) { jumpSearch.value = ''; router.push(`/stock-adjustments/${id}`) }

// Shared approval view toggle (manager vs user) — same singleton as the index page.
const { viewAs, setViewAs } = useApprovalViewAs()
const viewAsOptions: { value: 'user' | 'manager'; label: string }[] = [
  { value: 'user', label: 'As user' },
  { value: 'manager', label: 'As manager' },
]
const approvalLog = computed(() => adjustment.value ? adjustmentApprovalLog(adjustment.value) : null)
const approvalLogOpen = ref(false)
const canApprove = computed(() => viewAs.value === 'manager' && adjustment.value?.status === 'draft')

function backPath() {
  if (!isWmsRecord.value) return '/stock-adjustments'
  return adjustment.value?.kind === 'in-out' ? '/stock-inout' : '/stock-count'
}
function goBack() { router.push(backPath()) }
function preview() { /* opens the printable preview — not built in this prototype */ }
function printPdf() { /* generates the adjustment PDF — not built in this prototype */ }
function startCounting() {
  if (!adjustment.value) return
  if (adjustment.value.status === 'not_started') startWmsCount(adjustment.value.id)
  router.push(`/stock-adjustments/${props.orderId}/count`)
}
function editAdjustment() { router.push(`/stock-adjustments/${props.orderId}/edit`) }
function approve() {
  if (!adjustment.value) return
  approveAdjustment(adjustment.value.id)
  toast.notify({ variant: 'success', title: `${adjustment.value.number} approved` })
}

// ── Delete (single) — same alert as the index ──────────────────────────────────
const deleteOpen = ref(false)
const deleteReason = ref('')
const deleteError = ref('')
const REASON_MAX = 256
function askDelete() { deleteReason.value = ''; deleteError.value = ''; deleteOpen.value = true }
function confirmDelete() {
  if (!deleteReason.value.trim()) { deleteError.value = 'Enter a reason for deleting'; return }
  isWmsRecord.value ? deleteWmsAdjustments([props.orderId]) : deleteAdjustments([props.orderId])
  deleteOpen.value = false
  router.push(backPath())
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
        <button class="detail-breadcrumb" @click="goBack">{{ isWmsRecord ? (adjustment?.kind === 'in-out' ? 'Stock in/out' : 'Stock count') : 'All stock adjustments' }}</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ adjustment.number }}</h1>
          <ErpStatusBadge
            v-if="adjustment.status === 'draft'"
            status="draft" badge-for="additionalInformation" size="md"
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
                </div>
                <div class="detail-jump-list">
                  <button v-for="a in jumpResults" :key="a.id" class="detail-jump-item" @click="jumpTo(a.id)">
                    <span class="detail-jump-item-number">{{ a.number }}</span>
                    <span class="detail-jump-item-customer">{{ a.warehouseName }} · {{ a.category }}</span>
                  </button>
                  <p v-if="!jumpResults.length" class="detail-jump-empty">No transactions found.</p>
                </div>
              </div>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>

      <div class="detail-titlerow-right">
        <button v-if="canApprove" class="btn-enterprise btn-enterprise--primary" @click="approve">Approve</button>
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
            <ContentList label="Transaction date" :value="formatDateLong(adjustment.date)" />
            <ContentList label="Transaction no." :value="adjustment.number" />
            <ContentList label="Assignee" :value="adjustment.assignee || '—'" />
          </div>
          <div class="content-list-col">
            <ContentList label="Warehouse" :value="adjustment.warehouseName" />
            <ContentList label="Start date" :value="formatDateTimeLong(adjustment.startDate)" />
            <ContentList label="End date" :value="formatDateTimeLong(adjustment.endDate)" />
          </div>
          <div class="content-list-col">
            <ContentList label="Tags">
              <ErpTagList v-if="adjustment.tags.length" :tags="adjustment.tags" />
              <span v-else class="detail-note-text">—</span>
            </ContentList>
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
            <ContentList label="Warehouse" :value="adjustment.warehouseName" />
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
        </div>
      </div>

      <!-- Line items: WMS stock count → accordion grouped by storage location -->
      <div v-if="isWmsCount && locViewMode === 'location' && !groupedByLocation.length" class="empty-inline">
        <img src="/illustrations/empty-folder.png" alt="" class="empty-inline-illustration" width="288" height="240" />
        <p class="empty-inline-title">No results found</p>
        <p class="empty-inline-desc">Try adjusting your search or filters.</p>
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
            <span class="detail-acc-meta">SKU Qty: {{ new Set(group.items.map(i => i.sku)).size }}</span>
          </MpAccordionHeader>
          <MpAccordionPanel>
            <div class="detail-acc-body">
              <div class="detail-loc-scroll" :class="{ 'detail-loc-scroll--split': group.items.some(i => isSerialTrackedSku(i.sku)) }">
                <table class="detail-items detail-items--fixed">
                  <colgroup>
                    <col class="detail-col-product" />
                    <col class="detail-col-sku" />
                    <col class="detail-col-batch" />
                    <col class="detail-col-num" />
                    <col class="detail-col-num" />
                    <col class="detail-col-num" />
                    <col class="detail-col-unit" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th class="detail-th">Product</th>
                      <th class="detail-th">SKU</th>
                      <th class="detail-th">Batch no.</th>
                      <th class="detail-th detail-th--num">Prev. on hand qty</th>
                      <th class="detail-th detail-th--num">Counted qty</th>
                      <th class="detail-th detail-th--num">Difference qty</th>
                      <th class="detail-th">Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="item in group.items" :key="item.key" class="detail-item-row"
                      :class="{ 'detail-item-row--batch': isSerialTrackedSku(item.sku) }"
                    >
                      <td class="detail-td detail-td--product"><ProductCell :name="item.product.name" :desc="item.product.desc" :image="item.product.img" /></td>
                      <td class="detail-td">{{ item.sku }}</td>
                      <td class="detail-td">{{ item.batchNumber ?? '—' }}</td>
                      <td class="detail-td detail-td--num">{{ fmt(item.prevOnHand) }}</td>
                      <td v-if="isSerialTrackedSku(item.sku)" class="detail-td detail-td--counted-batch" style="padding: 0;">
                        <div class="detail-counted-qty">{{ isNotStarted ? '—' : fmt(item.counted) }}</div>
                        <div v-if="!isNotStarted" class="detail-counted-action">
                          <button class="detail-view-link" type="button" @click="openViewSerial(item)">View serial numbers</button>
                        </div>
                      </td>
                      <td v-else class="detail-td detail-td--num">{{ isNotStarted ? '—' : fmt(item.counted) }}</td>
                      <td class="detail-td detail-td--num">{{ isNotStarted ? '—' : diffLabel(item.difference) }}</td>
                      <td class="detail-td">{{ item.unit }}</td>
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
          <table class="detail-items" :class="{ 'detail-items--split': bySkuHasSerial }">
            <thead>
              <tr>
                <th class="detail-th">Product</th>
                <th class="detail-th">SKU</th>
                <th class="detail-th detail-th--num">Prev. on hand qty</th>
                <th class="detail-th detail-th--num">Counted qty</th>
                <th class="detail-th detail-th--num">Difference qty</th>
                <th class="detail-th">Unit</th>
                <th class="detail-th">Storage locations</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!groupedBySku.length">
                <td colspan="7" class="detail-td detail-td--empty">
                  <div class="empty-inline">
                    <img src="/illustrations/empty-folder.png" alt="" class="empty-inline-illustration" width="288" height="240" />
                    <p class="empty-inline-title">No results found</p>
                    <p class="empty-inline-desc">Try adjusting your search or filters.</p>
                    <a class="empty-inline-clear" @click="locSearch = ''">Clear all filters</a>
                  </div>
                </td>
              </tr>
              <tr v-for="row in groupedBySku" :key="row.sku" class="detail-item-row"
                  :class="{ 'detail-item-row--batch': isSerialTrackedSku(row.sku) }">
                <td class="detail-td detail-td--product"><ProductCell :name="row.product.name" :desc="row.product.desc" :image="row.product.img" /></td>
                <td class="detail-td">{{ row.sku }}</td>
                <td class="detail-td detail-td--num">{{ fmt(row.prevOnHand) }}</td>
                <td v-if="isSerialTrackedSku(row.sku)" class="detail-td detail-td--counted-batch" style="padding: 0;">
                  <div class="detail-counted-qty">{{ isNotStarted ? '—' : fmt(row.counted) }}</div>
                  <div v-if="!isNotStarted" class="detail-counted-action">
                    <button class="detail-view-link" type="button" @click="openViewSerialForSku(row)">View serial numbers</button>
                  </div>
                </td>
                <td v-else class="detail-td detail-td--num">{{ isNotStarted ? '—' : fmt(row.counted) }}</td>
                <td class="detail-td detail-td--num">{{ isNotStarted ? '—' : diffLabel(row.difference) }}</td>
                <td class="detail-td">{{ row.unit }}</td>
                <td class="detail-td">
                  <div class="detail-loc-tags">
                    <span v-for="loc in row.locations" :key="loc" class="detail-loc-tag">{{ loc === '—' ? 'No location assigned' : loc }}</span>
                  </div>
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
          <table ref="itemsTableEl" class="detail-items">
            <thead>
              <tr>
                <th class="detail-th">Product</th>
                <th class="detail-th">SKU</th>
                <template v-if="isCount">
                  <th class="detail-th detail-th--num">Prev. on hand</th>
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
        <button class="detail-btn detail-btn--secondary" @click="printPdf">Print stock card</button>
        <!-- Completed: no counting button, just Edit/Delete -->
        <template v-if="adjustment.status === 'completed'">
          <MpPopover id="sad-wms-actions-done" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
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
                <MpPopoverListItem @click="editAdjustment">Edit</MpPopoverListItem>
                <MpPopoverListItem @click="askDelete">Delete</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </template>
        <!-- Not started / In progress: split button -->
        <template v-else>
          <div class="detail-split-btn">
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
                  <MpPopoverListItem @click="askDelete">Delete</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </div>
        </template>
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
              <div role="separator" style="height:1px;margin:4px 0;background:var(--mp-border-default);" />
              <MpPopoverListItem @click="editAdjustment">Edit</MpPopoverListItem>
              <MpPopoverListItem @click="askDelete">Delete</MpPopoverListItem>
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

    <!-- Delete stock adjustment -->
    <MpModal
      id="sad-delete" :is-open="deleteOpen" size="md"
      is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="deleteOpen = false"
    >
      <MpModalContent>
        <MpModalHeader>Delete stock adjustment?<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          <p class="sa-del-intro">This action cannot be undone. Deleting this adjustment will:</p>
          <ul class="sa-del-list">
            <li>Remove the related journal entry</li>
            <li>Trigger recalculation that may affect COGS and product stock quantity</li>
          </ul>
          <div class="sa-del-field">
            <div class="sa-del-label-row">
              <label class="sa-del-label" for="sad-del-reason">Reason for deleting<span class="sa-del-req">*</span></label>
              <span class="sa-del-count">{{ deleteReason.length }} / {{ REASON_MAX }}</span>
            </div>
            <textarea
              id="sad-del-reason" class="sa-del-textarea" :class="{ 'sa-del-textarea--error': deleteError }"
              :maxlength="REASON_MAX" v-model="deleteReason" rows="3" @input="deleteError = ''"
            ></textarea>
            <p v-if="deleteError" class="sa-del-error">{{ deleteError }}</p>
          </div>
        </MpModalBody>
        <MpModalFooter>
          <div class="modal-footer-btns">
            <button class="btn-enterprise btn-enterprise--ghost" @click="deleteOpen = false">Cancel</button>
            <button class="btn-enterprise btn-enterprise--danger" @click="confirmDelete">Delete</button>
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

  <!-- Demo scenario FAB — shared approval view toggle (ERP only) -->
  <MpPopover v-if="!isWmsRecord" id="sad-demo-fab" is-close-on-select use-portal placement="top-end">
    <MpPopoverTrigger>
      <button class="demo-fab" aria-label="Change approval view">
        <MpIcon name="sliders" size="md" color="icon.inverse" />
      </button>
    </MpPopoverTrigger>
    <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
      <p class="demo-fab-heading">Approval view</p>
      <MpPopoverList>
        <MpPopoverListItem
          v-for="v in viewAsOptions" :key="v.value"
          :is-active="v.value === viewAs" @click="setViewAs(v.value)"
        >{{ v.label }}</MpPopoverListItem>
      </MpPopoverList>
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
.detail-jump-search-wrap { padding: var(--mp-spacing-3); }
.detail-jump-search { width: 100%; box-sizing: border-box; padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; }
.detail-jump-search:focus { border-color: var(--mp-border-brand-bold, #029861); }
.detail-jump-search::placeholder { color: var(--mp-text-placeholder); }
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
.detail-loc-search { height: 36px; padding: 0 var(--mp-spacing-3) 0 calc(var(--mp-spacing-3) + 16px + var(--mp-spacing-2)); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full); background: var(--mp-background-neutral); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; width: 240px; box-sizing: border-box; }
.detail-loc-search:focus { border-color: var(--mp-border-brand-bold, #029861); }
.detail-loc-search::placeholder { color: var(--mp-text-placeholder); }
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
.detail-items--fixed { table-layout: fixed; width: 840px; }
.detail-col-product { width: 210px; }
.detail-col-sku { width: 90px; }
.detail-col-batch { width: 120px; }
.detail-col-num { width: 110px; }
.detail-col-unit { width: 90px; }
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

/* Delete modal */
.modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); width: 100%; }
.sa-del-intro { color: var(--mp-text-default); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 24px); }
.sa-del-list { margin: var(--mp-spacing-2) 0 0; padding-left: 21px; list-style: disc; color: var(--mp-text-default); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 24px); }
.sa-del-field { margin-top: var(--mp-spacing-5, 20px); display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.sa-del-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); width: 100%; }
.sa-del-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.sa-del-req { color: var(--mp-text-danger, #a8352d); margin-left: 2px; }
.sa-del-count { margin-left: auto; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.sa-del-textarea { width: 100%; min-height: 80px; resize: vertical; padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-form, rgba(29,31,36,0.16)); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral, #fff); color: var(--mp-text-default); font-family: inherit; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); }
.sa-del-textarea:focus { outline: none; border-color: var(--mp-border-focus, var(--mp-text-selected)); }
.sa-del-textarea--error { border-color: var(--mp-border-danger, var(--mp-text-danger, #a8352d)); }
.sa-del-error { margin-top: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #a8352d); }

/* Demo scenario FAB */
.demo-fab {
  position: fixed; right: var(--mp-spacing-6); bottom: var(--mp-spacing-6);
  width: var(--mp-spacing-12, 48px); height: var(--mp-spacing-12, 48px);
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-inverse, #080d0e); color: #fff;
  cursor: pointer; z-index: 1200;
  box-shadow: 0 4px 6px -2px rgba(0,0,0,0.1), 0 10px 15px -3px rgba(0,0,0,0.2);
}
.demo-fab:hover { opacity: 0.9; }
.demo-fab-heading { padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
