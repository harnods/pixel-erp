<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { formatDateLong, formatDateTimeLong } from '~/utils/date'
import {
  MpSpinner, MpIcon, MpTooltip,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton,
  toast,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import SourceLabel from '~/components/patterns/SourceLabel.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import ScanBar from '~/components/patterns/ScanBar.vue'
import ViewBatchDrawer from '~/components/patterns/ViewBatchDrawer.vue'
import ViewSerialDrawer from '~/components/patterns/ViewSerialDrawer.vue'
import { getPackingLineItems, type PackLineItem } from '~/data/packingTaskDetails'
import { getPackingTask, savePackingDraft, endPacking } from '~/data/packingTasks'
import { addDeliveryTaskFromPackingTasks, marketplaceShipping } from '~/data/deliveryTasks'
import { outgoingOrders, isMarketplaceOrder } from '~/data/outgoing'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { getWarehouseConfig, scanRequiredForQty } from '~/data/warehouseConfig'
import { productBySku } from '~/data/inventory'
import { resolveScan, notifyScanError, sameCode } from '~/utils/scan'
import { playScanSuccessSound } from '~/utils/sound'
import { useUnsavedChangesGuard } from '~/composables/useUnsavedChangesGuard'

const props = defineProps<{ orderId: string }>()
const router = useRouter()

const task = computed(() => getPackingTask(props.orderId))
// Below the warehouse's scan threshold, manual qty entry is disabled — the
// operator must scan the barcode once per unit instead (scan handlers already
// only ever +1, so they need no changes; only the manual input is gated).
const warehouseConfig = computed(() => getWarehouseConfig(task.value?.warehouseId ?? ''))
function qtyScanRequired(qty: number): boolean {
  return scanRequiredForQty(warehouseConfig.value, qty)
}
const lineItems = computed(() => task.value ? getPackingLineItems(task.value) : [])

// Marketplace orders must be fulfilled in full — every picked unit has to be packed
// (no short-packing). The order = picked side is enforced upstream at picking, where a
// marketplace order can't be short-picked, so a full flow ends with packed = picked = order.
const order = computed(() => outgoingOrders.find(o => o.id === task.value?.salesOrderId))
const isMarketplace = computed(() => isMarketplaceOrder(order.value))
// Picking was skipped for this task's warehouse — there's no separate "picked" step
// to show; "available to pack" already equals the order's full demand.
const skippedPicking = computed(() => !task.value?.pickingTaskId)
const allPicked = computed(() =>
  lineItems.value.length > 0 &&
  lineItems.value.every(it => (draftQty.value[it.key] ?? 0) === it.pickedQty),
)
const canEndPacking = computed(() => !isMarketplace.value || allPicked.value)
const MARKETPLACE_SHORT_MSG = 'Marketplace orders must be packed in full — pack every picked unit before finishing.'
function isShortForMarketplace(item: PackLineItem): boolean {
  return showQtyErrors.value && isMarketplace.value && (draftQty.value[item.key] ?? 0) < item.pickedQty
}

const startDateLabel = computed(() => formatDateTimeLong(task.value?.startDate))
const endDateLabel = computed(() => task.value?.endDate ? formatDateTimeLong(task.value.endDate) : '—')

// Due date carries an end-of-day cut-off for marketplace orders (…T23:59); show the
// time only when the ISO string includes one.
const dueDateLabel = computed(() => {
  const d = order.value?.dueDate
  return d?.includes('T') ? formatDateTimeLong(d) : formatDateLong(d)
})

// ── Batch / serial tracking heuristic (same as picking/receiving/put-away) ──────
const BATCH_CATS = new Set(['Green Beans', 'Roasted Beans'])
const SERIAL_CATS = new Set(['Espresso Machine', 'Grinder', 'Equipment'])
const stockMap = computed(() => {
  const wh = getWarehouseDetail(task.value?.warehouseId ?? '')
  return new Map((wh?.stock ?? []).map(s => [s.sku, s]))
})
function isBatchTrackedSku(sku: string): boolean {
  const si = stockMap.value.get(sku)
  if (si) return (si.batches?.length ?? 0) > 0
  const p = productBySku(sku)
  return p ? BATCH_CATS.has(p.category) : false
}
function isSerialTrackedSku(sku: string): boolean {
  const si = stockMap.value.get(sku)
  if (si) return !!si.serials
  const p = productBySku(sku)
  return p ? SERIAL_CATS.has(p.category) : false
}

// ── View batch / View serial number — read-only, which batch/SN the packed units
// actually came from (already fixed/merged at the source in packingTaskDetails.ts). ─
const viewBatchItem = ref<PackLineItem | null>(null)
const viewSerialItem = ref<PackLineItem | null>(null)
function openViewBatch(item: PackLineItem) { viewBatchItem.value = item }
function openViewSerial(item: PackLineItem) { viewSerialItem.value = item }

const draftQty = ref<Record<string, number>>({})
const search = ref('')
function seedDraftQty() {
  const map: Record<string, number> = {}
  for (const it of lineItems.value) map[it.key] = it.packedQty
  draftQty.value = map
}

// ── Match-order verification ────────────────────────────────────────────────
// A batch/serial-tracked line isn't just counted at packing — each unit must be
// scanned so we confirm the exact SN/batch picked matches the order. Packed qty
// for these lines is driven purely by valid scans; Finish is blocked until every
// picked SN/batch is verified. (Stage 1: verification via the page scan bar.)
const verifiedSerials = ref<Record<string, Set<string>>>({})       // lineKey → scanned serials
const verifiedBatchQty = ref<Record<string, Record<string, number>>>({}) // lineKey → batchNo → scanned qty
function isTrackedItem(it: PackLineItem): boolean {
  return isBatchTrackedSku(it.skuCode) || isSerialTrackedSku(it.skuCode)
}
function verifiedCount(it: PackLineItem): number {
  if (isSerialTrackedSku(it.skuCode)) return verifiedSerials.value[it.key]?.size ?? 0
  if (isBatchTrackedSku(it.skuCode)) return Object.values(verifiedBatchQty.value[it.key] ?? {}).reduce((a, b) => a + b, 0)
  return draftQty.value[it.key] ?? 0
}
// Pre-fill verification to match units already packed (resumed draft), so the
// operator doesn't have to rescan work saved earlier.
function seedVerification() {
  const vs: Record<string, Set<string>> = {}
  const vb: Record<string, Record<string, number>> = {}
  for (const it of lineItems.value) {
    if (isSerialTrackedSku(it.skuCode)) {
      vs[it.key] = new Set((it.serialPicks ?? []).slice(0, it.packedQty).map(s => s.serial))
    } else if (isBatchTrackedSku(it.skuCode)) {
      const map: Record<string, number> = {}
      let remaining = it.packedQty
      for (const b of (it.batchPicks ?? [])) {
        const take = Math.min(remaining, b.qty)
        if (take > 0) map[b.batchNo] = take
        remaining -= take
        if (remaining <= 0) break
      }
      vb[it.key] = map
    }
  }
  verifiedSerials.value = vs
  verifiedBatchQty.value = vb
}
watch([() => props.orderId, lineItems], () => {
  seedDraftQty()
  seedVerification()
  search.value = ''
}, { immediate: true })

// ── Page-level scan bar ─────────────────────────────────────────────────────────
const flashRowKey = ref<string | null>(null)
let flashTimer: ReturnType<typeof setTimeout> | null = null
function flashRow(key: string) {
  flashRowKey.value = key
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => { flashRowKey.value = null }, 700)
}
function handleScan(rawValue: string) {
  const v = rawValue.trim()
  if (!v || !task.value) return
  // Global resolver — maps Batch No. / Serial Number / SKU straight to its real SKU,
  // same as picking/receiving/put-away; packing itself has no batch/serial choice
  // to make (that was already decided at picking), so a batch/serial scan just
  // increments this line's packed qty by 1.
  const resolved = resolveScan(task.value.warehouseId, v)
  if (!resolved) {
    notifyScanError(`Barcode not found: "${v}"`)
    return
  }
  const item = lineItems.value.find(it => it.skuCode === resolved.sku)
  if (!item) {
    notifyScanError(`${v}: SKU ${resolved.sku} isn't on this packing task`)
    return
  }
  const clearErrs = () => {
    if (showQtyErrors.value) showQtyErrors.value = false
    if (finishError.value) finishError.value = ''
  }

  // Serial-tracked: the scanned serial must be one that was picked for THIS order.
  // Scanning the bare SKU can't verify a specific unit, so it just opens the view.
  if (isSerialTrackedSku(item.skuCode)) {
    if (resolved.kind !== 'serial') {
      openViewSerial(item)
      notifyScanError(`${item.skuCode}: scan the serial number to verify this item`)
      return
    }
    const picked = (item.serialPicks ?? []).some(s => sameCode(s.serial, resolved.serial))
    if (!picked) {
      notifyScanError(`${resolved.serial}: serial not picked for this order`)
      return
    }
    const set = verifiedSerials.value[item.key] ?? new Set<string>()
    if ([...set].some(x => sameCode(x, resolved.serial))) {
      notifyScanError(`${resolved.serial}: already scanned`)
      return
    }
    const next = new Set(set); next.add(resolved.serial)
    verifiedSerials.value = { ...verifiedSerials.value, [item.key]: next }
    draftQty.value = { ...draftQty.value, [item.key]: next.size }
    clearErrs(); playScanSuccessSound(); flashRow(item.key)
    return
  }

  // Batch-tracked: the scanned batch must be one that was picked, and can't exceed
  // the qty picked from that batch.
  if (isBatchTrackedSku(item.skuCode)) {
    if (resolved.kind !== 'batch') {
      openViewBatch(item)
      notifyScanError(`${item.skuCode}: scan the batch number to verify this item`)
      return
    }
    const pick = (item.batchPicks ?? []).find(b => sameCode(b.batchNo, resolved.batchNo))
    if (!pick) {
      notifyScanError(`${resolved.batchNo}: batch not picked for this order`)
      return
    }
    const map = verifiedBatchQty.value[item.key] ?? {}
    const cur = map[pick.batchNo] ?? 0
    if (cur >= pick.qty) {
      notifyScanError(`${pick.batchNo}: already fully verified (${pick.qty})`)
      return
    }
    const nextMap = { ...map, [pick.batchNo]: cur + 1 }
    verifiedBatchQty.value = { ...verifiedBatchQty.value, [item.key]: nextMap }
    const total = Object.values(nextMap).reduce((a, b) => a + b, 0)
    draftQty.value = { ...draftQty.value, [item.key]: total }
    clearErrs(); playScanSuccessSound(); flashRow(item.key)
    return
  }

  // Non-tracked: a plain SKU count, +1 per scan.
  const current = draftQty.value[item.key] ?? 0
  if (current >= item.pickedQty) {
    notifyScanError(`${item.skuCode}: picked qty already fully packed`)
    return
  }
  draftQty.value = { ...draftQty.value, [item.key]: current + 1 }
  clearErrs(); playScanSuccessSound(); flashRow(item.key)
}
// Scanning is harmless to undo — nothing is persisted until Save draft / Finish
// packing — so let the operator wipe every unsaved scan/entry and start over.
function resetProgress() {
  seedDraftQty()
  seedVerification()
  if (showQtyErrors.value) showQtyErrors.value = false
  if (finishError.value) finishError.value = ''
}

const pickedTotal = computed(() => lineItems.value.reduce((s, it) => s + it.pickedQty, 0))
const draftPackedTotal = computed(() => Object.values(draftQty.value).reduce((a, b) => a + (b || 0), 0))
const draftOutstanding = computed(() => Math.max(0, pickedTotal.value - draftPackedTotal.value))
const shortItemsCount = computed(() => lineItems.value.filter(it => (draftQty.value[it.key] ?? 0) < it.pickedQty).length)

const filteredItems = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return lineItems.value
  return lineItems.value.filter(it => it.productName.toLowerCase().includes(q) || it.skuCode.toLowerCase().includes(q))
})
const PAGE_SIZE = 10
const shownCount = ref(PAGE_SIZE)
const loadingMore = ref(false)
const pagedItems = computed(() => filteredItems.value.slice(0, shownCount.value))
function loadMoreItems() {
  if (loadingMore.value || shownCount.value >= filteredItems.value.length) return
  loadingMore.value = true
  setTimeout(() => { shownCount.value = Math.min(shownCount.value + PAGE_SIZE, filteredItems.value.length); loadingMore.value = false }, 400)
}
const itemsScrollEl = ref<HTMLElement | null>(null)
const itemsSentinelEl = ref<HTMLElement | null>(null)
let itemsObserver: IntersectionObserver | null = null
function setupItemsObserver() {
  itemsObserver?.disconnect()
  if (!itemsScrollEl.value || !itemsSentinelEl.value) return
  itemsObserver = new IntersectionObserver(entries => { if (entries[0].isIntersecting) loadMoreItems() }, { root: itemsScrollEl.value, rootMargin: '0px 0px 120px 0px' })
  itemsObserver.observe(itemsSentinelEl.value)
}
watch(search, () => { shownCount.value = PAGE_SIZE; nextTick(() => { if (itemsScrollEl.value) itemsScrollEl.value.scrollTop = 0; setupItemsObserver() }) })

const showQtyErrors = ref(false)
// Inline validation caption under the toolbar (shown on a failed Finish attempt), not a toast.
const finishError = ref('')
function onQtyInput(key: string, max: number, e: Event) {
  let n = Math.floor(Number((e.target as HTMLInputElement).value))
  if (!Number.isFinite(n) || n < 0) n = 0
  if (n > max) n = max
  draftQty.value = { ...draftQty.value, [key]: n }
  if (showQtyErrors.value) showQtyErrors.value = false
  if (finishError.value) finishError.value = ''
}
function fmt(n: number) { return n.toLocaleString('id-ID') }

const showConfirm = ref(false)
const unverifiedTrackedLines = computed(() =>
  lineItems.value.filter(it => isTrackedItem(it) && verifiedCount(it) < it.pickedQty),
)
function endPackingClick() {
  if (!canEndPacking.value) {
    // Per-item pink cell + tooltip on the short-packed rows (below) carries the
    // "why" — no banner text needed for this one.
    showQtyErrors.value = true
    return
  }
  if (draftPackedTotal.value === 0) {
    showQtyErrors.value = true
    finishError.value = 'You must fill in packed qty for at least 1 item'
    return
  }
  // Match order: every picked serial/batch of a tracked line must be scanned so we
  // confirm the physical goods match the pick before the shipment goes out.
  if (unverifiedTrackedLines.value.length) {
    showQtyErrors.value = true
    finishError.value = 'Scan every serial/batch number to verify it matches the pick before finishing'
    return
  }
  finishError.value = ''
  showConfirm.value = true
}
function commit() {
  showConfirm.value = false
  const t = task.value
  if (!t) return
  endPacking(props.orderId, { ...draftQty.value })
  // Finishing packing hands the order straight to delivery — no separate "Create
  // delivery" step. Marketplace orders already carry a fixed courier + tracking no.;
  // everyone else fills those in later, in bulk, on the Handover to courier page.
  const info = marketplaceShipping(order.value)
  addDeliveryTaskFromPackingTasks([t], {
    assignee: t.assignee,
    deliveryMethod: info ? 'online' : undefined,
    courier: info?.courier,
    trackingNo: info?.trackingNo,
  })
  toast.notify({ variant: 'success', title: 'Packing finished, delivery ready to ship' , maxWidth: 'max-content'})
  // Already committed — the router.push below is this function's own doing,
  // not the operator losing unsaved work, so the guard mustn't fire on it.
  disableUnsavedChangesGuard()
  router.push(`/packing/${props.orderId}`)
}
function saveDraft() {
  savePackingDraft(props.orderId, { ...draftQty.value })
  toast.notify({ variant: 'success', title: 'Packing draft saved' , maxWidth: 'max-content'})
  disableUnsavedChangesGuard()
  router.push(`/packing/${props.orderId}`)
}

// ── Warn before losing unsaved packing progress — refresh/close-tab (native
// prompt) and in-app navigation/Back button (modal rendered once at the app
// root, see [...slug].vue — this app has a single catch-all route, so a
// per-page modal/onBeforeRouteLeave never fires). "Unsaved" = anything packed
// at all. disableUnsavedChangesGuard() is called by commit()/saveDraft()
// right before their own router.push — otherwise hasUnsavedChanges() would
// still read true (nothing else resets the packed qty after commit) and the
// "Leave without saving?" modal would fire right after the operator's own
// intentional Finish/Save action. ────────────────────────────────────────────
const { disableGuard: disableUnsavedChangesGuard } = useUnsavedChangesGuard({
  hasUnsavedChanges: () => draftPackedTotal.value > 0,
  saveDraft: () => {
    savePackingDraft(props.orderId, { ...draftQty.value })
    toast.notify({ variant: 'success', title: 'Packing draft saved', maxWidth: 'max-content' })
  },
})

function goBack() { router.push(`/packing/${props.orderId}`) }
function goPacking() { router.push('/outbound-delivery?tab=Packing') }

const stageEl = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)
function checkStageOverflow() { const el = stageEl.value; if (el) stageOverflowing.value = el.scrollHeight > el.clientHeight + 1 }
// Outer border only once the items scroll area actually overflows (can scroll).
const itemsOverflowing = ref(false)
function checkItemsOverflow() { const el = itemsScrollEl.value; itemsOverflowing.value = !!el && el.scrollHeight > el.clientHeight + 1 }
let stageObserver: ResizeObserver | null = null
let itemsResizeObserver: ResizeObserver | null = null
onMounted(() => {
  nextTick(() => {
    checkStageOverflow()
    checkItemsOverflow()
    stageObserver = new ResizeObserver(checkStageOverflow)
    if (stageEl.value) { stageObserver.observe(stageEl.value); stageEl.value.addEventListener('scroll', checkStageOverflow, { passive: true }) }
    itemsResizeObserver = new ResizeObserver(checkItemsOverflow)
    if (itemsScrollEl.value) itemsResizeObserver.observe(itemsScrollEl.value)
    setupItemsObserver()
  })
})
onUnmounted(() => { stageObserver?.disconnect(); itemsResizeObserver?.disconnect(); stageEl.value?.removeEventListener('scroll', checkStageOverflow); itemsObserver?.disconnect() })
watch([() => props.orderId, shownCount, filteredItems], () => nextTick(() => { checkStageOverflow(); checkItemsOverflow() }))
</script>

<template>
  <div v-if="task" class="detail-page">

    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb" @click="goPacking">Packing</button>
          <span class="detail-breadcrumb-sep">/</span>
          <button class="detail-breadcrumb" @click="goBack">{{ task.taskNo }}</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">Match order</h1>
        </div>
      </div>
    </header>

    <div ref="stageEl" class="detail-stage">

      <div class="pak-header">
        <ContentList label="Sales order" :value="task.salesNo" />
        <ContentList label="Source"><SourceLabel :source="order?.source" /></ContentList>
        <ContentList label="Due date" :value="dueDateLabel" />
        <ContentList label="Warehouse" :value="task.warehouseName" />
        <ContentList label="Assignee" :value="task.assignee" />
        <ContentList label="Start date" :value="startDateLabel" />
        <ContentList label="End date" :value="endDateLabel" />
      </div>

      <div class="pak-summary">
        <div class="pak-stat"><span class="pak-stat-label">SKU qty</span><span class="pak-stat-val">{{ fmt(lineItems.length) }}</span></div>
        <div v-if="!skippedPicking" class="pak-stat"><span class="pak-stat-label">Picked qty</span><span class="pak-stat-val">{{ fmt(pickedTotal) }}</span></div>
        <div class="pak-stat"><span class="pak-stat-label">Packed qty</span><span class="pak-stat-val">{{ fmt(draftPackedTotal) }}</span></div>
        <div class="pak-stat"><span class="pak-stat-label">Remaining qty to pack</span><span class="pak-stat-val">{{ fmt(draftOutstanding) }}</span></div>
      </div>

      <div class="pak-sku-section">
        <div class="pak-filter-bar">
          <div class="pak-search-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input v-model="search" class="pak-search" type="text" placeholder="Search product or SKU…" />
            <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        <ScanBar placeholder="Scan barcode..." @scan="handleScan">
          <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" type="button" @click="resetProgress">Reset count</button>
        </ScanBar>

        <p v-if="finishError" class="pak-finish-error">{{ finishError }}</p>

        <section class="pak-items-section" :class="{ 'pak-items-section--bordered': itemsOverflowing }">
          <div ref="itemsScrollEl" class="pak-items-scroll">
            <table class="pak-items">
              <thead>
                <tr>
                  <th class="pak-th">Product</th>
                  <th class="pak-th">SKU</th>
                  <th class="pak-th pak-th--num">Order qty</th>
                  <th v-if="!skippedPicking" class="pak-th pak-th--num">Picked qty</th>
                  <th class="pak-th pak-th--num">Packed qty</th>
                  <th class="pak-th pak-th--num">Remaining qty to pack</th>
                  <th class="pak-th">Unit</th>
                  <th class="pak-th pak-th--action"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in pagedItems" :key="item.key" class="pak-row" :class="{ 'pak-row--flash': flashRowKey === item.key }">
                  <td class="pak-td"><ProductCell :name="item.productName" :desc="item.productDesc" :image="item.image" /></td>
                  <td class="pak-td">{{ item.skuCode }}</td>
                  <td class="pak-td pak-td--num">{{ fmt(item.orderQty) }}</td>
                  <td v-if="!skippedPicking" class="pak-td pak-td--num">{{ fmt(item.pickedQty) }}</td>
                  <td
                    class="pak-td pak-td--input"
                    :class="{ 'pak-td--input--error': isShortForMarketplace(item) || (showQtyErrors && !(draftQty[item.key] ?? 0)) || (showQtyErrors && isTrackedItem(item) && verifiedCount(item) < item.pickedQty) }"
                  >
                    <MpTooltip
                      v-if="qtyScanRequired(item.pickedQty) || isTrackedItem(item)"
                      :id="`pak-tt-scan-${item.key}`"
                      :label="isTrackedItem(item) ? 'Scan the serial/batch number to verify each unit' : 'Qty at or below the scan threshold — scan the barcode instead of typing'"
                      placement="top"
                      use-portal
                      class="pak-qty-tooltip-wrap"
                    >
                      <input
                        class="pak-qty-input"
                        type="number" min="0" :max="item.pickedQty"
                        :value="draftQty[item.key] ?? 0"
                        :aria-label="`Packed qty for ${item.productName}`"
                        disabled
                      />
                    </MpTooltip>
                    <MpTooltip
                      v-else-if="isShortForMarketplace(item)"
                      :id="`pak-tt-short-${item.key}`"
                      :label="MARKETPLACE_SHORT_MSG"
                      placement="top"
                      use-portal
                      class="pak-qty-tooltip-wrap"
                    >
                      <input
                        class="pak-qty-input"
                        type="number" min="0" :max="item.pickedQty"
                        :value="draftQty[item.key] ?? 0"
                        :aria-label="`Packed qty for ${item.productName}`"
                        @input="onQtyInput(item.key, item.pickedQty, $event)"
                      />
                    </MpTooltip>
                    <input
                      v-else
                      class="pak-qty-input"
                      type="number" min="0" :max="item.pickedQty"
                      :value="draftQty[item.key] ?? 0"
                      :aria-label="`Packed qty for ${item.productName}`"
                      @input="onQtyInput(item.key, item.pickedQty, $event)"
                    />
                  </td>
                  <td class="pak-td pak-td--num">
                    <span :class="item.pickedQty - (draftQty[item.key] ?? 0) > 0 ? 'pak-outstanding' : 'pak-qty--full'">{{ fmt(item.pickedQty - (draftQty[item.key] ?? 0)) }}</span>
                  </td>
                  <td class="pak-td">{{ item.unit }}</td>
                  <td class="pak-td pak-td--action">
                    <span
                      v-if="isTrackedItem(item)"
                      class="pak-verify-tag"
                      :class="{ 'pak-verify-tag--done': verifiedCount(item) >= item.pickedQty, 'pak-verify-tag--pending': showQtyErrors && verifiedCount(item) < item.pickedQty }"
                    >{{ verifiedCount(item) }}/{{ item.pickedQty }} verified</span>
                    <MpTooltip v-if="isBatchTrackedSku(item.skuCode)" :id="`pak-tt-batch-${item.key}`" label="View batch" placement="top" use-portal>
                      <button class="pak-view-btn" type="button" aria-label="View batch" @click="openViewBatch(item)">
                        <MpIcon name="competencies" size="md" />
                      </button>
                    </MpTooltip>
                    <MpTooltip v-else-if="isSerialTrackedSku(item.skuCode)" :id="`pak-tt-serial-${item.key}`" label="View serial number" placement="top" use-portal>
                      <button class="pak-view-btn" type="button" aria-label="View serial number" @click="openViewSerial(item)">
                        <MpIcon name="competencies" size="md" />
                      </button>
                    </MpTooltip>
                  </td>
                </tr>
                <tr v-if="!filteredItems.length"><td class="pak-td pak-empty" :colspan="skippedPicking ? 7 : 8">No products match your search.</td></tr>
              </tbody>
            </table>
            <div ref="itemsSentinelEl" class="pak-sentinel" aria-hidden="true" />
            <div v-if="loadingMore" class="pak-loading pak-loading--inline"><MpSpinner size="sm" /> Loading products…</div>
          </div>
          <div class="pak-items-count"><span>Showing {{ pagedItems.length }} of {{ filteredItems.length }} products</span></div>
        </section>
      </div>

    </div>

    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <button class="pak-btn pak-btn--ghost" @click="goBack">Cancel</button>
      <button class="pak-btn pak-btn--secondary" @click="saveDraft">Save draft</button>
      <button class="pak-btn pak-btn--primary" @click="endPackingClick">Finish packing</button>
    </footer>
  </div>

  <div v-else class="pak-not-found">
    <p>Packing task not found.</p>
    <button class="detail-breadcrumb" @click="goPacking">Back to Packing</button>
  </div>

  <MpModal id="pak-confirm" :is-open="showConfirm" size="md" is-close-on-esc :is-keep-alive="false" @close="showConfirm = false">
    <MpModalContent>
      <MpModalHeader>
        {{ draftOutstanding > 0 ? 'Finish packing with unpacked items?' : 'Finish packing?' }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <template v-if="draftOutstanding > 0">
          {{ fmt(draftOutstanding) }} of {{ fmt(pickedTotal) }} picked units won't be packed
          across {{ shortItemsCount }} {{ shortItemsCount === 1 ? 'item' : 'items' }}.
          The order will be ready to ship for the {{ fmt(draftPackedTotal) }} packed units.
        </template>
        <template v-else>
          All {{ fmt(pickedTotal) }} picked units will be packed and ready to ship.
        </template>
      </MpModalBody>
      <MpModalFooter>
        <div class="pak-modal-footer">
          <button class="pak-btn pak-btn--ghost" @click="showConfirm = false">Cancel</button>
          <button class="pak-btn pak-btn--primary" @click="commit">Finish packing</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <ViewBatchDrawer
    v-if="viewBatchItem"
    :open="true"
    :sku="viewBatchItem.skuCode"
    :warehouse-id="task?.warehouseId ?? ''"
    kind="packing"
    :picked-batches="viewBatchItem.batchPicks ?? []"
    :product-name="viewBatchItem.productName"
    :product-img="viewBatchItem.image"
    @update:open="viewBatchItem = null"
  />
  <ViewSerialDrawer
    v-if="viewSerialItem"
    :open="true"
    :sku="viewSerialItem.skuCode"
    :warehouse-id="task?.warehouseId ?? ''"
    kind="packing"
    :counted-total="(viewSerialItem.serialPicks ?? []).length"
    :picked-serials="viewSerialItem.serialPicks ?? []"
    :planned-serials="viewSerialItem.serialPicks ?? []"
    :product-name="viewSerialItem.productName"
    :product-img="viewSerialItem.image"
    @update:open="viewSerialItem = null"
  />
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb-trail { display: flex; align-items: center; gap: var(--mp-spacing-1); align-self: flex-start; }
.detail-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px); }
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-breadcrumb-sep { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-6); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); display: flex; flex-direction: column; gap: var(--mp-spacing-6); }
.detail-footer { flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage); border-top: 1px solid transparent; }
.detail-footer--floating { border-top-color: var(--mp-border-default); }

.pak-header { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-5) var(--mp-spacing-10); padding-bottom: var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.pak-header :deep(.content-list) { padding-top: 0; flex: 0 0 318px; width: 318px; }
.pak-header :deep(.content-list__value) { white-space: normal; overflow-wrap: break-word; word-break: break-word; }
.pak-summary { display: flex; align-items: center; gap: var(--mp-spacing-10); align-self: flex-start; }
.pak-stat { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: var(--mp-sizes-24, 96px); }
.pak-stat-val { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.pak-stat-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.pak-sku-section { display: flex; flex-direction: column; }
.pak-filter-bar { display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-5); }
.pak-finish-error { margin: calc(var(--mp-spacing-1) - var(--mp-spacing-5)) 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm); color: var(--mp-text-danger, #c0392b); font-weight: var(--mp-font-weights-medium); }
.pak-search-wrap { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-1\.5) var(--mp-spacing-3); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full); background: var(--mp-background-neutral); color: var(--mp-text-secondary); min-width: 240px; }
.pak-search-wrap:focus-within { border-color: var(--mp-border-bold); box-shadow: 0 0 0 1px var(--mp-border-bold); }
.pak-search { flex: 1; border: none; background: transparent; outline: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pak-search::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }

.pak-items-section { display: flex; flex-direction: column; flex-shrink: 0; }
.pak-items-section--bordered { border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-lg); overflow: hidden; }
.pak-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: auto; }
.pak-items thead .pak-th { position: sticky; top: 0; z-index: 1; }
.pak-items { width: 100%; border-collapse: collapse; table-layout: auto; }
.pak-th { height: var(--mp-sizes-7, 28px); text-align: left; padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2); background: var(--mp-background-neutral, #fff); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-transform: uppercase; border-bottom: 1px solid var(--mp-border-default); white-space: nowrap; }
.pak-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.pak-td { padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); background: var(--mp-background-neutral-hovered); border-bottom: 1px solid var(--mp-border-default); border-right: 1px solid var(--mp-border-default); vertical-align: top; }
.pak-td:last-child { border-right: none; }
.pak-td--num { text-align: right; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); white-space: nowrap; }
.pak-td--input { padding: 0; background: var(--mp-background-neutral, #fff); }
.pak-td--input:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }
.pak-td--input--error { background: #FCEEED; border-bottom-color: #E2483D; }
.pak-qty-tooltip-wrap { display: block; width: 100%; }
.pak-qty-input { display: block; width: 100%; box-sizing: border-box; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); text-align: right; font-variant-numeric: tabular-nums; line-height: var(--mp-line-heights-md); }
.pak-qty--full { color: var(--mp-text-success-default, #15803d); font-weight: var(--mp-font-weights-medium); }
.pak-outstanding { color: var(--mp-text-default); font-weight: var(--mp-font-weights-medium); }
.pak-sentinel { height: 1px; }
.pak-loading { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); color: var(--mp-text-secondary); }
.pak-loading--inline { justify-content: center; padding: var(--mp-spacing-3); }
.pak-items-count { display: flex; align-items: center; margin: 0; padding: var(--mp-spacing-3) var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.pak-empty { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-8) 0; }

.pak-td--action { text-align: center; white-space: nowrap; }
/* Sticky action column — stays visible when the table scrolls wider than the stage */
.pak-th--action { position: sticky; right: 0; z-index: 2; }
.pak-td--action { position: sticky; right: 0; z-index: 1; }
.pak-view-btn { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); border-radius: var(--mp-radii-md); background: none; border: none; cursor: pointer; color: var(--mp-icon-default); }
.pak-view-btn:hover { background: var(--mp-background-neutral-hovered); }
/* Match-order verify progress tag (batch/serial lines) */
.pak-verify-tag { display: inline-block; margin-right: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); font-variant-numeric: tabular-nums; vertical-align: middle; }
.pak-verify-tag--done { color: var(--mp-text-success, #18794e); }
.pak-verify-tag--pending { color: var(--mp-text-danger, #a8352d); }

/* ── Row flash on scan ────────────────────────────────────────────────────────── */
@keyframes pak-flash {
  0%   { background-color: var(--mp-background-success-subtle, #dcfce7); }
  100% { background-color: transparent; }
}
.pak-row--flash td { animation: pak-flash 0.7s ease-out forwards; }

.pak-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer; border: 1px solid transparent; white-space: nowrap; transition: background 0.15s; }
.pak-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.pak-btn--primary:disabled:hover { background: var(--mp-background-brand-bold, #029861); }
.pak-btn--ghost { background: transparent; border-color: transparent; color: var(--mp-text-secondary); font-weight: var(--mp-font-weights-regular); }
.pak-btn--ghost:hover { background: var(--mp-background-neutral-hovered); }
.pak-btn--secondary { background: var(--mp-background-neutral); border-color: var(--mp-border-bold); color: var(--mp-text-default); }
.pak-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }
.pak-btn--primary { background: var(--mp-background-brand-bold, #029861); border-color: transparent; color: var(--mp-text-on-color, #fff); }
.pak-btn--primary:hover { background: var(--mp-background-brand-bold-hovered, #027a4e); }
.pak-modal-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }

.pak-not-found { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-4); flex: 1; height: 100%; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
