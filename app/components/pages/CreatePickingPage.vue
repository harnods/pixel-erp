<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import {
  MpButton, MpCheckbox, MpAutocomplete, MpSpinner, MpTooltip, MpIcon,
  MpFormControl, MpFormLabel, MpFormErrorMessage, css, toast,
} from '@mekari/pixel3'
import ProductCell from '~/components/patterns/ProductCell.vue'
import ManageBatchDrawer, { type CommittedBatch } from '~/components/patterns/ManageBatchDrawer.vue'
import ManageSerialDrawer, { type CommittedSerial } from '~/components/patterns/ManageSerialDrawer.vue'
import { pickableOrders, type OutgoingOrder } from '~/data/outgoing'
import {
  addPickingTask, pickedQtyForOrderSku, type PickingLine,
  type PickingBatchPick, type PickingSerialPick,
} from '~/data/pickingTasks'
import { orderSkuLines, productBySku } from '~/data/inventory'
import { binForSku, getWarehouseDetail, getReservationsForOrder } from '~/data/warehouseDetails'
import { getWarehouseConfig } from '~/data/warehouseConfig'
import { getWarehouseOperators } from '~/data/warehouseTeam'
import { stockLocationPaths } from '~/data/storageLocations'
import { scrollToFirstError } from '~/utils/form'

const router = useRouter()
const route  = useRoute()

// ─── Pickable orders (open / in progress) ──────────────────────────────────────
const allPickable = computed<OutgoingOrder[]>(() => pickableOrders())

// Only warehouses that actually have pickable orders
const availableWarehouses = computed(() => {
  const seen = new Set<string>()
  const list: { id: string; name: string }[] = []
  for (const o of allPickable.value) {
    if (!seen.has(o.warehouseId)) {
      seen.add(o.warehouseId)
      list.push({ id: o.warehouseId, name: o.warehouseName })
    }
  }
  return list
})

// ─── Prefill from query (when opened from the Outgoing index: row / bulk) ───────
// Initialized at setup (before the clearing watcher is active) so the navigated
// warehouse + sales orders come in already selected.
const prefillWarehouse = (route.query.warehouseId as string | undefined) ?? ''
const prefillOrderIds = ((route.query.orderIds as string | undefined)?.split(',').filter(Boolean)) ?? []

// ─── Warehouse selector ────────────────────────────────────────────────────────
const warehouseId = ref(prefillWarehouse)
const warehouseError = ref(false)
const isSaving = ref(false)
// User changing the warehouse resets the order selection (initial value doesn't fire).
watch(warehouseId, (v) => { if (v) warehouseError.value = false })
// Assignee options are scoped to the selected warehouse's operators — a stale
// pick from a previous warehouse is no longer valid, so clear it on change.
watch(warehouseId, () => { assigneeId.value = '' })
const warehouseName = computed(() =>
  availableWarehouses.value.find(w => w.id === warehouseId.value)?.name ?? '',
)
const isWarehouseLocked = computed(() => !!route.query.warehouseId)

// stockLocationPaths() repeats a bin once per unit of capacity — dedupe before use as
// a dropdown's option list (same fix as PutAwayItemsPage.vue / PickItemsPage.vue).
const locationOptions = computed(() => {
  if (!warehouseId.value) return []
  return [...new Set(stockLocationPaths(warehouseId.value).filter(Boolean))]
})

// ─── Batch / serial helpers (same heuristic as receiving / put-away / picking) ───
const BATCH_CATS = new Set(['Green Beans', 'Roasted Beans'])
const SERIAL_CATS = new Set(['Espresso Machine', 'Grinder', 'Equipment'])
const stockMap = computed(() => {
  const wh = getWarehouseDetail(warehouseId.value)
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

// ─── Assignee ───────────────────────────────────────────────────────────────────
const assigneeId    = ref('')
const assigneeError = ref(false)
watch(assigneeId, (v) => { if (v) assigneeError.value = false })
// Assignee can only be an operator of the selected warehouse.
const ASSIGNEES = computed(() => getWarehouseOperators(warehouseId.value))
const assigneeLabel = computed(() => ASSIGNEES.value.find(a => a.id === assigneeId.value)?.name ?? '')

// ─── Orders to pick — fixed from the selection made on the Outgoing tab ──────────
// The sales orders are chosen on the Outgoing list (row / bulk "Create picking list")
// and passed in via the query; this form no longer lets you change that selection.
const selectedOrders = computed<OutgoingOrder[]>(() =>
  allPickable.value.filter(o => prefillOrderIds.includes(o.id)),
)

// ─── Picking list per sales order ───────────────────────────────────────────────
// Each selected order is exploded into its own SKU lines (deterministic from the
// catalog). Picking is reviewed PER ORDER, so each order gets its own table.
function hashStr(s: string): number {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

// Warehouse stock per SKU (deterministic). A WMS prevents overselling, so stock is
// normally plentiful; ~1 in 6 SKUs is genuinely low. Available = On hand − Reserved
// (reserved = committed to other orders outside this picking list).
function onHandForSku(sku: string): number {
  const h = hashStr(sku)
  return h % 6 === 0 ? (h % 30) + 8 : (h % 120) + 80 // low (8–37) vs healthy (80–199)
}
function reservedForSku(sku: string): number {
  const oh = onHandForSku(sku)
  return Math.round((oh * (hashStr(sku + 'r') % 30)) / 100) // 0–29% committed elsewhere
}

interface SkuLine { sku: string; product: string; desc: string; img: string; unit: string; qty: number; picked: number; bin: string }

function orderLines(o: OutgoingOrder): SkuLine[] {
  // SKUs + qty come from the product DB (drawn from what this warehouse stocks), so
  // each line maps to a real bin — same source picking/packing use downstream.
  // `qty` = the FULL order demand; `picked` = what's already been picked for this
  // order+SKU on earlier lists. SKUs already fully picked are dropped (nothing left).
  const lines: SkuLine[] = []
  for (const l of orderSkuLines(o)) {
    const picked = pickedQtyForOrderSku(o.id, l.sku)
    if (l.qty - picked <= 0) continue
    lines.push({
      sku: l.sku, product: l.product.name, desc: l.product.desc, img: l.product.img,
      unit: l.product.unit, qty: l.qty, picked, bin: binForSku(o.warehouseId, l.sku),
    })
  }
  // order each table by storage location so the picker route is ordered
  return lines.sort((a, b) => a.bin.localeCompare(b.bin))
}

interface PickLine extends SkuLine { key: string }
interface OrderTable { order: OutgoingOrder; lines: PickLine[] }
const orderTables = computed<OrderTable[]>(() =>
  selectedOrders.value.map(o => ({
    order: o,
    lines: orderLines(o).map(l => ({ ...l, key: `${o.id}::${l.sku}` })),
  })),
)

// ─── Supervisor edits: include/exclude ANY SKU (checkbox, default on) + edit qty ──
// A picking list can cover any subset of SKUs regardless of whether an order is a
// marketplace order — the marketplace "must be complete" rule is enforced later, at
// packing-task creation, not here.
const excludedKeys = ref(new Set<string>())
const qtyOverrides = ref<Record<string, number>>({})
// When the warehouse doesn't allow partial picking, every SKU must be picked in
// full — nothing can be excluded and qty can't be lowered below the order qty.
const partialPickingAllowed = computed(() =>
  warehouseId.value ? getWarehouseConfig(warehouseId.value).allowPartialPicking : true,
)
const lockedKeys = computed(() =>
  partialPickingAllowed.value ? new Set<string>() : new Set(pickRows.value.map(g => g.key)),
)
const partialPickingLockedMsg = "This warehouse doesn't allow partial picking."
function isLocked(key: string) { return lockedKeys.value.has(key) }
function isSelected(key: string) { return isLocked(key) || !excludedKeys.value.has(key) }
function toggleLine(key: string) {
  if (isLocked(key)) return
  const s = new Set(excludedKeys.value)
  s.has(key) ? s.delete(key) : s.add(key)
  excludedKeys.value = s
}
// To pick is clamped to [0, cap] — can't pick more than the combined ordered qty,
// nor more than the available stock for that SKU.
function setQty(key: string, val: string, cap: number) {
  const n = Math.min(cap, Math.max(0, Math.floor(Number(val) || 0)))
  qtyOverrides.value = { ...qtyOverrides.value, [key]: n }
}

// ─── Picking list rows — merged by SKU across the selected orders ─────────────────
// Picking is by SKU + storage location, so the same SKU ordered on several sales
// orders is collected as ONE line (Order qty = the combined demand). Each merged row
// keeps its per-order members so the picked qty can be split back per order at save.
interface MergedRow {
  sku: string; product: string; desc: string; img: string; unit: string; bin: string
  key: string            // the SKU — unique per merged row
  orderQty: number       // combined ordered qty across orders
  pickedQty: number      // combined qty already picked on earlier lists
  members: { orderId: string; salesNo: string; qty: number }[]
}
const pickRows = computed<MergedRow[]>(() => {
  const map = new Map<string, MergedRow>()
  for (const t of orderTables.value) {
    for (const l of t.lines) {
      let g = map.get(l.sku)
      if (!g) {
        g = { sku: l.sku, product: l.product, desc: l.desc, img: l.img, unit: l.unit, bin: l.bin, key: l.sku, orderQty: 0, pickedQty: 0, members: [] }
        map.set(l.sku, g)
      }
      g.orderQty += l.qty
      g.pickedQty += l.picked
      g.members.push({ orderId: t.order.id, salesNo: t.order.salesNo, qty: l.qty })
    }
  }
  // storage-location order keeps the picker route tidy
  return [...map.values()].sort((a, b) => a.bin.localeCompare(b.bin))
})
// True once any SKU has been partially picked on a previous list → show Picked qty column.
const hasPriorPicks = computed(() => pickRows.value.some(g => g.pickedQty > 0))
// Any batch/serial-tracked row splits its Qty to pick cell into 2 rows — once that
// happens, every column gets left/right borders so the split reads as part of the grid.
const hasTrackedRows = computed(() => pickRows.value.some(g => isBatchTrackedSku(g.sku) || isSerialTrackedSku(g.sku)))

// ─── Stock per merged SKU — one pool (On hand − Reserved); cap = min(demand, avail) ─
interface RowStock { onHand: number; reserved: number; available: number; cap: number; toPick: number }
const rowStock = computed<Map<string, RowStock>>(() => {
  const map = new Map<string, RowStock>()
  for (const g of pickRows.value) {
    const onHand = onHandForSku(g.sku)
    const reserved = reservedForSku(g.sku)
    const available = Math.max(0, onHand - reserved)
    // Can't pick more than what's still outstanding (order qty − already picked), nor
    // more than what's available in stock.
    const remaining = Math.max(0, g.orderQty - g.pickedQty)
    const cap = Math.min(remaining, available)
    const selected = isSelected(g.key)
    // Locked rows always pick the full cap — qty overrides never apply to them,
    // even a stale one left over from a different (partial-allowed) warehouse.
    const desired = isLocked(g.key) ? cap : (qtyOverrides.value[g.key] ?? cap)
    const toPick = selected ? Math.min(Math.max(0, desired), cap) : 0
    map.set(g.key, { onHand, reserved, available, cap, toPick })
  }
  return map
})
function stockOf(key: string): RowStock {
  return rowStock.value.get(key) ?? { onHand: 0, reserved: 0, available: 0, cap: 0, toPick: 0 }
}

// ─── Manage batch / Manage serial number — decide up front, at creation, which
// batch(es)/serial(s) to pick and from where, so the operator already has a plan to
// follow when they walk the warehouse floor. Keyed by SKU (rows here are merged
// across orders — the per-order split happens later, in handleCreate). ────────────
const batchLinesBySku  = ref<Record<string, CommittedBatch[]>>({})
const serialLinesBySku = ref<Record<string, PickingSerialPick[]>>({})
// Skus the operator has explicitly reviewed/edited via the drawer — once touched,
// the auto-select watcher below stops overwriting that sku (manual choice wins).
const manuallyEditedBatchSkus  = new Set<string>()
const manuallyEditedSerialSkus = new Set<string>()

function locationForSerial(sku: string, serial: string): string {
  const sr = stockMap.value.get(sku)?.serials
  return sr?.available.find(u => u.serial === serial)?.location
    ?? sr?.reserved.find(u => u.serial === serial)?.location
    ?? ''
}

const batchDrawerSku = ref<string | null>(null)
const batchDrawerOpen = computed({
  get: () => batchDrawerSku.value !== null,
  set: (v: boolean) => { if (!v) batchDrawerSku.value = null },
})
function openBatchDrawer(sku: string) { batchDrawerSku.value = sku }
function batchPickedQty(sku: string): number {
  return (batchLinesBySku.value[sku] ?? []).reduce((s, b) => s + (b.counted ?? 0), 0)
}
function saveBatchLines(batches: CommittedBatch[]) {
  const sku = batchDrawerSku.value
  if (!sku) return
  manuallyEditedBatchSkus.add(sku)
  batchLinesBySku.value = { ...batchLinesBySku.value, [sku]: batches }
}

const serialDrawerSku = ref<string | null>(null)
const serialDrawerOpen = computed({
  get: () => serialDrawerSku.value !== null,
  set: (v: boolean) => { if (!v) serialDrawerSku.value = null },
})
/** Target qty for a row's Manage batch/serial drawer — defaults to the full cap
 *  (= order qty, when stock allows), overridable when partial picking is allowed. */
function targetQtyForSku(sku: string): number {
  return isLocked(sku) ? capForSku(sku) : (qtyOverrides.value[sku] ?? capForSku(sku))
}
function openSerialDrawer(sku: string) {
  if (!targetQtyForSku(sku)) {
    toast.notify({ variant: 'error', title: 'Enter qty to pick first' , maxWidth: 'max-content'})
    return
  }
  serialDrawerSku.value = sku
}
function serialPickedQty(sku: string): number {
  return (serialLinesBySku.value[sku] ?? []).length
}
function saveSerialLines(serials: CommittedSerial[]) {
  const sku = serialDrawerSku.value
  if (!sku) return
  manuallyEditedSerialSkus.add(sku)
  serialLinesBySku.value = {
    ...serialLinesBySku.value,
    [sku]: serials.map(s => ({ serial: s.serial, location: locationForSerial(sku, s.serial) })),
  }
}

// ─── Pre-fill batch/serial from each member order's EXISTING reservation ───────
// Every batch/serial-tracked SKU was already reserved (FEFO / ascending / etc, per
// Settings > Warehouse) the moment its order was created — picking just reads that
// plan back, it never computes a fresh one. A merged row can span several orders,
// so its pre-fill is the sum of every member order's own (order, sku) reservation.
// Skips any sku the operator has already touched via the drawer.
function reservedBatchesForSku(sku: string): CommittedBatch[] {
  const item = stockMap.value.get(sku)
  const members = pickRows.value.find(g => g.sku === sku)?.members ?? []
  if (!item?.batches?.length) return []
  const byBatch = new Map<string, number>()
  for (const m of members) {
    for (const r of getReservationsForOrder(m.orderId, sku)) {
      if (!r.batchNo) continue
      byBatch.set(r.batchNo, (byBatch.get(r.batchNo) ?? 0) + r.qty)
    }
  }
  const out: CommittedBatch[] = []
  for (const [batchNo, qty] of byBatch) {
    const b = item.batches.find(x => x.batchNo === batchNo)
    if (!b || qty <= 0) continue
    out.push({ key: batchNo, batchNo, expiryDate: b.expiryDate, desc: '', onHand: b.onHand, counted: qty, unit: item.unit, location: b.location })
  }
  return out
}
function reservedSerialsForSku(sku: string): PickingSerialPick[] {
  const members = pickRows.value.find(g => g.sku === sku)?.members ?? []
  const out: PickingSerialPick[] = []
  for (const m of members) {
    for (const r of getReservationsForOrder(m.orderId, sku)) {
      for (const serial of r.serials ?? []) out.push({ serial, location: locationForSerial(sku, serial) })
    }
  }
  return out
}
const trackedSkus = computed(() => {
  const set = new Set<string>()
  for (const g of pickRows.value) {
    if (isBatchTrackedSku(g.sku) || isSerialTrackedSku(g.sku)) set.add(g.sku)
  }
  return set
})
watch(trackedSkus, (skus) => {
  for (const sku of skus) {
    if (isBatchTrackedSku(sku)) {
      if (manuallyEditedBatchSkus.has(sku)) continue
      batchLinesBySku.value = { ...batchLinesBySku.value, [sku]: reservedBatchesForSku(sku) }
    } else {
      if (manuallyEditedSerialSkus.has(sku)) continue
      serialLinesBySku.value = { ...serialLinesBySku.value, [sku]: reservedSerialsForSku(sku) }
    }
  }
}, { immediate: true })

/** Read-only bin list for the Storage location column, batch/serial-tracked SKUs only. */
function pickedLocations(sku: string): string[] {
  const bins = new Set<string>()
  if (isBatchTrackedSku(sku)) {
    for (const b of batchLinesBySku.value[sku] ?? []) if ((b.counted ?? 0) > 0 && b.location) bins.add(b.location)
  } else if (isSerialTrackedSku(sku)) {
    for (const s of serialLinesBySku.value[sku] ?? []) if (s.location) bins.add(s.location)
  }
  return [...bins]
}

/** Qty to pick for a row — batch/serial-tracked SKUs source it from their drawer
 *  selections, plain SKUs from the manual qty input. */
function qtyToPick(row: { key: string; sku: string }): number {
  if (!isSelected(row.key)) return 0
  if (isBatchTrackedSku(row.sku)) return batchPickedQty(row.sku)
  if (isSerialTrackedSku(row.sku)) return serialPickedQty(row.sku)
  return stockOf(row.key).toPick
}

/** Max qty pickable for a SKU (stock cap) — used as the drawer's targetCount ceiling. */
function capForSku(sku: string): number {
  const row = pickRows.value.find(r => r.sku === sku)
  return row ? stockOf(row.key).cap : 0
}

// Select-all across the merged rows
const allLinesSelected = computed(() => pickRows.value.length > 0 && pickRows.value.every(g => isSelected(g.key)))
const someLinesSelected = computed(() => {
  const sel = pickRows.value.filter(g => isSelected(g.key)).length
  return sel > 0 && sel < pickRows.value.length
})
const allLinesLocked = computed(() => pickRows.value.length > 0 && pickRows.value.every(g => isLocked(g.key)))
function toggleAllLines() {
  if (allLinesLocked.value) return
  const s = new Set(excludedKeys.value)
  // Locked (marketplace) rows can never be excluded.
  if (allLinesSelected.value) pickRows.value.forEach(g => { if (!isLocked(g.key)) s.add(g.key) })
  else pickRows.value.forEach(g => s.delete(g.key))
  excludedKeys.value = s
}

const selectedRows = computed(() => pickRows.value.filter(g => isSelected(g.key)))
const totalSkus   = computed(() => selectedRows.value.length)
const totalToPick = computed(() => selectedRows.value.reduce((a, g) => a + qtyToPick(g), 0))

// ─── Progressive loading — 10 rows, lazy-load past that; border only when > 10 ────
const PAGE_SIZE = 10
const shownCount = ref(PAGE_SIZE)
const loadingMore = ref(false)
const visibleRows = computed(() => pickRows.value.slice(0, shownCount.value))
const hasMoreRows = computed(() => shownCount.value < pickRows.value.length)

function loadMoreRows() {
  if (loadingMore.value || !hasMoreRows.value) return
  loadingMore.value = true
  setTimeout(() => {
    shownCount.value = Math.min(shownCount.value + PAGE_SIZE, pickRows.value.length)
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
    (entries) => { if (entries[0]!.isIntersecting) loadMoreRows() },
    { root: itemsScrollEl.value, rootMargin: '0px 0px 120px 0px' },
  )
  itemsObserver.observe(itemsSentinelEl.value)
}
onMounted(() => nextTick(setupItemsObserver))
onUnmounted(() => itemsObserver?.disconnect())
watch(() => pickRows.value.length, () => {
  shownCount.value = PAGE_SIZE
  nextTick(() => {
    if (itemsScrollEl.value) itemsScrollEl.value.scrollTop = 0
    setupItemsObserver()
    checkItemsOverflow()
  })
})
watch(shownCount, () => nextTick(checkItemsOverflow))

// ─── Footer divider ────────────────────────────────────────────────────────────
const stageEl = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)
function checkStageOverflow() {
  const el = stageEl.value
  if (el) stageOverflowing.value = el.scrollHeight > el.clientHeight + 1
}
// The items table gets an outer border only once its scroll area actually overflows.
const itemsOverflowing = ref(false)
function checkItemsOverflow() { const el = itemsScrollEl.value; itemsOverflowing.value = !!el && el.scrollHeight > el.clientHeight + 1 }
let stageObserver: ResizeObserver | null = null
let itemsResizeObserver: ResizeObserver | null = null
onMounted(() => {
  nextTick(() => {
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
  stageObserver?.disconnect()
  itemsResizeObserver?.disconnect()
  stageEl.value?.removeEventListener('scroll', checkStageOverflow)
})
watch(selectedOrders, () => nextTick(() => { checkStageOverflow(); checkItemsOverflow() }))

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatNum(n: number) { return n.toLocaleString('id-ID') }

function goBack() {
  const from = route.query.from as string | undefined
  if (from?.startsWith('order:')) {
    router.push(`/outbound-delivery/${from.slice(6)}`)
  } else {
    router.push('/outbound-delivery?tab=Requests')
  }
}

async function handleCreate() {
  let valid = true
  if (!warehouseId.value) { warehouseError.value = true; valid = false }
  if (!assigneeId.value)  { assigneeError.value  = true; valid = false }
  if (!selectedOrders.value.length) valid = false
  if (!valid) { scrollToFirstError(); return }
  isSaving.value = true
  await new Promise(r => setTimeout(r, 600))

  // Build the planned pick lines from the merged SKU rows. The picking list is shown
  // merged, but downstream packing sorts back per sales order — so each SKU's To-pick
  // qty is split across its member orders (filled order-by-order up to each demand).
  // Batch/serial-tracked SKUs also carry their chosen batch(es)/serial(s) along for
  // the ride, consumed from the same pool in the same order the qty is allocated.
  const lines: PickingLine[] = []
  const batchPicks: Record<string, PickingBatchPick[]> = {}
  const serialPicks: Record<string, PickingSerialPick[]> = {}
  for (const g of pickRows.value) {
    if (!isSelected(g.key)) continue
    let remaining = qtyToPick(g)
    if (remaining <= 0) continue

    const batchChunks = (batchLinesBySku.value[g.sku] ?? [])
      .filter(b => (b.counted ?? 0) > 0)
      .map(b => ({ batchNo: b.batchNo, expiryDate: b.expiryDate, desc: b.desc, unit: b.unit, location: b.location ?? '', qty: b.counted ?? 0 }))
    let batchIdx = 0
    const serialQueue = serialLinesBySku.value[g.sku] ?? []
    let serialIdx = 0

    for (const m of g.members) {
      const alloc = Math.min(m.qty, remaining)
      if (alloc <= 0) continue
      remaining -= alloc
      const lineKey = `${m.orderId}::${g.sku}`
      lines.push({
        key: lineKey, orderId: m.orderId, salesNo: m.salesNo,
        sku: g.sku, product: g.product, desc: g.desc, img: g.img,
        unit: g.unit, bin: g.bin, qty: alloc,
      })

      if (batchChunks.length) {
        let need = alloc
        const picks: PickingBatchPick[] = []
        while (need > 0 && batchIdx < batchChunks.length) {
          const chunk = batchChunks[batchIdx]!
          const take = Math.min(need, chunk.qty)
          if (take > 0) {
            picks.push({ batchNo: chunk.batchNo, expiryDate: chunk.expiryDate, desc: chunk.desc, unit: chunk.unit, location: chunk.location, qty: take })
            chunk.qty -= take
            need -= take
          }
          if (chunk.qty <= 0) batchIdx++
        }
        if (picks.length) batchPicks[lineKey] = picks
      }

      if (serialQueue.length) {
        const take = serialQueue.slice(serialIdx, serialIdx + alloc)
        serialIdx += take.length
        if (take.length) serialPicks[lineKey] = take
      }
    }
  }

  // Only SKUs the operator actually touched in the drawer re-pin their order's
  // reservation — untouched lines keep whatever was already reserved at order creation.
  const skuOf = (lineKey: string) => lineKey.slice(lineKey.indexOf('::') + 2)
  const overrideBatchPicks: Record<string, PickingBatchPick[]> = {}
  const overrideSerialPicks: Record<string, PickingSerialPick[]> = {}
  for (const [lineKey, picks] of Object.entries(batchPicks)) {
    if (manuallyEditedBatchSkus.has(skuOf(lineKey))) overrideBatchPicks[lineKey] = picks
  }
  for (const [lineKey, picks] of Object.entries(serialPicks)) {
    if (manuallyEditedSerialSkus.has(skuOf(lineKey))) overrideSerialPicks[lineKey] = picks
  }

  addPickingTask({
    salesOrderIds: selectedOrders.value.map(o => o.id),
    salesNos:      selectedOrders.value.map(o => o.salesNo),
    warehouseId:   warehouseId.value,
    warehouseName: warehouseName.value,
    assignee:      assigneeLabel.value,
    lines,
    ...(Object.keys(overrideBatchPicks).length || Object.keys(overrideSerialPicks).length
      ? { overrides: { batchPicks: overrideBatchPicks, serialPicks: overrideSerialPicks } }
      : {}),
  })

  router.push({ path: '/outbound-delivery', query: { tab: 'Picking', saved: '1' } })
}
</script>

<template>
  <div class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb" @click="goBack">{{ (route.query.from as string)?.startsWith('order:') ? 'Order details' : 'Picking' }}</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">New picking list</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">

      <!-- Warehouse + Assignee -->
      <div class="pk-section pk-grid">
        <MpFormControl id="pk-warehouse" is-required :is-invalid="warehouseError" :class="css({ gridColumn: 'span 3' })">
          <MpFormLabel>Warehouse</MpFormLabel>
          <MpAutocomplete
            id="pk-warehouse-ac"
            v-model="warehouseId"
            :data="availableWarehouses"
            label-prop="name"
            value-prop="id"
            placeholder="Select warehouse"
            is-searchable use-portal is-full-width
            :is-clearable="!isWarehouseLocked"
            :is-disabled="isWarehouseLocked"
            :is-invalid="warehouseError"
          />
          <MpFormErrorMessage>You must select a warehouse</MpFormErrorMessage>
        </MpFormControl>

        <MpFormControl id="pk-assignee" is-required :is-invalid="assigneeError" :class="css({ gridColumn: 'span 3' })">
          <MpFormLabel>Assignee</MpFormLabel>
          <MpAutocomplete
            id="pk-assignee-ac"
            v-model="assigneeId"
            :data="ASSIGNEES"
            label-prop="name"
            value-prop="id"
            placeholder="Select assignee"
            is-searchable is-clearable use-portal is-full-width
            :is-invalid="assigneeError"
          >
            <template #default="{ item }">
              <div class="pk-assignee-opt">
                <span
                  class="pk-assignee-avatar"
                  :style="{ background: `hsl(${item.hue},50%,88%)`, color: `hsl(${item.hue},55%,35%)` }"
                >{{ item.initials }}</span>
                {{ item.name }}
              </div>
            </template>
          </MpAutocomplete>
          <MpFormErrorMessage>You must select an assignee</MpFormErrorMessage>
        </MpFormControl>
      </div>

      <!-- Picking list — a single list across the selected orders (sales order no.
           is irrelevant to picking; lines are ordered by storage location) -->
      <div v-if="selectedOrders.length" class="pk-sku-section">
        <h2 class="pk-section-title">Picking list</h2>
        <p class="pk-section-desc">Items to collect for this picking list. Pick any subset of SKUs and set the quantity to pick for each line.</p>
        <div class="pk-summary">
          <div class="pk-stat">
            <span class="pk-stat-label">Orders</span>
            <span class="pk-stat-val">{{ formatNum(selectedOrders.length) }}</span>
          </div>
          <div class="pk-stat">
            <span class="pk-stat-label">SKU qty</span>
            <span class="pk-stat-val">{{ formatNum(totalSkus) }}</span>
          </div>
          <div class="pk-stat">
            <span class="pk-stat-label">To pick qty</span>
            <span class="pk-stat-val">{{ formatNum(totalToPick) }}</span>
          </div>
        </div>

        <section class="pk-items-section" :class="{ 'pk-items-section--bordered': itemsOverflowing }">
          <div ref="itemsScrollEl" class="pk-items-scroll">
            <table class="pk-items">
              <colgroup>
                <col /><!-- Product (+ checkbox) -->
                <col /><!-- SKU -->
                <col style="width: 170px" /><!-- Storage location -->
                <col /><!-- Order qty -->
                <col v-if="hasPriorPicks" /><!-- Picked qty -->
                <col /><!-- Qty to pick -->
                <col style="width: 100px" /><!-- Unit -->
                <col style="width: 48px" /><!-- Action -->
              </colgroup>
              <thead>
                <tr>
                  <th class="pk-th pk-th--product-check">
                    <div class="pk-check-wrap">
                      <MpTooltip
                        v-if="allLinesLocked"
                        id="pk-lock-all-tt"
                        :label="partialPickingLockedMsg"
                        placement="top"
                        use-portal
                      >
                        <span @click.stop>
                          <MpCheckbox id="pk-all-lines" :is-checked="true" :is-disabled="true" />
                        </span>
                      </MpTooltip>
                      <span v-else @click.stop>
                        <MpCheckbox
                          id="pk-all-lines"
                          :is-checked="allLinesSelected"
                          :is-indeterminate="someLinesSelected"
                          :is-disabled="allLinesLocked"
                          @change="toggleAllLines"
                        />
                      </span>
                      <span>Product</span>
                    </div>
                  </th>
                  <th class="pk-th">SKU</th>
                  <th class="pk-th">Storage location</th>
                  <th class="pk-th pk-th--num">Order qty</th>
                  <th v-if="hasPriorPicks" class="pk-th pk-th--num">Picked qty</th>
                  <th class="pk-th pk-th--num">Qty to pick</th>
                  <th class="pk-th">Unit</th>
                  <th class="pk-th"></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in visibleRows"
                  :key="row.key"
                  class="pk-item-row"
                  :class="{ 'pk-item-row--off': !isSelected(row.key) }"
                >
                  <td class="pk-td">
                    <div class="pk-check-wrap">
                      <MpTooltip
                        v-if="isLocked(row.key)"
                        :id="`pk-lock-${row.key}`"
                        :label="partialPickingLockedMsg"
                        placement="top"
                        use-portal
                      >
                        <span @click.stop>
                          <MpCheckbox :id="`pk-line-${row.key}`" :is-checked="true" :is-disabled="true" />
                        </span>
                      </MpTooltip>
                      <span v-else @click.stop>
                        <MpCheckbox
                          :id="`pk-line-${row.key}`"
                          :is-checked="isSelected(row.key)"
                          :is-disabled="isLocked(row.key)"
                          @change="toggleLine(row.key)"
                        />
                      </span>
                      <ProductCell :name="row.product" :desc="row.desc" :image="row.img" />
                    </div>
                  </td>
                  <td class="pk-td"><span class="pk-sku-text">{{ row.sku }}</span></td>

                  <!-- Storage location: shown as -- for batch/serial-tracked SKUs
                       (their location is managed inside the drawer, per batch/serial unit). -->
                  <td v-if="isBatchTrackedSku(row.sku) || isSerialTrackedSku(row.sku)" class="pk-td">
                    <span class="pk-loc-text">—</span>
                  </td>
                  <td v-else class="pk-td"><span class="pk-loc-text">{{ row.bin }}</span></td>

                  <td class="pk-td pk-td--num">{{ formatNum(row.orderQty) }}</td>
                  <td v-if="hasPriorPicks" class="pk-td pk-td--num">{{ formatNum(row.pickedQty) }}</td>

                  <!-- Qty to pick: plain value for batch-tracked SKUs (total from drawer),
                       input for serial-tracked SKUs, input for plain SKUs. -->
                  <td v-if="isBatchTrackedSku(row.sku)" class="pk-td pk-td--num">
                    <span class="pk-batch-val">{{ formatNum(batchPickedQty(row.sku)) }}</span>
                  </td>
                  <td v-else-if="isSerialTrackedSku(row.sku)" class="pk-td pk-td--input">
                    <input
                      type="number" min="0" :max="stockOf(row.key).cap" class="pk-batch-qty-input"
                      :value="targetQtyForSku(row.sku)"
                      :disabled="!isSelected(row.key) || isLocked(row.key)"
                      :title="isLocked(row.key) ? partialPickingLockedMsg : undefined"
                      :aria-label="`Qty to pick for ${row.product}`"
                      @input="setQty(row.sku, ($event.target as HTMLInputElement).value, stockOf(row.key).cap)"
                      @click.stop
                    />
                  </td>
                  <td v-else class="pk-td pk-td--input">
                    <input
                      type="number" min="0" :max="stockOf(row.key).cap" class="pk-qty-input"
                      :value="stockOf(row.key).toPick"
                      :disabled="!isSelected(row.key) || isLocked(row.key)"
                      :title="isLocked(row.key) ? partialPickingLockedMsg : undefined"
                      @input="setQty(row.key, ($event.target as HTMLInputElement).value, stockOf(row.key).cap)"
                      @click.stop
                    />
                  </td>

                  <td class="pk-td">{{ row.unit }}</td>

                  <!-- Action column: icon button for batch / serial management -->
                  <td v-if="isBatchTrackedSku(row.sku)" class="pk-td pk-td--action">
                    <MpTooltip :id="`tt-batch-${row.sku}`" label="Manage batch" placement="top" use-portal>
                      <button class="pk-manage-icon-btn" type="button" @click.stop="openBatchDrawer(row.sku)">
                        <MpIcon name="competencies" size="md" />
                      </button>
                    </MpTooltip>
                  </td>
                  <td v-else-if="isSerialTrackedSku(row.sku)" class="pk-td pk-td--action">
                    <MpTooltip :id="`tt-serial-${row.sku}`" label="Manage serial numbers" placement="top" use-portal>
                      <button class="pk-manage-icon-btn" type="button" @click.stop="openSerialDrawer(row.sku)">
                        <MpIcon name="competencies" size="md" />
                      </button>
                    </MpTooltip>
                  </td>
                  <td v-else class="pk-td pk-td--action"></td>
                </tr>
              </tbody>
            </table>
            <div ref="itemsSentinelEl" class="pk-items-sentinel" aria-hidden="true" />
            <div v-if="loadingMore" class="pk-loading pk-items-loading">
              <MpSpinner size="sm" /> Loading SKUs…
            </div>
            <div class="pk-items-count">
              <span>Showing {{ visibleRows.length }} of {{ pickRows.length }} SKUs</span>
            </div>
          </div>
        </section>
      </div>

    </div><!-- /detail-stage -->

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer" :class="{ 'detail-footer--floating': itemsOverflowing }">
      <MpButton variant="ghost" is-rounded @click="goBack">Cancel</MpButton>
      <MpButton variant="primary" is-rounded :is-disabled="isSaving" @click="handleCreate">{{ isSaving ? 'Saving…' : 'Save' }}</MpButton>
    </footer>
  </div>

  <ManageBatchDrawer
    v-if="batchDrawerSku"
    :open="batchDrawerOpen"
    :sku="batchDrawerSku"
    :warehouse-id="warehouseId"
    kind="picking"
    :origin-location-paths="locationOptions"
    :target-count="capForSku(batchDrawerSku)"
    :model-value="batchLinesBySku[batchDrawerSku] ?? []"
    @update:open="batchDrawerOpen = $event"
    @save="saveBatchLines"
  />
  <ManageSerialDrawer
    v-if="serialDrawerSku"
    :open="true"
    :sku="serialDrawerSku"
    :warehouse-id="warehouseId"
    kind="picking"
    :target-count="targetQtyForSku(serialDrawerSku)"
    :origin-location-paths="locationOptions"
    :model-value="(serialLinesBySku[serialDrawerSku] ?? []).map(s => ({ serial: s.serial }))"
    @update:open="serialDrawerOpen = $event"
    @save="saveSerialLines"
  />
</template>

<style scoped>
/* ── Page shell ─────────────────────────────────────────────────────────────── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb-trail { display: flex; align-items: center; gap: var(--mp-spacing-1); align-self: flex-start; }
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
.detail-stage {
  flex: 1; min-height: 0; overflow: hidden;
  display: flex; flex-direction: column;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
}
.detail-footer {
  flex-shrink: 0;
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage);
  border-top: 1px solid transparent;
}
.detail-footer--floating { border-top-color: var(--mp-border-default); }

/* ── Section / form grid ─────────────────────────────────────────────────────── */
.pk-section { margin-bottom: var(--mp-spacing-6); flex-shrink: 0; }
.pk-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: var(--mp-spacing-4); max-width: 558px; }
.pk-assignee-opt { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.pk-assignee-avatar {
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px);
  border-radius: var(--mp-radii-full); flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: var(--mp-font-sizes-xs); font-weight: var(--mp-font-weights-semi-bold);
}

/* ── Section title ───────────────────────────────────────────────────────────── */
.pk-section-title {
  margin: 0;
  font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default);
}
.pk-section-desc {
  margin: 0;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-md);
}
.pk-tasks-section .pk-section-title { margin-bottom: var(--mp-spacing-5); }
.pk-sku-section .pk-section-title { margin-bottom: 0; }
.pk-sku-section .pk-section-desc { margin-bottom: var(--mp-spacing-5); }

/* ── Sections ────────────────────────────────────────────────────────────────── */
.pk-tasks-section { margin-bottom: var(--mp-spacing-6); }
.pk-sku-section { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.pk-tasks-error {
  margin: 0 0 var(--mp-spacing-3) 0;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #c0392b);
}

.pk-tasks-table-wrap { border-radius: var(--mp-radii-lg); overflow: hidden; }
.pk-tasks-table-wrap--bordered { border: 1px solid var(--mp-border-bold); }
.pk-tasks-table { width: 100%; table-layout: auto; border-collapse: collapse; }

/* ── Table header ─────────────────────────────────────────────────────────────── */
.pk-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.pk-th--num {
  text-align: right;
  padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4);
}

/* ── Rows ────────────────────────────────────────────────────────────────────── */
.pk-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); text-align: left;
  border-bottom: 1px solid var(--mp-border-default); vertical-align: top;
}
.pk-task-row { cursor: pointer; transition: background 80ms; }
.pk-task-row:hover .pk-td { background: var(--mp-background-neutral-subtle); }
.pk-cell-check { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.pk-td--num {
  text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums;
  padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4);
}

.pk-summary { display: flex; align-items: flex-start; gap: var(--mp-spacing-10); margin: var(--mp-spacing-4) 0 var(--mp-spacing-5); }
.pk-stat { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: var(--mp-sizes-24, 96px); }
.pk-stat-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pk-stat-val { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }

/* ── Picking list — per-order blocks ─────────────────────────────────────────── */
.pk-order-block { margin-bottom: var(--mp-spacing-5); }
.pk-order-head {
  display: flex; align-items: baseline; gap: var(--mp-spacing-2);
  margin-bottom: var(--mp-spacing-2);
}
.pk-order-no { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pk-order-cust { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pk-short { color: var(--mp-text-danger, #c0392b); font-weight: var(--mp-font-weights-semi-bold); }

/* ── Picking list table ──────────────────────────────────────────────────────── */
.pk-items-section { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.pk-items-section--bordered {
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-lg); overflow: hidden;
}
.pk-items-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: auto; }
.pk-items-sentinel { height: 1px; }
.pk-loading { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); color: var(--mp-text-secondary); }
.pk-items-loading { justify-content: center; padding: var(--mp-spacing-3); }
.pk-items-count {
  display: flex; align-items: center; margin: 0;
  padding: var(--mp-spacing-3) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);

}
.pk-items { width: 100%; table-layout: auto; border-collapse: collapse; }
.pk-items thead .pk-th { position: sticky; top: 0; z-index: 1; }
.pk-sku-text { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pk-loc-text { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pk-check-wrap { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.pk-item-row--off { opacity: 0.45; }

/* Once any row splits its Qty to pick cell (batch/serial-tracked SKU present), every
   column gets left/right borders — no double border, no outer border on the ends. */
.pk-items--split .pk-th { border-right: 1px solid var(--mp-border-default); }
.pk-items--split .pk-th:last-child { border-right: none; }
.pk-items--split .pk-td { border-right: 1px solid var(--mp-border-default); }
.pk-items--split .pk-td:last-child { border-right: none; }

/* Form-table look: grey read-only cells, white editable cell */
.pk-items .pk-td {
  background: var(--mp-background-neutral-subtle);
}
/* Editable qty cell — white, input fills edge-to-edge, focus ring */
.pk-items .pk-td--input { padding: 0; background: var(--mp-background-neutral); }
.pk-items .pk-td--input:focus-within { box-shadow: inset 0 0 0 2px var(--mp-border-focused, #2563eb); }
.pk-qty-input {
  display: block; width: 100%; height: var(--mp-sizes-10, 40px); box-sizing: border-box; text-align: right;
  padding: 0 var(--mp-spacing-2);
  border: none; background: transparent; color: var(--mp-text-default);
  font-size: var(--mp-font-sizes-md); font-variant-numeric: tabular-nums; outline: none;
}
.pk-qty-input:disabled { color: var(--mp-text-disabled); cursor: not-allowed; background: var(--mp-background-neutral-subtle); }

/* Storage location — read-only bin list for batch/serial-tracked SKUs. The flex
   layout lives on an inner wrapper div, not the <td> itself — display:flex directly
   on a <td> breaks the browser's native table-row height stretch. */
.pk-td--location-summary { padding: 0; color: var(--mp-text-default); background: var(--mp-background-neutral-subtle); vertical-align: top; }
.pk-location-summary-wrap { display: flex; flex-direction: column; height: 100%; }
.pk-location-summary-item { display: flex; align-items: center; height: var(--mp-sizes-10, 40px); padding: 0 var(--mp-spacing-2); flex-shrink: 0; }
.pk-location-summary-item:not(:last-child) { border-bottom: 1px solid var(--mp-border-default); }

.pk-batch-val { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.pk-batch-qty-input {
  display: block; width: 100%; height: var(--mp-sizes-10, 40px); box-sizing: border-box;
  padding: 0 var(--mp-spacing-2); border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  text-align: right; font-variant-numeric: tabular-nums;
}
.pk-batch-qty-input:disabled { color: var(--mp-text-disabled); cursor: not-allowed; }

.pk-td--action { padding: 4px var(--mp-spacing-2); vertical-align: top; white-space: nowrap; }
.pk-manage-icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px);
  background: none; border: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary); padding: 0;
}
.pk-manage-icon-btn:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }

/* ── Empty state ─────────────────────────────────────────────────────────────── */
.pk-empty {
  display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-10, 40px) 0;
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-lg);
}
.pk-empty-title {
  margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.pk-empty-desc { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
