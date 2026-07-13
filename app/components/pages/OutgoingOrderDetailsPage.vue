<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, MpIcon, MpSpinner, css,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpAutocomplete, MpFormControl, MpFormLabel, MpFormErrorMessage, toast,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import SourceLabel from '~/components/patterns/SourceLabel.vue'
import ActivityLogModal from '~/components/patterns/ActivityLogModal.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import { outgoingOrders, outgoingStage, isMarketplaceOrder } from '~/data/outgoing'
import { syncOutboundOrderStatuses } from '~/data/outboundSync'
import { buildPickingLines, getPickingForOrder, canPickOrder } from '~/data/pickingTasks'
import { getPackingForOrder, addPackingTaskFromOrder, canCreatePackingDirectlyForOrder } from '~/data/packingTasks'
import { deliveryTasks, marketplaceShipping, getShipment, type ShipmentSummary } from '~/data/deliveryTasks'
import { getWarehouseConfig } from '~/data/warehouseConfig'
import { getWarehouseOperators } from '~/data/warehouseTeam'
import { formatDate, formatDateLong, formatDateTime, formatDateTimeLong } from '~/utils/date'

const props = defineProps<{ orderId: string }>()
const router = useRouter()

syncOutboundOrderStatuses()

const order = computed(() => outgoingOrders.find(o => o.id === props.orderId))
const lineItems = computed(() => order.value ? buildPickingLines([order.value.id], [order.value.salesNo]) : [])
// Picking disabled for this order's warehouse — "Picked qty" is never meaningful.
const skippedPicking = computed(() => !order.value || !getWarehouseConfig(order.value.warehouseId).pickingEnabled)

const linkedPicking = computed(() => getPickingForOrder(props.orderId))
const linkedPacking = computed(() => getPackingForOrder(props.orderId))
const linkedDelivery = computed(() => deliveryTasks.filter(d => d.salesOrderId === props.orderId))
// Delivery is just an in-between state (packed, waiting to leave) — not a document
// worth linking to on its own. Once shipped, the shipment batch is what matters.
const linkedShipments = computed<ShipmentSummary[]>(() => {
  const seqs = new Set(
    linkedDelivery.value.filter(d => d.shipmentNo).map(d => d.shipmentNo!.replace(/\D/g, '')),
  )
  return [...seqs].map(seq => getShipment(seq)).filter((h): h is ShipmentSummary => !!h)
})
const hasLinked = computed(() => linkedPicking.value.length > 0 || linkedPacking.value.length > 0 || linkedShipments.value.length > 0)

// Per-SKU progress across this order's tasks (picked → packed → shipped).
const shippedPackingIds = computed(() => new Set(linkedDelivery.value.filter(d => d.status === 'shipped').map(d => d.packingTaskId)))
const progressByKey = computed<Record<string, { picked: number; packed: number; shipped: number }>>(() => {
  const map: Record<string, { picked: number; packed: number; shipped: number }> = {}
  for (const l of lineItems.value) map[l.key] = { picked: 0, packed: 0, shipped: 0 }
  for (const t of linkedPicking.value)
    for (const [k, q] of Object.entries(t.pickedByKey ?? {})) if (map[k]) map[k].picked += q
  for (const t of linkedPacking.value) {
    const shipped = shippedPackingIds.value.has(t.id)
    for (const [k, q] of Object.entries(t.packedByKey ?? {})) if (map[k]) { map[k].packed += q; if (shipped) map[k].shipped += q }
  }
  return map
})
function prog(key: string) { return progressByKey.value[key] ?? { picked: 0, packed: 0, shipped: 0 } }

// ── Line items — auto lazy-load, internal scroll & border past 10 rows ─────────
const PAGE_SIZE = 10
const shownCount = ref(PAGE_SIZE)
const loadingMore = ref(false)
const visibleItems = computed(() => lineItems.value.slice(0, shownCount.value))
const hasMoreItems = computed(() => shownCount.value < lineItems.value.length)
const itemsProgressive = computed(() => lineItems.value.length > PAGE_SIZE)

function loadMoreItems() {
  if (loadingMore.value || !hasMoreItems.value) return
  loadingMore.value = true
  setTimeout(() => {
    shownCount.value = Math.min(shownCount.value + PAGE_SIZE, lineItems.value.length)
    loadingMore.value = false
  }, 500)
}

const itemsScrollEl = ref<HTMLElement | null>(null)
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
  })
})

// Transaction date: use stored value for user-created orders; derive for seed orders.
const transactionDate = computed(() => {
  if (!order.value) return ''
  if (order.value.transactionDate) return order.value.transactionDate
  const d = new Date(order.value.dueDate)
  d.setDate(d.getDate() - (3 + (seedNum(order.value.id) % 5)))
  return d.toISOString()
})
// Marketplace = Desty channel orders (source contains ":"  e.g. "Shopee: Central Perk").
// Sales Order and manual Outbound delivery orders are NOT marketplace.
const isMarketplace = computed(() => !!order.value && order.value.source.includes(':'))
const dueDateDisplay = computed(() =>
  order.value ? (isMarketplace.value ? formatDateTimeLong(order.value.dueDate) : formatDateLong(order.value.dueDate)) : '—',
)
const isManual = computed(() => order.value?.source === 'Outbound delivery')
// Courier / tracking no. surface from the linked delivery task; for marketplace orders
// they're pre-assigned by the channel even before shipping is processed (same source of
// truth the shipping handover auto-fills from).
const courier = computed(() => {
  const fromTask = linkedDelivery.value.find(d => d.courier)?.courier
  if (fromTask) return fromTask
  return marketplaceShipping(order.value)?.courier ?? '—'
})
const trackingNo = computed(() => {
  const fromTask = linkedDelivery.value.find(d => d.trackingNo)?.trackingNo
  if (fromTask) return fromTask
  return marketplaceShipping(order.value)?.trackingNo ?? '—'
})

// ── Notes / attachment / audit (mirrors Sales order & Receipt detail) ─────────────
function seedNum(id: string): number { return Number(id.replace(/\D/g, '')) || 0 }
const NOTE_UPDATERS = ['Rizal Candra', 'Dewi Rahayu', 'Agus Firmansyah', 'Sari Indah']
const NOTE_ATTACH = ['packing-instruction.pdf', 'customer-note.jpg', 'shipping-label.pdf']
const attachments = computed(() => {
  if (!order.value) return [] as { name: string; sizeKB: number }[]
  const s = seedNum(order.value.id)
  const n = (s % 3) + 1 // always 1–3 files
  return Array.from({ length: n }, (_, i) => ({ name: NOTE_ATTACH[i % NOTE_ATTACH.length]!, sizeKB: 40 + ((s + i * 37) % 220) }))
})
const lastUpdatedBy = computed(() => {
  if (!order.value) return ''
  return order.value.source === 'Outbound delivery' ? 'Rizal Candra' : NOTE_UPDATERS[seedNum(order.value.id) % NOTE_UPDATERS.length]!
})
const lastUpdatedAt = computed(() => {
  if (!order.value) return new Date().toISOString()
  if (order.value.source === 'Outbound delivery') return order.value.createdAt ?? order.value.transactionDate ?? order.value.dueDate
  return order.value.shippedDate ?? order.value.dueDate ?? new Date().toISOString()
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
  const o = order.value
  if (!o) return []
  return [{
    date: lastUpdatedAt.value,
    user: lastUpdatedBy.value,
    activity: 'Created',
    details: [
      { label: 'Transaction no.', value: o.salesNo },
      { label: 'Transaction date', value: formatDateLong(transactionDate.value) },
      { label: 'Customer', value: o.customer ?? '—' },
      { label: 'Warehouse', value: o.warehouseName },
    ],
  }]
})
function fmt(n: number) { return n.toLocaleString('id-ID') }
function agingDays(startDate?: string, endDate?: string): number {
  if (!startDate) return 0
  const REF = new Date().toISOString()
  const start = new Date(startDate).getTime()
  const end = new Date(endDate ?? REF).getTime()
  return Math.max(0, Math.round((end - start) / 86_400_000)) + 1
}

// ── Jump-to-transaction switcher (title-bar chevron) ───────────────────────────
const jumpSearch = ref('')
const jumpResults = computed(() => {
  const q = jumpSearch.value.trim().toLowerCase()
  const matched = q
    ? outgoingOrders.filter(o => o.salesNo.toLowerCase().includes(q) || o.number.toLowerCase().includes(q))
    : outgoingOrders
  return matched.slice(0, 6)
})
function jumpTo(id: string) { jumpSearch.value = ''; router.push(`/outbound-delivery/${id}`) }

function goBack() { router.push('/outbound-delivery?tab=Requests') }
function createPicking() {
  if (!order.value) return
  router.push({ path: '/outbound-delivery/picking/create', query: { warehouseId: order.value.warehouseId, orderIds: order.value.id, from: `order:${order.value.id}` } })
}

// ─── Direct-to-packing (Picking disabled for the order's warehouse) ─────────────
// Marketplace orders are all-or-nothing (nothing to review) → quick assignee-only
// modal, straight to creation. Non-marketplace orders can be packed partially, so
// they go through the full "New packing" page instead.
const ASSIGNEES = computed(() => getWarehouseOperators(order.value?.warehouseId ?? ''))
const directPackModalOpen = ref(false)
const directPackAssigneeId = ref('')
const directPackAssigneeError = ref(false)
watch(directPackAssigneeId, (v) => { if (v) directPackAssigneeError.value = false })

function openDirectPacking() {
  if (!order.value) return
  if (!isMarketplaceOrder(order.value)) {
    router.push({ path: '/outbound-delivery/packing/create', query: { orderId: order.value.id } })
    return
  }
  directPackAssigneeId.value = ''
  directPackAssigneeError.value = false
  directPackModalOpen.value = true
}
function closeDirectPacking() {
  directPackModalOpen.value = false
}
function confirmDirectPacking() {
  if (!directPackAssigneeId.value) { directPackAssigneeError.value = true; return }
  if (!order.value) return
  const assignee = ASSIGNEES.value.find(a => a.id === directPackAssigneeId.value)?.name ?? ''
  const task = addPackingTaskFromOrder({
    salesOrderId: order.value.id,
    salesNo: order.value.salesNo,
    warehouseId: order.value.warehouseId,
    warehouseName: order.value.warehouseName,
    assignee,
  })
  closeDirectPacking()
  toast.notify({ variant: 'success', title: 'Packing task created', maxWidth: 'max-content' })
  router.push(`/packing/${task.id}`)
}

// footer divider
const stageEl = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)
function checkOverflow() { const el = stageEl.value; if (el) stageOverflowing.value = el.scrollHeight > el.clientHeight + 1 }
let ro: ResizeObserver | null = null
onMounted(() => nextTick(() => {
  checkOverflow()
  ro = new ResizeObserver(checkOverflow)
  if (stageEl.value) { ro.observe(stageEl.value); stageEl.value.addEventListener('scroll', checkOverflow, { passive: true }) }
}))
onUnmounted(() => { ro?.disconnect(); stageEl.value?.removeEventListener('scroll', checkOverflow) })
</script>

<template>
  <div v-if="order" class="detail-page">

    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goBack">Outbound delivery</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ order.salesNo }}</h1>
          <ErpStatusBadge :status="outgoingStage(order)" badge-for="additionalInformation" size="md" />
          <MpPopover id="ood-jump" use-portal :is-keep-alive="false" placement="bottom-start">
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
                  <button v-for="o in jumpResults" :key="o.id" class="detail-jump-item" @click="jumpTo(o.id)">
                    <span class="detail-jump-item-number">{{ o.salesNo }}</span>
                    <span class="detail-jump-item-customer">{{ o.customer ?? o.source }}</span>
                  </button>
                  <p v-if="!jumpResults.length" class="detail-jump-empty">No transactions found.</p>
                </div>
              </div>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>
    </header>

    <div ref="stageEl" class="detail-stage">

      <section class="ood-summary">
        <div class="content-list-col">
          <ContentList label="Transaction date" :value="formatDateLong(transactionDate)" />
          <ContentList label="Transaction no." :value="order.salesNo" />
          <ContentList label="Customer" :value="order.customer ?? '—'" />
          <ContentList label="Source"><SourceLabel :source="order.source" /></ContentList>
        </div>
        <div class="content-list-col">
          <ContentList label="Due date" :value="dueDateDisplay" />
          <ContentList label="Courier" :value="courier" />
          <ContentList label="Tracking no." :value="trackingNo" />
          <ContentList label="Warehouse" :value="order.warehouseName" />
        </div>
      </section>

      <!-- Line items -->
      <div class="ood-table-wrap">
        <section class="detail-items-section" :class="{ 'detail-items-section--bordered': itemsProgressive }">
          <div ref="itemsScrollEl" class="detail-items-scroll">
            <table class="detail-items">
              <thead>
                <tr>
                  <th class="detail-th">Product</th>
                  <th class="detail-th">SKU</th>
                  <th class="detail-th detail-th--num">Order qty</th>
                  <th v-if="!skippedPicking" class="detail-th detail-th--num">Picked qty</th>
                  <th class="detail-th detail-th--num">Packed qty</th>
                  <th class="detail-th detail-th--num">Shipped qty</th>
                  <th class="detail-th">Unit</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in visibleItems" :key="item.key" class="detail-item-row">
                  <td class="detail-td"><ProductCell :name="item.product" :desc="item.desc" :image="item.img" /></td>
                  <td class="detail-td">{{ item.sku }}</td>
                  <td class="detail-td detail-td--num">{{ fmt(item.qty) }}</td>
                  <td v-if="!skippedPicking" class="detail-td detail-td--num">{{ fmt(prog(item.key).picked) }}</td>
                  <td class="detail-td detail-td--num">{{ fmt(prog(item.key).packed) }}</td>
                  <td class="detail-td detail-td--num">{{ fmt(prog(item.key).shipped) }}</td>
                  <td class="detail-td">{{ item.unit }}</td>
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
      </div>

      <!-- Message / memo / attachment + audit -->
      <section class="detail-notes-left">
        <ContentList v-if="!isManual" label="Message">
          <p class="detail-note-text">—</p>
        </ContentList>
        <ContentList label="Memo">
          <p class="detail-note-text">{{ order.memo || '—' }}</p>
        </ContentList>
        <ContentList v-if="!isManual" :label="`Attachment (${attachments.length})`">
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
      <a class="detail-updated" @click.prevent="activityOpen = true">Last updated by {{ lastUpdatedBy }} on {{ formatUpdatedAt(lastUpdatedAt) }}</a>

      <!-- Linked outbound tasks (only once at least one exists) -->
      <MpTabs v-if="hasLinked" id="ood-tabs" :default-value="0" variant-color="green" class="ood-tabs">
        <MpTabList>
          <MpTab v-if="linkedPicking.length" id="ood-tab-pick" :value="0">Picking ({{ linkedPicking.length }})</MpTab>
          <MpTab v-if="linkedPacking.length" id="ood-tab-pack" :value="1">Packing ({{ linkedPacking.length }})</MpTab>
          <MpTab v-if="linkedShipments.length" id="ood-tab-ship" :value="2">Shipment ({{ linkedShipments.length }})</MpTab>
        </MpTabList>
        <MpTabPanels>
          <MpTabPanel v-if="linkedPicking.length" :value="0">
            <h3 class="linked-section-title">Picking list tasks</h3>
            <div class="ood-linked-wrap">
              <table class="ood-linked">
                <thead><tr><th class="detail-th">Number</th><th class="detail-th">Assignee</th><th class="detail-th detail-th--num">SKU qty</th><th class="detail-th detail-th--num">Picked qty</th><th class="detail-th">Status</th><th class="detail-th">Start date</th><th class="detail-th">End date</th></tr></thead>
                <tbody>
                  <tr v-for="t in linkedPicking" :key="t.id" class="detail-item-row">
                    <td class="detail-td detail-td--number">
                      <div class="cell-with-action">
                        <span class="ood-link-num">{{ t.taskNo }}</span>
                        <button class="row-hover-btn" @click.stop="router.push(`/picking/${t.id}`)">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                          <span class="row-hover-btn__label">VIEW DETAILS</span>
                        </button>
                      </div>
                    </td>
                    <td class="detail-td">{{ t.assignee }}</td>
                    <td class="detail-td detail-td--num">{{ fmt(t.skuQty) }}</td>
                    <td class="detail-td detail-td--num">{{ fmt(t.pickedQty) }}</td>
                    <td class="detail-td"><ErpStatusBadge :status="t.status" /></td>
                    <td class="detail-td">{{ t.startDate ? formatDateTime(t.startDate) : '—' }}</td>
                    <td class="detail-td">
                      <span class="linked-end">
                        <span v-if="t.endDate">{{ formatDateTime(t.endDate) }}</span>
                        <span v-else class="linked-end__muted">—</span>
                        <span v-if="agingDays(t.startDate, t.endDate) > 1" class="linked-aging">{{ agingDays(t.startDate, t.endDate) }} days</span>
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </MpTabPanel>
          <MpTabPanel v-if="linkedPacking.length" :value="1">
            <h3 class="linked-section-title">Packing tasks</h3>
            <div class="ood-linked-wrap">
              <table class="ood-linked">
                <thead><tr><th class="detail-th">Number</th><th class="detail-th">Assignee</th><th class="detail-th detail-th--num">SKU qty</th><th class="detail-th detail-th--num">Packed qty</th><th class="detail-th">Status</th><th class="detail-th">Start date</th><th class="detail-th">End date</th></tr></thead>
                <tbody>
                  <tr v-for="t in linkedPacking" :key="t.id" class="detail-item-row">
                    <td class="detail-td detail-td--number">
                      <div class="cell-with-action">
                        <span class="ood-link-num">{{ t.taskNo }}</span>
                        <button class="row-hover-btn" @click.stop="router.push(`/packing/${t.id}`)">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                          <span class="row-hover-btn__label">VIEW DETAILS</span>
                        </button>
                      </div>
                    </td>
                    <td class="detail-td">{{ t.assignee }}</td>
                    <td class="detail-td detail-td--num">{{ fmt(t.skuQty) }}</td>
                    <td class="detail-td detail-td--num">{{ fmt(t.packedQty) }}</td>
                    <td class="detail-td"><ErpStatusBadge :status="t.status" /></td>
                    <td class="detail-td">{{ t.startDate ? formatDateTime(t.startDate) : '—' }}</td>
                    <td class="detail-td">
                      <span class="linked-end">
                        <span v-if="t.endDate">{{ formatDateTime(t.endDate) }}</span>
                        <span v-else class="linked-end__muted">—</span>
                        <span v-if="agingDays(t.startDate, t.endDate) > 1" class="linked-aging">{{ agingDays(t.startDate, t.endDate) }} days</span>
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </MpTabPanel>
          <MpTabPanel v-if="linkedShipments.length" :value="2">
            <h3 class="linked-section-title">Shipments</h3>
            <div class="ood-linked-wrap">
              <table class="ood-linked">
                <thead><tr><th class="detail-th">Shipment no.</th><th class="detail-th">Assignee</th><th class="detail-th">Warehouse</th><th class="detail-th">Transaction date</th></tr></thead>
                <tbody>
                  <tr v-for="h in linkedShipments" :key="h.shipmentSeq" class="detail-item-row">
                    <td class="detail-td detail-td--number">
                      <div class="cell-with-action">
                        <span class="ood-link-num">{{ h.shipmentNo }}</span>
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
      <MpPopover id="ood-print" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
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
            <MpPopoverListItem>Print sales order</MpPopoverListItem>
            <MpPopoverListItem v-if="linkedDelivery.length">Print delivery note</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
      <button v-if="canPickOrder(order)" class="detail-btn detail-btn--primary" @click="createPicking">
        Create picking list
      </button>
      <button v-if="canCreatePackingDirectlyForOrder(order)" class="detail-btn detail-btn--primary" @click="openDirectPacking">
        Create packing
      </button>
    </footer>

    <ActivityLogModal
      :is-open="activityOpen"
      :subject="order.salesNo"
      :updated-by="lastUpdatedBy"
      :updated-at="lastUpdatedAt"
      :entries="activityEntries"
      @close="activityOpen = false"
    />

    <!-- ── Direct-to-packing modal — marketplace orders only ── -->
    <MpModal
      id="ood-direct-pack-modal" :is-open="directPackModalOpen" size="md"
      is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="closeDirectPacking"
    >
      <MpModalContent>
        <MpModalHeader>Create packing?<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          <p class="ood-direct-pack-desc">Order {{ order.number }}'s full quantity will go into a packing task.</p>
          <MpFormControl id="ood-direct-pack-assignee" is-required :is-invalid="directPackAssigneeError">
            <MpFormLabel>Assignee</MpFormLabel>
            <MpAutocomplete
              id="ood-direct-pack-assignee-ac"
              v-model="directPackAssigneeId"
              :data="ASSIGNEES"
              label-prop="name"
              value-prop="id"
              placeholder="Select assignee"
              is-searchable is-clearable use-portal is-full-width
              :is-invalid="directPackAssigneeError"
            />
            <MpFormErrorMessage>You must select assignee</MpFormErrorMessage>
          </MpFormControl>
        </MpModalBody>
        <MpModalFooter>
          <div class="ood-modal-footer-btns">
            <button class="btn-enterprise btn-enterprise--ghost" @click="closeDirectPacking">Cancel</button>
            <button class="btn-enterprise btn-enterprise--primary" @click="confirmDirectPacking">Create packing</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

  </div>

  <div v-else class="ood-not-found">
    <p>Order not found.</p>
    <button class="detail-breadcrumb" @click="goBack">Back to Outbound delivery</button>
  </div>
</template>

<style scoped>
.detail-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px); }
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-jump-chevron {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px);
  background: none; border: none; padding: 0; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.detail-jump-chevron:hover { background: var(--mp-background-neutral-hovered); }
.detail-jump { display: flex; flex-direction: column; }
.detail-jump-search-wrap { padding: var(--mp-spacing-3); position: relative; }
.detail-jump-search {
  width: 100%; box-sizing: border-box; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none;
  padding-right: 34px;
}
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
.search-clear-btn--overlay { position: absolute; right: 18px; top: 50%; transform: translateY(-50%); }
.detail-jump-list { display: flex; flex-direction: column; }
.detail-jump-item {
  display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); width: 100%; text-align: left;
  background: none; border: none; cursor: pointer; padding: var(--mp-spacing-2) var(--mp-spacing-3); border-radius: var(--mp-radii-md);
}
.detail-jump-item:hover { background: var(--mp-background-neutral-subtle); }
.detail-jump-item-number { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.detail-jump-item-customer { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-jump-empty { margin: 0; padding: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }

.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-6); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); display: flex; flex-direction: column; gap: var(--mp-spacing-8); }
.ood-summary { display: grid; grid-template-columns: 244px 244px; column-gap: var(--mp-spacing-6); row-gap: 0; }
.content-list-col { display: flex; flex-direction: column; }

.ood-table-wrap { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.ood-section-title { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
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
.detail-items-count {
  display: flex; align-items: center; margin: 0;
  padding: var(--mp-spacing-3) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
  border-bottom: 1px solid var(--mp-border-default);
}
.detail-td--num { text-align: right; white-space: nowrap; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }

.ood-tabs { flex-shrink: 0; }
.ood-tabs :deep(.mp-tab--isSelected_true), .ood-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.ood-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) { background-color: var(--mp-border-selected, #029861) !important; }
.ood-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }
.linked-section-title { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ood-linked-wrap { overflow-x: auto; }
.ood-linked { width: 100%; border-collapse: collapse; }
.ood-link-num { color: var(--mp-text-link); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.ood-empty { color: var(--mp-text-secondary); }
/* Number cell — "View details" chip on row hover (same as index tables) */
.ood-linked .detail-td--number { position: relative; }
.cell-with-action { display: flex; align-items: center; width: 100%; min-width: 0; }
.row-hover-btn {
  position: absolute; right: var(--mp-spacing-2); top: 50%; transform: translateY(-50%); display: none;
  align-items: center; gap: var(--mp-spacing-1\.5); padding: var(--mp-spacing-1) var(--mp-spacing-1\.5);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-sm); cursor: pointer; white-space: nowrap; line-height: 1; color: var(--mp-text-secondary);
}
.row-hover-btn__label { font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xs, 12px); color: var(--mp-text-secondary); text-transform: uppercase; }
.ood-linked .detail-item-row:hover .row-hover-btn { display: flex; }
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

.ood-not-found { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-4); flex: 1; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.ood-direct-pack-desc { margin: 0 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ood-modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }

/* Notes / attachment / audit (mirrors Sales order & Receipt detail) */
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
</style>
