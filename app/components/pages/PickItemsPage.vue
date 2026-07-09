<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { formatDateTimeLong } from '~/utils/date'
import {
  MpSpinner,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton,
  toast,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import ManageBatchDrawer, { type CommittedBatch } from '~/components/patterns/ManageBatchDrawer.vue'
import ManageSerialDrawer, { type CommittedSerial } from '~/components/patterns/ManageSerialDrawer.vue'
import { getPickingLineItems, type PickLineItem } from '~/data/pickingTaskDetails'
import {
  getPickingTask, savePickingDraft, endPicking,
  type PickingBatchPick, type PickingSerialPick, type PickingAssignments,
} from '~/data/pickingTasks'
import { outgoingOrders, isMarketplaceOrder } from '~/data/outgoing'
import { stockLocationPaths } from '~/data/storageLocations'
import { productBySku } from '~/data/inventory'
import { getWarehouseDetail } from '~/data/warehouseDetails'

const props = defineProps<{ orderId: string }>()
const router = useRouter()

const task = computed(() => getPickingTask(props.orderId))
const lineItems = computed(() => task.value ? getPickingLineItems(task.value) : [])
const itemByKey = computed(() => new Map(lineItems.value.map(it => [it.key, it])))
// stockLocationPaths() repeats a bin once per unit of capacity — dedupe before use as
// a dropdown's option list (same fix as PutAwayItemsPage.vue).
const locationOptions = computed(() => {
  if (!task.value) return []
  return [...new Set(stockLocationPaths(task.value.warehouseId).filter(Boolean))]
})

// ── Batch / serial helpers (same heuristic as receiving / put-away) ────────────
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
function batchOnHand(sku: string, batchNo: string): number {
  return stockMap.value.get(sku)?.batches?.find(b => b.batchNo === batchNo)?.onHand ?? 0
}
function locationForSerial(sku: string, serial: string): string {
  const sr = stockMap.value.get(sku)?.serials
  return sr?.available.find(u => u.serial === serial)?.location
    ?? sr?.reserved.find(u => u.serial === serial)?.location
    ?? ''
}

// ── Manage batch / Manage serial number — pick FROM existing batches/serials,
// keyed by picking line key (orderId::sku), matching the table's existing per-line
// granularity (a task bundling 2 orders for the same SKU already shows 2 independent
// rows today). Storage location is derived from wherever the chosen batch/serial
// already sits — never chosen manually, unlike put-away's destination picker. ────
const batchLinesByKey  = ref<Record<string, CommittedBatch[]>>({})
const serialLinesByKey = ref<Record<string, PickingSerialPick[]>>({})

watch(lineItems, (items) => {
  const nextBatch: Record<string, CommittedBatch[]> = {}
  const nextSerial: Record<string, PickingSerialPick[]> = {}
  for (const it of items) {
    if (it.batchPicks?.length) {
      nextBatch[it.key] = it.batchPicks.map(b => ({
        key: b.batchNo,
        batchNo: b.batchNo,
        expiryDate: b.expiryDate,
        desc: b.desc,
        onHand: batchOnHand(it.skuCode, b.batchNo),
        counted: b.qty,
        unit: b.unit,
        location: b.location,
      }))
    }
    if (it.serialPicks?.length) {
      nextSerial[it.key] = it.serialPicks.map(s => ({ ...s }))
    }
  }
  batchLinesByKey.value = nextBatch
  serialLinesByKey.value = nextSerial
}, { immediate: true })

const batchDrawerKey = ref<string | null>(null)
const batchDrawerOpen = computed({
  get: () => batchDrawerKey.value !== null,
  set: (v: boolean) => { if (!v) batchDrawerKey.value = null },
})
function openBatchDrawer(key: string) { batchDrawerKey.value = key }
function batchPickedQty(key: string): number {
  return (batchLinesByKey.value[key] ?? []).reduce((s, b) => s + (b.counted ?? 0), 0)
}
function saveBatchLines(batches: CommittedBatch[]) {
  const key = batchDrawerKey.value
  if (!key) return
  batchLinesByKey.value = { ...batchLinesByKey.value, [key]: batches }
}

const serialDrawerKey = ref<string | null>(null)
const serialDrawerOpen = computed({
  get: () => serialDrawerKey.value !== null,
  set: (v: boolean) => { if (!v) serialDrawerKey.value = null },
})
function openSerialDrawer(key: string) {
  if (!(draftQty.value[key] ?? 0)) {
    toast.notify({ variant: 'error', title: 'Enter qty to pick first' , maxWidth: 'max-content'})
    return
  }
  serialDrawerKey.value = key
}
function serialPickedQty(key: string): number {
  return (serialLinesByKey.value[key] ?? []).length
}
function saveSerialLines(serials: CommittedSerial[]) {
  const key = serialDrawerKey.value
  if (!key) return
  const item = itemByKey.value.get(key)
  if (!item) return
  serialLinesByKey.value = {
    ...serialLinesByKey.value,
    [key]: serials.map(s => ({ serial: s.serial, location: locationForSerial(item.skuCode, s.serial) })),
  }
}

/** Read-only bin list for the Storage location column, batch/serial-tracked SKUs only. */
function pickedLocations(key: string): string[] {
  const item = itemByKey.value.get(key)
  if (!item) return []
  const bins = new Set<string>()
  if (isBatchTrackedSku(item.skuCode)) {
    for (const b of batchLinesByKey.value[key] ?? []) if ((b.counted ?? 0) > 0 && b.location) bins.add(b.location)
  } else if (isSerialTrackedSku(item.skuCode)) {
    for (const s of serialLinesByKey.value[key] ?? []) if (s.location) bins.add(s.location)
  }
  return [...bins]
}

/** Picked qty for a line — batch/serial-tracked SKUs source it from their drawer
 *  selections, plain SKUs from the manual qty input (draftQty). */
function effectivePickedQty(item: PickLineItem): number {
  if (isBatchTrackedSku(item.skuCode)) return batchPickedQty(item.key)
  if (isSerialTrackedSku(item.skuCode)) return serialPickedQty(item.key)
  return draftQty.value[item.key] ?? 0
}

// Any picking task can be finished partially (regardless of marketplace) → it becomes
// "partially picked". The marketplace "must be complete" rule applies only when turning
// the task into a packing task (here: the "Finish & create packing" shortcut).
const marketplaceOrderIds = computed(
  () => new Set((task.value?.salesOrderIds ?? []).filter(id => isMarketplaceOrder(outgoingOrders.find(o => o.id === id)))),
)
const hasMarketplaceOrder = computed(() => marketplaceOrderIds.value.size > 0)

const startDateLabel = computed(() => formatDateTimeLong(task.value?.startDate))

// ── Draft picked qty (keyed by line key) ──────────────────────────────────────
const draftQty = ref<Record<string, number>>({})
const search = ref('')
watch([() => props.orderId, lineItems], () => {
  const map: Record<string, number> = {}
  for (const it of lineItems.value) map[it.key] = it.pickedQty
  draftQty.value = map
  search.value = ''
}, { immediate: true })

const toPickTotal = computed(() => lineItems.value.reduce((s, it) => s + it.expectedQty, 0))
const draftPickedTotal = computed(() => lineItems.value.reduce((s, it) => s + effectivePickedQty(it), 0))
const draftOutstanding = computed(() => Math.max(0, toPickTotal.value - draftPickedTotal.value))
const shortItemsCount = computed(() => lineItems.value.filter(it => effectivePickedQty(it) < it.expectedQty).length)

const filteredItems = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return lineItems.value
  return lineItems.value.filter(it => it.productName.toLowerCase().includes(q) || it.skuCode.toLowerCase().includes(q))
})

// ── Progressive pagination ────────────────────────────────────────────────────
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
  itemsObserver = new IntersectionObserver(
    entries => { if (entries[0].isIntersecting) loadMoreItems() },
    { root: itemsScrollEl.value, rootMargin: '0px 0px 120px 0px' },
  )
  itemsObserver.observe(itemsSentinelEl.value)
}
watch(search, () => { shownCount.value = PAGE_SIZE; nextTick(() => { if (itemsScrollEl.value) itemsScrollEl.value.scrollTop = 0; setupItemsObserver() }) })

// Batch/serial-tracked lines can't be "picked all" in bulk — their qty only comes
// from choosing specific batches/serials in the drawer.
function pickAll() {
  const map: Record<string, number> = { ...draftQty.value }
  for (const it of lineItems.value) {
    if (isBatchTrackedSku(it.skuCode) || isSerialTrackedSku(it.skuCode)) continue
    map[it.key] = it.expectedQty
  }
  draftQty.value = map
}

const showQtyErrors = ref(false)
// Inline validation caption under the toolbar (shown on a failed Finish attempt), not a toast.
const finishError = ref('')
function onQtyInput(key: string, expected: number, e: Event) {
  let n = Math.floor(Number((e.target as HTMLInputElement).value))
  if (!Number.isFinite(n) || n < 0) n = 0
  if (n > expected) n = expected
  draftQty.value = { ...draftQty.value, [key]: n }
  if (showQtyErrors.value) showQtyErrors.value = false
  if (finishError.value) finishError.value = ''
}
function fmt(n: number) { return n.toLocaleString('id-ID') }

// Build the picked-qty-per-line map and the batch/serial pick assignments to persist.
function buildPickedMap(): Record<string, number> {
  const map: Record<string, number> = {}
  for (const it of lineItems.value) map[it.key] = effectivePickedQty(it)
  return map
}
function buildAssignments(): PickingAssignments {
  const batchPicks: Record<string, PickingBatchPick[]> = {}
  for (const [key, batches] of Object.entries(batchLinesByKey.value)) {
    const picks = batches.filter(b => (b.counted ?? 0) > 0).map(b => ({
      batchNo: b.batchNo, expiryDate: b.expiryDate, desc: b.desc,
      qty: b.counted ?? 0, unit: b.unit, location: b.location ?? '',
    }))
    if (picks.length) batchPicks[key] = picks
  }
  const serialPicks: Record<string, PickingSerialPick[]> = {}
  for (const [key, serials] of Object.entries(serialLinesByKey.value)) {
    if (serials.length) serialPicks[key] = serials
  }
  return { batchPicks, serialPicks }
}

// ── Finish picking confirmation ───────────────────────────────────────────────
const showConfirm = ref(false)
function endPickingClick() {
  if (draftPickedTotal.value === 0) {
    showQtyErrors.value = true
    finishError.value = 'Enter picked qty for at least 1 item'
    return
  }
  finishError.value = ''
  showConfirm.value = true
}
function commitPicking(createPacking = false) {
  showConfirm.value = false
  const complete = draftPickedTotal.value >= toPickTotal.value
  endPicking(props.orderId, buildPickedMap(), buildAssignments())
  // Marketplace orders can only become a packing task when fully picked.
  const blockPacking = createPacking && hasMarketplaceOrder.value && !complete
  if (createPacking && !blockPacking) {
    router.push({ path: '/outbound-delivery/packing/create', query: { pickingId: props.orderId } })
    return
  }
  if (blockPacking) {
    toast.notify({
      variant: 'error',
      title: 'Saved as partially picked',
      description: 'Marketplace orders must be fully picked before a packing task can be created.',
      maxWidth: 'max-content',
    })
  } else {
    toast.notify({
      variant: complete ? 'success' : 'error',
      title: complete ? 'Picking finished, ready to pack' : 'Picking finished (partially picked)',
      maxWidth: 'max-content',
    })
  }
  router.push(`/picking/${props.orderId}`)
}
function saveDraft() {
  savePickingDraft(props.orderId, buildPickedMap(), buildAssignments())
  toast.notify({ variant: 'success', title: 'Picking draft saved' , maxWidth: 'max-content'})
  router.push(`/picking/${props.orderId}`)
}
function goBack() { router.push(`/picking/${props.orderId}`) }
function goPicking() { router.push('/outbound-delivery?tab=Picking') }

// ── Footer divider ────────────────────────────────────────────────────────────
const stageEl = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)
function checkStageOverflow() { const el = stageEl.value; if (el) stageOverflowing.value = el.scrollHeight > el.clientHeight + 1 }
// The items table gets an outer border only once its scroll area actually overflows
// (rows exceed its max height and it can scroll) — not merely by row count.
const itemsOverflowing = ref(false)
function checkItemsOverflow() {
  const el = itemsScrollEl.value
  itemsOverflowing.value = !!el && el.scrollHeight > el.clientHeight + 1
}
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
onUnmounted(() => {
  stageObserver?.disconnect()
  itemsResizeObserver?.disconnect()
  stageEl.value?.removeEventListener('scroll', checkStageOverflow)
  itemsObserver?.disconnect()
})
watch([() => props.orderId, shownCount, filteredItems], () => nextTick(() => { checkStageOverflow(); checkItemsOverflow() }))
</script>

<template>
  <div v-if="task" class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb" @click="goPicking">Picking</button>
          <span class="detail-breadcrumb-sep">/</span>
          <button class="detail-breadcrumb" @click="goBack">{{ task.taskNo }}</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">Picking list</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">

      <div class="pik-header">
        <ContentList label="Warehouse" :value="task.warehouseName" />
        <ContentList label="Assignee" :value="task.assignee" />
        <ContentList label="Sales orders" :value="task.salesNos.join(', ')" />
        <ContentList label="Start date" :value="startDateLabel" />
        <ContentList label="End date" :value="task.endDate ? formatDateTimeLong(task.endDate) : '—'" />
      </div>

      <div class="pik-summary">
        <div class="pik-stat"><span class="pik-stat-label">SKU qty</span><span class="pik-stat-val">{{ fmt(lineItems.length) }}</span></div>
        <div class="pik-stat"><span class="pik-stat-label">To pick qty</span><span class="pik-stat-val">{{ fmt(toPickTotal) }}</span></div>
        <div class="pik-stat"><span class="pik-stat-label">Picked qty</span><span class="pik-stat-val">{{ fmt(draftPickedTotal) }}</span></div>
        <div class="pik-stat"><span class="pik-stat-label">Outstanding qty</span><span class="pik-stat-val">{{ fmt(draftOutstanding) }}</span></div>
      </div>

      <div class="pik-sku-section">
        <div class="pik-filter-bar">
          <div class="pik-filter-bar-left">
            <span class="pik-editing-hint">
              {{ hasMarketplaceOrder
                ? 'Marketplace order — pick every item in full to finish picking.'
                : 'Pick each item from its storage location and enter the picked qty.' }}
            </span>
            <button class="pik-link-btn" @click="pickAll">Pick all</button>
          </div>
          <div class="pik-search-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input v-model="search" class="pik-search" type="text" placeholder="Search..." />
          </div>
        </div>
        <p v-if="finishError" class="pik-finish-error">{{ finishError }}</p>

        <section class="pik-items-section" :class="{ 'pik-items-section--bordered': itemsOverflowing }">
          <div ref="itemsScrollEl" class="pik-items-scroll">
            <table class="pik-items">
              <colgroup>
                <col /><!-- Product -->
                <col style="width: 160px" /><!-- SKU -->
                <col style="width: 170px" /><!-- Storage location -->
                <col /><!-- To pick qty -->
                <col /><!-- Picked qty -->
                <col /><!-- Outstanding qty -->
                <col style="width: 100px" /><!-- Unit -->
                <col /><!-- Action -->
              </colgroup>
              <thead>
                <tr>
                  <th class="pik-th">Product</th>
                  <th class="pik-th">SKU</th>
                  <th class="pik-th">Storage location</th>
                  <th class="pik-th pik-th--num">To pick qty</th>
                  <th class="pik-th pik-th--num">Picked qty</th>
                  <th class="pik-th pik-th--num">Outstanding qty</th>
                  <th class="pik-th">Unit</th>
                  <th class="pik-th"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in pagedItems" :key="item.key" class="pik-row">
                  <td class="pik-td"><ProductCell :name="item.productName" :desc="item.productDesc" :image="item.image" /></td>
                  <td class="pik-td">{{ item.skuCode }}</td>

                  <!-- Storage location: read-only bin list for batch/serial-tracked SKUs
                       (no picker — the location is wherever the picked batch/serial already
                       sits); plain SKUs keep the static bin text. -->
                  <td v-if="isBatchTrackedSku(item.skuCode) || isSerialTrackedSku(item.skuCode)" class="pik-td pik-td--location-summary">
                    <div class="pik-location-summary-wrap">
                      <template v-if="pickedLocations(item.key).length">
                        <span v-for="loc in pickedLocations(item.key)" :key="loc" class="pik-location-summary-item">{{ loc }}</span>
                      </template>
                      <span v-else class="pik-location-summary-item">—</span>
                    </div>
                  </td>
                  <td v-else class="pik-td">{{ item.binLocation }}</td>

                  <td class="pik-td pik-td--num">{{ fmt(item.expectedQty) }}</td>

                  <!-- Picked qty: plain value for batch-tracked SKUs (total from drawer),
                       input for serial-tracked SKUs, input for plain SKUs. -->
                  <td v-if="isBatchTrackedSku(item.skuCode)" class="pik-td pik-td--num">
                    <span class="pik-batch-val">{{ fmt(batchPickedQty(item.key)) }}</span>
                  </td>
                  <td
                    v-else-if="isSerialTrackedSku(item.skuCode)"
                    class="pik-td pik-td--input"
                    :class="{ 'pik-td--input--error': showQtyErrors && !(draftQty[item.key] ?? 0) }"
                  >
                    <input
                      class="pik-batch-qty-input"
                      type="number" min="0" :max="item.expectedQty"
                      :value="draftQty[item.key] ?? 0"
                      :aria-label="`Picked qty for ${item.productName}`"
                      @input="onQtyInput(item.key, item.expectedQty, $event)"
                    />
                  </td>
                  <td
                    v-else
                    class="pik-td pik-td--input"
                    :class="{ 'pik-td--input--error': showQtyErrors && !(draftQty[item.key] ?? 0) }"
                  >
                    <input
                      class="pik-qty-input"
                      type="number" min="0" :max="item.expectedQty"
                      :value="draftQty[item.key] ?? 0"
                      :aria-label="`Picked qty for ${item.productName}`"
                      @input="onQtyInput(item.key, item.expectedQty, $event)"
                    />
                  </td>
                  <td class="pik-td pik-td--num">
                    <span v-if="item.expectedQty - effectivePickedQty(item) > 0" class="pik-outstanding">
                      {{ fmt(item.expectedQty - effectivePickedQty(item)) }}
                    </span>
                    <span v-else class="pik-qty--full">—</span>
                  </td>

                  <td class="pik-td">{{ item.unit }}</td>

                  <!-- Action column: Manage batch / Manage serial numbers link -->
                  <td v-if="isBatchTrackedSku(item.skuCode)" class="pik-td pik-td--action">
                    <button class="pik-manage-btn" type="button" @click="openBatchDrawer(item.key)">Manage batch</button>
                  </td>
                  <td v-else-if="isSerialTrackedSku(item.skuCode)" class="pik-td pik-td--action">
                    <button class="pik-manage-btn" type="button" @click="openSerialDrawer(item.key)">Manage serial numbers</button>
                  </td>
                  <td v-else class="pik-td pik-td--action"></td>
                </tr>
                <tr v-if="!filteredItems.length">
                  <td class="pik-td pik-empty" colspan="8">No products match your search.</td>
                </tr>
              </tbody>
            </table>
            <div ref="itemsSentinelEl" class="pik-sentinel" aria-hidden="true" />
            <div v-if="loadingMore" class="pik-loading pik-loading--inline"><MpSpinner size="sm" /> Loading products…</div>
          </div>
          <div class="pik-items-count"><span>Showing {{ pagedItems.length }} of {{ filteredItems.length }} products</span></div>
        </section>
      </div>

    </div>

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <button class="pik-btn pik-btn--ghost" @click="goBack">Cancel</button>
      <button class="pik-btn pik-btn--secondary" @click="saveDraft">Save draft</button>
      <button class="pik-btn pik-btn--primary" @click="endPickingClick">Finish picking</button>
    </footer>
  </div>

  <div v-else class="pik-not-found">
    <p>Picking task not found.</p>
    <button class="detail-breadcrumb" @click="goPicking">Back to Picking</button>
  </div>

  <!-- ── Finish picking confirmation ── -->
  <MpModal id="pik-confirm" :is-open="showConfirm" size="md" is-close-on-esc :is-keep-alive="false" @close="showConfirm = false">
    <MpModalContent>
      <MpModalHeader>
        {{ draftOutstanding > 0 ? 'Finish picking with a short pick?' : 'Finish picking?' }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <template v-if="draftOutstanding > 0">
          {{ fmt(draftOutstanding) }} of {{ fmt(toPickTotal) }} units couldn't be picked
          across {{ shortItemsCount }} {{ shortItemsCount === 1 ? 'item' : 'items' }}.
          This picking will be saved as <strong>partially picked</strong>.
          <template v-if="hasMarketplaceOrder">
            A marketplace order here must be fully picked before a packing task can be created —
            pick the remaining items later on a new picking list.
          </template>
        </template>
        <template v-else>
          All {{ fmt(toPickTotal) }} units have been picked.
        </template>
      </MpModalBody>
      <MpModalFooter>
        <div class="pik-modal-footer">
          <button class="pik-btn pik-btn--ghost" @click="showConfirm = false">Cancel</button>
          <button class="pik-btn pik-btn--secondary" @click="commitPicking(false)">Finish picking</button>
          <button
            v-if="!(hasMarketplaceOrder && draftOutstanding > 0)"
            class="pik-btn pik-btn--primary"
            @click="commitPicking(true)"
          >Finish &amp; create packing</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <ManageBatchDrawer
    v-if="batchDrawerKey"
    :open="batchDrawerOpen"
    :sku="itemByKey.get(batchDrawerKey)?.skuCode ?? ''"
    :warehouse-id="task?.warehouseId ?? ''"
    kind="picking"
    :origin-location-paths="locationOptions"
    :target-count="itemByKey.get(batchDrawerKey)?.expectedQty ?? 0"
    :model-value="batchLinesByKey[batchDrawerKey] ?? []"
    @update:open="batchDrawerOpen = $event"
    @save="saveBatchLines"
  />
  <ManageSerialDrawer
    v-if="serialDrawerKey"
    :open="true"
    :sku="itemByKey.get(serialDrawerKey)?.skuCode ?? ''"
    :warehouse-id="task?.warehouseId ?? ''"
    kind="picking"
    :target-count="draftQty[serialDrawerKey] ?? 0"
    :origin-location-paths="locationOptions"
    :model-value="(serialLinesByKey[serialDrawerKey] ?? []).map(s => ({ serial: s.serial }))"
    @update:open="serialDrawerOpen = $event"
    @save="saveSerialLines"
  />
</template>

<style scoped>
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
.detail-breadcrumb-sep { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default);
}
.detail-stage {
  flex: 1; min-height: 0; overflow: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column; gap: var(--mp-spacing-6);
}
.detail-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage); border-top: 1px solid transparent;
}
.detail-footer--floating { border-top-color: var(--mp-border-default); }

.pik-header { flex-shrink: 0; display: flex; gap: var(--mp-spacing-10); padding-bottom: var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.pik-header :deep(.content-list) { padding-top: 0; }
.pik-summary { flex-shrink: 0; display: flex; align-items: center; gap: var(--mp-spacing-10); align-self: flex-start; }
.pik-stat { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: var(--mp-sizes-24, 96px); }
.pik-stat-val { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.pik-stat-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.pik-sku-section { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.pik-filter-bar { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-5); }
.pik-filter-bar-left { display: flex; align-items: center; gap: var(--mp-spacing-3); min-width: 0; }
.pik-editing-hint { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pik-finish-error { flex-shrink: 0; margin: calc(var(--mp-spacing-1) - var(--mp-spacing-5)) 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm); color: var(--mp-text-danger, #c0392b); font-weight: var(--mp-font-weights-medium); }
.pik-link-btn { background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-medium); color: var(--mp-text-link); }
.pik-link-btn:hover { text-decoration: underline; text-underline-offset: 2px; }
.pik-search-wrap {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary); min-width: 240px;
}
.pik-search-wrap:focus-within { border-color: var(--mp-border-bold); box-shadow: 0 0 0 1px var(--mp-border-bold); }
.pik-search { flex: 1; border: none; background: transparent; outline: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pik-search::placeholder { color: var(--mp-text-placeholder); }

.pik-items-section { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.pik-items-section--bordered { border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-lg); overflow: hidden; }
.pik-items-scroll { min-height: 0; overflow-y: auto; overflow-x: auto; }
.pik-items thead .pik-th { position: sticky; top: 0; z-index: 1; }
.pik-items { width: 100%; border-collapse: collapse; table-layout: auto; }
.pik-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.pik-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }

.pik-th { border-right: 1px solid var(--mp-border-default); }
.pik-th:last-child { border-right: none; }
.pik-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  background: var(--mp-background-neutral-hovered);
  border-bottom: 1px solid var(--mp-border-default); border-right: 1px solid var(--mp-border-default); vertical-align: top;
}
.pik-td:last-child { border-right: none; }
.pik-td--num { text-align: right; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); white-space: nowrap; }
.pik-td--input { padding: 0; background: var(--mp-background-neutral, #fff); }
.pik-td--input:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }
.pik-td--input--error { background: var(--mp-background-danger-subtle, #fef2f2); }
.pik-td--input--error:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-danger, #dc2626); }
.pik-qty-input {
  display: block; width: 100%; box-sizing: border-box;
  padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4);
  border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  text-align: right; font-variant-numeric: tabular-nums; line-height: var(--mp-line-heights-md);
}
.pik-qty--full { color: var(--mp-text-success-default, #15803d); font-weight: var(--mp-font-weights-medium); }
.pik-outstanding { color: var(--mp-text-default); font-weight: var(--mp-font-weights-medium); }

/* Storage location — read-only bin list for batch/serial-tracked SKUs. The flex
   layout lives on an inner wrapper div, not the <td> itself — display:flex directly
   on a <td> breaks the browser's native table-row height stretch. */
.pik-td--location-summary { padding: 0; color: var(--mp-text-default); background: var(--mp-background-neutral-hovered); vertical-align: top; }
.pik-location-summary-wrap { display: flex; flex-direction: column; height: 100%; }
.pik-location-summary-item { display: flex; align-items: center; height: var(--mp-sizes-10, 40px); padding: 0 var(--mp-spacing-2); flex-shrink: 0; }
.pik-location-summary-item:not(:last-child) { border-bottom: 1px solid var(--mp-border-default); }

.pik-batch-val { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.pik-batch-qty-input {
  display: block; width: 100%; height: 100%; box-sizing: border-box;
  padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  text-align: right; font-variant-numeric: tabular-nums; line-height: var(--mp-line-heights-md);
}
.pik-td--action { padding: 10px var(--mp-spacing-2); vertical-align: top; white-space: nowrap; }
.pik-manage-btn { background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.pik-manage-btn:hover { text-decoration: underline; text-underline-offset: 2px; }

.pik-sentinel { height: 1px; }
.pik-loading { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); color: var(--mp-text-secondary); }
.pik-loading--inline { justify-content: center; padding: var(--mp-spacing-3); }
.pik-items-count { flex-shrink: 0; display: flex; align-items: center; margin: 0; padding: var(--mp-spacing-3) var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.pik-empty { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-8) 0; }

.pik-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer; border: 1px solid transparent; white-space: nowrap; transition: background 0.15s;
}
.pik-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.pik-btn--primary:disabled:hover { background: var(--mp-background-brand-bold, #029861); }
.pik-btn--ghost { background: transparent; border-color: transparent; color: var(--mp-text-secondary); }
.pik-btn--ghost:hover { background: var(--mp-background-neutral-hovered); }
.pik-btn--secondary { background: var(--mp-background-neutral); border-color: var(--mp-border-bold); color: var(--mp-text-default); }
.pik-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }
.pik-btn--primary { background: var(--mp-background-brand-bold, #029861); border-color: transparent; color: var(--mp-text-on-color, #fff); }
.pik-btn--primary:hover { background: var(--mp-background-brand-bold-hovered, #027a4e); }
.pik-modal-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }

.pik-not-found { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-4); flex: 1; height: 100%; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
