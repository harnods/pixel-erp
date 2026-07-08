<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpSpinner,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel,
  css,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import ViewBatchDrawer from '~/components/patterns/ViewBatchDrawer.vue'
import ViewSerialDrawer from '~/components/patterns/ViewSerialDrawer.vue'
import SourceLabel from '~/components/patterns/SourceLabel.vue'
import {
  getPackingLineItems, allPackingTasksFlat, getDeliveryForPackingTask, type PackLineItem,
} from '~/data/packingTaskDetails'
import { getPackingTask, startPacking, packingTaskAgingDays, type PackingTask } from '~/data/packingTasks'
import { getPickingTask } from '~/data/pickingTasks'
import { getShipment, type ShipmentSummary } from '~/data/deliveryTasks'
import { outgoingOrders, outgoingStage, OUTGOING_TODAY } from '~/data/outgoing'
import { formatDate, formatDateLong, formatDateTime, formatDateTimeLong } from '~/utils/date'
import { productBySku } from '~/data/inventory'
import { getWarehouseDetail } from '~/data/warehouseDetails'

type TaskStatus = 'open' | 'in progress' | 'completed' | 'canceled'

const props = defineProps<{ orderId: string }>()
const router = useRouter()

const task = computed(() => getPackingTask(props.orderId))
const lineItems = computed(() => task.value ? getPackingLineItems(task.value) : [])

const localStatus = ref<TaskStatus>('open')
const localEndDate = ref<string | null>(null)
const localPacked = ref<Record<string, number>>({})

watch([() => props.orderId, lineItems], () => {
  const map: Record<string, number> = {}
  for (const it of lineItems.value) map[it.key] = it.packedQty
  localPacked.value = map
  localStatus.value = (task.value?.status as TaskStatus) ?? 'open'
  localEndDate.value = task.value?.endDate ?? null
}, { immediate: true })

const isInProgress = computed(() => localStatus.value === 'in progress')

const pickedTotal = computed(() => lineItems.value.reduce((s, it) => s + it.pickedQty, 0))
// Picking was skipped for this task's warehouse — there's no separate "picked" step
// to show; "available to pack" already equals the order's full demand.
const skippedPicking = computed(() => !task.value?.pickingTaskId)
const packedTotal = computed(() => Object.values(localPacked.value).reduce((a, b) => a + (b || 0), 0))
const outstandingTotal = computed(() => Math.max(0, pickedTotal.value - packedTotal.value))
function rowPacked(key: string, fallback: number): number { return localPacked.value[key] ?? fallback }

// ── Batch / serial helpers (same heuristic as receiving / put-away / picking) ───
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

// ── View batch / View serial number — read-only, what was actually picked for this
// line. No storage location: packing only cares about what/how much, not where. ──
const viewBatchItem = ref<PackLineItem | null>(null)
const viewSerialItem = ref<PackLineItem | null>(null)
function openViewBatch(item: PackLineItem) { viewBatchItem.value = item }
function openViewSerial(item: PackLineItem) { viewSerialItem.value = item }

const linkedOrder = computed(() => outgoingOrders.find(o => o.id === task.value?.salesOrderId))
const linkedDelivery = computed(() => task.value ? getDeliveryForPackingTask(task.value.id) : [])
// Delivery is just an in-between state (packed, waiting to leave) — not a document
// worth linking to on its own. Once shipped, the shipment batch is what matters.
const linkedShipments = computed<ShipmentSummary[]>(() => {
  const seqs = new Set(
    linkedDelivery.value.filter(d => d.shipmentNo).map(d => d.shipmentNo!.replace(/\D/g, '')),
  )
  return [...seqs].map(seq => getShipment(seq)).filter((h): h is ShipmentSummary => !!h)
})
// All picking lists this packing task came from (an order can be split over several).
const linkedPickings = computed(() => {
  const t = task.value
  if (!t) return []
  const ids = t.pickingTaskIds?.length ? t.pickingTaskIds : (t.pickingTaskId ? [t.pickingTaskId] : [])
  return ids.map(id => getPickingTask(id)).filter(Boolean) as NonNullable<ReturnType<typeof getPickingTask>>[]
})

const lastUpdated = computed(() => {
  if (!task.value?.startDate) return null
  const base = new Date(task.value.startDate).getTime()
  const progress = pickedTotal.value > 0 ? packedTotal.value / pickedTotal.value : 0
  return new Date(base + Math.floor(progress * 3 * 60 * 60 * 1000)).toISOString()
})

function startPackingAndNavigate() {
  startPacking(props.orderId)
  router.push(`/packing/${props.orderId}/pack`)
}
// Finishing packing auto-creates the delivery (see PackItemsPage.vue) — a
// completed task always has one to jump to.
function viewDelivery() {
  const d = linkedDelivery.value[0]
  if (d) router.push(`/delivery/${d.id}`)
}
function fmt(n: number) { return n.toLocaleString('id-ID') }
// Marketplace (Desty) orders carry a due time → show date+time, and flag those due
// within 24h with an "Expire in N hours" caption. ERP orders are date-only.
function isMarketplaceDue(o: { dueDate: string }) { return typeof o.dueDate === 'string' && o.dueDate.includes('T') }
function dueDisplay(o: { dueDate: string }) { return isMarketplaceDue(o) ? formatDateTime(o.dueDate) : formatDate(o.dueDate) }
function expireHours(o: { dueDate: string }): number | null {
  if (!isMarketplaceDue(o)) return null
  const h = (new Date(o.dueDate).getTime() - OUTGOING_TODAY.getTime()) / 3_600_000
  return h > 0 && h < 24 ? Math.max(1, Math.ceil(h)) : null
}
function agingLabel(): string {
  if (!task.value) return ''
  const d = packingTaskAgingDays({ ...task.value, endDate: localEndDate.value ?? undefined, status: localStatus.value } as PackingTask)
  return d > 1 ? `${d} days` : ''
}
function agingDays(startDate?: string, endDate?: string): number {
  if (!startDate) return 0
  const REF = new Date().toISOString()
  const start = new Date(startDate).getTime()
  const end = new Date(endDate ?? REF).getTime()
  return Math.max(0, Math.round((end - start) / 86_400_000)) + 1
}

// search + pagination
const itemSearch = ref('')
const filteredItems = computed(() => {
  const q = itemSearch.value.trim().toLowerCase()
  if (!q) return lineItems.value
  return lineItems.value.filter(it => it.productName.toLowerCase().includes(q) || it.skuCode.toLowerCase().includes(q))
})
const PAGE_SIZE = 10
const shownCount = ref(PAGE_SIZE)
const loadingMore = ref(false)
const visibleItems = computed(() => filteredItems.value.slice(0, shownCount.value))
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
watch(itemSearch, () => { shownCount.value = PAGE_SIZE; nextTick(() => { if (itemsScrollEl.value) itemsScrollEl.value.scrollTop = 0 }) })

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
    setupItemsObserver()
    checkStageOverflow()
    checkItemsOverflow()
    stageObserver = new ResizeObserver(checkStageOverflow)
    if (stageEl.value) { stageObserver.observe(stageEl.value); stageEl.value.addEventListener('scroll', checkStageOverflow, { passive: true }) }
    itemsResizeObserver = new ResizeObserver(checkItemsOverflow)
    if (itemsScrollEl.value) itemsResizeObserver.observe(itemsScrollEl.value)
  })
})
onUnmounted(() => { itemsObserver?.disconnect(); stageObserver?.disconnect(); itemsResizeObserver?.disconnect(); stageEl.value?.removeEventListener('scroll', checkStageOverflow) })
watch([() => props.orderId, shownCount, filteredItems], () => nextTick(() => { checkStageOverflow(); checkItemsOverflow() }))

const jumpSearch = ref('')
const jumpResults = computed(() => {
  const all = allPackingTasksFlat()
  const q = jumpSearch.value.trim().toLowerCase()
  const matched = q ? all.filter(t => t.taskNo.toLowerCase().includes(q) || t.salesNo.toLowerCase().includes(q)) : all
  return matched.slice(0, 6)
})
function jumpTo(id: string) { jumpSearch.value = ''; router.push(`/packing/${id}`) }
function goBack() { router.push('/outbound-delivery?tab=Packing') }
</script>

<template>
  <div v-if="task" class="detail-page">

    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goBack">Packing</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ task.taskNo }}</h1>
          <span v-if="isInProgress" class="pck-pulse" aria-label="In process" />
          <ErpStatusBadge :status="localStatus" badge-for="additionalInformation" size="md" />
          <MpPopover id="pck-jump" use-portal :is-keep-alive="false" placement="bottom-start">
            <MpPopoverTrigger>
              <button class="detail-jump-chevron" aria-label="Switch task">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ width: '304px' })">
              <div class="detail-jump">
                <div class="detail-jump-search-wrap">
                  <input v-model="jumpSearch" class="detail-jump-search" type="text" placeholder="Search task or sales order…" />
                </div>
                <div class="detail-jump-list">
                  <button v-for="t in jumpResults" :key="t.id" class="detail-jump-item" @click="jumpTo(t.id)">
                    <span class="detail-jump-item-number">{{ t.taskNo }}</span>
                    <span class="detail-jump-item-customer">{{ t.salesNo }}</span>
                  </button>
                  <p v-if="!jumpResults.length" class="detail-jump-empty">No tasks found.</p>
                </div>
              </div>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>
      <div v-if="isInProgress && lastUpdated" class="detail-bar-right">
        <span class="pck-last-updated-label">Last updated</span>
        <span class="pck-last-updated-val">{{ formatDateTimeLong(lastUpdated) }}</span>
      </div>
    </header>

    <div ref="stageEl" class="detail-stage">

      <section class="pck-summary">
        <div class="content-list-col">
          <ContentList label="Sales order" :value="task.salesNo" />
          <ContentList label="Warehouse" :value="task.warehouseName" />
          <ContentList label="Assignee" :value="task.assignee" />
        </div>
        <div class="content-list-col">
          <ContentList label="Start date" :value="task.startDate ? formatDateTimeLong(task.startDate) : '—'" />
          <ContentList label="End date">
            <span class="pck-end-cell">
              <span>{{ localEndDate ? formatDateTime(localEndDate) : '—' }}</span>
              <span v-if="agingLabel()" class="pck-aging">{{ agingLabel() }}</span>
            </span>
          </ContentList>
        </div>
      </section>

      <section class="pck-progress">
        <div class="pck-progress-stat"><span class="pck-progress-label">SKU qty</span><span class="pck-progress-val">{{ task.skuQty }}</span></div>
        <div v-if="!skippedPicking" class="pck-progress-stat"><span class="pck-progress-label">Picked qty</span><span class="pck-progress-val">{{ fmt(pickedTotal) }}</span></div>
        <div class="pck-progress-stat"><span class="pck-progress-label">Packed qty</span><span class="pck-progress-val">{{ fmt(packedTotal) }}</span></div>
        <div class="pck-progress-stat"><span class="pck-progress-label">Outstanding qty</span><span class="pck-progress-val">{{ fmt(outstandingTotal) }}</span></div>
      </section>

      <div class="pck-table-wrap">
        <div class="pck-filter-bar">
          <div class="pck-search-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input v-model="itemSearch" class="pck-search" type="text" placeholder="Search..." />
          </div>
        </div>
        <section class="detail-items-section" :class="{ 'detail-items-section--bordered': itemsOverflowing }">
          <div ref="itemsScrollEl" class="detail-items-scroll">
            <table class="detail-items">
              <thead>
                <tr>
                  <th class="detail-th">Product</th>
                  <th class="detail-th">SKU</th>
                  <th class="detail-th">Storage location</th>
                  <th v-if="!skippedPicking" class="detail-th detail-th--num">Picked qty</th>
                  <th class="detail-th detail-th--num">Packed qty</th>
                  <th class="detail-th detail-th--num">Outstanding qty</th>
                  <th class="detail-th">Unit</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in visibleItems" :key="item.key" class="detail-item-row">
                  <td class="detail-td"><ProductCell :name="item.productName" :desc="item.productDesc" :image="item.image" /></td>
                  <td class="detail-td">{{ item.skuCode }}</td>
                  <td class="detail-td">{{ item.binLocation }}</td>

                  <!-- Picked qty: batch/serial-tracked SKUs split into a value row +
                       a "View batch"/"View serial number" row (read-only — what was
                       actually picked, no storage location). Hidden entirely when
                       picking was skipped for this task's warehouse. -->
                  <template v-if="!skippedPicking">
                    <td v-if="isBatchTrackedSku(item.skuCode)" class="detail-td detail-td--picked-batch">
                      <div class="pck-picked-qty">{{ fmt(item.pickedQty) }}</div>
                      <div class="pck-picked-action">
                        <button class="pck-view-link" type="button" @click="openViewBatch(item)">View batch</button>
                      </div>
                    </td>
                    <td v-else-if="isSerialTrackedSku(item.skuCode)" class="detail-td detail-td--picked-batch">
                      <div class="pck-picked-qty">{{ fmt(item.pickedQty) }}</div>
                      <div class="pck-picked-action">
                        <button class="pck-view-link" type="button" @click="openViewSerial(item)">View serial number</button>
                      </div>
                    </td>
                    <td v-else class="detail-td detail-td--num">{{ fmt(item.pickedQty) }}</td>
                  </template>

                  <td class="detail-td detail-td--num">
                    <span :class="isInProgress ? '' : (rowPacked(item.key, item.packedQty) === item.pickedQty ? 'pck-qty--full' : rowPacked(item.key, item.packedQty) > 0 ? 'pck-qty--partial' : 'pck-qty--zero')">
                      {{ fmt(rowPacked(item.key, item.packedQty)) }}
                    </span>
                  </td>
                  <td class="detail-td detail-td--num">
                    <span v-if="item.pickedQty - rowPacked(item.key, item.packedQty) > 0" class="pck-outstanding">
                      {{ fmt(item.pickedQty - rowPacked(item.key, item.packedQty)) }}
                    </span>
                    <span v-else class="pck-qty--full">—</span>
                  </td>
                  <td class="detail-td">{{ item.unit }}</td>
                </tr>
              </tbody>
            </table>
            <div ref="itemsSentinelEl" class="detail-items-sentinel" aria-hidden="true" />
            <div v-if="loadingMore" class="detail-loading detail-items-loading"><MpSpinner size="sm" /> Loading products…</div>
          </div>
          <div class="detail-items-count"><span>Showing {{ visibleItems.length }} of {{ filteredItems.length }} products</span></div>
        </section>
      </div>

      <MpTabs id="pck-tabs" :default-value="0" variant-color="green" class="pck-tabs">
        <MpTabList>
          <MpTab id="pck-tab-so" :value="0">Sales order ({{ linkedOrder ? 1 : 0 }})</MpTab>
          <MpTab v-if="linkedPickings.length" id="pck-tab-pick" :value="1">Picking ({{ linkedPickings.length }})</MpTab>
          <MpTab v-if="linkedShipments.length" id="pck-tab-ship" :value="2">Shipment ({{ linkedShipments.length }})</MpTab>
        </MpTabList>
        <MpTabPanels>
          <MpTabPanel :value="0">
            <h3 class="linked-section-title">Sales order</h3>
            <div class="pck-linked-wrap">
              <table class="pck-linked">
                <thead>
                  <tr><th class="detail-th">Number</th><th class="detail-th">Customer</th><th class="detail-th">Source</th><th class="detail-th detail-th--num">SKU qty</th><th class="detail-th detail-th--num">Order qty</th><th class="detail-th">Status</th><th class="detail-th">Due date</th></tr>
                </thead>
                <tbody>
                  <tr v-if="linkedOrder" class="detail-item-row">
                    <td class="detail-td detail-td--number">
                      <div class="cell-with-action">
                        <span class="pck-linked-num">{{ linkedOrder.salesNo }}</span>
                        <button class="row-hover-btn" @click.stop="router.push(`/outbound-delivery/${linkedOrder.id}`)">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                          <span class="row-hover-btn__label">VIEW DETAILS</span>
                        </button>
                      </div>
                    </td>
                    <td class="detail-td">{{ linkedOrder.customer ?? '—' }}</td>
                    <td class="detail-td"><SourceLabel :source="linkedOrder.source" /></td>
                    <td class="detail-td detail-td--num">{{ fmt(linkedOrder.skuQty) }}</td>
                    <td class="detail-td detail-td--num">{{ fmt(linkedOrder.orderQty) }}</td>
                    <td class="detail-td"><ErpStatusBadge :status="outgoingStage(linkedOrder)" /></td>
                    <td class="detail-td">
                      <span class="pck-due">
                        <span>{{ dueDisplay(linkedOrder) }}</span>
                        <span v-if="expireHours(linkedOrder) !== null" class="pck-due-expire">Expire in {{ expireHours(linkedOrder) }} hours</span>
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </MpTabPanel>

          <MpTabPanel v-if="linkedPickings.length" :value="1">
            <h3 class="linked-section-title">Picking {{ linkedPickings.length > 1 ? 'tasks' : 'task' }}</h3>
            <div class="pck-linked-wrap">
              <table class="pck-linked">
                <thead>
                  <tr><th class="detail-th">Number</th><th class="detail-th">Assignee</th><th class="detail-th detail-th--num">SKU qty</th><th class="detail-th detail-th--num">Picked qty</th><th class="detail-th">Status</th><th class="detail-th">Start date</th><th class="detail-th">End date</th></tr>
                </thead>
                <tbody>
                  <tr v-for="lp in linkedPickings" :key="lp.id" class="detail-item-row">
                    <td class="detail-td detail-td--number">
                      <div class="cell-with-action">
                        <span class="pck-linked-num">{{ lp.taskNo }}</span>
                        <button class="row-hover-btn" @click.stop="router.push(`/picking/${lp.id}`)">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                          <span class="row-hover-btn__label">VIEW DETAILS</span>
                        </button>
                      </div>
                    </td>
                    <td class="detail-td">{{ lp.assignee }}</td>
                    <td class="detail-td detail-td--num">{{ fmt(lp.skuQty) }}</td>
                    <td class="detail-td detail-td--num">{{ fmt(lp.pickedQty) }}</td>
                    <td class="detail-td"><ErpStatusBadge :status="lp.status" /></td>
                    <td class="detail-td">{{ lp.startDate ? formatDateTime(lp.startDate) : '—' }}</td>
                    <td class="detail-td">
                      <span class="linked-end">
                        <span v-if="lp.endDate">{{ formatDateTime(lp.endDate) }}</span>
                        <span v-else class="linked-end__muted">—</span>
                        <span v-if="agingDays(lp.startDate, lp.endDate) > 1" class="linked-aging">{{ agingDays(lp.startDate, lp.endDate) }} days</span>
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </MpTabPanel>

          <MpTabPanel v-if="linkedShipments.length" :value="2">
            <h3 class="linked-section-title">Shipment</h3>
            <div class="pck-linked-wrap">
              <table class="pck-linked">
                <thead>
                  <tr><th class="detail-th">Shipment no.</th><th class="detail-th">Assignee</th><th class="detail-th">Warehouse</th><th class="detail-th">Transaction date</th></tr>
                </thead>
                <tbody>
                  <tr v-for="h in linkedShipments" :key="h.shipmentSeq" class="detail-item-row">
                    <td class="detail-td detail-td--number">
                      <div class="cell-with-action">
                        <span class="pck-linked-num">{{ h.shipmentNo }}</span>
                        <button class="row-hover-btn" @click.stop="router.push(`/outbound-delivery/shipment/${h.shipmentSeq}`)">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                          <span class="row-hover-btn__label">VIEW DETAILS</span>
                        </button>
                      </div>
                    </td>
                    <td class="detail-td">{{ h.assignee }}</td>
                    <td class="detail-td">{{ h.warehouseName }}</td>
                    <td class="detail-td">{{ h.transactionDate ? formatDateTime(h.transactionDate) : '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </MpTabPanel>
        </MpTabPanels>
      </MpTabs>

    </div>

    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <MpPopover id="pck-print" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
        <MpPopoverTrigger>
          <button class="detail-btn detail-btn--secondary">
            Print
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem>Print packing slip</MpPopoverListItem>
            <MpPopoverListItem>Print shipping label</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
      <button v-if="localStatus === 'open'" class="detail-btn detail-btn--primary" @click="startPackingAndNavigate">
        Match order
      </button>
      <button v-else-if="localStatus === 'in progress'" class="detail-btn detail-btn--primary" @click="router.push(`/packing/${orderId}/pack`)">
        Continue matching
      </button>
      <button v-else-if="localStatus === 'completed' && linkedDelivery.length" class="detail-btn detail-btn--primary" @click="viewDelivery">
        View delivery
      </button>
    </footer>

  </div>

  <div v-else class="pck-not-found">
    <p>Packing task not found.</p>
    <button class="detail-breadcrumb" @click="goBack">Back to Packing</button>
  </div>

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
    :picked-serials="(viewSerialItem.serialPicks ?? []).map(s => s.serial)"
    :product-name="viewSerialItem.productName"
    :product-img="viewSerialItem.image"
    @update:open="viewSerialItem = null"
  />
</template>

<style scoped>
.detail-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px); }
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }

@keyframes pck-pulse-ring { 0% { transform: scale(0.85); opacity: 1; } 100% { transform: scale(1.8); opacity: 0; } }
.pck-pulse { position: relative; display: inline-flex; width: var(--mp-sizes-2, 8px); height: var(--mp-sizes-2, 8px); border-radius: var(--mp-radii-full, 999px); background: var(--mp-colors-emerald-500, #10b981); flex-shrink: 0; }
.pck-pulse::after { content: ''; position: absolute; inset: 0; border-radius: var(--mp-radii-full, 999px); background: var(--mp-colors-emerald-500, #10b981); animation: pck-pulse-ring 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite; }

.detail-bar-right { display: flex; flex-direction: column; align-items: flex-end; gap: var(--mp-spacing-0\.5); flex-shrink: 0; }
.pck-last-updated-label { font-size: var(--mp-font-sizes-xs, 11px); color: var(--mp-text-secondary); }
.pck-last-updated-val { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-medium); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }

.detail-jump-chevron { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px); background: none; border: none; padding: 0; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.detail-jump-chevron:hover { background: var(--mp-background-neutral-hovered); }
.detail-jump { display: flex; flex-direction: column; }
.detail-jump-search-wrap { padding: var(--mp-spacing-3); }
.detail-jump-search { width: 100%; box-sizing: border-box; padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; }
.detail-jump-search:focus { border-color: var(--mp-border-brand-bold, #029861); }
.detail-jump-list { display: flex; flex-direction: column; }
.detail-jump-item { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); width: 100%; text-align: left; background: none; border: none; cursor: pointer; padding: var(--mp-spacing-2) var(--mp-spacing-3); border-radius: var(--mp-radii-md); }
.detail-jump-item:hover { background: var(--mp-background-neutral-subtle); }
.detail-jump-item-number { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.detail-jump-item-customer { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-jump-empty { margin: 0; padding: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-6); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); display: flex; flex-direction: column; gap: var(--mp-spacing-8); }

.pck-summary { display: grid; grid-template-columns: 244px 244px; column-gap: var(--mp-spacing-6); row-gap: 0; }
.content-list-col { display: flex; flex-direction: column; }
.pck-end-cell { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.pck-aging { display: inline-flex; align-items: center; padding: 0 var(--mp-spacing-1\.5); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral-subtle, #f1f5f9); color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-lg, 20px); white-space: nowrap; }

.pck-progress { display: flex; align-items: center; gap: var(--mp-spacing-10); align-self: flex-start; }
.pck-progress-stat { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: var(--mp-sizes-28, 112px); }
.pck-progress-val { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.pck-progress-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.pck-table-wrap { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.pck-filter-bar { display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-3); }
.pck-search-wrap { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-1\.5) var(--mp-spacing-3); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full); background: var(--mp-background-neutral); color: var(--mp-text-secondary); min-width: 240px; }
.pck-search { flex: 1; border: none; background: transparent; outline: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pck-search::placeholder { color: var(--mp-text-placeholder); }

.detail-items-section { display: flex; flex-direction: column; flex-shrink: 0; }
.detail-items-section--bordered { border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md); overflow: hidden; }
.detail-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: auto; }
.detail-items thead .detail-th { position: sticky; top: 0; z-index: 1; }
.detail-items-sentinel { height: 1px; }
.detail-items-loading { justify-content: center; padding: var(--mp-spacing-3); }
.detail-loading { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); color: var(--mp-text-secondary); }
.detail-items { width: 100%; border-collapse: collapse; table-layout: auto; }
.detail-th { height: var(--mp-sizes-7, 28px); text-align: left; padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2); background: var(--mp-background-neutral-subtle); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-transform: uppercase; border-bottom: 1px solid var(--mp-border-default); white-space: nowrap; }
.detail-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.detail-td { padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); vertical-align: top; }
.detail-td--num { text-align: right; white-space: nowrap; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }
.detail-items-count { display: flex; align-items: center; margin: 0; padding: var(--mp-spacing-3) var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.pck-qty--full { color: var(--mp-text-success-default, #15803d); font-weight: var(--mp-font-weights-medium); }
.pck-qty--partial { color: var(--mp-text-warning-default, #854d0e); }
.pck-qty--zero { color: var(--mp-text-placeholder); }
.pck-outstanding { color: var(--mp-text-warning-default, #854d0e); font-weight: var(--mp-font-weights-medium); }

/* Batch/serial-tracked Picked qty — value row + View batch/SN action row. Plain
   block divs (not flex on the <td> itself) so the row still stretches naturally. */
.detail-td--picked-batch { padding: 0; vertical-align: top; }
.pck-picked-qty {
  height: var(--mp-sizes-10, 40px); display: flex; align-items: center; justify-content: flex-end;
  padding: 0 var(--mp-spacing-2) 0 var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.pck-picked-action {
  height: var(--mp-sizes-10, 40px); display: flex; align-items: center; justify-content: flex-end;
  padding: 0 var(--mp-spacing-2) 0 var(--mp-spacing-4);
}
.pck-view-link { background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); white-space: nowrap; }
.pck-view-link:hover { text-decoration: underline; text-underline-offset: 2px; }

.pck-tabs { flex-shrink: 0; }
.pck-tabs :deep(.mp-tab--isSelected_true), .pck-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.pck-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) { background-color: var(--mp-border-selected, #029861) !important; }
.pck-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }
.linked-section-title { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pck-linked-wrap { overflow-x: auto; }
.pck-linked { width: 100%; border-collapse: collapse; }
.pck-linked-num { color: var(--mp-text-link); }
.pck-due { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.pck-due-expire { font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm); color: var(--mp-text-danger, #c0392b); font-weight: var(--mp-font-weights-medium); }
.pck-linked .detail-td--number { position: relative; }
.cell-with-action { display: flex; align-items: center; width: 100%; min-width: 0; }
.row-hover-btn { position: absolute; right: var(--mp-spacing-2); top: 50%; transform: translateY(-50%); display: none; align-items: center; gap: var(--mp-spacing-1\.5); padding: var(--mp-spacing-1) var(--mp-spacing-1\.5); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-sm); cursor: pointer; white-space: nowrap; line-height: 1; color: var(--mp-text-secondary); }
.row-hover-btn__label { font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xs, 12px); color: var(--mp-text-secondary); text-transform: uppercase; }
.detail-item-row:hover .row-hover-btn { display: flex; }
.linked-end { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.linked-end__muted { color: var(--mp-text-secondary); }
.linked-aging { display: inline-flex; align-items: center; padding: 0 var(--mp-spacing-1\.5); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral-subtle); color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-lg, 20px); white-space: nowrap; }

.detail-footer { flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage); border-top: 1px solid transparent; }
.detail-footer--floating { border-top-color: var(--mp-border-default); }
.detail-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer; border: 1px solid transparent; white-space: nowrap; }
.detail-btn--secondary { background: var(--mp-background-neutral); border-color: var(--mp-border-bold); color: var(--mp-text-secondary); }
.detail-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }
.detail-btn--primary { background: var(--mp-background-brand-bold, #029861); border-color: transparent; color: var(--mp-text-on-color, #fff); }
.detail-btn--primary:hover { background: var(--mp-background-brand-bold-hovered, #027a4e); }

.pck-not-found { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-4); flex: 1; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
