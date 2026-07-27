<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import {
  MpAccordion, MpAccordionItem, MpAccordionHeader, MpAccordionIcon, MpAccordionPanel,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton,
  MpCheckbox,
  MpIcon,
  MpTooltip,
  toast,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import ManageSerialDrawer, { type CommittedSerial } from '~/components/patterns/ManageSerialDrawer.vue'
import ManageBatchDrawer, { type CommittedBatch } from '~/components/patterns/ManageBatchDrawer.vue'
import ScanBar from '~/components/patterns/ScanBar.vue'
import { getWmsAdjustment, saveWmsCountDraft, finishWmsCount } from '~/data/wmsStockAdjustments'
import { adjustmentLineItems, type AdjustmentLine } from '~/data/stockAdjustments'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { PRODUCTS } from '~/data/inventory'
import { formatDateTimeLong } from '~/utils/date'
import SelectProductDrawer, { type PickerProduct } from '~/components/patterns/SelectProductDrawer.vue'
import { getStorageLeaves, getStorageTree, type LocNode } from '~/data/storageLocations'
import { useUnsavedChangesGuard } from '~/composables/useUnsavedChangesGuard'
import { resolveScan, notifyScanError, sameCode } from '~/utils/scan'
import { playScanSuccessSound } from '~/utils/sound'

const props = defineProps<{ orderId: string }>()
const router = useRouter()

const adjustment = computed(() => getWmsAdjustment(props.orderId))

const lineItems = computed(() => adjustment.value ? adjustmentLineItems(adjustment.value) : [])

// ── Warehouse stock map (for batch/serial detection) ──────────────────────────
const warehouseStockMap = computed(() => {
  const wh = getWarehouseDetail(adjustment.value?.warehouseId ?? '')
  return Object.fromEntries((wh?.stock ?? []).map(s => [s.sku, s]))
})
function isBatchTrackedSku(sku: string) { return !!warehouseStockMap.value[sku]?.batches }
function isSerialTrackedSku(sku: string) { return !!warehouseStockMap.value[sku]?.serials }

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

// ── Expand batch-tracked SKUs into per-batch per-location rows (mirrors details) ─
const wmsCountLines = computed((): AdjustmentLine[] => {
  const wh = getWarehouseDetail(adjustment.value?.warehouseId ?? '')
  if (!wh) return lineItems.value

  const allWhLocs = [...new Set(wh.stock.flatMap(s => [
    ...s.locations,
    ...(s.batches?.map(b => b.location) ?? []),
  ]))]

  const result: AdjustmentLine[] = []
  for (const item of lineItems.value) {
    const whItem = warehouseStockMap.value[item.sku]
    if (!whItem?.batches?.length) { result.push(item); continue }
    for (let b = 0; b < whItem.batches.length; b++) {
      const batch = whItem.batches[b]!
      const bh = hashStr(batch.batchNo + String(b))
      const shouldSplit = bh % 3 !== 0
      if (shouldSplit) {
        const otherLocs = allWhLocs.filter(l => l !== batch.location)
        const loc2 = otherLocs.length ? otherLocs[bh % otherLocs.length]! : null
        if (loc2) {
          const qty1 = Math.ceil(batch.onHand * 0.6)
          const qty2 = batch.onHand - qty1
          result.push({ key: `${item.sku}~${batch.batchNo}~a`, sku: item.sku, product: item.product, unit: item.unit, averageCost: item.averageCost, prevOnHand: qty1, counted: qty1, difference: 0, storageLocation: batch.location, batchNumber: batch.batchNo, batchExpiry: batch.expiryDate })
          result.push({ key: `${item.sku}~${batch.batchNo}~b`, sku: item.sku, product: item.product, unit: item.unit, averageCost: item.averageCost, prevOnHand: qty2, counted: qty2, difference: 0, storageLocation: loc2, batchNumber: batch.batchNo, batchExpiry: batch.expiryDate })
          continue
        }
      }
      result.push({ key: `${item.sku}~${batch.batchNo}`, sku: item.sku, product: item.product, unit: item.unit, averageCost: item.averageCost, prevOnHand: batch.onHand, counted: batch.onHand, difference: 0, storageLocation: batch.location, batchNumber: batch.batchNo, batchExpiry: batch.expiryDate })
    }
  }
  return result
})

// ── Merge same-SKU rows within a location into one row — batch splits stay
// visible only inside the Manage batch drawer, not as separate table rows. ────
interface MergedCountRow {
  key: string // `${sku}::${location}` — unique per product per bin
  sku: string
  product: AdjustmentLine['product']
  unit: string
  storageLocation: string
  prevOnHand: number
  sources: AdjustmentLine[] // the underlying (possibly batch-split) wmsCountLines entries
}
const mergedCountRows = computed((): MergedCountRow[] => {
  const map = new Map<string, MergedCountRow>()
  for (const item of wmsCountLines.value) {
    const loc = item.storageLocation || '—'
    const key = `${item.sku}::${loc}`
    let row = map.get(key)
    if (!row) {
      row = { key, sku: item.sku, product: item.product, unit: item.unit, storageLocation: loc, prevOnHand: 0, sources: [] }
      map.set(key, row)
    }
    row.prevOnHand += item.prevOnHand
    row.sources.push(item)
  }
  return [...map.values()]
})
function mergedRowFor(sku: string, location: string): MergedCountRow | undefined {
  return mergedCountRows.value.find(r => r.sku === sku && sameCode(r.storageLocation, location))
}

// ── Draft counted quantities keyed by MergedCountRow.key (untracked SKUs only —
// batch/serial-tracked rows are fully managed inside their own drawer) ─────────
const draftCounted = ref<Record<string, number | undefined>>({})
// Batch-tracked rows: the drawer's own committed breakdown, keyed by row.key.
const batchLinesByKey = ref<Record<string, CommittedBatch[]>>({})
// Product rows (system + operator-added) unlock their manual counted-qty input
// only once scanned at least once — matches picking's "confirm physically
// present before counting it" model, adapted from a threshold setting to an
// always-on requirement per the cycle-count flow.
const scannedKeys = ref<Set<string>>(new Set())
function markScanned(key: string) {
  if (scannedKeys.value.has(key)) return
  scannedKeys.value = new Set(scannedKeys.value).add(key)
}

function seedCounts() {
  const draft: Record<string, number | undefined> = {}
  const batches: Record<string, CommittedBatch[]> = {}
  for (const row of mergedCountRows.value) {
    const saved = adjustment.value?.lines?.find(l => l.sku === row.sku)
    const totalForSku = mergedCountRows.value.filter(r => r.sku === row.sku).reduce((s, r) => s + r.prevOnHand, 0) || 1
    const seededForRow = saved && saved.qty > 0 ? Math.round(saved.qty * row.prevOnHand / totalForSku) : 0
    if (isBatchTrackedSku(row.sku)) {
      const rowTotal = row.sources.reduce((s, src) => s + src.prevOnHand, 0) || 1
      batches[row.key] = row.sources.map(src => {
        const seededForSource = seededForRow > 0 ? Math.round(seededForRow * src.prevOnHand / rowTotal) : 0
        return {
          key: src.key, batchNo: src.batchNumber!, expiryDate: src.batchExpiry ?? '', desc: '',
          onHand: src.prevOnHand, counted: seededForSource > 0 ? seededForSource : null,
          unit: src.unit, location: src.storageLocation,
        }
      })
    } else if (seededForRow > 0) {
      draft[row.key] = seededForRow
    }
  }
  draftCounted.value = draft
  batchLinesByKey.value = batches
}
watch(mergedCountRows, seedCounts, { immediate: true })

function onCountedInput(key: string, e: Event) {
  let n = Math.floor(Number((e.target as HTMLInputElement).value))
  if (!Number.isFinite(n) || n < 0) n = 0
  draftCounted.value = { ...draftCounted.value, [key]: n }
}

/** Total counted for a merged system row, whichever source backs it. */
function countedFor(row: MergedCountRow): number {
  if (isBatchTrackedSku(row.sku)) return (batchLinesByKey.value[row.key] ?? []).reduce((s, b) => s + (b.counted ?? 0), 0)
  return draftCounted.value[row.key] ?? 0
}
function batchTotalFor(key: string): number {
  return (batchLinesByKey.value[key] ?? []).reduce((s, b) => s + (b.counted ?? 0), 0)
}

// ── Page-level scan bar ────────────────────────────────────────────────────────
// Mirrors picking's active-bin model: scan a bin barcode to make it "active",
// then a batch/serial/SKU scan only counts as counted once it's confirmed
// coming FROM that same bin — so counting can't be credited to the wrong
// physical location. Unlike picking there's no upper-bound qty to cap against
// (an over-count is meaningful signal, not an error), so re-scans just keep
// incrementing. A batch/serial-tracked product — whether scanned by its plain
// SKU or by one of its specific batch/serial codes — always opens that
// product's manage drawer rather than incrementing inline; only a genuinely
// untracked SKU increments directly on the page.
const scanLocations = computed(() => [...new Set(wmsCountLines.value.map(i => i.storageLocation).filter((l): l is string => !!l))])
const activeBin = ref<string | null>(null)
const flashRowKey = ref<string | null>(null)
let flashTimer: ReturnType<typeof setTimeout> | null = null
function flashRow(key: string) {
  flashRowKey.value = key
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => { flashRowKey.value = null }, 700)
}

function handleScan(rawValue: string) {
  const v = rawValue.trim()
  if (!v || !adjustment.value) return

  const matchedBin = scanLocations.value.find(loc => sameCode(loc, v))
  if (matchedBin) {
    activeBin.value = matchedBin
    playScanSuccessSound()
    return
  }

  const resolved = resolveScan(adjustment.value.warehouseId, v)
  if (!resolved) {
    notifyScanError(`Barcode not found: "${v}"`)
    return
  }

  if (!activeBin.value) {
    notifyScanError('Scan a bin first before scanning products')
    return
  }

  const row = mergedRowFor(resolved.sku, activeBin.value)
  let addedRow = Object.entries(addedByLoc.value)
    .find(([loc]) => sameCode(loc, activeBin.value!))?.[1]
    ?.find(r => r.sku === resolved.sku)

  // Not on this bin's count plan — the operator physically found it here.
  // Add it on the fly (same as "Add product") instead of rejecting the scan;
  // it then falls through to the exact same handling below as any planned
  // line, including "+ Add new batch" inside the drawer if this SKU has no
  // batch registered at all yet.
  if (!row && !addedRow) {
    addedRow = addScannedProduct(resolved.sku, activeBin.value)
  }

  const trackedByBatch = isBatchTrackedSku(resolved.sku)
  const trackedBySerial = isSerialTrackedSku(resolved.sku)

  if (trackedByBatch || trackedBySerial) {
    const initialScan = resolved.kind === 'batch' || resolved.kind === 'serial' ? v : undefined
    if (row) {
      if (trackedByBatch) openBatchDrawer(row.key, initialScan)
      else openSerialDrawer(row.key, initialScan)
    } else if (addedRow) {
      if (trackedByBatch) openBatchDrawer(addedRow.id, initialScan)
      else openSerialDrawer(addedRow.id, initialScan)
    }
    return
  }

  // Untracked SKU — plain +1 per scan, unlocked for manual entry going forward.
  if (row) {
    markScanned(row.key)
    draftCounted.value = { ...draftCounted.value, [row.key]: (draftCounted.value[row.key] ?? 0) + 1 }
    flashRow(row.key)
  } else if (addedRow) {
    markScanned(addedRow.id)
    incrementAddedCounted(activeBin.value, addedRow.id)
    flashRow(addedRow.id)
  }
  showQtyErrors.value = false
  playScanSuccessSound()
}

// Scanning is harmless to undo — nothing is persisted until Save draft / Finish
// counting — so let the operator wipe every unsaved scan/manual entry and start
// over. Doesn't touch activeBin: the operator's physical location hasn't
// changed just because the count itself is being redone.
function resetCount() {
  seedCounts()
  serialLinesByKey.value = {}
  scannedKeys.value = new Set()
  showQtyErrors.value = false
}

// ── Serial drawer ────────────────────────────────────────────────────────────
const serialDrawerKey = ref<string | null>(null)
const serialDrawerInitialScan = ref<string | undefined>(undefined)
const serialLinesByKey = ref<Record<string, string[]>>({})
const serialDrawerOpen = computed({
  get: () => serialDrawerKey.value !== null,
  set: (v: boolean) => { if (!v) serialDrawerKey.value = null },
})
function openSerialDrawer(key: string, initialScan?: string) {
  serialDrawerInitialScan.value = initialScan
  serialDrawerKey.value = key
}
const activeSerialSku = computed(() => {
  if (!serialDrawerKey.value) return ''
  return mergedCountRows.value.find(r => r.key === serialDrawerKey.value)?.sku
    ?? Object.values(addedByLoc.value).flat().find(r => r.id === serialDrawerKey.value)?.sku
    ?? ''
})
const activeSerialOnHand = computed(() => {
  if (!serialDrawerKey.value) return 0
  return mergedCountRows.value.find(r => r.key === serialDrawerKey.value)?.prevOnHand ?? 0
})
function serialCount(key: string): number { return serialLinesByKey.value[key]?.length ?? 0 }
function saveSerialLines(serials: CommittedSerial[]) {
  const key = serialDrawerKey.value
  if (!key) return
  serialLinesByKey.value = { ...serialLinesByKey.value, [key]: serials.map(s => s.serial) }
}

// ── Batch drawer ─────────────────────────────────────────────────────────────
const batchDrawerKey = ref<string | null>(null)
const batchDrawerInitialScan = ref<string | undefined>(undefined)
const batchDrawerOpen = computed({
  get: () => batchDrawerKey.value !== null,
  set: (v: boolean) => { if (!v) batchDrawerKey.value = null },
})
function openBatchDrawer(key: string, initialScan?: string) {
  batchDrawerInitialScan.value = initialScan
  batchDrawerKey.value = key
}
const activeBatchSku = computed(() => {
  if (!batchDrawerKey.value) return ''
  return mergedCountRows.value.find(r => r.key === batchDrawerKey.value)?.sku
    ?? Object.values(addedByLoc.value).flat().find(r => r.id === batchDrawerKey.value)?.sku
    ?? ''
})
const activeBatchLocationOnHand = computed(() => {
  if (!batchDrawerKey.value) return 0
  return mergedCountRows.value.find(r => r.key === batchDrawerKey.value)?.prevOnHand ?? 0
})
function saveBatchLines(batches: CommittedBatch[]) {
  const key = batchDrawerKey.value
  if (!key) return
  batchLinesByKey.value = { ...batchLinesByKey.value, [key]: batches }
}

// ── Manually added locations ──────────────────────────────────────────────────
const addedLocations = ref<string[]>([])

// Location drawer (tree-based)
const locDrawerOpen = ref(false)
const locDrawerSearch = ref('')
const locDrawerExpanded = ref<Set<string>>(new Set())
const locDrawerSel = ref<Set<string>>(new Set())

const leafPathToId = computed(() => {
  const wh = adjustment.value?.warehouseId ?? ''
  const map = new Map<string, string>()
  for (const l of getStorageLeaves(wh)) map.set(l.path, l.id)
  return map
})
const usedLeafIds = computed(() => {
  const s = new Set<string>()
  for (const g of groupedByLocation.value) {
    const id = leafPathToId.value.get(g.location)
    if (id) s.add(id)
  }
  return s
})

interface TreeDrawerItem { id: string; name: string; fullPath: string; depth: number; isLeaf: boolean; isExpanded: boolean; leafIds: string[] }
function collectLocLeafIds(nodes: LocNode[]): string[] {
  const ids: string[] = []
  const walk = (ns: LocNode[]) => ns.forEach(n => n.children.length ? walk(n.children) : ids.push(n.id))
  walk(nodes)
  return ids
}
const locDrawerItems = computed((): TreeDrawerItem[] => {
  const q = locDrawerSearch.value.trim().toLowerCase()
  const wh = adjustment.value?.warehouseId ?? ''
  const result: TreeDrawerItem[] = []
  const walk = (nodes: LocNode[], depth: number, trail: string[]) => {
    for (const n of nodes) {
      const here = [...trail, n.name]
      const isLeaf = n.children.length === 0
      const fullPath = here.join(' / ')
      if (q) {
        if (isLeaf && fullPath.toLowerCase().includes(q))
          result.push({ id: n.id, name: n.name, fullPath, depth: 0, isLeaf: true, isExpanded: false, leafIds: [n.id] })
        else if (!isLeaf) walk(n.children, 0, here)
      } else {
        const isExpanded = locDrawerExpanded.value.has(n.id)
        const leafIds = isLeaf ? [n.id] : collectLocLeafIds(n.children)
        result.push({ id: n.id, name: n.name, fullPath, depth, isLeaf, isExpanded, leafIds })
        if (!isLeaf && isExpanded) walk(n.children, depth + 1, here)
      }
    }
  }
  walk(getStorageTree(wh), 0, [])
  return result
})

function openLocDrawer() {
  locDrawerSearch.value = ''
  locDrawerSel.value = new Set()
  const expanded = new Set<string>()
  const wh = adjustment.value?.warehouseId ?? ''
  const walkExp = (nodes: LocNode[]) => {
    for (const n of nodes) { if (n.children.length) { expanded.add(n.id); walkExp(n.children) } }
  }
  walkExp(getStorageTree(wh))
  locDrawerExpanded.value = expanded
  locDrawerOpen.value = true
}
function toggleLocExpanded(id: string) {
  const s = new Set(locDrawerExpanded.value)
  s.has(id) ? s.delete(id) : s.add(id)
  locDrawerExpanded.value = s
}
function toggleLocDrawerSel(id: string) {
  if (usedLeafIds.value.has(id)) return
  const s = new Set(locDrawerSel.value)
  s.has(id) ? s.delete(id) : s.add(id)
  locDrawerSel.value = s
}
function toggleParentLocSel(leafIds: string[]) {
  const avail = leafIds.filter(id => !usedLeafIds.value.has(id))
  if (!avail.length) return
  const s = new Set(locDrawerSel.value)
  const allSel = avail.every(id => s.has(id))
  avail.forEach(id => allSel ? s.delete(id) : s.add(id))
  locDrawerSel.value = s
}
function confirmLocSelection() {
  const wh = adjustment.value?.warehouseId ?? ''
  const idToPath = new Map<string, string>()
  for (const l of getStorageLeaves(wh)) idToPath.set(l.id, l.path)
  const next = [...addedLocations.value]
  for (const id of locDrawerSel.value) {
    const path = idToPath.get(id)
    if (path && !next.includes(path)) next.push(path)
  }
  addedLocations.value = next
  locDrawerOpen.value = false
}

// ── Operator-added lines per location ─────────────────────────────────────────
// Batch/serial-tracked added products are managed the same way as system
// lines — via batchLinesByKey/serialLinesByKey keyed by the added row's own
// id — so there's only ever one "manage batch/serial" mechanism on this page.
interface AddedLine { id: string; sku: string; productName: string; counted: number | undefined }
let _addedId = 0
const addedByLoc = ref<Record<string, AddedLine[]>>({})

function incrementAddedCounted(location: string, id: string) {
  addedByLoc.value = { ...addedByLoc.value, [location]: (addedByLoc.value[location] ?? []).map(r => r.id === id ? { ...r, counted: (r.counted ?? 0) + 1 } : r) }
}

/** Scanning a SKU that isn't part of this location's count plan — the operator
 *  physically found it in this bin — adds it on the fly instead of rejecting
 *  the scan, the same way "Add product" would, so it flows through the same
 *  batch/serial/plain-qty handling as any planned line right after. */
function addScannedProduct(sku: string, location: string): AddedLine {
  const existing = addedByLoc.value[location]?.find(r => r.sku === sku)
  if (existing) return existing
  const p = PRODUCTS.find(x => x.sku === sku)
  const row: AddedLine = { id: `added-${++_addedId}`, sku, productName: p?.name ?? sku, counted: undefined }
  addedByLoc.value = { ...addedByLoc.value, [location]: [...(addedByLoc.value[location] ?? []), row] }
  toast.notify({ variant: 'success', title: `${p?.name ?? sku} added to ${location === '—' ? 'this count' : location}`, maxWidth: 'max-content' })
  return row
}

// Product picker — one shared drawer, tracks which location triggered it
const pickerOpen = ref(false)
const pickerLocation = ref<string>('')
const pickerAvailableProducts = computed<PickerProduct[]>(() => {
  const existingSkus = new Set(
    (groupedByLocation.value.find(g => g.location === pickerLocation.value)?.items ?? []).map(i => i.sku),
  )
  return PRODUCTS
    .filter(p => !existingSkus.has(p.sku))
    .map(p => ({ sku: p.sku, name: p.name, img: p.img, desc: p.desc }))
})
const pickerCurrentSkus = computed(() => (addedByLoc.value[pickerLocation.value] ?? []).map(r => r.sku))

function openPicker(location: string) {
  pickerLocation.value = location
  pickerOpen.value = true
}
function applyPicker(skus: string[]) {
  const loc = pickerLocation.value
  const existing = new Map((addedByLoc.value[loc] ?? []).map(r => [r.sku, r]))
  const next: AddedLine[] = skus.map(sku => {
    if (existing.has(sku)) return existing.get(sku)!
    const p = PRODUCTS.find(x => x.sku === sku)
    return { id: `added-${++_addedId}`, sku, productName: p?.name ?? sku, counted: undefined }
  })
  addedByLoc.value = { ...addedByLoc.value, [loc]: next }
}
function removeAddedRow(location: string, id: string) {
  addedByLoc.value = { ...addedByLoc.value, [location]: (addedByLoc.value[location] ?? []).filter(r => r.id !== id) }
}
function updateAddedQty(location: string, id: string, e: Event) {
  let n = Math.floor(Number((e.target as HTMLInputElement).value))
  if (!Number.isFinite(n) || n < 0) n = 0
  addedByLoc.value = { ...addedByLoc.value, [location]: (addedByLoc.value[location] ?? []).map(r => r.id === id ? { ...r, counted: n } : r) }
}
function addedCountedFor(row: AddedLine): number {
  if (isBatchTrackedSku(row.sku)) return batchTotalFor(row.id)
  if (isSerialTrackedSku(row.sku)) return serialCount(row.id)
  return row.counted ?? 0
}
const addedCountedTotal = computed(() =>
  Object.values(addedByLoc.value).flat().reduce((s, r) => s + addedCountedFor(r), 0),
)

// ── View mode + search ────────────────────────────────────────────────────────
const viewMode = ref<'location' | 'sku'>('location')
const search = ref('')

// ── Group by location ─────────────────────────────────────────────────────────
const groupedByLocation = computed(() => {
  const q = search.value.trim().toLowerCase()
  const groups = new Map<string, MergedCountRow[]>()
  for (const row of mergedCountRows.value) {
    if (!groups.has(row.storageLocation)) groups.set(row.storageLocation, [])
    groups.get(row.storageLocation)!.push(row)
  }
  for (const loc of addedLocations.value) {
    if (!groups.has(loc)) groups.set(loc, [])
  }
  const all = [...groups.entries()].map(([location, items]) => ({ location, items }))
  if (!q) return all
  return all
    .map(g => ({
      location: g.location,
      items: g.location.toLowerCase().includes(q)
        ? g.items
        : g.items.filter(i => i.sku.toLowerCase().includes(q) || i.product.name.toLowerCase().includes(q)),
    }))
    .filter(g => g.items.length > 0 || addedLocations.value.includes(g.location))
})

// ── Group by SKU (aggregated read-only summary) ───────────────────────────────
const groupedBySku = computed(() => {
  const q = search.value.trim().toLowerCase()
  const map = new Map<string, { sku: string; product: AdjustmentLine['product']; prevOnHand: number; counted: number; difference: number; unit: string; locations: string[] }>()
  for (const item of wmsCountLines.value) {
    const loc = item.storageLocation || '—'
    const counted = draftCounted.value[item.key] ?? 0
    if (map.has(item.sku)) {
      const e = map.get(item.sku)!
      e.prevOnHand += item.prevOnHand
      e.counted += counted
      e.difference = e.counted - e.prevOnHand
      if (!e.locations.includes(loc)) e.locations.push(loc)
    } else {
      map.set(item.sku, { sku: item.sku, product: item.product, prevOnHand: item.prevOnHand, counted, difference: counted - item.prevOnHand, unit: item.unit, locations: [loc] })
    }
  }
  const all = [...map.values()]
  if (!q) return all
  return all.filter(r => r.sku.toLowerCase().includes(q) || r.product.name.toLowerCase().includes(q))
})

// ── Summary stats ──────────────────────────────────────────────────────────────
const skuCount = computed(() => new Set(wmsCountLines.value.map(i => i.sku)).size)
const onHandTotal = computed(() => wmsCountLines.value.reduce((s, i) => s + i.prevOnHand, 0))
const countedTotal = computed(() => mergedCountRows.value.reduce((s, row) => s + countedFor(row), 0) + addedCountedTotal.value)
const differenceTotal = computed(() => countedTotal.value - onHandTotal.value)

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) { return n.toLocaleString('id-ID') }
function diffLabel(n: number) { return n > 0 ? `+${fmt(n)}` : n < 0 ? fmt(n) : '—' }

// ── Build save lines ──────────────────────────────────────────────────────────
function buildLines(): { sku: string; qty: number; location?: string }[] {
  const map = new Map<string, { qty: number; location?: string }>()
  for (const row of mergedCountRows.value) {
    const qty = countedFor(row)
    const e = map.get(row.sku)
    if (e) { e.qty += qty }
    else { map.set(row.sku, { qty, location: row.storageLocation }) }
  }
  for (const [loc, rows] of Object.entries(addedByLoc.value)) {
    for (const r of rows) {
      const qty = addedCountedFor(r)
      if (!r.sku.trim() || !qty) continue
      const e = map.get(r.sku)
      if (e) {
        e.qty += qty
      } else {
        // SKU was not in the count plan: preserve existing on-hand at uncounted
        // locations and add only the newly counted amount on top.
        const existingOnHand = warehouseStockMap.value[r.sku]?.onHand ?? 0
        map.set(r.sku, { qty: existingOnHand + qty, location: loc })
      }
    }
  }
  return [...map.entries()].map(([sku, { qty, location }]) => ({ sku, qty, location }))
}

// ── Footer: Save draft ────────────────────────────────────────────────────────
function saveDraft() {
  saveWmsCountDraft(props.orderId, buildLines())
  toast.notify({ variant: 'success', title: 'Draft saved' , maxWidth: 'max-content'})
  disableUnsavedChangesGuard()
  router.push(`/cycle-counts/${props.orderId}`)
}

// ── Warn before losing unsaved counting progress — refresh/close-tab (native
// prompt) and in-app navigation/Back button (modal rendered once at the app
// root, see [...slug].vue — this app has a single catch-all route, so a
// per-page modal/onBeforeRouteLeave never fires). "Unsaved" = anything
// counted at all. disableUnsavedChangesGuard() is called by
// commitFinish()/saveDraft() right before their own router.push — otherwise
// hasUnsavedChanges() would still read true (nothing else resets the counted
// qty after commit) and the "Leave without saving?" modal would fire right
// after the operator's own intentional Finish/Save action. ──────────────────
const { disableGuard: disableUnsavedChangesGuard } = useUnsavedChangesGuard({
  hasUnsavedChanges: () => countedTotal.value > 0,
  saveDraft: () => {
    saveWmsCountDraft(props.orderId, buildLines())
    toast.notify({ variant: 'success', title: 'Draft saved', maxWidth: 'max-content' })
  },
})

// ── Footer: Finish counting ───────────────────────────────────────────────────
const showConfirm = ref(false)
const showQtyErrors = ref(false)

function clickFinish() {
  if (countedTotal.value === 0) {
    showQtyErrors.value = true
    toast.notify({ variant: 'error', title: 'You must fill in counted qty for at least one item' , maxWidth: 'max-content'})
    return
  }
  showConfirm.value = true
}

function commitFinish() {
  showConfirm.value = false
  const lines = buildLines()
  // Status becomes 'counted' (Awaiting approval) — the linked ERP Stock counts
  // row is only mirrored once a manager approves it (see approveWmsAdjustment).
  finishWmsCount(props.orderId, lines)
  toast.notify({ variant: 'success', title: 'Cycle count submitted for approval', maxWidth: 'max-content' })
  // Already committed — the router.push below is this function's own doing,
  // not the operator losing unsaved work, so the guard mustn't fire on it.
  disableUnsavedChangesGuard()
  router.push('/cycle-counts')
}

// ── Navigation ────────────────────────────────────────────────────────────────
function goBack() { router.push(`/cycle-counts/${props.orderId}`) }
function goList() { router.push('/cycle-counts') }

// ── Footer overflow ───────────────────────────────────────────────────────────
const stageEl = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)
function checkOverflow() {
  if (stageEl.value) stageOverflowing.value = stageEl.value.scrollHeight > stageEl.value.clientHeight + 1
}
let stageObserver: ResizeObserver | null = null
onMounted(() => {
  nextTick(() => {
    checkOverflow()
    stageObserver = new ResizeObserver(checkOverflow)
    if (stageEl.value) {
      stageObserver.observe(stageEl.value)
      stageEl.value.addEventListener('scroll', checkOverflow, { passive: true })
    }
  })
})
onUnmounted(() => {
  stageObserver?.disconnect()
  stageEl.value?.removeEventListener('scroll', checkOverflow)
})
</script>

<template>
  <div v-if="adjustment" class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb" @click="goList">Cycle counts</button>
          <span class="detail-breadcrumb-sep">/</span>
          <button class="detail-breadcrumb" @click="goBack">{{ adjustment.number }}</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">Stock counting</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">

      <!-- Task header -->
      <div class="sc-header">
        <ContentList label="Transaction no." :value="adjustment.number" />
        <ContentList label="Warehouse" :value="adjustment.warehouseName" />
        <ContentList label="Assignee" :value="adjustment.assignee || '—'" />
        <ContentList v-if="adjustment.startDate" label="Start date" :value="formatDateTimeLong(adjustment.startDate)" />
        <ContentList v-if="adjustment.startDate" label="End date" :value="adjustment.status === 'completed' && adjustment.endDate ? formatDateTimeLong(adjustment.endDate) : '—'" />
      </div>

      <!-- Search bar -->
      <div class="sc-filter-bar">
        <div class="sc-search-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.5"/>
            <path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input v-model="search" class="sc-search" type="text" placeholder="Search..." />
          <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Scan bar -->
      <div class="sc-scanbar-row">
      <ScanBar placeholder="Scan barcode..." @scan="handleScan">
        <div v-if="activeBin" class="sc-active-bin">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 13L9 17L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span>{{ activeBin }}</span>
          <button class="sc-active-bin-clear" type="button" aria-label="Clear active bin" @click="activeBin = null">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
            </svg>
          </button>
        </div>
        <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" type="button" @click="resetCount">Reset count</button>
      </ScanBar>
      </div>

      <!-- By location: accordion -->
      <div v-if="!groupedByLocation.length" class="sc-empty">
        <p>No items match your search.</p>
      </div>
      <MpAccordion v-else is-allow-multiple is-allow-toggle class="sc-accordions">
          <MpAccordionItem
            v-for="group in groupedByLocation"
            :key="group.location"
            :id="`sco-acc-${group.location}`"
            is-default-open
            icon-position="start"
          >
            <MpAccordionHeader>
              <MpAccordionIcon />
              <span class="sc-acc-label">{{ group.location === '—' ? 'No location assigned' : group.location }}</span>
              <span class="sc-acc-meta">{{ group.items.length }} SKU{{ group.items.length !== 1 ? 's' : '' }}</span>
            </MpAccordionHeader>
            <MpAccordionPanel>
              <div class="sc-acc-body">
                <div class="sc-loc-scroll">
                  <table class="sc-items sc-items--fixed">
                    <colgroup>
                      <col class="sc-col-product" />
                      <col class="sc-col-sku" />
                      <col class="sc-col-num" />
                      <col class="sc-col-unit" />
                      <col class="sc-col-manage" />
                      <col class="sc-col-del" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th class="sc-th">Product</th>
                        <th class="sc-th">SKU</th>
                        <th class="sc-th sc-th--num">Counted qty</th>
                        <th class="sc-th">Unit</th>
                        <th class="sc-th" />
                        <th class="sc-th" />
                      </tr>
                    </thead>
                    <tbody>
                      <!-- System lines from count plan -->
                      <tr
                        v-for="item in group.items"
                        :key="item.key"
                        class="sc-row"
                        :class="{ 'sc-row--flash': flashRowKey === item.key }"
                      >
                        <td class="sc-td sc-td--product"><ProductCell :name="item.product.name" :desc="item.product.desc" :image="item.product.img" /></td>
                        <td class="sc-td">{{ item.sku }}</td>

                        <!-- Batch-tracked → read-only total, managed via the icon button -->
                        <td v-if="isBatchTrackedSku(item.sku)" class="sc-td sc-td--num">
                          <span v-if="batchTotalFor(item.key)" class="sc-managed-total">{{ fmt(batchTotalFor(item.key)) }}</span>
                          <span v-else class="sc-managed-empty">—</span>
                        </td>

                        <!-- Serial-tracked → read-only total, managed via the icon button -->
                        <td v-else-if="isSerialTrackedSku(item.sku)" class="sc-td sc-td--num">
                          <span v-if="serialCount(item.key)" class="sc-managed-total">{{ fmt(serialCount(item.key)) }}</span>
                          <span v-else class="sc-managed-empty">—</span>
                        </td>

                        <!-- Untracked → manual input, locked until scanned once -->
                        <td
                          v-else
                          class="sc-td sc-td--input"
                          :class="{ 'sc-td--error': showQtyErrors && !(draftCounted[item.key] ?? 0) }"
                        >
                          <MpTooltip
                            v-if="!scannedKeys.has(item.key)"
                            :id="`sc-scan-lock-${item.key}`"
                            label="Scan this product's barcode before entering a qty manually"
                            placement="top"
                            use-portal
                          >
                            <input
                              class="sc-qty-input"
                              type="number" min="0"
                              :value="draftCounted[item.key] ?? ''"
                              :aria-label="`Counted qty for ${item.product.name}`"
                              disabled
                            />
                          </MpTooltip>
                          <input
                            v-else
                            class="sc-qty-input"
                            type="number" min="0"
                            :value="draftCounted[item.key] ?? ''"
                            :aria-label="`Counted qty for ${item.product.name}`"
                            @input="onCountedInput(item.key, $event); showQtyErrors = false"
                          />
                        </td>

                        <td class="sc-td">{{ item.unit }}</td>

                        <!-- Manage action column — icon button, batch/serial-tracked only -->
                        <td v-if="isBatchTrackedSku(item.sku)" class="sc-td sc-td--action">
                          <MpTooltip :id="`sc-tt-batch-${item.key}`" label="Manage batch" placement="top" use-portal>
                            <button class="sc-view-btn" type="button" aria-label="Manage batch" @click="openBatchDrawer(item.key)">
                              <MpIcon name="competencies" size="md" />
                            </button>
                          </MpTooltip>
                        </td>
                        <td v-else-if="isSerialTrackedSku(item.sku)" class="sc-td sc-td--action">
                          <MpTooltip :id="`sc-tt-serial-${item.key}`" label="Manage serial numbers" placement="top" use-portal>
                            <button class="sc-view-btn" type="button" aria-label="Manage serial numbers" @click="openSerialDrawer(item.key)">
                              <MpIcon name="competencies" size="md" />
                            </button>
                          </MpTooltip>
                        </td>
                        <td v-else class="sc-td sc-td--action" />

                        <td class="sc-td sc-td--del-placeholder" aria-hidden="true" />
                      </tr>

                      <!-- Operator-added lines (from product picker) -->
                      <tr
                        v-for="added in (addedByLoc[group.location] ?? [])"
                        :key="added.id"
                        class="sc-row"
                        :class="{ 'sc-row--flash': flashRowKey === added.id }"
                      >
                        <td class="sc-td sc-td--product">
                          <ProductCell :name="added.productName" :desc="PRODUCTS.find(p => p.sku === added.sku)?.desc ?? ''" :image="PRODUCTS.find(p => p.sku === added.sku)?.img ?? ''" />
                        </td>
                        <td class="sc-td">{{ added.sku }}</td>

                        <td v-if="isBatchTrackedSku(added.sku)" class="sc-td sc-td--num">
                          <span v-if="batchTotalFor(added.id)" class="sc-managed-total">{{ fmt(batchTotalFor(added.id)) }}</span>
                          <span v-else class="sc-managed-empty">—</span>
                        </td>
                        <td v-else-if="isSerialTrackedSku(added.sku)" class="sc-td sc-td--num">
                          <span v-if="serialCount(added.id)" class="sc-managed-total">{{ fmt(serialCount(added.id)) }}</span>
                          <span v-else class="sc-managed-empty">—</span>
                        </td>
                        <td v-else class="sc-td sc-td--input">
                          <MpTooltip
                            v-if="!scannedKeys.has(added.id)"
                            :id="`sc-scan-lock-${added.id}`"
                            label="Scan this product's barcode before entering a qty manually"
                            placement="top"
                            use-portal
                          >
                            <input
                              class="sc-qty-input"
                              type="number" min="0"
                              :value="added.counted ?? ''"
                              aria-label="Counted qty for added product"
                              disabled
                            />
                          </MpTooltip>
                          <input
                            v-else
                            class="sc-qty-input"
                            type="number" min="0"
                            :value="added.counted ?? ''"
                            aria-label="Counted qty for added product"
                            @input="updateAddedQty(group.location, added.id, $event)"
                          />
                        </td>
                        <td class="sc-td">{{ PRODUCTS.find(p => p.sku === added.sku)?.unit ?? '—' }}</td>

                        <!-- Manage action column — icon button, batch/serial-tracked only -->
                        <td v-if="isBatchTrackedSku(added.sku)" class="sc-td sc-td--action">
                          <MpTooltip :id="`sc-tt-batch-${added.id}`" label="Manage batch" placement="top" use-portal>
                            <button class="sc-view-btn" type="button" aria-label="Manage batch" @click="openBatchDrawer(added.id)">
                              <MpIcon name="competencies" size="md" />
                            </button>
                          </MpTooltip>
                        </td>
                        <td v-else-if="isSerialTrackedSku(added.sku)" class="sc-td sc-td--action">
                          <MpTooltip :id="`sc-tt-serial-${added.id}`" label="Manage serial numbers" placement="top" use-portal>
                            <button class="sc-view-btn" type="button" aria-label="Manage serial numbers" @click="openSerialDrawer(added.id)">
                              <MpIcon name="competencies" size="md" />
                            </button>
                          </MpTooltip>
                        </td>
                        <td v-else class="sc-td sc-td--action" />

                        <td class="sc-td sc-td--del">
                          <button class="sc-del-row-btn" type="button" aria-label="Remove product" @click="removeAddedRow(group.location, added.id)">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                              <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
                              <path d="M5 8H11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                            </svg>
                          </button>
                        </td>
                      </tr>

                      <!-- Add product trigger row -->
                      <tr class="sc-row-add-trigger">
                        <td colspan="6" class="sc-td-add-trigger">
                          <button class="sc-add-sku-btn" type="button" @click="openPicker(group.location)">
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                              <path d="M7 2V12M2 7H12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                            </svg>
                            Add product
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </MpAccordionPanel>
          </MpAccordionItem>
        </MpAccordion>

      <!-- Add location button -->
      <div class="sc-add-loc-row">
        <button class="sc-add-loc-btn" type="button" @click="openLocDrawer">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M7 2V12M2 7H12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          Add location
        </button>
      </div>

    </div>

    <!-- ── Footer ── -->
    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <button class="sc-btn sc-btn--ghost" @click="goBack">Cancel</button>
      <button class="sc-btn sc-btn--secondary" @click="saveDraft">Save draft</button>
      <button class="sc-btn sc-btn--primary" @click="clickFinish">Finish counting</button>
    </footer>

  </div>

  <!-- Not found -->
  <div v-else class="sc-not-found">
    <p>Stock count not found.</p>
    <button class="detail-breadcrumb" @click="goList">Back to Cycle counts</button>
  </div>

  <!-- ── Finish counting confirmation ── -->
  <MpModal
    id="sco-confirm"
    :is-open="showConfirm"
    size="md"
    is-close-on-esc
    :is-keep-alive="false"
    @close="showConfirm = false"
  >
    <MpModalContent>
      <MpModalHeader>Finish counting?<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <p class="sc-confirm-text">
          Counted <strong>{{ fmt(countedTotal) }}</strong> units across <strong>{{ fmt(skuCount) }}</strong> SKUs. This will send the count for manager approval before stock on hand is updated.
        </p>
      </MpModalBody>
      <MpModalFooter>
        <div class="sc-modal-footer">
          <button class="sc-btn sc-btn--ghost" @click="showConfirm = false">Cancel</button>
          <button class="sc-btn sc-btn--primary" @click="commitFinish">Finish counting</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>


  <!-- ── Product picker drawer ── -->
  <SelectProductDrawer
    v-model:open="pickerOpen"
    :products="pickerAvailableProducts"
    :model-value="pickerCurrentSkus"
    @save="applyPicker"
  />

  <!-- ── Add location drawer ── -->
  <Transition name="sc-loc-drw">
    <div v-if="locDrawerOpen" class="loc-drw-overlay" @click.self="locDrawerOpen = false">
      <div class="loc-drw-panel" role="dialog" aria-label="Add location">
        <div class="loc-drw-header">
          <span class="loc-drw-title">Add location</span>
          <button class="loc-drw-close" type="button" @click="locDrawerOpen = false">
            <MpIcon name="close" size="sm" />
          </button>
        </div>
        <div class="loc-drw-search-wrap">
          <input v-model="locDrawerSearch" class="loc-drw-search-input" type="text" placeholder="Search location..." />
          <button v-if="locDrawerSearch" class="search-clear-btn search-clear-btn--overlay" type="button" aria-label="Clear search" @click="locDrawerSearch = ''">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div class="loc-drw-list">
          <template v-for="node in locDrawerItems" :key="node.id">
            <!-- Parent node -->
            <div
              v-if="!node.isLeaf"
              class="loc-drw-item loc-drw-item--parent"
              :style="{ paddingLeft: `${16 + node.depth * 20}px` }"
            >
              <span
                class="loc-drw-chevron"
                :class="{ 'loc-drw-chevron--open': node.isExpanded }"
                @click="toggleLocExpanded(node.id)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
              <MpCheckbox
                :is-checked="node.leafIds.filter(id => !usedLeafIds.has(id)).length > 0 && node.leafIds.filter(id => !usedLeafIds.has(id)).every(id => locDrawerSel.has(id))"
                :is-indeterminate="node.leafIds.filter(id => !usedLeafIds.has(id)).some(id => locDrawerSel.has(id)) && !node.leafIds.filter(id => !usedLeafIds.has(id)).every(id => locDrawerSel.has(id))"
                :is-disabled="node.leafIds.every(id => usedLeafIds.has(id))"
                @change="toggleParentLocSel(node.leafIds)"
                @click.stop
              />
              <span class="loc-drw-name loc-drw-name--parent" @click="toggleLocExpanded(node.id)">{{ node.name }}</span>
            </div>
            <!-- Leaf node -->
            <div
              v-else
              class="loc-drw-item loc-drw-item--leaf"
              :class="{ 'loc-drw-item--used': usedLeafIds.has(node.id) }"
              :style="{ paddingLeft: `${16 + node.depth * 20 + 40}px` }"
            >
              <MpCheckbox
                :is-checked="usedLeafIds.has(node.id) || locDrawerSel.has(node.id)"
                :is-disabled="usedLeafIds.has(node.id)"
                @change="toggleLocDrawerSel(node.id)"
              />
              <span
                class="loc-drw-name"
                :class="{ 'loc-drw-name--used': usedLeafIds.has(node.id) }"
                @click="toggleLocDrawerSel(node.id)"
              >
                {{ locDrawerSearch.trim() ? node.fullPath : node.name }}
              </span>
            </div>
          </template>
          <div v-if="!locDrawerItems.length" class="loc-drw-empty">No storage locations found</div>
        </div>
        <div class="loc-drw-footer">
          <button class="sc-btn sc-btn--ghost" type="button" @click="locDrawerOpen = false">Cancel</button>
          <button class="sc-btn sc-btn--primary" type="button" :disabled="!locDrawerSel.size" @click="confirmLocSelection">
            Add{{ locDrawerSel.size ? ` (${locDrawerSel.size})` : '' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>

  <!-- ── Serial drawer ── -->
  <ManageSerialDrawer
    v-if="serialDrawerKey && adjustment"
    :open="serialDrawerOpen"
    :sku="activeSerialSku"
    :warehouse-id="adjustment.warehouseId"
    kind="count"
    :target-count="activeSerialOnHand"
    :location-on-hand="activeSerialOnHand"
    :model-value="(serialLinesByKey[serialDrawerKey] ?? []).map(s => ({ serial: s }))"
    :initial-scan="serialDrawerInitialScan"
    @update:open="serialDrawerOpen = $event"
    @save="saveSerialLines"
  />

  <!-- ── Batch drawer ── -->
  <ManageBatchDrawer
    v-if="batchDrawerKey && adjustment"
    :open="batchDrawerOpen"
    :sku="activeBatchSku"
    :warehouse-id="adjustment.warehouseId"
    kind="count"
    :location-on-hand="activeBatchLocationOnHand"
    :model-value="batchLinesByKey[batchDrawerKey] ?? []"
    :initial-scan="batchDrawerInitialScan"
    @update:open="batchDrawerOpen = $event"
    @save="saveBatchLines"
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
.detail-breadcrumb-sep { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
}
.detail-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage); border-top: 1px solid transparent;
}
.detail-footer--floating { border-top-color: var(--mp-border-default); }

/* ── Task header ─────────────────────────────────────────────────────────────── */
.sc-header {
  display: flex; flex-wrap: wrap; gap: var(--mp-spacing-6);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  border-bottom: 1px solid var(--mp-border-default);
}
.sc-header :deep(.content-list) { flex: 0 0 318px; width: 318px; }
.sc-header :deep(.content-list__value) { white-space: normal; overflow-wrap: break-word; word-break: break-word; }

/* ── Summary stats ───────────────────────────────────────────────────────────── */
.sc-summary {
  display: flex; gap: var(--mp-spacing-6);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  border-bottom: 1px solid var(--mp-border-default);
}
.sc-stat { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.sc-stat-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm); }
.sc-stat-val { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-lg); font-variant-numeric: tabular-nums; }
.sc-stat-val--pos { color: var(--mp-text-success, #1a7a4a); }
.sc-stat-val--neg { color: var(--mp-text-danger, #a8352d); }

/* ── Filter bar ──────────────────────────────────────────────────────────────── */
.sc-filter-bar {
  display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-3) var(--mp-spacing-6);
}
.sc-filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.sc-view-toggle { display: flex; border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px); overflow: hidden; }
.sc-view-btn {
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  background: none; border: none; cursor: pointer; color: var(--mp-text-secondary);
}
.sc-view-btn--active { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }
.sc-view-btn:hover:not(.sc-view-btn--active) { background: var(--mp-background-neutral-subtle); }
.sc-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.sc-search-wrap {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary); min-width: 260px;
}
.sc-search {
  flex: 1; border: none; background: transparent; outline: none;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.sc-search::placeholder { color: var(--mp-text-placeholder); }

/* ── Accordions ──────────────────────────────────────────────────────────────── */
.sc-accordions { padding: var(--mp-spacing-4) var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.sc-accordions :deep(*:not(td):not(th)) { border-top: none !important; border-bottom: none !important; }
.sc-acc-label { flex: 1; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sc-acc-meta { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); white-space: nowrap; }
.sc-acc-body { padding: var(--mp-spacing-4) var(--mp-spacing-4) var(--mp-spacing-4) 0; }

/* ── Table ───────────────────────────────────────────────────────────────────── */
.sc-loc-scroll { overflow-x: auto; }
/* Right divider on each cell, edges trimmed. */
.sc-loc-scroll .sc-td { border-left: 1px solid var(--mp-border-default); border-right: 1px solid var(--mp-border-default); }
.sc-loc-scroll .sc-td:first-child { border-left: none; }
.sc-loc-scroll .sc-td:last-child { border-right: none; }

.sc-items { width: 100%; border-collapse: collapse; }
.sc-items--fixed { table-layout: fixed; width: 100%; }

.sc-col-product { width: 240px; }
.sc-col-sku     { width: 100px; }
.sc-col-num     { width: 140px; }
.sc-col-unit    { width: 90px; }
.sc-col-manage  { width: 56px; }
.sc-col-del     { width: 40px; }

.sc-th {
  height: var(--mp-sizes-7, 28px);
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-align: left; text-transform: uppercase; white-space: nowrap;
  border-bottom: 1px solid var(--mp-border-default);
}
.sc-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }

.sc-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  background: var(--mp-background-neutral-subtle);
  vertical-align: top;
}
.sc-td--product { background: var(--mp-background-neutral-subtle); }
.sc-td--num { text-align: right; font-variant-numeric: tabular-nums; background: var(--mp-background-neutral-subtle); }

/* Input cells — white bg, no own border, inset focus shadow */
.sc-td--input {
  padding: 0;
  background: var(--mp-background-neutral, #fff);
}
.sc-td--input:focus-within {
  box-shadow: inset 0 0 0 1px var(--mp-border-bold);
}
.sc-td--input.sc-td--error { box-shadow: inset 0 0 0 1px var(--mp-border-danger, #a8352d); }
.sc-td--input:has(input:disabled) { background: var(--mp-background-neutral-subtle); }
.sc-qty-input:disabled { color: var(--mp-text-placeholder); cursor: not-allowed; }

/* Batch/serial-tracked → read-only total; managed via the icon-button column */
.sc-managed-total { font-size: var(--mp-font-sizes-md); font-variant-numeric: tabular-nums; color: var(--mp-text-default); }
.sc-managed-empty { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* Manage action column */
.sc-td--action { text-align: center; white-space: nowrap; background: var(--mp-background-neutral, #fff); }
.sc-view-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border-radius: var(--mp-radii-md); background: none; border: none;
  cursor: pointer; color: var(--mp-icon-default);
}
.sc-view-btn:hover { background: var(--mp-background-neutral-hovered); }

.sc-scanbar-row { padding: 0 var(--mp-spacing-6) var(--mp-spacing-4); }
.sc-scanbar-row .scan-bar { margin-bottom: 0; }

/* Active bin chip + row flash on scan */
.sc-active-bin {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1\.5);
  padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-2\.5);
  background: #e6f7ef; border: 1px solid #029861;
  border-radius: var(--mp-radii-full); white-space: nowrap;
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: #027a4e; flex-shrink: 0;
}
.sc-active-bin-clear {
  background: none; border: none; padding: 0; cursor: pointer;
  color: inherit; display: flex; align-items: center; opacity: 0.7; line-height: 1;
}
.sc-active-bin-clear:hover { opacity: 1; }
@keyframes sc-flash {
  0%   { background-color: var(--mp-background-success-subtle, #dcfce7); }
  100% { background-color: transparent; }
}
.sc-row--flash td { animation: sc-flash 0.7s ease-out forwards; }

.sc-qty-input {
  width: 100%; min-width: 0; height: 100%; padding: var(--mp-spacing-2) var(--mp-spacing-2);
  border: none; background: transparent; outline: none;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); text-align: right;
  font-variant-numeric: tabular-nums;
}
.sc-qty-input::-webkit-outer-spin-button,
.sc-qty-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.sc-qty-input[type=number] { -moz-appearance: textfield; }

.sc-diff--pos { color: var(--mp-text-success, #1a7a4a); }
.sc-diff--neg { color: var(--mp-text-danger, #a8352d); }

/* Delete button on added rows */
.sc-td--del-placeholder { background: var(--mp-background-neutral-subtle); }
.sc-td--del { padding: 0; text-align: center; vertical-align: middle; background: var(--mp-background-neutral-subtle); }
.sc-del-row-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border: none; background: none; border-radius: var(--mp-radii-sm);
  cursor: pointer; color: var(--mp-text-secondary);
}
.sc-del-row-btn:hover { background: var(--mp-background-neutral-hovered); }

/* Add product trigger row */
.sc-row-add-trigger td { border-bottom: none; }
.sc-td-add-trigger { padding: var(--mp-spacing-1) var(--mp-spacing-2); background: var(--mp-background-neutral, #fff); }
.sc-add-sku-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1\.5);
  background: none; border: none; padding: var(--mp-spacing-1) var(--mp-spacing-2);
  border-radius: var(--mp-radii-sm); cursor: pointer;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-link);
}
.sc-add-sku-btn:hover { text-decoration: underline; text-underline-offset: 2px; }

/* Add location button */
.sc-add-loc-row { padding: 0 var(--mp-spacing-6) var(--mp-spacing-4); }
.sc-add-loc-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1\.5);
  background: none; border: none; padding: var(--mp-spacing-1) var(--mp-spacing-2);
  border-radius: var(--mp-radii-sm); cursor: pointer;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-link);
}
.sc-add-loc-btn:hover { text-decoration: underline; text-underline-offset: 2px; }

/* Location drawer */
.loc-drw-overlay { position: fixed; inset: 0; z-index: 1300; background: rgba(8, 13, 14, 0.45); display: flex; justify-content: flex-end; }
.loc-drw-panel { margin: var(--mp-spacing-3); width: min(480px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 24px; overflow: hidden; }
.loc-drw-header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); background: var(--mp-background-neutral-subtle); }
.loc-drw-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.loc-drw-close { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.loc-drw-close:hover { background: var(--mp-background-neutral-hovered); }
.loc-drw-search-wrap { padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); position: relative; }
.loc-drw-search-input { width: 100%; height: 36px; border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full); background: var(--mp-background-neutral); padding: 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; box-sizing: border-box; padding-right: 34px; }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }
.search-clear-btn--overlay { position: absolute; right: 18px; top: 50%; transform: translateY(-50%); }
.loc-drw-list { flex: 1; overflow-y: auto; }
.loc-drw-footer { flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.loc-drw-item { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: 8px 16px; border-bottom: 1px solid var(--mp-border-default); }
.loc-drw-item:last-child { border-bottom: none; }
.loc-drw-item--parent { cursor: pointer; min-height: 36px; }
.loc-drw-item--parent:hover { background: var(--mp-background-neutral-subtle); }
.loc-drw-item--leaf { cursor: pointer; min-height: 40px; }
.loc-drw-item--leaf:hover:not(.loc-drw-item--used) { background: var(--mp-background-neutral-subtle); }
.loc-drw-item--used { cursor: default; opacity: 0.55; }
.loc-drw-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: 1.4; }
.loc-drw-name--parent { font-weight: var(--mp-font-weights-semi-bold); }
.loc-drw-chevron { display: inline-flex; align-items: center; justify-content: center; width: 20px; flex-shrink: 0; color: var(--mp-icon-subtle); transition: transform 150ms ease; }
.loc-drw-chevron--open { transform: rotate(90deg); }
.loc-drw-empty { padding: var(--mp-spacing-8); text-align: center; color: var(--mp-text-subtle); font-size: var(--mp-font-sizes-md); }

/* Drawer enter/leave transition */
.sc-loc-drw-enter-active,
.sc-loc-drw-leave-active { transition: background-color 250ms ease; }
.sc-loc-drw-enter-from,
.sc-loc-drw-leave-to { background-color: transparent; }
.sc-loc-drw-enter-active .loc-drw-panel { transition: transform 350ms ease-out; }
.sc-loc-drw-leave-active .loc-drw-panel { transition: transform 250ms ease-in; }
.sc-loc-drw-enter-from .loc-drw-panel,
.sc-loc-drw-leave-to .loc-drw-panel { transform: translateX(calc(100% + 12px)); }

/* By SKU section */
.sc-sku-section { padding: var(--mp-spacing-4) var(--mp-spacing-6); }
.sc-loc-tags { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-1); }
.sc-loc-tag {
  padding: 2px var(--mp-spacing-2); background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-sm);
  font-size: var(--mp-font-sizes-xs); color: var(--mp-text-secondary); white-space: nowrap;
}
.sc-items-count { margin-top: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* Empty + not found */
.sc-empty { padding: var(--mp-spacing-8) var(--mp-spacing-6); text-align: center; color: var(--mp-text-secondary); }
.sc-not-found { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-4); height: 100%; color: var(--mp-text-secondary); }

/* ── Buttons ─────────────────────────────────────────────────────────────────── */
.sc-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer; border: 1px solid transparent; white-space: nowrap;
}
.sc-btn--ghost { background: transparent; border-color: transparent; color: var(--mp-text-default); font-weight: var(--mp-font-weights-regular); }
.sc-btn--ghost:hover { background: var(--mp-background-neutral-hovered); }
.sc-btn--secondary { background: var(--mp-background-neutral); border-color: var(--mp-border-bold); color: var(--mp-text-default); }
.sc-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }
.sc-btn--primary { background: var(--mp-background-brand-bold, #029861); border-color: transparent; color: var(--mp-text-on-color, #fff); }
.sc-btn--primary:hover { background: var(--mp-background-brand-bold-hovered, #027a4e); }

/* Confirm modal */
.sc-confirm-text { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-lg); }
.sc-modal-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); width: 100%; }
</style>
