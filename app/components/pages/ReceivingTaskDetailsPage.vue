<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpSpinner,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalCloseButton, MpModalOverlay,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel,
  MpButton, toast, css,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { findTaskWithPO, getTaskLineItems, allTasksFlat, setTaskReceived, getPutAwayForTask } from '~/data/receivingTaskDetails'
import { addPutAwayTask } from '~/data/putAwayTasks'
import { taskAgingDays, type ReceivingTask } from '~/data/receivingTasks'
import { formatDateTime } from '~/utils/date'

type TaskStatus = 'open' | 'in progress' | 'pending put-away' | 'completed'

const props = defineProps<{ orderId: string }>()

const router = useRouter()

const entry = computed(() => findTaskWithPO(props.orderId))
const task  = computed(() => entry.value?.task)
const po    = computed(() => entry.value?.po)

const lineItems = computed(() => task.value && po.value ? getTaskLineItems(task.value, po.value.purchaseNo) : [])

// ── Local receiving state ───────────────────────────────────────────────────
// Plain mock data isn't deeply reactive, so we mirror the mutable bits in local
// refs that drive the view. Saving updates these (instant re-render) and also the
// underlying task + override store (so a remount after navigation stays in sync).
const localStatus  = ref<TaskStatus>('open')
const localEndDate = ref<string | null>(null)
// Per-SKU received qty: localReceived = saved/displayed, draftQty = modal input.
const localReceived = ref<Record<string, number>>({})
const draftQty      = ref<Record<string, number>>({})
const receiveModalOpen      = ref(false)
const showIncompleteConfirm = ref(false)
const modalSearch           = ref('')

watch([() => props.orderId, lineItems], () => {
  const map: Record<string, number> = {}
  for (const it of lineItems.value) map[it.skuCode] = it.receivedQty
  localReceived.value = map
  localStatus.value   = (task.value?.status as TaskStatus) ?? 'open'
  localEndDate.value  = task.value?.endDate ?? null
  receiveModalOpen.value = false
  draftQty.value = {}
}, { immediate: true })

const isInProgress = computed(() => localStatus.value === 'in progress')
// Open tasks haven't started receiving yet — show only Purchase qty (no Received /
// Outstanding columns, which are meaningless until receiving begins).
const showReceivedCols = computed(() => localStatus.value !== 'open')

// Linked put-away task(s) — the downstream transaction, shown like PRs on a PO.
const linkedPutAway = computed(() => task.value ? getPutAwayForTask({ ...task.value, status: localStatus.value, endDate: localEndDate.value ?? undefined }) : [])

const purchaseTotal      = computed(() => task.value?.purchaseQty ?? 0)
const savedReceivedTotal = computed(() => Object.values(localReceived.value).reduce((a, b) => a + (b || 0), 0))
const outstandingTotal   = computed(() => Math.max(0, purchaseTotal.value - savedReceivedTotal.value))

// Modal (draft) totals — drive the modal summary + incomplete alert.
const draftReceivedTotal = computed(() => Object.values(draftQty.value).reduce((a, b) => a + (b || 0), 0))
const draftOutstanding   = computed(() => Math.max(0, purchaseTotal.value - draftReceivedTotal.value))
const shortItemsCount = computed(
  () => lineItems.value.filter(it => (draftQty.value[it.skuCode] ?? 0) < it.expectedQty).length,
)

// Modal line items — filtered by the modal's own search box.
const modalItems = computed(() => {
  const q = modalSearch.value.trim().toLowerCase()
  if (!q) return lineItems.value
  return lineItems.value.filter(
    it => it.productName.toLowerCase().includes(q) || it.skuCode.toLowerCase().includes(q),
  )
})

/** Saved received qty for a page-table row. */
function rowReceived(skuCode: string, fallback: number): number {
  return localReceived.value[skuCode] ?? fallback
}

// Derive a "last updated" from startDate + offset based on how much has been received.
// Not a real field — for demo purposes the scan time advances as more items are scanned.
const lastUpdated = computed(() => {
  if (!task.value?.startDate) return null
  const base = new Date(task.value.startDate).getTime()
  const progress = purchaseTotal.value > 0 ? savedReceivedTotal.value / purchaseTotal.value : 0
  const offsetMs = Math.floor(progress * 4 * 60 * 60 * 1000) // up to 4h after start
  return new Date(base + offsetMs).toISOString()
})

// Create the put-away task → the receiving task is now completed.
function createPutAway() {
  const endIso = new Date().toISOString()
  localStatus.value = 'completed'
  if (!localEndDate.value) localEndDate.value = endIso
  if (task.value) {
    task.value.status = 'completed'
    if (!task.value.endDate) task.value.endDate = endIso
  }
  if (task.value && po.value) {
    addPutAwayTask({
      purchaseNo: po.value.purchaseNo, warehouseId: po.value.warehouseId,
      warehouseName: po.value.warehouseName, assignee: task.value.assignee, itemQty: task.value.receivedQty,
    })
  }
  toast.notify({ variant: 'success', title: 'Put-away created' })
}

// ── Receiving actions ───────────────────────────────────────────────────────
function openReceiveModal() {
  const map: Record<string, number> = {}
  for (const it of lineItems.value) map[it.skuCode] = localReceived.value[it.skuCode] ?? 0
  draftQty.value = map
  modalSearch.value = ''
  receiveModalOpen.value = true
}
function closeReceiveModal() {
  receiveModalOpen.value = false
  draftQty.value = {}
}
/** Quick-fill every row to its full purchase qty. */
function receiveAll() {
  const map: Record<string, number> = {}
  for (const it of lineItems.value) map[it.skuCode] = it.expectedQty
  draftQty.value = map
}
function onQtyInput(skuCode: string, expected: number, e: Event) {
  let n = Math.floor(Number((e.target as HTMLInputElement).value))
  if (!Number.isFinite(n) || n < 0) n = 0
  if (n > expected) n = expected
  draftQty.value = { ...draftQty.value, [skuCode]: n }
}

function endReceiving() {
  if (draftOutstanding.value > 0) { showIncompleteConfirm.value = true; return }
  commitReceiving()
}
function commitReceiving() {
  showIncompleteConfirm.value = false
  const received = { ...draftQty.value }
  const total = draftReceivedTotal.value
  const complete = total >= purchaseTotal.value
  const endIso = new Date().toISOString()

  // Receiving is done → goods await put-away (the put-away task isn't created yet).
  // Local refs → instant re-render.
  localReceived.value = received
  localStatus.value   = 'pending put-away'
  localEndDate.value  = endIso
  receiveModalOpen.value = false

  // Persist to the mock store so a remount after navigation stays consistent.
  setTaskReceived(props.orderId, received)
  if (task.value) {
    task.value.receivedQty = total
    task.value.status = 'pending put-away'
    task.value.endDate = endIso
    if (!task.value.startDate) task.value.startDate = endIso
  }

  toast.notify({
    variant: complete ? 'success' : 'warning',
    title: complete ? 'Receiving completed, pending put-away' : 'Receiving saved with outstanding items',
  })
}

// ── Formatters ────────────────────────────────────────────────────────────────
function fmt(n: number) { return n.toLocaleString('id-ID') }


// Aging for a linked put-away row (start → end, or start → today while open).
function paAging(pa: { startDate?: string; endDate?: string; status: string }): number {
  return taskAgingDays({
    startDate: pa.startDate,
    endDate: pa.endDate,
    status: pa.status === 'completed' ? 'completed' : 'in progress',
  } as ReceivingTask)
}

function agingLabel(): string {
  if (!task.value) return ''
  // Use local end date/status so the badge updates the moment receiving is saved.
  const d = taskAgingDays({ ...task.value, endDate: localEndDate.value ?? undefined, status: localStatus.value })
  return d > 1 ? `${d} days` : ''
}

// ── Search filter ──────────────────────────────────────────────────────────
const itemSearch = ref('')
const filteredItems = computed(() => {
  const q = itemSearch.value.trim().toLowerCase()
  if (!q) return lineItems.value
  return lineItems.value.filter(
    it => it.productName.toLowerCase().includes(q) || it.skuCode.toLowerCase().includes(q),
  )
})

// ── Progressive pagination ─────────────────────────────────────────────────
const PAGE_SIZE = 10
const shownCount   = ref(PAGE_SIZE)
const loadingMore  = ref(false)
const visibleItems = computed(() => filteredItems.value.slice(0, shownCount.value))
const hasMoreItems = computed(() => shownCount.value < filteredItems.value.length)
const isProgressive = computed(() => filteredItems.value.length > PAGE_SIZE)

function loadMoreItems() {
  if (loadingMore.value || !hasMoreItems.value) return
  loadingMore.value = true
  setTimeout(() => {
    shownCount.value = Math.min(shownCount.value + PAGE_SIZE, lineItems.value.length)
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
onMounted(() => nextTick(setupItemsObserver))
onUnmounted(() => itemsObserver?.disconnect())
watch(itemSearch, () => {
  shownCount.value = PAGE_SIZE
  loadingMore.value = false
  nextTick(() => { if (itemsScrollEl.value) itemsScrollEl.value.scrollTop = 0 })
})
watch(() => props.orderId, () => {
  shownCount.value = PAGE_SIZE
  loadingMore.value = false
  itemSearch.value = ''
  nextTick(() => {
    if (itemsScrollEl.value) itemsScrollEl.value.scrollTop = 0
    setupItemsObserver()
  })
})

// ── Footer divider ─────────────────────────────────────────────────────────
const stageEl = ref<HTMLElement | null>(null)
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
  })
})
onUnmounted(() => {
  stageObserver?.disconnect()
  stageEl.value?.removeEventListener('scroll', checkStageOverflow)
})
watch([() => props.orderId, shownCount], () => nextTick(checkStageOverflow))

// ── Jump-to-task switcher ──────────────────────────────────────────────────
const jumpSearch = ref('')
const jumpResults = computed(() => {
  const all = allTasksFlat()
  const q = jumpSearch.value.trim().toLowerCase()
  const matched = q
    ? all.filter(t => t.taskNo.toLowerCase().includes(q) || t.purchaseNo.toLowerCase().includes(q))
    : all
  return matched.slice(0, 6)
})
function jumpTo(id: string) {
  jumpSearch.value = ''
  router.push(`/receiving/${id}`)
}

// goBack: return to the Barang masuk page on the Receiving tab so the inbound
// stage tabs (On the way / Receiving / Put-away / …) stay visible.
function goBack() {
  router.push('/barang-masuk?tab=Receiving')
}
</script>

<template>
  <div v-if="task && po" class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goBack">Receiving</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ task.taskNo }}</h1>
          <!-- Pulse — only while in progress -->
          <span v-if="isInProgress" class="rcvgd-pulse" aria-label="In progress" />
          <ErpStatusBadge :status="localStatus" badge-for="additionalInformation" size="md" />
          <MpPopover id="rcvgd-jump" use-portal :is-keep-alive="false" placement="bottom-start">
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
                  <input v-model="jumpSearch" class="detail-jump-search" type="text" placeholder="Search task or PO…" />
                </div>
                <div class="detail-jump-list">
                  <button v-for="t in jumpResults" :key="t.id" class="detail-jump-item" @click="jumpTo(t.id)">
                    <span class="detail-jump-item-number">{{ t.taskNo }}</span>
                    <span class="detail-jump-item-customer">{{ t.purchaseNo }}</span>
                  </button>
                  <p v-if="!jumpResults.length" class="detail-jump-empty">No tasks found.</p>
                </div>
              </div>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>

      <!-- Last updated — only while in progress -->
      <div v-if="isInProgress && lastUpdated" class="detail-bar-right">
        <span class="rcvgd-last-updated-label">Last updated</span>
        <span class="rcvgd-last-updated-val">{{ formatDateTime(lastUpdated) }}</span>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">

      <!-- ── Summary grid ── -->
      <section class="rcvgd-summary">
        <div class="content-list-col">
          <ContentList label="Purchase order" :value="po.purchaseNo" />
          <ContentList label="Warehouse" :value="po.warehouseName" />
          <ContentList label="Assignee" :value="task.assignee" />
        </div>
        <div class="content-list-col">
          <ContentList label="SKU scope" :value="task.skuScope" />
          <ContentList label="Start date" :value="task.startDate ? formatDateTime(task.startDate) : '—'" />
          <ContentList label="End date">
            <span class="rcvgd-end-cell">
              <span>{{ localEndDate ? formatDateTime(localEndDate) : '—' }}</span>
              <span v-if="agingLabel()" class="rcvgd-aging">{{ agingLabel() }}</span>
            </span>
          </ContentList>
        </div>
      </section>

      <!-- ── Progress stats ── -->
      <section class="rcvgd-progress">
        <div class="rcvgd-progress-stat">
          <span class="rcvgd-progress-val">{{ task.skuCount }}</span>
          <span class="rcvgd-progress-label">SKUs</span>
        </div>
        <div class="rcvgd-progress-stat">
          <span class="rcvgd-progress-val">{{ fmt(task.purchaseQty) }}</span>
          <span class="rcvgd-progress-label">Purchase qty</span>
        </div>
        <div class="rcvgd-progress-stat">
          <span class="rcvgd-progress-val">{{ fmt(savedReceivedTotal) }}</span>
          <span class="rcvgd-progress-label">Received qty</span>
        </div>
        <div class="rcvgd-progress-stat">
          <span class="rcvgd-progress-val">{{ fmt(outstandingTotal) }}</span>
          <span class="rcvgd-progress-label">Outstanding</span>
        </div>
      </section>

      <!-- ── Line items table ── -->
      <div class="rcvgd-table-wrap">
        <!-- Filter bar — outside the table border -->
        <div class="rcvgd-filter-bar">
          <div class="rcvgd-search-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input v-model="itemSearch" class="rcvgd-search" type="text" placeholder="Search product or SKU…" />
          </div>
        </div>
        <section class="detail-items-section" :class="{ 'detail-items-section--bordered': isProgressive }">
        <div ref="itemsScrollEl" class="detail-items-scroll">
          <table class="detail-items">
            <colgroup>
              <col />
              <col style="width: 150px" />
              <col style="width: 120px" />
              <col v-if="showReceivedCols" style="width: 120px" />
              <col v-if="showReceivedCols" style="width: 120px" />
              <col style="width: 72px" />
            </colgroup>
            <thead>
              <tr>
                <th class="detail-th">Product</th>
                <th class="detail-th">SKU</th>
                <th class="detail-th detail-th--num">Purchase qty</th>
                <th v-if="showReceivedCols" class="detail-th detail-th--num">Received qty</th>
                <th v-if="showReceivedCols" class="detail-th detail-th--num">Outstanding</th>
                <th class="detail-th">Unit</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in visibleItems" :key="item.skuCode" class="detail-item-row">
                <td class="detail-td">
                  <div class="rcvgd-product">
                    <img class="rcvgd-product-thumb" :src="item.image" :alt="item.productName" loading="lazy" width="40" height="40" />
                    <span class="rcvgd-product-name">{{ item.productName }}</span>
                  </div>
                </td>
                <td class="detail-td detail-td--secondary">{{ item.skuCode }}</td>
                <td class="detail-td detail-td--num">{{ fmt(item.expectedQty) }}</td>
                <td v-if="showReceivedCols" class="detail-td detail-td--num">
                  <!-- While in progress the count is still changing — keep it neutral;
                       only colour the final received qty once the task is done. -->
                  <span
                    :class="isInProgress ? '' : (rowReceived(item.skuCode, item.receivedQty) === item.expectedQty ? 'rcvgd-qty--full' : rowReceived(item.skuCode, item.receivedQty) > 0 ? 'rcvgd-qty--partial' : 'rcvgd-qty--zero')"
                  >
                    {{ fmt(rowReceived(item.skuCode, item.receivedQty)) }}
                  </span>
                </td>
                <td v-if="showReceivedCols" class="detail-td detail-td--num">
                  <span v-if="item.expectedQty - rowReceived(item.skuCode, item.receivedQty) > 0" class="rcvgd-outstanding">
                    {{ fmt(item.expectedQty - rowReceived(item.skuCode, item.receivedQty)) }}
                  </span>
                  <span v-else class="rcvgd-qty--full">—</span>
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

      <!-- ── Linked put-away tab (shown once a put-away task exists) ── -->
      <MpTabs v-if="linkedPutAway.length" id="rcvgd-tabs" :default-value="0" variant-color="green" class="rcvgd-tabs">
        <MpTabList>
          <MpTab id="rcvgd-tab-pa" :value="0">Put-away ({{ linkedPutAway.length }})</MpTab>
        </MpTabList>
        <MpTabPanels>
          <MpTabPanel :value="0">
            <div class="rcvgd-linked-wrap">
              <table class="rcvgd-linked">
                <colgroup>
                  <col style="width: 220px" />
                  <col style="width: 180px" />
                  <col style="width: 140px" />
                  <col style="width: 180px" />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th class="detail-th">Number</th>
                    <th class="detail-th">Assignee</th>
                    <th class="detail-th">Status</th>
                    <th class="detail-th">Start date</th>
                    <th class="detail-th">End date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="pa in linkedPutAway" :key="pa.taskNo" class="detail-item-row">
                    <td class="detail-td detail-td--number">
                      <div class="cell-with-action">
                        <span class="rcvgd-linked-num">{{ pa.taskNo }}</span>
                        <button class="row-hover-btn">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                          <span class="row-hover-btn__label">VIEW DETAILS</span>
                        </button>
                      </div>
                    </td>
                    <td class="detail-td">{{ pa.assignee }}</td>
                    <td class="detail-td"><ErpStatusBadge :status="pa.status" /></td>
                    <td class="detail-td">{{ pa.startDate ? formatDateTime(pa.startDate) : '—' }}</td>
                    <td class="detail-td">
                      <span class="rcvgd-end-cell">
                        <span>{{ pa.endDate ? formatDateTime(pa.endDate) : '—' }}</span>
                        <span v-if="paAging(pa) > 1" class="rcvgd-aging">{{ paAging(pa) }} days</span>
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </MpTabPanel>
        </MpTabPanels>
      </MpTabs>

    </div>

    <!-- ── Sticky footer — Print + Start/Continue (open & in-progress only) ── -->
    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <MpPopover id="rcvgd-print" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
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
            <MpPopoverListItem>Print receiving slip</MpPopoverListItem>
            <MpPopoverListItem>Print label</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
      <button v-if="localStatus === 'open'" class="detail-btn detail-btn--primary" @click="openReceiveModal">
        Start receiving
      </button>
      <button v-else-if="localStatus === 'pending put-away'" class="detail-btn detail-btn--primary" @click="createPutAway">
        Create put-away
      </button>
    </footer>

    <!-- ── Receive-items modal — enter received qty per SKU ── -->
    <MpModal
      id="rcvgd-receive"
      :is-open="receiveModalOpen"
      size="xl"
      is-close-on-esc
      :is-keep-alive="false"
      @close="closeReceiveModal"
    >
      <MpModalContent>
        <MpModalHeader>
          Receive items
          <MpModalCloseButton />
        </MpModalHeader>

        <MpModalBody>
          <!-- PO header -->
          <div class="rcvgd-rm-header">
            <ContentList label="Purchase order" :value="po.purchaseNo" />
            <ContentList label="Warehouse" :value="po.warehouseName" />
            <ContentList label="Assignee" :value="task.assignee" />
          </div>

          <!-- Live summary -->
          <div class="rcvgd-rm-summary">
            <div class="rcvgd-rm-stat">
              <span class="rcvgd-rm-stat-val">{{ fmt(purchaseTotal) }}</span>
              <span class="rcvgd-rm-stat-label">Purchase qty</span>
            </div>
            <div class="rcvgd-rm-stat">
              <span class="rcvgd-rm-stat-val">{{ fmt(draftReceivedTotal) }}</span>
              <span class="rcvgd-rm-stat-label">Received qty</span>
            </div>
            <div class="rcvgd-rm-stat">
              <span class="rcvgd-rm-stat-val" :class="{ 'rcvgd-rm-stat-val--warn': draftOutstanding > 0 }">{{ fmt(draftOutstanding) }}</span>
              <span class="rcvgd-rm-stat-label">Outstanding</span>
            </div>
          </div>

          <!-- Filter bar: hint + Receive all (left), search (right) -->
          <div class="rcvgd-rm-bar">
            <div class="rcvgd-rm-bar-left">
              <span class="rcvgd-editing-hint">Enter the received quantity for each item</span>
              <button class="rcvgd-link-btn" @click="receiveAll">Receive all</button>
            </div>
            <div class="rcvgd-search-wrap">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <input v-model="modalSearch" class="rcvgd-search" type="text" placeholder="Search product or SKU…" />
            </div>
          </div>

          <!-- SKU table with editable received qty -->
          <section class="rcvgd-rm-section">
            <div class="rcvgd-rm-scroll">
              <table class="detail-items">
                <colgroup>
                  <col />
                  <col style="width: 120px" />
                  <col style="width: 100px" />
                  <col style="width: 110px" />
                  <col style="width: 92px" />
                  <col style="width: 56px" />
                </colgroup>
                <thead>
                  <tr>
                    <th class="detail-th">Product</th>
                    <th class="detail-th">SKU</th>
                    <th class="detail-th detail-th--num">Purchase qty</th>
                    <th class="detail-th detail-th--num">Received qty</th>
                    <th class="detail-th detail-th--num">Outstanding</th>
                    <th class="detail-th">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in modalItems" :key="item.skuCode" class="detail-item-row">
                    <td class="detail-td">
                      <div class="rcvgd-product">
                        <img class="rcvgd-product-thumb" :src="item.image" :alt="item.productName" loading="lazy" width="40" height="40" />
                        <span class="rcvgd-product-name">{{ item.productName }}</span>
                      </div>
                    </td>
                    <td class="detail-td detail-td--secondary">{{ item.skuCode }}</td>
                    <td class="detail-td detail-td--num">{{ fmt(item.expectedQty) }}</td>
                    <td class="detail-td detail-td--num">
                      <input
                        class="rcvgd-qty-input"
                        type="number" min="0" :max="item.expectedQty"
                        :value="draftQty[item.skuCode] ?? 0"
                        :aria-label="`Received qty for ${item.productName}`"
                        @input="onQtyInput(item.skuCode, item.expectedQty, $event)"
                      />
                    </td>
                    <td class="detail-td detail-td--num">
                      <span v-if="item.expectedQty - (draftQty[item.skuCode] ?? 0) > 0" class="rcvgd-outstanding">
                        {{ fmt(item.expectedQty - (draftQty[item.skuCode] ?? 0)) }}
                      </span>
                      <span v-else class="rcvgd-qty--full">—</span>
                    </td>
                    <td class="detail-td">{{ item.unit }}</td>
                  </tr>
                  <tr v-if="!modalItems.length">
                    <td class="detail-td rcvgd-rm-empty" colspan="6">No products match your search.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </MpModalBody>

        <MpModalFooter>
          <div class="rcvgd-modal-footer">
            <MpButton variant="ghost" is-rounded @click="closeReceiveModal">Cancel</MpButton>
            <MpButton variant="primary" is-rounded @click="endReceiving">Save</MpButton>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- ── Incomplete-receiving confirmation (stacked over the receive modal) ── -->
    <MpModal
      id="rcvgd-incomplete"
      :is-open="showIncompleteConfirm"
      size="sm"
      is-close-on-esc
      :is-keep-alive="false"
      @close="showIncompleteConfirm = false"
    >
      <MpModalContent>
        <MpModalHeader>
          End receiving with outstanding items?
          <MpModalCloseButton />
        </MpModalHeader>
        <MpModalBody>
          {{ fmt(draftOutstanding) }} of {{ fmt(purchaseTotal) }} units are still outstanding
          across {{ shortItemsCount }} {{ shortItemsCount === 1 ? 'item' : 'items' }}.
          This receiving will be saved as incomplete.
        </MpModalBody>
        <MpModalFooter>
          <div class="rcvgd-modal-footer">
            <MpButton variant="ghost" is-rounded @click="showIncompleteConfirm = false">Cancel</MpButton>
            <MpButton variant="primary" is-rounded @click="commitReceiving">End receiving</MpButton>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>
  </div>

  <!-- Not found fallback -->
  <div v-else class="rcvgd-not-found">
    <p>Receiving task not found.</p>
    <button class="detail-breadcrumb" @click="goBack">Back to Receiving</button>
  </div>
</template>

<style scoped>
/* ── Page shell ─────────────────────────────────────────────────────────────── */
.detail-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

/* ── Title bar — canonical pattern ───────────────────────────────────────── */
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; min-width: 0; }
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

/* Pulse dot — animated green ring for in-progress tasks */
@keyframes rcvgd-pulse-ring {
  0%   { transform: scale(0.85); opacity: 1; }
  100% { transform: scale(1.8);  opacity: 0; }
}
.rcvgd-pulse {
  position: relative; display: inline-flex;
  width: var(--mp-sizes-2, 8px); height: var(--mp-sizes-2, 8px);
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-colors-emerald-500, #10b981);
  flex-shrink: 0;
}
.rcvgd-pulse::after {
  content: ''; position: absolute; inset: 0;
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-colors-emerald-500, #10b981);
  animation: rcvgd-pulse-ring 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* Last updated — top-right of title bar, in-progress only */
.detail-bar-right {
  display: flex; flex-direction: column; align-items: flex-end; gap: var(--mp-spacing-0\.5);
  flex-shrink: 0;
}
.rcvgd-last-updated-label {
  font-size: var(--mp-font-sizes-xs, 11px); color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-xs, 14px);
}
.rcvgd-last-updated-val {
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-medium);
  color: var(--mp-text-default); line-height: var(--mp-line-heights-sm);
  font-variant-numeric: tabular-nums;
}

.detail-jump-chevron {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px);
  background: none; border: none; padding: 0; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.detail-jump-chevron:hover { background: var(--mp-background-neutral-hovered); }

/* ── Jump popover ────────────────────────────────────────────────────────── */
.detail-jump { display: flex; flex-direction: column; }
.detail-jump-search-wrap { padding: var(--mp-spacing-3); }
.detail-jump-search {
  width: 100%; box-sizing: border-box; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none;
}
.detail-jump-search:focus { border-color: var(--mp-border-brand-bold, #029861); }
.detail-jump-search::placeholder { color: var(--mp-text-placeholder); }
.detail-jump-list { display: flex; flex-direction: column; }
.detail-jump-item {
  display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); width: 100%; text-align: left;
  background: none; border: none; cursor: pointer; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border-radius: var(--mp-radii-md);
}
.detail-jump-item:hover { background: var(--mp-background-neutral-subtle); }
.detail-jump-item-number { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.detail-jump-item-customer { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-jump-empty { margin: 0; padding: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* ── Stage — canonical pattern ───────────────────────────────────────────── */
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column; gap: var(--mp-spacing-8);
}

/* ── Summary grid ────────────────────────────────────────────────────────── */
.rcvgd-summary {
  display: grid; grid-template-columns: 244px 244px; column-gap: var(--mp-spacing-6); row-gap: 0;
}
.content-list-col { display: flex; flex-direction: column; }

/* End date + aging badge — grey, same as index table */
.rcvgd-end-cell { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.rcvgd-aging {
  display: inline-flex; align-items: center;
  padding: 0 var(--mp-spacing-1\.5); border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral-subtle, #f1f5f9);
  color: var(--mp-text-secondary);
  font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg, 20px); white-space: nowrap;
}

/* ── Progress stats — flat, no card, no dividers ────────────────────────── */
.rcvgd-progress { display: flex; align-items: center; gap: var(--mp-spacing-10); align-self: flex-start; }
.rcvgd-progress-stat { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: var(--mp-sizes-28, 112px); }
.rcvgd-progress-val {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); font-variant-numeric: tabular-nums;
}
.rcvgd-progress-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Table wrapper — filter bar + table, 20px gap ───────────────────────── */
.rcvgd-table-wrap { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }

/* ── Filter bar ─────────────────────────────────────────────────────────── */
.rcvgd-filter-bar { display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-3); }
.rcvgd-editing-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.rcvgd-link-btn {
  background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-medium);
  color: var(--mp-text-link); line-height: var(--mp-line-heights-sm);
}
.rcvgd-link-btn:hover { text-decoration: underline; text-underline-offset: 2px; }
.rcvgd-search-wrap {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary); min-width: 240px;
}
.rcvgd-search {
  flex: 1; border: none; background: transparent; outline: none;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md);
}
.rcvgd-search::placeholder { color: var(--mp-text-placeholder); }

/* ── Line items table — canonical ERP pattern ────────────────────────────── */
.detail-items-section { display: flex; flex-direction: column; flex-shrink: 0; }
.detail-items-section--bordered {
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md); overflow: hidden;
}
.detail-items-section--bordered .detail-items-count {
  border-top: 1px solid var(--mp-border-default); border-bottom: none;
}
.detail-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: hidden; }
.detail-items thead .detail-th { position: sticky; top: 0; z-index: 1; }
.detail-items-sentinel { height: 1px; }
.detail-items-loading { justify-content: center; padding: var(--mp-spacing-3); }
.detail-loading { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); color: var(--mp-text-secondary); }
.detail-items { width: 100%; border-collapse: collapse; table-layout: fixed; }
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
  height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-4) var(--mp-spacing-1\.5) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); vertical-align: middle;
}
.detail-items-section--bordered .detail-item-row:last-child .detail-td { border-bottom: none; }
.detail-td--num { text-align: right; white-space: nowrap; padding: var(--mp-spacing-1\.5) var(--mp-spacing-2) var(--mp-spacing-1\.5) var(--mp-spacing-4); }
.detail-td--product { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.detail-td--secondary { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
/* ── Linked put-away tab ─────────────────────────────────────────────────── */
.rcvgd-tabs { flex-shrink: 0; }
.rcvgd-tabs :deep(.mp-tab--isSelected_true),
.rcvgd-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.rcvgd-tabs :deep(.mp-tab-selected-border) { background-color: var(--mp-border-selected, #029861) !important; }
.rcvgd-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }
.rcvgd-linked-wrap { overflow-x: auto; }
.rcvgd-linked { width: 100%; border-collapse: collapse; }
.rcvgd-linked .detail-th { background: var(--mp-background-neutral-subtle); }
.rcvgd-linked .detail-item-row:last-child .detail-td { border-bottom: none; }
.rcvgd-linked-num { color: var(--mp-text-link); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
/* Number cell — "View details" chip on row hover */
.rcvgd-linked .detail-td--number { position: relative; }
.rcvgd-linked .cell-with-action { display: flex; align-items: center; width: 100%; min-width: 0; }
.rcvgd-linked .row-hover-btn {
  position: absolute; right: var(--mp-spacing-2); top: 50%; transform: translateY(-50%); display: none;
  align-items: center; gap: var(--mp-spacing-1\.5);
  padding: var(--mp-spacing-1) var(--mp-spacing-1\.5);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-sm); cursor: pointer; white-space: nowrap; line-height: 1; color: var(--mp-text-secondary);
}
.rcvgd-linked .row-hover-btn__label {
  font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xs, 12px); color: var(--mp-text-secondary); text-transform: uppercase;
}
.rcvgd-linked .detail-item-row:hover .row-hover-btn { display: flex; }

/* Product cell — photo + name, same pattern as the other detail pages */
.rcvgd-product { display: flex; align-items: center; gap: var(--mp-spacing-3); min-width: 0; }
.rcvgd-product-thumb {
  width: var(--mp-sizes-10, 40px); height: var(--mp-sizes-10, 40px);
  border-radius: var(--mp-radii-md); flex-shrink: 0;
  object-fit: cover; background: var(--mp-background-neutral); border: 1px solid var(--mp-border-subtle);
}
.rcvgd-product-name {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-medium);
  color: var(--mp-text-default); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.detail-items-count {
  display: flex; align-items: center; margin: 0;
  padding: var(--mp-spacing-3) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}

/* Editable received-qty input — compact, right-aligned in the column */
.rcvgd-qty-input {
  width: 100%; max-width: var(--mp-sizes-20, 80px); box-sizing: border-box;
  padding: var(--mp-spacing-1) var(--mp-spacing-2);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  text-align: right; font-variant-numeric: tabular-nums;
  background: var(--mp-background-neutral); outline: none;
}
.rcvgd-qty-input:focus { border-color: var(--mp-border-brand-bold, #029861); }

/* Received qty coloring */
.rcvgd-qty--full    { color: var(--mp-text-success-default, #15803d); font-weight: var(--mp-font-weights-medium); }
.rcvgd-qty--partial { color: var(--mp-text-warning-default, #854d0e); }
.rcvgd-qty--zero    { color: var(--mp-text-placeholder); }
.rcvgd-outstanding  { color: var(--mp-text-warning-default, #854d0e); font-weight: var(--mp-font-weights-medium); }

/* ── Sticky footer — canonical pattern ───────────────────────────────────── */
.detail-footer {
  flex-shrink: 0;
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage);
  border-top: 1px solid transparent;
}
.detail-footer--floating { border-top-color: var(--mp-border-default); }
.detail-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer; border: 1px solid transparent; white-space: nowrap;
}
.detail-btn--secondary {
  background: var(--mp-background-neutral); border-color: var(--mp-border-bold); color: var(--mp-text-secondary);
}
.detail-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }
.detail-btn--primary {
  background: var(--mp-background-brand-bold, #029861); border-color: transparent; color: var(--mp-text-on-color, #fff);
}
.detail-btn--primary:hover { background: var(--mp-background-brand-bold-hovered, #027a4e); }
.detail-btn--ghost {
  background: transparent; border-color: transparent; color: var(--mp-text-secondary);
}
.detail-btn--ghost:hover { background: var(--mp-background-neutral-hovered); }

/* Modal footer — right-aligned actions */
.rcvgd-modal-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }

/* ── Receive-items modal ─────────────────────────────────────────────────── */
.rcvgd-rm-header {
  display: flex; gap: var(--mp-spacing-10);
  padding: 0 0 var(--mp-spacing-4) 0; margin-bottom: var(--mp-spacing-5);
  border-bottom: 1px solid var(--mp-border-default);
}
.rcvgd-rm-header :deep(.content-list) { padding-top: 0; }
.rcvgd-rm-summary {
  display: flex; align-items: center; gap: var(--mp-spacing-10);
  margin-bottom: var(--mp-spacing-5);
}
.rcvgd-rm-stat { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: var(--mp-sizes-24, 96px); }
.rcvgd-rm-stat-val {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); font-variant-numeric: tabular-nums;
}
.rcvgd-rm-stat-val--warn { color: var(--mp-text-warning-default, #854d0e); }
.rcvgd-rm-stat-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.rcvgd-rm-bar {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-5);
}
.rcvgd-rm-bar-left { display: flex; align-items: center; gap: var(--mp-spacing-3); min-width: 0; }
.rcvgd-rm-section {
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-lg); overflow: hidden;
}
.rcvgd-rm-scroll { max-height: 420px; overflow-y: auto; overflow-x: hidden; }
.rcvgd-rm-section .detail-items thead .detail-th { position: sticky; top: 0; z-index: 1; }
.rcvgd-rm-section .detail-item-row:last-child .detail-td { border-bottom: none; }
/* Tighter horizontal padding so all headers fit within the modal width */
.rcvgd-rm-section .detail-th,
.rcvgd-rm-section .detail-td { padding-left: var(--mp-spacing-2); padding-right: var(--mp-spacing-2); }
.rcvgd-rm-section .detail-th--num,
.rcvgd-rm-section .detail-td--num { padding-left: var(--mp-spacing-1); padding-right: var(--mp-spacing-2); }
.rcvgd-rm-empty { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-8) 0; }

/* Not found */
.rcvgd-not-found {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--mp-spacing-4); flex: 1;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
</style>
