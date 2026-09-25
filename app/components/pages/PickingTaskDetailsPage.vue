<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpSpinner,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, MpIcon, MpTooltip, css,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpButton,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ReassignTaskModal from '~/components/patterns/ReassignTaskModal.vue'
import { useLineManagerAccess, isReassignableStatus } from '~/composables/useLineManagerAccess'
import SourceLabel from '~/components/patterns/SourceLabel.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import ViewBatchDrawer from '~/components/patterns/ViewBatchDrawer.vue'
import ViewSerialDrawer from '~/components/patterns/ViewSerialDrawer.vue'
import PdfPreviewModal from '~/components/patterns/PdfPreviewModal.vue'
import {
  getPickingLineItems, getPickingGroupedItems, allPickingTasksFlat, getPackingForPickingTask,
  type PickLineItem, type PickGroupItem,
} from '~/data/pickingTaskDetails'
import {
  getPickingTask, startPicking, pickingTaskAgingDays, packableOrderIds,
  canCancelPickingTask, cancelPickingTask,
  pendingCanceledOrderIds, acknowledgeCanceledPickingOrders,
  clearPickingRearrangement,
  type PickingTask,
  reassignPickingTask,
} from '~/data/pickingTasks'
import { orderPackedFromPickingTask } from '~/data/packingTasks'
import { outgoingOrders, outgoingStage, OUTGOING_TODAY, isMarketplaceOrder, canReleaseReservedForOrder, releaseReservedForCancelledOrder } from '~/data/outgoing'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { productBySku } from '~/data/inventory'
import { formatDate, formatDateLong, formatDateTime, formatDateTimeLong } from '~/utils/date'
import { generatePickingListPdf } from '~/utils/pickingListPdf'
import { usePrintShippingLabel } from '~/composables/usePrintShippingLabel'
import { toast } from '@mekari/pixel3'
import type jsPDF from 'jspdf'

type TaskStatus = 'open' | 'in progress' | 'partially picked' | 'completed' | 'canceled'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const { t } = useLocale()

const task = computed(() => getPickingTask(props.orderId))
const lineItems = computed(() => task.value ? getPickingLineItems(task.value) : [])
const itemByKey = computed(() => new Map(lineItems.value.map(it => [it.key, it])))
// One row per SKU, merged across every order that contributed it — same fix as
// PickItemsPage.vue: a task bundling the same SKU from 2 orders is one thing for
// the picker to take, not two independent-looking rows.
const groupedItems = computed(() => task.value ? getPickingGroupedItems(task.value) : [])
function rowPickedForGroup(group: PickGroupItem): number {
  return group.memberKeys.reduce((s, k) => {
    const m = itemByKey.value.get(k)
    return s + (m ? rowPicked(k, m.pickedQty) : 0)
  }, 0)
}

// ── "By orders" view — same line items, grouped by the order they belong to
// instead of merged by SKU. Header (order no./customer/source) mirrors
// CreatePackingPage.vue's per-order block exactly. ──────────────────────────
type ViewMode = 'combined' | 'orders'
const viewMode = ref<ViewMode>('combined')
interface PickOrderGroup {
  orderId: string
  salesNo: string
  customer: string
  source: string
  isMarketplace: boolean
  lines: PickLineItem[]
}
const orderGroups = computed<PickOrderGroup[]>(() => {
  const map = new Map<string, PickOrderGroup>()
  for (const it of lineItems.value) {
    let g = map.get(it.orderId)
    if (!g) {
      const o = outgoingOrders.find(x => x.id === it.orderId)
      g = {
        orderId: it.orderId,
        salesNo: it.salesNo,
        customer: o?.customer ?? '',
        source: o?.source ?? '',
        isMarketplace: isMarketplaceOrder(o),
        lines: [],
      }
      map.set(it.orderId, g)
    }
    g.lines.push(it)
  }
  return [...map.values()]
})

// ── Local state mirror (mock data isn't deeply reactive) ─────────────────────
const localStatus = ref<TaskStatus>('open')

// Change assignee — manager-only escape hatch, Open / In Progress only.
const { canReassignTasks } = useLineManagerAccess()
const reassignOpen = ref(false)
const canChangeAssignee = computed(() => canReassignTasks.value && isReassignableStatus(localStatus.value))
function applyReassign(assignee: string) {
  if (!reassignPickingTask(props.orderId, assignee)) return
  toast.notify({ variant: 'success', title: `${t('Assignee changed to')} ${assignee}`, maxWidth: 'max-content' })
}
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

const toPickTotal = computed(() => lineItems.value.reduce((s, it) => s + it.expectedQty, 0))
const pickedTotal = computed(() => Object.values(localPicked.value).reduce((a, b) => a + (b || 0), 0))
const outstandingTotal = computed(() => Math.max(0, toPickTotal.value - pickedTotal.value))

function rowPicked(key: string, fallback: number): number {
  return localPicked.value[key] ?? fallback
}

// ── Batch / serial helpers (same heuristic as receiving / put-away / packing) ───
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

// ── View batch / View serial number — read-only, which batch/SN is reserved for
// this line (to be picked, or already picked). A merged group's members may span
// 2+ orders, so this rebuilds a single synthetic line summing qty and combining
// every member's batch/serial picks (merged the same way a single line's own
// repeat picks already are) before handing it to the read-only drawer. ─────────
const viewBatchItem = ref<PickLineItem | null>(null)
const viewSerialItem = ref<PickLineItem | null>(null)
// getPickingGroupedItems() already merges batch/serial picks across every member
// line — this just fills in the one thing it can't know: live local edits to
// picked qty (rowPickedForGroup), plus the orderId/salesNo fields the drawer
// itself never reads but PickLineItem's type still requires.
function mergedGroupItem(group: PickGroupItem): PickLineItem {
  const first = itemByKey.value.get(group.memberKeys[0] ?? '')
  return {
    key: group.key,
    orderId: first?.orderId ?? '',
    salesNo: first?.salesNo ?? '',
    productName: group.productName,
    productDesc: group.productDesc,
    skuCode: group.skuCode,
    image: group.image,
    binLocation: group.binLocation,
    unit: group.unit,
    expectedQty: group.expectedQty,
    pickedQty: rowPickedForGroup(group),
    batchPicks: group.batchPicks,
    serialPicks: group.serialPicks,
    plannedBatchPicks: group.plannedBatchPicks,
    plannedSerialPicks: group.plannedSerialPicks,
  }
}
function openViewBatch(group: PickGroupItem) { viewBatchItem.value = mergedGroupItem(group) }
function openViewSerial(group: PickGroupItem) { viewSerialItem.value = mergedGroupItem(group) }
// By-orders view — the line is already a single order's own PickLineItem, no
// merge to undo.
function openViewBatchForLine(item: PickLineItem) { viewBatchItem.value = item }
function openViewSerialForLine(item: PickLineItem) { viewSerialItem.value = item }

// Linked sales orders + packing tasks
const linkedOrders = computed(() =>
  (task.value?.salesOrderIds ?? []).map(id => outgoingOrders.find(o => o.id === id)).filter(Boolean) as typeof outgoingOrders,
)
const linkedPacking = computed(() => task.value ? getPackingForPickingTask(task.value.id) : [])

// Print shipping label (source/marketplace or WMS label; D9 duplicate guard).
// Kept clickable per the project no-disabled-buttons rule: when the marketplace
// label hasn't arrived the handler toasts "Waiting for marketplace shipping label".
const { pdfOpen: shipLabelOpen, pdfDoc: shipLabelDoc, pdfFilename: shipLabelName, printShippingLabels } = usePrintShippingLabel()
// Whether there's still an order on THIS picking task without a packing task
// created FROM IT yet — once every bundled order already has one (specifically
// from this task, not just anywhere in the order's history), "Create packing" has
// nothing left to do (that's the "Already packed" toast case — hide the button,
// not just the toast). Scoped per (order, this task) rather than "the order has
// ANY packing task ever" — an order can go through more than one independent
// picking→packing→shipment cycle (partially shipped, then picked again for the
// remainder), and an earlier cycle's packing task must never block a later,
// separate picking task's own still-unpacked remainder from ever being packed.
// When nothing is packable yet for a DIFFERENT reason (e.g. a marketplace order
// not fully picked across all its lists), packableOrderIds is empty rather than
// "all packed" — keep the button so clicking still surfaces the explanatory modal.
const hasPackableOrders = computed(() => {
  const t = task.value
  if (!t) return true
  // Every order on this task cancelled → nothing left to pack, hide the button
  // (don't fall through to the "finish picking" modal for a dead order).
  const activeOrders = t.salesOrderIds.filter(id => {
    const o = outgoingOrders.find(x => x.id === id)
    return o && o.status !== 'canceled'
  })
  if (activeOrders.length === 0) return false
  const ids = packableOrderIds(t)
  if (ids.length === 0) return true
  return ids.some(id => !orderPackedFromPickingTask(id, t.id))
})

const lastUpdated = computed(() => {
  if (!task.value?.startDate) return null
  const base = new Date(task.value.startDate).getTime()
  const progress = toPickTotal.value > 0 ? pickedTotal.value / toPickTotal.value : 0
  const offsetMs = Math.floor(progress * 4 * 60 * 60 * 1000)
  return new Date(base + offsetMs).toISOString()
})

// ── Actions ──────────────────────────────────────────────────────────────────
function startPickingAndNavigate() {
  if (needsRearrangement.value) {
    toast.notify({ variant: 'error', title: t('This task is flagged Needs re-arrangement — a warehouse manager must clear it before picking can start'), maxWidth: 'max-content' })
    return
  }
  if (needsCancelAck.value) { ackModalOpen.value = true; return }
  startPicking(props.orderId)
  router.push(`/picking/${props.orderId}/pick`)
}
// Continue picking an in-progress task — blocked behind the acknowledgment modal
// while a cancelled order still needs acknowledging (the banner's own Acknowledge
// button is the other path). Otherwise straight to the pick screen.
function continuePicking() {
  if (needsRearrangement.value) {
    toast.notify({ variant: 'error', title: t('This task is flagged Needs re-arrangement — a warehouse manager must clear it before picking can start'), maxWidth: 'max-content' })
    return
  }
  if (needsCancelAck.value) { ackModalOpen.value = true; return }
  router.push(`/picking/${props.orderId}/pick`)
}

// Cancel — only while picking hasn't finished yet (open/in progress). Once
// partially picked/completed, picking is already done and the task becomes a
// permanent record.
const canCancel = computed(() => !!task.value && canCancelPickingTask({ ...task.value, status: localStatus.value }))
const cancelOpen = ref(false)
function askCancel() { cancelOpen.value = true }
function confirmCancel() {
  if (!task.value) return
  cancelPickingTask(task.value.id)
  cancelOpen.value = false
  localStatus.value = 'canceled' // stay on this detail page, now showing the canceled state
  toast.notify({ variant: 'success', title: `${task.value.taskNo} canceled`, maxWidth: 'max-content' })
}

// Release reserved — shown as a text link on the Reason line when this task was
// cancelled BECAUSE its order was cancelled and that order still holds reserved
// stock. Once released the link disappears (canReleaseReservedForOrder = false).
const releasableOrderIds = computed(() =>
  (task.value?.salesOrderIds ?? []).filter(id => canReleaseReservedForOrder(id)),
)
const canReleaseReserved = computed(() => releasableOrderIds.value.length > 0)
function releaseReservedFromTask() {
  let released = 0
  for (const id of releasableOrderIds.value) if (releaseReservedForCancelledOrder(id)) released++
  if (released) toast.notify({ variant: 'success', title: t('Reserved stock released'), maxWidth: 'max-content' })
}

// ── Cancelled-order acknowledgment (shared picking task) ──────────────────────
// One order on this shared task was cancelled. The pick list still shows the
// original numbers until the operator acknowledges — which drops that order's lines
// from the pick work while keeping it in the Sales orders list (linked transaction).
const pendingCanceled = computed(() =>
  task.value ? pendingCanceledOrderIds(task.value).map(id => outgoingOrders.find(o => o.id === id)?.salesNo ?? id) : [],
)
const needsCancelAck = computed(() => !!task.value?.needsCancelAck && pendingCanceled.value.length > 0)
function acknowledgeCancel() {
  if (!task.value) return
  acknowledgeCanceledPickingOrders(task.value.id)
  toast.notify({ variant: 'success', title: t('Picking list updated — cancelled order removed'), maxWidth: 'max-content' })
}
// Reached when the operator tries to Start/Continue picking while a cancelled order
// still needs acknowledging — they must acknowledge first, then proceed to the pick screen.
const ackModalOpen = ref(false)
function confirmAckAndContinue() {
  if (!task.value) return
  const wasOpen = task.value.status === 'open'
  acknowledgeCancel()
  ackModalOpen.value = false
  if (wasOpen) startPicking(props.orderId)
  router.push(`/picking/${props.orderId}/pick`)
}

// ── D7 AC#8/#9 — Needs Re-arrangement freeze (outbound qty reduction touched this
// task). Unlike the cancel-ack banner above, the operator can't clear this themselves
// — Start/Continue stays blocked (toast, no modal) until a Warehouse Manager clears
// it via the banner's own action. ─────────────────────────────────────────────
const needsRearrangement = computed(() => !!task.value?.needsRearrangement)
const clearRearrangeModalOpen = ref(false)
function askClearRearrangement() { clearRearrangeModalOpen.value = true }
function confirmClearRearrangement() {
  if (!task.value) return
  clearPickingRearrangement(task.value.id)
  clearRearrangeModalOpen.value = false
  toast.notify({ variant: 'success', title: t('Re-arrangement cleared. This task can be started again'), maxWidth: 'max-content' })
}

const pdfPreviewOpen = ref(false)
const pdfPreviewDoc = ref<jsPDF | null>(null)
const pdfPreviewFilename = ref('')
async function printPickingList() {
  if (!task.value) return
  pdfPreviewDoc.value = await generatePickingListPdf(task.value, groupedItems.value)
  pdfPreviewFilename.value = `Picking List - ${task.value.taskNo}.pdf`
  pdfPreviewOpen.value = true
}
const cantPackModalOpen = ref(false)
// Copy varies by whether EVERY order on this task is a marketplace order (1, or
// several that all happen to be marketplace) vs a MIX of marketplace + non-marketplace
// — same branching as PickItemsPage.vue's marketplaceWarningText, kept for defensive
// consistency even though packableOrderIds() means this modal only ever fires for an
// all-marketplace list in practice (a mixed list would already have a packable order).
const cantPackText = computed(() => {
  const t = task.value
  const total = t?.salesOrderIds.length ?? 0
  const count = (t?.salesOrderIds ?? []).filter(id => isMarketplaceOrder(outgoingOrders.find(o => o.id === id))).length
  const suffix = 'must be picked in full — across every picking list that covers it — before a packing task can be created. Finish picking the remaining items, then come back here to create packing.'
  const suffixPlural = suffix.replace('covers it', 'covers them')
  if (count === total) {
    return count > 1 ? `These sales orders ${suffixPlural}` : `This sales order ${suffix}`
  }
  return count > 1 ? `There are sales orders in this picking list that ${suffixPlural}` : `There is a sales order in this picking list that ${suffix}`
})
function createPacking() {
  // Packability is judged at the ORDER level across all picking lists, and an order
  // that already has a packing task created FROM THIS picking task is excluded —
  // not one from an earlier, independent picking→packing→shipment cycle for the
  // same order. Only block when nothing is left.
  const pickTask = task.value
  if (pickTask) {
    const packable = packableOrderIds(pickTask).filter(id => !orderPackedFromPickingTask(id, pickTask.id))
    if (packable.length === 0) {
      const anyPickComplete = packableOrderIds(pickTask).length > 0
      if (anyPickComplete) {
        toast.notify({
          variant: 'error',
          title: t('Already packed'),
          description: t('These orders already have a packing task.'),
          maxWidth: 'max-content',
        })
      } else {
        // Genuinely nothing to pack yet — a marketplace order isn't all-or-nothing
        // pickable one SKU at a time, so a quiet toast is easy to miss; a modal makes
        // the "why" unmissable before the operator goes hunting for what went wrong.
        cantPackModalOpen.value = true
      }
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
  return d > 1 ? `${d} ${t('days')}` : ''
}
function paAging(p: { startDate?: string; endDate?: string }): number {
  return pickingTaskAgingDays({ startDate: p.startDate, endDate: p.endDate, status: p.endDate ? 'completed' : 'in progress' } as PickingTask)
}

// ── Search + progressive pagination ──────────────────────────────────────────
const itemSearch = ref('')
const filteredItems = computed(() => {
  const q = itemSearch.value.trim().toLowerCase()
  if (!q) return groupedItems.value
  return groupedItems.value.filter(it => it.productName.toLowerCase().includes(q) || it.skuCode.toLowerCase().includes(q))
})
const PAGE_SIZE = 10
const shownCount = ref(PAGE_SIZE)
const loadingMore = ref(false)
const visibleItems = computed(() => filteredItems.value.slice(0, shownCount.value))

// Same search box, applied per-order instead of to the merged rows — an order
// with no matching line drops out entirely rather than showing an empty table.
const filteredOrderGroups = computed(() => {
  const q = itemSearch.value.trim().toLowerCase()
  if (!q) return orderGroups.value
  return orderGroups.value
    .map(g => ({ ...g, lines: g.lines.filter(l => l.productName.toLowerCase().includes(q) || l.skuCode.toLowerCase().includes(q)) }))
    .filter(g => g.lines.length > 0)
})

/** Picked qty for a batch/serial-tracked group, broken down by which bin it was
 *  actually picked from — read from the task's own committed batchPicks/
 *  serialPicks (a batch/serial always sits in exactly ONE fixed bin), so 2+
 *  bins only ever show up here because the group bundles 2+ DIFFERENT
 *  batches/serials that happen to live in different locations. Empty/size-1
 *  means nothing to split.
 *
 *  Gated on rowPickedForGroup(group) > 0 — task.batchPicks/serialPicks are
 *  populated with the RESERVATION plan's own qty from the moment the task is
 *  created (addPickingTask clones them into plannedBatchPicks too), not
 *  zeroed until something's genuinely picked; pickedByKey (which
 *  rowPickedForGroup ultimately reads) is the only real signal of actual
 *  progress. Without this gate, a fresh, untouched task whose PLAN happens to
 *  span 2+ bins would incorrectly split rows and show reservation qty as if
 *  it had already been picked. */
function groupQtyByBin(group: PickGroupItem): Map<string, number> {
  const map = new Map<string, number>()
  if (rowPickedForGroup(group) <= 0) return map
  if (isBatchTrackedSku(group.skuCode)) {
    for (const b of group.batchPicks ?? []) {
      if (b.qty > 0 && b.location) map.set(b.location, (map.get(b.location) ?? 0) + b.qty)
    }
  } else if (isSerialTrackedSku(group.skuCode)) {
    for (const s of group.serialPicks ?? []) {
      if (s.location) map.set(s.location, (map.get(s.location) ?? 0) + 1)
    }
  }
  return map
}

/** Storage location(s) to DISPLAY for a group — distinct from groupQtyByBin
 *  above (which only ever drives row-splitting off REAL picks, unchanged).
 *  Before anything's actually been picked, groupQtyByBin is empty and the
 *  group would otherwise show no location at all — but the reservation plan
 *  already knows where its batches/serials sit, so this falls back to
 *  plannedBatchPicks/plannedSerialPicks to show that instead of a bare "—".
 *  Never triggers row-splitting itself (Qty to pick/Picked qty stay the
 *  group's own totals until something's genuinely picked from 2+ bins). */
function groupLocationsForDisplay(group: PickGroupItem): string[] {
  const bins = new Set<string>()
  if (isBatchTrackedSku(group.skuCode)) {
    const source = group.batchPicks?.length ? group.batchPicks : (group.plannedBatchPicks ?? [])
    for (const b of source) if (b.location) bins.add(b.location)
  } else if (isSerialTrackedSku(group.skuCode)) {
    const source = group.serialPicks?.length ? group.serialPicks : (group.plannedSerialPicks ?? [])
    for (const s of source) if (s.location) bins.add(s.location)
  }
  return [...bins]
}

interface PickDetailRowWithMeta {
  item: PickGroupItem
  bin: string | null
  binQty: number
  groupIndex: number
  groupSize: number
}
/** Expands each visible group into one row per bin actually used (Storage
 *  location/Qty to pick/Picked qty split per bin, Product/SKU/Remaining qty
 *  to pick/Unit/Action merged via groupIndex/groupSize) — or a single row when
 *  there's nothing to split (0 or 1 bin used), matching PickItemsPage.vue's
 *  same pattern during live execution. */
const visibleRowsWithMeta = computed<PickDetailRowWithMeta[]>(() => {
  const result: PickDetailRowWithMeta[] = []
  for (const item of visibleItems.value) {
    const byBin = groupQtyByBin(item)
    if (byBin.size < 2) {
      result.push({ item, bin: null, binQty: 0, groupIndex: 0, groupSize: 1 })
      continue
    }
    const bins = [...byBin.entries()]
    bins.forEach(([bin, qty], idx) => result.push({ item, bin, binQty: qty, groupIndex: idx, groupSize: bins.length }))
  }
  return result
})

// Same bin-split idea as groupQtyByBin/groupLocationsForDisplay above, but for
// a single order's own (un-merged) line — one line only ever has its OWN
// picks to split, no memberKeys to sum, so the picked qty is just the line's
// own (locally-overlaid) pickedQty.
function lineQtyByBin(item: PickLineItem): Map<string, number> {
  const map = new Map<string, number>()
  if (rowPicked(item.key, item.pickedQty) <= 0) return map
  if (isBatchTrackedSku(item.skuCode)) {
    for (const b of item.batchPicks ?? []) {
      if (b.qty > 0 && b.location) map.set(b.location, (map.get(b.location) ?? 0) + b.qty)
    }
  } else if (isSerialTrackedSku(item.skuCode)) {
    for (const s of item.serialPicks ?? []) {
      if (s.location) map.set(s.location, (map.get(s.location) ?? 0) + 1)
    }
  }
  return map
}
function lineLocationsForDisplay(item: PickLineItem): string[] {
  const bins = new Set<string>()
  if (isBatchTrackedSku(item.skuCode)) {
    const source = item.batchPicks?.length ? item.batchPicks : (item.plannedBatchPicks ?? [])
    for (const b of source) if (b.location) bins.add(b.location)
  } else if (isSerialTrackedSku(item.skuCode)) {
    const source = item.serialPicks?.length ? item.serialPicks : (item.plannedSerialPicks ?? [])
    for (const s of source) if (s.location) bins.add(s.location)
  }
  return [...bins]
}
interface PickOrderRowWithMeta {
  item: PickLineItem
  bin: string | null
  binQty: number
  groupIndex: number
  groupSize: number
}
/** Same row-expansion as visibleRowsWithMeta, scoped to one order's own lines. */
function orderRowsWithMeta(group: PickOrderGroup): PickOrderRowWithMeta[] {
  const result: PickOrderRowWithMeta[] = []
  for (const item of group.lines) {
    const byBin = lineQtyByBin(item)
    if (byBin.size < 2) {
      result.push({ item, bin: null, binQty: 0, groupIndex: 0, groupSize: 1 })
      continue
    }
    const bins = [...byBin.entries()]
    bins.forEach(([bin, qty], idx) => result.push({ item, bin, binQty: qty, groupIndex: idx, groupSize: bins.length }))
  }
  return result
}
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
        <MpButton class="detail-breadcrumb" variant="ghost" @click="goBack">{{ t('Picking') }}</MpButton>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ task.taskNo }}</h1>
          <ErpStatusBadge :status="localStatus" badge-for="additionalInformation" size="md" />
          <MpPopover id="pkd-jump" use-portal :is-keep-alive="false" placement="bottom-start">
            <MpPopoverTrigger>
              <MpButton class="detail-jump-chevron" variant="secondary" :aria-label="t('Switch task')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ width: '304px' })">
              <div class="detail-jump">
                <div class="detail-jump-search-wrap">
                  <input v-model="jumpSearch" class="detail-jump-search" type="text" :placeholder="t('Search...')" />
                  <MpButton v-if="jumpSearch" class="search-clear-btn search-clear-btn--overlay" variant="secondary" type="button" :aria-label="t('Clear search')" @click="jumpSearch = ''">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                    </svg>
                  </MpButton>
                </div>
                <div class="detail-jump-list">
                  <MpButton v-for="t in jumpResults" :key="t.id" class="detail-jump-item" variant="secondary" @click="jumpTo(t.id)">
                    <span class="detail-jump-item-number">{{ t.taskNo }}</span>
                    <span class="detail-jump-item-customer">{{ t.salesNos }}</span>
                  </MpButton>
                  <p v-if="!jumpResults.length" class="detail-jump-empty">{{ t('No tasks found.') }}</p>
                </div>
              </div>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>

      <div v-if="isInProgress && lastUpdated" class="detail-bar-right">
        <span class="pkd-last-updated-label">{{ t('Last updated') }}</span>
        <span class="pkd-last-updated-val">{{ formatDateTimeLong(lastUpdated) }}</span>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">

      <!-- A shared order on this picking task was cancelled — the pick list still
           shows the original numbers until the operator acknowledges, which drops that
           order's lines (it stays under Sales orders as a linked transaction). -->
      <div v-if="needsCancelAck" class="pkd-cancel-banner">
        <svg class="pkd-cancel-banner-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 9v4M12 16.5h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.29 2.25h17.78A1.5 1.5 0 0 0 22.18 18L13.71 3.86a1.5 1.5 0 0 0-2.58 0Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
        <span class="pkd-cancel-banner-text">
          {{ pendingCanceled.join(', ') }} {{ pendingCanceled.length > 1 ? 'were' : 'was' }} cancelled. Acknowledge to update this picking list — {{ pendingCanceled.length > 1 ? 'they' : 'it' }} will stay listed under Sales orders.
        </span>
        <MpButton class="pkd-cancel-banner-btn" variant="secondary" type="button" @click="acknowledgeCancel">{{ t('Acknowledge') }}</MpButton>
      </div>

      <!-- D7 AC#8 — an outbound qty reduction touched this task's SKU/qty. It's frozen:
           Start/Continue picking is blocked until a Warehouse Manager reviews and
           clears the re-arrangement below (the operator can't clear it themselves). -->
      <div v-if="needsRearrangement" class="pkd-rearrange-banner">
        <svg class="pkd-rearrange-banner-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 8v5M12 16h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/>
        </svg>
        <span class="pkd-rearrange-banner-text">
          {{ t('This task is flagged Needs re-arrangement — a warehouse manager must clear it before picking can start') }}
        </span>
        <MpButton class="btn-enterprise pkd-rearrange-banner-btn" variant="primary" type="button" @click="askClearRearrangement">{{ t('Clear re-arrangement') }}</MpButton>
      </div>

      <!-- Summary grid -->
      <section class="pkd-summary">
        <div class="content-list-col">
          <ContentList :label="t('Warehouse')">
            <div class="wh-link-wrap">
              <a class="cell-link" @click.stop="router.push(`/warehouses/${task.warehouseId}`)">{{ task.warehouseName }}</a>
            </div>
          </ContentList>
          <ContentList :label="t('Assignee')" :value="task.assignee" />
        </div>
        <div class="content-list-col">
          <ContentList :label="t('Start date')" :value="task.startDate ? formatDateTimeLong(task.startDate) : '—'" />
          <template v-if="localStatus === 'canceled'">
            <ContentList :label="t('Canceled date')" :value="task.canceledDate ? formatDateTimeLong(task.canceledDate) : '—'" />
            <ContentList :label="t('Reason')">
              <span class="pkd-reason">
                <span>{{ task.canceledReason ?? '—' }}</span>
                <MpButton v-if="canReleaseReserved" type="button" class="pkd-reason-release" variant="secondary" @click="releaseReservedFromTask">{{ t('Release reserved') }}</MpButton>
              </span>
            </ContentList>
            <ContentList :label="t('Canceled by')" :value="task.canceledBy ?? '—'" />
          </template>
          <ContentList v-else :label="t('End date')">
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
          <span class="pkd-progress-label">{{ t('SKU qty') }}</span>
          <span class="pkd-progress-val">{{ task.skuQty }}</span>
        </div>
        <div class="pkd-progress-stat">
          <span class="pkd-progress-label">{{ t('Qty to pick') }}</span>
          <span class="pkd-progress-val">{{ fmt(toPickTotal) }}</span>
        </div>
        <div class="pkd-progress-stat">
          <span class="pkd-progress-label">{{ t('Picked qty') }}</span>
          <span class="pkd-progress-val">{{ fmt(pickedTotal) }}</span>
        </div>
        <div class="pkd-progress-stat">
          <span class="pkd-progress-label">{{ t('Remaining qty to pick') }}</span>
          <span class="pkd-progress-val">{{ fmt(outstandingTotal) }}</span>
        </div>
      </section>

      <!-- Line items -->
      <div class="pkd-table-wrap">
        <div class="pkd-filter-bar">
          <div class="detail-loc-toggle">
            <MpButton class="detail-loc-toggle-btn" variant="secondary" :class="{ 'detail-loc-toggle-btn--active': viewMode === 'combined' }" @click="viewMode = 'combined'">{{ t('Combined') }}</MpButton>
            <MpButton class="detail-loc-toggle-btn" variant="secondary" :class="{ 'detail-loc-toggle-btn--active': viewMode === 'orders' }" @click="viewMode = 'orders'">{{ t('By orders') }}</MpButton>
          </div>
          <div class="pkd-search-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input v-model="itemSearch" class="pkd-search" type="text" :placeholder="t('Search...')" />
            <MpButton v-if="itemSearch" class="search-clear-btn" variant="secondary" type="button" :aria-label="t('Clear search')" @click="itemSearch = ''">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
              </svg>
            </MpButton>
          </div>
        </div>
        <section v-if="viewMode === 'combined'" class="detail-items-section" :class="{ 'detail-items-section--bordered': itemsOverflowing }">
          <div ref="itemsScrollEl" class="detail-items-scroll">
            <table class="detail-items">
              <thead>
                <tr>
                  <th class="detail-th">{{ t('Product') }}</th>
                  <th class="detail-th">{{ t('SKU') }}</th>
                  <th class="detail-th">{{ t('Storage location') }}</th>
                  <th class="detail-th detail-th--num">{{ t('Qty to pick') }}</th>
                  <th class="detail-th detail-th--num">{{ t('Picked qty') }}</th>
                  <th class="detail-th detail-th--num">{{ t('Remaining qty to pick') }}</th>
                  <th class="detail-th">{{ t('Unit') }}</th>
                  <th class="detail-th detail-th--action"></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in visibleRowsWithMeta" :key="`${row.item.key}::${row.groupIndex}`"
                  class="detail-item-row"
                >
                  <td v-if="row.groupIndex === 0" :rowspan="row.groupSize" class="detail-td">
                    <ProductCell :name="row.item.productName" :desc="row.item.productDesc" :image="row.item.image" />
                  </td>
                  <td v-if="row.groupIndex === 0" :rowspan="row.groupSize" class="detail-td">{{ row.item.skuCode }}</td>
                  <!-- Storage location: split into one row per bin once the group's picks
                       actually span 2+ different bins; else shows whatever bin(s) are
                       already known (actual picks, or the reservation plan when nothing's
                       been picked yet) — only a genuinely unknown SKU falls back to the
                       "view via drawer" placeholder. Plain SKUs keep the static bin text. -->
                  <td v-if="row.groupSize > 1" class="detail-td detail-td--location">{{ row.bin }}</td>
                  <td
                    v-else-if="isBatchTrackedSku(row.item.skuCode) || isSerialTrackedSku(row.item.skuCode)"
                    class="detail-td detail-td--location"
                    :class="{ 'detail-td--location-summary': groupLocationsForDisplay(row.item).length }"
                  >
                    <div v-if="groupLocationsForDisplay(row.item).length" class="pkd-location-summary-wrap">
                      <span v-for="loc in groupLocationsForDisplay(row.item)" :key="loc" class="pkd-location-summary-item">{{ loc }}</span>
                    </div>
                    <MpTooltip
                      v-else
                      :id="`pkd-tt-loc-${row.item.key}`"
                      :label="isBatchTrackedSku(row.item.skuCode) ? t('View via View batch') : t('View via View serial number')"
                      placement="top"
                      use-portal
                    >
                      <span>—</span>
                    </MpTooltip>
                  </td>
                  <td v-else class="detail-td detail-td--location">
                    <span class="pkd-location-item" :title="row.item.binLocation">{{ row.item.binLocation }}</span>
                  </td>

                  <!-- Qty to pick: static total for the group, unless split per bin — a
                       bin row has no separate plan of its own, so it mirrors that bin's
                       own Picked qty (the only meaningful number once split). -->
                  <td class="detail-td detail-td--num">{{ fmt(row.groupSize > 1 ? row.binQty : row.item.expectedQty) }}</td>
                  <td class="detail-td detail-td--num">
                    <span v-if="row.groupSize > 1">{{ fmt(row.binQty) }}</span>
                    <span v-else :class="isInProgress ? '' : (rowPickedForGroup(row.item) === row.item.expectedQty ? 'pkd-qty--full' : rowPickedForGroup(row.item) > 0 ? 'pkd-qty--partial' : 'pkd-qty--zero')">
                      {{ fmt(rowPickedForGroup(row.item)) }}
                    </span>
                  </td>
                  <td v-if="row.groupIndex === 0" :rowspan="row.groupSize" class="detail-td detail-td--num">
                    <span :class="row.item.expectedQty - rowPickedForGroup(row.item) > 0 ? 'pkd-outstanding' : 'pkd-qty--full'">
                      {{ fmt(row.item.expectedQty - rowPickedForGroup(row.item)) }}
                    </span>
                  </td>
                  <td v-if="row.groupIndex === 0" :rowspan="row.groupSize" class="detail-td">{{ row.item.unit }}</td>
                  <td v-if="row.groupIndex === 0" :rowspan="row.groupSize" class="detail-td detail-td--action">
                    <MpTooltip v-if="isBatchTrackedSku(row.item.skuCode)" :id="`pkd-tt-batch-${row.item.key}`" :label="t('View batch')" placement="top" use-portal>
                      <MpButton class="pkd-view-btn" variant="secondary" type="button" :aria-label="t('View batch')" @click="openViewBatch(row.item)">
                        <MpIcon name="competencies" size="md" />
                      </MpButton>
                    </MpTooltip>
                    <MpTooltip v-else-if="isSerialTrackedSku(row.item.skuCode)" :id="`pkd-tt-serial-${row.item.key}`" :label="t('View serial number')" placement="top" use-portal>
                      <MpButton class="pkd-view-btn" variant="secondary" type="button" :aria-label="t('View serial number')" @click="openViewSerial(row.item)">
                        <MpIcon name="competencies" size="md" />
                      </MpButton>
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
            <span>{{ t('Showing') }} {{ visibleItems.length }} {{ t('of') }} {{ filteredItems.length }} {{ t('products') }}</span>
          </div>
        </section>

        <!-- By orders view — same items, one section + table per contributing
             sales order, header mirrors CreatePackingPage.vue's order grouping
             (order no. / customer / source). -->
        <template v-else>
          <div v-for="group in filteredOrderGroups" :key="group.orderId" class="pkd-order-block">
            <div class="pkd-order-head">
              <span class="pkd-order-no">{{ group.salesNo }}</span>
              <span v-if="group.customer" class="pkd-order-cust">{{ group.customer }}</span>
              <span v-if="group.source" class="pkd-order-source">
                <SourceLabel :source="group.source" />
                <MpTooltip
                  v-if="group.isMarketplace"
                  :id="`pkd-mkt-${group.orderId}`"
                  :label="t('Marketplace orders must be picked in full. Items can\'t be removed.')"
                  placement="top"
                  use-portal
                >
                  <span class="pkd-source-info"><MpIcon name="info" size="sm" /></span>
                </MpTooltip>
              </span>
            </div>
            <section class="detail-items-section">
              <div class="detail-items-scroll">
                <table class="detail-items">
                  <thead>
                    <tr>
                      <th class="detail-th">Product</th>
                      <th class="detail-th">SKU</th>
                      <th class="detail-th">Storage location</th>
                      <th class="detail-th detail-th--num">Qty to pick</th>
                      <th class="detail-th detail-th--num">Picked qty</th>
                      <th class="detail-th detail-th--num">Remaining qty to pick</th>
                      <th class="detail-th">Unit</th>
                      <th class="detail-th detail-th--action"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in orderRowsWithMeta(group)" :key="`${row.item.key}::${row.groupIndex}`"
                      class="detail-item-row"
                    >
                      <td v-if="row.groupIndex === 0" :rowspan="row.groupSize" class="detail-td">
                        <ProductCell :name="row.item.productName" :desc="row.item.productDesc" :image="row.item.image" />
                      </td>
                      <td v-if="row.groupIndex === 0" :rowspan="row.groupSize" class="detail-td">{{ row.item.skuCode }}</td>
                      <td v-if="row.groupSize > 1" class="detail-td detail-td--location">{{ row.bin }}</td>
                      <td
                        v-else-if="isBatchTrackedSku(row.item.skuCode) || isSerialTrackedSku(row.item.skuCode)"
                        class="detail-td detail-td--location"
                        :class="{ 'detail-td--location-summary': lineLocationsForDisplay(row.item).length }"
                      >
                        <div v-if="lineLocationsForDisplay(row.item).length" class="pkd-location-summary-wrap">
                          <span v-for="loc in lineLocationsForDisplay(row.item)" :key="loc" class="pkd-location-summary-item">{{ loc }}</span>
                        </div>
                        <MpTooltip
                          v-else
                          :id="`pkd-tt-loc-order-${row.item.key}`"
                          :label="isBatchTrackedSku(row.item.skuCode) ? t('View via View batch') : t('View via View serial number')"
                          placement="top"
                          use-portal
                        >
                          <span>—</span>
                        </MpTooltip>
                      </td>
                      <td v-else class="detail-td detail-td--location">
                        <span class="pkd-location-item" :title="row.item.binLocation">{{ row.item.binLocation }}</span>
                      </td>

                      <td class="detail-td detail-td--num">{{ fmt(row.groupSize > 1 ? row.binQty : row.item.expectedQty) }}</td>
                      <td class="detail-td detail-td--num">
                        <span v-if="row.groupSize > 1">{{ fmt(row.binQty) }}</span>
                        <span v-else :class="isInProgress ? '' : (rowPicked(row.item.key, row.item.pickedQty) === row.item.expectedQty ? 'pkd-qty--full' : rowPicked(row.item.key, row.item.pickedQty) > 0 ? 'pkd-qty--partial' : 'pkd-qty--zero')">
                          {{ fmt(rowPicked(row.item.key, row.item.pickedQty)) }}
                        </span>
                      </td>
                      <td v-if="row.groupIndex === 0" :rowspan="row.groupSize" class="detail-td detail-td--num">
                        <span :class="row.item.expectedQty - rowPicked(row.item.key, row.item.pickedQty) > 0 ? 'pkd-outstanding' : 'pkd-qty--full'">
                          {{ fmt(row.item.expectedQty - rowPicked(row.item.key, row.item.pickedQty)) }}
                        </span>
                      </td>
                      <td v-if="row.groupIndex === 0" :rowspan="row.groupSize" class="detail-td">{{ row.item.unit }}</td>
                      <td v-if="row.groupIndex === 0" :rowspan="row.groupSize" class="detail-td detail-td--action">
                        <MpTooltip v-if="isBatchTrackedSku(row.item.skuCode)" :id="`pkd-tt-batch-order-${row.item.key}`" :label="t('View batch')" placement="top" use-portal>
                          <MpButton class="pkd-view-btn" variant="secondary" type="button" :aria-label="t('View batch')" @click="openViewBatchForLine(row.item)">
                            <MpIcon name="competencies" size="md" />
                          </MpButton>
                        </MpTooltip>
                        <MpTooltip v-else-if="isSerialTrackedSku(row.item.skuCode)" :id="`pkd-tt-serial-order-${row.item.key}`" :label="t('View serial number')" placement="top" use-portal>
                          <MpButton class="pkd-view-btn" variant="secondary" type="button" :aria-label="t('View serial number')" @click="openViewSerialForLine(row.item)">
                            <MpIcon name="competencies" size="md" />
                          </MpButton>
                        </MpTooltip>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </template>
      </div>

      <!-- Linked transactions -->
      <MpTabs id="pkd-tabs" :default-value="0" variant-color="green" class="pkd-tabs">
        <MpTabList>
          <MpTab id="pkd-tab-so" :value="0">{{ t('Sales orders') }} ({{ linkedOrders.length }})</MpTab>
          <MpTab v-if="linkedPacking.length" id="pkd-tab-pack" :value="1">{{ t('Packing') }} ({{ linkedPacking.length }})</MpTab>
        </MpTabList>
        <MpTabPanels>
          <MpTabPanel :value="0">
            <h3 class="linked-section-title">{{ t('Sales orders') }}</h3>
            <div class="pkd-linked-wrap">
              <table class="pkd-linked">
                <thead>
                  <tr>
                    <th class="detail-th">{{ t('Number') }}</th>
                    <th class="detail-th">{{ t('Customer') }}</th>
                    <th class="detail-th">{{ t('Source') }}</th>
                    <th class="detail-th detail-th--num">{{ t('SKU qty') }}</th>
                    <th class="detail-th detail-th--num">{{ t('Order qty') }}</th>
                    <th class="detail-th">{{ t('Status') }}</th>
                    <th class="detail-th">{{ t('Due date') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="o in linkedOrders" :key="o.id" class="detail-item-row">
                    <td class="detail-td detail-td--number">
                      <a class="cell-link pkd-linked-num" @click.stop="router.push(`/outbound-delivery/${o.id}`)">{{ o.salesNo }}</a>
                    </td>
                    <td class="detail-td">{{ o.customer ?? '—' }}</td>
                    <td class="detail-td"><SourceLabel :source="o.source" /></td>
                    <td class="detail-td detail-td--num">{{ fmt(o.skuQty) }}</td>
                    <td class="detail-td detail-td--num">{{ fmt(o.orderQty) }}</td>
                    <td class="detail-td"><ErpStatusBadge :status="outgoingStage(o)" /></td>
                    <td class="detail-td">
                      <span class="pkd-due">
                        <span>{{ dueDisplay(o) }}</span>
                        <span v-if="expireHours(o) !== null" class="pkd-due-expire">{{ t('Expire in') }} {{ expireHours(o) }} {{ t('hours') }}</span>
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </MpTabPanel>

          <MpTabPanel v-if="linkedPacking.length" :value="1">
            <h3 class="linked-section-title">{{ t('Packing tasks') }}</h3>
            <div class="pkd-linked-wrap">
              <table class="pkd-linked">
                <thead>
                  <tr>
                    <th class="detail-th">{{ t('Number') }}</th>
                    <th class="detail-th">{{ t('Sales order') }}</th>
                    <th class="detail-th">{{ t('Assignee') }}</th>
                    <th class="detail-th">{{ t('Status') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="pk in linkedPacking" :key="pk.id" class="detail-item-row">
                    <td class="detail-td detail-td--number">
                      <a class="cell-link pkd-linked-num" @click.stop="router.push(`/packing/${pk.id}`)">{{ pk.taskNo }}</a>
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
      <!-- Change assignee — the escape hatch when the holder has lost access to the
           company. Manager-only (or an operator with LM access), and only while the
           task is still Open / In Progress. -->
      <MpButton v-if="canChangeAssignee" class="btn-enterprise detail-btn detail-btn--secondary" variant="secondary" @click="reassignOpen = true">{{ t('Change assignee') }}</MpButton>
      <MpButton class="detail-btn detail-btn--secondary" variant="secondary" @click="printPickingList">{{ t('Print picking list') }}</MpButton>
      <MpButton class="detail-btn detail-btn--secondary" variant="secondary" @click="printShippingLabels(linkedOrders)">{{ t('Print shipping label') }}</MpButton>
      <!-- Cancel task lives in the primary action's split-button dropdown, never as a
           standalone "Cancel" footer button. -->
      <template v-if="localStatus === 'open'">
        <div v-if="canCancel" class="detail-split-btn">
          <MpTooltip v-if="needsRearrangement" id="pkd-start-tt-split" :label="t('Cannot start picking. Clear the re-arrangement first.')" placement="top" use-portal>
            <MpButton class="btn-enterprise detail-btn detail-btn--primary detail-btn--disabled detail-split-btn__main" variant="primary" is-disabled>{{ t('Start picking') }}</MpButton>
          </MpTooltip>
          <MpButton v-else class="btn-enterprise detail-btn detail-btn--primary detail-split-btn__main" variant="primary" @click="startPickingAndNavigate">{{ t('Start picking') }}</MpButton>
          <MpPopover id="pkd-actions-open" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
            <MpPopoverTrigger>
              <MpButton class="detail-btn detail-btn--primary detail-split-btn__chevron" variant="primary" :aria-label="t('More actions')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList><MpPopoverListItem :class="css({ color: 'var(--mp-text-critical)' })" @click="askCancel">{{ t('Cancel task') }}</MpPopoverListItem></MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
        <MpTooltip v-else-if="needsRearrangement" id="pkd-start-tt-solo" :label="t('Cannot start picking. Clear the re-arrangement first.')" placement="top" use-portal>
          <MpButton class="btn-enterprise detail-btn detail-btn--primary detail-btn--disabled" variant="primary" is-disabled>{{ t('Start picking') }}</MpButton>
        </MpTooltip>
        <MpButton v-else class="btn-enterprise detail-btn detail-btn--primary" variant="primary" @click="startPickingAndNavigate">{{ t('Start picking') }}</MpButton>
      </template>
      <template v-else-if="localStatus === 'in progress'">
        <div v-if="canCancel" class="detail-split-btn">
          <MpButton class="detail-btn detail-btn--primary detail-split-btn__main" variant="primary" @click="continuePicking">{{ t('Continue picking') }}</MpButton>
          <MpPopover id="pkd-actions-prog" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
            <MpPopoverTrigger>
              <MpButton class="detail-btn detail-btn--primary detail-split-btn__chevron" variant="primary" :aria-label="t('More actions')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList><MpPopoverListItem :class="css({ color: 'var(--mp-text-critical)' })" @click="askCancel">{{ t('Cancel task') }}</MpPopoverListItem></MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
        <MpButton v-else class="detail-btn detail-btn--primary" variant="primary" @click="continuePicking">{{ t('Continue picking') }}</MpButton>
      </template>
      <MpButton
        v-else-if="(localStatus === 'completed' || localStatus === 'partially picked') && hasPackableOrders"
        class="detail-btn detail-btn--primary"
        variant="primary"
        @click="createPacking"
      >
        {{ t('Create packing') }}
      </MpButton>
    </footer>

    <!-- ── Cancel confirmation ── -->
    <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false" id="pkd-cancel" :is-open="cancelOpen" size="md" :is-keep-alive="false" @close="cancelOpen = false">
      <MpModalContent>
        <MpModalHeader>{{ t('Cancel') }} {{ task?.taskNo }}?<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          {{ t('This picking task will be canceled and can no longer be continued. This can\'t be undone.') }}
        </MpModalBody>
        <MpModalFooter>
          <div class="modal-footer-btns">
            <MpButton class="btn-enterprise btn-enterprise--secondary" variant="secondary" @click="cancelOpen = false">{{ t('Keep task') }}</MpButton>
            <MpButton class="btn-enterprise btn-enterprise--danger" variant="danger" @click="confirmCancel">{{ t('Cancel task') }}</MpButton>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- ── Acknowledge cancelled order before continuing picking ── -->
    <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false" id="pkd-ack-cancel" :is-open="ackModalOpen" size="md" :is-keep-alive="false" @close="ackModalOpen = false">
      <MpModalContent>
        <MpModalHeader>{{ t('Acknowledge cancelled order?') }}<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          {{ pendingCanceled.join(', ') }} {{ pendingCanceled.length > 1 ? 'were' : 'was' }} cancelled.
          Acknowledging removes {{ pendingCanceled.length > 1 ? 'their' : 'its' }} lines from this
          picking list (the order{{ pendingCanceled.length > 1 ? 's' : '' }} stay{{ pendingCanceled.length > 1 ? '' : 's' }}
          listed under Sales orders) before you continue picking.
        </MpModalBody>
        <MpModalFooter>
          <div class="modal-footer-btns">
            <MpButton class="btn-enterprise btn-enterprise--secondary" variant="secondary" @click="ackModalOpen = false">{{ t('Review') }}</MpButton>
            <MpButton class="btn-enterprise btn-enterprise--primary" variant="primary" @click="confirmAckAndContinue">{{ t('Acknowledge & continue') }}</MpButton>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- ── Warehouse Manager clears the D7 re-arrangement freeze (AC#9) ── -->
    <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false" id="pkd-clear-rearrange" :is-open="clearRearrangeModalOpen" size="md" :is-keep-alive="false" @close="clearRearrangeModalOpen = false">
      <MpModalContent>
        <MpModalHeader>{{ t('Clear re-arrangement?') }}<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          {{ t('Review the remaining SKU and quantity above before clearing. Once cleared, this task returns to Open and pickers can start it again.') }}
        </MpModalBody>
        <MpModalFooter>
          <div class="modal-footer-btns">
            <MpButton class="btn-enterprise btn-enterprise--secondary" variant="secondary" @click="clearRearrangeModalOpen = false">{{ t('Review') }}</MpButton>
            <MpButton class="btn-enterprise btn-enterprise--primary" variant="primary" @click="confirmClearRearrangement">{{ t('Clear re-arrangement') }}</MpButton>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

  </div>

  <!-- Not found -->
  <div v-else class="pkd-not-found">
    <p>{{ t('Picking task not found.') }}</p>
    <MpButton class="detail-breadcrumb" variant="ghost" @click="goBack">{{ t('Back to Picking') }}</MpButton>
  </div>

  <ViewBatchDrawer
    v-if="viewBatchItem"
    :open="true"
    :sku="viewBatchItem.skuCode"
    :warehouse-id="task?.warehouseId ?? ''"
    kind="packing"
    :qty-to-pick="viewBatchItem.expectedQty"
    :picked-qty="rowPicked(viewBatchItem.key, viewBatchItem.pickedQty)"
    :picked-batches="viewBatchItem.batchPicks ?? []"
    :planned-batches="viewBatchItem.plannedBatchPicks ?? []"
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
    :qty-to-pick="viewSerialItem.expectedQty"
    :picked-qty="rowPicked(viewSerialItem.key, viewSerialItem.pickedQty)"
    :counted-total="(viewSerialItem.serialPicks ?? []).length"
    :picked-serials="viewSerialItem.serialPicks ?? []"
    :planned-serials="viewSerialItem.plannedSerialPicks ?? []"
    :task-finished="task?.status === 'completed' || task?.status === 'partially picked'"
    :product-name="viewSerialItem.productName"
    :product-img="viewSerialItem.image"
    @update:open="viewSerialItem = null"
  />

  <PdfPreviewModal
    :open="pdfPreviewOpen"
    :doc="pdfPreviewDoc"
    :filename="pdfPreviewFilename"
    :title="t('Picking list preview')"
    @close="pdfPreviewOpen = false"
  />

  <PdfPreviewModal
    :open="shipLabelOpen"
    :doc="shipLabelDoc"
    :filename="shipLabelName"
    :title="t('Shipping label preview')"
    @close="shipLabelOpen = false"
  />

  <!-- Nothing can be packed yet — marketplace order(s) not fully picked -->
  <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false" id="pkd-cant-pack" :is-open="cantPackModalOpen" size="md" :is-keep-alive="false" @close="cantPackModalOpen = false">
    <MpModalContent>
      <MpModalHeader>
        {{ t('Nothing can be packed yet') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <p style="margin:0;font-size:var(--mp-font-sizes-md);color:var(--mp-text-default)">
          {{ cantPackText }}
        </p>
      </MpModalBody>
      <MpModalFooter>
        <MpButton class="detail-btn detail-btn--primary" variant="primary" @click="cantPackModalOpen = false">{{ t('Got it') }}</MpButton>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

    <ReassignTaskModal
      v-model:open="reassignOpen"
      :task-no="task?.taskNo ?? ''"
      :current-assignee="task?.assignee ?? ''"
      :warehouse-id="task?.warehouseId ?? ''"
      @reassign="applyReassign"
    />
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

.detail-bar-right { display: flex; flex-direction: column; align-items: flex-end; gap: var(--mp-spacing-0\.5); flex-shrink: 0; }
.pkd-last-updated-label { font-size: var(--mp-font-sizes-xs, 11px); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-xs, 14px); }
.pkd-last-updated-val { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-medium, 500); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }

.detail-jump-chevron {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px);
  background: none; border: none; padding: 0; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default, var(--mp-text-secondary));
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
.detail-jump-search:focus { border-color: var(--mp-border-bold, #8c9596); box-shadow: inset 0 0 0 1px var(--mp-border-bold, #8c9596); }
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

.pkd-cancel-banner {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4);
  background: var(--mp-background-warning-subtle, #fffbeb);
  border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.pkd-cancel-banner-icon { color: var(--mp-icon-warning, #d97706); flex-shrink: 0; }
.pkd-cancel-banner-text { flex: 1; }
.pkd-cancel-banner-btn {
  flex-shrink: 0; height: var(--mp-sizes-8, 32px); padding: 0 var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral, #fff); color: var(--mp-text-default);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer;
}
.pkd-cancel-banner-btn:hover { background: var(--mp-background-neutral-hovered); }

.pkd-rearrange-banner {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4);
  background: var(--mp-background-critical-subtle, #fceeed);
  border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.pkd-rearrange-banner-icon { color: var(--mp-icon-critical, #e2483d); flex-shrink: 0; }
.pkd-rearrange-banner-text { flex: 1; }
.pkd-rearrange-banner-btn {
  flex-shrink: 0; height: var(--mp-sizes-8, 32px); padding: 0 var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral, #fff); color: var(--mp-text-default);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer;
}
.pkd-rearrange-banner-btn:hover { background: var(--mp-background-neutral-hovered); }

.pkd-reason { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.pkd-reason-release {
  background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); line-height: var(--mp-line-heights-md);
}
.pkd-reason-release:hover { text-decoration: underline; text-underline-offset: 2px; }

.pkd-progress { display: flex; align-items: center; gap: var(--mp-spacing-10); align-self: flex-start; }
.pkd-progress-stat { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: var(--mp-sizes-28, 112px); }
.pkd-progress-val { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.pkd-progress-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.pkd-table-wrap { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.pkd-filter-bar { display: flex; justify-content: space-between; align-items: center; gap: var(--mp-spacing-3); }
/* Combined / By orders toggle — same pill pattern as StockAdjustmentDetailsPage.vue's By location/By SKU toggle. */
.detail-loc-toggle { display: flex; align-items: center; background: var(--mp-background-neutral-subtle); border-radius: var(--mp-radii-full); padding: 2px; gap: 2px; }
.detail-loc-toggle-btn { height: 28px; padding: 0 var(--mp-spacing-3); border: none; border-radius: var(--mp-radii-full); background: none; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); cursor: pointer; white-space: nowrap; }
.detail-loc-toggle-btn:hover { color: var(--mp-text-default); }
.detail-loc-toggle-btn--active { background: var(--mp-background-stage, #fff); color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold); box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

/* Per-order blocks (By orders view) — same header pattern as CreatePackingPage.vue's order grouping. */
.pkd-order-block { margin-bottom: var(--mp-spacing-5); }
.pkd-order-head { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-2); }
.pkd-order-no { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pkd-order-cust { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pkd-order-source { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); }
.pkd-source-info { display: inline-flex; align-items: center; color: var(--mp-icon-default, var(--mp-text-secondary)); cursor: default; }
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
/* Product table only (not the Sales orders/Packing tasks linked tables below,
   which share the same .detail-th/.detail-td classes) — every column gets a
   right border since a bin-split group renders fewer <td>s per row than the
   header; the Action column (the true rightmost) is explicitly excepted. */
.detail-items .detail-th,
.detail-items .detail-td { border-right: 1px solid var(--mp-border-default); }
.detail-items .detail-th--action,
.detail-items .detail-td--action { border-right: none; }
.detail-td--location { min-width: 160px; max-width: 200px; }
.pkd-location-item { display: block; white-space: normal; word-break: break-word; }
/* Stacked list of 2+ known bins in one cell (a group's plan spans 2+ bins but
   nothing's actually been picked yet, so it isn't split into real rows) — the
   wrapping <td> gets padding:0 so each item can carry its own 10px top/bottom
   padding instead, or a long (wrapped) bin name would otherwise sit flush
   against its neighbor with no breathing room. */
.detail-td--location-summary { padding: 0; }
.pkd-location-summary-wrap { display: flex; flex-direction: column; }
.pkd-location-summary-item {
  display: flex; align-items: center; min-height: var(--mp-sizes-10, 40px);
  padding: 10px var(--mp-spacing-2); box-sizing: border-box; flex-shrink: 0;
  white-space: normal; word-break: break-word; line-height: var(--mp-line-heights-md);
}
.pkd-location-summary-item:not(:last-child) { border-bottom: 1px solid var(--mp-border-default); }
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
.pkd-view-btn { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); border-radius: var(--mp-radii-md); background: none; border: none; cursor: pointer; color: var(--mp-icon-default); }
.pkd-view-btn:hover { background: var(--mp-background-neutral-hovered); }
.detail-items-count { display: flex; align-items: center; margin: 0; padding: var(--mp-spacing-3) var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.pkd-qty--full { color: var(--mp-text-success-default, #15803d); font-weight: var(--mp-font-weights-medium, 500); }
.pkd-qty--partial { color: var(--mp-text-warning-default, #854d0e); }
.pkd-qty--zero { color: var(--mp-text-placeholder); }
.pkd-outstanding { color: var(--mp-text-warning-default, #854d0e); font-weight: var(--mp-font-weights-medium, 500); }
/* Linked-order due date + marketplace expiry caption */
.pkd-due { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.pkd-due-expire { font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm); color: var(--mp-text-danger, #c0392b); font-weight: var(--mp-font-weights-medium, 500); }

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
.wh-link-wrap { position: relative; display: inline-flex; align-items: center; }

/* ── Footer ──────────────────────────────────────────────────────────────────── */
.detail-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage); border-top: 1px solid transparent;
}
.detail-footer--floating { border-top-color: var(--mp-border-default); }
.modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
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
/* Disabled variant (e.g. Start picking while Needs Re-arrangement) — greyed
 * out instead of staying full brand-green, so it visually reads as blocked. */
.detail-btn--disabled,
.detail-btn--disabled:hover {
  background: var(--mp-background-disabled, #e5e7eb);
  color: var(--mp-text-disabled, #9ca3af);
  cursor: not-allowed;
}
.detail-split-btn { display: flex; }
.detail-split-btn__main { border-top-right-radius: 0; border-bottom-right-radius: 0; padding-right: var(--mp-spacing-3); border-right: 1px solid rgba(255,255,255,0.25); }
.detail-split-btn__chevron { border-top-left-radius: 0; border-bottom-left-radius: 0; padding: var(--mp-spacing-2) var(--mp-spacing-3); }

.pkd-not-found {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--mp-spacing-4); flex: 1; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
</style>
