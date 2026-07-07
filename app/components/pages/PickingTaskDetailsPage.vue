<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpSpinner,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, css,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import SourceLabel from '~/components/patterns/SourceLabel.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import {
  getPickingLineItems, allPickingTasksFlat, getPackingForPickingTask,
} from '~/data/pickingTaskDetails'
import { getPickingTask, startPicking, pickingTaskAgingDays, packableOrderIds, type PickingTask } from '~/data/pickingTasks'
import { getPackingForOrder } from '~/data/packingTasks'
import { outgoingOrders, outgoingStage, OUTGOING_TODAY } from '~/data/outgoing'
import { formatDate, formatDateLong, formatDateTime, formatDateTimeLong } from '~/utils/date'
import { toast } from '@mekari/pixel3'

type TaskStatus = 'open' | 'in progress' | 'partially picked' | 'completed' | 'canceled'

const props = defineProps<{ orderId: string }>()
const router = useRouter()

const task = computed(() => getPickingTask(props.orderId))
const lineItems = computed(() => task.value ? getPickingLineItems(task.value) : [])

// ── Local state mirror (mock data isn't deeply reactive) ─────────────────────
const localStatus = ref<TaskStatus>('open')
const localEndDate = ref<string | null>(null)
const localPicked = ref<Record<string, number>>({})

watch([() => props.orderId, lineItems], () => {
  const map: Record<string, number> = {}
  for (const it of lineItems.value) map[it.key] = it.pickedQty
  localPicked.value = map
  localStatus.value = (task.value?.status as TaskStatus) ?? 'open'
  localEndDate.value = task.value?.endDate ?? null
}, { immediate: true })

const isInProgress = computed(() => localStatus.value === 'in progress')
// Open tasks haven't started — show only To pick (no Picked / Outstanding columns).
const showPickedCols = computed(() => localStatus.value !== 'open')

const toPickTotal = computed(() => lineItems.value.reduce((s, it) => s + it.expectedQty, 0))
const pickedTotal = computed(() => Object.values(localPicked.value).reduce((a, b) => a + (b || 0), 0))
const outstandingTotal = computed(() => Math.max(0, toPickTotal.value - pickedTotal.value))

function rowPicked(key: string, fallback: number): number {
  return localPicked.value[key] ?? fallback
}

// Batch/serial-tracked lines show the bin(s) actually picked from instead of the
// static binLocation — a line can span more than one bin (split across batches/SNs).
function isTrackedItem(item: { batchPicks?: unknown[]; serialPicks?: unknown[] }): boolean {
  return !!(item.batchPicks?.length || item.serialPicks?.length)
}
function pickedLocations(item: { batchPicks?: { location: string }[]; serialPicks?: { location: string }[] }): string[] {
  const bins = new Set<string>()
  for (const b of item.batchPicks ?? []) if (b.location) bins.add(b.location)
  for (const s of item.serialPicks ?? []) if (s.location) bins.add(s.location)
  return [...bins]
}

// Linked sales orders + packing tasks
const linkedOrders = computed(() =>
  (task.value?.salesOrderIds ?? []).map(id => outgoingOrders.find(o => o.id === id)).filter(Boolean) as typeof outgoingOrders,
)
const linkedPacking = computed(() => task.value ? getPackingForPickingTask(task.value.id) : [])

const lastUpdated = computed(() => {
  if (!task.value?.startDate) return null
  const base = new Date(task.value.startDate).getTime()
  const progress = toPickTotal.value > 0 ? pickedTotal.value / toPickTotal.value : 0
  const offsetMs = Math.floor(progress * 4 * 60 * 60 * 1000)
  return new Date(base + offsetMs).toISOString()
})

// ── Actions ──────────────────────────────────────────────────────────────────
function startPickingAndNavigate() {
  startPicking(props.orderId)
  router.push(`/picking/${props.orderId}/pick`)
}
function createPacking() {
  // Packability is judged at the ORDER level across all picking lists, and an order
  // that already has a packing task is excluded. Only block when nothing is left.
  const t = task.value
  if (t) {
    const packable = packableOrderIds(t).filter(id => getPackingForOrder(id).length === 0)
    if (packable.length === 0) {
      const anyPickComplete = packableOrderIds(t).length > 0
      toast.notify({
        variant: 'danger',
        title: anyPickComplete ? 'Already packed' : 'Nothing can be packed yet',
        description: anyPickComplete
          ? 'These orders already have a packing task.'
          : 'Marketplace orders must be fully picked (across their picking lists) before packing.',
        maxWidth: 'max-content',
      })
      return
    }
  }
  router.push({ path: '/outbound-delivery/packing/create', query: { pickingId: props.orderId } })
}

function fmt(n: number) { return n.toLocaleString('id-ID') }
// Marketplace (Desty) orders carry a due time → show date+time, and flag those due
// within 24h with an "Expire in N hours" danger caption. ERP orders are date-only.
function isMarketplaceDue(o: { dueDate: string }) { return typeof o.dueDate === 'string' && o.dueDate.includes('T') }
function dueDisplay(o: { dueDate: string }) { return isMarketplaceDue(o) ? formatDateTime(o.dueDate) : formatDate(o.dueDate) }
function expireHours(o: { dueDate: string }): number | null {
  if (!isMarketplaceDue(o)) return null
  const h = (new Date(o.dueDate).getTime() - OUTGOING_TODAY.getTime()) / 3_600_000
  return h > 0 && h < 24 ? Math.max(1, Math.ceil(h)) : null
}
function agingLabel(): string {
  if (!task.value) return ''
  const d = pickingTaskAgingDays({ ...task.value, endDate: localEndDate.value ?? undefined, status: localStatus.value } as PickingTask)
  return d > 1 ? `${d} days` : ''
}
function paAging(p: { startDate?: string; endDate?: string }): number {
  return pickingTaskAgingDays({ startDate: p.startDate, endDate: p.endDate, status: p.endDate ? 'completed' : 'in progress' } as PickingTask)
}

// ── Search + progressive pagination ──────────────────────────────────────────
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
  setTimeout(() => {
    shownCount.value = Math.min(shownCount.value + PAGE_SIZE, filteredItems.value.length)
    loadingMore.value = false
  }, 400)
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
watch(itemSearch, () => { shownCount.value = PAGE_SIZE; nextTick(() => { if (itemsScrollEl.value) itemsScrollEl.value.scrollTop = 0 }) })

// ── Footer divider ───────────────────────────────────────────────────────────
const stageEl = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)
function checkStageOverflow() {
  const el = stageEl.value
  if (el) stageOverflowing.value = el.scrollHeight > el.clientHeight + 1
}
// The items table gets an outer border only once its scroll area actually overflows
// (i.e. the rows exceed its max height and it can scroll) — not merely by row count.
const itemsOverflowing = ref(false)
function checkItemsOverflow() {
  const el = itemsScrollEl.value
  itemsOverflowing.value = !!el && el.scrollHeight > el.clientHeight + 1
}
let stageObserver: ResizeObserver | null = null
let itemsResizeObserver: ResizeObserver | null = null
onMounted(() => {
  nextTick(() => {
    setupItemsObserver()
    checkStageOverflow()
    checkItemsOverflow()
    stageObserver = new ResizeObserver(checkStageOverflow)
    if (stageEl.value) {
      stageObserver.observe(stageEl.value)
      stageEl.value.addEventListener('scroll', checkStageOverflow, { passive: true })
    }
    itemsResizeObserver = new ResizeObserver(checkItemsOverflow)
    if (itemsScrollEl.value) itemsResizeObserver.observe(itemsScrollEl.value)
  })
})
onUnmounted(() => {
  itemsObserver?.disconnect()
  stageObserver?.disconnect()
  itemsResizeObserver?.disconnect()
  stageEl.value?.removeEventListener('scroll', checkStageOverflow)
})
watch([() => props.orderId, shownCount, filteredItems], () => nextTick(() => { checkStageOverflow(); checkItemsOverflow() }))

// ── Jump-to-task switcher ────────────────────────────────────────────────────
const jumpSearch = ref('')
const jumpResults = computed(() => {
  const all = allPickingTasksFlat()
  const q = jumpSearch.value.trim().toLowerCase()
  const matched = q ? all.filter(t => t.taskNo.toLowerCase().includes(q) || t.salesNos.toLowerCase().includes(q)) : all
  return matched.slice(0, 6)
})
function jumpTo(id: string) { jumpSearch.value = ''; router.push(`/picking/${id}`) }

function goBack() { router.push('/outbound-delivery?tab=Picking') }
</script>

<template>
  <div v-if="task" class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goBack">Picking</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ task.taskNo }}</h1>
          <span v-if="isInProgress" class="pkd-pulse" aria-label="In process" />
          <ErpStatusBadge :status="localStatus" badge-for="additionalInformation" size="md" />
          <MpPopover id="pkd-jump" use-portal :is-keep-alive="false" placement="bottom-start">
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
                    <span class="detail-jump-item-customer">{{ t.salesNos }}</span>
                  </button>
                  <p v-if="!jumpResults.length" class="detail-jump-empty">No tasks found.</p>
                </div>
              </div>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>

      <div v-if="isInProgress && lastUpdated" class="detail-bar-right">
        <span class="pkd-last-updated-label">Last updated</span>
        <span class="pkd-last-updated-val">{{ formatDateTimeLong(lastUpdated) }}</span>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">

      <!-- Summary grid -->
      <section class="pkd-summary">
        <div class="content-list-col">
          <ContentList label="Warehouse" :value="task.warehouseName" />
          <ContentList label="Assignee" :value="task.assignee" />
        </div>
        <div class="content-list-col">
          <ContentList label="Start date" :value="task.startDate ? formatDateTimeLong(task.startDate) : '—'" />
          <ContentList label="End date">
            <span class="pkd-end-cell">
              <span>{{ localEndDate ? formatDateTimeLong(localEndDate) : '—' }}</span>
              <span v-if="agingLabel()" class="pkd-aging">{{ agingLabel() }}</span>
            </span>
          </ContentList>
        </div>
      </section>

      <!-- Progress stats -->
      <section class="pkd-progress">
        <div class="pkd-progress-stat">
          <span class="pkd-progress-label">SKU qty</span>
          <span class="pkd-progress-val">{{ task.skuQty }}</span>
        </div>
        <div class="pkd-progress-stat">
          <span class="pkd-progress-label">To pick qty</span>
          <span class="pkd-progress-val">{{ fmt(toPickTotal) }}</span>
        </div>
        <div class="pkd-progress-stat">
          <span class="pkd-progress-label">Picked qty</span>
          <span class="pkd-progress-val">{{ fmt(pickedTotal) }}</span>
        </div>
        <div class="pkd-progress-stat">
          <span class="pkd-progress-label">Outstanding qty</span>
          <span class="pkd-progress-val">{{ fmt(outstandingTotal) }}</span>
        </div>
      </section>

      <!-- Line items -->
      <div class="pkd-table-wrap">
        <div class="pkd-filter-bar">
          <div class="pkd-search-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input v-model="itemSearch" class="pkd-search" type="text" placeholder="Search product or SKU…" />
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
                  <th class="detail-th detail-th--num">To pick qty</th>
                  <th v-if="showPickedCols" class="detail-th detail-th--num">Picked qty</th>
                  <th v-if="showPickedCols" class="detail-th detail-th--num">Outstanding qty</th>
                  <th class="detail-th">Unit</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in visibleItems" :key="item.key" class="detail-item-row">
                  <td class="detail-td">
                    <ProductCell :name="item.productName" :desc="item.productDesc" :image="item.image" />
                  </td>
                  <td class="detail-td">{{ item.skuCode }}</td>
                  <td class="detail-td">
                    <template v-if="isTrackedItem(item)">
                      <template v-if="pickedLocations(item).length">
                        <span v-for="loc in pickedLocations(item)" :key="loc" class="pkd-location-item">{{ loc }}</span>
                      </template>
                      <span v-else>—</span>
                    </template>
                    <template v-else>{{ item.binLocation }}</template>
                  </td>
                  <td class="detail-td detail-td--num">{{ fmt(item.expectedQty) }}</td>
                  <td v-if="showPickedCols" class="detail-td detail-td--num">
                    <span :class="isInProgress ? '' : (rowPicked(item.key, item.pickedQty) === item.expectedQty ? 'pkd-qty--full' : rowPicked(item.key, item.pickedQty) > 0 ? 'pkd-qty--partial' : 'pkd-qty--zero')">
                      {{ fmt(rowPicked(item.key, item.pickedQty)) }}
                    </span>
                  </td>
                  <td v-if="showPickedCols" class="detail-td detail-td--num">
                    <span v-if="item.expectedQty - rowPicked(item.key, item.pickedQty) > 0" class="pkd-outstanding">
                      {{ fmt(item.expectedQty - rowPicked(item.key, item.pickedQty)) }}
                    </span>
                    <span v-else class="pkd-qty--full">—</span>
                  </td>
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
            <span>Showing {{ visibleItems.length }} of {{ filteredItems.length }} products</span>
          </div>
        </section>
      </div>

      <!-- Linked transactions -->
      <MpTabs id="pkd-tabs" :default-value="0" variant-color="green" class="pkd-tabs">
        <MpTabList>
          <MpTab id="pkd-tab-so" :value="0">Sales orders ({{ linkedOrders.length }})</MpTab>
          <MpTab v-if="linkedPacking.length" id="pkd-tab-pack" :value="1">Packing ({{ linkedPacking.length }})</MpTab>
        </MpTabList>
        <MpTabPanels>
          <MpTabPanel :value="0">
            <h3 class="linked-section-title">Sales orders</h3>
            <div class="pkd-linked-wrap">
              <table class="pkd-linked">
                <thead>
                  <tr>
                    <th class="detail-th">Number</th>
                    <th class="detail-th">Customer</th>
                    <th class="detail-th">Source</th>
                    <th class="detail-th detail-th--num">SKU qty</th>
                    <th class="detail-th detail-th--num">Order qty</th>
                    <th class="detail-th">Status</th>
                    <th class="detail-th">Due date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="o in linkedOrders" :key="o.id" class="detail-item-row">
                    <td class="detail-td detail-td--number">
                      <div class="cell-with-action">
                        <span class="pkd-linked-num">{{ o.salesNo }}</span>
                        <button class="row-hover-btn" @click.stop="router.push(`/outbound-delivery/${o.id}`)">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                          <span class="row-hover-btn__label">VIEW DETAILS</span>
                        </button>
                      </div>
                    </td>
                    <td class="detail-td">{{ o.customer ?? '—' }}</td>
                    <td class="detail-td"><SourceLabel :source="o.source" /></td>
                    <td class="detail-td detail-td--num">{{ fmt(o.skuQty) }}</td>
                    <td class="detail-td detail-td--num">{{ fmt(o.orderQty) }}</td>
                    <td class="detail-td"><ErpStatusBadge :status="outgoingStage(o)" /></td>
                    <td class="detail-td">
                      <span class="pkd-due">
                        <span>{{ dueDisplay(o) }}</span>
                        <span v-if="expireHours(o) !== null" class="pkd-due-expire">Expire in {{ expireHours(o) }} hours</span>
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </MpTabPanel>

          <MpTabPanel v-if="linkedPacking.length" :value="1">
            <h3 class="linked-section-title">Packing tasks</h3>
            <div class="pkd-linked-wrap">
              <table class="pkd-linked">
                <thead>
                  <tr>
                    <th class="detail-th">Number</th>
                    <th class="detail-th">Sales order</th>
                    <th class="detail-th">Assignee</th>
                    <th class="detail-th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="pk in linkedPacking" :key="pk.id" class="detail-item-row">
                    <td class="detail-td detail-td--number">
                      <div class="cell-with-action">
                        <span class="pkd-linked-num">{{ pk.taskNo }}</span>
                        <button class="row-hover-btn" @click.stop="router.push(`/packing/${pk.id}`)">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                          <span class="row-hover-btn__label">VIEW DETAILS</span>
                        </button>
                      </div>
                    </td>
                    <td class="detail-td">{{ pk.salesNo }}</td>
                    <td class="detail-td">{{ pk.assignee }}</td>
                    <td class="detail-td"><ErpStatusBadge :status="pk.status" /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </MpTabPanel>
        </MpTabPanels>
      </MpTabs>

    </div>

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <MpPopover id="pkd-print" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
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
            <MpPopoverListItem>Print picking list</MpPopoverListItem>
            <MpPopoverListItem>Print label</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
      <button v-if="localStatus === 'open'" class="detail-btn detail-btn--primary" @click="startPickingAndNavigate">
        Start picking
      </button>
      <button v-else-if="localStatus === 'in progress'" class="detail-btn detail-btn--primary" @click="router.push(`/picking/${orderId}/pick`)">
        Continue picking
      </button>
      <button v-else-if="localStatus === 'completed' || localStatus === 'partially picked'" class="detail-btn detail-btn--primary" @click="createPacking">
        Create packing task
      </button>
    </footer>

  </div>

  <!-- Not found -->
  <div v-else class="pkd-not-found">
    <p>Picking task not found.</p>
    <button class="detail-breadcrumb" @click="goBack">Back to Picking</button>
  </div>
</template>

<style scoped>
/* ── Page shell ─────────────────────────────────────────────────────────────── */
.detail-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}

@keyframes pkd-pulse-ring {
  0%   { transform: scale(0.85); opacity: 1; }
  100% { transform: scale(1.8);  opacity: 0; }
}
.pkd-pulse {
  position: relative; display: inline-flex;
  width: var(--mp-sizes-2, 8px); height: var(--mp-sizes-2, 8px);
  border-radius: var(--mp-radii-full, 999px); background: var(--mp-colors-emerald-500, #10b981); flex-shrink: 0;
}
.pkd-pulse::after {
  content: ''; position: absolute; inset: 0; border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-colors-emerald-500, #10b981);
  animation: pkd-pulse-ring 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.detail-bar-right { display: flex; flex-direction: column; align-items: flex-end; gap: var(--mp-spacing-0\.5); flex-shrink: 0; }
.pkd-last-updated-label { font-size: var(--mp-font-sizes-xs, 11px); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-xs, 14px); }
.pkd-last-updated-val { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-medium); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }

.detail-jump-chevron {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px);
  background: none; border: none; padding: 0; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default);
}
.detail-jump-chevron:hover { background: var(--mp-background-neutral-hovered); }
.detail-jump { display: flex; flex-direction: column; }
.detail-jump-search-wrap { padding: var(--mp-spacing-3); }
.detail-jump-search {
  width: 100%; box-sizing: border-box; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none;
}
.detail-jump-search:focus { border-color: var(--mp-border-brand-bold, #029861); }
.detail-jump-list { display: flex; flex-direction: column; }
.detail-jump-item {
  display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); width: 100%; text-align: left;
  background: none; border: none; cursor: pointer; padding: var(--mp-spacing-2) var(--mp-spacing-3); border-radius: var(--mp-radii-md);
}
.detail-jump-item:hover { background: var(--mp-background-neutral-subtle); }
.detail-jump-item-number { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.detail-jump-item-customer { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-jump-empty { margin: 0; padding: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* ── Stage ───────────────────────────────────────────────────────────────────── */
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column; gap: var(--mp-spacing-8);
}

.pkd-summary { display: grid; grid-template-columns: 244px 244px; column-gap: var(--mp-spacing-6); row-gap: 0; }
.content-list-col { display: flex; flex-direction: column; }
.pkd-end-cell { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.pkd-aging {
  display: inline-flex; align-items: center; padding: 0 var(--mp-spacing-1\.5);
  border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral-subtle, #f1f5f9);
  color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg, 20px); white-space: nowrap;
}

.pkd-progress { display: flex; align-items: center; gap: var(--mp-spacing-10); align-self: flex-start; }
.pkd-progress-stat { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: var(--mp-sizes-28, 112px); }
.pkd-progress-val { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.pkd-progress-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.pkd-table-wrap { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.pkd-filter-bar { display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-3); }
.pkd-search-wrap {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary); min-width: 240px;
}
.pkd-search { flex: 1; border: none; background: transparent; outline: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pkd-search::placeholder { color: var(--mp-text-placeholder); }

.detail-items-section { display: flex; flex-direction: column; flex-shrink: 0; }
.detail-items-section--bordered { border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md); overflow: hidden; }
.detail-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: auto; }
.detail-items thead .detail-th { position: sticky; top: 0; z-index: 1; }
.detail-items-sentinel { height: 1px; }
.detail-items-loading { justify-content: center; padding: var(--mp-spacing-3); }
.detail-loading { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); color: var(--mp-text-secondary); }
.detail-items { width: 100%; border-collapse: collapse; table-layout: auto; }
.detail-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.detail-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.detail-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); vertical-align: top;
}
.detail-td--num { text-align: right; white-space: nowrap; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }
.pkd-location-item { display: block; }
.pkd-location-item:not(:last-child) { margin-bottom: 2px; }
.detail-items-count { display: flex; align-items: center; margin: 0; padding: var(--mp-spacing-3) var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.pkd-qty--full { color: var(--mp-text-success-default, #15803d); font-weight: var(--mp-font-weights-medium); }
.pkd-qty--partial { color: var(--mp-text-warning-default, #854d0e); }
.pkd-qty--zero { color: var(--mp-text-placeholder); }
.pkd-outstanding { color: var(--mp-text-warning-default, #854d0e); font-weight: var(--mp-font-weights-medium); }
/* Linked-order due date + marketplace expiry caption */
.pkd-due { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.pkd-due-expire { font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm); color: var(--mp-text-danger, #c0392b); font-weight: var(--mp-font-weights-medium); }

/* Linked tabs */
.pkd-tabs { flex-shrink: 0; }
.pkd-tabs :deep(.mp-tab--isSelected_true), .pkd-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.pkd-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) { background-color: var(--mp-border-selected, #029861) !important; }
.pkd-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }
.linked-section-title { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pkd-linked-wrap { overflow-x: auto; }
.pkd-linked { width: 100%; border-collapse: collapse; }
.pkd-linked-num { color: var(--mp-text-link); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.pkd-linked .detail-td--number { position: relative; }
.cell-with-action { display: flex; align-items: center; width: 100%; min-width: 0; }
.row-hover-btn {
  position: absolute; right: var(--mp-spacing-2); top: 50%; transform: translateY(-50%); display: none;
  align-items: center; gap: var(--mp-spacing-1\.5); padding: var(--mp-spacing-1) var(--mp-spacing-1\.5);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-sm); cursor: pointer; white-space: nowrap; line-height: 1; color: var(--mp-text-secondary);
}
.row-hover-btn__label { font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xs, 12px); color: var(--mp-text-secondary); text-transform: uppercase; }
.detail-item-row:hover .row-hover-btn { display: flex; }

/* ── Footer ──────────────────────────────────────────────────────────────────── */
.detail-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage); border-top: 1px solid transparent;
}
.detail-footer--floating { border-top-color: var(--mp-border-default); }
.detail-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer; border: 1px solid transparent; white-space: nowrap;
}
.detail-btn--secondary { background: var(--mp-background-neutral); border-color: var(--mp-border-bold); color: var(--mp-text-secondary); }
.detail-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }
.detail-btn--primary { background: var(--mp-background-brand-bold, #029861); border-color: transparent; color: var(--mp-text-on-color, #fff); }
.detail-btn--primary:hover { background: var(--mp-background-brand-bold-hovered, #027a4e); }

.pkd-not-found {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--mp-spacing-4); flex: 1; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
</style>
