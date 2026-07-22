<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { formatDateTimeLong } from '~/utils/date'
import {
  MpSpinner, MpIcon, MpTooltip,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton,
  toast,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import ScanBar from '~/components/patterns/ScanBar.vue'
import ManageBatchDrawer, { type CommittedBatch } from '~/components/patterns/ManageBatchDrawer.vue'
import ManageSerialDrawer, { type CommittedSerial } from '~/components/patterns/ManageSerialDrawer.vue'
import { useUnsavedChangesGuard } from '~/composables/useUnsavedChangesGuard'
import { getPickingLineItems, getPickingGroupedItems, type PickLineItem, type PickGroupItem } from '~/data/pickingTaskDetails'
import {
  getPickingTask, savePickingDraft, endPicking, packableOrderIds,
  orderPickedTotal, orderPickedQtyInTask, orderDemand,
  type PickingBatchPick, type PickingSerialPick, type PickingAssignments,
} from '~/data/pickingTasks'
import { getPackingForOrder } from '~/data/packingTasks'
import { outgoingOrders, isMarketplaceOrder } from '~/data/outgoing'
import { stockLocationPaths } from '~/data/storageLocations'
import { productBySku } from '~/data/inventory'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { getWarehouseConfig, scanRequiredForQty } from '~/data/warehouseConfig'
import { resolveScan, notifyScanError, sameCode } from '~/utils/scan'
import { playScanSuccessSound } from '~/utils/sound'

const props = defineProps<{ orderId: string }>()
const router = useRouter()

const task = computed(() => getPickingTask(props.orderId))
// Below the warehouse's scan threshold, manual qty entry is disabled — the
// operator must scan the barcode once per unit instead (scan handlers already
// only ever +1, so they need no changes; only the manual input is gated).
const warehouseConfig = computed(() => getWarehouseConfig(task.value?.warehouseId ?? ''))
function qtyScanRequired(qty: number): boolean {
  return scanRequiredForQty(warehouseConfig.value, qty)
}
const lineItems = computed(() => task.value ? getPickingLineItems(task.value) : [])
const itemByKey = computed(() => new Map(lineItems.value.map(it => [it.key, it])))
// One row per SKU, merged across every order that contributed it — a task
// bundling the same SKU from 2 orders is one thing for the picker to take, not
// two independent asks. The underlying per-order lines (memberKeys) still drive
// qty entry/scanning/batch-serial assignment, filled order-by-order in sequence.
const groupedItems = computed(() => task.value ? getPickingGroupedItems(task.value) : [])
function groupBySkuCode(skuCode: string): PickGroupItem | null {
  return groupedItems.value.find(g => g.skuCode === skuCode) ?? null
}
/** Storage location(s) to DISPLAY for a group — used only for the unsplit
 *  (0/1-bin) row's location cell, never the row-splitting decision itself
 *  (that stays actual-picks-only, via groupQtyByBin below). Before anything's
 *  actually been picked for a member line, pickedLocations(key) is empty —
 *  but the reservation plan already knows where its batches/serials sit, so
 *  this falls back to that line's own plannedBatchPicks/plannedSerialPicks
 *  instead of showing nothing. */
function pickedLocationsForGroup(group: PickGroupItem): string[] {
  const bins = new Set<string>()
  for (const key of group.memberKeys) {
    const actual = pickedLocations(key)
    if (actual.length) { actual.forEach(loc => bins.add(loc)); continue }
    const item = itemByKey.value.get(key)
    if (!item) continue
    for (const b of item.plannedBatchPicks ?? []) if (b.location) bins.add(b.location)
    for (const s of item.plannedSerialPicks ?? []) if (s.location) bins.add(s.location)
  }
  return [...bins]
}
/** Picked qty for a batch/serial-tracked group, broken down by which bin it was
 *  actually picked from — a batch/serial always sits in exactly ONE fixed bin
 *  (never split, unlike put-away's destination bins), so 2+ bins only ever
 *  show up here because the group bundles 2+ DIFFERENT batches/serials that
 *  happen to live in different locations. Empty/size-1 means nothing to split. */
function groupQtyByBin(group: PickGroupItem): Map<string, number> {
  const map = new Map<string, number>()
  if (isBatchTrackedSku(group.skuCode)) {
    for (const key of group.memberKeys) {
      for (const b of batchLinesByKey.value[key] ?? []) {
        const qty = b.counted ?? 0
        if (qty > 0 && b.location) map.set(b.location, (map.get(b.location) ?? 0) + qty)
      }
    }
  } else if (isSerialTrackedSku(group.skuCode)) {
    for (const key of group.memberKeys) {
      for (const s of serialLinesByKey.value[key] ?? []) {
        if (s.location) map.set(s.location, (map.get(s.location) ?? 0) + 1)
      }
    }
  }
  return map
}
function groupBatchPickedQty(group: PickGroupItem): number {
  return group.memberKeys.reduce((s, k) => s + batchPickedQty(k), 0)
}
function groupSerialPickedQty(group: PickGroupItem): number {
  return group.memberKeys.reduce((s, k) => s + serialPickedQty(k), 0)
}
function groupDraftQty(group: PickGroupItem): number {
  return group.memberKeys.reduce((s, k) => s + (draftQty.value[k] ?? 0), 0)
}
function effectiveGroupPickedQty(group: PickGroupItem): number {
  if (isBatchTrackedSku(group.skuCode)) return groupBatchPickedQty(group)
  if (isSerialTrackedSku(group.skuCode)) return groupSerialPickedQty(group)
  return groupDraftQty(group)
}
/** Distribute a combined qty entry across the group's member lines, filling the
 *  first order's line to its own expected qty before spilling into the next —
 *  same fill order the barcode scanner already uses for this exact scenario. */
function distributeGroupQty(group: PickGroupItem, total: number) {
  let remaining = total
  const updates: Record<string, number> = {}
  for (const key of group.memberKeys) {
    const member = itemByKey.value.get(key)
    if (!member) continue
    const take = Math.min(remaining, member.expectedQty)
    updates[key] = take
    remaining -= take
  }
  draftQty.value = { ...draftQty.value, ...updates }
}
function onGroupQtyInput(group: PickGroupItem, e: Event) {
  let n = Math.floor(Number((e.target as HTMLInputElement).value))
  if (!Number.isFinite(n) || n < 0) n = 0
  if (n > group.expectedQty) n = group.expectedQty
  distributeGroupQty(group, n)
  if (showQtyErrors.value) showQtyErrors.value = false
  if (finishError.value) finishError.value = ''
}
// stockLocationPaths() repeats a bin once per unit of capacity — dedupe before use as
// a dropdown's option list (same fix as PutAwayItemsPage.vue).
const locationOptions = computed(() => {
  if (!task.value) return []
  return [...new Set(stockLocationPaths(task.value.warehouseId).filter(Boolean))]
})

// ── Batch / serial helpers (same heuristic as receiving / put-away) ────────────
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
// The drawer's "onHand" field doubles as "Available qty" for picking (never raw on
// hand) — a batch already claimed by another order can't be offered again here.
function batchAvailable(sku: string, batchNo: string): number {
  return stockMap.value.get(sku)?.batches?.find(b => b.batchNo === batchNo)?.available ?? 0
}
function locationForSerial(sku: string, serial: string): string {
  const sr = stockMap.value.get(sku)?.serials
  return sr?.available.find(u => u.serial === serial)?.location
    ?? sr?.reserved.find(u => u.serial === serial)?.location
    ?? ''
}

// ── Manage batch / Manage serial number — pick FROM existing batches/serials.
// Stored keyed by picking LINE (orderId::sku) — a task bundling 2 orders for the
// same SKU still owns 2 independent reservations, needed for packing attribution —
// but the drawer itself operates on the merged GROUP (see activeBatchGroup/
// activeSerialGroup below), matching the one row the table shows the picker.
// Storage location is derived from wherever the chosen batch/serial already sits —
// never chosen manually, unlike put-away's destination picker. ────
//
// task.batchPicks/serialPicks is the RESERVATION PLAN decided when the picking list
// was created — it's what to suggest, not proof the operator has actually picked it.
// It only becomes real once they open Manage batch/serial and hit Save, or once this
// task has genuinely been draft-saved/finished before (pickedByKey then exists).
const taskBatchByKey = computed(() => {
  const map: Record<string, CommittedBatch[]> = {}
  for (const it of lineItems.value) {
    // getPickingLineItems already merges batchPicks by batchNo at the source —
    // never show the same batch as 2 rows (it also doubles the "Available qty" total).
    if (it.batchPicks?.length) {
      map[it.key] = it.batchPicks.map(b => ({
        key: b.batchNo,
        batchNo: b.batchNo,
        expiryDate: b.expiryDate,
        desc: b.desc,
        onHand: batchAvailable(it.skuCode, b.batchNo),
        counted: b.qty,
        unit: b.unit,
        location: b.location,
        reservedQty: b.qty,
      }))
    }
  }
  return map
})
const taskSerialByKey = computed(() => {
  const map: Record<string, PickingSerialPick[]> = {}
  for (const it of lineItems.value) {
    if (it.serialPicks?.length) map[it.key] = it.serialPicks.map(s => ({ ...s }))
  }
  return map
})
// Drawer fallback for a line the operator hasn't confirmed yet — same suggested
// batches as above, but uncounted: the operator must scan (or enter a qty) before
// anything counts as picked.
const planBatchByKey = computed(() => {
  const map: Record<string, CommittedBatch[]> = {}
  for (const [key, batches] of Object.entries(taskBatchByKey.value)) {
    map[key] = batches.map(b => ({ ...b, counted: null }))
  }
  return map
})
const batchLinesByKey  = ref<Record<string, CommittedBatch[]>>({})
const serialLinesByKey = ref<Record<string, PickingSerialPick[]>>({})

function seedConfirmedLines() {
  // pickedByKey only ever gets set by savePickingDraft/endPicking — if it's still
  // undefined, nothing has actually been picked on this task yet, so Picked qty must
  // start at 0 even though the reservation plan already has batches/serials assigned.
  const hasRealProgress = task.value?.pickedByKey !== undefined
  batchLinesByKey.value = hasRealProgress ? { ...taskBatchByKey.value } : {}
  serialLinesByKey.value = hasRealProgress ? { ...taskSerialByKey.value } : {}
}
watch([() => props.orderId, task], seedConfirmedLines, { immediate: true })

// batchDrawerKey/serialDrawerKey hold the GROUP's skuCode (not a line key) — the
// drawer always operates on the whole merged SKU, matching what the row shows the
// picker, not one order's slice of it. Opening it for "whichever member line still
// has room" (the previous, per-line design) meant that once order 1's line filled
// up, the SAME "Manage batch" button silently jumped to order 2's line next — which
// starts uncounted, reading as "my picks just vanished, back to 0" even though
// order 1's picks were never lost. Distributing back onto the member lines on save
// (below) is what keeps the per-order data model intact for packing attribution.
const batchDrawerKey = ref<string | null>(null)
const batchDrawerOpen = computed({
  get: () => batchDrawerKey.value !== null,
  set: (v: boolean) => { if (!v) batchDrawerKey.value = null },
})
const activeBatchGroup = computed(() => batchDrawerKey.value ? groupBySkuCode(batchDrawerKey.value) : null)
function openBatchDrawer(group: PickGroupItem) { batchDrawerKey.value = group.skuCode }
function batchPickedQty(key: string): number {
  return (batchLinesByKey.value[key] ?? []).reduce((s, b) => s + (b.counted ?? 0), 0)
}
// Merge every member line's batch rows into one per-batchNo list. counted sums
// across members; stays null only when EVERY contributing row is still uncounted
// (so the drawer still shows "—", not a false "0").
function mergeCommittedBatches(rowSets: CommittedBatch[][]): CommittedBatch[] {
  const map = new Map<string, CommittedBatch>()
  for (const rows of rowSets) {
    for (const b of rows) {
      const existing = map.get(b.batchNo)
      if (!existing) { map.set(b.batchNo, { ...b }); continue }
      if (existing.counted === null && b.counted === null) continue
      existing.counted = (existing.counted ?? 0) + (b.counted ?? 0)
      existing.reservedQty = (existing.reservedQty ?? 0) + (b.reservedQty ?? 0)
    }
  }
  return [...map.values()]
}
function groupBatchRows(group: PickGroupItem): CommittedBatch[] {
  const anyTouched = group.memberKeys.some(k => batchLinesByKey.value[k] !== undefined)
  const rowSets = group.memberKeys.map(k => (anyTouched ? batchLinesByKey.value[k] : planBatchByKey.value[k]) ?? [])
  return mergeCommittedBatches(rowSets)
}
function saveBatchLines(batches: CommittedBatch[]) {
  const group = batchDrawerKey.value ? groupBySkuCode(batchDrawerKey.value) : null
  if (!group) return
  // Distribute each batch's combined counted qty across the group's member lines
  // in fill order — first order's line filled to its own expected qty before
  // spilling into the next, same rule as plain qty entry (distributeGroupQty) and
  // the barcode scanner.
  const remaining = new Map(batches.map(b => [b.batchNo, b.counted ?? 0]))
  const updates: Record<string, CommittedBatch[]> = {}
  for (const key of group.memberKeys) {
    const item = itemByKey.value.get(key)
    if (!item) continue
    let budget = item.expectedQty
    const rows: CommittedBatch[] = []
    for (const b of batches) {
      if (budget <= 0) break
      const left = remaining.get(b.batchNo) ?? 0
      if (left <= 0) continue
      const take = Math.min(left, budget)
      // Keep THIS line's own original reservation for this batch (not the
      // group-merged total) — otherwise re-merging on the next open would sum the
      // same inflated value across every member line, growing on each save.
      const ownReserved = taskBatchByKey.value[key]?.find(r => r.batchNo === b.batchNo)?.reservedQty ?? 0
      rows.push({ ...b, counted: take, reservedQty: ownReserved })
      remaining.set(b.batchNo, left - take)
      budget -= take
    }
    updates[key] = rows
  }
  batchLinesByKey.value = { ...batchLinesByKey.value, ...updates }
}

const serialDrawerKey = ref<string | null>(null)
const serialDrawerOpen = computed({
  get: () => serialDrawerKey.value !== null,
  set: (v: boolean) => { if (!v) serialDrawerKey.value = null },
})
const activeSerialGroup = computed(() => serialDrawerKey.value ? groupBySkuCode(serialDrawerKey.value) : null)
function openSerialDrawer(group: PickGroupItem) { serialDrawerKey.value = group.skuCode }
function serialPickedQty(key: string): number {
  return (serialLinesByKey.value[key] ?? []).length
}
// No "uncounted plan" fallback here (unlike groupBatchRows) — a serial only ever
// counts as picked once actually confirmed; matches the drawer's own modelValue
// contract, where the suggested plan is shown separately via plannedSerials.
function groupSerialRows(group: PickGroupItem): PickingSerialPick[] {
  const seen = new Set<string>()
  const rows: PickingSerialPick[] = []
  for (const key of group.memberKeys) {
    for (const s of serialLinesByKey.value[key] ?? []) if (!seen.has(s.serial)) { seen.add(s.serial); rows.push(s) }
  }
  return rows
}
function saveSerialLines(serials: CommittedSerial[]) {
  const group = serialDrawerKey.value ? groupBySkuCode(serialDrawerKey.value) : null
  if (!group) return
  // Same fill-order distribution as saveBatchLines — first order's line filled
  // to its own expected qty before spilling into the next.
  let idx = 0
  const updates: Record<string, PickingSerialPick[]> = {}
  for (const key of group.memberKeys) {
    const item = itemByKey.value.get(key)
    if (!item) continue
    const take = serials.slice(idx, idx + item.expectedQty)
    idx += take.length
    updates[key] = take.map(s => ({ serial: s.serial, location: locationForSerial(item.skuCode, s.serial) }))
  }
  serialLinesByKey.value = { ...serialLinesByKey.value, ...updates }
}

// ── Page-level scan bar ─────────────────────────────────────────────────────────
// Picking's active-bin model is the reverse of put-away's: scan a bin barcode
// to make it "active", then a batch/serial/SKU scan only counts as picked once
// it's confirmed coming FROM that same bin — so a unit can't be marked picked
// while the operator is standing at the wrong physical location.
const activeBin = ref<string | null>(null)
const flashRowKey = ref<string | null>(null)
let flashTimer: ReturnType<typeof setTimeout> | null = null
function flashRow(key: string) {
  flashRowKey.value = key
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => { flashRowKey.value = null }, 700)
}

/** Add 1 unit of `batchNo` to a line's picked batches — creates the row (with real
 *  batch data from the warehouse) the first time it's scanned, no drawer required.
 *  Returns whether it actually applied (false = rejected, already notified). */
function addOrIncrementBatch(item: PickLineItem, batchNo: string): boolean {
  if (batchPickedQty(item.key) >= item.expectedQty) {
    notifyScanError(`${item.skuCode}: qty to pick already fully picked`)
    return false
  }
  const existing = batchLinesByKey.value[item.key] ?? []
  const idx = existing.findIndex(b => b.batchNo === batchNo)
  if (idx !== -1) {
    const updated = existing.map((b, i) => i === idx ? { ...b, counted: (b.counted ?? 0) + 1 } : b)
    batchLinesByKey.value = { ...batchLinesByKey.value, [item.key]: updated }
    return true
  }
  const b = stockMap.value.get(item.skuCode)?.batches?.find(x => x.batchNo === batchNo)
  if (!b) return false
  const newBatch: CommittedBatch = {
    key: b.batchNo, batchNo: b.batchNo, expiryDate: b.expiryDate, desc: '',
    onHand: batchAvailable(item.skuCode, b.batchNo), counted: 1,
    unit: stockMap.value.get(item.skuCode)?.unit ?? '', location: b.location,
  }
  batchLinesByKey.value = { ...batchLinesByKey.value, [item.key]: [...existing, newBatch] }
  return true
}

/** Add a serial number to a line's picked serials — first scan creates the entry,
 *  no drawer required; a repeat scan of the same serial is a silent no-op (just
 *  re-flashes, no sound either way). Returns whether it actually applied. */
function addSerialPick(item: PickLineItem, serial: string): boolean {
  const existing = serialLinesByKey.value[item.key] ?? []
  if (existing.some(s => s.serial === serial)) return false
  if (existing.length >= item.expectedQty) {
    notifyScanError(`${item.skuCode}: qty to pick already fully picked`)
    return false
  }
  serialLinesByKey.value = {
    ...serialLinesByKey.value,
    [item.key]: [...existing, { serial, location: locationForSerial(item.skuCode, serial) }],
  }
  return true
}

function handleScan(rawValue: string) {
  const v = rawValue.trim()
  if (!v || !task.value) return

  // Bin scan — the reverse of put-away's active-bin model: confirm which bin
  // the operator is physically at before anything can be marked picked out of it.
  const matchedBin = locationOptions.value.find(loc => sameCode(loc, v))
  if (matchedBin) {
    activeBin.value = matchedBin
    playScanSuccessSound()
    return
  }

  // Global resolver — maps Batch No. / Serial Number / SKU straight to its real
  // SKU from the warehouse's own stock, regardless of what this page already has
  // loaded locally. Scanning a batch/serial never requires opening its drawer first.
  const resolved = resolveScan(task.value.warehouseId, v)
  if (!resolved) {
    notifyScanError(`Barcode not found: "${v}"`)
    return
  }

  // Is this SKU actually on this picking list? A task can bundle the same SKU
  // across 2+ orders (2 independent rows) — fill the first one that isn't fully
  // picked yet, not just the first match.
  const candidates = lineItems.value.filter(it => it.skuCode === resolved.sku)
  if (!candidates.length) {
    notifyScanError(`${v}: SKU ${resolved.sku} isn't on this picking list`)
    return
  }
  const item = candidates.find(it => effectivePickedQty(it) < it.expectedQty)
  if (!item) {
    notifyScanError(`${resolved.sku}: qty to pick already fully picked`)
    return
  }

  if (resolved.kind === 'batch') {
    if (!activeBin.value) {
      notifyScanError('Scan a bin first before scanning batch numbers')
      return
    }
    // The batch's own fixed bin must match the active one — catches an
    // operator scanning the right batch while standing at the wrong location.
    const knownLoc = stockMap.value.get(item.skuCode)?.batches?.find(b => b.batchNo === resolved.batchNo)?.location
    if (knownLoc && !sameCode(knownLoc, activeBin.value)) {
      notifyScanError(`${resolved.batchNo}: stored in ${knownLoc}, not ${activeBin.value}`)
      return
    }
    if (addOrIncrementBatch(item, resolved.batchNo!)) {
      playScanSuccessSound()
      flashRow(item.skuCode)
    }
    return
  }
  if (resolved.kind === 'serial') {
    if (!activeBin.value) {
      notifyScanError('Scan a bin first before scanning serial numbers')
      return
    }
    const knownLoc = locationForSerial(item.skuCode, resolved.serial!)
    if (knownLoc && !sameCode(knownLoc, activeBin.value)) {
      notifyScanError(`${resolved.serial}: stored in ${knownLoc}, not ${activeBin.value}`)
      return
    }
    if (addSerialPick(item, resolved.serial!)) {
      playScanSuccessSound()
      flashRow(item.skuCode)
    }
    return
  }
  // Plain SKU scan
  if (isBatchTrackedSku(item.skuCode)) {
    const group = groupBySkuCode(item.skuCode)
    if (!group) return
    playScanSuccessSound()
    openBatchDrawer(group)
    return
  }
  if (isSerialTrackedSku(item.skuCode)) {
    const group = groupBySkuCode(item.skuCode)
    if (!group) return
    playScanSuccessSound()
    openSerialDrawer(group)
    return
  }
  // Plain (untracked) SKU — no per-unit location data exists to match against,
  // but the bin scan is still required for the same physical-confirmation reason.
  if (!activeBin.value) {
    notifyScanError('Scan a bin first before scanning SKU numbers')
    return
  }
  draftQty.value = { ...draftQty.value, [item.key]: (draftQty.value[item.key] ?? 0) + 1 }
  if (showQtyErrors.value) showQtyErrors.value = false
  if (finishError.value) finishError.value = ''
  playScanSuccessSound()
  flashRow(item.skuCode)
}

/** Read-only bin list for the Storage location column, batch/serial-tracked SKUs only. */
function pickedLocations(key: string): string[] {
  const item = itemByKey.value.get(key)
  if (!item) return []
  const bins = new Set<string>()
  if (isBatchTrackedSku(item.skuCode)) {
    for (const b of batchLinesByKey.value[key] ?? []) if ((b.counted ?? 0) > 0 && b.location) bins.add(b.location)
  } else if (isSerialTrackedSku(item.skuCode)) {
    for (const s of serialLinesByKey.value[key] ?? []) if (s.location) bins.add(s.location)
  }
  return [...bins]
}

/** Picked qty for a line — batch/serial-tracked SKUs source it from their drawer
 *  selections, plain SKUs from the manual qty input (draftQty). */
function effectivePickedQty(item: PickLineItem): number {
  if (isBatchTrackedSku(item.skuCode)) return batchPickedQty(item.key)
  if (isSerialTrackedSku(item.skuCode)) return serialPickedQty(item.key)
  return draftQty.value[item.key] ?? 0
}

// Any picking task can be finished partially (regardless of marketplace) → it becomes
// "partially picked". The marketplace "must be complete" rule applies only when turning
// the task into a packing task (here: the "Finish & create packing" shortcut).
const marketplaceOrderIds = computed(
  () => new Set((task.value?.salesOrderIds ?? []).filter(id => isMarketplaceOrder(outgoingOrders.find(o => o.id === id)))),
)
const hasMarketplaceOrder = computed(() => marketplaceOrderIds.value.size > 0)
// Copy varies by whether EVERY order on this task is a marketplace order (whether
// that's just 1 order total, or several that all happen to be marketplace), vs
// a MIX of marketplace + non-marketplace orders on the same task — and singular
// vs plural within each of those, since "This sales order" would be wrong
// grammar once 2+ marketplace orders are involved.
const marketplaceWarningText = computed(() => {
  const total = task.value?.salesOrderIds.length ?? 0
  const count = marketplaceOrderIds.value.size
  if (count === 0) return ''
  const suffix = 'must be fully picked before a packing task can be created — pick the remaining items later on a new picking list.'
  if (count === total) {
    return count > 1 ? `These sales orders ${suffix}` : `This sales order ${suffix}`
  }
  return count > 1 ? `There are sales orders in this picking list that ${suffix}` : `There is a sales order in this picking list that ${suffix}`
})

// This task's own outstanding qty is NOT enough to decide whether packing can be
// created — an order can span several picking lists, so "fully picked" has to be
// judged across ALL of them, combining what's already saved elsewhere with what's
// still just a live, unsaved draft in this session (endPicking hasn't run yet).
function orderPickedTotalWithDraft(orderId: string): number {
  if (!task.value) return 0
  const otherTasksTotal = Math.max(0, orderPickedTotal(orderId) - orderPickedQtyInTask(task.value, orderId))
  const liveInThisTask = lineItems.value
    .filter(it => it.orderId === orderId)
    .reduce((s, it) => s + effectivePickedQty(it), 0)
  return otherTasksTotal + liveInThisTask
}
/** Would at least one order in this task actually become packable if I finish now? */
const wouldHaveAnyPackableOrder = computed(() => {
  if (!task.value) return false
  return task.value.salesOrderIds.some(orderId => {
    if (getPackingForOrder(orderId).length > 0) return false
    const o = outgoingOrders.find(x => x.id === orderId)
    if (!o) return false
    const total = orderPickedTotalWithDraft(orderId)
    if (total <= 0) return false
    return isMarketplaceOrder(o) ? total >= orderDemand(orderId) : true
  })
})

const startDateLabel = computed(() => formatDateTimeLong(task.value?.startDate))

// ── Draft picked qty (keyed by line key) ──────────────────────────────────────
const draftQty = ref<Record<string, number>>({})
const search = ref('')
function seedDraftQty() {
  const map: Record<string, number> = {}
  for (const it of lineItems.value) map[it.key] = it.pickedQty
  draftQty.value = map
}
watch([() => props.orderId, lineItems], () => {
  seedDraftQty()
  search.value = ''
}, { immediate: true })

// Scanning is harmless to undo — nothing is persisted until Save draft / Finish
// picking — so let the operator wipe every unsaved scan/entry and start over.
function resetProgress() {
  seedDraftQty()
  seedConfirmedLines()
  if (showQtyErrors.value) showQtyErrors.value = false
  if (finishError.value) finishError.value = ''
}

const toPickTotal = computed(() => lineItems.value.reduce((s, it) => s + it.expectedQty, 0))
const draftPickedTotal = computed(() => lineItems.value.reduce((s, it) => s + effectivePickedQty(it), 0))
const draftOutstanding = computed(() => Math.max(0, toPickTotal.value - draftPickedTotal.value))
const shortItemsCount = computed(() => groupedItems.value.filter(g => effectiveGroupPickedQty(g) < g.expectedQty).length)

const filteredItems = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return groupedItems.value
  return groupedItems.value.filter(g => g.productName.toLowerCase().includes(q) || g.skuCode.toLowerCase().includes(q))
})

// ── Progressive pagination ────────────────────────────────────────────────────
const PAGE_SIZE = 10
const shownCount = ref(PAGE_SIZE)
const loadingMore = ref(false)
const pagedItems = computed(() => filteredItems.value.slice(0, shownCount.value))

interface PickRowWithMeta {
  item: PickGroupItem
  bin: string | null
  binQty: number
  groupIndex: number
  groupSize: number
}
/** Expands each paged group into one row per bin actually used (Storage
 *  location/Qty to pick/Picked qty split per bin, Product/SKU/Outstanding/
 *  Unit/Action merged via groupIndex/groupSize) — or a single row when there's
 *  nothing to split (0 or 1 bin used), so the table renders exactly as before
 *  until a group genuinely spans 2+ bins. Plain (non-tracked) SKUs never
 *  split — groupQtyByBin only returns entries for batch/serial-tracked SKUs. */
const pagedRowsWithMeta = computed<PickRowWithMeta[]>(() => {
  const result: PickRowWithMeta[] = []
  for (const item of pagedItems.value) {
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
  itemsObserver = new IntersectionObserver(
    entries => { if (entries[0].isIntersecting) loadMoreItems() },
    { root: itemsScrollEl.value, rootMargin: '0px 0px 120px 0px' },
  )
  itemsObserver.observe(itemsSentinelEl.value)
}
watch(search, () => { shownCount.value = PAGE_SIZE; nextTick(() => { if (itemsScrollEl.value) itemsScrollEl.value.scrollTop = 0; setupItemsObserver() }) })

const showQtyErrors = ref(false)
// Inline validation caption under the toolbar (shown on a failed Finish attempt), not a toast.
const finishError = ref('')
function onQtyInput(key: string, expected: number, e: Event) {
  let n = Math.floor(Number((e.target as HTMLInputElement).value))
  if (!Number.isFinite(n) || n < 0) n = 0
  if (n > expected) n = expected
  draftQty.value = { ...draftQty.value, [key]: n }
  if (showQtyErrors.value) showQtyErrors.value = false
  if (finishError.value) finishError.value = ''
}
function fmt(n: number) { return n.toLocaleString('id-ID') }

// Build the picked-qty-per-line map and the batch/serial pick assignments to persist.
function buildPickedMap(): Record<string, number> {
  const map: Record<string, number> = {}
  for (const it of lineItems.value) map[it.key] = effectivePickedQty(it)
  return map
}
function buildAssignments(): PickingAssignments {
  const batchPicks: Record<string, PickingBatchPick[]> = {}
  for (const [key, batches] of Object.entries(batchLinesByKey.value)) {
    const picks = batches.filter(b => (b.counted ?? 0) > 0).map(b => ({
      batchNo: b.batchNo, expiryDate: b.expiryDate, desc: b.desc,
      qty: b.counted ?? 0, unit: b.unit, location: b.location ?? '',
    }))
    if (picks.length) batchPicks[key] = picks
  }
  const serialPicks: Record<string, PickingSerialPick[]> = {}
  for (const [key, serials] of Object.entries(serialLinesByKey.value)) {
    if (serials.length) serialPicks[key] = serials
  }
  return { batchPicks, serialPicks }
}

// ── Finish picking confirmation ───────────────────────────────────────────────
const showConfirm = ref(false)
function endPickingClick() {
  if (draftPickedTotal.value === 0) {
    showQtyErrors.value = true
    finishError.value = 'You must fill in picked qty for at least 1 item'
    return
  }
  finishError.value = ''
  showConfirm.value = true
}
function commitPicking(createPacking = false) {
  showConfirm.value = false
  const complete = draftPickedTotal.value >= toPickTotal.value
  endPicking(props.orderId, buildPickedMap(), buildAssignments())
  // Already committed — the router.push below is this function's own doing,
  // not the operator losing unsaved work, so the guard mustn't fire on it.
  disableUnsavedChangesGuard()
  // Re-check packability at the ORDER level (across every picking list for that
  // order), same as the picking detail page's own "Create packing" guard — this
  // task alone being fully picked doesn't mean the order is, if it spans more lists.
  let blockPacking = false
  if (createPacking) {
    const t = task.value
    const packable = t ? packableOrderIds(t).filter(id => getPackingForOrder(id).length === 0) : []
    blockPacking = packable.length === 0
  }
  if (createPacking && !blockPacking) {
    router.push({ path: '/outbound-delivery/packing/create', query: { pickingId: props.orderId } })
    return
  }
  if (blockPacking) {
    toast.notify({
      variant: 'error',
      title: 'Saved as partially picked',
      description: 'Marketplace orders must be fully picked (across their picking lists) before a packing task can be created.',
      maxWidth: 'max-content',
    })
  } else {
    toast.notify({
      variant: 'success',
      title: complete ? 'Picking finished, ready to pack' : 'Picking finished (partially picked)',
      maxWidth: 'max-content',
    })
  }
  router.push(`/picking/${props.orderId}`)
}
function saveDraft() {
  savePickingDraft(props.orderId, buildPickedMap(), buildAssignments())
  toast.notify({ variant: 'success', title: 'Picking draft saved' , maxWidth: 'max-content'})
  disableUnsavedChangesGuard()
  router.push(`/picking/${props.orderId}`)
}
function goBack() { router.push(`/picking/${props.orderId}`) }
function goPicking() { router.push('/outbound-delivery?tab=Picking') }

// ── Warn before losing unsaved picks — refresh/close-tab (native prompt) and
// in-app navigation/Back button (modal rendered once at the app root, see
// [...slug].vue — this app has a single catch-all route, so a per-page modal/
// onBeforeRouteLeave never fires). "Unsaved" = anything picked at all (plain
// qty, batch, or serial), same effectivePickedQty() already used above.
// disableUnsavedChangesGuard() is called by commitPicking()/saveDraft() right
// before their own router.push — otherwise hasUnsavedChanges() would still
// read true (nothing else resets the picked state after commit) and the
// "Leave without saving?" modal would fire right after the operator's own
// intentional Finish/Save action. ────────────────────────────────────────────
const { disableGuard: disableUnsavedChangesGuard } = useUnsavedChangesGuard({
  hasUnsavedChanges: () => draftPickedTotal.value > 0,
  saveDraft: () => {
    savePickingDraft(props.orderId, buildPickedMap(), buildAssignments())
    toast.notify({ variant: 'success', title: 'Picking draft saved', maxWidth: 'max-content' })
  },
})

// ── Footer divider ────────────────────────────────────────────────────────────
const stageEl = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)
function checkStageOverflow() { const el = stageEl.value; if (el) stageOverflowing.value = el.scrollHeight > el.clientHeight + 1 }
// The items table gets an outer border only once its scroll area actually overflows
// (rows exceed its max height and it can scroll) — not merely by row count.
const itemsOverflowing = ref(false)
function checkItemsOverflow() {
  const el = itemsScrollEl.value
  itemsOverflowing.value = !!el && el.scrollHeight > el.clientHeight + 1
}
let stageObserver: ResizeObserver | null = null
let itemsResizeObserver: ResizeObserver | null = null
onMounted(() => {
  nextTick(() => {
    checkStageOverflow()
    checkItemsOverflow()
    stageObserver = new ResizeObserver(checkStageOverflow)
    if (stageEl.value) { stageObserver.observe(stageEl.value); stageEl.value.addEventListener('scroll', checkStageOverflow, { passive: true }) }
    itemsResizeObserver = new ResizeObserver(checkItemsOverflow)
    if (itemsScrollEl.value) itemsResizeObserver.observe(itemsScrollEl.value)
    setupItemsObserver()
  })
})
onUnmounted(() => {
  stageObserver?.disconnect()
  itemsResizeObserver?.disconnect()
  stageEl.value?.removeEventListener('scroll', checkStageOverflow)
  itemsObserver?.disconnect()
})
watch([() => props.orderId, shownCount, filteredItems], () => nextTick(() => { checkStageOverflow(); checkItemsOverflow() }))
</script>

<template>
  <div v-if="task" class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb" @click="goPicking">Picking</button>
          <span class="detail-breadcrumb-sep">/</span>
          <button class="detail-breadcrumb" @click="goBack">{{ task.taskNo }}</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">Picking list</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">

      <div class="pik-header">
        <ContentList label="Warehouse" :value="task.warehouseName" />
        <ContentList label="Assignee" :value="task.assignee" />
        <ContentList label="Start date" :value="startDateLabel" />
        <ContentList label="End date" :value="task.endDate ? formatDateTimeLong(task.endDate) : '—'" />
      </div>

      <div class="pik-summary">
        <div class="pik-stat"><span class="pik-stat-label">SKU qty</span><span class="pik-stat-val">{{ fmt(groupedItems.length) }}</span></div>
        <div class="pik-stat"><span class="pik-stat-label">Qty to pick</span><span class="pik-stat-val">{{ fmt(toPickTotal) }}</span></div>
        <div class="pik-stat"><span class="pik-stat-label">Picked qty</span><span class="pik-stat-val">{{ fmt(draftPickedTotal) }}</span></div>
        <div class="pik-stat"><span class="pik-stat-label">Outstanding qty</span><span class="pik-stat-val">{{ fmt(draftOutstanding) }}</span></div>
      </div>

      <div class="pik-sku-section">
        <div class="pik-filter-bar">
          <div class="pik-search-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input v-model="search" class="pik-search" type="text" placeholder="Search..." />
            <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        <ScanBar placeholder="Scan barcode..." @scan="handleScan">
          <div v-if="activeBin" class="pik-active-bin">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 13L9 17L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span>{{ activeBin }}</span>
            <button class="pik-active-bin-clear" type="button" aria-label="Clear active bin" @click="activeBin = null">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
              </svg>
            </button>
          </div>
          <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" type="button" @click="resetProgress">Reset count</button>
        </ScanBar>

        <p v-if="finishError" class="pik-finish-error">{{ finishError }}</p>

        <section class="pik-items-section" :class="{ 'pik-items-section--bordered': itemsOverflowing }">
          <div ref="itemsScrollEl" class="pik-items-scroll">
            <table class="pik-items">
              <colgroup>
                <col /><!-- Product -->
                <col style="width: 160px" /><!-- SKU -->
                <col style="width: 170px" /><!-- Storage location -->
                <col /><!-- Qty to pick -->
                <col /><!-- Picked qty -->
                <col /><!-- Outstanding qty -->
                <col style="width: 100px" /><!-- Unit -->
                <col /><!-- Action -->
              </colgroup>
              <thead>
                <tr>
                  <th class="pik-th">Product</th>
                  <th class="pik-th">SKU</th>
                  <th class="pik-th">Storage location</th>
                  <th class="pik-th pik-th--num">Qty to pick</th>
                  <th class="pik-th pik-th--num">Picked qty</th>
                  <th class="pik-th pik-th--num">Outstanding qty</th>
                  <th class="pik-th">Unit</th>
                  <th class="pik-th pik-th--action"></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in pagedRowsWithMeta" :key="`${row.item.key}::${row.groupIndex}`"
                  class="pik-row" :class="{ 'pik-row--flash': flashRowKey === row.item.key }"
                >
                  <td v-if="row.groupIndex === 0" :rowspan="row.groupSize" class="pik-td">
                    <ProductCell :name="row.item.productName" :desc="row.item.productDesc" :image="row.item.image" />
                  </td>
                  <td v-if="row.groupIndex === 0" :rowspan="row.groupSize" class="pik-td">{{ row.item.skuCode }}</td>

                  <!-- Storage location: read-only, wherever the picked batch/serial already
                       sits (no picker); split into one row per bin once the group's picks
                       actually span 2+ different bins, else the original single-cell list/
                       tooltip. Plain SKUs keep the static bin text (never splits). -->
                  <td v-if="row.groupSize > 1" class="pik-td">{{ row.bin }}</td>
                  <td
                    v-else-if="isBatchTrackedSku(row.item.skuCode) || isSerialTrackedSku(row.item.skuCode)"
                    class="pik-td pik-td--location-summary"
                  >
                    <div class="pik-location-summary-wrap">
                      <template v-if="pickedLocationsForGroup(row.item).length">
                        <span v-for="loc in pickedLocationsForGroup(row.item)" :key="loc" class="pik-location-summary-item">{{ loc }}</span>
                      </template>
                      <MpTooltip
                        v-else
                        :id="`pik-tt-loc-${row.item.key}`"
                        :label="isBatchTrackedSku(row.item.skuCode) ? 'View via Manage batch' : 'View via Manage serial numbers'"
                        placement="top"
                        use-portal
                      >
                        <span class="pik-location-summary-item">—</span>
                      </MpTooltip>
                    </div>
                  </td>
                  <td v-else class="pik-td">{{ row.item.binLocation }}</td>

                  <!-- Qty to pick: static total for the group, unless split per bin — a
                       bin row has no separate plan of its own, so it mirrors that bin's
                       own Picked qty (the only meaningful number once split). -->
                  <td class="pik-td pik-td--num">{{ fmt(row.groupSize > 1 ? row.binQty : row.item.expectedQty) }}</td>

                  <!-- Picked qty: plain value for batch/serial-tracked SKUs (total from
                       drawer, filled by scanning — never manually typed; per-bin once
                       split), input for plain SKUs. A SKU spanning 2+ orders is still ONE
                       input — entering a combined qty distributes it order-by-order (first
                       order filled first), same fill order the barcode scanner already uses. -->
                  <td v-if="row.groupSize > 1" class="pik-td pik-td--num">
                    <span class="pik-batch-val">{{ fmt(row.binQty) }}</span>
                  </td>
                  <td v-else-if="isBatchTrackedSku(row.item.skuCode)" class="pik-td pik-td--num">
                    <span class="pik-batch-val">{{ fmt(groupBatchPickedQty(row.item)) }}</span>
                  </td>
                  <td v-else-if="isSerialTrackedSku(row.item.skuCode)" class="pik-td pik-td--num">
                    <span class="pik-batch-val">{{ fmt(groupSerialPickedQty(row.item)) }}</span>
                  </td>
                  <td
                    v-else
                    class="pik-td pik-td--input"
                    :class="{ 'pik-td--input--error': showQtyErrors && !groupDraftQty(row.item) }"
                  >
                    <MpTooltip
                      v-if="qtyScanRequired(row.item.expectedQty)"
                      :id="`pik-tt-scan-${row.item.key}`"
                      label="Qty at or below the scan threshold — scan the barcode instead of typing"
                      placement="top"
                      use-portal
                    >
                      <input
                        class="pik-qty-input"
                        type="number" min="0" :max="row.item.expectedQty"
                        :value="groupDraftQty(row.item)"
                        :aria-label="`Picked qty for ${row.item.productName}`"
                        disabled
                      />
                    </MpTooltip>
                    <input
                      v-else
                      class="pik-qty-input"
                      type="number" min="0" :max="row.item.expectedQty"
                      :value="groupDraftQty(row.item)"
                      :aria-label="`Picked qty for ${row.item.productName}`"
                      @input="onGroupQtyInput(row.item, $event)"
                    />
                  </td>
                  <td v-if="row.groupIndex === 0" :rowspan="row.groupSize" class="pik-td pik-td--num">
                    <span :class="row.item.expectedQty - effectiveGroupPickedQty(row.item) > 0 ? 'pik-outstanding' : 'pik-qty--full'">
                      {{ fmt(row.item.expectedQty - effectiveGroupPickedQty(row.item)) }}
                    </span>
                  </td>

                  <td v-if="row.groupIndex === 0" :rowspan="row.groupSize" class="pik-td">{{ row.item.unit }}</td>

                  <!-- Action column: Manage batch / Manage serial numbers icon — operates
                       on the whole merged SKU (all underlying order-lines together), same
                       "first order first" fill order as scanning/qty entry. Merged across
                       a group's own bin-split rows — one button per SKU, not per bin. -->
                  <td v-if="row.groupIndex === 0 && isBatchTrackedSku(row.item.skuCode)" :rowspan="row.groupSize" class="pik-td pik-td--action">
                    <MpTooltip :id="`pik-tt-batch-${row.item.key}`" label="Manage batch" placement="top" use-portal>
                      <button class="pik-manage-icon-btn" type="button" @click="openBatchDrawer(row.item)">
                        <MpIcon name="competencies" size="md" />
                      </button>
                    </MpTooltip>
                  </td>
                  <td v-else-if="row.groupIndex === 0 && isSerialTrackedSku(row.item.skuCode)" :rowspan="row.groupSize" class="pik-td pik-td--action">
                    <MpTooltip :id="`pik-tt-serial-${row.item.key}`" label="Manage serial numbers" placement="top" use-portal>
                      <button class="pik-manage-icon-btn" type="button" @click="openSerialDrawer(row.item)">
                        <MpIcon name="competencies" size="md" />
                      </button>
                    </MpTooltip>
                  </td>
                  <td v-else-if="row.groupIndex === 0" :rowspan="row.groupSize" class="pik-td pik-td--action"></td>
                </tr>
                <tr v-if="!filteredItems.length">
                  <td class="pik-td pik-empty" colspan="8">No products match your search.</td>
                </tr>
              </tbody>
            </table>
            <div ref="itemsSentinelEl" class="pik-sentinel" aria-hidden="true" />
            <div v-if="loadingMore" class="pik-loading pik-loading--inline"><MpSpinner size="sm" /> Loading products…</div>
          </div>
          <div class="pik-items-count"><span>Showing {{ pagedItems.length }} of {{ filteredItems.length }} products</span></div>
        </section>
      </div>

    </div>

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <button class="pik-btn pik-btn--ghost" @click="goBack">Cancel</button>
      <button class="pik-btn pik-btn--secondary" @click="saveDraft">Save draft</button>
      <button class="pik-btn pik-btn--primary" @click="endPickingClick">Finish picking</button>
    </footer>
  </div>

  <div v-else class="pik-not-found">
    <p>Picking task not found.</p>
    <button class="detail-breadcrumb" @click="goPicking">Back to Picking</button>
  </div>

  <!-- ── Finish picking confirmation ── -->
  <MpModal id="pik-confirm" :is-open="showConfirm" size="md" is-close-on-esc :is-keep-alive="false" @close="showConfirm = false">
    <MpModalContent>
      <MpModalHeader>
        {{ draftOutstanding > 0 ? 'Finish picking with a short pick?' : 'Finish picking?' }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <template v-if="draftOutstanding > 0">
          {{ fmt(draftOutstanding) }} of {{ fmt(toPickTotal) }} units couldn't be picked
          across {{ shortItemsCount }} {{ shortItemsCount === 1 ? 'item' : 'items' }}.
          This picking will be saved as <strong>partially picked</strong>.
          <template v-if="hasMarketplaceOrder">
            {{ marketplaceWarningText }}
          </template>
        </template>
        <template v-else>
          All {{ fmt(toPickTotal) }} units have been picked.
        </template>
      </MpModalBody>
      <MpModalFooter>
        <div class="pik-modal-footer">
          <button class="pik-btn pik-btn--ghost" @click="showConfirm = false">Cancel</button>
          <button class="pik-btn pik-btn--secondary" @click="commitPicking(false)">Finish picking</button>
          <button
            v-if="wouldHaveAnyPackableOrder"
            class="pik-btn pik-btn--primary"
            @click="commitPicking(true)"
          >Finish &amp; create packing</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <ManageBatchDrawer
    v-if="activeBatchGroup"
    :open="batchDrawerOpen"
    :sku="activeBatchGroup.skuCode"
    :warehouse-id="task?.warehouseId ?? ''"
    kind="picking"
    :origin-location-paths="locationOptions"
    :initial-active-bin="activeBin"
    :target-count="activeBatchGroup.expectedQty"
    :execution-mode="true"
    :planned-batches="activeBatchGroup.plannedBatchPicks?.map(b => ({ batchNo: b.batchNo, qty: b.qty }))"
    :model-value="groupBatchRows(activeBatchGroup)"
    @update:open="batchDrawerOpen = $event"
    @save="saveBatchLines"
  />
  <ManageSerialDrawer
    v-if="activeSerialGroup"
    :open="true"
    :sku="activeSerialGroup.skuCode"
    :warehouse-id="task?.warehouseId ?? ''"
    kind="picking"
    :target-count="activeSerialGroup.expectedQty"
    :execution-mode="true"
    :origin-location-paths="locationOptions"
    :initial-active-bin="activeBin"
    :model-value="groupSerialRows(activeSerialGroup).map(s => ({ serial: s.serial }))"
    :planned-serials="(activeSerialGroup.plannedSerialPicks ?? []).map(s => s.serial)"
    @update:open="serialDrawerOpen = $event"
    @save="saveSerialLines"
  />
</template>

<style scoped>
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
.detail-breadcrumb-sep { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default);
}
.detail-stage {
  flex: 1; min-height: 0; overflow: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column; gap: var(--mp-spacing-6);
}
.detail-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage); border-top: 1px solid transparent;
}
.detail-footer--floating { border-top-color: var(--mp-border-default); }

.pik-header { flex-shrink: 0; display: flex; flex-wrap: wrap; gap: var(--mp-spacing-5) var(--mp-spacing-10); padding-bottom: var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.pik-header :deep(.content-list) { padding-top: 0; flex: 0 0 318px; width: 318px; }
.pik-header :deep(.content-list__value) { white-space: normal; overflow-wrap: break-word; word-break: break-word; }
.pik-summary { flex-shrink: 0; display: flex; align-items: center; gap: var(--mp-spacing-10); align-self: flex-start; }
.pik-stat { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: var(--mp-sizes-24, 96px); }
.pik-stat-val { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.pik-stat-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.pik-sku-section { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.pik-filter-bar { flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-5); }
.pik-finish-error { flex-shrink: 0; margin: calc(var(--mp-spacing-1) - var(--mp-spacing-5)) 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm); color: var(--mp-text-danger, #c0392b); font-weight: var(--mp-font-weights-medium); }
.pik-search-wrap {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary); min-width: 240px;
}
.pik-search-wrap:focus-within { border-color: var(--mp-border-bold); box-shadow: 0 0 0 1px var(--mp-border-bold); }
.pik-search { flex: 1; border: none; background: transparent; outline: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pik-search::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }

.pik-items-section { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.pik-items-section--bordered { border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-lg); overflow: hidden; }
.pik-items-scroll { min-height: 0; overflow-y: auto; overflow-x: auto; }
.pik-items thead .pik-th { position: sticky; top: 0; z-index: 1; }
.pik-items { width: 100%; border-collapse: collapse; table-layout: auto; }
.pik-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.pik-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }

/* Every column gets a right border; the Action column (the table's true
   rightmost) is the one explicitly marked border-right:none below — a merged
   row (rowspan across a group's bin-split rows) renders fewer <td>s than the
   header, so `:last-child` would land on the wrong cell for those rows. */
.pik-th { border-right: 1px solid var(--mp-border-default); }
.pik-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  background: var(--mp-background-neutral-hovered);
  border-bottom: 1px solid var(--mp-border-default); border-right: 1px solid var(--mp-border-default); vertical-align: top;
}
.pik-td--num { text-align: right; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); white-space: nowrap; }
.pik-td--input { padding: 0; background: var(--mp-background-neutral, #fff); }
.pik-td--input:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }
.pik-td--input--error { background: var(--mp-background-danger-subtle, #fef2f2); }
.pik-td--input--error:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-danger, #dc2626); }
.pik-qty-input {
  display: block; width: 100%; box-sizing: border-box;
  padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4);
  border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  text-align: right; font-variant-numeric: tabular-nums; line-height: var(--mp-line-heights-md);
}
.pik-qty--full { color: var(--mp-text-success-default, #15803d); font-weight: var(--mp-font-weights-medium); }
.pik-outstanding { color: var(--mp-text-default); font-weight: var(--mp-font-weights-medium); }

/* Storage location — read-only bin list for batch/serial-tracked SKUs. The flex
   layout lives on an inner wrapper div, not the <td> itself — display:flex directly
   on a <td> breaks the browser's native table-row height stretch. */
.pik-td--location-summary { padding: 0; color: var(--mp-text-default); background: var(--mp-background-neutral-hovered); vertical-align: top; }
.pik-location-summary-wrap { display: flex; flex-direction: column; height: 100%; }
.pik-location-summary-item {
  display: flex; align-items: center; min-height: var(--mp-sizes-10, 40px);
  padding: 10px var(--mp-spacing-2); box-sizing: border-box; flex-shrink: 0;
  white-space: normal; word-break: break-word; line-height: var(--mp-line-heights-md);
}
.pik-location-summary-item:not(:last-child) { border-bottom: 1px solid var(--mp-border-default); }

.pik-batch-val { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.pik-batch-qty-input {
  display: block; width: 100%; height: 100%; box-sizing: border-box;
  padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  text-align: right; font-variant-numeric: tabular-nums; line-height: var(--mp-line-heights-md);
}
.pik-td--action { padding: 4px var(--mp-spacing-2); vertical-align: top; white-space: nowrap; }
.pik-th--action,
.pik-td--action { border-right: none; }
/* Sticky action column — stays visible when the table scrolls wider than the stage.
   `.pik-items thead .pik-th` (z-index: 1) outranks the plain `.pik-th--action`
   class on specificity alone, so its z-index silently won here and tied the
   header's sticky corner cell with the body's — letting scrolled-past rows
   paint over the header at the top-right intersection. Match that selector's
   specificity (and go higher) so the header corner always wins. */
.pik-items thead .pik-th--action { z-index: 3; }
.pik-th--action { position: sticky; right: 0; z-index: 2; }
.pik-td--action { position: sticky; right: 0; z-index: 1; }
.pik-manage-icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px);
  background: none; border: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary); padding: 0;
}
.pik-manage-icon-btn:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }

.pik-sentinel { height: 1px; }
.pik-loading { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); color: var(--mp-text-secondary); }
.pik-loading--inline { justify-content: center; padding: var(--mp-spacing-3); }
.pik-items-count { flex-shrink: 0; display: flex; align-items: center; margin: 0; padding: var(--mp-spacing-3) var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.pik-empty { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-8) 0; }

.pik-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer; border: 1px solid transparent; white-space: nowrap; transition: background 0.15s;
}
.pik-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.pik-btn--primary:disabled:hover { background: var(--mp-background-brand-bold, #029861); }
.pik-btn--ghost { background: transparent; border-color: transparent; color: var(--mp-text-secondary); font-weight: var(--mp-font-weights-regular); }
.pik-btn--ghost:hover { background: var(--mp-background-neutral-hovered); }
.pik-btn--secondary { background: var(--mp-background-neutral); border-color: var(--mp-border-bold); color: var(--mp-text-default); }
.pik-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }
.pik-btn--primary { background: var(--mp-background-brand-bold, #029861); border-color: transparent; color: var(--mp-text-on-color, #fff); }
.pik-btn--primary:hover { background: var(--mp-background-brand-bold-hovered, #027a4e); }
.pik-modal-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }

.pik-active-bin {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1\.5);
  padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-2\.5);
  background: #e6f7ef; border: 1px solid #029861;
  border-radius: var(--mp-radii-full); white-space: nowrap;
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: #027a4e; flex-shrink: 0;
}
.pik-active-bin-clear {
  background: none; border: none; padding: 0; cursor: pointer;
  color: inherit; display: flex; align-items: center; opacity: 0.7; line-height: 1;
}
.pik-active-bin-clear:hover { opacity: 1; }

.pik-not-found { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-4); flex: 1; height: 100%; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* ── Row flash on scan ────────────────────────────────────────────────────────── */
@keyframes pik-flash {
  0%   { background-color: var(--mp-background-success-subtle, #dcfce7); }
  100% { background-color: transparent; }
}
.pik-row--flash td { animation: pik-flash 0.7s ease-out forwards; }
</style>
