<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, MpTooltip, MpIcon,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpSpinner, toast, css,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ReassignTaskModal from '~/components/patterns/ReassignTaskModal.vue'
import { useLineManagerAccess, isReassignableStatus } from '~/composables/useLineManagerAccess'
import ProductCell from '~/components/patterns/ProductCell.vue'
import PdfPreviewModal from '~/components/patterns/PdfPreviewModal.vue'
import ViewBatchDrawer from '~/components/patterns/ViewBatchDrawer.vue'
import ViewSerialDrawer from '~/components/patterns/ViewSerialDrawer.vue'
import {
  putAwayTasks, startPutAway as startPutAwayTask, canCancelPutAway, cancelPutAway,
  acknowledgeCanceledPutAway,
  reassignPutAwayTask,
} from '~/data/putAwayTasks'
import { getPutAwayLineItems, allPutAwayTasksFlat, type PutAwayLineItem } from '~/data/putAwayTaskDetails'
import { findTaskWithPO } from '~/data/receivingTaskDetails'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { productBySku } from '~/data/inventory'
import { formatDate, formatDateTime, formatDateTimeLong } from '~/utils/date'
import { generatePutAwaySlipPdf } from '~/utils/putAwaySlipPdf'
import type jsPDF from 'jspdf'

const props = defineProps<{ orderId: string }>()

const router = useRouter()
const { t } = useLocale()

const task = computed(() => putAwayTasks.find(pt => pt.id === props.orderId))

// Change assignee — manager-only escape hatch, Open / In Progress only.
const { canReassignTasks } = useLineManagerAccess()
const reassignOpen = ref(false)
const canChangeAssignee = computed(() => canReassignTasks.value && isReassignableStatus(task.value?.status))
function applyReassign(assignee: string) {
  if (!reassignPutAwayTask(props.orderId, assignee)) return
  toast.notify({ variant: 'success', title: `${t('Assignee changed to')} ${assignee}`, maxWidth: 'max-content' })
}
const lineItems = computed(() => task.value ? getPutAwayLineItems(props.orderId) : [])

// ── Progress stats ─────────────────────────────────────────────────────────
const storedQty = computed(() => lineItems.value.reduce((a, it) => a + it.stored, 0))

// ── Batch / serial helpers (same heuristic as receiving / picking / packing) ───
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

/** Real destination bin(s) already assigned for this row's batches/serials —
 *  shown directly in the Storage location column so the operator only needs
 *  to open View batch/serial number when they specifically want the batch/
 *  serial identities themselves. */
function rowBins(row: PutAwayLineItem): string[] {
  const bins = new Set<string>()
  if (isBatchTrackedSku(row.skuCode)) {
    for (const b of row.batchLines ?? []) for (const d of b.destLocations ?? []) if (d.qty > 0) bins.add(d.locationId)
  } else if (isSerialTrackedSku(row.skuCode)) {
    for (const s of row.serialAssignments ?? []) if (s.destLocationId) bins.add(s.destLocationId)
  }
  return [...bins]
}

/** Put-away qty PER bin, in the same order as rowBins — a batch (or a serial
 *  run) can be split across more than one destination bin, so the aggregate
 *  row.stored total isn't enough once Storage location itself is a list. */
function rowQtyByBin(row: PutAwayLineItem): Map<string, number> {
  const map = new Map<string, number>()
  if (isBatchTrackedSku(row.skuCode)) {
    for (const b of row.batchLines ?? []) for (const d of b.destLocations ?? []) if (d.qty > 0) map.set(d.locationId, (map.get(d.locationId) ?? 0) + d.qty)
  } else if (isSerialTrackedSku(row.skuCode)) {
    for (const s of row.serialAssignments ?? []) if (s.destLocationId) map.set(s.destLocationId, (map.get(s.destLocationId) ?? 0) + 1)
  }
  return map
}

// ── View batch / View serial number — read-only, which batch/serial is meant to
// be stored (or already was). Unlike Storage location (genuinely undecided until
// put-away happens), batch/serial identity is already a settled fact from
// receiving — available even on an 'open' task, so this stays shown regardless
// of status (only Storage location itself stays gated on task.status !== 'open').
const viewBatchItem = ref<PutAwayLineItem | null>(null)
const viewSerialItem = ref<PutAwayLineItem | null>(null)
function openViewBatch(item: PutAwayLineItem) { viewBatchItem.value = item }
function openViewSerial(item: PutAwayLineItem) { viewSerialItem.value = item }

// ── Aging badge ────────────────────────────────────────────────────────────
const AGING_REF = '2026-06-25'
function agingDays(startDate?: string, endDate?: string): number {
  if (!startDate) return 0
  const start = new Date(startDate).getTime()
  const end = new Date(endDate ?? AGING_REF).getTime()
  return Math.max(0, Math.round((end - start) / 86_400_000)) + 1
}

// ── Linked receiving tasks (for the tab) ──────────────────────────────────
function ensureEndDate(startDate: string | undefined, seed: number): string {
  if (!startDate) {
    const base = new Date(AGING_REF)
    base.setDate(base.getDate() - 7 - (seed % 14))
    return base.toISOString().slice(0, 10)
  }
  const d = new Date(startDate)
  d.setDate(d.getDate() + 1 + (seed % 3))
  return d.toISOString().slice(0, 10)
}

const linkedReceivingTasks = computed(() => {
  if (!task.value) return []
  return task.value.receivingTaskIds.map((id, i) => {
    const entry = findTaskWithPO(id)
    const seed = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    const startDate = entry?.task.startDate
    const rawEnd = entry?.task.endDate
    const endDate = rawEnd ?? ensureEndDate(startDate, seed)
    return {
      id,
      taskNo: task.value!.receivingTaskNos[i],
      purchaseOrderNo: entry?.po.purchaseNo ?? '—',
      receiptId: entry?.po.receiptId ?? null,
      status: 'completed' as const,
      startDate,
      endDate,
      warehouseId: task.value!.warehouseId,
      warehouseName: task.value!.warehouseName,
    }
  })
})

// ── Infinite scroll ────────────────────────────────────────────────────────
const STEP = 10
const visibleCount = ref(STEP)
const itemsScrollEl = ref<HTMLElement | null>(null)
const itemsSentinelEl = ref<HTMLElement | null>(null)
const loadingMore = ref(false)

const itemSearch = ref('')
const filteredItems = computed(() => {
  const q = itemSearch.value.trim().toLowerCase()
  if (!q) return lineItems.value
  return lineItems.value.filter(
    it => it.productName.toLowerCase().includes(q) || it.skuCode.toLowerCase().includes(q),
  )
})
const visibleItems = computed(() => filteredItems.value.slice(0, visibleCount.value))
const isProgressive = computed(() => filteredItems.value.length > STEP)

// A SKU bundled from 2+ receiving tasks is already ONE merged lineItem (see
// getPutAwayLineItems) — put-away no longer tracks which specific receiving
// task a unit came from. A batch/serial-tracked SKU split across 2+
// destination bins gets one row PER BIN, same granularity a plain SKU's
// "Split storage location" already gets on PutAwayItemsPage.vue, instead of
// cramming every bin into one cell as a stacked mini-list. Product/SKU/
// Received qty/Unit/Action merge across every bin-row (only
// Storage location/Put-away qty stay one-per-bin).
type PutAwayRowWithMeta = PutAwayLineItem & {
  rowId: string
  bin: string | null
  binQty: number
  groupIndex: number
  groupSize: number
}
const rowsWithMeta = computed<PutAwayRowWithMeta[]>(() => {
  const result: PutAwayRowWithMeta[] = []
  for (const r of visibleItems.value) {
    const bins = rowBins(r)
    let expanded: Omit<PutAwayRowWithMeta, 'groupIndex' | 'groupSize'>[]
    if (bins.length) {
      const qtyByBin = rowQtyByBin(r)
      expanded = bins.map((bin) => ({ ...r, rowId: `${r.skuCode}::${bin}`, bin, binQty: qtyByBin.get(bin) ?? 0 }))
    } else {
      const plainBin = !isBatchTrackedSku(r.skuCode) && !isSerialTrackedSku(r.skuCode) ? r.binLocation : null
      expanded = [{ ...r, rowId: `${r.skuCode}::single`, bin: plainBin, binQty: r.stored }]
    }
    const groupSize = expanded.length
    expanded.forEach((er, idx) => result.push({ ...er, groupIndex: idx, groupSize }))
  }
  return result
})

let io: IntersectionObserver | null = null
watch([itemsSentinelEl, filteredItems], ([sentinel]) => {
  io?.disconnect()
  if (!sentinel) return
  io = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return
    if (visibleCount.value >= filteredItems.value.length) return
    loadingMore.value = true
    setTimeout(() => {
      visibleCount.value = Math.min(visibleCount.value + STEP, filteredItems.value.length)
      loadingMore.value = false
    }, 400)
  }, { root: itemsScrollEl.value, threshold: 0.1 })
  io.observe(sentinel)
})
watch(itemSearch, () => { visibleCount.value = STEP })
onUnmounted(() => io?.disconnect())

// ── Jump switcher ──────────────────────────────────────────────────────────
const jumpSearch = ref('')
const jumpResults = computed(() => {
  const all = allPutAwayTasksFlat()
  const q = jumpSearch.value.trim().toLowerCase()
  if (!q) return all.slice(0, 5)
  return all.filter(t =>
    t.taskNo.toLowerCase().includes(q) ||
    t.receivingTaskNos.some(n => n.toLowerCase().includes(q)),
  ).slice(0, 5)
})
function jumpTo(id: string) { jumpSearch.value = ''; router.push(`/put-away/${id}`) }

// ── Sticky footer ─────────────────────────────────────────────────────────
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
watch(() => props.orderId, () => nextTick(checkStageOverflow))

// This task's source receiving task's own PO was canceled while the put-away
// was still open/in progress — endPutAway (the only thing that commits real
// stock) never ran, so nothing needs reversing, but real work (Start/Continue
// put-away) may already be underway. Continue/Start is blocked until the
// operator explicitly acknowledges via the modal below — acknowledging then
// cancels this task AND its linked receiving task(s) too.
const needsCancelAck = computed(() => !!task.value?.needsCancelAck)
const ackCancelOpen = ref(false)
function confirmAcknowledgeCancel() {
  if (!task.value) return
  const taskNo = task.value.taskNo
  acknowledgeCanceledPutAway(task.value.id)
  ackCancelOpen.value = false
  toast.notify({ variant: 'success', title: `${taskNo} canceled — purchase order was canceled`, maxWidth: 'max-content' })
}

// ── Footer actions ─────────────────────────────────────────────────────────
function startPutAway() {
  if (needsCancelAck.value) { ackCancelOpen.value = true; return }
  if (task.value?.status === 'open') startPutAwayTask(props.orderId)
  router.push(`/put-away/${props.orderId}/store`)
}
// Cancel — only while not yet completed. endPutAway() is what actually commits
// stock to its final location, so a completed task has already taken real effect.
const canCancel = computed(() => !!task.value && canCancelPutAway(task.value))
const cancelOpen = ref(false)
function askCancel() { cancelOpen.value = true }
function confirmCancel() {
  if (!task.value) return
  // If the PO behind this put-away was canceled (needsCancelAck), its receiving task
  // already reached completed and MUST stay completed — never revert it to pending
  // put-away. A normal manual cancel (PO still live) does revert, so the operator can
  // start a fresh put-away. This lets the operator cancel directly here instead of
  // being forced through the Acknowledge modal.
  cancelPutAway(task.value.id, undefined, needsCancelAck.value ? { revertReceiving: false } : undefined)
  cancelOpen.value = false
  // stay on this detail page — task.status is now 'canceled' and the header shows it
  toast.notify({ variant: 'success', title: `${task.value.taskNo} canceled`, maxWidth: 'max-content' })
}

const pdfPreviewOpen = ref(false)
const pdfPreviewDoc = ref<jsPDF | null>(null)
const pdfPreviewFilename = ref('')
async function printPutAwaySlip() {
  if (!task.value) return
  pdfPreviewDoc.value = await generatePutAwaySlipPdf(task.value, lineItems.value)
  pdfPreviewFilename.value = `Put-Away Slip - ${task.value.taskNo}.pdf`
  pdfPreviewOpen.value = true
}

function goBack() { router.push('/inbound-delivery?tab=Put-away') }
function fmt(n: number) { return n.toLocaleString('id-ID') }
</script>

<template>
  <div v-if="task" class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goBack">{{ t('Put-away') }}</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ task.taskNo }}</h1>
          <ErpStatusBadge :status="task.status" badge-for="additionalInformation" size="md" />
          <MpPopover id="pad-jump" use-portal :is-keep-alive="false" placement="bottom-start">
            <MpPopoverTrigger>
              <button class="detail-jump-chevron" :aria-label="t('Switch task')">
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
                    <span class="detail-jump-item-customer">{{ t.receivingTaskNos[0] }}{{ t.receivingTaskNos.length > 1 ? ` +${t.receivingTaskNos.length - 1} more` : '' }}</span>
                  </button>
                  <p v-if="!jumpResults.length" class="detail-jump-empty">{{ t('No tasks found.') }}</p>
                </div>
              </div>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">

      <!-- The receiving task behind this put-away had its PO canceled while
           this put-away was still open/in progress — real work may already
           exist, so it isn't silently auto-canceled. Acknowledging cancels
           this put-away only; the linked receiving task stays completed (its
           received goods are a permanent record). -->
      <div v-if="needsCancelAck" class="pad-cancel-banner">
        <svg class="pad-cancel-banner-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 9v4M12 16.5h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.29 2.25h17.78A1.5 1.5 0 0 0 22.18 18L13.71 3.86a1.5 1.5 0 0 0-2.58 0Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
        <span class="pad-cancel-banner-text">
          {{ t('The purchase order behind this task\'s receiving was canceled. Nothing has been stored yet — acknowledging will cancel this put-away. Its linked receiving task stays completed (the received goods are a permanent record).') }}
        </span>
        <button class="pad-cancel-banner-btn" type="button" @click="confirmAcknowledgeCancel">{{ t('Acknowledge') }}</button>
      </div>

      <!-- ── Summary grid (2 cols) ── -->
      <section class="pad-summary">
        <div class="content-list-col">
          <ContentList :label="t('Warehouse')">
            <div class="wh-link-wrap">
              <a class="cell-link" @click.stop="router.push(`/warehouses/${task.warehouseId}`)">{{ task.warehouseName }}</a>
            </div>
          </ContentList>
          <ContentList :label="t('Assignee')" :value="task.assignee" />
        </div>
        <div class="content-list-col">
          <ContentList :label="t('Start date')" :value="formatDateTimeLong(task.startDate)" />
          <template v-if="task.status === 'canceled'">
            <ContentList :label="t('Canceled date')" :value="formatDateTimeLong(task.canceledDate)" />
            <ContentList :label="t('Reason')" :value="task.canceledReason ?? '—'" />
            <ContentList :label="t('Canceled by')" :value="task.canceledBy ?? '—'" />
          </template>
          <ContentList v-else :label="t('End date')" :value="formatDateTimeLong(task.endDate)" />
        </div>
      </section>

      <!-- ── Progress stats ── -->
      <section class="pad-progress">
        <div class="pad-progress-stat">
          <span class="pad-progress-label">{{ t('SKU qty') }}</span>
          <span class="pad-progress-val">{{ fmt(lineItems.length) }}</span>
        </div>
        <div class="pad-progress-stat">
          <span class="pad-progress-label">{{ t('Received qty') }}</span>
          <span class="pad-progress-val">{{ fmt(task.itemQty) }}</span>
        </div>
        <div class="pad-progress-stat">
          <span class="pad-progress-label">{{ t('Put-away qty') }}</span>
          <span class="pad-progress-val">{{ fmt(storedQty) }}</span>
        </div>
      </section>

      <!-- ── Items table ── -->
      <div class="pad-table-wrap">
        <div class="pad-filter-bar">
          <div class="pad-search-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input v-model="itemSearch" class="pad-search" type="text" :placeholder="t('Search...')" />
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
                <col /><col /><col />
                <col v-if="task.status !== 'open'" />
                <col /><col /><col />
              </colgroup>
              <thead>
                <tr>
                  <th class="detail-th">{{ t('Product') }}</th>
                  <th class="detail-th">{{ t('SKU') }}</th>
                  <th class="detail-th detail-th--num">{{ t('Received qty') }}</th>
                  <th v-if="task.status !== 'open'" class="detail-th">{{ t('Storage location') }}</th>
                  <th class="detail-th detail-th--num">{{ t('Put-away qty') }}</th>
                  <th class="detail-th">{{ t('Unit') }}</th>
                  <th class="detail-th detail-th--action"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in rowsWithMeta" :key="row.rowId" class="pad-product-row">
                  <td v-if="row.groupIndex === 0" :rowspan="row.groupSize" class="detail-td">
                    <ProductCell :name="row.productName" :desc="row.productDesc" :image="row.image" />
                  </td>
                  <td v-if="row.groupIndex === 0" :rowspan="row.groupSize" class="detail-td">{{ row.skuCode }}</td>
                  <td v-if="row.groupIndex === 0" :rowspan="row.groupSize" class="detail-td detail-td--num">{{ fmt(row.qty) }}</td>
                  <td v-if="task.status !== 'open'" class="detail-td">
                    <span v-if="row.bin" class="pad-bin">{{ row.bin }}</span>
                    <span v-else class="pad-bin">—</span>
                  </td>
                  <td class="detail-td detail-td--num">
                    <span :class="row.binQty === row.qty ? 'pad-qty--full' : row.binQty > 0 ? 'pad-qty--partial' : 'pad-qty--zero'">
                      {{ fmt(row.binQty) }}
                    </span>
                  </td>
                  <td v-if="row.groupIndex === 0" :rowspan="row.groupSize" class="detail-td detail-td--secondary">{{ row.unit }}</td>
                  <td v-if="row.groupIndex === 0" :rowspan="row.groupSize" class="detail-td detail-td--action">
                    <MpTooltip v-if="isBatchTrackedSku(row.skuCode)" :id="`pad-tt-batch-${row.rowId}`" :label="t('View batch')" placement="top" use-portal>
                      <button class="pad-view-btn" type="button" :aria-label="t('View batch')" @click="openViewBatch(row)">
                        <MpIcon name="competencies" size="md" />
                      </button>
                    </MpTooltip>
                    <MpTooltip v-else-if="isSerialTrackedSku(row.skuCode)" :id="`pad-tt-serial-${row.rowId}`" :label="t('View serial number')" placement="top" use-portal>
                      <button class="pad-view-btn" type="button" :aria-label="t('View serial number')" @click="openViewSerial(row)">
                        <MpIcon name="competencies" size="md" />
                      </button>
                    </MpTooltip>
                  </td>
                </tr>
              </tbody>
            </table>
            <div ref="itemsSentinelEl" class="detail-items-sentinel" aria-hidden="true" />
            <div v-if="loadingMore" class="detail-loading detail-items-loading">
              <MpSpinner size="sm" /> {{ t('Loading products…') }}
            </div>
          </div>
          <div class="detail-items-count">
            {{ t('Showing') }} {{ visibleItems.length }} {{ t('of') }} {{ filteredItems.length }} {{ t('products') }}
          </div>
        </section>
      </div>

      <!-- ── Linked transactions ── -->
      <MpTabs id="pad-tabs" :default-value="0" variant-color="green" class="pad-tabs">
        <MpTabList>
          <MpTab id="pad-tab-linked" value="linked">{{ t('Purchase receiving') }} ({{ linkedReceivingTasks.length }})</MpTab>
        </MpTabList>
        <MpTabPanels>
          <MpTabPanel value="linked">
            <h3 class="linked-section-title">{{ t('Purchase receiving tasks') }}</h3>
            <div class="pad-linked-wrap">
              <table class="pad-linked">
                <colgroup>
                  <col /><col /><col /><col /><col /><col />
                </colgroup>
                <thead>
                  <tr>
                    <th class="detail-th">{{ t('Number') }}</th>
                    <th class="detail-th">{{ t('Purchase order no.') }}</th>
                    <th class="detail-th">{{ t('Warehouse') }}</th>
                    <th class="detail-th">{{ t('Status') }}</th>
                    <th class="detail-th">{{ t('Start date') }}</th>
                    <th class="detail-th">{{ t('End date') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="rt in linkedReceivingTasks" :key="rt.id" class="detail-item-row">
                    <td class="detail-td detail-td--number">
                      <a class="cell-link pad-linked-num" @click.stop="router.push(`/receiving/${rt.id}`)">{{ rt.taskNo }}</a>
                    </td>
                    <td class="detail-td detail-td--po">
                      <a v-if="rt.receiptId" class="cell-link pad-po-no" @click.stop="router.push(`/inbound-delivery/${rt.receiptId}`)">{{ rt.purchaseOrderNo }}</a>
                      <span v-else class="pad-po-no">{{ rt.purchaseOrderNo }}</span>
                    </td>
                    <td class="detail-td detail-td--wh">
                      <a class="cell-link pad-wh-name" @click.stop="router.push(`/warehouses/${rt.warehouseId}`)">{{ rt.warehouseName }}</a>
                    </td>
                    <td class="detail-td"><ErpStatusBadge :status="rt.status" /></td>
                    <td class="detail-td">{{ rt.startDate ? formatDateTime(rt.startDate) : '—' }}</td>
                    <td class="detail-td">
                      <span class="linked-end">
                        <span v-if="rt.endDate">{{ formatDateTime(rt.endDate) }}</span>
                        <span v-else class="linked-end__muted">—</span>
                        <span v-if="agingDays(rt.startDate, rt.endDate) > 1" class="linked-aging">{{ agingDays(rt.startDate, rt.endDate) }} {{ t('days') }}</span>
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

    <!-- ── Footer action bar ── -->
    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <!-- Change assignee — the escape hatch when the holder has lost access to the
           company. Manager-only (or an operator with LM access), and only while the
           task is still Open / In Progress. -->
      <button v-if="canChangeAssignee" class="btn-enterprise detail-btn detail-btn--secondary" @click="reassignOpen = true">{{ t('Change assignee') }}</button>
      <button class="detail-btn detail-btn--secondary" @click="printPutAwaySlip">{{ t('Print put-away slip') }}</button>

      <!-- Completed / canceled: stock already committed to its final location
           (or nothing left to cancel) — no actions left, terminal record. -->
      <template v-if="task.status === 'open' || task.status === 'in progress'">
        <div class="detail-split">
          <button class="detail-btn detail-btn--primary detail-split-main" @click="startPutAway">
            {{ task.status === 'in progress' ? t('Continue put-away') : t('Start put-away') }}
          </button>
          <MpPopover id="pad-actions" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
            <MpPopoverTrigger>
              <button class="detail-btn detail-btn--primary detail-split-chevron" :aria-label="t('More actions')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem :class="css({ color: 'var(--mp-text-critical)' })" @click="askCancel">{{ t('Cancel task') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </template>
    </footer>

    <PdfPreviewModal
      :open="pdfPreviewOpen"
      :doc="pdfPreviewDoc"
      :filename="pdfPreviewFilename"
      :title="t('Put-away slip preview')"
      @close="pdfPreviewOpen = false"
    />

    <!-- ── Cancel confirmation ── -->
    <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false" id="pad-cancel" :is-open="cancelOpen" size="md" :is-keep-alive="false" @close="cancelOpen = false">
      <MpModalContent>
        <MpModalHeader>Cancel {{ task.taskNo }}?<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          {{ t('This put-away task will be canceled and can no longer be continued. This can\'t be undone.') }}
        </MpModalBody>
        <MpModalFooter>
          <div class="modal-footer-btns">
            <button class="btn-enterprise btn-enterprise--secondary" @click="cancelOpen = false">{{ t('Keep task') }}</button>
            <button class="btn-enterprise btn-enterprise--danger" @click="confirmCancel">{{ t('Cancel task') }}</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- ── Acknowledge canceled-PO confirmation (reached via Start/Continue
         put-away while blocked) ── -->
    <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false" id="pad-ack-cancel" :is-open="ackCancelOpen" size="md" :is-keep-alive="false" @close="ackCancelOpen = false">
      <MpModalContent>
        <MpModalHeader>{{ t('Acknowledge canceled purchase order?') }}<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          The purchase order behind this put-away's receiving task was canceled. Nothing has been stored yet —
          acknowledging will cancel {{ task?.taskNo }}. Its linked receiving task stays completed (the received goods are a permanent record). This can't be undone.
        </MpModalBody>
        <MpModalFooter>
          <div class="modal-footer-btns">
            <button class="btn-enterprise btn-enterprise--secondary" @click="ackCancelOpen = false">{{ t('Review') }}</button>
            <button class="btn-enterprise btn-enterprise--danger" @click="confirmAcknowledgeCancel">{{ t('Acknowledge') }}</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

  </div>

  <!-- ── Not found ── -->
  <div v-else class="pad-not-found">
    <p>{{ t('Put-away task not found.') }}</p>
  </div>

  <ViewBatchDrawer
    v-if="viewBatchItem"
    :open="true"
    :sku="viewBatchItem.skuCode"
    :warehouse-id="task?.warehouseId ?? ''"
    kind="packing"
    :qty-label="t('Put-away qty')"
    :planned-qty-label="t('Received qty')"
    qty-before-location
    :qty-to-pick="viewBatchItem.qty"
    :picked-qty="viewBatchItem.stored"
    :planned-batches="(viewBatchItem.batchLines ?? []).map(b => ({ batchNo: b.batchNo, expiryDate: b.expiryDate, desc: b.desc, qty: b.qty, unit: b.unit }))"
    :picked-batches="(viewBatchItem.batchLines ?? []).map(b => ({ batchNo: b.batchNo, expiryDate: b.expiryDate, desc: b.desc, qty: (b.destLocations ?? []).reduce((s, d) => s + d.qty, 0), unit: b.unit, destLocations: b.destLocations }))"
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
    :qty-label="t('Put-away qty')"
    :planned-qty-label="t('Received qty')"
    :counted-total="(viewSerialItem.serialAssignments ?? []).length"
    :qty-to-pick="(viewSerialItem.serialAssignments ?? []).length"
    :picked-qty="(viewSerialItem.serialAssignments ?? []).filter(s => s.destLocationId).length"
    :planned-serials="(viewSerialItem.serialAssignments ?? []).map(s => ({ serial: s.serial, location: '' }))"
    :picked-serials="(viewSerialItem.serialAssignments ?? []).filter(s => s.destLocationId).map(s => ({ serial: s.serial, location: s.destLocationId! }))"
    :status-planned-label="t('Received')"
    :status-picked-label="t('Assigned')"
    :product-name="viewSerialItem.productName"
    :product-img="viewSerialItem.image"
    @update:open="viewSerialItem = null"
  />

    <ReassignTaskModal
      v-model:open="reassignOpen"
      :task-no="task?.taskNo ?? ''"
      :current-assignee="task?.assignee ?? ''"
      :warehouse-id="task?.warehouseId ?? ''"
      @reassign="applyReassign"
    />
</template>

<style scoped>
.detail-page  { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.detail-bar {
  height: var(--mp-sizes-18, 72px); flex-shrink: 0;
  background: var(--mp-background-neutral-subtle);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 var(--mp-spacing-6);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb {
  align-self: flex-start;
  background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.detail-title {
  font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); line-height: 32px; letter-spacing: -0.2px; margin: 0;
}

.detail-jump-chevron {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-7); height: var(--mp-sizes-7); border: none; background: none;
  border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-secondary);
}
.detail-jump-chevron:hover { background: var(--mp-background-neutral-hovered); }
.detail-jump { display: flex; flex-direction: column; }
.detail-jump-search-wrap { padding: var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); position: relative; }
.detail-jump-search {
  width: 100%; box-sizing: border-box; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); background: none; outline: none;
  padding-right: 34px;
}
.detail-jump-search:focus { border-color: var(--mp-border-bold, #8c9596); box-shadow: inset 0 0 0 1px var(--mp-border-bold, #8c9596); }
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
.detail-jump-list { display: flex; flex-direction: column; padding: var(--mp-spacing-1) 0; }
.detail-jump-item {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  padding: var(--mp-spacing-2) var(--mp-spacing-3); background: none; border: none; cursor: pointer; text-align: left;
}
.detail-jump-item:hover { background: var(--mp-background-neutral-hovered); }
.detail-jump-item-number { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.detail-jump-item-customer { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-jump-empty { padding: var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-placeholder); margin: 0; }

.detail-stage {
  flex: 1; overflow-y: auto;
  background: var(--mp-background-stage, var(--mp-background-neutral-subtle));
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: var(--mp-spacing-6);
  display: flex; flex-direction: column; gap: var(--mp-spacing-8);
}

.pad-cancel-banner {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-warning-subtle, #fffbeb);
  border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.pad-cancel-banner-icon { color: var(--mp-icon-warning, #d97706); flex-shrink: 0; }
.pad-cancel-banner-text { flex: 1; }
.pad-cancel-banner-btn {
  flex-shrink: 0; height: var(--mp-sizes-8, 32px); padding: 0 var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral, #fff); color: var(--mp-text-default);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer;
}
.pad-cancel-banner-btn:hover { background: var(--mp-background-neutral-hovered); }

.pad-summary {
  display: grid;
  grid-template-columns: minmax(0, 318px) 1fr;
  gap: 0 var(--mp-spacing-6);
}
.content-list-col { display: flex; flex-direction: column; }

.pad-progress { display: flex; gap: var(--mp-spacing-10); }
.pad-progress-stat { display: flex; flex-direction: column; min-width: 112px; }
.pad-progress-val { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pad-progress-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.pad-table-wrap { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.pad-filter-bar { display: flex; align-items: center; justify-content: flex-end; }
.pad-search-wrap {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary); width: 280px;
}
.pad-search {
  flex: 1; border: none; background: transparent; outline: none;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.pad-search::placeholder { color: var(--mp-text-placeholder); }

.detail-items-section { display: flex; flex-direction: column; }
.detail-items-section--bordered { border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md); overflow: hidden; }
.detail-items-scroll { max-height: 484px; overflow-y: auto; }
.detail-items { width: 100%; border-collapse: collapse; table-layout: auto; }

.detail-th {
  height: var(--mp-sizes-7, 28px); background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; color: var(--mp-text-secondary); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.detail-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }

.detail-item-row:hover { background: var(--mp-background-neutral-hovered); }
.detail-td {
  vertical-align: top;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  border-bottom: 1px solid var(--mp-border-default);
}
.detail-td--num { text-align: right; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }
.detail-td--secondary { color: var(--mp-text-default); }
.detail-td--number { position: relative; }
.detail-td--action { text-align: center; white-space: nowrap; }

/* Product/SKU/Unit merge across rows sharing a SKU (2+ bundled receiving tasks) —
   every column gets a left/right border so the split rows read as one grouped
   product, not disconnected listings. Not using `:last-child` to drop the outer
   edge's border: a groupIndex>0 row renders fewer <td>s than the header (merged
   columns are covered by an earlier row's rowspan instead), so its own last
   rendered cell isn't reliably the table's true right edge. Action is always
   rendered (never merged) and always the true rightmost column, so it's the one
   given border-right: none below — not a generic `:last-child` rule. */
.detail-items .detail-th,
.detail-items .detail-td { border-right: 1px solid var(--mp-border-default); }
.detail-items .detail-th--action,
.detail-items .detail-td--action { border-right: none; }
/* Sticky action column — stays visible when the table scrolls wider than the stage.
   See PickingTaskDetailsPage.vue for why the header corner needs a higher z-index
   than the plain `.detail-th--action` class alone would give it. */
.detail-items thead .detail-th--action { z-index: 3; }
.detail-th--action { position: sticky; right: 0; z-index: 2; }
.detail-td--action { position: sticky; right: 0; z-index: 1; background: var(--mp-background-neutral, #fff); }
.pad-view-btn { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); border-radius: var(--mp-radii-md); background: none; border: none; cursor: pointer; color: var(--mp-icon-default); }
.pad-view-btn:hover { background: var(--mp-background-neutral-hovered); }

.detail-items-sentinel { height: 1px; }
.detail-loading.detail-items-loading {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
.detail-items-count {
  padding: var(--mp-spacing-3) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}

.pad-qty--full     { color: var(--mp-text-success); }
.pad-qty--partial  { color: var(--mp-text-warning); }
.pad-qty--zero     { color: var(--mp-text-placeholder); }
.pad-bin { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.pad-tabs :deep(.mp-tab--isSelected_true),
.pad-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.pad-tabs :deep(.mp-tab-selected-border) { background-color: var(--mp-border-selected, #029861) !important; }
.pad-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }

.linked-section-title { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pad-linked-wrap { overflow-x: auto; }
.pad-linked { width: 100%; border-collapse: collapse; }
.linked-end { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.linked-aging { display: inline-flex; align-items: center; padding: 0 var(--mp-spacing-1\.5); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral-subtle); color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-lg, 20px); white-space: nowrap; }

.pad-linked-num { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.detail-td--po { position: relative; }
.pad-po-no { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.detail-td--wh { position: relative; }
.pad-wh-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.wh-link-wrap { position: relative; display: inline-flex; align-items: center; }

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
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-radius: var(--mp-radii-full); font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold); cursor: pointer;
  border: 1px solid transparent; white-space: nowrap;
}
.detail-btn--secondary {
  background: var(--mp-background-neutral); border-color: var(--mp-border-bold);
  color: var(--mp-text-default);
}
.detail-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }
.detail-btn--primary {
  background: var(--mp-colors-emerald-700, #029861);
  border-color: var(--mp-colors-emerald-700, #029861);
  color: var(--mp-text-inverse);
}
.detail-btn--primary:hover {
  background: var(--mp-colors-emerald-800, #186f4a);
  border-color: var(--mp-colors-emerald-800, #186f4a);
}

.detail-split { display: inline-flex; align-items: stretch; }
.detail-split-main { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.detail-split-chevron {
  border-top-left-radius: 0; border-bottom-left-radius: 0;
  padding-left: var(--mp-spacing-2); padding-right: var(--mp-spacing-2);
  border-left: 1px solid rgba(255, 255, 255, 0.3); gap: 0;
}

.pad-not-found {
  display: flex; align-items: center; justify-content: center; height: 100%;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
</style>
