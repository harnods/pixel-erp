<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { formatDateTimeLong } from '~/utils/date'
import {
  MpButton, MpSpinner, MpIcon, MpTooltip,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton,
  toast,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import ScanBar from '~/components/patterns/ScanBar.vue'
import ManageBatchDrawer, { type CommittedBatch } from '~/components/patterns/ManageBatchDrawer.vue'
import ManageSerialDrawer, { type CommittedSerial } from '~/components/patterns/ManageSerialDrawer.vue'
import { findTaskWithPO, getTaskLineItems } from '~/data/receivingTaskDetails'
import { saveReceivingDraft, endReceiving as endReceivingTask, receivingTasksForReceipt, acknowledgeCanceledReceipt, type ReceivingBatchLine } from '~/data/receivingTasks'
import { isProductBatchTracked, isProductSerialTracked } from '~/data/trackStockBy'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { getWarehouseConfig, scanRequiredForQty } from '~/data/warehouseConfig'
import { notifyScanError, sameCode } from '~/utils/scan'
import { playScanSuccessSound } from '~/utils/sound'
import { useUnsavedChangesGuard } from '~/composables/useUnsavedChangesGuard'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const { t } = useLocale()

const entry     = computed(() => findTaskWithPO(props.orderId))
const task      = computed(() => entry.value?.task)
const po        = computed(() => entry.value?.po)
const lineItems = computed(() => task.value ? getTaskLineItems(task.value) : [])
// Put-away disabled for this task's warehouse → receiving finishes on its own,
// no "create put-away" option to offer.
const putAwayEnabledForTask = computed(() => getWarehouseConfig(po.value?.warehouseId ?? '').putAwayEnabled)
// Below the warehouse's scan threshold, manual qty entry is disabled — the
// operator must scan the barcode once per unit instead (scan handlers already
// only ever +1, so they need no changes; only the manual input is gated).
const warehouseConfig = computed(() => getWarehouseConfig(po.value?.warehouseId ?? ''))
function qtyScanRequired(qty: number): boolean {
  return scanRequiredForQty(warehouseConfig.value, qty)
}

const startDateLabel = computed(() => formatDateTimeLong(task.value?.startDate))

// ── Draft quantities ─────────────────────────────────────────────────────────
const draftQty = ref<Record<string, number>>({})
const search   = ref('')

watch([() => props.orderId, lineItems], () => {
  const map: Record<string, number> = {}
  for (const it of lineItems.value) map[it.skuCode] = it.receivedQty
  draftQty.value = map
  search.value = ''
}, { immediate: true })

const purchaseTotal      = computed(() => task.value?.purchaseQty ?? 0)
const draftReceivedTotal = computed(() =>
  Object.values(draftQty.value).reduce((a, b) => a + (b || 0), 0),
)

// Qty already received in prior ended tasks for the same receipt, per SKU
const priorReceivedPerSku = computed<Record<string, number>>(() => {
  const receiptId = task.value?.receiptId
  if (!receiptId) return {}
  const map: Record<string, number> = {}
  for (const t of receivingTasksForReceipt(receiptId)) {
    if (t.id === props.orderId) continue
    if (t.status !== 'pending put-away' && t.status !== 'completed') continue
    for (const it of t.items) map[it.sku] = (map[it.sku] ?? 0) + it.receivedQty
  }
  return map
})
// Outstanding is against Expected qty (this task's own target), not Purchase
// qty (the whole-PO ceiling) — floored per line at 0, since receiving more
// than expected is allowed and shouldn't read as a negative outstanding.
// targetQty is already THIS task's own remaining target (createReceivingTask
// nets it against prior ended tasks at creation time) — unlike expectedQty
// (Purchase qty, the whole-PO ceiling, unchanged since before this task
// existed), it must NOT be subtracted against priorReceivedPerSku again here.
const draftOutstanding = computed(() =>
  lineItems.value.reduce((sum, it) => {
    const draft = draftQty.value[it.skuCode] ?? 0
    return sum + Math.max(0, it.targetQty - draft)
  }, 0),
)
const shortItemsCount = computed(
  () => lineItems.value.filter(it => (draftQty.value[it.skuCode] ?? 0) < it.targetQty).length,
)
// Σ Expected qty — what "no outstanding" / "complete" means for THIS task,
// distinct from purchaseTotal (Σ Purchase qty, the whole-PO ceiling).
const targetTotal = computed(() => lineItems.value.reduce((s, it) => s + it.targetQty, 0))

const filteredItems = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return lineItems.value
  return lineItems.value.filter(
    it => it.productName.toLowerCase().includes(q) || it.skuCode.toLowerCase().includes(q),
  )
})

// ── Batch / serial helpers (same heuristic as stock count / stock in-out) ──────
const stockMap = computed(() => {
  const wh = getWarehouseDetail(po.value?.warehouseId ?? '')
  return new Map((wh?.stock ?? []).map(s => [s.sku, s]))
})
function isBatchTrackedSku(sku: string): boolean {
  const si = stockMap.value.get(sku)
  if (si) return (si.batches?.length ?? 0) > 0
  return isProductBatchTracked(sku)
}
function isSerialTrackedSku(sku: string): boolean {
  const si = stockMap.value.get(sku)
  if (si) return !!si.serials
  return isProductSerialTracked(sku)
}

// ── Manage batch drawer — received qty for batch-tracked SKUs comes from here,
// not a plain input (mirrors Stock in/out's batch-tracked column). ─────────────
const batchLinesBySku = ref<Record<string, CommittedBatch[]>>({})
const batchDrawerSku = ref<string | null>(null)
const batchDrawerOpen = computed({
  get: () => batchDrawerSku.value !== null,
  set: (v: boolean) => { if (!v) batchDrawerSku.value = null },
})
function openBatchDrawer(skuCode: string) { batchDrawerSku.value = skuCode }
function batchTotal(skuCode: string): number {
  return (batchLinesBySku.value[skuCode] ?? []).reduce((s, b) => s + (b.counted ?? 0), 0)
}
function batchHasCounts(skuCode: string): boolean {
  return (batchLinesBySku.value[skuCode] ?? []).some(b => b.counted !== null)
}
function saveBatchLines(batches: CommittedBatch[]) {
  const sku = batchDrawerSku.value
  if (!sku) return
  batchLinesBySku.value = { ...batchLinesBySku.value, [sku]: batches }
  draftQty.value = { ...draftQty.value, [sku]: batches.reduce((s, b) => s + (b.counted ?? 0), 0) }
  if (showQtyErrors.value) showQtyErrors.value = false
}

// ── Manage serial number drawer — qty is still typed in directly; the drawer
// collects the actual serials, which must match that qty before finishing. ─────
const serialLinesBySku = ref<Record<string, string[]>>({})
const serialDrawerSku = ref<string | null>(null)
const serialDrawerOpen = computed({
  get: () => serialDrawerSku.value !== null,
  set: (v: boolean) => { if (!v) serialDrawerSku.value = null },
})
function openSerialDrawer(skuCode: string) {
  serialDrawerSku.value = skuCode
}
function serialCount(skuCode: string): number {
  return serialLinesBySku.value[skuCode]?.length ?? 0
}
function saveSerialLines(serials: CommittedSerial[]) {
  const sku = serialDrawerSku.value
  if (!sku) return
  serialLinesBySku.value = { ...serialLinesBySku.value, [sku]: serials.map(s => s.serial) }
  draftQty.value = { ...draftQty.value, [sku]: serials.length }
  if (showQtyErrors.value) showQtyErrors.value = false
}

// Hydrate from whatever's already persisted on the task (e.g. resuming a saved
// draft) — mirrors draftQty's watcher above; without this, continuing a draft
// with existing batch/serial progress reopens both drawers blank.
watch([() => props.orderId, lineItems], () => {
  const nextBatch: Record<string, CommittedBatch[]> = {}
  const nextSerial: Record<string, string[]> = {}
  for (const it of lineItems.value) {
    if (it.batchLines?.length) {
      nextBatch[it.skuCode] = it.batchLines.map(b => ({
        key: b.batchNo, batchNo: b.batchNo, expiryDate: b.expiryDate, desc: b.desc, onHand: 0, counted: b.qty, unit: b.unit,
      }))
    }
    if (it.serialNumbers?.length) nextSerial[it.skuCode] = it.serialNumbers
  }
  batchLinesBySku.value = nextBatch
  serialLinesBySku.value = nextSerial
}, { immediate: true })

// SNs already received in prior tasks for the same receipt (block duplicates in drawer)
const priorReceivedSerialsBySku = computed<Record<string, string[]>>(() => {
  const receiptId = task.value?.receiptId
  if (!receiptId) return {}
  const map: Record<string, string[]> = {}
  for (const t of receivingTasksForReceipt(receiptId)) {
    if (t.id === props.orderId) continue
    if (t.status !== 'pending put-away' && t.status !== 'completed') continue
    for (const it of t.items) {
      if (it.serialNumbers?.length) {
        map[it.sku] = [...(map[it.sku] ?? []), ...it.serialNumbers]
      }
    }
  }
  return map
})

// ── Progressive pagination ────────────────────────────────────────────────────
const PAGE_SIZE    = 10
const shownCount   = ref(PAGE_SIZE)
const loadingMore  = ref(false)
const pagedItems   = computed(() => filteredItems.value.slice(0, shownCount.value))
const hasMoreItems = computed(() => shownCount.value < filteredItems.value.length)
const isProgressive = computed(() => filteredItems.value.length > PAGE_SIZE)

function loadMoreItems() {
  if (loadingMore.value || !hasMoreItems.value) return
  loadingMore.value = true
  setTimeout(() => {
    shownCount.value = Math.min(shownCount.value + PAGE_SIZE, filteredItems.value.length)
    loadingMore.value = false
  }, 500)
}

const itemsScrollEl   = ref<HTMLElement | null>(null)
const itemsSentinelEl = ref<HTMLElement | null>(null)
let itemsObserver: IntersectionObserver | null = null

function setupItemsObserver() {
  itemsObserver?.disconnect()
  if (!itemsScrollEl.value || !itemsSentinelEl.value) return
  itemsObserver = new IntersectionObserver(
    entries => { if (entries[0].isIntersecting) loadMoreItems() },
    { root: itemsScrollEl.value, rootMargin: '0px 0px 120px 0px' },
  )
  itemsObserver.observe(itemsSentinelEl.value)
}

watch(search, () => {
  shownCount.value = PAGE_SIZE
  loadingMore.value = false
  nextTick(() => {
    if (itemsScrollEl.value) itemsScrollEl.value.scrollTop = 0
    setupItemsObserver()
  })
})

// ── Scan bar ──────────────────────────────────────────────────────────────────
const flashRowId = ref<string | null>(null)
let flashTimer: ReturnType<typeof setTimeout> | null = null

function handleScan(rawValue: string) {
  const v = rawValue.trim()
  if (!v) return

  // Batch number scan — find across all already-saved batch lines
  for (const [skuCode, batches] of Object.entries(batchLinesBySku.value)) {
    const bIdx = batches.findIndex(b => sameCode(b.batchNo, v))
    if (bIdx !== -1) {
      // Expected qty (targetQty) is the hard cap — a batch re-scan must never push
      // the SKU's received total past what the task expects, matching the plain-SKU
      // and SN caps (PRD over-receipt guard, allow_receive_exceed_order = FALSE).
      const batchItem = lineItems.value.find(it => sameCode(it.skuCode, skuCode))
      const receivedTotal = batches.reduce((s, b) => s + (b.counted ?? 0), 0)
      if (batchItem && receivedTotal >= batchItem.targetQty) {
        notifyScanError(`${skuCode}: expected qty already fully received`)
        return
      }
      const newCounted = (batches[bIdx]!.counted ?? 0) + 1
      const updated = batches.map((b, i) => i === bIdx ? { ...b, counted: newCounted } : b)
      batchLinesBySku.value = { ...batchLinesBySku.value, [skuCode]: updated }
      draftQty.value = { ...draftQty.value, [skuCode]: updated.reduce((s, b) => s + (b.counted ?? 0), 0) }
      if (showQtyErrors.value) showQtyErrors.value = false
      playScanSuccessSound()
      flashRowId.value = skuCode
      if (flashTimer) clearTimeout(flashTimer)
      flashTimer = setTimeout(() => { flashRowId.value = null }, 700)
      return
    }
  }

  // SKU scan
  const item = lineItems.value.find(it => sameCode(it.skuCode, v))
  if (!item) {
    notifyScanError(`Barcode not found: "${v}"`)
    return
  }
  // Use the item's own canonical SKU casing from here on, not the raw scan —
  // draftQty/etc. are keyed by the stored SKU code, so a scan in different
  // case than what's stored must still land on the SAME key, not a new one.
  const sku = item.skuCode
  if (isBatchTrackedSku(sku)) {
    playScanSuccessSound()
    openBatchDrawer(sku)
    return
  }
  if (isSerialTrackedSku(sku)) {
    playScanSuccessSound()
    openSerialDrawer(sku)
    return
  }
  // Expected qty (targetQty) is the hard cap — a task may never receive past what
  // it expects (PRD over-receipt guard, allow_receive_exceed_order = FALSE).
  const current = draftQty.value[sku] ?? 0
  if (current >= item.targetQty) {
    notifyScanError(`${sku}: expected qty already fully received`)
    return
  }
  incrementDraftQty(sku)
}

function incrementDraftQty(sku: string) {
  const current = draftQty.value[sku] ?? 0
  draftQty.value = { ...draftQty.value, [sku]: current + 1 }
  if (showQtyErrors.value) showQtyErrors.value = false
  playScanSuccessSound()
  flashRowId.value = sku
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => { flashRowId.value = null }, 700)
}

const showQtyErrors = ref(false)

function onQtyInput(skuCode: string, expected: number, e: Event) {
  let n = Math.floor(Number((e.target as HTMLInputElement).value))
  if (!Number.isFinite(n) || n < 0) n = 0
  if (n > expected) n = expected
  draftQty.value = { ...draftQty.value, [skuCode]: n }
  if (showQtyErrors.value) showQtyErrors.value = false
}

function fmt(n: number) { return n.toLocaleString('id-ID') }

// ── Finish receiving confirmation modal ─────────────────────────────────────────
const showConfirm = ref(false)

function endReceiving() {
  if (draftReceivedTotal.value === 0) {
    showQtyErrors.value = true
    toast.notify({ variant: 'error', title: t('Receive at least one item to finish, or cancel the task instead.'), maxWidth: 'max-content' })
    return
  }
  showConfirm.value = true
}

// Batch/serial identity recorded here would otherwise be thrown away once the qty
// total is computed — persist it so Put-away knows what to assign bins to later.
function buildReceivingDetail(): Record<string, { batchLines?: ReceivingBatchLine[]; serialNumbers?: string[] }> {
  const detail: Record<string, { batchLines?: ReceivingBatchLine[]; serialNumbers?: string[] }> = {}
  for (const item of lineItems.value) {
    if (isBatchTrackedSku(item.skuCode)) {
      const lines = batchLinesBySku.value[item.skuCode]
      if (lines) {
        detail[item.skuCode] = {
          batchLines: lines.map(b => ({
            batchNo: b.batchNo, expiryDate: b.expiryDate, desc: b.desc, qty: b.counted ?? 0, unit: b.unit,
          })),
        }
      }
    } else if (isSerialTrackedSku(item.skuCode)) {
      const serials = serialLinesBySku.value[item.skuCode]
      if (serials) detail[item.skuCode] = { serialNumbers: serials }
    }
  }
  return detail
}

function commitReceiving(createPutAway = false) {
  showConfirm.value = false
  const received = { ...draftQty.value }
  // Against Expected qty, not Purchase qty — matches draftOutstanding above, so
  // the confirm modal ("no outstanding") and this toast never contradict each other.
  const complete = draftReceivedTotal.value >= targetTotal.value
  endReceivingTask(props.orderId, received, buildReceivingDetail())
  // Already committed — the router.push below is this function's own doing,
  // not the operator losing unsaved work, so the guard mustn't fire on it.
  disableUnsavedChangesGuard()
  if (createPutAway) {
    router.push({
      path: '/inbound-delivery/put-away/create',
      query: { warehouseId: po.value?.warehouseId, taskId: props.orderId },
    })
  } else {
    const title = !complete
      ? t('Receiving finished (items short)')
      : putAwayEnabledForTask.value
        ? t('Receiving finished, awaiting put-away')
        : t('Receiving finished')
    toast.notify({ variant: 'success', title, maxWidth: 'max-content' })
    router.push(`/receiving/${props.orderId}`)
  }
}

function saveDraft() {
  saveReceivingDraft(props.orderId, { ...draftQty.value }, buildReceivingDetail())
  toast.notify({ variant: 'success', title: t('Receiving draft saved') , maxWidth: 'max-content'})
  disableUnsavedChangesGuard()
  router.push(`/receiving/${props.orderId}`)
}

// ── Warn before losing unsaved receiving progress — refresh/close-tab (native
// prompt) and in-app navigation/Back button (modal rendered once at the app
// root, see [...slug].vue — this app has a single catch-all route, so a
// per-page modal/onBeforeRouteLeave never fires). "Unsaved" = anything
// received at all. disableUnsavedChangesGuard() is called by
// commitReceiving()/saveDraft() right before their own router.push —
// otherwise hasUnsavedChanges() would still read true (nothing else resets
// the received qty after commit) and the "Leave without saving?" modal would
// fire right after the operator's own intentional Finish/Save action. ───────
const { disableGuard: disableUnsavedChangesGuard } = useUnsavedChangesGuard({
  hasUnsavedChanges: () => draftReceivedTotal.value > 0,
  saveDraft: () => {
    saveReceivingDraft(props.orderId, { ...draftQty.value }, buildReceivingDetail())
    toast.notify({ variant: 'success', title: t('Receiving draft saved'), maxWidth: 'max-content' })
  },
})

function goBack()      { router.push(`/receiving/${props.orderId}`) }
function goReceiving() { router.push('/inbound-delivery?tab=Receiving') }

// Defense in depth — the details page already blocks navigating here via
// Continue receiving until acknowledged, but a direct URL visit must be
// blocked the same way. Since this task belongs to exactly ONE PO,
// acknowledging cancels the task itself (nothing left to receive once its
// one-and-only PO is gone) — there's no receive UI to fall back into here,
// so this navigates back to the task details page instead.
function acknowledgeAndCancel() {
  if (!task.value) return
  const taskNo = task.value.taskNo
  acknowledgeCanceledReceipt(task.value.id)
  toast.notify({ variant: 'success', title: `${taskNo} canceled — purchase order was canceled`, maxWidth: 'max-content' })
  goBack()
}

// ── Footer divider ────────────────────────────────────────────────────────────
const stageEl          = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)

function checkStageOverflow() {
  const el = stageEl.value
  if (el) stageOverflowing.value = el.scrollHeight > el.clientHeight + 1
}

let stageObserver: ResizeObserver | null = null

onMounted(() => {
  nextTick(() => {
    checkStageOverflow()
    stageObserver = new ResizeObserver(checkStageOverflow)
    if (stageEl.value) {
      stageObserver.observe(stageEl.value)
      stageEl.value.addEventListener('scroll', checkStageOverflow, { passive: true })
    }
    setupItemsObserver()
  })
})
onUnmounted(() => {
  stageObserver?.disconnect()
  stageEl.value?.removeEventListener('scroll', checkStageOverflow)
  itemsObserver?.disconnect()
  if (flashTimer) clearTimeout(flashTimer)
})
watch([() => props.orderId, shownCount], () => nextTick(checkStageOverflow))
</script>

<template>
  <div v-if="task && po && task.needsCancelAck" class="ri-not-found">
    <p>The purchase order behind this task ({{ task.purchaseNo }}) was canceled.</p>
    <p>{{ t('There\'s nothing left to receive for it — acknowledging will cancel this task too.') }}</p>
    <button class="ri-btn ri-btn--primary" type="button" @click="acknowledgeAndCancel">{{ t('Acknowledge') }}</button>
    <button class="detail-breadcrumb" @click="goBack">{{ t('Back to task') }}</button>
  </div>

  <div v-else-if="task && po" class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb" @click="goReceiving">{{ t('Receiving') }}</button>
          <span class="detail-breadcrumb-sep">/</span>
          <button class="detail-breadcrumb" @click="goBack">{{ task.taskNo }}</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ t('Receive items') }}</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">

      <!-- PO header -->
      <div class="ri-header">
        <ContentList :label="t('Purchase order')" :value="po.purchaseNo" />
        <ContentList :label="t('Warehouse')" :value="po.warehouseName" />
        <ContentList :label="t('Assignee')" :value="task.assignee" />
        <ContentList :label="t('Start date')" :value="startDateLabel" />
      </div>

      <!-- Live summary -->
      <div class="ri-summary">
        <div class="ri-stat">
          <span class="ri-stat-label">{{ t('SKU qty') }}</span>
          <span class="ri-stat-val">{{ fmt(lineItems.length) }}</span>
        </div>
        <div class="ri-stat">
          <span class="ri-stat-label">{{ t('Purchase qty') }}</span>
          <span class="ri-stat-val">{{ fmt(purchaseTotal) }}</span>
        </div>
        <div class="ri-stat">
          <span class="ri-stat-label">{{ t('Received qty') }}</span>
          <span class="ri-stat-val">{{ fmt(draftReceivedTotal) }}</span>
        </div>
        <div class="ri-stat">
          <span class="ri-stat-label">
            {{ t('Remaining qty to receive') }}
            <MpTooltip
              id="ri-tt-outstanding"
              :label="t('Against Expected qty, floored at 0 — receiving more than expected (up to Purchase qty) never shows as a negative remaining qty.')"
              placement="top"
              use-portal
            >
              <span class="ri-stat-info"><MpIcon name="info" size="sm" /></span>
            </MpTooltip>
          </span>
          <span class="ri-stat-val">{{ fmt(draftOutstanding) }}</span>
        </div>
      </div>

      <!-- Filter bar + table -->
      <div class="ri-sku-section">

        <!-- Filter bar -->
        <div class="ri-filter-bar">
          <div class="ri-filter-bar-left">
            <span class="ri-editing-hint">{{ t('Enter the received qty for each item. For serial-tracked SKUs, use Manage serial number.') }}</span>
          </div>
          <div class="ri-search-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input v-model="search" class="ri-search" type="text" :placeholder="t('Search...')" />
            <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Scan bar -->
        <ScanBar :placeholder="t('Scan barcode...')" @scan="handleScan" />

        <!-- SKU table -->
        <section class="ri-items-section" :class="{ 'ri-items-section--bordered': isProgressive }">
          <div ref="itemsScrollEl" class="ri-items-scroll">
            <table class="ri-items">
              <colgroup>
                <col style="width: 26%" />
                <col style="width: 10%" />
                <col style="width: 11%" />
                <col style="width: 11%" />
                <col style="width: 11%" />
                <col style="width: 15%" />
                <col style="width: 8%" />
                <col style="width: 56px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="ri-th">{{ t('Product') }}</th>
                  <th class="ri-th">{{ t('SKU') }}</th>
                  <th class="ri-th ri-th--num">{{ t('Purchase qty') }}</th>
                  <th class="ri-th ri-th--num">{{ t('Expected qty') }}</th>
                  <th class="ri-th ri-th--num">{{ t('Received qty') }}</th>
                  <th class="ri-th ri-th--num">{{ t('Remaining qty to receive') }}</th>
                  <th class="ri-th">{{ t('Unit') }}</th>
                  <th class="ri-th"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in pagedItems" :key="item.skuCode" class="ri-row" :class="{ 'ri-row--flash': flashRowId === item.skuCode }">
                  <td class="ri-td">
                    <ProductCell :name="item.productName" :desc="item.productDesc" :image="item.image" />
                  </td>
                  <td class="ri-td">{{ item.skuCode }}</td>
                  <td class="ri-td ri-td--num">{{ fmt(item.expectedQty) }}</td>
                  <td class="ri-td ri-td--num">{{ fmt(item.targetQty) }}</td>
                  <!-- Received qty -->
                  <td v-if="isBatchTrackedSku(item.skuCode)" class="ri-td ri-td--num">
                    <span v-if="batchHasCounts(item.skuCode)" class="ri-batch-val">{{ fmt(batchTotal(item.skuCode)) }}</span>
                    <span v-else class="ri-batch-empty">—</span>
                  </td>
                  <td
                    v-else-if="isSerialTrackedSku(item.skuCode)"
                    class="ri-td ri-td--num"
                    :class="{ 'ri-td--input--error': showQtyErrors && !serialCount(item.skuCode) }"
                  >
                    <span v-if="serialCount(item.skuCode)" class="ri-batch-val">{{ fmt(serialCount(item.skuCode)) }}</span>
                    <span v-else class="ri-batch-empty">—</span>
                  </td>
                  <td
                    v-else
                    class="ri-td ri-td--input"
                    :class="{ 'ri-td--input--error': showQtyErrors && !(draftQty[item.skuCode] ?? 0) }"
                  >
                    <MpTooltip
                      v-if="qtyScanRequired(item.targetQty)"
                      :id="`ri-tt-scan-${item.skuCode}`"
                      :label="t('Qty at or below the scan threshold — scan the barcode instead of typing')"
                      placement="top"
                      use-portal
                    >
                      <input
                        class="ri-qty-input"
                        type="number" min="0"
                        :max="item.targetQty"
                        :value="draftQty[item.skuCode] ?? 0"
                        :aria-label="`${t('Received qty for')} ${item.productName}`"
                        disabled
                      />
                    </MpTooltip>
                    <input
                      v-else
                      class="ri-qty-input"
                      type="number" min="0"
                      :max="item.targetQty"
                      :value="draftQty[item.skuCode] ?? 0"
                      :aria-label="`${t('Received qty for')} ${item.productName}`"
                      @input="onQtyInput(item.skuCode, item.targetQty, $event)"
                    />
                  </td>
                  <td class="ri-td ri-td--num">
                    <span :class="item.targetQty - (draftQty[item.skuCode] ?? 0) > 0 ? 'ri-outstanding' : 'ri-qty--full'">
                      {{ fmt(item.targetQty - (draftQty[item.skuCode] ?? 0)) }}
                    </span>
                  </td>
                  <td class="ri-td">{{ item.unit }}</td>
                  <!-- Manage action column — only for batch/serial SKUs -->
                  <td v-if="isBatchTrackedSku(item.skuCode)" class="ri-td ri-td--action">
                    <MpTooltip :id="`ri-tt-batch-${item.skuCode}`" :label="t('Manage batch')" placement="top" use-portal>
                      <button class="ri-view-btn" type="button" :aria-label="t('Manage batch')" @click="openBatchDrawer(item.skuCode)">
                        <MpIcon name="competencies" size="md" />
                      </button>
                    </MpTooltip>
                  </td>
                  <td v-else-if="isSerialTrackedSku(item.skuCode)" class="ri-td ri-td--action">
                    <MpTooltip :id="`ri-tt-serial-${item.skuCode}`" :label="t('Manage serial numbers')" placement="top" use-portal>
                      <button class="ri-view-btn" type="button" :aria-label="t('Manage serial numbers')" @click="openSerialDrawer(item.skuCode)">
                        <MpIcon name="competencies" size="md" />
                      </button>
                    </MpTooltip>
                  </td>
                  <td v-else class="ri-td ri-td--action"></td>
                </tr>
                <tr v-if="!filteredItems.length">
                  <td class="ri-td ri-empty" colspan="8">{{ t('No products match your search.') }}</td>
                </tr>
              </tbody>
            </table>
            <div ref="itemsSentinelEl" class="ri-sentinel" aria-hidden="true" />
            <div v-if="loadingMore" class="ri-loading ri-loading--inline">
              <MpSpinner size="sm" /> {{ t('Loading products…') }}
            </div>
          </div>
          <div class="ri-items-count">
            <span>{{ t('Showing') }} {{ pagedItems.length }} {{ t('of') }} {{ filteredItems.length }} {{ t('products') }}</span>
          </div>
        </section>

      </div>

    </div>

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <button class="ri-btn ri-btn--ghost" @click="goBack">{{ t('Cancel') }}</button>
      <button class="ri-btn ri-btn--secondary" @click="saveDraft">{{ t('Save draft') }}</button>
      <button class="ri-btn ri-btn--primary" @click="endReceiving">{{ t('Finish receiving') }}</button>
    </footer>
  </div>

  <!-- Not found -->
  <div v-else class="ri-not-found">
    <p>{{ t('Receiving task not found.') }}</p>
    <button class="detail-breadcrumb" @click="goReceiving">{{ t('Back to Receiving') }}</button>
  </div>

  <!-- ── Finish receiving confirmation modal ── -->
  <MpModal
    id="ri-confirm"
    :is-open="showConfirm"
    :size="draftOutstanding > 0 ? 'lg' : 'md'"
    is-close-on-esc
    :is-keep-alive="false"
    @close="showConfirm = false"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ draftOutstanding > 0 ? t('Finish receiving with outstanding items?') : t('Finish receiving task?') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <template v-if="draftOutstanding > 0">
          {{ fmt(draftOutstanding) }} of {{ fmt(targetTotal) }} expected qty still outstanding
          across {{ shortItemsCount }} {{ shortItemsCount === 1 ? 'SKU' : 'SKUs' }}.
        </template>
        <template v-else>
          All {{ fmt(targetTotal) }} expected units have been received.
        </template>
      </MpModalBody>
      <MpModalFooter>
        <div class="ri-modal-footer">
          <button class="ri-btn ri-btn--ghost" @click="showConfirm = false">{{ draftOutstanding > 0 ? t('Continue receiving') : t('Cancel') }}</button>
          <button
            class="ri-btn"
            :class="putAwayEnabledForTask ? 'ri-btn--secondary' : 'ri-btn--primary'"
            @click="commitReceiving(false)"
          >{{ draftOutstanding > 0 ? t('Finish as incomplete') : t('Save') }}</button>
          <button v-if="putAwayEnabledForTask" class="ri-btn ri-btn--primary" @click="commitReceiving(true)">{{ t('Save & create put-away') }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <ManageBatchDrawer
    v-if="batchDrawerSku"
    :open="batchDrawerOpen"
    :sku="batchDrawerSku"
    :warehouse-id="po?.warehouseId ?? ''"
    kind="receiving"
    :target-count="lineItems.find(i => i.skuCode === batchDrawerSku)?.targetQty ?? 0"
    :max-count="Math.max(0, (lineItems.find(i => i.skuCode === batchDrawerSku)?.expectedQty ?? 0) - (priorReceivedPerSku[batchDrawerSku] ?? 0))"
    :model-value="batchLinesBySku[batchDrawerSku] ?? []"
    @update:open="batchDrawerOpen = $event"
    @save="saveBatchLines"
  />
  <ManageSerialDrawer
    v-if="serialDrawerSku"
    :open="true"
    :sku="serialDrawerSku"
    :warehouse-id="po?.warehouseId ?? ''"
    kind="receiving"
    :delta="lineItems.find(i => i.skuCode === serialDrawerSku)?.targetQty ?? 0"
    :target-count="lineItems.find(i => i.skuCode === serialDrawerSku)?.targetQty ?? 0"
    :max-count="Math.max(0, (lineItems.find(i => i.skuCode === serialDrawerSku)?.expectedQty ?? 0) - (priorReceivedPerSku[serialDrawerSku] ?? 0))"
    :location-on-hand="0"
    :model-value="(serialLinesBySku[serialDrawerSku] ?? []).map(s => ({ serial: s }))"
    :blocked-serials="priorReceivedSerialsBySku[serialDrawerSku] ?? []"
    @update:open="serialDrawerOpen = $event"
    @save="saveSerialLines"
  />
</template>

<style scoped>
/* ── Page shell ─────────────────────────────────────────────────────────────── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb-trail { display: flex; align-items: center; gap: var(--mp-spacing-1); align-self: flex-start; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-breadcrumb-sep {
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px);
}
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column; gap: var(--mp-spacing-6);
}
.detail-footer {
  flex-shrink: 0;
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage);
  border-top: 1px solid transparent;
}
.detail-footer--floating { border-top-color: var(--mp-border-default); }

/* ── PO header ───────────────────────────────────────────────────────────────── */
.ri-header {
  display: flex; flex-wrap: wrap; gap: var(--mp-spacing-5) var(--mp-spacing-10);
  padding-bottom: var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
}
.ri-header :deep(.content-list) { padding-top: 0; flex: 0 0 318px; width: 318px; }
.ri-header :deep(.content-list__value) { white-space: normal; overflow-wrap: break-word; word-break: break-word; }

/* ── Summary stats ───────────────────────────────────────────────────────────── */
.ri-summary { display: flex; align-items: center; gap: var(--mp-spacing-10); align-self: flex-start; }
.ri-stat { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: var(--mp-sizes-24, 96px); }
.ri-stat-val {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); font-variant-numeric: tabular-nums;
}
.ri-stat-label { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ri-stat-info { display: inline-flex; align-items: center; color: var(--mp-icon-default, var(--mp-text-secondary)); cursor: default; }

/* ── SKU section (filter bar + table) ───────────────────────────────────────── */
.ri-sku-section { display: flex; flex-direction: column; }

/* ── Filter bar — 20px gap ke table ─────────────────────────────────────────── */
.ri-filter-bar {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-5);
}
.ri-filter-bar-left { display: flex; align-items: center; gap: var(--mp-spacing-3); min-width: 0; }
.ri-editing-hint {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-normal, 400);
  color: var(--mp-text-default);
}
.ri-search-wrap {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary); min-width: 240px;
}
.ri-search-wrap:focus-within {
  border-color: var(--mp-border-bold, #8c9596);
  box-shadow: inset 0 0 0 1px var(--mp-border-bold, #8c9596);
}
.ri-search {
  flex: 1; border: none; background: transparent; outline: none;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md);
}
.ri-search::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }

/* ── Items table section ─────────────────────────────────────────────────────── */
.ri-items-section { display: flex; flex-direction: column; flex-shrink: 0; }
.ri-items-section--bordered {
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-lg); overflow: hidden;
}

/* Scroll container — same max-height as other create pages */
.ri-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: auto; }
.ri-items thead .ri-th { position: sticky; top: 0; z-index: 1; }

.ri-items { width: 100%; border-collapse: collapse; table-layout: fixed; }
.ri-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.ri-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.ri-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  background: var(--mp-background-neutral-hovered);
  border-bottom: 1px solid var(--mp-border-default);
  border-right: 1px solid var(--mp-border-default);
  vertical-align: top;
}
.ri-td:last-child { border-right: none; }
.ri-td--num { text-align: right; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); white-space: nowrap; }
.ri-td--input { padding: 0; }

/* Product cell */
.ri-product { display: flex; align-items: center; gap: var(--mp-spacing-3); min-width: 0; }
.ri-product-thumb {
  width: var(--mp-sizes-10, 40px); height: var(--mp-sizes-10, 40px);
  border-radius: var(--mp-radii-md); flex-shrink: 0;
  object-fit: cover; background: var(--mp-background-neutral); border: 1px solid var(--mp-border-subtle, var(--mp-border-default));
}
.ri-product-name {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-medium, 500);
  color: var(--mp-text-default); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* Qty input — fills full cell; white bg always, gray inset border on focus */
.ri-td--input { background: var(--mp-background-neutral, #fff); }
.ri-td--input:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }
.ri-td--input--error { background: var(--mp-background-danger-subtle, #fef2f2); }
.ri-td--input--error:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-danger, #dc2626); }
.ri-qty-input {
  display: block; width: 100%; box-sizing: border-box;
  padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4);
  border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  text-align: right; font-variant-numeric: tabular-nums;
  line-height: var(--mp-line-heights-md);
}

/* Batch/serial value display */
.ri-batch-val { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.ri-batch-empty { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* Manage action column */
.ri-td--action { text-align: center; white-space: nowrap; position: sticky; right: 0; z-index: 1; background: var(--mp-background-neutral, #fff); }
.ri-view-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border-radius: var(--mp-radii-md); background: none; border: none;
  cursor: pointer; color: var(--mp-icon-default);
}
.ri-view-btn:hover { background: var(--mp-background-neutral-hovered); }

/* Qty colors */
.ri-qty--full   { color: var(--mp-text-success-default, #15803d); font-weight: var(--mp-font-weights-medium, 500); }
.ri-outstanding { color: var(--mp-text-default); font-weight: var(--mp-font-weights-medium, 500); }

/* Progressive pagination */
.ri-sentinel { height: 1px; }
.ri-loading { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); color: var(--mp-text-secondary); }
.ri-loading--inline { justify-content: center; padding: var(--mp-spacing-3); }

.ri-items-count {
  display: flex; align-items: center; margin: 0;
  padding: var(--mp-spacing-3) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}

/* Empty search result */
.ri-empty { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-8) 0; }

/* Buttons (footer + modal) */
.ri-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer; border: 1px solid transparent; white-space: nowrap; line-height: var(--mp-line-heights-md);
  transition: background 0.15s;
}
.ri-btn--ghost {
  background: transparent; border-color: transparent; color: var(--mp-text-secondary);
  font-weight: var(--mp-font-weights-regular);
}
.ri-btn--ghost:hover { background: var(--mp-background-neutral-hovered); }
.ri-btn--secondary {
  background: var(--mp-background-neutral); border-color: var(--mp-border-bold); color: var(--mp-text-default);
}
.ri-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }
.ri-btn--primary {
  background: var(--mp-background-brand-bold, #029861); border-color: transparent; color: var(--mp-text-on-color, #fff);
}
.ri-btn--primary:hover { background: var(--mp-background-brand-bold-hovered, #027a4e); }

/* Modal footer */
.ri-modal-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }

/* ── Row flash on scan ───────────────────────────────────────────────────────── */
@keyframes ri-flash {
  0%   { background-color: var(--mp-background-success-subtle, #dcfce7); }
  100% { background-color: transparent; }
}
.ri-row--flash td { animation: ri-flash 0.7s ease-out forwards; }

/* Not found */
.ri-not-found {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--mp-spacing-4); flex: 1; height: 100%;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
</style>
