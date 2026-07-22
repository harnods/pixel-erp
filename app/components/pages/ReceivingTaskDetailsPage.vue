<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpSpinner,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, MpTooltip, MpIcon,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  css, toast,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import PdfPreviewModal from '~/components/patterns/PdfPreviewModal.vue'
import ViewBatchDrawer from '~/components/patterns/ViewBatchDrawer.vue'
import ViewSerialDrawer from '~/components/patterns/ViewSerialDrawer.vue'
import { findTaskWithPO, getTaskLineItems, allTasksFlat, getPutAwayForTask, type TaskLineItem } from '~/data/receivingTaskDetails'
import {
  taskAgingDays, startReceiving, canCancelReceivingTask, cancelReceivingTask, acknowledgeCanceledReceipt,
  type ReceivingTask,
} from '~/data/receivingTasks'
import { receipts } from '~/data/receipts'
import { getPutAwayLineItems } from '~/data/putAwayTaskDetails'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { productBySku } from '~/data/inventory'
import { formatDate, formatDateLong, formatDateTime, formatDateTimeLong } from '~/utils/date'
import { generateReceivingSlipPdf } from '~/utils/receivingSlipPdf'
import type jsPDF from 'jspdf'

type TaskStatus = 'open' | 'in progress' | 'pending put-away' | 'completed' | 'canceled'

const props = defineProps<{ orderId: string }>()

const router = useRouter()

const entry = computed(() => findTaskWithPO(props.orderId))
const task  = computed(() => entry.value?.task)
const po    = computed(() => entry.value?.po)

const lineItems = computed(() => task.value ? getTaskLineItems(task.value) : [])

// The source receipt — single source of truth for PO-level totals. Purchase/Received
// qty must come from here, not from summing task.receivedQty across po.tasks: a task's
// receivedQty updates live as soon as a draft is saved, before the receiving is ended,
// so summing it would leak still-in-progress numbers into the PO's Received qty.
// receipt.receivedQty only advances via recomputeReceiptStatus(), once a task ends.
const poReceipt = computed(() => receipts.find(r => r.id === po.value?.receiptId))
const poSkuQty = computed(() => poReceipt.value?.skuQty ?? 0)

// ── Local receiving state ───────────────────────────────────────────────────
// Plain mock data isn't deeply reactive, so we mirror the mutable bits in local
// refs that drive the view. Saving updates these (instant re-render) and also the
// underlying task + override store (so a remount after navigation stays in sync).
const localStatus   = ref<TaskStatus>('open')
const localEndDate  = ref<string | null>(null)
const localReceived = ref<Record<string, number>>({})

watch([() => props.orderId, lineItems], () => {
  const map: Record<string, number> = {}
  for (const it of lineItems.value) map[it.skuCode] = it.receivedQty
  localReceived.value = map
  localStatus.value   = (task.value?.status as TaskStatus) ?? 'open'
  localEndDate.value  = task.value?.endDate ?? null
}, { immediate: true })

const isInProgress = computed(() => localStatus.value === 'in progress')
// Open tasks haven't started receiving yet — show only Purchase qty (no Received /
// Outstanding columns, which are meaningless until receiving begins).
const showReceivedCols = computed(() => localStatus.value !== 'open')

// Linked put-away task(s) — the downstream transaction, shown like PRs on a PO.
const linkedPutAway = computed(() => task.value ? getPutAwayForTask({ ...task.value, status: localStatus.value, endDate: localEndDate.value ?? undefined }) : [])

// PO status — the REAL derived receipt status (single source), not a local guess.
const poStatus = computed<string>(() => {
  const r = receipts.find(x => x.id === po.value?.receiptId)
  return r?.status ?? 'open'
})

const purchaseTotal      = computed(() => task.value?.purchaseQty ?? 0)
const savedReceivedTotal = computed(() => Object.values(localReceived.value).reduce((a, b) => a + (b || 0), 0))

// Outstanding is against Expected qty (targetQty), not Purchase qty (expectedQty)
// — targetQty is already net of whatever prior ended tasks on this same receipt
// had received as of THIS task's creation, so subtracting them again here would
// double-count. Floored at 0 — never negative even if more was received than
// this task's own Expected qty (still within Purchase qty).
const outstandingTotal = computed(() =>
  lineItems.value.reduce((sum, it) => {
    const saved = localReceived.value[it.skuCode] ?? 0
    return sum + Math.max(0, it.targetQty - saved)
  }, 0),
)
// Matches the table's own "Expected qty" column (item.targetQty) summed across every line.
const expectedTotal = computed(() => lineItems.value.reduce((sum, it) => sum + it.targetQty, 0))

/** Saved received qty for a page-table row. */
function rowReceived(skuCode: string, fallback: number): number {
  return localReceived.value[skuCode] ?? fallback
}

// ── Batch / serial helpers (same heuristic as picking / put-away / packing) ───
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

// ── View batch / View serial number — read-only, what's actually been recorded
// for this line. Only relevant once receiving has actually started — an 'open'
// task hasn't recorded anything yet, so the action column stays hidden for it.
const viewBatchItem = ref<TaskLineItem | null>(null)
const viewSerialItem = ref<TaskLineItem | null>(null)
function openViewBatch(item: TaskLineItem) { viewBatchItem.value = item }
function openViewSerial(item: TaskLineItem) { viewSerialItem.value = item }

// Derive a "last updated" from startDate + offset based on how much has been received.
// Not a real field — for demo purposes the scan time advances as more items are scanned.
const lastUpdated = computed(() => {
  if (!task.value?.startDate) return null
  const base = new Date(task.value.startDate).getTime()
  const progress = purchaseTotal.value > 0 ? savedReceivedTotal.value / purchaseTotal.value : 0
  const offsetMs = Math.floor(progress * 4 * 60 * 60 * 1000) // up to 4h after start
  return new Date(base + offsetMs).toISOString()
})

function createPutAway() {
  if (!task.value || !po.value) return
  router.push({
    path: '/inbound-delivery/put-away/create',
    query: { warehouseId: po.value.warehouseId, taskId: task.value.id },
  })
}

// ── Receiving actions ───────────────────────────────────────────────────────
function startReceivingAndNavigate() {
  startReceiving(props.orderId)
  router.push(`/receiving/${props.orderId}/receive`)
}

// This task's own PO was canceled while it was in progress — real receiving
// work may already exist, so it's never silently auto-canceled the way an
// open task on the same PO would be. Continue receiving is blocked until the
// operator explicitly acknowledges via the modal below — since this task
// belongs to exactly ONE PO, acknowledging then cancels the task itself
// (nothing left to receive once its one-and-only PO is gone).
const needsCancelAck = computed(() => !!task.value?.needsCancelAck)
const ackCancelOpen = ref(false)
function continueReceiving() {
  if (needsCancelAck.value) { ackCancelOpen.value = true; return }
  router.push(`/receiving/${props.orderId}/receive`)
}
function confirmAcknowledgeCancel() {
  if (!task.value) return
  const taskNo = task.value.taskNo
  acknowledgeCanceledReceipt(task.value.id)
  ackCancelOpen.value = false
  toast.notify({ variant: 'success', title: `${taskNo} canceled — purchase order was canceled`, maxWidth: 'max-content' })
  goBack()
}

// Cancel — only while receiving hasn't finished yet (open/in progress). Once
// pending put-away/completed, receiving is already done and the task becomes a
// permanent record.
const canCancel = computed(() => !!task.value && canCancelReceivingTask({ ...task.value, status: localStatus.value }))
const cancelOpen = ref(false)
function askCancel() { cancelOpen.value = true }
function confirmCancel() {
  if (!task.value) return
  cancelReceivingTask(task.value.id)
  cancelOpen.value = false
  toast.notify({ variant: 'success', title: `${task.value.taskNo} canceled`, maxWidth: 'max-content' })
  goBack()
}

const pdfPreviewOpen = ref(false)
const pdfPreviewDoc = ref<jsPDF | null>(null)
const pdfPreviewFilename = ref('')
async function printReceivingSlip() {
  if (!task.value) return
  pdfPreviewDoc.value = await generateReceivingSlipPdf(task.value, lineItems.value)
  pdfPreviewFilename.value = `Receiving Slip - ${task.value.taskNo}.pdf`
  pdfPreviewOpen.value = true
}

// ── Formatters ────────────────────────────────────────────────────────────────
function fmt(n: number) { return n.toLocaleString('id-ID') }


// Distinct SKUs bundled into a linked put-away task, and how many units of them
// have actually been stored so far (0/— until the put-away is completed).
function paSkuQty(pa: { id: string }): number {
  return getPutAwayLineItems(pa.id).length
}
function paStoredQty(pa: { id: string }): number {
  return getPutAwayLineItems(pa.id).reduce((s, it) => s + it.stored, 0)
}

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

// goBack: return to the Inbound delivery page on the Receiving tab so the inbound
// stage tabs (On the way / Receiving / Put-away / …) stay visible.
function goBack() {
  router.push('/inbound-delivery?tab=Receiving')
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
                  <button v-if="jumpSearch" class="search-clear-btn search-clear-btn--overlay" type="button" aria-label="Clear search" @click="jumpSearch = ''">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                    </svg>
                  </button>
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

      <!-- Purchase order behind this task was canceled while it was already in
           progress — real receiving work may already exist, so it isn't
           silently auto-canceled. Continue receiving is blocked until this is
           acknowledged. -->
      <div v-if="needsCancelAck" class="rcvgd-cancel-banner">
        <svg class="rcvgd-cancel-banner-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 9v4M12 16.5h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.29 2.25h17.78A1.5 1.5 0 0 0 22.18 18L13.71 3.86a1.5 1.5 0 0 0-2.58 0Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
        <span class="rcvgd-cancel-banner-text">
          The purchase order behind this task ({{ task.purchaseNo }}) was canceled. This task can no longer be continued.
        </span>
        <button class="rcvgd-cancel-banner-btn" type="button" @click="ackCancelOpen = true">Acknowledge</button>
      </div>

      <!-- ── Summary grid ── -->
      <section class="rcvgd-summary">
        <div class="content-list-col">
          <ContentList label="Purchase order" :value="po.purchaseNo" />
          <ContentList label="Warehouse">
            <div class="wh-link-wrap">
              <span>{{ po.warehouseName }}</span>
              <button class="row-hover-btn" @click.stop="router.push(`/warehouses/${task.warehouseId}`)">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span class="row-hover-btn__label">VIEW DETAILS</span>
              </button>
            </div>
          </ContentList>
          <ContentList label="Assignee" :value="task.assignee" />
        </div>
        <div class="content-list-col">
          <ContentList label="Start date" :value="task.startDate ? formatDateTimeLong(task.startDate) : '—'" />
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
          <span class="rcvgd-progress-label">SKU qty</span>
          <span class="rcvgd-progress-val">{{ task.skuCount }}</span>
        </div>
        <div class="rcvgd-progress-stat">
          <span class="rcvgd-progress-label">Purchase qty</span>
          <span class="rcvgd-progress-val">{{ fmt(task.purchaseQty) }}</span>
        </div>
        <div class="rcvgd-progress-stat">
          <span class="rcvgd-progress-label">Expected qty</span>
          <span class="rcvgd-progress-val">{{ fmt(expectedTotal) }}</span>
        </div>
        <div class="rcvgd-progress-stat">
          <span class="rcvgd-progress-label">Received qty</span>
          <span class="rcvgd-progress-val">{{ fmt(savedReceivedTotal) }}</span>
        </div>
        <div class="rcvgd-progress-stat">
          <span class="rcvgd-progress-label">Remaining qty to receive</span>
          <span class="rcvgd-progress-val">{{ fmt(outstandingTotal) }}</span>
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
            <input v-model="itemSearch" class="rcvgd-search" type="text" placeholder="Search..." />
            <button v-if="itemSearch" class="search-clear-btn" type="button" aria-label="Clear search" @click="itemSearch = ''">
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
                <th class="detail-th">Product</th>
                <th class="detail-th">SKU</th>
                <th class="detail-th detail-th--num">Purchase qty</th>
                <th class="detail-th detail-th--num">Expected qty</th>
                <th class="detail-th detail-th--num">Received qty</th>
                <th class="detail-th detail-th--num">Remaining qty to receive</th>
                <th class="detail-th">Unit</th>
                <th class="detail-th detail-th--action"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in visibleItems" :key="item.skuCode" class="detail-item-row">
                <td class="detail-td">
                  <ProductCell :name="item.productName" :desc="item.productDesc" :image="item.image" />
                </td>
                <td class="detail-td">{{ item.skuCode }}</td>
                <td class="detail-td detail-td--num">{{ fmt(item.expectedQty) }}</td>
                <td class="detail-td detail-td--num">{{ fmt(item.targetQty) }}</td>
                <td class="detail-td detail-td--num">
                  <span
                    :class="isInProgress ? '' : (rowReceived(item.skuCode, item.receivedQty) >= item.targetQty ? 'rcvgd-qty--full' : rowReceived(item.skuCode, item.receivedQty) > 0 ? 'rcvgd-qty--partial' : 'rcvgd-qty--zero')"
                  >
                    {{ fmt(rowReceived(item.skuCode, item.receivedQty)) }}
                  </span>
                </td>
                <td class="detail-td detail-td--num">
                  <span :class="item.targetQty - rowReceived(item.skuCode, item.receivedQty) > 0 ? 'rcvgd-outstanding' : 'rcvgd-qty--full'">
                    {{ fmt(Math.max(0, item.targetQty - rowReceived(item.skuCode, item.receivedQty))) }}
                  </span>
                </td>
                <td class="detail-td">{{ item.unit }}</td>
                <td class="detail-td detail-td--action">
                  <template v-if="localStatus !== 'open'">
                    <MpTooltip v-if="isBatchTrackedSku(item.skuCode)" :id="`rtd-tt-batch-${item.skuCode}`" label="View batch" placement="top" use-portal>
                      <button class="rtd-view-btn" type="button" aria-label="View batch" @click="openViewBatch(item)">
                        <MpIcon name="competencies" size="md" />
                      </button>
                    </MpTooltip>
                    <MpTooltip v-else-if="isSerialTrackedSku(item.skuCode)" :id="`rtd-tt-serial-${item.skuCode}`" label="View serial number" placement="top" use-portal>
                      <button class="rtd-view-btn" type="button" aria-label="View serial number" @click="openViewSerial(item)">
                        <MpIcon name="competencies" size="md" />
                      </button>
                    </MpTooltip>
                  </template>
                </td>
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

      <!-- ── Linked transactions ── -->
      <MpTabs id="rcvgd-tabs" :default-value="0" variant-color="green" class="rcvgd-tabs">
        <MpTabList>
          <MpTab id="rcvgd-tab-po" :value="0">Linked transactions</MpTab>
          <MpTab v-if="linkedPutAway.length" id="rcvgd-tab-pa" :value="1">Put-away ({{ linkedPutAway.length }})</MpTab>
        </MpTabList>
        <MpTabPanels>

          <MpTabPanel :value="0">
            <h3 class="linked-section-title">Purchase order</h3>
            <div class="rcvgd-linked-wrap">
              <table class="rcvgd-linked">
                <colgroup>
                  <col />
                  <col />
                  <col />
                  <col />
                  <col />
                  <col />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th class="detail-th">Number</th>
                    <th class="detail-th">Warehouse</th>
                    <th class="detail-th">Status</th>
                    <th class="detail-th">Estimated arrival</th>
                    <th class="detail-th">SKU qty</th>
                    <th class="detail-th">Purchase qty</th>
                    <th class="detail-th">Received qty</th>
                  </tr>
                </thead>
                <tbody>
                  <tr class="detail-item-row">
                    <td class="detail-td detail-td--number">
                      <div class="cell-with-action">
                        <span class="rcvgd-linked-num">{{ po.purchaseNo }}</span>
                        <button class="row-hover-btn" @click.stop="router.push(`/inbound-delivery/${po.receiptId}`)">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                          <span class="row-hover-btn__label">VIEW DETAILS</span>
                        </button>
                      </div>
                    </td>
                    <td class="detail-td">{{ po.warehouseName }}</td>
                    <td class="detail-td"><ErpStatusBadge :status="poStatus" /></td>
                    <td class="detail-td">{{ formatDate(po.estimatedArrival) }}</td>
                    <td class="detail-td">{{ fmt(poSkuQty) }}</td>
                    <td class="detail-td">{{ fmt(poReceipt?.purchaseQty ?? 0) }}</td>
                    <td class="detail-td">{{ fmt(poReceipt?.receivedQty ?? 0) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </MpTabPanel>

          <MpTabPanel v-if="linkedPutAway.length" :value="1">
            <h3 class="linked-section-title">Put-away tasks</h3>
            <div class="rcvgd-linked-wrap">
              <table class="rcvgd-linked">
                <colgroup>
                  <col />
                  <col />
                  <col />
                  <col />
                  <col />
                  <col />
                  <col />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th class="detail-th">Number</th>
                    <th class="detail-th">Assignee</th>
                    <th class="detail-th">Status</th>
                    <th class="detail-th">SKU qty</th>
                    <th class="detail-th">Received qty</th>
                    <th class="detail-th">Put-away qty</th>
                    <th class="detail-th">Start date</th>
                    <th class="detail-th">End date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="pa in linkedPutAway" :key="pa.taskNo" class="detail-item-row">
                    <td class="detail-td detail-td--number">
                      <div class="cell-with-action">
                        <span class="rcvgd-linked-num">{{ pa.taskNo }}</span>
                        <button class="row-hover-btn" @click.stop="router.push(`/put-away/${pa.id}`)">
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
                    <td class="detail-td">{{ fmt(paSkuQty(pa)) }}</td>
                    <td class="detail-td">{{ fmt(pa.itemQty) }}</td>
                    <td class="detail-td">{{ fmt(paStoredQty(pa)) }}</td>
                    <td class="detail-td">{{ pa.startDate ? formatDateTime(pa.startDate) : '—' }}</td>
                    <td class="detail-td">
                      <span class="linked-end">
                        <span v-if="pa.endDate">{{ formatDateTime(pa.endDate) }}</span>
                        <span v-else class="linked-end__muted">—</span>
                        <span v-if="paAging(pa) > 1" class="linked-aging">{{ paAging(pa) }} days</span>
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
      <button class="detail-btn detail-btn--secondary" @click="printReceivingSlip">Print receiving slip</button>
      <button v-if="canCancel" class="detail-btn detail-btn--secondary" :class="css({ color: 'var(--mp-text-critical)' })" @click="askCancel">
        Cancel
      </button>
      <button v-if="localStatus === 'open'" class="detail-btn detail-btn--primary" @click="startReceivingAndNavigate">
        Start receiving
      </button>
      <button v-else-if="localStatus === 'in progress'" class="detail-btn detail-btn--primary" @click="continueReceiving">
        Continue receiving
      </button>
      <button v-else-if="localStatus === 'pending put-away'" class="detail-btn detail-btn--primary" @click="createPutAway">
        Create put-away
      </button>
    </footer>

    <!-- ── Cancel confirmation ── -->
    <MpModal id="rcvgd-cancel" :is-open="cancelOpen" size="md"
      is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="cancelOpen = false">
      <MpModalContent>
        <MpModalHeader>Cancel {{ task?.taskNo }}?<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          This receiving task will be canceled and can no longer be continued. This can't be undone.
        </MpModalBody>
        <MpModalFooter>
          <div class="modal-footer-btns">
            <button class="btn-enterprise btn-enterprise--secondary" @click="cancelOpen = false">Keep task</button>
            <button class="btn-enterprise btn-enterprise--danger" @click="confirmCancel">Cancel task</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- ── Acknowledge canceled-PO confirmation ── -->
    <MpModal id="rcvgd-ack-cancel" :is-open="ackCancelOpen" size="md"
      is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="ackCancelOpen = false">
      <MpModalContent>
        <MpModalHeader>Acknowledge canceled purchase order?<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          The purchase order behind this task ({{ task?.purchaseNo }}) was canceled. There's nothing left to
          receive for it — acknowledging will cancel {{ task?.taskNo }} too. This can't be undone.
        </MpModalBody>
        <MpModalFooter>
          <div class="modal-footer-btns">
            <button class="btn-enterprise btn-enterprise--secondary" @click="ackCancelOpen = false">Review</button>
            <button class="btn-enterprise btn-enterprise--danger" @click="confirmAcknowledgeCancel">Acknowledge</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <PdfPreviewModal
      :open="pdfPreviewOpen"
      :doc="pdfPreviewDoc"
      :filename="pdfPreviewFilename"
      title="Receiving slip preview"
      @close="pdfPreviewOpen = false"
    />

  </div>

  <!-- Not found fallback -->
  <div v-else class="rcvgd-not-found">
    <p>Receiving task not found.</p>
    <button class="detail-breadcrumb" @click="goBack">Back to Receiving</button>
  </div>

  <ViewBatchDrawer
    v-if="viewBatchItem"
    :open="true"
    :sku="viewBatchItem.skuCode"
    :warehouse-id="task?.warehouseId ?? ''"
    kind="packing"
    qty-label="Received qty"
    :picked-batches="viewBatchItem.batchLines ?? []"
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
    qty-label="Received qty"
    :counted-total="(viewSerialItem.serialNumbers ?? []).length"
    :picked-serials="(viewSerialItem.serialNumbers ?? []).map(serial => ({ serial, location: '' }))"
    :product-name="viewSerialItem.productName"
    :product-img="viewSerialItem.image"
    @update:open="viewSerialItem = null"
  />
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

/* ── Canceled-PO acknowledge banner ──────────────────────────────────────── */
.rcvgd-cancel-banner {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-warning-subtle, #fffbeb);
  border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.rcvgd-cancel-banner-icon { color: var(--mp-icon-warning, #d97706); flex-shrink: 0; }
.rcvgd-cancel-banner-text { flex: 1; }
.rcvgd-cancel-banner-btn {
  flex-shrink: 0; height: var(--mp-sizes-8, 32px); padding: 0 var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral, #fff); color: var(--mp-text-default);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer;
}
.rcvgd-cancel-banner-btn:hover { background: var(--mp-background-neutral-hovered); }

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
 border-bottom: none;
}
.detail-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: auto; }
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
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); vertical-align: top;
}
.detail-td--num { text-align: right; white-space: nowrap; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }
.detail-td--product { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.detail-td--secondary { color: var(--mp-text-secondary); }
.detail-td--action { text-align: center; white-space: nowrap; }
/* Sticky action column — stays visible when the table scrolls wider than the stage.
   `.detail-items thead .detail-th` (z-index: 1) outranks the plain
   `.detail-th--action` class on specificity alone, so its z-index silently won
   here and tied the header's sticky corner cell with the body's — letting
   scrolled-past rows paint over the header at the top-right intersection.
   Match that selector's specificity (and go higher) so the header corner
   always wins. */
.detail-items thead .detail-th--action { z-index: 3; }
.detail-th--action { position: sticky; right: 0; z-index: 2; }
.detail-td--action { position: sticky; right: 0; z-index: 1; background: var(--mp-background-neutral, #fff); }
.rtd-view-btn { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); border-radius: var(--mp-radii-md); background: none; border: none; cursor: pointer; color: var(--mp-icon-default); }
.rtd-view-btn:hover { background: var(--mp-background-neutral-hovered); }
/* ── Linked transactions tab ─────────────────────────────────────────────── */
.rcvgd-tabs { flex-shrink: 0; }
.rcvgd-tabs :deep(.mp-tab--isSelected_true),
.rcvgd-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.rcvgd-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) { background-color: var(--mp-border-selected, #029861) !important; }
.rcvgd-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }
.linked-section-title { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rcvgd-linked-wrap { overflow-x: auto; }
.rcvgd-linked { width: 100%; border-collapse: collapse; }
.rcvgd-linked .detail-th { background: var(--mp-background-neutral-subtle); }
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
.wh-link-wrap { position: relative; display: inline-flex; align-items: center; }
.wh-link-wrap .row-hover-btn {
  position: absolute; right: var(--mp-spacing-2); top: 50%; transform: translateY(-50%); display: none;
  align-items: center; gap: var(--mp-spacing-1\.5);
  padding: var(--mp-spacing-1) var(--mp-spacing-1\.5);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-sm); cursor: pointer; white-space: nowrap; line-height: 1; color: var(--mp-text-secondary);
}
.wh-link-wrap .row-hover-btn__label {
  font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xs, 12px); color: var(--mp-text-secondary); text-transform: uppercase;
}
.wh-link-wrap:hover .row-hover-btn { display: flex; }
.linked-end { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.linked-end__muted { color: var(--mp-text-secondary); }
.linked-aging { display: inline-flex; align-items: center; padding: 0 var(--mp-spacing-1\.5); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral-subtle); color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-lg, 20px); white-space: nowrap; }

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
.modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); width: 100%; }
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

/* Not found */
.rcvgd-not-found {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--mp-spacing-4); flex: 1;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
</style>
