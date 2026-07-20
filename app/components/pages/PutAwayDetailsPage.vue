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
import ProductCell from '~/components/patterns/ProductCell.vue'
import PdfPreviewModal from '~/components/patterns/PdfPreviewModal.vue'
import ViewBatchDrawer from '~/components/patterns/ViewBatchDrawer.vue'
import ViewSerialDrawer from '~/components/patterns/ViewSerialDrawer.vue'
import { putAwayTasks, startPutAway as startPutAwayTask, canCancelPutAway, cancelPutAway } from '~/data/putAwayTasks'
import { getPutAwayLineItems, allPutAwayTasksFlat, type PutAwayLineItem } from '~/data/putAwayTaskDetails'
import { findTaskWithPO } from '~/data/receivingTaskDetails'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { productBySku } from '~/data/inventory'
import { formatDate, formatDateTime, formatDateTimeLong } from '~/utils/date'
import { generatePutAwaySlipPdf } from '~/utils/putAwaySlipPdf'
import type jsPDF from 'jspdf'

const props = defineProps<{ orderId: string }>()

const router = useRouter()

const task = computed(() => putAwayTasks.find(t => t.id === props.orderId))
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

// ── Footer actions ─────────────────────────────────────────────────────────
function startPutAway() {
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
  cancelPutAway(task.value.id)
  cancelOpen.value = false
  toast.notify({ variant: 'success', title: `${task.value.taskNo} canceled`, maxWidth: 'max-content' })
  goBack()
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
        <button class="detail-breadcrumb" @click="goBack">Put-away</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ task.taskNo }}</h1>
          <ErpStatusBadge :status="task.status" badge-for="additionalInformation" size="md" />
          <MpPopover id="pad-jump" use-portal :is-keep-alive="false" placement="bottom-start">
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
                  <input v-model="jumpSearch" class="detail-jump-search" type="text" placeholder="Cari tugas put-away…" />
                  <button v-if="jumpSearch" class="search-clear-btn search-clear-btn--overlay" type="button" aria-label="Clear search" @click="jumpSearch = ''">
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
                  <p v-if="!jumpResults.length" class="detail-jump-empty">No tasks found.</p>
                </div>
              </div>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">

      <!-- ── Summary grid (2 cols) ── -->
      <section class="pad-summary">
        <div class="content-list-col">
          <ContentList label="Warehouse">
            <div class="wh-link-wrap">
              <span>{{ task.warehouseName }}</span>
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
          <ContentList label="Start date" :value="formatDateTimeLong(task.startDate)" />
          <template v-if="task.status === 'canceled'">
            <ContentList label="Canceled date" :value="formatDateTimeLong(task.canceledDate)" />
            <ContentList label="Reason" :value="task.canceledReason ?? '—'" />
          </template>
          <ContentList v-else label="End date" :value="formatDateTimeLong(task.endDate)" />
        </div>
      </section>

      <!-- ── Progress stats ── -->
      <section class="pad-progress">
        <div class="pad-progress-stat">
          <span class="pad-progress-label">SKU qty</span>
          <span class="pad-progress-val">{{ fmt(lineItems.length) }}</span>
        </div>
        <div class="pad-progress-stat">
          <span class="pad-progress-label">Received qty</span>
          <span class="pad-progress-val">{{ fmt(task.itemQty) }}</span>
        </div>
        <div class="pad-progress-stat">
          <span class="pad-progress-label">Put-away qty</span>
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
            <input v-model="itemSearch" class="pad-search" type="text" placeholder="Search..." />
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
                <col /><col /><col />
                <col v-if="task.status !== 'open'" />
                <col /><col /><col />
              </colgroup>
              <thead>
                <tr>
                  <th class="detail-th">Product</th>
                  <th class="detail-th">SKU</th>
                  <th class="detail-th detail-th--num">Received qty</th>
                  <th v-if="task.status !== 'open'" class="detail-th">Storage location</th>
                  <th class="detail-th detail-th--num">Put-away qty</th>
                  <th class="detail-th">Unit</th>
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
                    <MpTooltip v-if="isBatchTrackedSku(row.skuCode)" :id="`pad-tt-batch-${row.rowId}`" label="View batch" placement="top" use-portal>
                      <button class="pad-view-btn" type="button" aria-label="View batch" @click="openViewBatch(row)">
                        <MpIcon name="competencies" size="md" />
                      </button>
                    </MpTooltip>
                    <MpTooltip v-else-if="isSerialTrackedSku(row.skuCode)" :id="`pad-tt-serial-${row.rowId}`" label="View serial number" placement="top" use-portal>
                      <button class="pad-view-btn" type="button" aria-label="View serial number" @click="openViewSerial(row)">
                        <MpIcon name="competencies" size="md" />
                      </button>
                    </MpTooltip>
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
            Showing {{ visibleItems.length }} of {{ filteredItems.length }} products
          </div>
        </section>
      </div>

      <!-- ── Linked transactions ── -->
      <MpTabs id="pad-tabs" :default-value="0" variant-color="green" class="pad-tabs">
        <MpTabList>
          <MpTab id="pad-tab-linked" value="linked">Purchase receiving ({{ linkedReceivingTasks.length }})</MpTab>
        </MpTabList>
        <MpTabPanels>
          <MpTabPanel value="linked">
            <h3 class="linked-section-title">Purchase receiving tasks</h3>
            <div class="pad-linked-wrap">
              <table class="pad-linked">
                <colgroup>
                  <col /><col /><col /><col /><col /><col />
                </colgroup>
                <thead>
                  <tr>
                    <th class="detail-th">Number</th>
                    <th class="detail-th">Purchase order no.</th>
                    <th class="detail-th">Warehouse</th>
                    <th class="detail-th">Status</th>
                    <th class="detail-th">Start date</th>
                    <th class="detail-th">End date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="rt in linkedReceivingTasks" :key="rt.id" class="detail-item-row">
                    <td class="detail-td detail-td--number">
                      <div class="cell-with-action">
                        <span class="pad-linked-num">{{ rt.taskNo }}</span>
                        <button class="row-hover-btn" @click.stop="router.push(`/receiving/${rt.id}`)">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                          <span class="row-hover-btn__label">VIEW DETAILS</span>
                        </button>
                      </div>
                    </td>
                    <td class="detail-td detail-td--po">
                      <span class="pad-po-no">{{ rt.purchaseOrderNo }}</span>
                      <button v-if="rt.receiptId" class="row-hover-btn" @click.stop="router.push(`/inbound-delivery/${rt.receiptId}`)">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                          <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        <span class="row-hover-btn__label">VIEW DETAILS</span>
                      </button>
                    </td>
                    <td class="detail-td detail-td--wh">
                      <span class="pad-wh-name">{{ rt.warehouseName }}</span>
                      <button class="row-hover-btn" @click.stop="router.push(`/warehouses/${rt.warehouseId}`)">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                          <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        <span class="row-hover-btn__label">VIEW DETAILS</span>
                      </button>
                    </td>
                    <td class="detail-td"><ErpStatusBadge :status="rt.status" /></td>
                    <td class="detail-td">{{ rt.startDate ? formatDateTime(rt.startDate) : '—' }}</td>
                    <td class="detail-td">
                      <span class="linked-end">
                        <span v-if="rt.endDate">{{ formatDateTime(rt.endDate) }}</span>
                        <span v-else class="linked-end__muted">—</span>
                        <span v-if="agingDays(rt.startDate, rt.endDate) > 1" class="linked-aging">{{ agingDays(rt.startDate, rt.endDate) }} days</span>
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
      <button class="detail-btn detail-btn--secondary" @click="printPutAwaySlip">Print put-away slip</button>

      <!-- Completed / canceled: stock already committed to its final location
           (or nothing left to cancel) — no actions left, terminal record. -->
      <template v-if="task.status === 'open' || task.status === 'in progress'">
        <div class="detail-split">
          <button class="detail-btn detail-btn--primary detail-split-main" @click="startPutAway">
            {{ task.status === 'in progress' ? 'Continue put-away' : 'Start put-away' }}
          </button>
          <MpPopover id="pad-actions" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
            <MpPopoverTrigger>
              <button class="detail-btn detail-btn--primary detail-split-chevron" aria-label="More actions">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem :class="css({ color: 'var(--mp-text-critical)' })" @click="askCancel">Cancel</MpPopoverListItem>
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
      title="Put-away slip preview"
      @close="pdfPreviewOpen = false"
    />

    <!-- ── Cancel confirmation ── -->
    <MpModal id="pad-cancel" :is-open="cancelOpen" size="md"
      is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="cancelOpen = false">
      <MpModalContent>
        <MpModalHeader>Cancel {{ task.taskNo }}?<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          This put-away task will be canceled and can no longer be continued. This can't be undone.
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

  </div>

  <!-- ── Not found ── -->
  <div v-else class="pad-not-found">
    <p>Put-away task not found.</p>
  </div>

  <ViewBatchDrawer
    v-if="viewBatchItem"
    :open="true"
    :sku="viewBatchItem.skuCode"
    :warehouse-id="task?.warehouseId ?? ''"
    kind="packing"
    qty-label="Put-away qty"
    planned-qty-label="Received qty"
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
    qty-label="Put-away qty"
    planned-qty-label="Received qty"
    :counted-total="(viewSerialItem.serialAssignments ?? []).length"
    :qty-to-pick="(viewSerialItem.serialAssignments ?? []).length"
    :picked-qty="(viewSerialItem.serialAssignments ?? []).filter(s => s.destLocationId).length"
    :planned-serials="(viewSerialItem.serialAssignments ?? []).map(s => ({ serial: s.serial, location: '' }))"
    :picked-serials="(viewSerialItem.serialAssignments ?? []).filter(s => s.destLocationId).map(s => ({ serial: s.serial, location: s.destLocationId! }))"
    status-planned-label="Received"
    status-picked-label="Assigned"
    :product-name="viewSerialItem.productName"
    :product-img="viewSerialItem.image"
    @update:open="viewSerialItem = null"
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

.cell-with-action { position: relative; display: flex; align-items: center; }
.pad-linked-num { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.detail-td--po { position: relative; }
.pad-po-no { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.detail-item-row:hover .detail-td--po .row-hover-btn { display: flex; }
.detail-td--wh { position: relative; }
.pad-wh-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.detail-item-row:hover .detail-td--wh .row-hover-btn { display: flex; }
.row-hover-btn {
  position: absolute; right: 0; top: 50%; transform: translateY(-50%); display: none;
  align-items: center; gap: var(--mp-spacing-1\.5);
  padding: var(--mp-spacing-1) var(--mp-spacing-1\.5);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-sm); cursor: pointer; white-space: nowrap; line-height: 1; color: var(--mp-text-secondary);
}
.row-hover-btn__label {
  font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xs, 12px); color: var(--mp-text-secondary); text-transform: uppercase;
}
.wh-link-wrap { position: relative; display: inline-flex; align-items: center; }
.wh-link-wrap:hover .row-hover-btn { display: flex; }
:global(.detail-item-row:hover .row-hover-btn) { display: flex; }

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
