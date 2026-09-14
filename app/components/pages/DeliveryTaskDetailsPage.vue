<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpSpinner,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, MpIcon, MpTooltip,
  css, toast,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import SourceLabel from '~/components/patterns/SourceLabel.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import ViewBatchDrawer from '~/components/patterns/ViewBatchDrawer.vue'
import ViewSerialDrawer from '~/components/patterns/ViewSerialDrawer.vue'
import { getDeliveryLineItems, allDeliveryTasksFlat, type ShipLineItem } from '~/data/deliveryTaskDetails'
import { getDeliveryTask, packingTaskIdsForDelivery } from '~/data/deliveryTasks'
import { getPackingTask } from '~/data/packingTasks'
import { getPickingTask } from '~/data/pickingTasks'
import { outgoingOrders, outgoingStage, OUTGOING_TODAY } from '~/data/outgoing'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { isProductBatchTracked, isProductSerialTracked } from '~/data/trackStockBy'
import { formatDate, formatDateLong, formatDateTime, formatDateTimeLong } from '~/utils/date'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const { t } = useLocale()

const task = computed(() => getDeliveryTask(props.orderId))
const lineItems = computed(() => task.value ? getDeliveryLineItems(task.value) : [])
const status = computed(() => task.value?.status ?? 'ready to ship')
const isShipped = computed(() => status.value === 'shipped')
const isPending = computed(() => status.value === 'ready to ship')

// ── Batch / serial tracking heuristic (same as picking/packing/receiving) ───────
const stockMap = computed(() => {
  const wh = getWarehouseDetail(task.value?.warehouseId ?? '')
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

// ── View batch / View serial number — read-only, which batch/SN is being shipped ─
const viewBatchItem = ref<ShipLineItem | null>(null)
const viewSerialItem = ref<ShipLineItem | null>(null)
function openViewBatch(item: ShipLineItem) { viewBatchItem.value = item }
function openViewSerial(item: ShipLineItem) { viewSerialItem.value = item }

const shipTotal = computed(() => task.value?.toShipQty ?? 0)

// Linked upstream transactions: sales order → packing → picking. A delivery can be
// merged from several packing tasks (bulk "Create delivery" on partial packing
// tasks for the same order), so both are plural.
const linkedOrder = computed(() => outgoingOrders.find(o => o.id === task.value?.salesOrderId))
const linkedPackings = computed(() => {
  const t = task.value
  if (!t) return []
  return packingTaskIdsForDelivery(t).map(id => getPackingTask(id)).filter(Boolean) as NonNullable<ReturnType<typeof getPackingTask>>[]
})
const linkedPickings = computed(() => {
  const ids = new Set(linkedPackings.value.map(p => p.pickingTaskId).filter(Boolean) as string[])
  return [...ids].map(id => getPickingTask(id)).filter(Boolean) as NonNullable<ReturnType<typeof getPickingTask>>[]
})

function fmt(n: number) { return n.toLocaleString('id-ID') }
function agingDays(startDate?: string, endDate?: string): number {
  if (!startDate) return 0
  const REF = new Date().toISOString()
  const start = new Date(startDate).getTime()
  const end = new Date(endDate ?? REF).getTime()
  return Math.max(0, Math.round((end - start) / 86_400_000)) + 1
}
// Marketplace (Desty) orders carry a due time → show date+time, and flag those due
// within 24h with an "Expire in N hours" caption. ERP orders are date-only.
function isMarketplaceDue(o: { dueDate: string }) { return typeof o.dueDate === 'string' && o.dueDate.includes('T') }
function dueDisplay(o: { dueDate: string }) { return isMarketplaceDue(o) ? formatDateTime(o.dueDate) : formatDate(o.dueDate) }
function expireHours(o: { dueDate: string }): number | null {
  if (!isMarketplaceDue(o)) return null
  const h = (new Date(o.dueDate).getTime() - OUTGOING_TODAY.getTime()) / 3_600_000
  return h > 0 && h < 24 ? Math.max(1, Math.ceil(h)) : null
}

function printDeliveryNote() {
  toast.notify({ variant: 'success', title: t('Delivery note sent to printer') , maxWidth: 'max-content'})
}
// Handover to courier is now a full-page bulk flow (see HandoverToCourierPage.vue) —
// this just seeds it with this one delivery.
function goHandover() {
  router.push({ path: '/outbound-delivery/handover/create', query: { deliveryIds: props.orderId } })
}

// ── jump switcher ─────────────────────────────────────────────────────────────
const jumpSearch = ref('')
const jumpResults = computed(() => {
  const all = allDeliveryTasksFlat()
  const q = jumpSearch.value.trim().toLowerCase()
  return (q ? all.filter(t => t.taskNo.toLowerCase().includes(q) || t.salesNo.toLowerCase().includes(q)) : all).slice(0, 6)
})
function jumpTo(id: string) { jumpSearch.value = ''; router.push(`/delivery/${id}`) }

// ── search + pagination ───────────────────────────────────────────────────────
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
const isProgressive = computed(() => filteredItems.value.length > PAGE_SIZE)
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
  itemsObserver = new IntersectionObserver(e => { if (e[0].isIntersecting) loadMoreItems() }, { root: itemsScrollEl.value, rootMargin: '0px 0px 120px 0px' })
  itemsObserver.observe(itemsSentinelEl.value)
}
watch(itemSearch, () => { shownCount.value = PAGE_SIZE; nextTick(() => { if (itemsScrollEl.value) itemsScrollEl.value.scrollTop = 0 }) })

const stageEl = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)
function checkStageOverflow() { const el = stageEl.value; if (el) stageOverflowing.value = el.scrollHeight > el.clientHeight + 1 }
let stageObserver: ResizeObserver | null = null
onMounted(() => {
  nextTick(() => {
    setupItemsObserver(); checkStageOverflow()
    stageObserver = new ResizeObserver(checkStageOverflow)
    if (stageEl.value) { stageObserver.observe(stageEl.value); stageEl.value.addEventListener('scroll', checkStageOverflow, { passive: true }) }
  })
})
onUnmounted(() => { itemsObserver?.disconnect(); stageObserver?.disconnect(); stageEl.value?.removeEventListener('scroll', checkStageOverflow) })
watch([() => props.orderId, shownCount], () => nextTick(checkStageOverflow))

function goBack() { router.push({ path: '/outbound-delivery', query: { tab: 'Ready to ship' } }) }
</script>

<template>
  <div v-if="task" class="detail-page">

    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goBack">{{ t('Shipping') }}</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ task.taskNo }}</h1>
          <ErpStatusBadge :status="status" badge-for="additionalInformation" size="md" />
          <MpPopover id="del-jump" use-portal :is-keep-alive="false" placement="bottom-start">
            <MpPopoverTrigger>
              <button class="detail-jump-chevron" :aria-label="t('Switch delivery')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ width: '304px' })">
              <div class="detail-jump">
                <div class="detail-jump-search-wrap">
                  <input v-model="jumpSearch" class="detail-jump-search" type="text" :placeholder="t('Search...')" />
                  <button v-if="jumpSearch" class="search-clear-btn search-clear-btn--overlay" type="button" :aria-label="t('Clear search')" @click="jumpSearch = ''">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                    </svg>
                  </button>
                </div>
                <div class="detail-jump-list">
                  <button v-for="t in jumpResults" :key="t.id" class="detail-jump-item" @click="jumpTo(t.id)">
                    <span class="detail-jump-item-number">{{ t.taskNo }}</span>
                    <span class="detail-jump-item-customer">{{ t.salesNo }}</span>
                  </button>
                  <p v-if="!jumpResults.length" class="detail-jump-empty">{{ t('No deliveries found.') }}</p>
                </div>
              </div>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>
    </header>

    <div ref="stageEl" class="detail-stage">

      <section class="del-summary">
        <div class="content-list-col">
          <ContentList :label="t('Sales order')" :value="task.salesNo" />
          <ContentList :label="t('Warehouse')">
            <div class="wh-link-wrap">
              <a class="cell-link" @click.stop="router.push(`/warehouses/${task.warehouseId}`)">{{ task.warehouseName }}</a>
            </div>
          </ContentList>
          <ContentList :label="t('Assignee')" :value="task.assignee" />
        </div>
        <div class="content-list-col">
          <ContentList :label="t('Courier')" :value="task.courier ?? '—'" />
          <ContentList :label="t('Tracking no.')" :value="task.trackingNo ?? '—'" />
          <ContentList :label="t('Ship date')" :value="task.shippedDate ? formatDateTimeLong(task.shippedDate) : '—'" />
        </div>
        <div v-if="status === 'canceled'" class="content-list-col">
          <ContentList :label="t('Canceled date')" :value="task.canceledDate ? formatDateTimeLong(task.canceledDate) : '—'" />
          <ContentList :label="t('Reason')" :value="task.canceledReason ?? '—'" />
          <ContentList :label="t('Canceled by')" :value="task.canceledBy ?? '—'" />
        </div>
      </section>

      <section class="del-progress">
        <div class="del-progress-stat"><span class="del-progress-label">{{ t('SKU qty') }}</span><span class="del-progress-val">{{ task.skuQty }}</span></div>
        <div class="del-progress-stat"><span class="del-progress-label">{{ t('To ship qty') }}</span><span class="del-progress-val">{{ fmt(shipTotal) }}</span></div>
        <div class="del-progress-stat"><span class="del-progress-label">{{ t('Shipped qty') }}</span><span class="del-progress-val">{{ fmt(task.shippedQty) }}</span></div>
      </section>

      <div class="del-table-wrap">
        <div class="del-filter-bar">
          <div class="del-search-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input v-model="itemSearch" class="del-search" type="text" :placeholder="t('Search...')" />
            <button v-if="itemSearch" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="itemSearch = ''">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </div>
        <section class="detail-items-section" :class="{ 'detail-items-section--bordered': isProgressive }">
          <div ref="itemsScrollEl" class="detail-items-scroll">
            <table class="detail-items">
              <colgroup>
                <col style="width: 46%" />
                <col style="width: 22%" />
                <col style="width: 12%" />
                <col style="width: 12%" />
                <col style="width: 8%" />
              </colgroup>
              <thead>
                <tr>
                  <th class="detail-th">{{ t('Product') }}</th>
                  <th class="detail-th">{{ t('SKU') }}</th>
                  <th class="detail-th detail-th--num">{{ t('Qty') }}</th>
                  <th class="detail-th">{{ t('Unit') }}</th>
                  <th class="detail-th detail-th--action"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in visibleItems" :key="item.key" class="detail-item-row">
                  <td class="detail-td"><ProductCell :name="item.productName" :desc="item.productDesc" :image="item.image" /></td>
                  <td class="detail-td">{{ item.skuCode }}</td>
                  <td class="detail-td detail-td--num">{{ fmt(item.qty) }}</td>
                  <td class="detail-td">{{ item.unit }}</td>
                  <td class="detail-td detail-td--action">
                    <MpTooltip v-if="isBatchTrackedSku(item.skuCode)" :id="`del-tt-batch-${item.key}`" :label="t('View batch')" placement="top" use-portal>
                      <button class="del-view-btn" type="button" :aria-label="t('View batch')" @click="openViewBatch(item)">
                        <MpIcon name="competencies" size="md" />
                      </button>
                    </MpTooltip>
                    <MpTooltip v-else-if="isSerialTrackedSku(item.skuCode)" :id="`del-tt-serial-${item.key}`" :label="t('View serial number')" placement="top" use-portal>
                      <button class="del-view-btn" type="button" :aria-label="t('View serial number')" @click="openViewSerial(item)">
                        <MpIcon name="competencies" size="md" />
                      </button>
                    </MpTooltip>
                  </td>
                </tr>
              </tbody>
            </table>
            <div ref="itemsSentinelEl" class="detail-items-sentinel" aria-hidden="true" />
            <div v-if="loadingMore" class="detail-loading detail-items-loading"><MpSpinner size="sm" /> {{ t('Loading products…') }}</div>
          </div>
          <div class="detail-items-count"><span>{{ t('Showing') }} {{ visibleItems.length }} {{ t('of') }} {{ filteredItems.length }} {{ t('products') }}</span></div>
        </section>
      </div>

      <!-- Linked transactions -->
      <MpTabs id="del-tabs" :default-value="0" variant-color="green" class="del-tabs">
        <MpTabList>
          <MpTab id="del-tab-so" :value="0">{{ t('Sales order') }} ({{ linkedOrder ? 1 : 0 }})</MpTab>
          <MpTab id="del-tab-pick" :value="1">{{ t('Picking') }} ({{ linkedPickings.length }})</MpTab>
          <MpTab id="del-tab-pack" :value="2">{{ t('Packing') }} ({{ linkedPackings.length }})</MpTab>
        </MpTabList>
        <MpTabPanels>
          <!-- Sales order -->
          <MpTabPanel :value="0">
            <h3 class="linked-section-title">{{ t('Sales order') }}</h3>
            <div class="del-linked-wrap">
              <table class="del-linked">
                <thead><tr>
                  <th class="detail-th">{{ t('Number') }}</th>
                  <th class="detail-th">{{ t('Customer') }}</th>
                  <th class="detail-th">{{ t('Source') }}</th>
                  <th class="detail-th detail-th--num">{{ t('SKU qty') }}</th>
                  <th class="detail-th detail-th--num">{{ t('Order qty') }}</th>
                  <th class="detail-th">{{ t('Status') }}</th>
                  <th class="detail-th">{{ t('Due date') }}</th>
                </tr></thead>
                <tbody>
                  <tr v-if="linkedOrder" class="detail-item-row">
                    <td class="detail-td detail-td--number">
                      <a class="cell-link del-link-num" @click.stop="router.push(`/outbound-delivery/${linkedOrder.id}`)">{{ linkedOrder.salesNo }}</a>
                    </td>
                    <td class="detail-td">{{ linkedOrder.customer ?? '—' }}</td>
                    <td class="detail-td"><SourceLabel :source="linkedOrder.source" /></td>
                    <td class="detail-td detail-td--num">{{ fmt(linkedOrder.skuQty) }}</td>
                    <td class="detail-td detail-td--num">{{ fmt(linkedOrder.orderQty) }}</td>
                    <td class="detail-td"><ErpStatusBadge :status="outgoingStage(linkedOrder)" /></td>
                    <td class="detail-td">
                      <span class="del-due">
                        <span>{{ dueDisplay(linkedOrder) }}</span>
                        <span v-if="expireHours(linkedOrder) !== null" class="del-due-expire">{{ t('Expire in') }} {{ expireHours(linkedOrder) }} {{ t('hours') }}</span>
                      </span>
                    </td>
                  </tr>
                  <tr v-else><td class="detail-td del-empty" colspan="7">—</td></tr>
                </tbody>
              </table>
            </div>
          </MpTabPanel>
          <!-- Picking -->
          <MpTabPanel :value="1">
            <h3 class="linked-section-title">{{ t('Picking') }} {{ linkedPickings.length > 1 ? t('tasks') : t('task') }}</h3>
            <div class="del-linked-wrap">
              <table class="del-linked">
                <thead><tr>
                  <th class="detail-th">{{ t('Number') }}</th>
                  <th class="detail-th">{{ t('Assignee') }}</th>
                  <th class="detail-th detail-th--num">{{ t('SKU qty') }}</th>
                  <th class="detail-th detail-th--num">{{ t('Picked qty') }}</th>
                  <th class="detail-th">{{ t('Status') }}</th>
                  <th class="detail-th">{{ t('Start date') }}</th>
                  <th class="detail-th">{{ t('End date') }}</th>
                </tr></thead>
                <tbody>
                  <tr v-for="lp in linkedPickings" :key="lp.id" class="detail-item-row">
                    <td class="detail-td detail-td--number">
                      <a class="cell-link del-link-num" @click.stop="router.push(`/picking/${lp.id}`)">{{ lp.taskNo }}</a>
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
                        <span v-if="agingDays(lp.startDate, lp.endDate) > 1" class="linked-aging">{{ agingDays(lp.startDate, lp.endDate) }} {{ t('days') }}</span>
                      </span>
                    </td>
                  </tr>
                  <tr v-if="!linkedPickings.length"><td class="detail-td del-empty" colspan="7">—</td></tr>
                </tbody>
              </table>
            </div>
          </MpTabPanel>
          <!-- Packing -->
          <MpTabPanel :value="2">
            <h3 class="linked-section-title">{{ t('Packing') }} {{ linkedPackings.length > 1 ? t('tasks') : t('task') }}</h3>
            <div class="del-linked-wrap">
              <table class="del-linked">
                <thead><tr>
                  <th class="detail-th">{{ t('Number') }}</th>
                  <th class="detail-th">{{ t('Assignee') }}</th>
                  <th class="detail-th detail-th--num">{{ t('SKU qty') }}</th>
                  <th class="detail-th detail-th--num">{{ t('Packed qty') }}</th>
                  <th class="detail-th">{{ t('Status') }}</th>
                  <th class="detail-th">{{ t('Start date') }}</th>
                  <th class="detail-th">{{ t('End date') }}</th>
                </tr></thead>
                <tbody>
                  <tr v-for="lp in linkedPackings" :key="lp.id" class="detail-item-row">
                    <td class="detail-td detail-td--number">
                      <a class="cell-link del-link-num" @click.stop="router.push(`/packing/${lp.id}`)">{{ lp.taskNo }}</a>
                    </td>
                    <td class="detail-td">{{ lp.assignee }}</td>
                    <td class="detail-td detail-td--num">{{ fmt(lp.skuQty) }}</td>
                    <td class="detail-td detail-td--num">{{ fmt(lp.packedQty) }}</td>
                    <td class="detail-td"><ErpStatusBadge :status="lp.status" /></td>
                    <td class="detail-td">{{ lp.startDate ? formatDateTime(lp.startDate) : '—' }}</td>
                    <td class="detail-td">
                      <span class="linked-end">
                        <span v-if="lp.endDate">{{ formatDateTime(lp.endDate) }}</span>
                        <span v-else class="linked-end__muted">—</span>
                        <span v-if="agingDays(lp.startDate, lp.endDate) > 1" class="linked-aging">{{ agingDays(lp.startDate, lp.endDate) }} {{ t('days') }}</span>
                      </span>
                    </td>
                  </tr>
                  <tr v-if="!linkedPackings.length"><td class="detail-td del-empty" colspan="7">—</td></tr>
                </tbody>
              </table>
            </div>
          </MpTabPanel>
        </MpTabPanels>
      </MpTabs>

    </div>

    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <MpPopover id="del-print" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
        <MpPopoverTrigger>
          <button class="detail-btn detail-btn--secondary">
            {{ t('Print') }}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem>{{ t('Print delivery note') }}</MpPopoverListItem>
            <MpPopoverListItem>{{ t('Print shipping label') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
      <button v-if="isPending" class="detail-btn detail-btn--primary" @click="goHandover">
        {{ t('Create shipment') }}
      </button>
    </footer>

  </div>

  <div v-else class="del-not-found">
    <p>{{ t('Delivery not found.') }}</p>
    <button class="detail-breadcrumb" @click="goBack">{{ t('Back to Shipping') }}</button>
  </div>

  <ViewBatchDrawer
    v-if="viewBatchItem"
    :open="true"
    :sku="viewBatchItem.skuCode"
    :warehouse-id="task?.warehouseId ?? ''"
    kind="packing"
    :qty-label="t('Packed qty')"
    :order-qty="viewBatchItem.orderQty"
    :planned-qty-label="t('Picked qty')"
    :qty-to-pick="(viewBatchItem.batchPicks ?? []).reduce((s, b) => s + b.qty, 0)"
    :planned-batches="viewBatchItem.batchPicks ?? []"
    :picked-batches="viewBatchItem.batchPicks ?? []"
    :shipped-qty="viewBatchItem.shippedElsewhere"
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
    :order-qty="viewSerialItem.orderQty"
    :planned-qty-label="t('Picked qty')"
    :qty-to-pick="(viewSerialItem.serialPicks ?? []).length"
    :qty-label="t('Packed qty')"
    :planned-serials="viewSerialItem.serialPicks ?? []"
    :picked-serials="viewSerialItem.serialPicks ?? []"
    :shipped-qty="viewSerialItem.shippedElsewhere"
    :product-name="viewSerialItem.productName"
    :product-img="viewSerialItem.image"
    @update:open="viewSerialItem = null"
  />
</template>

<style scoped>
.detail-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px); }
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.detail-jump-chevron { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px); background: none; border: none; padding: 0; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default, var(--mp-text-secondary)); }
.detail-jump-chevron:hover { background: var(--mp-background-neutral-hovered); }
.detail-jump { display: flex; flex-direction: column; }
.detail-jump-search-wrap { padding: var(--mp-spacing-3); position: relative; }
.detail-jump-search { width: 100%; box-sizing: border-box; padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; padding-right: 34px; }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }
.search-clear-btn--overlay { position: absolute; right: 18px; top: 50%; transform: translateY(-50%); }
.detail-jump-list { display: flex; flex-direction: column; }
.detail-jump-item { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); width: 100%; text-align: left; background: none; border: none; cursor: pointer; padding: var(--mp-spacing-2) var(--mp-spacing-3); border-radius: var(--mp-radii-md); }
.detail-jump-item:hover { background: var(--mp-background-neutral-subtle); }
.detail-jump-item-number { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.detail-jump-item-customer { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-jump-empty { margin: 0; padding: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-6); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); display: flex; flex-direction: column; gap: var(--mp-spacing-8); }
.del-summary { display: grid; grid-template-columns: 244px 244px; column-gap: var(--mp-spacing-6); row-gap: 0; }
.content-list-col { display: flex; flex-direction: column; }
.del-progress { display: flex; align-items: center; gap: var(--mp-spacing-10); align-self: flex-start; }
.del-progress-stat { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: var(--mp-sizes-28, 112px); }
.del-progress-val { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.del-progress-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.del-table-wrap { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.del-filter-bar { display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-3); }
.del-search-wrap { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-1\.5) var(--mp-spacing-3); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full); background: var(--mp-background-neutral); color: var(--mp-text-secondary); min-width: 240px; }
.del-search { flex: 1; border: none; background: transparent; outline: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.del-search::placeholder { color: var(--mp-text-placeholder); }

.detail-items-section { display: flex; flex-direction: column; flex-shrink: 0; }
.detail-items-section--bordered { border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md); overflow: hidden; }
.detail-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: auto; }
.detail-items thead .detail-th { position: sticky; top: 0; z-index: 1; }
.detail-items-sentinel { height: 1px; }
.detail-items-loading { justify-content: center; padding: var(--mp-spacing-3); }
.detail-loading { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); color: var(--mp-text-secondary); }
.detail-items { width: 100%; border-collapse: collapse; table-layout: fixed; }
.detail-th { height: var(--mp-sizes-7, 28px); text-align: left; padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2); background: var(--mp-background-neutral-subtle); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-transform: uppercase; border-bottom: 1px solid var(--mp-border-default); white-space: nowrap; }
.detail-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.detail-td { padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); vertical-align: top; }
.detail-td--num { text-align: right; white-space: nowrap; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }
.detail-td--action { text-align: center; white-space: nowrap; }
/* Sticky action column — stays visible when the table scrolls wider than the stage */
.detail-th--action { position: sticky; right: 0; z-index: 2; }
.detail-td--action { position: sticky; right: 0; z-index: 1; background: var(--mp-background-neutral, #fff); }
.del-view-btn { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); border-radius: var(--mp-radii-md); background: none; border: none; cursor: pointer; color: var(--mp-icon-default); }
.del-view-btn:hover { background: var(--mp-background-neutral-hovered); }
.detail-items-count { display: flex; align-items: center; margin: 0; padding: var(--mp-spacing-3) var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.del-tabs { flex-shrink: 0; }
.del-tabs :deep(.mp-tab--isSelected_true), .del-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.del-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) { background-color: var(--mp-border-selected, #029861) !important; }
.del-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }
.linked-section-title { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.del-due { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.del-due-expire { font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm); color: var(--mp-text-danger, #c0392b); font-weight: var(--mp-font-weights-medium, 500); }
.del-linked-wrap { overflow-x: auto; }
.del-linked { width: 100%; border-collapse: collapse; }
.del-link-num { color: var(--mp-text-link); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.del-empty { color: var(--mp-text-secondary); }
/* Number cell — "View details" chip on row hover (same as index tables) */
.del-linked .detail-td--number { position: relative; }
.wh-link-wrap { position: relative; display: inline-flex; align-items: center; }
.linked-end { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.linked-end__muted { color: var(--mp-text-secondary); }
.linked-aging { display: inline-flex; align-items: center; padding: 0 var(--mp-spacing-1\.5); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral-subtle); color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-lg, 20px); white-space: nowrap; }

.detail-footer { flex-shrink: 0; display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage); border-top: 1px solid transparent; }
.detail-footer--floating { border-top-color: var(--mp-border-default); }
.detail-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer; border: 1px solid transparent; white-space: nowrap; }
.detail-btn--secondary { background: var(--mp-background-neutral); border-color: var(--mp-border-bold); color: var(--mp-text-secondary); }
.detail-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }
.detail-btn--primary { background: var(--mp-background-brand-bold, #029861); border-color: transparent; color: var(--mp-text-on-color, #fff); }
.detail-btn--primary:hover { background: var(--mp-background-brand-bold-hovered, #027a4e); }
.del-shipped-note { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.del-not-found { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-4); flex: 1; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
