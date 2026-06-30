<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpSpinner,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpFormControl, MpFormLabel, MpAutocomplete, MpInput, MpButton, css,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import {
  getPackingLineItems, allPackingTasksFlat, getDeliveryForPackingTask,
} from '~/data/packingTaskDetails'
import { getPackingTask, startPacking, packingTaskAgingDays, type PackingTask } from '~/data/packingTasks'
import { addDeliveryTask } from '~/data/deliveryTasks'
import { outgoingOrders, outgoingStage } from '~/data/outgoing'
import { formatDate, formatDateTime } from '~/utils/date'

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
const showPackedCols = computed(() => localStatus.value !== 'open')

const pickedTotal = computed(() => lineItems.value.reduce((s, it) => s + it.pickedQty, 0))
const packedTotal = computed(() => Object.values(localPacked.value).reduce((a, b) => a + (b || 0), 0))
const outstandingTotal = computed(() => Math.max(0, pickedTotal.value - packedTotal.value))
function rowPacked(key: string, fallback: number): number { return localPacked.value[key] ?? fallback }

const linkedOrder = computed(() => outgoingOrders.find(o => o.id === task.value?.salesOrderId))
const linkedDelivery = computed(() => task.value ? getDeliveryForPackingTask(task.value.id) : [])

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
const ASSIGNEES = [
  { id: 'u01', name: 'Budi Santoso',    initials: 'BS', hue: 210 },
  { id: 'u02', name: 'Dewi Rahayu',     initials: 'DR', hue: 145 },
  { id: 'u03', name: 'Rizki Pratama',   initials: 'RP', hue: 30  },
  { id: 'u04', name: 'Agus Firmansyah', initials: 'AF', hue: 280 },
  { id: 'u05', name: 'Sari Indah',      initials: 'SI', hue: 320 },
  { id: 'u06', name: 'Hendra Wijaya',   initials: 'HW', hue: 170 },
  { id: 'u07', name: 'Citra Kusuma',    initials: 'CK', hue: 55  },
  { id: 'u08', name: 'Galih Nugraha',   initials: 'GN', hue: 100 },
]
const shipModalOpen = ref(false)
const shipAssigneeId = ref('')
const shipAssigneeError = ref(false)
const shipAssigneeLabel = computed(() => ASSIGNEES.find(a => a.id === shipAssigneeId.value)?.name ?? '')
const shipScan = ref('')
const shipCourier = ref('')
const shipTracking = ref('')
function createShipping() {
  shipAssigneeId.value = ''
  shipAssigneeError.value = false
  shipScan.value = ''
  shipCourier.value = ''
  shipTracking.value = ''
  shipModalOpen.value = true
}
const SHIP_COURIERS = ['JNE', 'SiCepat', 'J&T Express', 'AnterAja', 'Internal fleet']
// Scanning a shipping label (issued by OMS) → auto-fills courier + tracking (dummy random).
function applyShipScan() {
  shipCourier.value = SHIP_COURIERS[Math.floor(Math.random() * SHIP_COURIERS.length)]!
  shipTracking.value = 'SD' + Math.floor(1_000_000 + Math.random() * 9_000_000)
  if (!shipScan.value.trim()) shipScan.value = shipTracking.value
}
function confirmShipping() {
  const t = task.value
  if (!t) return
  if (!shipAssigneeId.value) { shipAssigneeError.value = true; return }
  addDeliveryTask({
    salesOrderId: t.salesOrderId, salesNo: t.salesNo,
    packingTaskId: t.id, packingTaskNo: t.taskNo,
    warehouseId: t.warehouseId, warehouseName: t.warehouseName,
    assignee: shipAssigneeLabel.value, skuQty: t.skuQty, toShipQty: t.packedQty,
    courier: shipCourier.value.trim() || undefined,
    trackingNo: shipTracking.value.trim() || undefined,
  })
  shipModalOpen.value = false
  router.push({ path: '/barang-keluar', query: { tab: 'Delivery', saved: '1' } })
}
function fmt(n: number) { return n.toLocaleString('id-ID') }
function agingLabel(): string {
  if (!task.value) return ''
  const d = packingTaskAgingDays({ ...task.value, endDate: localEndDate.value ?? undefined, status: localStatus.value } as PackingTask)
  return d > 1 ? `${d} days` : ''
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
  itemsObserver = new IntersectionObserver(entries => { if (entries[0].isIntersecting) loadMoreItems() }, { root: itemsScrollEl.value, rootMargin: '0px 0px 120px 0px' })
  itemsObserver.observe(itemsSentinelEl.value)
}
watch(itemSearch, () => { shownCount.value = PAGE_SIZE; nextTick(() => { if (itemsScrollEl.value) itemsScrollEl.value.scrollTop = 0 }) })

const stageEl = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)
function checkStageOverflow() { const el = stageEl.value; if (el) stageOverflowing.value = el.scrollHeight > el.clientHeight + 1 }
let stageObserver: ResizeObserver | null = null
onMounted(() => {
  nextTick(() => {
    setupItemsObserver()
    checkStageOverflow()
    stageObserver = new ResizeObserver(checkStageOverflow)
    if (stageEl.value) { stageObserver.observe(stageEl.value); stageEl.value.addEventListener('scroll', checkStageOverflow, { passive: true }) }
  })
})
onUnmounted(() => { itemsObserver?.disconnect(); stageObserver?.disconnect(); stageEl.value?.removeEventListener('scroll', checkStageOverflow) })
watch([() => props.orderId, shownCount], () => nextTick(checkStageOverflow))

const jumpSearch = ref('')
const jumpResults = computed(() => {
  const all = allPackingTasksFlat()
  const q = jumpSearch.value.trim().toLowerCase()
  const matched = q ? all.filter(t => t.taskNo.toLowerCase().includes(q) || t.salesNo.toLowerCase().includes(q)) : all
  return matched.slice(0, 6)
})
function jumpTo(id: string) { jumpSearch.value = ''; router.push(`/packing/${id}`) }
function goBack() { router.push('/barang-keluar?tab=Packing') }
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
        <span class="pck-last-updated-val">{{ formatDateTime(lastUpdated) }}</span>
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
          <ContentList label="Picking task" :value="task.pickingTaskNo" />
          <ContentList label="Start date" :value="task.startDate ? formatDateTime(task.startDate) : '—'" />
          <ContentList label="End date">
            <span class="pck-end-cell">
              <span>{{ localEndDate ? formatDateTime(localEndDate) : '—' }}</span>
              <span v-if="agingLabel()" class="pck-aging">{{ agingLabel() }}</span>
            </span>
          </ContentList>
        </div>
      </section>

      <section class="pck-progress">
        <div class="pck-progress-stat"><span class="pck-progress-val">{{ task.skuQty }}</span><span class="pck-progress-label">SKUs</span></div>
        <div class="pck-progress-stat"><span class="pck-progress-val">{{ fmt(pickedTotal) }}</span><span class="pck-progress-label">Picked</span></div>
        <div class="pck-progress-stat"><span class="pck-progress-val">{{ fmt(packedTotal) }}</span><span class="pck-progress-label">Packed</span></div>
        <div class="pck-progress-stat"><span class="pck-progress-val">{{ fmt(outstandingTotal) }}</span><span class="pck-progress-label">Outstanding</span></div>
      </section>

      <div class="pck-table-wrap">
        <div class="pck-filter-bar">
          <div class="pck-search-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input v-model="itemSearch" class="pck-search" type="text" placeholder="Search product or SKU…" />
          </div>
        </div>
        <section class="detail-items-section" :class="{ 'detail-items-section--bordered': isProgressive }">
          <div ref="itemsScrollEl" class="detail-items-scroll">
            <table class="detail-items">
              <thead>
                <tr>
                  <th class="detail-th">Product</th>
                  <th class="detail-th">SKU</th>
                  <th class="detail-th">Storage location</th>
                  <th class="detail-th detail-th--num">Picked qty</th>
                  <th v-if="showPackedCols" class="detail-th detail-th--num">Packed qty</th>
                  <th v-if="showPackedCols" class="detail-th detail-th--num">Outstanding</th>
                  <th class="detail-th">Unit</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in visibleItems" :key="item.key" class="detail-item-row">
                  <td class="detail-td"><ProductCell :name="item.productName" :desc="item.productDesc" :image="item.image" /></td>
                  <td class="detail-td">{{ item.skuCode }}</td>
                  <td class="detail-td">{{ item.binLocation }}</td>
                  <td class="detail-td detail-td--num">{{ fmt(item.pickedQty) }}</td>
                  <td v-if="showPackedCols" class="detail-td detail-td--num">
                    <span :class="isInProgress ? '' : (rowPacked(item.key, item.packedQty) === item.pickedQty ? 'pck-qty--full' : rowPacked(item.key, item.packedQty) > 0 ? 'pck-qty--partial' : 'pck-qty--zero')">
                      {{ fmt(rowPacked(item.key, item.packedQty)) }}
                    </span>
                  </td>
                  <td v-if="showPackedCols" class="detail-td detail-td--num">
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
          <MpTab id="pck-tab-so" :value="0">Sales order</MpTab>
          <MpTab v-if="linkedDelivery.length" id="pck-tab-del" :value="1">Delivery ({{ linkedDelivery.length }})</MpTab>
        </MpTabList>
        <MpTabPanels>
          <MpTabPanel :value="0">
            <div class="pck-linked-wrap">
              <table class="pck-linked">
                <thead>
                  <tr><th class="detail-th">Number</th><th class="detail-th">Customer</th><th class="detail-th">Status</th><th class="detail-th">Due date</th></tr>
                </thead>
                <tbody>
                  <tr v-if="linkedOrder" class="detail-item-row">
                    <td class="detail-td detail-td--number">
                      <div class="cell-with-action">
                        <span class="pck-linked-num">{{ linkedOrder.salesNo }}</span>
                        <button class="row-hover-btn" @click.stop="router.push(`/barang-keluar/${linkedOrder.id}`)">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                          <span class="row-hover-btn__label">VIEW DETAILS</span>
                        </button>
                      </div>
                    </td>
                    <td class="detail-td">{{ linkedOrder.customer ?? '—' }}</td>
                    <td class="detail-td"><ErpStatusBadge :status="outgoingStage(linkedOrder)" /></td>
                    <td class="detail-td">{{ formatDate(linkedOrder.dueDate) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </MpTabPanel>

          <MpTabPanel v-if="linkedDelivery.length" :value="1">
            <div class="pck-linked-wrap">
              <table class="pck-linked">
                <thead>
                  <tr><th class="detail-th">Number</th><th class="detail-th">Assignee</th><th class="detail-th">Status</th><th class="detail-th">Shipped qty</th></tr>
                </thead>
                <tbody>
                  <tr v-for="d in linkedDelivery" :key="d.id" class="detail-item-row">
                    <td class="detail-td detail-td--number">
                      <div class="cell-with-action">
                        <span class="pck-linked-num">{{ d.taskNo }}</span>
                        <button class="row-hover-btn" @click.stop="router.push(`/delivery/${d.id}`)">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                          <span class="row-hover-btn__label">VIEW DETAILS</span>
                        </button>
                      </div>
                    </td>
                    <td class="detail-td">{{ d.assignee }}</td>
                    <td class="detail-td"><ErpStatusBadge :status="d.status" /></td>
                    <td class="detail-td">{{ fmt(d.shippedQty) }}</td>
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
      <button v-else-if="localStatus === 'completed' && !linkedDelivery.length" class="detail-btn detail-btn--primary" @click="createShipping">
        Create shipping
      </button>
    </footer>

  </div>

  <div v-else class="pck-not-found">
    <p>Packing task not found.</p>
    <button class="detail-breadcrumb" @click="goBack">Back to Packing</button>
  </div>

  <!-- ── Create shipping: pick assignee ── -->
  <MpModal id="pck-ship-modal" :is-open="shipModalOpen" size="lg" is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="shipModalOpen = false">
    <MpModalContent>
      <MpModalHeader>Create shipping<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <p class="pck-ship-note">A shipment (delivery) will be created with status “Pending pick-up”.</p>
        <MpFormControl id="pck-ship-assignee" is-required :is-invalid="shipAssigneeError" :class="css({ marginBottom: '16px' })">
          <MpFormLabel>Assignee</MpFormLabel>
          <MpAutocomplete
            id="pck-ship-assignee-ac"
            v-model="shipAssigneeId"
            :data="ASSIGNEES"
            label-prop="name"
            value-prop="id"
            placeholder="Select assignee"
            is-searchable is-clearable use-portal is-full-width
            :is-invalid="shipAssigneeError"
          />
        </MpFormControl>
        <MpFormControl id="pck-ship-scan" :class="css({ marginBottom: '16px' })">
          <MpFormLabel>Scan shipping label</MpFormLabel>
          <div class="pck-ship-scan-field">
            <MpInput id="pck-ship-scan-input" v-model="shipScan" placeholder="Scan or paste label…" is-full-width @keyup.enter="applyShipScan" />
            <MpButton variant="secondary" is-rounded @click="applyShipScan">Apply</MpButton>
          </div>
        </MpFormControl>
        <div class="pck-ship-grid">
          <MpFormControl id="pck-ship-courier">
            <MpFormLabel>Courier</MpFormLabel>
            <MpInput id="pck-ship-courier-input" v-model="shipCourier" placeholder="e.g. JNE, SiCepat" is-full-width />
          </MpFormControl>
          <MpFormControl id="pck-ship-tracking">
            <MpFormLabel>Tracking no.</MpFormLabel>
            <MpInput id="pck-ship-tracking-input" v-model="shipTracking" placeholder="e.g. SD0009583" is-full-width />
          </MpFormControl>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <div class="pck-ship-footer">
          <MpButton variant="ghost" is-rounded @click="shipModalOpen = false">Cancel</MpButton>
          <MpButton variant="primary" is-rounded @click="confirmShipping">Create shipping</MpButton>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
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
.detail-items-section--bordered .detail-items-count { border-top: 1px solid var(--mp-border-default); }
.detail-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: auto; }
.detail-items thead .detail-th { position: sticky; top: 0; z-index: 1; }
.detail-items-sentinel { height: 1px; }
.detail-items-loading { justify-content: center; padding: var(--mp-spacing-3); }
.detail-loading { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); color: var(--mp-text-secondary); }
.detail-items { width: 100%; border-collapse: collapse; table-layout: auto; }
.detail-th { height: var(--mp-sizes-7, 28px); text-align: left; padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2); background: var(--mp-background-neutral-subtle); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-transform: uppercase; border-bottom: 1px solid var(--mp-border-default); white-space: nowrap; }
.detail-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.detail-td { padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); vertical-align: top; }
.detail-items-section--bordered .detail-item-row:last-child .detail-td { border-bottom: none; }
.detail-td--num { text-align: right; white-space: nowrap; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }
.detail-items-count { display: flex; align-items: center; margin: 0; padding: var(--mp-spacing-3) var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.pck-qty--full { color: var(--mp-text-success-default, #15803d); font-weight: var(--mp-font-weights-medium); }
.pck-qty--partial { color: var(--mp-text-warning-default, #854d0e); }
.pck-qty--zero { color: var(--mp-text-placeholder); }
.pck-outstanding { color: var(--mp-text-warning-default, #854d0e); font-weight: var(--mp-font-weights-medium); }

.pck-tabs { flex-shrink: 0; }
.pck-tabs :deep(.mp-tab--isSelected_true), .pck-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.pck-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) { background-color: var(--mp-border-selected, #029861) !important; }
.pck-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }
.pck-linked-wrap { overflow-x: auto; }
.pck-linked { width: 100%; border-collapse: collapse; }
.pck-linked .detail-item-row:last-child .detail-td { border-bottom: none; }
.pck-linked-num { color: var(--mp-text-link); }
.pck-linked .detail-td--number { position: relative; }
.cell-with-action { display: flex; align-items: center; width: 100%; min-width: 0; }
.row-hover-btn { position: absolute; right: var(--mp-spacing-2); top: 50%; transform: translateY(-50%); display: none; align-items: center; gap: var(--mp-spacing-1\.5); padding: var(--mp-spacing-1) var(--mp-spacing-1\.5); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-sm); cursor: pointer; white-space: nowrap; line-height: 1; color: var(--mp-text-secondary); }
.row-hover-btn__label { font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xs, 12px); color: var(--mp-text-secondary); text-transform: uppercase; }
.detail-item-row:hover .row-hover-btn { display: flex; }

.detail-footer { flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage); border-top: 1px solid transparent; }
.detail-footer--floating { border-top-color: var(--mp-border-default); }
.detail-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer; border: 1px solid transparent; white-space: nowrap; }
.detail-btn--secondary { background: var(--mp-background-neutral); border-color: var(--mp-border-bold); color: var(--mp-text-secondary); }
.detail-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }
.detail-btn--primary { background: var(--mp-background-brand-bold, #029861); border-color: transparent; color: var(--mp-text-on-color, #fff); }
.detail-btn--primary:hover { background: var(--mp-background-brand-bold-hovered, #027a4e); }

.pck-not-found { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-4); flex: 1; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.pck-ship-note { margin: 0 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pck-ship-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
.pck-ship-scan-field { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.pck-ship-scan-field > :first-child { flex: 1; min-width: 0; }
.pck-ship-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-4); }
</style>
