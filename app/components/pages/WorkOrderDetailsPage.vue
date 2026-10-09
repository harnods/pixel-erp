<script setup lang="ts">
/**
 * Work order detail — read-only view of a manufacturing work order (Production →
 * Work orders → View details). Built from the Figma reference (Work Order Detail)
 * using the ERP detail-page shell: title bar (breadcrumb + title + status badge +
 * header actions), scrollable stage, read-only borderless tables + summaries.
 *
 * Status-aware: the header primary action, the raw-material/routing status columns,
 * and the reserved/consumed/start/end values all reflect the work order's status.
 *
 * Work order approval: Approve split button in the header for the viewer's level, pending
 * notices under the tabs, and Start / Adjust / Complete / Cancel-close through
 * WoTransactionModal (approval rule from VAL). Grooming 2026-10-09:
 *   • the status badge stays as-is — no Draft / Waiting approval status;
 *   • while a request is pending the work order is frozen — every action refuses inline
 *     (buttons never disabled) except Print and the requester's Cancel approval request;
 *   • rejection notices are sticky until dismissed (×); the Adjust / Cancel-close reason
 *     shows in a notice; the Approval log icon in the header (rule/detail-approval-header)
 *     opens every request on the work order in ApprovalLogModal.
 */
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { formatIDR } from '~/utils/currency'
import {
  MpPopover, MpPopoverTrigger, MpTooltip, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpIcon, MpSelect, MpDatePicker, MpButton, css, toast,
  MpBanner, MpBannerIcon, MpBannerDescription, MpBannerLink, MpBannerCloseButton,
} from '@mekari/pixel3'
import ApprovalLogModal from '~/components/patterns/ApprovalLogModal.vue'
import RejectTransactionModal from '~/components/patterns/RejectTransactionModal.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import WoTransactionModal, { type WoTransactionMode, type WoTransactionResult } from '~/components/patterns/WoTransactionModal.vue'
import WoRejectBanner from '~/components/patterns/WoRejectBanner.vue'
import WoActionReasonBanner from '~/components/patterns/WoActionReasonBanner.vue'
import {
  pendingForWorkOrder, rejectedNotices, rejectionOf, dismissRejection, guardMessage, startWorkOrder,
  approvalLogsForWorkOrder, approvalLogFor, queueFor, rejectRequest, waitingForText,
  approveRequest, displayStatus, typeLabel, requestTitle, requestById,
  canCancelRequest, cancelRequest,
  type WoApprovalRequest,
} from '~/data/woApproval'
import { valUnavailable } from '~/data/valApprovalRule'
import { WO_APPROVAL_ACTORS } from '~/composables/useWoApprovalActor'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import CompleteWorkOrderModal, { type CompleteWorkOrderRow } from '~/components/patterns/CompleteWorkOrderModal.vue'
import PickSerialNumberDrawer from '~/components/patterns/PickSerialNumberDrawer.vue'
import PickBatchDrawer from '~/components/patterns/PickBatchDrawer.vue'
import { formatDate } from '~/utils/date'
import { workOrders, persistWorkOrders, type WorkOrder, type WorkOrderStatus } from '~/data/workOrders'
import { workOrderLinks } from '~/data/workOrderLinks'
import { billOfMaterials, catalogProduct } from '~/data/billOfMaterials'
import { recordsForWorkOrder, addMaterialConsumeReturnRecord, remainingReservation } from '~/data/materialConsumeReturn'
import { isBatchTracked, isSerialized } from '~/data/warehouseDetails'
import { warehouses } from '~/data/warehouses'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()
const route = useRoute()

const wo = computed<WorkOrder | undefined>(() => workOrders.find(w => w.id === props.orderId))
const bom = computed(() => wo.value ? billOfMaterials.find(b => b.id === wo.value!.bomId) : undefined)

function goList() { router.push('/work-orders') }
function goNewRecord() { router.push(`/work-orders/${props.orderId}/material-record/new`) }
function goBom() { if (bom.value) router.push(`/bill-of-materials/${bom.value.id}`) }

// ── Flow (Default vs From production request) ────────────────────────────────
// From-PR adds the "Linked transactions" bottom tab. Preselected via ?source=pr.
type Flow = 'default' | 'production-request'
const flow = ref<Flow>(route.query.source === 'pr' ? 'production-request' : 'default')
const flowOptions: { value: Flow; label: string }[] = [
  { value: 'default', label: t('Default') },
  { value: 'production-request', label: t('From production request') },
]
const fromProductionRequest = computed(() => flow.value === 'production-request')

// ── Bottom tabs ──────────────────────────────────────────────────────────────
const bottomTabs = computed(() =>
  fromProductionRequest.value ? ['Partial production', 'Linked transactions'] : ['Partial production'],
)
const activeBottomTab = ref('Partial production')

// ── Top-level tabs (Overview / Material consume & return) ────────────────────
const topTabs = ['Overview', 'Material consume & return'] as const
type TopTab = typeof topTabs[number]
const activeTopTab = ref<TopTab>(
  route.query.tab === 'material-consume-return' ? 'Material consume & return' : 'Overview',
)

// ── Formatters ────────────────────────────────────────────────────────────────
const num = (n: number) => n.toLocaleString('id-ID')

// BOM no. — the real BOM this work order was raised from.
const bomNo = computed(() => bom.value?.number ?? '—')
const planRange = computed(() => wo.value ? `${formatDate(wo.value.planStartDate)} - ${formatDate(wo.value.planEndDate)}` : '—')

// ── Header status → primary action ──────────────────────────────────────────────
const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  'not started': t('Not started'), 'in progress': t('In progress'), 'partially produced': t('Partially produced'),
  'partially completed': t('Partially completed'), 'completed': t('Completed'), 'canceled': t('Canceled'),
}
const primaryAction = computed(() => {
  switch (wo.value?.status) {
    case 'not started': return t('Start work order')
    case 'in progress':
    case 'partially produced': return t('Complete work order')
    case 'partially completed': return t('Complete work order')
    default: return '' // completed / canceled → no primary action
  }
})
// Actions menu items — terminal statuses drop the destructive/edit options. The
// requester's own pending request adds "Cancel approval request" (until someone approves).
// While approval is running, Cancel/close, Edit, Replace attachment and Delete are hidden.
const HIDDEN_WHILE_PENDING = new Set(['Cancel/close work order', 'Edit', 'Replace attachment', 'Delete'])
const actionItems = computed(() => {
  const s = wo.value?.status
  const own = cancelableRequest.value ? ['Cancel approval request'] : []
  let items: string[]
  if (s === 'completed') items = ['Print']
  else if (s === 'canceled') items = ['Print', 'Delete']
  else if (s === 'in progress' || s === 'partially produced') items = ['Adjust work order', 'Cancel/close work order', 'Edit', 'Replace attachment', 'Print', 'Delete']
  else items = ['Cancel/close work order', 'Edit', 'Replace attachment', 'Print', 'Delete']
  if (pending.value.length) items = items.filter(i => !HIDDEN_WHILE_PENDING.has(i))
  return [...own, ...items]
})

// ── Attachments (representative) ────────────────────────────────────────────────
const attachments = [
  { name: 'production guide.pdf' },
  { name: 'quality checklist.pdf' },
]

// ── Collapsible sections ──────────────────────────────────────────────────────
const collapsed = reactive<Record<string, boolean>>({
  raw: false, cost: false, routing: false, finished: false,
})

// ── Line-item status derivation (from the work order status) ─────────────────────
const routingLineStatus = computed(() => STATUS_LABEL[wo.value?.status ?? 'not started'])

// Consumed = the real total from this work order's Material consume & return
// records (Consume qty net of any Return qty) — the same records the Material
// consume & return tab lists.
function consumedFor(productId: string): number {
  if (!wo.value) return 0
  return Math.max(0, recordsForWorkOrder(wo.value.id)
    .filter(r => r.productId === productId)
    .reduce((s, r) => s + r.qty, 0))
}
// Actual start/end shown only when the work order has reached that stage.
const showStart = computed(() => !['not started', 'canceled'].includes(wo.value?.status ?? ''))
const showEnd = computed(() => ['partially completed', 'completed', 'canceled'].includes(wo.value?.status ?? ''))

// ── Line-item data — sourced from the real BOM this work order was raised from ──
// The BOM template doesn't track an execution warehouse, so a representative
// default is used for display.
const EXECUTION_WAREHOUSE = 'Production Jakarta'
const rawMaterials = computed(() => (bom.value?.rawMaterials ?? []).map(r => {
  const p = catalogProduct(r.productId)
  return { productId: r.productId, product: p?.name ?? '—', sku: p?.sku ?? '—', purchaseCost: r.purchaseCost, warehouse: EXECUTION_WAREHOUSE, needed: r.needed, unit: r.unit }
}))
const rawEst = (r: { purchaseCost: number; needed: number }) => r.purchaseCost * r.needed
const rawSubtotal = computed(() => rawMaterials.value.reduce((s, r) => s + rawEst(r), 0))

// ── Complete work order — blocked by unconsumed raw material qty ────────────
// Clicking "Complete work order" while any raw material still has qty left to
// consume shows a confirmation (Figma: Work Order Details / Partial
// Consumption / Auto-consume Remaining) instead of completing outright.
const CURRENT_USER = 'Rizal Candra'
const AUTO_CONSUME_WAREHOUSE_ID = warehouses.find(w => w.status === 'active')?.id ?? warehouses[0]?.id ?? ''
function trackingLabelForMaterial(productId: string): string | undefined {
  const category = catalogProduct(productId)?.category ?? ''
  if (isSerialized(category)) return 'View serial number'
  if (isBatchTracked(category)) return 'View batch'
  return undefined
}
const remainingRawMaterials = computed<CompleteWorkOrderRow[]>(() =>
  rawMaterials.value
    .map(r => {
      const consumed = consumedFor(r.productId)
      const reserved = wo.value
        ? remainingReservation(wo.value.id, r.productId, wo.value.materialReservations?.[r.productId])
        : {}
      return {
        productId: r.productId, product: r.product, sku: r.sku,
        needed: r.needed, consumed, remaining: Math.max(0, r.needed - consumed), unit: r.unit,
        trackingLabel: trackingLabelForMaterial(r.productId),
        warehouseId: reserved.warehouseId,
        reservedBatch: reserved.batchSelection, reservedSerial: reserved.serialSelection,
      }
    })
    .filter(r => r.remaining > 0),
)
const showCompleteModal = ref(false)

// "View batch" / "View serial number" in the complete-work-order modal opens
// the same pick drawer used elsewhere, pre-filled with what's still reserved
// but unconsumed — read-only in effect, since there's nothing to save back to
// mid-completion; closing (Cancel or Save) just dismisses it.
const viewTrackingRow = ref<CompleteWorkOrderRow | null>(null)
function onViewTracking(row: CompleteWorkOrderRow) { viewTrackingRow.value = row }
function closeViewTracking() { viewTrackingRow.value = null }
const viewTrackingWarehouseName = computed(() => warehouses.find(w => w.id === viewTrackingRow.value?.warehouseId)?.name ?? '')
const viewTrackingType = computed<'serial' | 'batch' | undefined>(() => {
  const category = viewTrackingRow.value ? catalogProduct(viewTrackingRow.value.productId)?.category ?? '' : ''
  if (isSerialized(category)) return 'serial'
  if (isBatchTracked(category)) return 'batch'
  return undefined
})
function completeWorkOrder() {
  if (!wo.value) return
  wo.value.status = 'completed'
  wo.value.endDate = new Date().toISOString().slice(0, 10)
  persistWorkOrders()
  toast.notify({ variant: 'success', title: 'Work order completed' })
}
function onAutoConsumeAndComplete() {
  if (!wo.value) return
  const isoDate = new Date().toISOString().slice(0, 10)
  remainingRawMaterials.value.forEach((r) => {
    addMaterialConsumeReturnRecord({
      workOrderId: wo.value!.id,
      type: 'Consume',
      productId: r.productId,
      date: isoDate,
      qty: r.remaining,
      unit: r.unit,
      // The warehouse the material was actually reserved from at work order
      // creation — same warehouse "View batch"/"View serial number" showed.
      // Falls back to the default only for untracked materials with no
      // reservation to read a warehouse from.
      warehouseId: r.warehouseId ?? AUTO_CONSUME_WAREHOUSE_ID,
      memo: 'Auto-consumed on work order completion',
      recordedBy: CURRENT_USER,
      // Whatever of the reservation was still unconsumed goes with it, so the
      // reservation reads back as fully consumed afterward.
      batchSelection: r.reservedBatch,
      serialSelection: r.reservedSerial,
    })
  })
  completeWorkOrder()
}
function runCompletion() {
  if (remainingRawMaterials.value.length > 0) { showCompleteModal.value = true; return }
  completeWorkOrder()
}
function handlePrimaryAction() {
  if (!wo.value) return
  // Every action confirms in WoTransactionModal, which asks VAL for the approval rule:
  // gated → held as a request; not gated → applied as before (material reserved at start).
  if (blocked()) return
  if (wo.value.status === 'not started') { openTransaction('start'); return }
  if (primaryAction.value !== t('Complete work order')) return
  openTransaction('completion')
}

// ── Work order approval ───────────────────────────────────────────────────────
const { actor, setActor } = useWoApprovalActor()
const pending = computed(() => (wo.value ? pendingForWorkOrder(wo.value.id) : []))
const rejections = computed(() => (wo.value ? rejectedNotices(wo.value.id) : []))
const actionReason = computed(() => wo.value?.actionReason)
const actionReasonRequest = computed(() => requestById(actionReason.value?.requestId))

/**
 * Only ONE notice shows on the work order — the latest. An inline refusal (the user just
 * clicked a locked action) always wins; otherwise the newest of: a pending request
 * (submitted at), an undismissed rejection (rejected at) and the Adjust / Cancel-close
 * reason (given at). A pending request's reason rides on its pending notice instead.
 */
type Notice =
  | { kind: 'guard' }
  | { kind: 'pending'; request: WoApprovalRequest }
  | { kind: 'rejected'; request: WoApprovalRequest }
  | { kind: 'reason' }
const notice = computed<Notice | null>(() => {
  if (guardText.value) return { kind: 'guard' }
  const candidates: { at: string; rank: number; n: Notice }[] = []
  for (const r of pending.value) candidates.push({ at: r.log[0]?.at ?? r.transactionDate, rank: 3, n: { kind: 'pending', request: r } })
  for (const r of rejections.value) candidates.push({ at: rejectionOf(r)?.at ?? '', rank: 2, n: { kind: 'rejected', request: r } })
  if (actionReason.value && actionReasonRequest.value?.status !== 'pending') candidates.push({ at: actionReason.value.at, rank: 1, n: { kind: 'reason' } })
  candidates.sort((a, b) => b.at.localeCompare(a.at) || b.rank - a.rank)
  return candidates[0]?.n ?? null
})
const hasNotices = computed(() => !!notice.value)

/** Short request name for the banners — "Start", "Adjustment ADJ-0007", "Cancel/close CXL-0002". */
const SHORT_TYPE: Record<WoApprovalRequest['type'], string> = {
  start: 'Start work order', adjustment: 'Adjustment', completion: 'Completion', cancel: 'Cancel/close',
}
function shortTitle(req: WoApprovalRequest): string {
  return req.ref ? `${t(SHORT_TYPE[req.type])} ${req.ref}` : t(SHORT_TYPE[req.type])
}

// Freeze — any pending request locks every action but Print and Cancel approval request.
// Actions stay enabled and explain themselves inline (rule: never disabled).
const guardText = ref('')
function blocked(): boolean {
  const msg = wo.value ? guardMessage(wo.value.id) : null
  guardText.value = msg ?? ''
  return !!msg
}

// Cancel approval request — the requester's own pending request, until someone approves.
const cancelableRequest = computed(() => pending.value.find(r => canCancelRequest(r, actor.value)))
const cancelRequestOpen = ref(false)
const cancelRequestTarget = ref<WoApprovalRequest | null>(null)
function askCancelRequest(req: WoApprovalRequest | undefined) {
  if (!req) return
  cancelRequestTarget.value = req
  cancelRequestOpen.value = true
}
const cancelRequestDescription = computed(() => {
  const req = cancelRequestTarget.value
  if (!req) return ''
  return t('{title} won\'t be applied and the work order is unlocked. You can submit it again later.')
    .replace('{title}', t(requestTitle(req)))
})
function confirmCancelRequest() {
  const req = cancelRequestTarget.value
  if (!req) return
  if (!cancelRequest(req.id, actor.value)) {
    guardText.value = 'This request can\'t be canceled anymore because an approver has already approved it.'
    return
  }
  guardText.value = ''
  toast.notify({ variant: 'success', title: t('Approval request canceled') })
}

// Approve from the header — only when a request on this WO awaits the viewer's level.
const myRequest = computed(() => (wo.value ? queueFor(actor.value).find(r => r.workOrderId === wo.value!.id) : undefined))
function approveHere() {
  const req = myRequest.value
  if (!req) return
  const label = t(typeLabel(req.type))
  const result = approveRequest(req.id, actor.value)
  if (!result) return
  guardText.value = ''
  toast.notify({
    variant: 'success',
    title: result.outcome === 'final'
      ? t('Request approved. {Type} applied').replace('{Type}', label)
      : t('Request approved. Waiting for level {n}').replace('{n}', String(result.nextLevel)),
  })
}

// Reject from the header split button — reason required (RejectTransactionModal).
const rejectOpen = ref(false)
const rejectDescription = computed(() => {
  const req = myRequest.value
  if (!req) return ''
  return t('{title} won\'t be applied. The requester will see your reason in the approval log.')
    .replace('{title}', `${t(typeLabel(req.type))}${req.ref ? ` ${req.ref}` : ''}`)
})
function rejectHere(reason: string) {
  const req = myRequest.value
  rejectOpen.value = false
  if (!req || !rejectRequest(req.id, actor.value, reason)) return
  guardText.value = ''
  toast.notify({ variant: 'success', title: t('Request rejected') })
}

const approvalLogOpen = ref(false)
// One request (from a rejection notice) or all of them (header icon / pending notices).
const approvalLogRequestId = ref('')
const approvalLogs = computed(() => {
  if (!wo.value) return []
  const one = requestById(approvalLogRequestId.value)
  return one ? [approvalLogFor(one)] : approvalLogsForWorkOrder(wo.value.id)
})
function openApprovalLog(requestId = '') {
  approvalLogRequestId.value = requestId
  approvalLogOpen.value = true
}

// Start / Adjust / gated Complete / Cancel-close — WoTransactionModal.
const transactionOpen = ref(false)
const transactionMode = ref<WoTransactionMode>('adjustment')
const transactionPrefill = ref<WoApprovalRequest | null>(null)
function openTransaction(mode: WoTransactionMode, prefill: WoApprovalRequest | null = null) {
  transactionMode.value = mode
  transactionPrefill.value = prefill
  transactionOpen.value = true
}
function onTransactionDone(result: WoTransactionResult, mode: WoTransactionMode) {
  guardText.value = ''
  // Adjust / Cancel-close land back on the detail Overview, where the reason notice shows.
  if (mode === 'adjustment' || mode === 'cancel') activeTopTab.value = 'Overview'
  toast.notify({
    variant: 'success',
    title: result === 'submitted' ? t('Request submitted. Waiting for approval')
      : result === 'auto-approved' ? t('Approved automatically. {Type} applied').replace('{Type}', t(typeLabel(mode)))
        : t('Work order updated'),
  })
}

// Not gated cancel/close — applied immediately, remaining reservation released.
function cancelNow() {
  if (!wo.value) return
  wo.value.status = 'canceled'
  wo.value.endDate = new Date().toISOString().slice(0, 10)
  wo.value.materialReservations = undefined
  persistWorkOrders()
  toast.notify({ variant: 'success', title: t('Work order canceled') })
}

// Not gated start — In progress now and the planned material is reserved.
function startNow() {
  if (!wo.value) return
  startWorkOrder(wo.value)
  toast.notify({ variant: 'success', title: t('Work order started') })
}

function onActionItem(item: string) {
  // Exempt from the freeze.
  if (item === 'Print') return
  if (item === 'Cancel approval request') { askCancelRequest(cancelableRequest.value); return }
  if (blocked()) return
  if (item === 'Adjust work order') { openTransaction('adjustment'); return }
  if (item === 'Cancel/close work order') openTransaction('cancel')
}
function onNewRecord() {
  if (blocked()) return
  goNewRecord()
}

// ── Material consume & return — sourced from the persisted store ────────────
// Seeded with one Consume record per raw material actually consumed (mirrors
// the Raw materials "Consumed qty" column) plus excess-Return records for every
// other material; new records the user saves via "New record" are appended
// there too. "View serial number" / "View batch" tracking links follow the same
// odd-index-material / last-material convention the seed uses.
interface CrrRecord {
  id: string
  number: string
  type: 'Consume' | 'Return'
  product: string
  sku: string
  date: string
  qty: number
  unit: string
  memo: string
  recordedBy: string
  trackingLabel?: string
}
function trackingLabelFor(materialIndex: number, type: 'Consume' | 'Return', totalMaterials: number): string | undefined {
  if (materialIndex < 0) return undefined
  if (type === 'Consume') return materialIndex % 2 === 1 ? 'View serial number' : undefined
  return materialIndex === totalMaterials - 1 ? 'View batch' : undefined
}
const consumeReturnRecords = computed<CrrRecord[]>(() => {
  if (!wo.value) return []
  return recordsForWorkOrder(wo.value.id).map(r => {
    const p = catalogProduct(r.productId)
    const materialIndex = rawMaterials.value.findIndex(m => m.sku === p?.sku)
    return {
      id: r.id,
      number: r.number,
      type: r.type,
      product: p?.name ?? '—',
      sku: p?.sku ?? '—',
      date: r.date,
      qty: r.qty,
      unit: r.unit,
      memo: r.memo || '-',
      recordedBy: r.recordedBy,
      trackingLabel: trackingLabelFor(materialIndex, r.type, rawMaterials.value.length),
    }
  })
})

const crrColumns: TableColumn[] = [
  { key: 'number',      label: 'Number',                    kind: 'number' },
  { key: 'product',     label: 'Product',                   kind: 'name' },
  { key: 'date',        label: 'Date',                       kind: 'date' },
  { key: 'qty',         label: 'Qty to consume / return',   align: 'right' },
  { key: 'unit',        label: 'Unit',                       kind: 'unit'  },
  { key: 'memo',        label: 'Memo'                        },
  { key: 'recordedBy',  label: 'Recorded by',                kind: 'name' },
]
const CRR_TYPE_OPTIONS: { label: string; value: 'Consume' | 'Return' }[] = [
  { label: 'Consume', value: 'Consume' },
  { label: 'Return', value: 'Return' },
]
const crrTypeFilter = ref<'Consume' | 'Return' | ''>('')
const crrTypeLabel = computed(() => CRR_TYPE_OPTIONS.find(o => o.value === crrTypeFilter.value)?.label ?? '')
const crrDateFilter = ref('') // DD/MM/YYYY

const {
  search: crrSearch, currentPage: crrCurrentPage, paginated: crrPaginated,
  total: crrTotal, perPage: crrPerPage, setPage: crrSetPage, setPerPage: crrSetPerPage,
} = useTableState<CrrRecord>(consumeReturnRecords, {
  perPage: 25,
  filterFn: (row, s) => {
    const matchesSearch = !s || row.number.toLowerCase().includes(s) || row.product.toLowerCase().includes(s)
    const matchesType = !crrTypeFilter.value || row.type === crrTypeFilter.value
    const m = crrDateFilter.value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    const filterDate = m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null
    const matchesDate = !filterDate || new Date(row.date).toDateString() === filterDate.toDateString()
    return matchesSearch && matchesType && matchesDate
  },
})
watch([crrTypeFilter, crrDateFilter], () => crrSetPage(1))
const crrHasActiveFilter = computed(() => !!crrSearch.value || !!crrTypeFilter.value || !!crrDateFilter.value)

const crrColumnVisibility = reactive<Record<string, boolean>>(
  Object.fromEntries(crrColumns.map(c => [c.key, true])),
)
const crrColumnItems = crrColumns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const crrVisibleColumns = computed<TableColumn[]>(() => crrColumns.filter(c => crrColumnVisibility[c.key]))

const PRODUCTION_COST_GROUPS = ['Labor', 'Overhead', 'Other'] as const
const productionCost = computed(() => PRODUCTION_COST_GROUPS.map(g => {
  const row = (bom.value?.productionCost ?? []).find(c => c.group === g)
  return { group: `${g} cost`, account: row?.account ?? '', driver: row?.costDriver ?? '', unitCost: row?.amount ?? 0, multiplier: row ? 1 : 0 }
}))
const costAmount = (c: { unitCost: number; multiplier: number }) => c.unitCost * c.multiplier
const productionCostSubtotal = computed(() => productionCost.value.reduce((s, c) => s + costAmount(c), 0))

const routing = computed(() => (bom.value?.routing ?? []).map(r => ({
  process: r.process, description: r.description, mapping: r.accountMapping,
  planStart: wo.value?.planStartDate ?? '', planEnd: wo.value?.planEndDate ?? '', amount: r.amount,
})))
const routingSubtotal = computed(() => routing.value.reduce((s, r) => s + r.amount, 0))
const totalProductionCost = computed(() => rawSubtotal.value + productionCostSubtotal.value + routingSubtotal.value)

const otherOutputs = computed(() => (bom.value?.otherOutputs ?? []).map(o => {
  const p = catalogProduct(o.productId)
  return { product: p?.name ?? '—', sku: p?.sku ?? '—', qty: o.qty, unit: o.unit, percentage: o.percentage, estCost: o.estCost }
}))
const otherOutputsSubtotal = computed(() => otherOutputs.value.reduce((s, r) => s + r.estCost, 0))

const productionWaste = computed(() => (bom.value?.productionWaste ?? []).map(w => ({
  mapping: w.accountMapping, method: w.allocationMethod, percentage: w.percentage, amount: w.amount,
})))
const wasteSubtotal = computed(() => productionWaste.value.reduce((s, r) => s + r.amount, 0))

// Main output absorbs whatever production cost isn't allocated to other outputs/waste.
const mainOutput = computed(() => {
  const fg = bom.value ? catalogProduct(bom.value.finishedGoodId) : undefined
  const estCost = Math.max(0, totalProductionCost.value - otherOutputsSubtotal.value - wasteSubtotal.value)
  return {
    product: fg?.name ?? wo.value?.bomName ?? '—',
    sku: fg?.sku ?? '—',
    qty: wo.value?.producedQty || bom.value?.finishedGoodQty || 0,
    unit: bom.value?.finishedGoodUnit ?? 'Pcs',
    percentage: bom.value?.finishedGoodPercentage ?? 100,
    estCost,
  }
})
const mainOutputSubtotal = computed(() => mainOutput.value.estCost)
const finishedGoodsTotal = computed(() => mainOutputSubtotal.value + otherOutputsSubtotal.value + wasteSubtotal.value)

// ── Demo flow FAB — draggable so it can be moved off whatever it's covering ──
// Position is persisted (per browser) so it stays where it was last dropped.
const FAB_POS_KEY = 'wod-flow-fab-pos'
const fabPos = ref<{ left: number; top: number } | null>(null)
const fabDragging = ref(false)
let fabDidDrag = false
onMounted(() => {
  try {
    const saved = localStorage.getItem(FAB_POS_KEY)
    if (saved) fabPos.value = JSON.parse(saved)
  } catch { /* ignore malformed/unavailable storage */ }
})
function onFabPointerDown(e: PointerEvent) {
  if (e.button !== undefined && e.button !== 0) return
  const btn = e.currentTarget as HTMLElement
  const rect = btn.getBoundingClientRect()
  const startX = e.clientX
  const startY = e.clientY
  const startLeft = rect.left
  const startTop = rect.top
  fabDidDrag = false
  function onMove(ev: PointerEvent) {
    const dx = ev.clientX - startX
    const dy = ev.clientY - startY
    if (!fabDidDrag && Math.hypot(dx, dy) > 4) { fabDidDrag = true; fabDragging.value = true }
    if (!fabDidDrag) return
    const maxLeft = window.innerWidth - rect.width
    const maxTop = window.innerHeight - rect.height
    fabPos.value = {
      left: Math.min(Math.max(0, startLeft + dx), maxLeft),
      top: Math.min(Math.max(0, startTop + dy), maxTop),
    }
  }
  function onUp() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    fabDragging.value = false
    if (fabDidDrag) {
      if (fabPos.value) {
        try { localStorage.setItem(FAB_POS_KEY, JSON.stringify(fabPos.value)) } catch { /* ignore */ }
      }
      // The button followed the cursor, so it's still under it at release —
      // the browser fires a native click there next, which would open the
      // popover Pixel's own trigger listens for. A capture-phase listener on
      // window runs before that (bubble-phase) listener ever sees the event,
      // so swallow this one click and let normal clicks through afterward.
      window.addEventListener('click', suppressFabClick, { capture: true, once: true })
    }
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}
function suppressFabClick(e: MouseEvent) {
  e.preventDefault()
  e.stopImmediatePropagation()
}
</script>

<template>
  <div v-if="wo" class="detail-page">
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <MpButton class="detail-breadcrumb" variant="ghost" @click="goList">{{ t('Work orders') }}</MpButton>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ t('Work order') }} #{{ wo.number.split('-').pop() }}</h1>
          <!-- Work order status as-is — a pending request doesn't change it (grooming 2026-10-09) -->
          <ErpStatusBadge
            :status="displayStatus(wo)"
            :label="displayStatus(wo) === 'in progress' ? t('In progress') : undefined"
            badge-for="additionalInformation" size="md"
            data-devchange="wo-approval-status"
          />
        </div>
      </div>

      <!-- Header actions -->
      <div class="detail-bar-actions">
        <!-- Approval log — same header icon as the transaction details (rule/detail-approval-header) -->
        <MpTooltip id="wod-tt-approval" :label="t('Approval log')" placement="bottom" use-portal>
          <MpButton variant="ghost" class="detail-icon-btn" :aria-label="t('Approval log')" left-icon="task-todo" data-devchange="wo-approval-log-tab" @click="openApprovalLog()" />
        </MpTooltip>
        <MpPopover id="wod-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton class="detail-btn detail-btn--secondary" variant="secondary">
              {{ t('Actions') }}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="item in actionItems" :key="item"
                :class="item === 'Delete' || item === 'Cancel/close work order' ? css({ color: 'var(--mp-text-critical)' }) : ''"
                :data-devchange="item === 'Cancel approval request' ? 'wo-approval-cancel-request' : undefined"
                @click="onActionItem(item)"
              >{{ t(item) }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <!-- Approver view — when a request on this work order awaits the viewer's level,
             the primary action becomes Approve (the work order can't move on until it's
             decided anyway); the chevron segment offers Reject. The Approval log icon sits
             left of Actions (rule/detail-approval-header); no Comments icon on the WO. -->
        <div v-if="myRequest" class="detail-split-btn" data-devchange="wo-approval-detail">
          <MpButton variant="primary" is-rounded class="btn-enterprise btn-enterprise--primary detail-split-btn__main" @click="approveHere">{{ t('Approve') }}</MpButton>
          <MpPopover id="wod-approve-menu" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <MpButton variant="primary" is-rounded class="btn-enterprise btn-enterprise--primary detail-split-btn__chevron" left-icon="chevrons-down" :aria-label="t('More approval actions')" />
            </MpPopoverTrigger>
            <MpPopoverContent class="erp-dropdown-menu">
              <MpPopoverList>
                <MpPopoverListItem @click="rejectOpen = true">{{ t('Reject') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
        <MpButton v-else-if="primaryAction" class="detail-btn detail-btn--primary" variant="primary" data-devchange="wo-approval-freeze" @click="handlePrimaryAction">{{ primaryAction }}</MpButton>
      </div>
    </header>

    <!-- ── Top-level tabs ── -->
    <div class="detail-toptabs" role="tablist">
      <MpButton
        v-for="tab in topTabs" :key="tab"
        class="detail-toptab" variant="ghost" :class="{ 'detail-toptab--active': activeTopTab === tab }"
        role="tab" :aria-selected="activeTopTab === tab"
        @click="activeTopTab = tab"
      >{{ t(tab) }}</MpButton>
    </div>

    <!-- ── Work order approval notices — inside the content, under the Overview /
         Material consume & return tabs, on whichever tab is open ── -->
    <div v-if="hasNotices"
      class="wod-notices" data-devchange="wo-approval-detail">
      <MpBanner v-if="notice?.kind === 'guard'" variant="danger" is-inline data-devchange="wo-approval-freeze">
        <MpBannerIcon />
        <MpBannerDescription>{{ t(guardText) }}</MpBannerDescription>
        <MpBannerCloseButton @click="guardText = ''" />
      </MpBanner>
      <MpBanner v-else-if="notice?.kind === 'pending'" variant="warning">
        <MpBannerIcon />
        <MpBannerDescription>
          <span data-devchange="wo-approval-status">
            {{ t('{action} is waiting for approval from {names} (level {n}). Only Print is available until then.')
              .replace('{action}', t(shortTitle(notice.request))).replace('{names}', waitingForText(notice.request)).replace('{n}', String(notice.request.currentLevel)) }}
          </span>
          <span v-if="notice.request.payload.note && notice.request.type !== 'start'" class="wod-notice-list" data-devchange="wo-approval-reason-banner">
            {{ t('Reason') }}: {{ notice.request.payload.note }}
          </span>
        </MpBannerDescription>
        <MpBannerLink>
          <MpButton variant="textLink" size="sm" @click="openApprovalLog()">{{ t('View approval log') }}</MpButton>
          <MpButton v-if="canCancelRequest(notice.request, actor)" variant="textLink" size="sm" data-devchange="wo-approval-cancel-request" @click="askCancelRequest(notice.request)">{{ t('Cancel approval request') }}</MpButton>
        </MpBannerLink>
      </MpBanner>
      <WoRejectBanner
        v-else-if="notice?.kind === 'rejected'"
        :request="notice.request"
        @dismiss="dismissRejection(notice.request.id)"
        @view-log="openApprovalLog(notice.request.id)"
      />
      <WoActionReasonBanner
        v-else-if="notice?.kind === 'reason' && actionReason"
        :reason="actionReason"
        :ref-no="actionReasonRequest?.ref"
      />
    </div>

    <!-- ── Scrollable stage ── -->
    <div v-if="activeTopTab === 'Overview'" class="detail-stage" :class="{ 'detail-stage--continued': hasNotices }">

      <!-- ── Work order info ── -->
      <section class="wod-section">
        <div class="wod-section-head-static">
          <h2 class="wod-section-title">{{ t('Work order info') }}</h2>
          <MpButton variant="ghost" size="sm" left-icon="hierarchy" class="wod-hierarchy-link">
            {{ t('View work order hierarchy') }}
          </MpButton>
        </div>
        <div class="wod-info-grid">
          <div class="content-list-col">
            <ContentList :label="t('BOM name')" :value="wo.bomName" />
            <ContentList :label="t('BOM no.')">
              <a v-if="bom" class="wod-bom-link" @click.prevent="goBom">{{ bomNo }}</a>
              <template v-else>{{ bomNo }}</template>
            </ContentList>
            <ContentList :label="t('Work order no.')" :value="`${t('Work order')} #${wo.number.split('-').pop()}`" />
          </div>
          <div class="content-list-col">
            <ContentList :label="t('Type')" :value="wo.type" />
            <ContentList :label="t('Track routing')" :value="wo.trackRouting ? t('Yes') : t('No')" />
            <ContentList :label="t('Produced qty')">
              {{ wo.producedQty }}
            </ContentList>
          </div>
          <div class="content-list-col">
            <ContentList :label="t('Production plan dates')" :value="planRange" />
            <ContentList :label="t('Start date')" :value="showStart ? formatDate(wo.startDate) : '—'" />
            <ContentList :label="t('End date')" :value="showEnd ? formatDate(wo.endDate) : '—'" />
          </div>
          <div class="content-list-col">
            <ContentList :label="t('Attachments')">
              <div class="wod-attach-list">
                <a v-for="a in attachments" :key="a.name" class="wod-attach" @click.prevent>
                  <MpIcon name="pdf-document" size="sm" />
                  <span class="wod-attach-name">{{ a.name }}</span>
                </a>
              </div>
            </ContentList>
          </div>
        </div>
      </section>

      <!-- ── Raw materials ── -->
      <section class="wod-section">
        <MpButton class="wod-section-head" variant="ghost" @click="collapsed.raw = !collapsed.raw">
          <h2 class="wod-section-title">{{ t('Raw materials') }}</h2>
          <svg class="wod-chevron" :class="{ 'wod-chevron--open': !collapsed.raw }" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </MpButton>
        <template v-if="!collapsed.raw">
          <div class="wod-table-scroll">
            <table class="wod-table">
              <thead>
                <tr>
                  <th class="wod-th">{{ t('Product') }}</th>
                  <th class="wod-th wod-th--num">{{ t('Purchase cost') }}</th>
                  <th class="wod-th">{{ t('Warehouse') }}</th>
                  <th class="wod-th wod-th--num">{{ t('Needed qty') }}</th>
                  <th class="wod-th wod-th--num">{{ t('Consumed qty') }}</th>
                  <th class="wod-th">{{ t('Unit') }}</th>
                  <th class="wod-th wod-th--num">{{ t('Estimated cost') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in rawMaterials" :key="r.sku" class="wod-tr">
                  <td class="wod-td">
                    <div class="wod-product"><span>{{ r.product }}</span><span class="wod-product-sub">{{ r.sku }}</span></div>
                  </td>
                  <td class="wod-td wod-td--num">{{ formatIDR(r.purchaseCost) }}</td>
                  <td class="wod-td">{{ r.warehouse }}</td>
                  <td class="wod-td wod-td--num">{{ num(r.needed) }}</td>
                  <td class="wod-td wod-td--num">
                    {{ num(consumedFor(r.productId)) }}/{{ num(r.needed) }}
                  </td>
                  <td class="wod-td">{{ r.unit }}</td>
                  <td class="wod-td wod-td--num">{{ formatIDR(rawEst(r)) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="wod-subtotal-row"><span>{{ t('Estimated raw materials subtotal') }}</span><span class="wod-amount">{{ formatIDR(rawSubtotal) }}</span></div>
        </template>
      </section>

      <!-- ── Production cost ── -->
      <section class="wod-section">
        <MpButton class="wod-section-head" variant="ghost" @click="collapsed.cost = !collapsed.cost">
          <h2 class="wod-section-title">{{ t('Production cost') }}</h2>
          <svg class="wod-chevron" :class="{ 'wod-chevron--open': !collapsed.cost }" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </MpButton>
        <template v-if="!collapsed.cost">
          <div class="wod-table-scroll">
            <table class="wod-table">
              <tbody>
                <template v-for="c in productionCost" :key="c.group">
                  <tr class="wod-subhead-row">
                    <th class="wod-th">{{ t(c.group) }}</th>
                    <th class="wod-th">{{ t('Cost driver') }}</th>
                    <th class="wod-th wod-th--num">{{ t('Estimated unit cost') }}</th>
                    <th class="wod-th">{{ t('Multiplier') }}</th>
                    <th class="wod-th wod-th--num">{{ t('Amount') }}</th>
                  </tr>
                  <tr class="wod-tr">
                    <td class="wod-td">{{ c.account || '—' }}</td>
                    <td class="wod-td">{{ c.driver || '—' }}</td>
                    <td class="wod-td wod-td--num">{{ c.unitCost ? formatIDR(c.unitCost) : '—' }}</td>
                    <td class="wod-td">{{ c.multiplier || '—' }}</td>
                    <td class="wod-td wod-td--num">{{ c.account ? formatIDR(costAmount(c)) : '—' }}</td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <div class="wod-subtotal-row"><span>{{ t('Production cost subtotal') }}</span><span class="wod-amount">{{ formatIDR(productionCostSubtotal) }}</span></div>
        </template>
      </section>

      <!-- ── Routing ── -->
      <section class="wod-section">
        <MpButton class="wod-section-head" variant="ghost" @click="collapsed.routing = !collapsed.routing">
          <h2 class="wod-section-title">{{ t('Routing') }}</h2>
          <svg class="wod-chevron" :class="{ 'wod-chevron--open': !collapsed.routing }" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </MpButton>
        <template v-if="!collapsed.routing">
          <div class="wod-table-scroll">
            <table class="wod-table">
              <thead>
                <tr>
                  <th class="wod-th">{{ t('Process') }}</th>
                  <th class="wod-th">{{ t('Description') }}</th>
                  <th class="wod-th">{{ t('Account mapping') }}</th>
                  <th class="wod-th">{{ t('Production plan dates') }}</th>
                  <th class="wod-th">{{ t('Start date') }}</th>
                  <th class="wod-th">{{ t('End date') }}</th>
                  <th class="wod-th">{{ t('Status') }}</th>
                  <th class="wod-th wod-th--num">{{ t('Amount') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in routing" :key="r.process" class="wod-tr">
                  <td class="wod-td">{{ r.process }}</td>
                  <td class="wod-td wod-td--wrap">{{ r.description }}</td>
                  <td class="wod-td">{{ r.mapping }}</td>
                  <td class="wod-td">{{ formatDate(r.planStart) }} - {{ formatDate(r.planEnd) }}</td>
                  <td class="wod-td">{{ showStart ? formatDate(r.planStart) : '—' }}</td>
                  <td class="wod-td">{{ showEnd ? formatDate(r.planEnd) : '—' }}</td>
                  <td class="wod-td"><span class="wod-line-status wod-line-status--muted">{{ routingLineStatus }}</span></td>
                  <td class="wod-td wod-td--num">{{ formatIDR(r.amount) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="wod-subtotal-row"><span>{{ t('Routing cost subtotal') }}</span><span class="wod-amount">{{ formatIDR(routingSubtotal) }}</span></div>
        </template>

        <!-- Cost summary -->
        <div class="wod-summary">
          <div class="wod-summary-row"><span>{{ t('Estimated raw materials subtotal') }}</span><span>{{ formatIDR(rawSubtotal) }}</span></div>
          <div class="wod-summary-row"><span>{{ t('Production cost subtotal') }}</span><span>{{ formatIDR(productionCostSubtotal) }}</span></div>
          <div class="wod-summary-row"><span>{{ t('Routing cost subtotal') }}</span><span>{{ formatIDR(routingSubtotal) }}</span></div>
          <div class="wod-summary-row wod-summary-row--total"><span>{{ t('Estimated total production cost') }}</span><span>{{ formatIDR(totalProductionCost) }}</span></div>
        </div>
      </section>

      <!-- ── Finished goods ── -->
      <section class="wod-section wod-section--last">
        <MpButton class="wod-section-head" variant="ghost" @click="collapsed.finished = !collapsed.finished">
          <h2 class="wod-section-title">{{ t('Finished goods') }}</h2>
          <svg class="wod-chevron" :class="{ 'wod-chevron--open': !collapsed.finished }" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </MpButton>
        <template v-if="!collapsed.finished">
          <!-- Main output — shares its column widths with Other outputs (same colgroup) -->
          <h3 class="wod-subsection-title">{{ t('Main output') }}</h3>
          <div class="wod-table-scroll">
            <table class="wod-table wod-table--outputs">
              <colgroup>
                <col style="width: 280px" /><col style="width: 140px" /><col style="width: 130px" />
                <col style="width: 100px" /><col style="width: 130px" /><col style="width: 180px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="wod-th">{{ t('Product') }}</th><th class="wod-th">{{ t('SKU') }}</th>
                  <th class="wod-th wod-th--num">{{ t('Produced qty') }}</th><th class="wod-th">{{ t('Unit') }}</th>
                  <th class="wod-th wod-th--num">{{ t('Percentage') }}</th><th class="wod-th wod-th--num">{{ t('Estimated cost') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr class="wod-tr">
                  <td class="wod-td">{{ mainOutput.product }}</td>
                  <td class="wod-td">{{ mainOutput.sku }}</td>
                  <td class="wod-td wod-td--num">{{ num(mainOutput.qty) }}</td>
                  <td class="wod-td">{{ mainOutput.unit }}</td>
                  <td class="wod-td wod-td--num">{{ mainOutput.percentage }}%</td>
                  <td class="wod-td wod-td--num">{{ formatIDR(mainOutput.estCost) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="wod-subtotal-row"><span>{{ t('Estimated main output subtotal') }}</span><span class="wod-amount">{{ formatIDR(mainOutputSubtotal) }}</span></div>

          <!-- Other outputs — same column widths as Main output -->
          <h3 class="wod-subsection-title">{{ t('Other outputs') }}</h3>
          <div class="wod-table-scroll">
            <table class="wod-table wod-table--outputs">
              <colgroup>
                <col style="width: 280px" /><col style="width: 140px" /><col style="width: 130px" />
                <col style="width: 100px" /><col style="width: 130px" /><col style="width: 180px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="wod-th">{{ t('Product') }}</th><th class="wod-th">{{ t('SKU') }}</th>
                  <th class="wod-th wod-th--num">{{ t('Produced qty') }}</th><th class="wod-th">{{ t('Unit') }}</th>
                  <th class="wod-th wod-th--num">{{ t('Percentage') }}</th><th class="wod-th wod-th--num">{{ t('Estimated cost') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="o in otherOutputs" :key="o.sku" class="wod-tr">
                  <td class="wod-td">{{ o.product }}</td>
                  <td class="wod-td">{{ o.sku }}</td>
                  <td class="wod-td wod-td--num">{{ num(o.qty) }}</td>
                  <td class="wod-td">{{ o.unit }}</td>
                  <td class="wod-td wod-td--num">{{ o.percentage }}%</td>
                  <td class="wod-td wod-td--num">{{ formatIDR(o.estCost) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="wod-subtotal-row"><span>{{ t('Estimated other outputs subtotal') }}</span><span class="wod-amount">{{ formatIDR(otherOutputsSubtotal) }}</span></div>

          <!-- Production waste -->
          <h3 class="wod-subsection-title">{{ t('Production waste') }}</h3>
          <div class="wod-table-scroll">
            <table class="wod-table">
              <thead>
                <tr>
                  <th class="wod-th">{{ t('Account mapping') }}</th><th class="wod-th">{{ t('Allocation method') }}</th>
                  <th class="wod-th wod-th--num">{{ t('Percentage') }}</th><th class="wod-th wod-th--num">{{ t('Amount') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="w in productionWaste" :key="w.mapping" class="wod-tr">
                  <td class="wod-td">{{ w.mapping }}</td>
                  <td class="wod-td">{{ w.method }}</td>
                  <td class="wod-td wod-td--num">{{ w.percentage }}%</td>
                  <td class="wod-td wod-td--num">{{ formatIDR(w.amount) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="wod-subtotal-row"><span>{{ t('Estimated production waste subtotal') }}</span><span class="wod-amount">{{ formatIDR(wasteSubtotal) }}</span></div>

          <!-- Finished goods summary -->
          <div class="wod-summary">
            <div class="wod-summary-row"><span>{{ t('Estimated main output subtotal') }}</span><span>{{ formatIDR(mainOutputSubtotal) }}</span></div>
            <div class="wod-summary-row"><span>{{ t('Estimated other outputs subtotal') }}</span><span>{{ formatIDR(otherOutputsSubtotal) }}</span></div>
            <div class="wod-summary-row"><span>{{ t('Estimated production waste subtotal') }}</span><span>{{ formatIDR(wasteSubtotal) }}</span></div>
            <div class="wod-summary-row wod-summary-row--total"><span>{{ t('Estimated finished goods total') }}</span><span>{{ formatIDR(finishedGoodsTotal) }}</span></div>
          </div>
        </template>
      </section>

      <!-- ── Bottom tabs (Partial production / Linked transactions) ── -->
      <section class="wod-section wod-section--tabs">
        <div class="wod-bottom-tabs" role="tablist">
          <MpButton
            v-for="tab in bottomTabs" :key="tab"
            class="wod-bottom-tab" variant="ghost" :class="{ 'wod-bottom-tab--active': activeBottomTab === tab }"
            role="tab" :aria-selected="activeBottomTab === tab"
            @click="activeBottomTab = tab"
          >{{ t(tab) }}</MpButton>
        </div>

        <div v-if="activeBottomTab === 'Linked transactions' && fromProductionRequest">
          <h3 class="wod-subsection-title">{{ t('Production request') }}</h3>
          <div class="wod-table-scroll">
            <table class="wod-table">
              <thead>
                <tr>
                  <th class="wod-th">{{ t('Number') }}</th><th class="wod-th wod-th--num">{{ t('Qty to produce') }}</th>
                  <th class="wod-th wod-th--num">{{ t('Processed qty') }}</th><th class="wod-th">{{ t('Unit') }}</th>
                  <th class="wod-th">{{ t('Due date') }}</th><th class="wod-th">{{ t('Status') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="link in workOrderLinks" :key="link.number" class="wod-tr">
                  <td class="wod-td">{{ link.number }}</td>
                  <td class="wod-td wod-td--num">{{ link.qtyToProduce }}</td>
                  <td class="wod-td wod-td--num">{{ link.fulfilledQty }}</td>
                  <td class="wod-td">{{ link.unit }}</td>
                  <td class="wod-td">{{ formatDate(link.dueDate) }}</td>
                  <td class="wod-td"><ErpStatusBadge :status="link.status" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div v-else class="wod-empty">
          <p class="wod-empty-title">{{ t('No partial production') }}</p>
          <p class="wod-empty-desc">{{ t('Partial production records will appear here.') }}</p>
        </div>
      </section>

    </div>

    <!-- ── Material consume & return — no records at all: illustration only, no filter bar ── -->
    <div v-else-if="consumeReturnRecords.length === 0" class="detail-stage detail-stage--crr" :class="{ 'detail-stage--continued': hasNotices }">
      <div class="crr-full-empty">
        <img src="/illustrations/empty-folder.png" alt="" class="crr-empty-illustration" width="288" height="240" />
        <p class="wod-empty-title">No material consume & return</p>
        <p class="wod-empty-desc">Material consume & return will appear here.</p>
        <MpButton class="detail-btn detail-btn--secondary" variant="secondary" @click="onNewRecord"><MpIcon name="add" size="sm" />New record</MpButton>
      </div>
    </div>

    <!-- ── Material consume & return — with records ── -->
    <div v-else class="detail-stage detail-stage--crr" :class="{ 'detail-stage--continued': hasNotices }">
      <ErpTablePage
        :columns="crrVisibleColumns"
        :rows="(crrPaginated as unknown as Record<string, unknown>[])"
        :total="crrTotal"
        :current-page="crrCurrentPage"
        :per-page="crrPerPage"
        :has-active-filter="crrHasActiveFilter"
        actions-width="44px"
        @page-change="crrSetPage"
        @per-page-change="crrSetPerPage"
        @clear-filters="crrTypeFilter = ''; crrDateFilter = ''; crrSearch = ''"
      >
        <!-- ── Filter bar ── -->
        <template #filters>
          <div class="filter-left">
            <MpPopover id="crr-type-filter" is-close-on-select>
              <MpPopoverTrigger>
                <MpSelect
                  id="crr-type-select"
                  placeholder="Record type"
                  :model-value="crrTypeFilter"
                  is-clearable
                  :class="css({ minWidth: '160px' })"
                  @mousedown.prevent
                  @clear="crrTypeFilter = ''"
                >
                  <option v-if="crrTypeFilter" :value="crrTypeFilter">{{ crrTypeLabel }}</option>
                </MpSelect>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content' })">
                <MpPopoverList>
                  <MpPopoverListItem
                    v-for="opt in CRR_TYPE_OPTIONS"
                    :key="opt.value"
                    :is-active="opt.value === crrTypeFilter"
                    @click="crrTypeFilter = opt.value"
                  >{{ opt.label }}</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>

            <MpDatePicker
              id="crr-date-filter" v-model="crrDateFilter"
              placeholder="Date" format="DD/MM/YYYY" value-type="format"
              is-clearable use-portal :class="css({ minWidth: '180px' })"
            />
          </div>

          <div class="filter-right">
            <div class="filter-btn-group">
              <ColumnSettingsMenu id="crr-columns" :items="crrColumnItems" :visibility="crrColumnVisibility" />
            </div>

            <div class="filter-search">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <input v-model="crrSearch" class="filter-search-input" type="text" placeholder="Search..." />
            </div>

            <MpButton class="detail-btn detail-btn--secondary" variant="secondary" @click="onNewRecord"><MpIcon name="add" size="sm" />New record</MpButton>
          </div>
        </template>

        <!-- ── Number — record type sub-label ── -->
        <template #cell-number="{ value, row }">
          <div class="crr-product">
            <span>{{ value }}</span>
            <span class="wod-product-sub">{{ (row as unknown as CrrRecord).type }}</span>
          </div>
        </template>

        <!-- ── Product — SKU sub-label ── -->
        <template #cell-product="{ row }">
          <div class="crr-product">
            <span>{{ (row as unknown as CrrRecord).product }}</span>
            <span class="wod-product-sub">SKU {{ (row as unknown as CrrRecord).sku }}</span>
          </div>
        </template>

        <!-- ── Date ── -->
        <template #cell-date="{ value }">{{ formatDate(value as string) }}</template>

        <!-- ── Qty — tracking link (serial/batch) below the value ── -->
        <template #cell-qty="{ value, row }">
          <div class="crr-qty">
            <span>{{ num(value as number) }}</span>
            <a v-if="(row as unknown as CrrRecord).trackingLabel" class="crr-tracking" @click.prevent>{{ (row as unknown as CrrRecord).trackingLabel }}</a>
          </div>
        </template>

        <!-- ── Actions kebab ── -->
        <template #actions="{ row }">
          <MpPopover :id="`crr-actions-${(row as unknown as CrrRecord).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <MpButton class="row-kebab" variant="ghost" aria-label="More actions">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
                </svg>
              </MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '190px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem>View picking document</MpPopoverListItem>
                <MpPopoverListItem>View journal entry</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </template>

      </ErpTablePage>
    </div>

    <!-- ── Demo flow scenario switcher ── -->
    <MpPopover id="wod-flow-fab" is-close-on-select use-portal placement="top-end">
      <MpPopoverTrigger>
        <MpButton
          class="wod-flow-fab" variant="ghost" :class="{ 'wod-flow-fab--dragging': fabDragging }"
          :style="fabPos ? { left: fabPos.left + 'px', top: fabPos.top + 'px', right: 'auto', bottom: 'auto' } : undefined"
          :aria-label="t('Change work order flow')"
          @pointerdown="onFabPointerDown"
        ><MpIcon name="sliders" size="md" color="icon.inverse" /></MpButton>
      </MpPopoverTrigger>
      <MpPopoverContent :class="css({ minWidth: '220px', width: 'max-content' })">
        <p class="wod-flow-fab-heading">{{ t('Work order flow') }}</p>
        <MpPopoverList>
          <MpPopoverListItem v-for="o in flowOptions" :key="o.value" :is-active="o.value === flow" @click="flow = o.value">{{ o.label }}</MpPopoverListItem>
        </MpPopoverList>
        <p class="wod-flow-fab-heading">{{ t('Approval view') }}</p>
        <MpPopoverList>
          <MpPopoverListItem v-for="a in WO_APPROVAL_ACTORS" :key="a.name" :is-active="a.name === actor" @click="setActor(a.name)">{{ t(a.label) }}</MpPopoverListItem>
        </MpPopoverList>
        <p class="wod-flow-fab-heading">{{ t('Approval rule service (VAL)') }}</p>
        <MpPopoverList>
          <MpPopoverListItem :is-active="!valUnavailable" @click="valUnavailable = false">{{ t('Available') }}</MpPopoverListItem>
          <MpPopoverListItem :is-active="valUnavailable" @click="valUnavailable = true">{{ t('Unavailable (error state)') }}</MpPopoverListItem>
        </MpPopoverList>
      </MpPopoverContent>
    </MpPopover>

    <ApprovalLogModal
      :is-open="approvalLogOpen"
      :logs="approvalLogs"
      empty-text="No approval request on this work order"
      @close="approvalLogOpen = false"
    />
    <ConfirmModal
      v-model:is-open="cancelRequestOpen"
      :title="t('Cancel approval request?')"
      :description="cancelRequestDescription"
      :confirm-label="t('Cancel request')"
      :cancel-label="t('Back')"
      @confirm="confirmCancelRequest"
    />
    <RejectTransactionModal
      :is-open="rejectOpen"
      doc-type="request"
      :title="t('Reject request?')"
      :description="rejectDescription"
      @close="rejectOpen = false"
      @reject="rejectHere"
    />
    <WoTransactionModal
      v-model:is-open="transactionOpen"
      :mode="transactionMode"
      :work-order="wo"
      :requester="actor"
      :prefill="transactionPrefill"
      @done="onTransactionDone"
      @complete-now="runCompletion"
      @cancel-now="cancelNow"
      @start-now="startNow"
    />

    <CompleteWorkOrderModal
      v-model:is-open="showCompleteModal"
      :rows="remainingRawMaterials"
      @complete="onAutoConsumeAndComplete"
      @view-tracking="onViewTracking"
    />

    <!-- "View batch" / "View serial number" from the complete-work-order modal —
         same pick drawer used elsewhere, just for looking at what's still
         reserved but unconsumed; nothing here is persisted on close. -->
    <PickSerialNumberDrawer
      v-if="viewTrackingRow && viewTrackingType === 'serial'"
      :open="!!viewTrackingRow"
      is-read-only
      :title="viewTrackingRow.trackingLabel"
      :product-name="viewTrackingRow.product"
      :product-img="catalogProduct(viewTrackingRow.productId)?.img"
      :sku="viewTrackingRow.sku"
      :warehouse-id="viewTrackingRow.warehouseId ?? ''"
      :warehouse-name="viewTrackingWarehouseName"
      :target-count="viewTrackingRow.reservedSerial?.length ?? 0"
      :model-value="viewTrackingRow.reservedSerial ?? []"
      @update:open="(v: boolean) => { if (!v) closeViewTracking() }"
    />
    <PickBatchDrawer
      v-if="viewTrackingRow && viewTrackingType === 'batch'"
      :open="!!viewTrackingRow"
      is-read-only
      :title="viewTrackingRow.trackingLabel"
      :product-name="viewTrackingRow.product"
      :product-img="catalogProduct(viewTrackingRow.productId)?.img"
      :sku="viewTrackingRow.sku"
      :warehouse-id="viewTrackingRow.warehouseId ?? ''"
      :warehouse-name="viewTrackingWarehouseName"
      :unit="viewTrackingRow.unit"
      :target-count="(viewTrackingRow.reservedBatch ?? []).reduce((s, b) => s + b.qty, 0)"
      :model-value="viewTrackingRow.reservedBatch ?? []"
      @update:open="(v: boolean) => { if (!v) closeViewTracking() }"
    />
  </div>

  <!-- Not found -->
  <div v-else class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <MpButton class="detail-breadcrumb" variant="ghost" @click="goList">{{ t('Work orders') }}</MpButton>
        <div class="detail-titlerow-left"><h1 class="detail-title">{{ t('Work order not found') }}</h1></div>
      </div>
    </header>
  </div>
</template>

<style scoped>
/* ── Work order approval ──────────────────────────────────────────────────── */
/* Header icon button (Approval log) — same as StockAdjustmentDetailsPage. */
.detail-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); border-radius: var(--mp-radii-md); background: none; border: none; cursor: pointer; color: var(--mp-icon-default); }
.detail-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
/* Split button — Approve + chevron (Reject) sharing one pill; outer corners rounded only. */
.detail-split-btn { display: inline-flex; align-items: stretch; }
.detail-split-btn__main { border-radius: var(--mp-radii-full) 0 0 var(--mp-radii-full) !important; }
.detail-split-btn__chevron {
  padding-left: var(--mp-spacing-3) !important; padding-right: var(--mp-spacing-3) !important;
  border-radius: 0 var(--mp-radii-full) var(--mp-radii-full) 0 !important;
  border-left: 1px solid var(--mp-border-default) !important;
}
/* Notices are the top of the white content area (under the tabs): same surface and
   top radius as .detail-stage, which then continues square-topped below them.
   flex-shrink: 0 — the page is a fixed-height flex column; without it the banners get
   squeezed and scroll internally instead of pushing the stage down. */
.wod-notices {
  flex-shrink: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-6) var(--mp-spacing-6) 0;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
}
.detail-stage.detail-stage--continued { border-radius: 0; border-top-width: var(--mp-spacing-5); }
.wod-notice-list { display: block; margin-top: var(--mp-spacing-1); color: var(--mp-text-secondary); }
.wod-waiting { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }

/* The view-tracking drawer opens from inside CompleteWorkOrderModal (z-index
   1400) — without this it'd render behind that modal instead of on top of it. */
:deep(.psn-overlay), :deep(.pbd-overlay) { z-index: 1500; }

/* ── Bottom tabs (Partial production / Linked transactions) ───────────────── */
.wod-section--tabs { border-bottom: none; }
.wod-bottom-tabs { display: flex; align-items: center; gap: var(--mp-spacing-5); border-bottom: 1px solid var(--mp-border-default); margin-bottom: var(--mp-spacing-4); }
.wod-bottom-tab {
  position: relative; background: none; border: none; padding: var(--mp-spacing-2) 0; cursor: pointer;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md);
}
.wod-bottom-tab--active { color: var(--mp-text-selected); font-weight: var(--mp-font-weights-semi-bold); }
.wod-bottom-tab--active::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: var(--mp-background-brand-bold, #029861); }
.wod-empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1); padding: var(--mp-spacing-10) 0; }
.wod-empty-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.wod-empty-desc { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Demo flow scenario switcher ─────────────────────────────────────────── */
.wod-flow-fab {
  position: fixed; right: var(--mp-spacing-6); bottom: var(--mp-spacing-6);
  width: var(--mp-spacing-12, 48px); height: var(--mp-spacing-12, 48px);
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-inverse, #080d0e); color: var(--mp-text-inverse); cursor: grab; z-index: 1200;
  box-shadow: 0 4px 6px -2px rgba(0,0,0,0.1), 0 10px 15px -3px rgba(0,0,0,0.2);
  touch-action: none; user-select: none;
}
.wod-flow-fab:hover { opacity: 0.9; }
.wod-flow-fab--dragging { cursor: grabbing; opacity: 0.85; transition: none; }
.wod-flow-fab-heading { padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Material consume & return ───────────────────────────────────────────── */
.detail-stage--crr { display: flex; flex-direction: column; }

.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-btn-group { display: flex; align-items: center; }
.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  width: 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle);
}
.filter-search-input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default); min-width: 0;
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }

.crr-product { display: flex; flex-direction: column; white-space: normal; }
.crr-qty { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.crr-tracking { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); cursor: pointer; white-space: nowrap; }
.crr-tracking:hover { text-decoration: underline; text-underline-offset: 2px; }

.crr-full-empty {
  display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-16, 96px) 0 0;
}
.crr-full-empty .detail-btn { margin-top: var(--mp-spacing-4); }
.crr-empty-illustration { width: 288px; height: 240px; object-fit: contain; }

.row-kebab {
  display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-5, 20px);
  margin: 0 auto; border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary);
}
.row-kebab svg { display: block; width: var(--mp-sizes-5, 20px); height: var(--mp-sizes-5, 20px); }
.row-kebab:hover { background: var(--mp-background-neutral-hovered); }

/* ── Page shell (shared detail-page pattern) ─────────────────────────────── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; min-height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-3) var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }

/* ── Top-level tabs (Overview / Material consume & return) ──────────────────── */
.detail-toptabs {
  flex-shrink: 0; display: flex; align-items: center; gap: var(--mp-spacing-5);
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  border-bottom: 1px solid var(--mp-border-default);
}
.detail-toptab {
  position: relative; background: none; border: none; padding: var(--mp-spacing-3) 0; cursor: pointer;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md);
}
.detail-toptab--active { color: var(--mp-text-selected); font-weight: var(--mp-font-weights-semi-bold); }
.detail-toptab--active::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: var(--mp-background-brand-bold, #029861); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}
.detail-bar-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-shrink: 0; }

.detail-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer; border: 1px solid transparent; white-space: nowrap;
}
.detail-btn--icon { padding-left: var(--mp-spacing-3); }
.detail-btn--secondary { background: var(--mp-background-neutral); border-color: var(--mp-border-bold); color: var(--mp-text-secondary); }
.detail-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }
.detail-btn--primary { background: var(--mp-colors-emerald-700, #029861); border-color: var(--mp-colors-emerald-700, #029861); color: var(--mp-text-inverse); }
.detail-btn--primary:hover { background: var(--mp-colors-emerald-800, #186f4a); border-color: var(--mp-colors-emerald-800, #186f4a); }

.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-8);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
}

/* ── Sections ────────────────────────────────────────────────────────────── */
.wod-section { padding: var(--mp-spacing-8) 0; border-bottom: 1px dashed var(--mp-border-default); }
.wod-section:first-child { padding-top: 0; }
.wod-section--last { border-bottom: none; }
.wod-section-head {
  display: flex; align-items: center; justify-content: space-between; width: 100%;
  background: none; border: none; padding: 0; cursor: pointer; color: var(--mp-text-secondary);
  margin-bottom: var(--mp-spacing-5);
}
.wod-section-title {
  margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default);
}
/* Collapse chevron — points down when collapsed, rotates up when the section is open. */
.wod-chevron { flex-shrink: 0; color: var(--mp-icon-default); transition: transform 0.15s ease; }
.wod-chevron--open { transform: rotate(180deg); }
.wod-section > .wod-section-title { margin-bottom: var(--mp-spacing-5); }
/* Non-collapsible section head — title left, action right, same row as the
   collapsible sections' .wod-section-head but a plain div, not a toggle button. */
.wod-section-head-static {
  display: flex; align-items: center; justify-content: space-between; width: 100%;
  margin-bottom: var(--mp-spacing-5);
}
.wod-subsection-title {
  margin: var(--mp-spacing-6) 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}

/* ── Work order info grid — 4 columns ────────────────────────────────────── */
.wod-info-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); column-gap: var(--mp-spacing-6); }
.content-list-col { display: flex; flex-direction: column; min-width: 0; }
.wod-bom-link { color: var(--mp-text-link); cursor: pointer; }
.wod-bom-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.wod-hierarchy-link { flex-shrink: 0; }
.wod-attach-list { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.wod-attach { display: inline-flex; align-items: flex-start; gap: var(--mp-spacing-2); cursor: pointer; color: var(--mp-text-link); }
.wod-attach-name { font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); }
.wod-attach:hover .wod-attach-name { text-decoration: underline; text-underline-offset: 2px; }

/* ── Read-only tables (borderless ERP style) ─────────────────────────────── */
.wod-table-scroll {
  overflow-x: auto;
  border-top: 1px solid var(--mp-border-default);
  border-bottom: 1px solid var(--mp-border-default);
}
.wod-table { width: 100%; border-collapse: collapse; table-layout: auto; min-width: max-content; }
/* Main output + Other outputs share the same fixed column widths (via matching
   colgroups) so their columns line up regardless of each table's content. */
.wod-table--outputs { table-layout: fixed; }
.wod-th {
  height: var(--mp-sizes-7, 28px); text-align: left; white-space: nowrap;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default);
}
.wod-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.wod-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); vertical-align: top;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.wod-tr:last-child .wod-td { border-bottom: none; }
.wod-td--num { text-align: right; font-variant-numeric: tabular-nums; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }
.wod-td--wrap { white-space: normal; min-width: 200px; }
.wod-product { display: flex; flex-direction: column; }
.wod-product-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* production cost repeated sub-headers */
.wod-subhead-row .wod-th { border-top: 1px solid var(--mp-border-default); }
.wod-table tbody tr:first-child .wod-th { border-top: none; }

/* line status text */
.wod-line-status { font-size: var(--mp-font-sizes-md); }
.wod-line-status--warning { color: var(--mp-colors-text-warning, #a14a0b); }
.wod-line-status--information { color: var(--mp-colors-text-information, #4b61dc); }
.wod-line-status--success { color: var(--mp-colors-text-success, #0f6d4d); }
.wod-line-status--muted { color: var(--mp-text-secondary); }

/* ── Subtotal + summary ──────────────────────────────────────────────────── */
.wod-subtotal-row {
  display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-8);
  padding: var(--mp-spacing-3) var(--mp-spacing-2) 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.wod-amount { min-width: 180px; text-align: right; font-variant-numeric: tabular-nums; color: var(--mp-text-default); }
.wod-summary { margin-top: var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.wod-summary-row {
  display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-8);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.wod-summary-row > :last-child { min-width: 200px; text-align: right; font-variant-numeric: tabular-nums; color: var(--mp-text-default); }
.wod-summary-row--total { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
</style>
