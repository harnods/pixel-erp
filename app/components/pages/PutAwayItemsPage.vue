<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { formatDateTimeLong } from '~/utils/date'
import {
  MpSpinner, MpIcon, MpTooltip,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  css, toast,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import ScanBar from '~/components/patterns/ScanBar.vue'
import ManageBatchDrawer, { type CommittedBatch } from '~/components/patterns/ManageBatchDrawer.vue'
import ManageSerialDrawer, { type CommittedSerial } from '~/components/patterns/ManageSerialDrawer.vue'
import {
  getPutAwayTask, savePutAwayDraft, endPutAway as endPutAwayTask,
  type PutAwayBatchAssignment, type PutAwaySerialAssignment,
} from '~/data/putAwayTasks'
import { getPutAwayLineItems } from '~/data/putAwayTaskDetails'
import { stockLocationPaths } from '~/data/storageLocations'
import { productBySku } from '~/data/inventory'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { getWarehouseConfig, scanRequiredForQty } from '~/data/warehouseConfig'
import { notifyScanError } from '~/utils/scan'
import { playScanSuccessSound } from '~/utils/sound'
import { useUnsavedChangesGuard } from '~/composables/useUnsavedChangesGuard'

const props = defineProps<{ orderId: string }>()
const router = useRouter()

const task            = computed(() => getPutAwayTask(props.orderId))
// Below the warehouse's scan threshold, manual qty entry is disabled — the
// operator must scan the barcode once per unit instead (scan handlers already
// only ever +1, so they need no changes; only the manual input is gated).
const warehouseConfig = computed(() => getWarehouseConfig(task.value?.warehouseId ?? ''))
function qtyScanRequired(qty: number): boolean {
  return scanRequiredForQty(warehouseConfig.value, qty)
}
const lineItems       = computed(() => task.value ? getPutAwayLineItems(props.orderId) : [])
// stockLocationPaths() is a sparse array with one entry per storage-capacity slot
// (a bin repeats once per unit of its capacity) — dedupe before using it as a
// dropdown's option list, or bins with capacity > 1 show up more than once.
const locationOptions = computed(() => {
  if (!task.value) return []
  return [...new Set(stockLocationPaths(task.value.warehouseId).filter(Boolean))]
})

// ── Draft rows — one per displayed table line (can be split into multiple) ────
interface DraftRow {
  id: string
  skuCode: string
  qty: number
  binLocation: string
}

let rowCounter = 0
function newRowId() { return `row-${++rowCounter}` }

const draftRows = ref<DraftRow[]>([])
const search    = ref('')

watch([() => props.orderId, lineItems], () => {
  rowCounter = 0
  // Deduplicate by skuCode — one row per SKU, merging qty from multiple receiving tasks
  const seen = new Map<string, string>()
  lineItems.value.forEach(it => { if (!seen.has(it.skuCode)) seen.set(it.skuCode, it.binLocation) })
  draftRows.value = [...seen.entries()].map(([skuCode, binLocation]) => ({
    id: newRowId(), skuCode, qty: 0, binLocation,
  }))
  search.value = ''
}, { immediate: true })

// Lookup map: skuCode → line item (for product info)
const itemBySkuCode = computed(() => new Map(lineItems.value.map(it => [it.skuCode, it])))

// Summed received qty per SKU across all receiving tasks
const totalQtyBySkuCode = computed(() => {
  const map = new Map<string, number>()
  lineItems.value.forEach(it => { map.set(it.skuCode, (map.get(it.skuCode) ?? 0) + it.qty) })
  return map
})

// ── Batch / serial helpers (same heuristic as receiving / stock count / stock in-out) ──
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

// ── Manage batch / Manage serial number — destination bin(s) per batch or serial,
// seeded from what was recorded at receiving (or a previously-saved draft). Storage
// location for these SKUs is decided entirely inside the drawers, never in the main
// table — the table only shows a read-only summary of the bins actually used. ─────
const batchLinesBySku  = ref<Record<string, CommittedBatch[]>>({})
const serialLinesBySku = ref<Record<string, CommittedSerial[]>>({})

watch(lineItems, (items) => {
  const nextBatch: Record<string, CommittedBatch[]> = {}
  const nextSerial: Record<string, CommittedSerial[]> = {}
  const seen = new Set<string>()
  for (const it of items) {
    if (seen.has(it.skuCode)) continue
    seen.add(it.skuCode)
    if (it.batchLines?.length) {
      nextBatch[it.skuCode] = it.batchLines.map(b => ({
        key: b.batchNo,
        batchNo: b.batchNo,
        expiryDate: b.expiryDate,
        desc: b.desc,
        onHand: b.qty,
        counted: b.destLocations?.length ? b.destLocations.reduce((s, d) => s + d.qty, 0) : null,
        unit: b.unit,
        destLocations: b.destLocations,
      }))
    }
    if (it.serialAssignments?.length) {
      nextSerial[it.skuCode] = it.serialAssignments.map(s => ({ serial: s.serial, destLocationId: s.destLocationId }))
    }
  }
  batchLinesBySku.value = nextBatch
  serialLinesBySku.value = nextSerial
}, { immediate: true })

const batchDrawerSku = ref<string | null>(null)
const batchDrawerOpen = computed({
  get: () => batchDrawerSku.value !== null,
  set: (v: boolean) => { if (!v) batchDrawerSku.value = null },
})
function openBatchDrawer(skuCode: string) { batchDrawerSku.value = skuCode }
function batchAssignedQty(skuCode: string): number {
  return (batchLinesBySku.value[skuCode] ?? []).reduce(
    (s, b) => s + (b.destLocations?.reduce((ss, d) => ss + d.qty, 0) ?? 0), 0,
  )
}
function batchBins(skuCode: string): string[] {
  const bins = new Set<string>()
  for (const b of batchLinesBySku.value[skuCode] ?? []) {
    for (const d of b.destLocations ?? []) if (d.qty > 0) bins.add(d.locationId)
  }
  return [...bins]
}
function saveBatchLines(batches: CommittedBatch[]) {
  const sku = batchDrawerSku.value
  if (!sku) return
  batchLinesBySku.value = { ...batchLinesBySku.value, [sku]: batches }
}

const serialDrawerSku = ref<string | null>(null)
const serialDrawerOpen = computed({
  get: () => serialDrawerSku.value !== null,
  set: (v: boolean) => { if (!v) serialDrawerSku.value = null },
})
function openSerialDrawer(skuCode: string) { serialDrawerSku.value = skuCode }
function serialAssignedQty(skuCode: string): number {
  return (serialLinesBySku.value[skuCode] ?? []).filter(s => s.destLocationId).length
}
function serialBins(skuCode: string): string[] {
  const bins = new Set<string>()
  for (const s of serialLinesBySku.value[skuCode] ?? []) if (s.destLocationId) bins.add(s.destLocationId)
  return [...bins]
}
function saveSerialLines(serials: CommittedSerial[]) {
  const sku = serialDrawerSku.value
  if (!sku) return
  serialLinesBySku.value = { ...serialLinesBySku.value, [sku]: serials }
}

/** Read-only bin list shown in the main table for batch/serial-tracked SKUs —
 * listed one per line rather than comma-joined, since a SKU can span several bins. */
function binsList(skuCode: string): string[] {
  return isBatchTrackedSku(skuCode) ? batchBins(skuCode) : serialBins(skuCode)
}

// ── Summary ───────────────────────────────────────────────────────────────────
const skuQty           = computed(() => new Set(lineItems.value.map(it => it.skuCode)).size)
const receivedQty      = computed(() => lineItems.value.reduce((s, it) => s + it.qty, 0))
// Batch/serial-tracked SKUs get their qty from bin assignments, not row.qty (each
// such SKU has exactly one draftRow — "Split storage location" is hidden for them).
const draftHandled = computed(() => draftRows.value.reduce((s, r) => {
  if (isBatchTrackedSku(r.skuCode)) return s + batchAssignedQty(r.skuCode)
  if (isSerialTrackedSku(r.skuCode)) return s + serialAssignedQty(r.skuCode)
  return s + (r.qty || 0)
}, 0))

// ── Filter ────────────────────────────────────────────────────────────────────
const filteredRows = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return draftRows.value
  return draftRows.value.filter(r => {
    const it = itemBySkuCode.value.get(r.skuCode)
    return it?.productName.toLowerCase().includes(q)
      || r.skuCode.toLowerCase().includes(q)
      || r.binLocation.toLowerCase().includes(q)
  })
})

// ── Progressive pagination ────────────────────────────────────────────────────
const PAGE_SIZE     = 10
const shownCount    = ref(PAGE_SIZE)
const loadingMore   = ref(false)
const pagedRows     = computed(() => filteredRows.value.slice(0, shownCount.value))
const hasMoreItems  = computed(() => shownCount.value < filteredRows.value.length)
const isProgressive = computed(() => filteredRows.value.length > PAGE_SIZE)

// Group consecutive rows by skuCode for rowspan merging
type RowWithMeta = DraftRow & { groupSize: number; groupIndex: number }
const rowsWithMeta = computed<RowWithMeta[]>(() => {
  const rows = pagedRows.value
  const result: RowWithMeta[] = []
  let i = 0
  while (i < rows.length) {
    const skuCode = rows[i]!.skuCode
    let j = i
    while (j < rows.length && rows[j]!.skuCode === skuCode) j++
    const groupSize = j - i
    for (let k = i; k < j; k++) {
      result.push({ ...rows[k]!, groupSize, groupIndex: k - i })
    }
    i = j
  }
  return result
})

function loadMoreItems() {
  if (loadingMore.value || !hasMoreItems.value) return
  loadingMore.value = true
  setTimeout(() => {
    shownCount.value = Math.min(shownCount.value + PAGE_SIZE, filteredRows.value.length)
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
    entries => { if (entries[0]?.isIntersecting) loadMoreItems() },
    { root: itemsScrollEl.value, rootMargin: '0px 0px 120px 0px' },
  )
  itemsObserver.observe(itemsSentinelEl.value)
}

watch(search, () => {
  shownCount.value = PAGE_SIZE
  loadingMore.value = false
  nextTick(() => {
    if (itemsScrollEl.value) itemsScrollEl.value.scrollTop = 0
    setupItemsObserver()
  })
})

// ── Qty to handle input ───────────────────────────────────────────────────────
// Cap per row at what's left of the SKU's total once every OTHER split row for
// that SKU is subtracted — a fixed max of the full total let two split rows each
// take the full amount (e.g. 19 + 1 on a 19-unit SKU) without ever erroring.
function remainingQtyFor(row: DraftRow): number {
  const total = totalQtyBySkuCode.value.get(row.skuCode) ?? 0
  const others = draftRows.value
    .filter(r => r.skuCode === row.skuCode && r.id !== row.id)
    .reduce((s, r) => s + (r.qty || 0), 0)
  return Math.max(0, total - others)
}

function onQtyInput(rowId: string, e: Event) {
  const row = draftRows.value.find(r => r.id === rowId)
  if (!row) return
  const max = remainingQtyFor(row)
  let n = Math.floor(Number((e.target as HTMLInputElement).value))
  if (!Number.isFinite(n) || n < 0) n = 0
  if (n > max) n = max
  draftRows.value = draftRows.value.map(r => r.id === rowId ? { ...r, qty: n } : r)
}

// ── Split line ────────────────────────────────────────────────────────────────
function splitRow(rowId: string) {
  const idx = draftRows.value.findIndex(r => r.id === rowId)
  if (idx === -1) return
  const row = draftRows.value[idx]!
  const totalQty = totalQtyBySkuCode.value.get(row.skuCode) ?? 0
  const totalAssigned = draftRows.value
    .filter(r => r.skuCode === row.skuCode)
    .reduce((s, r) => s + (r.qty || 0), 0)
  const remainder = Math.max(0, totalQty - totalAssigned)
  const newRow: DraftRow = { id: newRowId(), skuCode: row.skuCode, qty: remainder, binLocation: row.binLocation }
  const next = [...draftRows.value]
  next.splice(idx + 1, 0, newRow)
  draftRows.value = next
}

// ── Storage location picker ───────────────────────────────────────────────────
const activeLocRowId = ref<string | null>(null)
const locSearch      = ref('')

function openLocPicker(rowId: string)  { activeLocRowId.value = rowId; locSearch.value = '' }
function closeLocPicker(rowId: string) { if (activeLocRowId.value === rowId) { activeLocRowId.value = null; locSearch.value = '' } }
function locOptionsFiltered(rowId: string) {
  const q = activeLocRowId.value === rowId ? locSearch.value.trim().toLowerCase() : ''
  if (!q) return locationOptions.value
  return locationOptions.value.filter(loc => loc.toLowerCase().includes(q))
}
// First 3 options surface as "Recommended locations"; the rest sit below a divider.
function recommendedLocOptions(rowId: string) { return locOptionsFiltered(rowId).slice(0, 3) }
function otherLocOptions(rowId: string) { return locOptionsFiltered(rowId).slice(3) }

function updateLocation(rowId: string, loc: string) {
  draftRows.value = draftRows.value.map(r => r.id === rowId ? { ...r, binLocation: loc } : r)
}

// ── Scan bar ──────────────────────────────────────────────────────────────────
const activeBin  = ref<string | null>(null)
const flashRowId = ref<string | null>(null)
let flashTimer: ReturnType<typeof setTimeout> | null = null

function handleScan(rawValue: string) {
  const v = rawValue.trim()
  if (!v) return

  // Bin scan
  if (locationOptions.value.includes(v)) {
    activeBin.value = v
    playScanSuccessSound()
    return
  }

  // SKU scan — only for plain (non-batch, non-serial) rows
  const bin = activeBin.value
  const skuRows = draftRows.value.filter(r =>
    r.skuCode === v && !isBatchTrackedSku(r.skuCode) && !isSerialTrackedSku(r.skuCode),
  )
  if (skuRows.length) {
    const binRow = bin ? skuRows.find(r => r.binLocation === bin) : null

    if (bin && !binRow) {
      // Active bin differs from every existing row → auto-split a new row for this bin
      const totalQty    = totalQtyBySkuCode.value.get(v) ?? 0
      const assignedQty = skuRows.reduce((s, r) => s + (r.qty || 0), 0)
      if (assignedQty >= totalQty) {
        notifyScanError(`${v}: received qty already fully assigned`)
        return
      }
      const newRow: DraftRow = { id: newRowId(), skuCode: v, qty: 1, binLocation: bin }
      const lastSkuIdx = draftRows.value.reduce((acc, r, i) => r.skuCode === v ? i : acc, -1)
      const next = [...draftRows.value]
      next.splice(lastSkuIdx + 1, 0, newRow)
      draftRows.value = next
      playScanSuccessSound()
      flashRowId.value = newRow.id
      if (flashTimer) clearTimeout(flashTimer)
      flashTimer = setTimeout(() => { flashRowId.value = null }, 700)
      return
    }

    // Update existing row — prefer matching-bin row > unassigned row > first row
    const target = binRow ?? skuRows.find(r => !r.binLocation) ?? skuRows[0]!
    const cap = remainingQtyFor(target)
    if (cap === 0) {
      notifyScanError(`${v}: received qty already fully assigned`)
      return
    }
    const nextBin = target.binLocation || bin || ''
    draftRows.value = draftRows.value.map(r =>
      r.id === target.id ? { ...r, qty: Math.min((r.qty || 0) + 1, cap), binLocation: nextBin } : r,
    )
    playScanSuccessSound()
    flashRowId.value = target.id
    if (flashTimer) clearTimeout(flashTimer)
    flashTimer = setTimeout(() => { flashRowId.value = null }, 700)
    return
  }

  // Batch number scan — find the batch across all batch-tracked SKUs
  for (const [skuCode, batches] of Object.entries(batchLinesBySku.value)) {
    const bIdx = batches.findIndex(b => b.batchNo === v)
    if (bIdx !== -1) {
      if (!bin) {
        notifyScanError('Scan a bin first before scanning batch numbers')
        return
      }
      const batch = batches[bIdx]!
      const totalAssigned = (batch.destLocations ?? []).reduce((s, d) => s + d.qty, 0)
      if (totalAssigned >= batch.onHand) {
        notifyScanError(`${v}: batch qty fully assigned`)
        return
      }
      const newDest = [...(batch.destLocations ?? [])]
      const dIdx = newDest.findIndex(d => d.locationId === bin)
      if (dIdx !== -1) {
        newDest[dIdx] = { locationId: bin, qty: newDest[dIdx]!.qty + 1 }
      } else {
        newDest.push({ locationId: bin, qty: 1 })
      }
      batchLinesBySku.value = {
        ...batchLinesBySku.value,
        [skuCode]: batches.map((b, i) => i === bIdx ? { ...b, destLocations: newDest } : b),
      }
      playScanSuccessSound()
      const row = draftRows.value.find(r => r.skuCode === skuCode)
      if (row) {
        flashRowId.value = row.id
        if (flashTimer) clearTimeout(flashTimer)
        flashTimer = setTimeout(() => { flashRowId.value = null }, 700)
      }
      return
    }
  }

  // Serial number scan — find the serial across all serial-tracked SKUs
  for (const [skuCode, serials] of Object.entries(serialLinesBySku.value)) {
    const idx = serials.findIndex(s => s.serial === v)
    if (idx !== -1) {
      if (!bin) {
        notifyScanError('Scan a bin first before scanning serial numbers')
        return
      }
      const updated = serials.map((s, i) => i === idx ? { ...s, destLocationId: bin } : s)
      serialLinesBySku.value = { ...serialLinesBySku.value, [skuCode]: updated }
      playScanSuccessSound()
      const row = draftRows.value.find(r => r.skuCode === skuCode)
      if (row) {
        flashRowId.value = row.id
        if (flashTimer) clearTimeout(flashTimer)
        flashTimer = setTimeout(() => { flashRowId.value = null }, 700)
      }
      return
    }
  }

  notifyScanError(`Barcode not found: "${v}"`)
}

function fmt(n: number) { return n.toLocaleString('id-ID') }

// Plain SKUs contribute their draftRows as-is; batch/serial-tracked SKUs get
// flattened from their per-bin drawer assignments into the same {skuCode, qty,
// binLocation} shape, and their full assignment detail is kept for persistence
// (so reopening a draft restores exactly which batch/serial went where).
function buildItemsAndAssignments() {
  const items: Array<{ skuCode: string; qty: number; binLocation: string }> = []
  const batchAssignments: Record<string, PutAwayBatchAssignment[]> = {}
  const serialAssignments: Record<string, PutAwaySerialAssignment[]> = {}
  const seenTracked = new Set<string>()

  for (const r of draftRows.value) {
    if (isBatchTrackedSku(r.skuCode)) {
      if (seenTracked.has(r.skuCode)) continue
      seenTracked.add(r.skuCode)
      const lines = batchLinesBySku.value[r.skuCode] ?? []
      batchAssignments[r.skuCode] = lines.map(b => ({
        batchNo: b.batchNo, expiryDate: b.expiryDate, desc: b.desc, qty: b.onHand, unit: b.unit,
        destLocations: b.destLocations,
      }))
      const byBin = new Map<string, number>()
      for (const b of lines) for (const d of b.destLocations ?? []) {
        if (d.qty > 0) byBin.set(d.locationId, (byBin.get(d.locationId) ?? 0) + d.qty)
      }
      for (const [binLocation, qty] of byBin) items.push({ skuCode: r.skuCode, qty, binLocation })
    } else if (isSerialTrackedSku(r.skuCode)) {
      if (seenTracked.has(r.skuCode)) continue
      seenTracked.add(r.skuCode)
      const serials = serialLinesBySku.value[r.skuCode] ?? []
      serialAssignments[r.skuCode] = serials.map(s => ({ serial: s.serial, destLocationId: s.destLocationId }))
      const byBin = new Map<string, number>()
      for (const s of serials) if (s.destLocationId) byBin.set(s.destLocationId, (byBin.get(s.destLocationId) ?? 0) + 1)
      for (const [binLocation, qty] of byBin) items.push({ skuCode: r.skuCode, qty, binLocation })
    } else {
      items.push({ skuCode: r.skuCode, qty: r.qty, binLocation: r.binLocation })
    }
  }
  return { items, assignments: { batchAssignments, serialAssignments } }
}

// Per-SKU check — an aggregate qty total can hit zero even when one SKU is
// over-assigned and another under-assigned, or when a plain SKU's qty was entered
// but never given a location. Every SKU must land on EXACTLY its received qty,
// fully backed by a real storage location, for batch/serial/plain alike.
function findIncompleteSku(): { name: string; reason: 'missing' | 'over' } | null {
  const skus = new Set(draftRows.value.map(r => r.skuCode))
  for (const sku of skus) {
    const expected = totalQtyBySkuCode.value.get(sku) ?? 0
    let assigned: number
    let missingLocation: boolean

    if (isBatchTrackedSku(sku)) {
      assigned = batchAssignedQty(sku)
      missingLocation = assigned < expected
    } else if (isSerialTrackedSku(sku)) {
      assigned = serialAssignedQty(sku)
      missingLocation = assigned < expected
    } else {
      const rows = draftRows.value.filter(r => r.skuCode === sku)
      assigned = rows.reduce((s, r) => s + (r.qty || 0), 0)
      missingLocation = rows.some(r => (r.qty || 0) > 0 && !r.binLocation)
    }

    if (missingLocation || assigned !== expected) {
      const name = itemBySkuCode.value.get(sku)?.productName ?? sku
      return { name, reason: assigned > expected ? 'over' : 'missing' }
    }
  }
  return null
}

function postPutAway() {
  const incomplete = findIncompleteSku()
  if (incomplete) {
    toast.notify({
      variant: 'error',
      title: incomplete.reason === 'over'
        ? `${incomplete.name}: put away qty exceeds received qty`
        : `${incomplete.name}: select a storage location for the full received qty`,
      maxWidth: 'max-content',
    })
    return
  }
  const { items, assignments } = buildItemsAndAssignments()
  endPutAwayTask(props.orderId, items, assignments)
  toast.notify({ variant: 'success', title: 'Put-away finished' , maxWidth: 'max-content'})
  // Already committed — the router.push below is this function's own doing,
  // not the operator losing unsaved work, so the guard mustn't fire on it.
  disableUnsavedChangesGuard()
  router.push(`/put-away/${props.orderId}`)
}

function saveDraft() {
  const { items, assignments } = buildItemsAndAssignments()
  savePutAwayDraft(props.orderId, items, assignments)
  toast.notify({ variant: 'success', title: 'Put-away draft saved' , maxWidth: 'max-content'})
  disableUnsavedChangesGuard()
  router.push(`/put-away/${props.orderId}`)
}

// ── Warn before losing unsaved put-away progress — refresh/close-tab (native
// prompt) and in-app navigation/Back button (modal rendered once at the app
// root, see [...slug].vue — this app has a single catch-all route, so a
// per-page modal/onBeforeRouteLeave never fires). "Unsaved" = anything
// assigned a bin at all. disableUnsavedChangesGuard() is called by
// postPutAway()/saveDraft() right before their own router.push — otherwise
// hasUnsavedChanges() would still read true (nothing else resets the
// assignment state after commit) and the "Leave without saving?" modal would
// fire right after the operator's own intentional Finish/Save action. ───────
const { disableGuard: disableUnsavedChangesGuard } = useUnsavedChangesGuard({
  hasUnsavedChanges: () => draftHandled.value > 0,
  saveDraft: () => {
    const { items, assignments } = buildItemsAndAssignments()
    savePutAwayDraft(props.orderId, items, assignments)
    toast.notify({ variant: 'success', title: 'Put-away draft saved', maxWidth: 'max-content' })
  },
})

function goBack()    { router.push(`/put-away/${props.orderId}`) }
function goPutAway() { router.push('/inbound-delivery?tab=Put-away') }

// ── Start date label ──────────────────────────────────────────────────────────
const startDateLabel = computed(() => formatDateTimeLong(task.value?.startDate))

// ── Footer overflow divider ───────────────────────────────────────────────────
const stageEl          = ref<HTMLElement | null>(null)
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
    setupItemsObserver()
  })
})
onUnmounted(() => {
  stageObserver?.disconnect()
  stageEl.value?.removeEventListener('scroll', checkStageOverflow)
  itemsObserver?.disconnect()
  if (flashTimer) clearTimeout(flashTimer)
})
watch([() => props.orderId, shownCount], () => nextTick(checkStageOverflow))
</script>

<template>
  <div v-if="task" class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb" @click="goPutAway">Put-away</button>
          <span class="detail-breadcrumb-sep">/</span>
          <button class="detail-breadcrumb" @click="goBack">{{ task.taskNo }}</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">Put away items</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">

      <div class="pi-header">
        <ContentList label="Warehouse" :value="task.warehouseName" />
        <ContentList label="Assignee" :value="task.assignee" />
        <ContentList label="Start date" :value="startDateLabel" />
      </div>

      <div class="pi-summary">
        <div class="pi-stat">
          <span class="pi-stat-label">SKU qty</span>
          <span class="pi-stat-val">{{ fmt(skuQty) }}</span>
        </div>
        <div class="pi-stat">
          <span class="pi-stat-label">Received qty</span>
          <span class="pi-stat-val">{{ fmt(receivedQty) }}</span>
        </div>
        <div class="pi-stat">
          <span class="pi-stat-label">Put away qty</span>
          <span class="pi-stat-val">{{ fmt(draftHandled) }}</span>
        </div>
      </div>

      <div class="pi-sku-section">

        <div class="pi-filter-bar">
          <span class="pi-editing-hint">Scan or enter the put away qty and confirm the storage location for each item.</span>
          <div class="pi-search-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input v-model="search" class="pi-search" type="text" placeholder="Search..." />
            <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- ── Scan bar ── -->
        <ScanBar placeholder="Scan barcode..." @scan="handleScan">
          <div v-if="activeBin" class="pi-active-bin">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 13L9 17L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>{{ activeBin }}</span>
            <button class="pi-active-bin-clear" type="button" aria-label="Clear active bin" @click="activeBin = null">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </ScanBar>

        <section class="pi-items-section" :class="{ 'pi-items-section--bordered': isProgressive }">
          <div ref="itemsScrollEl" class="pi-items-scroll">
            <table class="pi-items">
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
                  <th class="pi-th">Product</th>
                  <th class="pi-th">SKU</th>
                  <th class="pi-th">Storage location</th>
                  <th class="pi-th pi-th--num">Received qty</th>
                  <th class="pi-th pi-th--num">Put away qty</th>
                  <th class="pi-th">Unit</th>
                  <th class="pi-th pi-th--action" aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in rowsWithMeta" :key="row.id" class="pi-row" :class="{ 'pi-row--flash': flashRowId === row.id }">
                  <!-- Product — merged across split rows -->
                  <td v-if="row.groupIndex === 0" class="pi-td pi-td--merged" :rowspan="row.groupSize">
                    <ProductCell
                      :name="itemBySkuCode.get(row.skuCode)?.productName ?? ''"
                      :desc="itemBySkuCode.get(row.skuCode)?.productDesc"
                      :image="itemBySkuCode.get(row.skuCode)?.image"
                    />
                  </td>
                  <!-- SKU — merged -->
                  <td v-if="row.groupIndex === 0" class="pi-td pi-td--merged" :rowspan="row.groupSize">{{ row.skuCode }}</td>
                  <!-- Storage location: batch/serial-tracked SKUs manage it via the
                       action column's icon button instead (location detail lives in
                       the Manage batch / Manage serial numbers drawer, not here);
                       plain SKUs keep the picker. -->
                  <td v-if="isBatchTrackedSku(row.skuCode)" class="pi-td pi-td--location-tracked">
                    <MpTooltip :id="`pi-tt-loc-batch-${row.id}`" label="View via Manage batch" placement="top" use-portal>
                      <span>—</span>
                    </MpTooltip>
                  </td>
                  <td v-else-if="isSerialTrackedSku(row.skuCode)" class="pi-td pi-td--location-tracked">
                    <MpTooltip :id="`pi-tt-loc-serial-${row.id}`" label="View via Manage serial numbers" placement="top" use-portal>
                      <span>—</span>
                    </MpTooltip>
                  </td>
                  <td v-else class="pi-td pi-td--location">
                    <MpPopover :id="`pi-loc-${row.id}`" placement="bottom-start" use-portal :is-keep-alive="false" is-close-on-select @close="closeLocPicker(row.id)">
                      <MpPopoverTrigger>
                        <div class="pi-loc-trigger">
                          <input
                            class="pi-loc-input"
                            type="text"
                            autocomplete="off"
                            :value="activeLocRowId === row.id ? locSearch : row.binLocation"
                            placeholder="Select storage location"
                            @focus="openLocPicker(row.id)"
                            @input="activeLocRowId = row.id; locSearch = ($event.target as HTMLInputElement).value"
                          />
                          <svg class="pi-loc-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                        </div>
                      </MpPopoverTrigger>
                      <MpPopoverContent :class="css({ width: '360px', maxHeight: '300px', overflowY: 'auto', padding: '0' })">
                        <template v-if="locOptionsFiltered(row.id).length">
                          <p class="pi-loc-section-heading">Recommended locations</p>
                          <MpPopoverList>
                            <MpPopoverListItem v-for="loc in recommendedLocOptions(row.id)" :key="loc" :is-active="loc === row.binLocation" @click="updateLocation(row.id, loc)">{{ loc }}</MpPopoverListItem>
                          </MpPopoverList>
                          <template v-if="otherLocOptions(row.id).length">
                            <div class="pi-loc-divider" />
                            <MpPopoverList>
                              <MpPopoverListItem v-for="loc in otherLocOptions(row.id)" :key="loc" :is-active="loc === row.binLocation" @click="updateLocation(row.id, loc)">{{ loc }}</MpPopoverListItem>
                            </MpPopoverList>
                          </template>
                        </template>
                        <p v-else class="pi-loc-none">No locations found.</p>
                      </MpPopoverContent>
                    </MpPopover>
                  </td>
                  <!-- Received qty — merged, summed across all receiving tasks -->
                  <td v-if="row.groupIndex === 0" class="pi-td pi-td--merged pi-td--num" :rowspan="row.groupSize">{{ fmt(totalQtyBySkuCode.get(row.skuCode) ?? 0) }}</td>
                  <!-- Put away qty: batch/serial-tracked SKUs show the value directly -->
                  <td v-if="isBatchTrackedSku(row.skuCode)" class="pi-td pi-td--num">
                    <span class="pi-batch-val">{{ fmt(batchAssignedQty(row.skuCode)) }}</span>
                  </td>
                  <td v-else-if="isSerialTrackedSku(row.skuCode)" class="pi-td pi-td--num">
                    <span class="pi-batch-val">{{ fmt(serialAssignedQty(row.skuCode)) }}</span>
                  </td>
                  <td v-else class="pi-td pi-td--input">
                    <MpTooltip
                      v-if="qtyScanRequired(remainingQtyFor(row))"
                      :id="`pi-tt-scan-${row.id}`"
                      label="Qty at or below the scan threshold — scan the barcode instead of typing"
                      placement="top"
                      use-portal
                    >
                      <input
                        class="pi-qty-input"
                        type="number" min="0" :max="remainingQtyFor(row)"
                        :value="row.qty"
                        :aria-label="`Put away qty for ${itemBySkuCode.get(row.skuCode)?.productName}`"
                        disabled
                      />
                    </MpTooltip>
                    <input
                      v-else
                      class="pi-qty-input"
                      type="number" min="0" :max="remainingQtyFor(row)"
                      :value="row.qty"
                      :aria-label="`Put away qty for ${itemBySkuCode.get(row.skuCode)?.productName}`"
                      @input="onQtyInput(row.id, $event)"
                    />
                  </td>
                  <!-- Unit — merged -->
                  <td v-if="row.groupIndex === 0" class="pi-td pi-td--merged" :rowspan="row.groupSize">{{ itemBySkuCode.get(row.skuCode)?.unit }}</td>
                  <!-- Actions — batch/serial-tracked SKUs manage storage location here
                       (icon button); "Split storage location" only applies to plain SKUs. -->
                  <td class="pi-td pi-td--action">
                    <MpTooltip v-if="isBatchTrackedSku(row.skuCode)" :id="`pi-tt-batch-${row.id}`" label="Manage batch" placement="top" use-portal>
                      <button class="pi-view-btn" type="button" aria-label="Manage batch" @click="openBatchDrawer(row.skuCode)">
                        <MpIcon name="competencies" size="md" />
                      </button>
                    </MpTooltip>
                    <MpTooltip v-else-if="isSerialTrackedSku(row.skuCode)" :id="`pi-tt-serial-${row.id}`" label="Manage serial numbers" placement="top" use-portal>
                      <button class="pi-view-btn" type="button" aria-label="Manage serial numbers" @click="openSerialDrawer(row.skuCode)">
                        <MpIcon name="competencies" size="md" />
                      </button>
                    </MpTooltip>
                    <MpPopover
                      v-else
                      :id="`pi-row-${row.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end"
                    >
                      <MpPopoverTrigger>
                        <button class="pi-row-kebab" aria-label="More actions">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
                          </svg>
                        </button>
                      </MpPopoverTrigger>
                      <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
                        <MpPopoverList>
                          <MpPopoverListItem @click="splitRow(row.id)">Split storage location</MpPopoverListItem>
                        </MpPopoverList>
                      </MpPopoverContent>
                    </MpPopover>
                  </td>
                </tr>
                <tr v-if="!filteredRows.length">
                  <td class="pi-td pi-empty" colspan="7">No products match your search.</td>
                </tr>
              </tbody>
            </table>
            <div ref="itemsSentinelEl" class="pi-sentinel" aria-hidden="true" />
            <div v-if="loadingMore" class="pi-loading">
              <MpSpinner size="sm" /> Loading items…
            </div>
          </div>
          <div class="pi-items-count">
            Showing {{ pagedRows.length }} of {{ filteredRows.length }} items
          </div>
        </section>

      </div>
    </div>

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <button class="pi-btn pi-btn--ghost" @click="goBack">Cancel</button>
      <button class="pi-btn pi-btn--secondary" @click="saveDraft">Save as draft</button>
      <button class="pi-btn pi-btn--primary" @click="postPutAway">Finish put-away</button>
    </footer>
  </div>

  <div v-else class="pi-not-found">
    <p>Put-away task not found.</p>
    <button class="detail-breadcrumb" @click="goPutAway">Back to Put-away</button>
  </div>

  <ManageBatchDrawer
    v-if="batchDrawerSku"
    :open="batchDrawerOpen"
    :sku="batchDrawerSku"
    :warehouse-id="task?.warehouseId ?? ''"
    kind="put-away"
    :dest-location-paths="locationOptions"
    :model-value="batchLinesBySku[batchDrawerSku] ?? []"
    :initial-active-bin="activeBin"
    @update:open="batchDrawerOpen = $event"
    @save="saveBatchLines"
  />
  <ManageSerialDrawer
    v-if="serialDrawerSku"
    :open="true"
    :sku="serialDrawerSku"
    :warehouse-id="task?.warehouseId ?? ''"
    kind="put-away"
    :target-count="(serialLinesBySku[serialDrawerSku] ?? []).length"
    :dest-location-paths="locationOptions"
    :model-value="serialLinesBySku[serialDrawerSku] ?? []"
    :initial-active-bin="activeBin"
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
  display: flex; align-items: center; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb-trail { display: flex; align-items: center; gap: var(--mp-spacing-1); align-self: flex-start; line-height: var(--mp-line-heights-sm); }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-breadcrumb-sep { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column; gap: var(--mp-spacing-6);
}
.detail-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage); border-top: 1px solid transparent;
}
.detail-footer--floating { border-top-color: var(--mp-border-default); }

/* ── Task header ─────────────────────────────────────────────────────────────── */
.pi-header {
  display: flex; flex-wrap: wrap; gap: var(--mp-spacing-5) var(--mp-spacing-10);
  padding-bottom: var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
}
.pi-header :deep(.content-list) { padding-top: 0; flex: 0 0 318px; width: 318px; }
.pi-header :deep(.content-list__value) { white-space: normal; overflow-wrap: break-word; word-break: break-word; }

/* ── Summary stats ───────────────────────────────────────────────────────────── */
.pi-summary { display: flex; gap: var(--mp-spacing-10); align-self: flex-start; }
.pi-stat { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: 96px; }
.pi-stat-val {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); font-variant-numeric: tabular-nums;
}
.pi-stat-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Section wrapper ─────────────────────────────────────────────────────────── */
.pi-sku-section { display: flex; flex-direction: column; }

/* ── Filter bar ──────────────────────────────────────────────────────────────── */
.pi-filter-bar {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-5);
}
.pi-editing-hint {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-normal);
  color: var(--mp-text-default); white-space: nowrap;
}
.pi-search-wrap {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary); min-width: 260px;
}
.pi-search-wrap:focus-within { border-color: var(--mp-border-bold); box-shadow: 0 0 0 1px var(--mp-border-bold); }
.pi-search {
  flex: 1; border: none; background: transparent; outline: none;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.pi-search::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }

/* ── Items table section ─────────────────────────────────────────────────────── */
.pi-items-section { display: flex; flex-direction: column; flex-shrink: 0; }
.pi-items-section--bordered {
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-lg); overflow: hidden;
}
.pi-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: auto; }
.pi-items thead .pi-th { position: sticky; top: 0; z-index: 1; }
.pi-items { width: 100%; border-collapse: collapse; table-layout: auto; }

.pi-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-default, #fff);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.pi-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.pi-th--action { padding: 0; width: 48px; min-width: 48px; position: sticky; right: 0; z-index: 2; background: var(--mp-background-default, #fff); }

.pi-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  background: var(--mp-background-neutral-hovered);
  border-bottom: 1px solid var(--mp-border-default);
  border-right: 1px solid var(--mp-border-default);
  vertical-align: top;
}
.pi-td:last-child { border-right: none; }
.pi-td--num { text-align: right; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); white-space: nowrap; }
.pi-td--action { padding: 0; width: 48px; min-width: 48px; position: sticky; right: 0; z-index: 2; background: var(--mp-background-neutral-hovered); }

/* ── Product cell ─────────────────────────────────────────────────────────────── */
/* ── Qty to handle input ─────────────────────────────────────────────────────── */
.pi-td--input { padding: 0; background: var(--mp-background-neutral, #fff); }
.pi-td--input:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }
.pi-qty-input {
  display: block; width: 100%; box-sizing: border-box;
  padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4);
  border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  text-align: right; font-variant-numeric: tabular-nums;
  line-height: var(--mp-line-heights-md);
}

/* ── Storage location cell (popover picker) ──────────────────────────────────── */
.pi-td--location { padding: 0; background: var(--mp-background-neutral, #fff); }
.pi-td--location:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }
.pi-loc-trigger { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 100%; min-height: var(--mp-sizes-10, 40px); padding: 0 var(--mp-spacing-3); cursor: text; }
.pi-loc-input { flex: 1; min-width: 0; border: none; outline: none; background: none; padding: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: text; }
.pi-loc-input::placeholder { color: var(--mp-text-placeholder); }
.pi-loc-chevron { flex-shrink: 0; color: var(--mp-icon-default); }
.pi-loc-none { margin: 0; padding: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); text-align: center; }
.pi-loc-section-heading { margin: 0; padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pi-loc-divider { height: 1px; margin: var(--mp-spacing-1) 0; background: var(--mp-border-default); }

/* Storage location — read-only bin summary for batch/serial-tracked SKUs.
   The flex layout lives on an inner wrapper div, not the <td> itself — display:flex
   directly on a <td> breaks the browser's native table-row height stretch, so the
   <td> stays a normal table cell and the wrapper's height:100% fills whatever
   height the row ends up being (matching the "Unit" column exactly). */
.pi-td--location-summary {
  padding: 0; color: var(--mp-text-default);
  background: var(--mp-background-neutral-subtle);
  vertical-align: top;
}
.pi-location-summary-wrap { display: flex; flex-direction: column; height: 100%; }
.pi-location-summary-item { display: flex; align-items: center; height: var(--mp-sizes-10, 40px); padding: 0 var(--mp-spacing-2); flex-shrink: 0; }
.pi-location-summary-item:not(:last-child) { border-bottom: 1px solid var(--mp-border-default); }

.pi-batch-val { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.pi-td--location-tracked { padding: 10px var(--mp-spacing-4); vertical-align: top; color: var(--mp-text-secondary); }
.pi-view-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border-radius: var(--mp-radii-md); background: none; border: none;
  cursor: pointer; color: var(--mp-icon-default);
}
.pi-view-btn:hover { background: var(--mp-background-neutral-hovered); }

/* ── Row actions (kebab) ─────────────────────────────────────────────────────── */
.pi-row-kebab {
  display: flex; align-items: center; justify-content: center;
  width: 100%; height: 100%; min-height: 40px;
  border: none; background: none; cursor: pointer;
  color: var(--mp-text-secondary);
}
.pi-row-kebab:hover { color: var(--mp-text-default); }

/* ── Pagination & misc ───────────────────────────────────────────────────────── */
.pi-sentinel { height: 1px; }
.pi-loading {
  display: flex; align-items: center; justify-content: center;
  gap: var(--mp-spacing-2); padding: var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
.pi-items-count {
  padding: var(--mp-spacing-3) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.pi-empty { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-8) 0; }

/* ── Footer buttons ──────────────────────────────────────────────────────────── */
.pi-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer; border: 1px solid transparent; white-space: nowrap;
  line-height: var(--mp-line-heights-md); transition: background 0.15s;
}
.pi-btn--ghost     { background: transparent; border-color: transparent; color: var(--mp-text-secondary); }
.pi-btn--ghost:hover { background: var(--mp-background-neutral-hovered); }
.pi-btn--secondary { background: var(--mp-background-neutral); border-color: var(--mp-border-bold); color: var(--mp-text-default); }
.pi-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }
.pi-btn--primary   { background: var(--mp-background-brand-bold, #029861); border-color: transparent; color: var(--mp-text-on-color, #fff); }
.pi-btn--primary:hover { background: var(--mp-background-brand-bold-hovered, #027a4e); }

.pi-active-bin {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1\.5);
  padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-2\.5);
  background: #e6f7ef; border: 1px solid #029861;
  border-radius: var(--mp-radii-full); white-space: nowrap;
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: #027a4e; flex-shrink: 0;
}
.pi-active-bin-clear {
  background: none; border: none; padding: 0; cursor: pointer;
  color: inherit; display: flex; align-items: center; opacity: 0.7; line-height: 1;
}
.pi-active-bin-clear:hover { opacity: 1; }

/* ── Row flash on SKU scan ───────────────────────────────────────────────────── */
@keyframes pi-row-flash {
  0%   { background: rgba(2, 152, 97, 0.12); }
  100% { background: var(--mp-background-neutral-hovered); }
}
.pi-row--flash .pi-td { animation: pi-row-flash 0.7s ease-out forwards; }
.pi-row--flash .pi-td--input,
.pi-row--flash .pi-td--location { animation: pi-row-flash 0.7s ease-out forwards; }

/* ── Not found ───────────────────────────────────────────────────────────────── */
.pi-not-found {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--mp-spacing-4); flex: 1; height: 100%;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
</style>
