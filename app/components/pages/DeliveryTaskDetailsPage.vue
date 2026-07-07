<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpSpinner,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpFormControl, MpFormLabel, MpAutocomplete, MpInput, MpUpload, MpUploadList, css, toast,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import { getDeliveryLineItems, allDeliveryTasksFlat } from '~/data/deliveryTaskDetails'
import { getDeliveryTask, handoverToCourier, marketplaceShipping } from '~/data/deliveryTasks'
import { getPackingTask } from '~/data/packingTasks'
import { getPickingTask } from '~/data/pickingTasks'
import { outgoingOrders, outgoingStage, OUTGOING_TODAY } from '~/data/outgoing'
import { formatDate, formatDateLong, formatDateTime, formatDateTimeLong } from '~/utils/date'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const route = useRoute()

const task = computed(() => getDeliveryTask(props.orderId))
const lineItems = computed(() => task.value ? getDeliveryLineItems(task.value) : [])
const status = computed(() => task.value?.status ?? 'ready to ship')
const isShipped = computed(() => status.value === 'shipped')
const isPending = computed(() => status.value === 'ready to ship')

const shipTotal = computed(() => task.value?.toShipQty ?? 0)

// Linked upstream transactions: sales order → packing → picking.
const linkedOrder = computed(() => outgoingOrders.find(o => o.id === task.value?.salesOrderId))
const linkedPacking = computed(() => task.value ? getPackingTask(task.value.packingTaskId) : undefined)
const linkedPicking = computed(() => linkedPacking.value ? getPickingTask(linkedPacking.value.pickingTaskId) : undefined)

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

// ── Handover-to-courier modal ────────────────────────────────────────────────
const showShip = ref(false)
const courierId = ref('')
const trackingNo = ref('')
const packageScan = ref('')
const packageVerified = ref(false)
const proofFile = ref('')
const shipError = ref(false)
const scanError = ref(false)

// The scanned package / AWB / shipping label must belong to THIS delivery — match it
// against the delivery's own identifiers (Delivery no., AWB/tracking, packing no.).
const expectedScanCodes = computed(() =>
  [task.value?.taskNo, task.value?.trackingNo, task.value?.packingTaskNo]
    .filter(Boolean).map(c => String(c).trim().toLowerCase()),
)

function openShip() {
  courierId.value = task.value?.courier ?? ''
  trackingNo.value = task.value?.trackingNo ?? ''
  packageScan.value = ''
  packageVerified.value = false
  proofFile.value = ''
  shipError.value = false
  scanError.value = false
  showShip.value = true
}
function onScanInput() { if (scanError.value) scanError.value = false }
// Scan the physical package label → must match this delivery before handover.
// (Demo: clicking Scan with an empty field simulates scanning the correct label.)
// For a marketplace order a valid scan also pulls the channel's courier + tracking no.
function verifyPackage() {
  const scanned = packageScan.value.trim()
  // empty → simulate scanning the correct label for this delivery
  if (!scanned) packageScan.value = task.value?.trackingNo || task.value?.taskNo || 'Package'
  const val = packageScan.value.trim().toLowerCase()
  if (expectedScanCodes.value.length && !expectedScanCodes.value.includes(val)) {
    packageVerified.value = false
    scanError.value = true
    return
  }
  scanError.value = false
  const mp = marketplaceShipping(linkedOrder.value)
  if (mp) {
    if (!courierId.value.trim())  courierId.value  = mp.courier
    if (!trackingNo.value.trim()) trackingNo.value = mp.trackingNo
  }
  packageVerified.value = true
}
const evidenceFiles = ref<FileList | null>(null)
function onProofUpload(e: Event) {
  const fl = (e.target as HTMLInputElement).files
  evidenceFiles.value = fl
  proofFile.value = fl?.[0]?.name ?? ''
}
function clearProof() { evidenceFiles.value = null; proofFile.value = '' }
function printDeliveryNote() {
  toast.notify({ variant: 'success', title: 'Delivery note sent to printer' , maxWidth: 'max-content'})
}
function confirmShip() {
  if (!packageVerified.value) { scanError.value = true; return } // must scan a matching label first
  if (!courierId.value.trim() || !trackingNo.value.trim()) { shipError.value = true; return }
  handoverToCourier(props.orderId, {
    courier: courierId.value.trim(),
    trackingNo: trackingNo.value.trim(),
    proofFile: proofFile.value || undefined,
  })
  showShip.value = false
  toast.notify({ variant: 'success', title: 'Handed over to courier' , maxWidth: 'max-content'})
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
  // Opened via the index "Handover" action → pop the handover modal straight away.
  if (route.query.handover === '1' && isPending.value) openShip()
  nextTick(() => {
    setupItemsObserver(); checkStageOverflow()
    stageObserver = new ResizeObserver(checkStageOverflow)
    if (stageEl.value) { stageObserver.observe(stageEl.value); stageEl.value.addEventListener('scroll', checkStageOverflow, { passive: true }) }
  })
})
onUnmounted(() => { itemsObserver?.disconnect(); stageObserver?.disconnect(); stageEl.value?.removeEventListener('scroll', checkStageOverflow) })
watch([() => props.orderId, shownCount], () => nextTick(checkStageOverflow))

function goBack() { router.push('/outbound-delivery?tab=Delivery') }
</script>

<template>
  <div v-if="task" class="detail-page">

    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goBack">Delivery</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ task.taskNo }}</h1>
          <ErpStatusBadge :status="status" badge-for="additionalInformation" size="md" />
          <MpPopover id="del-jump" use-portal :is-keep-alive="false" placement="bottom-start">
            <MpPopoverTrigger>
              <button class="detail-jump-chevron" aria-label="Switch delivery">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ width: '304px' })">
              <div class="detail-jump">
                <div class="detail-jump-search-wrap">
                  <input v-model="jumpSearch" class="detail-jump-search" type="text" placeholder="Search delivery or sales order…" />
                </div>
                <div class="detail-jump-list">
                  <button v-for="t in jumpResults" :key="t.id" class="detail-jump-item" @click="jumpTo(t.id)">
                    <span class="detail-jump-item-number">{{ t.taskNo }}</span>
                    <span class="detail-jump-item-customer">{{ t.salesNo }}</span>
                  </button>
                  <p v-if="!jumpResults.length" class="detail-jump-empty">No deliveries found.</p>
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
          <ContentList label="Sales order" :value="task.salesNo" />
          <ContentList label="Warehouse" :value="task.warehouseName" />
          <ContentList label="Assignee" :value="task.assignee" />
        </div>
        <div class="content-list-col">
          <ContentList label="Courier" :value="task.courier ?? '—'" />
          <ContentList label="Tracking no." :value="task.trackingNo ?? '—'" />
          <ContentList label="Ship date" :value="task.shippedDate ? formatDateTimeLong(task.shippedDate) : '—'" />
        </div>
      </section>

      <section class="del-progress">
        <div class="del-progress-stat"><span class="del-progress-label">SKUs</span><span class="del-progress-val">{{ task.skuQty }}</span></div>
        <div class="del-progress-stat"><span class="del-progress-label">To ship</span><span class="del-progress-val">{{ fmt(shipTotal) }}</span></div>
        <div class="del-progress-stat"><span class="del-progress-label">Shipped</span><span class="del-progress-val">{{ fmt(task.shippedQty) }}</span></div>
      </section>

      <div class="del-table-wrap">
        <div class="del-filter-bar">
          <div class="del-search-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input v-model="itemSearch" class="del-search" type="text" placeholder="Search product or SKU…" />
          </div>
        </div>
        <section class="detail-items-section" :class="{ 'detail-items-section--bordered': isProgressive }">
          <div ref="itemsScrollEl" class="detail-items-scroll">
            <table class="detail-items">
              <colgroup>
                <col style="width: 50%" />
                <col style="width: 24%" />
                <col style="width: 13%" />
                <col style="width: 13%" />
              </colgroup>
              <thead>
                <tr>
                  <th class="detail-th">Product</th>
                  <th class="detail-th">SKU</th>
                  <th class="detail-th detail-th--num">Qty</th>
                  <th class="detail-th">Unit</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in visibleItems" :key="item.key" class="detail-item-row">
                  <td class="detail-td"><ProductCell :name="item.productName" :desc="item.productDesc" :image="item.image" /></td>
                  <td class="detail-td">{{ item.skuCode }}</td>
                  <td class="detail-td detail-td--num">{{ fmt(item.qty) }}</td>
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

      <!-- Linked transactions -->
      <MpTabs id="del-tabs" :default-value="0" variant-color="green" class="del-tabs">
        <MpTabList>
          <MpTab id="del-tab-so" :value="0">Sales order ({{ linkedOrder ? 1 : 0 }})</MpTab>
          <MpTab id="del-tab-pick" :value="1">Picking ({{ linkedPicking ? 1 : 0 }})</MpTab>
          <MpTab id="del-tab-pack" :value="2">Packing ({{ linkedPacking ? 1 : 0 }})</MpTab>
        </MpTabList>
        <MpTabPanels>
          <!-- Sales order -->
          <MpTabPanel :value="0">
            <h3 class="linked-section-title">Sales order</h3>
            <div class="del-linked-wrap">
              <table class="del-linked">
                <thead><tr>
                  <th class="detail-th">Number</th>
                  <th class="detail-th">Customer</th>
                  <th class="detail-th">Source</th>
                  <th class="detail-th detail-th--num">SKU qty</th>
                  <th class="detail-th detail-th--num">Order qty</th>
                  <th class="detail-th">Status</th>
                  <th class="detail-th">Due date</th>
                </tr></thead>
                <tbody>
                  <tr v-if="linkedOrder" class="detail-item-row">
                    <td class="detail-td detail-td--number">
                      <div class="cell-with-action">
                        <span class="del-link-num">{{ linkedOrder.salesNo }}</span>
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
                    <td class="detail-td">{{ linkedOrder.source }}</td>
                    <td class="detail-td detail-td--num">{{ fmt(linkedOrder.skuQty) }}</td>
                    <td class="detail-td detail-td--num">{{ fmt(linkedOrder.orderQty) }}</td>
                    <td class="detail-td"><ErpStatusBadge :status="outgoingStage(linkedOrder)" /></td>
                    <td class="detail-td">
                      <span class="del-due">
                        <span>{{ dueDisplay(linkedOrder) }}</span>
                        <span v-if="expireHours(linkedOrder) !== null" class="del-due-expire">Expire in {{ expireHours(linkedOrder) }} hours</span>
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
            <h3 class="linked-section-title">Picking task</h3>
            <div class="del-linked-wrap">
              <table class="del-linked">
                <thead><tr>
                  <th class="detail-th">Number</th>
                  <th class="detail-th">Assignee</th>
                  <th class="detail-th detail-th--num">SKU qty</th>
                  <th class="detail-th detail-th--num">Picked qty</th>
                  <th class="detail-th">Status</th>
                  <th class="detail-th">Start date</th>
                  <th class="detail-th">End date</th>
                </tr></thead>
                <tbody>
                  <tr v-if="linkedPicking" class="detail-item-row">
                    <td class="detail-td detail-td--number">
                      <div class="cell-with-action">
                        <span class="del-link-num">{{ linkedPicking.taskNo }}</span>
                        <button class="row-hover-btn" @click.stop="router.push(`/picking/${linkedPicking.id}`)">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                          <span class="row-hover-btn__label">VIEW DETAILS</span>
                        </button>
                      </div>
                    </td>
                    <td class="detail-td">{{ linkedPicking.assignee }}</td>
                    <td class="detail-td detail-td--num">{{ fmt(linkedPicking.skuQty) }}</td>
                    <td class="detail-td detail-td--num">{{ fmt(linkedPicking.pickedQty) }}</td>
                    <td class="detail-td"><ErpStatusBadge :status="linkedPicking.status" /></td>
                    <td class="detail-td">{{ linkedPicking.startDate ? formatDateTime(linkedPicking.startDate) : '—' }}</td>
                    <td class="detail-td">
                      <span class="linked-end">
                        <span v-if="linkedPicking.endDate">{{ formatDateTime(linkedPicking.endDate) }}</span>
                        <span v-else class="linked-end__muted">—</span>
                        <span v-if="agingDays(linkedPicking.startDate, linkedPicking.endDate) > 1" class="linked-aging">{{ agingDays(linkedPicking.startDate, linkedPicking.endDate) }} days</span>
                      </span>
                    </td>
                  </tr>
                  <tr v-else><td class="detail-td del-empty" colspan="7">—</td></tr>
                </tbody>
              </table>
            </div>
          </MpTabPanel>
          <!-- Packing -->
          <MpTabPanel :value="2">
            <h3 class="linked-section-title">Packing task</h3>
            <div class="del-linked-wrap">
              <table class="del-linked">
                <thead><tr>
                  <th class="detail-th">Number</th>
                  <th class="detail-th">Assignee</th>
                  <th class="detail-th detail-th--num">SKU qty</th>
                  <th class="detail-th detail-th--num">Packed qty</th>
                  <th class="detail-th">Status</th>
                  <th class="detail-th">Start date</th>
                  <th class="detail-th">End date</th>
                </tr></thead>
                <tbody>
                  <tr v-if="linkedPacking" class="detail-item-row">
                    <td class="detail-td detail-td--number">
                      <div class="cell-with-action">
                        <span class="del-link-num">{{ linkedPacking.taskNo }}</span>
                        <button class="row-hover-btn" @click.stop="router.push(`/packing/${linkedPacking.id}`)">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                          <span class="row-hover-btn__label">VIEW DETAILS</span>
                        </button>
                      </div>
                    </td>
                    <td class="detail-td">{{ linkedPacking.assignee }}</td>
                    <td class="detail-td detail-td--num">{{ fmt(linkedPacking.skuQty) }}</td>
                    <td class="detail-td detail-td--num">{{ fmt(linkedPacking.packedQty) }}</td>
                    <td class="detail-td"><ErpStatusBadge :status="linkedPacking.status" /></td>
                    <td class="detail-td">{{ linkedPacking.startDate ? formatDateTime(linkedPacking.startDate) : '—' }}</td>
                    <td class="detail-td">
                      <span class="linked-end">
                        <span v-if="linkedPacking.endDate">{{ formatDateTime(linkedPacking.endDate) }}</span>
                        <span v-else class="linked-end__muted">—</span>
                        <span v-if="agingDays(linkedPacking.startDate, linkedPacking.endDate) > 1" class="linked-aging">{{ agingDays(linkedPacking.startDate, linkedPacking.endDate) }} days</span>
                      </span>
                    </td>
                  </tr>
                  <tr v-else><td class="detail-td del-empty" colspan="7">—</td></tr>
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
            Print
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem>Print delivery note</MpPopoverListItem>
            <MpPopoverListItem>Print shipping label</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
      <button v-if="isPending" class="detail-btn detail-btn--primary" @click="openShip">
        Handover to courier
      </button>
    </footer>

  </div>

  <div v-else class="del-not-found">
    <p>Delivery not found.</p>
    <button class="detail-breadcrumb" @click="goBack">Back to Delivery</button>
  </div>

  <!-- ── Handover-to-courier modal ── -->
  <MpModal id="del-ship" :is-open="showShip" size="lg" is-close-on-esc :is-keep-alive="false" @close="showShip = false">
    <MpModalContent>
      <MpModalHeader>Handover to courier<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <dl v-if="task" class="del-ship-context">
          <div><dt>Sales order</dt><dd>{{ task.salesNo }}<span v-if="linkedOrder?.source && linkedOrder.source !== 'Sales Order'" class="del-ship-src">{{ linkedOrder.source }}</span></dd></div>
          <div><dt>Delivery</dt><dd>{{ task.taskNo }}</dd></div>
          <div><dt>Warehouse</dt><dd>{{ task.warehouseName }}</dd></div>
        </dl>

        <div class="del-ship-grid">
          <MpFormControl id="del-courier" is-required :is-invalid="shipError && !courierId.trim()">
            <MpFormLabel>Courier</MpFormLabel>
            <MpInput id="del-courier-input" v-model="courierId" placeholder="e.g. JNE, SiCepat, internal fleet" is-full-width :is-disabled="!!task?.courier" />
          </MpFormControl>
          <MpFormControl id="del-tracking" is-required :is-invalid="shipError && !trackingNo.trim()">
            <MpFormLabel>Tracking no.</MpFormLabel>
            <MpInput id="del-tracking-input" v-model="trackingNo" placeholder="e.g. SD0009583" is-full-width :is-disabled="!!task?.trackingNo" />
          </MpFormControl>
        </div>
        <p v-if="shipError" class="del-ship-error">Courier and tracking no. are required.</p>

        <MpFormControl id="del-pkg-scan" :class="css({ marginTop: '16px' })">
          <MpFormLabel>Scan package / AWB / shipping label</MpFormLabel>
          <div class="del-scan-field">
            <MpInput id="del-pkg-scan-input" v-model="packageScan" placeholder="Scan the package/shipping label…" is-full-width @input="onScanInput" @keyup.enter="verifyPackage" />
            <button class="detail-btn detail-btn--secondary" @click="verifyPackage">Scan</button>
          </div>
          <span v-if="packageVerified" class="del-verified">✓ Matches {{ task?.taskNo }}</span>
          <span v-else-if="scanError" class="del-ship-error">This label doesn't match delivery {{ task?.taskNo }}. Scan the package for this delivery.</span>
        </MpFormControl>

        <MpFormControl id="del-evidence" :class="css({ marginTop: '16px' })">
          <MpFormLabel>Upload evidence</MpFormLabel>
          <MpUpload
            id="del-evidence-upload"
            accept=".jpg, .jpeg, .png, .pdf"
            :file-list="evidenceFiles"
            :is-reset-on-change="false"
            @change="onProofUpload"
            @clear="clearProof"
          />
          <MpUploadList
            v-if="proofFile"
            id="del-evidence-file"
            :title="proofFile"
            status="success"
            subtitle="Uploaded"
            is-show-remove-button
            :class="css({ marginTop: '8px' })"
            @remove="clearProof"
          />
        </MpFormControl>
      </MpModalBody>
      <MpModalFooter>
        <div class="del-handover-footer">
          <button class="detail-btn detail-btn--secondary" @click="printDeliveryNote">Print delivery note</button>
          <div class="del-footer-right">
            <button class="detail-btn detail-btn--ghost" @click="showShip = false">Cancel</button>
            <button class="detail-btn detail-btn--primary" @click="confirmShip">Handover to courier</button>
          </div>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.detail-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px); }
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.detail-jump-chevron { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px); background: none; border: none; padding: 0; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.detail-jump-chevron:hover { background: var(--mp-background-neutral-hovered); }
.detail-jump { display: flex; flex-direction: column; }
.detail-jump-search-wrap { padding: var(--mp-spacing-3); }
.detail-jump-search { width: 100%; box-sizing: border-box; padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; }
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
.detail-items-count { display: flex; align-items: center; margin: 0; padding: var(--mp-spacing-3) var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.del-tabs { flex-shrink: 0; }
.del-tabs :deep(.mp-tab--isSelected_true), .del-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.del-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) { background-color: var(--mp-border-selected, #029861) !important; }
.del-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }
.linked-section-title { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.del-due { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.del-due-expire { font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm); color: var(--mp-text-danger, #c0392b); font-weight: var(--mp-font-weights-medium); }
.del-linked-wrap { overflow-x: auto; }
.del-linked { width: 100%; border-collapse: collapse; }
.del-link-num { color: var(--mp-text-link); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.del-empty { color: var(--mp-text-secondary); }
/* Number cell — "View details" chip on row hover (same as index tables) */
.del-linked .detail-td--number { position: relative; }
.cell-with-action { display: flex; align-items: center; width: 100%; min-width: 0; }
.row-hover-btn {
  position: absolute; right: var(--mp-spacing-2); top: 50%; transform: translateY(-50%); display: none;
  align-items: center; gap: var(--mp-spacing-1\.5); padding: var(--mp-spacing-1) var(--mp-spacing-1\.5);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-sm); cursor: pointer; white-space: nowrap; line-height: 1; color: var(--mp-text-secondary);
}
.row-hover-btn__label { font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xs, 12px); color: var(--mp-text-secondary); text-transform: uppercase; }
.del-linked .detail-item-row:hover .row-hover-btn { display: flex; }
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

.del-ship-hint { margin: 0 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.del-ship-context { margin: 0 0 var(--mp-spacing-5); display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--mp-spacing-4); padding: var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtlest, #f5f6f7); border-radius: var(--mp-radii-md); }
.del-ship-context dt { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.del-ship-context dd { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.del-ship-src { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.del-scan-field { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.del-scan-field > :first-child { flex: 1; min-width: 0; }
.del-ship-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-4); }
.del-ship-error { margin: var(--mp-spacing-3) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #c0392b); }
.del-verified { display: inline-block; margin-top: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-success-default, #15803d); font-weight: var(--mp-font-weights-medium); }
.del-upload-field {
  position: relative; display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3); cursor: pointer;
  border: 1px dashed var(--mp-border-bold); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral-subtle); color: var(--mp-text-secondary);
}
.del-upload-field:hover { background: var(--mp-background-neutral-hovered); }
.del-upload-icon { display: inline-flex; color: var(--mp-text-secondary); flex-shrink: 0; }
.del-upload-text { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.del-file-input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.del-handover-footer { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); width: 100%; }
.del-footer-right { display: flex; gap: var(--mp-spacing-2); }
.detail-btn--ghost { background: transparent; border-color: transparent; color: var(--mp-text-secondary); }
.detail-btn--ghost:hover { background: var(--mp-background-neutral-hovered); }

.del-not-found { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-4); flex: 1; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
