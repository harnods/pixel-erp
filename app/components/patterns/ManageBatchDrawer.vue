<script setup lang="ts">
import { ref, computed, watch, reactive, nextTick } from 'vue'
import ScanBar from '~/components/patterns/ScanBar.vue'
import {
  MpIcon,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpDatePicker, css,
} from '@mekari/pixel3'
import { productBySku } from '~/data/inventory'
import { getWarehouseDetail } from '~/data/warehouseDetails'

// ── Public interface ─────────────────────────────────────────────────────────────
export interface BatchLocEntry { locationId: string; qty: number }

export interface CommittedBatch {
  key: string
  batchNo: string
  expiryDate: string  // ISO
  desc: string
  onHand: number
  counted: number | null  // null = uncounted
  unit: string
  /** Fixed bin this batch currently sits in — used for picking's read-only Location column. */
  location?: string
  originLocations?: BatchLocEntry[]
  destLocations?: BatchLocEntry[]
}

const props = defineProps<{
  open: boolean
  sku: string
  warehouseId: string
  modelValue: CommittedBatch[]
  /** 'count' (default) = stock count; 'in-out' = stock in/out; 'transfer' = warehouse transfer; 'receiving' = PO receiving; 'put-away' = assign received batches to bins; 'picking' = pick from existing batches for an outbound order */
  kind?: 'count' | 'in-out' | 'transfer' | 'receiving' | 'put-away' | 'picking'
  /**
   * When counting inside a storage location, pass the bin-level on-hand.
   * 0 means the SKU has no stock at this bin → start empty instead of
   * pre-seeding from the warehouse-wide batch list.
   */
  locationOnHand?: number
  /** Bins available in the origin warehouse (filtered to where SKU has stock) */
  originLocationPaths?: string[]
  /** All bins available in the destination warehouse */
  destLocationPaths?: string[]
  /** Picking only: the line's to-pick qty — total picked across batches must not exceed this. */
  targetCount?: number
}>()

const emit = defineEmits<{
  'update:open': [boolean]
  'save': [batches: CommittedBatch[]]
}>()

// ── Working rows ─────────────────────────────────────────────────────────────────
interface LocRow { id: number; locationId: string; qty: string }

interface WorkRow extends CommittedBatch {
  isNew: boolean
  expiryDisplay: string  // DD/MM/YYYY for the date picker
  originLocRows: LocRow[]
  destLocRows: LocRow[]
}

let locSeq = 0
function makeLocRow(): LocRow { return { id: locSeq++, locationId: '', qty: '' } }

function initLocRows(locs: BatchLocEntry[] | undefined): LocRow[] {
  if (locs?.length) return [...locs.map(l => ({ id: locSeq++, locationId: l.locationId, qty: String(l.qty) })), makeLocRow()]
  return [makeLocRow()]
}

const DEMO_DESCS = [
  'Ethiopia Yirgacheffe, Grade 1, washed – harvest 2025',
  'Colombia Huila, natural process, lot #COL-25A',
  'Medium roast, 3-day degassing – roasted Jun 2025',
  'Single origin, certified organic, lot #B12',
]

function isoToDisplay(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function displayToIso(display: string): string {
  if (!display) return ''
  const [d, m, y] = display.split('/')
  return `${y}-${m}-${d}`
}

const rows = ref<WorkRow[]>([])

// seed rows from modelValue or warehouse batches when drawer opens.
// { immediate: true } is required because the component mounts with open=true
// (parent uses v-if="batchDrawerRow"), so a lazy watch never fires on first open.
watch(() => props.open, (isOpen) => {
  if (!isOpen) return

  if (props.modelValue.length > 0) {
    rows.value = props.modelValue.map(b => ({
      ...b,
      isNew: false,
      expiryDisplay: isoToDisplay(b.expiryDate),
      originLocRows: initLocRows(b.originLocations),
      destLocRows: initLocRows(b.destLocations),
    }))
    return
  }

  // in-out / transfer / receiving / picking: start empty — user manually picks which
  // batches to affect (put-away always arrives with a non-empty modelValue — the
  // batches recorded at receiving — but falls back to empty here too if missing.)
  if (props.kind === 'in-out' || props.kind === 'transfer' || props.kind === 'receiving' || props.kind === 'put-away' || props.kind === 'picking') {
    rows.value = []
    return
  }

  // count mode with zero bin on-hand: SKU not in this bin → start empty
  if (props.locationOnHand === 0) {
    rows.value = []
    return
  }

  // count mode: seed all warehouse batches (all uncounted by default)
  const wh = getWarehouseDetail(props.warehouseId)
  const si = wh?.stock.find(s => s.sku === props.sku)
  const batches = si?.batches ?? []
  const unit = si?.unit ?? productBySku(props.sku)?.unit ?? ''

  rows.value = batches.map((b, i) => ({
    key: b.batchNo,
    batchNo: b.batchNo,
    expiryDate: b.expiryDate,
    expiryDisplay: isoToDisplay(b.expiryDate),
    desc: DEMO_DESCS[i % DEMO_DESCS.length]!,
    onHand: b.onHand,
    counted: null,
    unit,
    location: b.location,
    isNew: false,
    originLocRows: [makeLocRow()],
    destLocRows: [makeLocRow()],
  }))
}, { immediate: true })

// ── Product info ─────────────────────────────────────────────────────────────────
const product = computed(() => productBySku(props.sku))
const warehouseStock = computed(() => {
  const wh = getWarehouseDetail(props.warehouseId)
  return wh?.stock.find(s => s.sku === props.sku)
})
const productImg = computed(() => product.value?.img ?? '')
const productName = computed(() => warehouseStock.value?.name ?? product.value?.name ?? props.sku)

const isInOut = computed(() =>
  props.kind === 'in-out' || props.kind === 'transfer' || props.kind === 'receiving' || props.kind === 'put-away' || props.kind === 'picking',
)
const isTransfer = computed(() => props.kind === 'transfer')
const isReceiving = computed(() => props.kind === 'receiving')
const isPutAway = computed(() => props.kind === 'put-away')
const isPicking = computed(() => props.kind === 'picking')
// receiving/put-away have no meaningful on-hand/new-on-hand concept — hide those stats/columns.
const hideStockStats = computed(() => isReceiving.value || isPutAway.value)
// Picking shows Available qty (like transfer) but has no "new on hand" concept —
// stock only actually leaves once the pick is fulfilled, not at drawer-save time.
const showAfterStats = computed(() => !hideStockStats.value && !isPicking.value)
const qtyLabel = computed(() => {
  if (props.kind === 'transfer') return 'Transfer qty'
  if (props.kind === 'receiving' || props.kind === 'put-away') return 'Received qty'
  if (props.kind === 'picking') return 'Picked qty'
  return 'Stock in/out qty'
})
const onHandLabel = computed(() => (isTransfer.value || isPicking.value) ? 'Available qty' : 'On hand qty')
const afterLabel = computed(() => isTransfer.value ? 'After transfer qty' : (isInOut.value ? 'New on hand qty' : 'Difference'))

const totalOnHand = computed(() => rows.value.reduce((s, r) => s + r.onHand, 0))
const totalCounted = computed(() => {
  const counted = rows.value.filter(r => r.counted !== null)
  if (!counted.length) return null
  return counted.reduce((s, r) => s + (r.counted ?? 0), 0)
})
const totalPutAwayQty = computed(() =>
  rows.value.reduce((s, r) =>
    s + r.destLocRows.reduce((rs, d) => rs + (d.locationId ? (Number(d.qty) || 0) : 0), 0), 0)
)
const totalDifference = computed(() => {
  if (totalCounted.value === null) return null
  return totalCounted.value - totalOnHand.value
})
const totalNewOnHand = computed(() => {
  if (totalCounted.value === null) return null
  return isTransfer.value
    ? totalOnHand.value - totalCounted.value
    : totalOnHand.value + totalCounted.value
})

function newOnHandOf(row: WorkRow): number | null {
  if (row.counted === null) return null
  return isTransfer.value ? row.onHand - row.counted : row.onHand + row.counted
}

// ── Filter state ─────────────────────────────────────────────────────────────────
type Progress = '' | 'counted' | 'uncounted'
const progress = ref<Progress>('')
const progressOptions: { value: Progress; label: string }[] = [
  { value: '', label: 'All items' },
  { value: 'counted', label: 'Counted' },
  { value: 'uncounted', label: 'Not counted' },
]
const progressLabel = computed(() =>
  progress.value === '' ? 'Count progress' : (progressOptions.find(o => o.value === progress.value)?.label ?? 'Count progress')
)
const search = ref('')

const displayRows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return rows.value.filter(r => {
    if (progress.value === 'counted' && r.counted === null) return false
    if (progress.value === 'uncounted' && r.counted !== null) return false
    if (q && !r.batchNo.toLowerCase().includes(q) && !r.desc.toLowerCase().includes(q)) return false
    return true
  })
})

// ── Select batch popover ─────────────────────────────────────────────────────────
// Available batches = warehouse batches not yet in the table
const availableBatches = computed(() => {
  const wh = getWarehouseDetail(props.warehouseId)
  const si = wh?.stock.find(s => s.sku === props.sku)
  const all = si?.batches ?? []
  const inTable = new Set(rows.value.filter(r => !r.isNew).map(r => r.batchNo))
  // Transfer/picking claim from live availability, not raw on-hand — a batch
  // already fully reserved (by another outbound task, etc.) can't be offered again.
  const eligible = (isTransfer.value || isPicking.value) ? all.filter(b => b.available > 0) : all
  return eligible.filter(b => !inTable.has(b.batchNo))
})

function addWarehouseBatch(batchNo: string) {
  const wh = getWarehouseDetail(props.warehouseId)
  const si = wh?.stock.find(s => s.sku === props.sku)
  const b = si?.batches?.find(x => x.batchNo === batchNo)
  if (!b) return
  const unit = si?.unit ?? productBySku(props.sku)?.unit ?? ''
  const idx = rows.value.length
  rows.value.push({
    key: b.batchNo,
    batchNo: b.batchNo,
    expiryDate: b.expiryDate,
    expiryDisplay: isoToDisplay(b.expiryDate),
    desc: DEMO_DESCS[idx % DEMO_DESCS.length]!,
    onHand: (isTransfer.value || isPicking.value) ? b.available : b.onHand,
    counted: null,
    unit,
    location: b.location,
    isNew: false,
    originLocRows: [makeLocRow()],
    destLocRows: [makeLocRow()],
  })
}

let newCounter = 0
function addNewBatch() {
  newCounter++
  const unit = warehouseStock.value?.unit ?? productBySku(props.sku)?.unit ?? ''
  rows.value.push({
    key: `__new__${newCounter}`,
    batchNo: '',
    expiryDate: '',
    expiryDisplay: '',
    desc: '',
    onHand: 0,
    counted: null,
    unit,
    isNew: true,
    originLocRows: [makeLocRow()],
    destLocRows: [makeLocRow()],
  })
}

const lastScannedKey = ref<string | null>(null)
let scannedTimer: ReturnType<typeof setTimeout> | null = null
async function flashScanned(key: string) {
  if (scannedTimer) clearTimeout(scannedTimer)
  if (lastScannedKey.value === key) {
    lastScannedKey.value = null
    await nextTick()
  }
  lastScannedKey.value = key
  scannedTimer = setTimeout(() => { lastScannedKey.value = null }, 1000)
}

function handleDrawerScan(rawValue: string) {
  const v = rawValue.trim()
  if (!v) return
  const existing = rows.value.find(r => r.batchNo === v)
  if (existing) {
    existing.counted = (existing.counted ?? 0) + 1
    if (saveError.value) saveError.value = ''
    flashScanned(existing.key)
    return
  }
  newCounter++
  const key = `__new__${newCounter}`
  const unit = warehouseStock.value?.unit ?? productBySku(props.sku)?.unit ?? ''
  rows.value.push({
    key,
    batchNo: v,
    expiryDate: '',
    expiryDisplay: '',
    desc: '',
    onHand: 0,
    counted: 1,
    unit,
    isNew: true,
    originLocRows: [makeLocRow()],
    destLocRows: [makeLocRow()],
  })
  flashScanned(key)
}

function removeRow(key: string) {
  rows.value = rows.value.filter(r => r.key !== key)
}

function setCounted(row: WorkRow, val: string) {
  let n = val === '' ? null : Math.max(0, Math.floor(Number(val) || 0))
  // Picking can't pull more units from a batch than it actually holds.
  if (n !== null && isPicking.value && n > row.onHand) n = row.onHand
  row.counted = n
  if (saveError.value) saveError.value = ''
}

function setExpiryDisplay(row: WorkRow, val: string) {
  row.expiryDisplay = val
  row.expiryDate = displayToIso(val)
}

// ── Per-batch storage location ────────────────────────────────────────────────────
const hasOriginLoc = computed(() => (props.originLocationPaths?.length ?? 0) > 0)
const hasDestLoc = computed(() => (props.destLocationPaths?.length ?? 0) > 0)
const hasAnyLoc = computed(() => hasOriginLoc.value || hasDestLoc.value)
// Transfer uses the 2nd drawer; put-away uses inline split rows in the main table.
const showLocSplit = computed(() => isTransfer.value && hasAnyLoc.value)

// ── Inline put-away location rows ─────────────────────────────────────────────────
function paLocOpts(row: WorkRow, lr: LocRow): string[] {
  const used = new Set(row.destLocRows.filter(r => r.id !== lr.id && r.locationId).map(r => r.locationId))
  const q = (locSearches[`pa-${lr.id}`] ?? '').toLowerCase()
  return (props.destLocationPaths ?? []).filter(p => !used.has(p) && (!q || p.toLowerCase().includes(q)))
}
function paRecommendedLocOpts(row: WorkRow, lr: LocRow) { return paLocOpts(row, lr).slice(0, 3) }
function paOtherLocOpts(row: WorkRow, lr: LocRow) { return paLocOpts(row, lr).slice(3) }

function paSelectLoc(row: WorkRow, lr: LocRow, locId: string) {
  lr.locationId = locId
  locActiveKey.value = null
  delete locSearches[`pa-${lr.id}`]
  if (row.destLocRows[row.destLocRows.length - 1]?.id === lr.id) row.destLocRows.push(makeLocRow())
}

function paRemoveLocRow(row: WorkRow, lr: LocRow) {
  row.destLocRows = row.destLocRows.filter(r => r.id !== lr.id)
  if (!row.destLocRows.length) row.destLocRows = [makeLocRow()]
}

// helper: does this row have any location assignments saved?
function batchLocIsSet(row: WorkRow): boolean {
  return row.originLocRows.some(r => r.locationId && Number(r.qty) > 0)
    || row.destLocRows.some(r => r.locationId && Number(r.qty) > 0)
}

// 2nd drawer state
const batchLocRow = ref<WorkRow | null>(null)
const batchLocOriginRows = ref<LocRow[]>([])
const batchLocDestRows = ref<LocRow[]>([])
const batchLocError = ref('')
const locActiveKey = ref<string | null>(null)
const locSearches = reactive<Record<string, string>>({})

const batchLocOriginTotal = computed(() => batchLocOriginRows.value.reduce((s, r) => s + (Number(r.qty) || 0), 0))
const batchLocDestTotal = computed(() => batchLocDestRows.value.reduce((s, r) => s + (Number(r.qty) || 0), 0))

function openBatchLocDrawer(row: WorkRow) {
  batchLocRow.value = row
  batchLocOriginRows.value = row.originLocRows.some(r => r.locationId)
    ? row.originLocRows.map(r => ({ ...r }))
    : [makeLocRow()]
  if (row.destLocRows.some(r => r.locationId)) {
    batchLocDestRows.value = row.destLocRows.map(r => ({ ...r }))
  } else if (isPutAway.value) {
    // Put-away: default the first bin's qty to the full received qty — the operator
    // just picks a bin, or lowers the qty and adds more rows to split it.
    batchLocDestRows.value = [{ id: locSeq++, locationId: '', qty: row.onHand > 0 ? String(row.onHand) : '' }]
  } else {
    batchLocDestRows.value = [makeLocRow()]
  }
  batchLocError.value = ''
}

function closeBatchLocDrawer() { batchLocRow.value = null }

function batchOriginLocOpts(lr: LocRow): string[] {
  const used = new Set(batchLocOriginRows.value.filter(r => r.id !== lr.id && r.locationId).map(r => r.locationId))
  const q = (locSearches[`o-${lr.id}`] ?? '').toLowerCase()
  return (props.originLocationPaths ?? []).filter(p => !used.has(p) && (!q || p.toLowerCase().includes(q)))
}

function batchDestLocOpts(lr: LocRow): string[] {
  const used = new Set(batchLocDestRows.value.filter(r => r.id !== lr.id && r.locationId).map(r => r.locationId))
  const q = (locSearches[`d-${lr.id}`] ?? '').toLowerCase()
  return (props.destLocationPaths ?? []).filter(p => !used.has(p) && (!q || p.toLowerCase().includes(q)))
}
// First 3 options surface as "Recommended locations"; the rest sit below a divider.
function recommendedOriginLocOpts(lr: LocRow) { return batchOriginLocOpts(lr).slice(0, 3) }
function otherOriginLocOpts(lr: LocRow) { return batchOriginLocOpts(lr).slice(3) }
function recommendedDestLocOpts(lr: LocRow) { return batchDestLocOpts(lr).slice(0, 3) }
function otherDestLocOpts(lr: LocRow) { return batchDestLocOpts(lr).slice(3) }

function selectBatchOriginLoc(lr: LocRow, locationId: string) {
  lr.locationId = locationId; locActiveKey.value = null; delete locSearches[`o-${lr.id}`]
  if (batchLocOriginRows.value[batchLocOriginRows.value.length - 1]?.id === lr.id) batchLocOriginRows.value.push(makeLocRow())
}

function selectBatchDestLoc(lr: LocRow, locationId: string) {
  lr.locationId = locationId; locActiveKey.value = null; delete locSearches[`d-${lr.id}`]
  if (batchLocDestRows.value[batchLocDestRows.value.length - 1]?.id === lr.id) batchLocDestRows.value.push(makeLocRow())
}

function removeBatchOriginLoc(id: number) { batchLocOriginRows.value = batchLocOriginRows.value.filter(r => r.id !== id) }
function removeBatchDestLoc(id: number) { batchLocDestRows.value = batchLocDestRows.value.filter(r => r.id !== id) }

async function saveBatchLocDrawer() {
  const filledOrigin = batchLocOriginRows.value.filter(r => r.locationId && Number(r.qty) > 0)
  const filledDest = batchLocDestRows.value.filter(r => r.locationId && Number(r.qty) > 0)
  if (filledOrigin.length && filledDest.length && batchLocOriginTotal.value !== batchLocDestTotal.value) {
    batchLocError.value = `Origin total (${batchLocOriginTotal.value}) doesn't match destination total (${batchLocDestTotal.value})`
    return
  }
  const total = batchLocOriginTotal.value || batchLocDestTotal.value
  const onHand = batchLocRow.value?.onHand ?? 0
  if (isPutAway.value && total !== onHand) {
    batchLocError.value = `Total qty (${total}) must equal received qty (${onHand})`
    return
  }
  if (total > onHand) {
    batchLocError.value = `Total qty (${total}) exceeds available qty (${onHand})`
    return
  }
  isSavingLoc.value = true
  await new Promise(r => setTimeout(r, 600))
  if (batchLocRow.value) {
    batchLocRow.value.originLocRows = filledOrigin.length ? [...filledOrigin, makeLocRow()] : [makeLocRow()]
    batchLocRow.value.destLocRows = filledDest.length ? [...filledDest, makeLocRow()] : [makeLocRow()]
    if (total > 0) batchLocRow.value.counted = total
  }
  isSavingLoc.value = false
  batchLocRow.value = null
}

// ── Difference helpers ────────────────────────────────────────────────────────────
function diffOf(row: WorkRow): number | null {
  if (row.counted === null) return null
  return row.counted - row.onHand
}

function diffLabel(row: WorkRow): string {
  const d = diffOf(row)
  if (d === null) return 'Uncounted'
  return d > 0 ? `+${d.toLocaleString('id-ID')}` : d.toLocaleString('id-ID')
}

// Trailing-row colspan = every data column except the leading "select batch" cell:
// expiry, desc, (location if picking), (on hand + after if stats shown), counted, unit.
const trailingColspan = computed(() => 5 + (isPicking.value ? 1 : 0) + (hideStockStats.value ? 0 : 1) + (showAfterStats.value ? 1 : 0))

// ── Footer actions ────────────────────────────────────────────────────────────────
const saveError = ref('')
const isSaving = ref(false)
const isSavingLoc = ref(false)

function handleCancel() {
  emit('update:open', false)
}

async function handleSave() {
  if (isPicking.value && props.targetCount !== undefined) {
    const total = rows.value.reduce((s, r) => s + (r.counted ?? 0), 0)
    if (total > props.targetCount) {
      saveError.value = `Picked qty (${total}) exceeds the qty to pick (${props.targetCount})`
      return
    }
  }
  saveError.value = ''
  isSaving.value = true
  await new Promise(r => setTimeout(r, 600))
  const committed: CommittedBatch[] = rows.value.map(r => {
    const filledOrigin = r.originLocRows.filter(l => l.locationId && Number(l.qty) > 0)
    const filledDest = r.destLocRows.filter(l => l.locationId && Number(l.qty) > 0)
    return {
      key: r.key,
      batchNo: r.batchNo,
      expiryDate: r.expiryDate,
      desc: r.desc,
      onHand: r.onHand,
      counted: r.counted,
      unit: r.unit,
      ...(r.location !== undefined ? { location: r.location } : {}),
      ...(filledOrigin.length ? { originLocations: filledOrigin.map(l => ({ locationId: l.locationId, qty: Number(l.qty) })) } : {}),
      ...(filledDest.length ? { destLocations: filledDest.map(l => ({ locationId: l.locationId, qty: Number(l.qty) })) } : {}),
    }
  })
  emit('save', committed)
  emit('update:open', false)
}

// Format helpers
function fmtNum(n: number | null): string {
  if (n === null) return '—'
  return n.toLocaleString('id-ID')
}
</script>

<template>
  <Transition name="mbd">
  <div v-if="open" class="mbd-overlay" @click.self="handleCancel">
    <div class="mbd-panel" role="dialog" aria-label="Manage batch">

      <!-- Header -->
      <header class="mbd-header">
        <h2 class="mbd-title">Manage batch</h2>
        <button class="mbd-close" type="button" aria-label="Close" @click="handleCancel">
          <MpIcon name="close" size="md" />
        </button>
      </header>

      <!-- Content -->
      <div class="mbd-content">

        <!-- Product info bar -->
        <div class="mbd-info-bar">
          <div class="mbd-info-product">
            <img v-if="productImg" class="mbd-info-thumb" :src="productImg" :alt="productName" loading="lazy" />
            <span v-else class="mbd-info-thumb mbd-info-thumb--empty" />
            <div class="mbd-info-names">
              <span class="mbd-info-name">{{ productName }}</span>
              <span class="mbd-info-sku">{{ sku }}</span>
            </div>
          </div>
          <div class="mbd-info-stats">
            <div v-if="!hideStockStats" class="mbd-stat">
              <span class="mbd-stat-label">{{ onHandLabel }}</span>
              <span class="mbd-stat-value">{{ totalOnHand.toLocaleString('id-ID') }}</span>
            </div>
            <!-- stock count stats -->
            <template v-if="!isInOut">
              <div class="mbd-stat">
                <span class="mbd-stat-label">Counted qty</span>
                <span class="mbd-stat-value">{{ fmtNum(totalCounted) }}</span>
              </div>
              <div
                class="mbd-stat"
                :class="{ 'mbd-stat--pos': (totalDifference ?? 0) > 0, 'mbd-stat--neg': (totalDifference ?? 0) < 0 }"
              >
                <span class="mbd-stat-label">Difference</span>
                <span class="mbd-stat-value">
                  <template v-if="totalDifference === null">—</template>
                  <template v-else-if="totalDifference > 0">+{{ totalDifference.toLocaleString('id-ID') }}</template>
                  <template v-else>{{ totalDifference.toLocaleString('id-ID') }}</template>
                </span>
              </div>
            </template>
            <!-- stock in/out stats -->
            <template v-else>
              <div v-if="isReceiving" class="mbd-stat">
                <span class="mbd-stat-label">Purchase qty</span>
                <span class="mbd-stat-value">{{ (props.targetCount ?? 0).toLocaleString('id-ID') }}</span>
              </div>
              <div v-if="isPicking" class="mbd-stat">
                <span class="mbd-stat-label">To pick qty</span>
                <span class="mbd-stat-value">{{ (props.targetCount ?? 0).toLocaleString('id-ID') }}</span>
              </div>
              <div
                class="mbd-stat"
                :class="(isTransfer || isPicking || hideStockStats) ? {} : { 'mbd-stat--pos': (totalCounted ?? 0) > 0, 'mbd-stat--neg': (totalCounted ?? 0) < 0 }"
              >
                <span class="mbd-stat-label">{{ qtyLabel }}</span>
                <span class="mbd-stat-value">
                  <!-- Put-away's received qty is a known fact from receiving — show the
                       fixed total (totalOnHand), not counted progress (starts at null). -->
                  <template v-if="isPutAway">{{ totalOnHand.toLocaleString('id-ID') }}</template>
                  <template v-else-if="totalCounted === null">—</template>
                  <template v-else-if="!isTransfer && !isPicking && !hideStockStats && totalCounted > 0">+{{ totalCounted.toLocaleString('id-ID') }}</template>
                  <template v-else>{{ totalCounted.toLocaleString('id-ID') }}</template>
                </span>
              </div>
              <div v-if="isReceiving" class="mbd-stat">
                <span class="mbd-stat-label">Outstanding qty</span>
                <span class="mbd-stat-value">{{ Math.max(0, (props.targetCount ?? 0) - (totalCounted ?? 0)).toLocaleString('id-ID') }}</span>
              </div>
              <div v-if="isPutAway" class="mbd-stat">
                <span class="mbd-stat-label">Put away qty</span>
                <span class="mbd-stat-value">{{ totalPutAwayQty.toLocaleString('id-ID') }}</span>
              </div>
              <div v-if="showAfterStats" class="mbd-stat">
                <span class="mbd-stat-label">{{ afterLabel }}</span>
                <span class="mbd-stat-value">{{ totalNewOnHand !== null ? totalNewOnHand.toLocaleString('id-ID') : '—' }}</span>
              </div>
            </template>
          </div>
        </div>

        <template v-if="rows.length === 0 && !isInOut">
          <div class="mbd-empty">
            <img src="/illustrations/empty-folder.png" alt="" width="120" height="100" />
            <p class="mbd-empty-title">No batches yet</p>
            <p class="mbd-empty-desc">Add a batch using the button above.</p>
          </div>
        </template>

        <template v-else>
        <!-- Filter bar -->
        <div class="mbd-filter-bar">
          <div class="mbd-filter-left">
            <MpPopover v-if="!isInOut" id="mbd-progress" is-close-on-select use-portal>
              <MpPopoverTrigger>
                <button class="mbd-progress-btn" :class="{ 'mbd-progress-btn--placeholder': progress === '' }" type="button">
                  {{ progressLabel }}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
                <MpPopoverList>
                  <MpPopoverListItem v-for="o in progressOptions" :key="o.value" :is-active="o.value === progress" @click="progress = o.value">
                    {{ o.label }}
                  </MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </div>

          <div class="mbd-search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
            <input v-model="search" class="mbd-search-input" type="text" placeholder="Search..." />
          </div>
        </div>

        <!-- Scan bar — receiving mode only -->
        <ScanBar v-if="isReceiving" placeholder="Scan batch number..." @scan="handleDrawerScan" />

        <!-- Table -->
        <div class="mbd-table-wrap">

          <!-- ── Put-away: inline split rows per batch ── -->
          <template v-if="isPutAway">
          <table class="mbd-table mbd-table--putaway">
            <colgroup>
              <col class="mbd-col-batch" />
              <col class="mbd-col-expiry" />
              <col class="mbd-col-desc" />
              <col class="mbd-col-pa-loc" />
              <col class="mbd-col-counted" />
              <col class="mbd-col-unit" />
              <col class="mbd-col-del" />
            </colgroup>
            <thead>
              <tr>
                <th class="mbd-th">Batch</th>
                <th class="mbd-th">Expiry date</th>
                <th class="mbd-th">Description</th>
                <th class="mbd-th">Storage location</th>
                <th class="mbd-th mbd-th--num">Received qty</th>
                <th class="mbd-th">Unit</th>
                <th class="mbd-th mbd-th--del" />
              </tr>
            </thead>
            <tbody>
              <template v-for="row in displayRows" :key="row.key">
                <tr v-for="(lr, lrIdx) in row.destLocRows" :key="lr.id" class="mbd-tr">
                  <td v-if="lrIdx === 0" :rowspan="row.destLocRows.length" class="mbd-td mbd-td--muted mbd-td--merged">{{ row.batchNo }}</td>
                  <td v-if="lrIdx === 0" :rowspan="row.destLocRows.length" class="mbd-td mbd-td--muted mbd-td--merged">{{ isoToDisplay(row.expiryDate) }}</td>
                  <td v-if="lrIdx === 0" :rowspan="row.destLocRows.length" class="mbd-td mbd-td--muted mbd-td--merged">{{ row.desc }}</td>
                  <!-- Storage location picker -->
                  <td class="mbd-td mbd-td--input mbd-td--pa-loc">
                    <MpPopover :id="`mbd-pa-loc-${lr.id}`" placement="bottom-start" use-portal :is-keep-alive="false" is-close-on-select>
                      <MpPopoverTrigger>
                        <div class="mbd-pa-loc-trigger">
                          <input
                            class="mbd-pa-loc-input"
                            type="text"
                            autocomplete="off"
                            :value="locActiveKey === `pa-${lr.id}` ? (locSearches[`pa-${lr.id}`] ?? '') : lr.locationId"
                            placeholder="Select storage location"
                            @focus="locActiveKey = `pa-${lr.id}`; locSearches[`pa-${lr.id}`] = ''"
                            @input="locActiveKey = `pa-${lr.id}`; locSearches[`pa-${lr.id}`] = ($event.target as HTMLInputElement).value"
                          />
                          <svg class="mbd-pa-loc-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                        </div>
                      </MpPopoverTrigger>
                      <MpPopoverContent :class="css({ width: '320px', maxHeight: '260px', overflowY: 'auto', padding: '0' })">
                        <template v-if="paLocOpts(row, lr).length">
                          <p class="mbd-pa-loc-heading">Recommended locations</p>
                          <MpPopoverList>
                            <MpPopoverListItem v-for="loc in paRecommendedLocOpts(row, lr)" :key="loc" :is-active="loc === lr.locationId" @click="paSelectLoc(row, lr, loc)">{{ loc }}</MpPopoverListItem>
                          </MpPopoverList>
                          <template v-if="paOtherLocOpts(row, lr).length">
                            <div class="mbd-pa-loc-divider" />
                            <MpPopoverList>
                              <MpPopoverListItem v-for="loc in paOtherLocOpts(row, lr)" :key="loc" :is-active="loc === lr.locationId" @click="paSelectLoc(row, lr, loc)">{{ loc }}</MpPopoverListItem>
                            </MpPopoverList>
                          </template>
                        </template>
                        <p v-else class="mbd-pa-loc-none">No locations found.</p>
                      </MpPopoverContent>
                    </MpPopover>
                  </td>
                  <!-- Qty input -->
                  <td class="mbd-td mbd-td--input mbd-td--pa-qty">
                    <input
                      class="mbd-qty-input"
                      type="number"
                      min="0"
                      :value="lr.qty"
                      placeholder="0"
                      @input="lr.qty = ($event.target as HTMLInputElement).value"
                    />
                  </td>
                  <td v-if="lrIdx === 0" :rowspan="row.destLocRows.length" class="mbd-td mbd-td--muted mbd-td--merged">{{ row.unit }}</td>
                  <td class="mbd-td mbd-td--del">
                    <button
                      v-if="lr.locationId || row.destLocRows.length > 1"
                      class="mbd-del-btn"
                      type="button"
                      aria-label="Remove location"
                      @click="paRemoveLocRow(row, lr)"
                    >
                      <MpIcon name="minus-circular" size="sm" />
                    </button>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
          <div class="mbd-pagination">
            Showing {{ displayRows.length }} of {{ rows.length }} batches
          </div>
          </template>

          <!-- ── Other modes: existing table ── -->
          <template v-else>
          <table class="mbd-table" :class="{ 'mbd-table--split': showLocSplit }">
            <colgroup>
              <col class="mbd-col-batch" />
              <col class="mbd-col-expiry" />
              <col class="mbd-col-desc" />
              <col v-if="isPicking" class="mbd-col-location" />
              <col v-if="!hideStockStats" class="mbd-col-num" />
              <col class="mbd-col-counted" />
              <col v-if="showAfterStats" class="mbd-col-after" />
              <col class="mbd-col-unit" />
              <col class="mbd-col-del" />
            </colgroup>
            <thead>
              <tr>
                <th class="mbd-th">Batch</th>
                <th class="mbd-th">Expiry date</th>
                <th class="mbd-th">Description</th>
                <th v-if="isPicking" class="mbd-th">Location</th>
                <th v-if="!hideStockStats" class="mbd-th mbd-th--num">{{ onHandLabel }}</th>
                <th class="mbd-th mbd-th--num">{{ isInOut ? qtyLabel : 'Counted qty' }}</th>
                <th v-if="showAfterStats" class="mbd-th mbd-th--num">{{ afterLabel }}</th>
                <th class="mbd-th">Unit</th>
                <th class="mbd-th mbd-th--del" />
              </tr>
            </thead>
            <tbody>
              <template v-for="row in displayRows" :key="row.key">
              <tr class="mbd-tr" :class="{ 'mbd-tr--scanned': lastScannedKey === row.key }">
                <!-- BATCH -->
                <td v-if="row.isNew" class="mbd-td mbd-td--input">
                  <input
                    class="mbd-cell-input"
                    type="text"
                    placeholder="Batch no."
                    :value="row.batchNo"
                    @input="row.batchNo = ($event.target as HTMLInputElement).value"
                  />
                </td>
                <td v-else class="mbd-td mbd-td--muted">{{ row.batchNo }}</td>

                <!-- EXPIRY DATE -->
                <td v-if="row.isNew" class="mbd-td mbd-td--input mbd-td--datepicker">
                  <MpDatePicker
                    use-portal
                    format="DD/MM/YYYY"
                    value-type="format"
                    :model-value="row.expiryDisplay"
                    :class="css({ width: '100%' })"
                    @update:model-value="setExpiryDisplay(row, $event as string)"
                  />
                </td>
                <td v-else class="mbd-td mbd-td--muted">{{ isoToDisplay(row.expiryDate) }}</td>

                <!-- DESCRIPTION -->
                <td v-if="row.isNew" class="mbd-td mbd-td--input">
                  <input
                    class="mbd-cell-input"
                    type="text"
                    placeholder="Description"
                    :value="row.desc"
                    @input="row.desc = ($event.target as HTMLInputElement).value"
                  />
                </td>
                <td v-else class="mbd-td mbd-td--muted">{{ row.desc }}</td>

                <!-- LOCATION (picking only) — read-only, the batch's fixed bin -->
                <td v-if="isPicking" class="mbd-td mbd-td--muted">{{ row.location || '—' }}</td>

                <!-- ON HAND -->
                <td v-if="!hideStockStats" class="mbd-td mbd-td--num mbd-td--muted">{{ row.onHand.toLocaleString('id-ID') }}</td>

                <!-- COUNTED: 2-row cell (loc mode) or plain input. Put-away's received
                     qty is a known fact from receiving — show it directly, not "—". -->
                <td v-if="showLocSplit" class="mbd-td mbd-td--loc-cell">
                  <div class="mbd-cell-row mbd-cell-row--total">
                    <span v-if="isPutAway" class="mbd-cell-val">{{ row.onHand.toLocaleString('id-ID') }}</span>
                    <span v-else-if="row.counted !== null" class="mbd-cell-val">{{ row.counted.toLocaleString('id-ID') }}</span>
                    <span v-else class="mbd-cell-empty">—</span>
                  </div>
                  <div class="mbd-cell-row mbd-cell-row--action">
                    <button class="mbd-loc-link" :class="{ 'mbd-loc-link--set': batchLocIsSet(row) }" type="button" @click="openBatchLocDrawer(row)">Manage location</button>
                  </div>
                </td>
                <td v-else class="mbd-td mbd-td--input mbd-td--counted">
                  <input
                    class="mbd-qty-input"
                    type="number"
                    min="0"
                    :value="row.counted ?? ''"
                    placeholder="0"
                    @input="setCounted(row, ($event.target as HTMLInputElement).value)"
                  />
                </td>

                <!-- DIFFERENCE (count) / NEW ON HAND (in-out) -->
                <td
                  v-if="!isInOut"
                  class="mbd-td mbd-td--num"
                  :class="{
                    'mbd-diff--pos': (diffOf(row) ?? 0) > 0,
                    'mbd-diff--neg': (diffOf(row) ?? 0) < 0,
                    'mbd-diff--uncounted': diffOf(row) === null,
                  }"
                >{{ diffLabel(row) }}</td>
                <td v-else-if="showAfterStats" class="mbd-td mbd-td--num">
                  {{ newOnHandOf(row) !== null ? newOnHandOf(row)!.toLocaleString('id-ID') : '—' }}
                </td>

                <!-- UNIT -->
                <td class="mbd-td mbd-td--muted">{{ row.unit }}</td>

                <!-- REMOVE -->
                <td class="mbd-td mbd-td--del">
                  <button class="mbd-del-btn" type="button" aria-label="Remove batch" @click="removeRow(row.key)">
                    <MpIcon name="minus-circular" size="sm" />
                  </button>
                </td>
              </tr>

              </template>

              <!-- Select batch row — same pattern as "Select product" in warehouse transfer.
                   Hidden for put-away: the batches are a fixed fact from receiving. -->
              <tr v-if="!isPutAway" class="mbd-tr mbd-tr--select">
                <td class="mbd-td mbd-td--select-cell">
                  <MpPopover id="mbd-select-batch" is-close-on-select use-portal>
                    <MpPopoverTrigger>
                      <div class="mbd-batch-trigger">
                        <span class="mbd-batch-placeholder">Select batch</span>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" class="mbd-batch-chevron">
                          <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                      </div>
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ minWidth: '280px', width: 'max-content' })">
                      <MpPopoverList>
                        <MpPopoverListItem
                          v-for="b in availableBatches"
                          :key="b.batchNo"
                          @click="addWarehouseBatch(b.batchNo)"
                        >
                          {{ b.batchNo }} — exp. {{ isoToDisplay(b.expiryDate) }}
                        </MpPopoverListItem>
                        <MpPopoverListItem v-if="!availableBatches.length" disabled>
                          All batches added
                        </MpPopoverListItem>
                        <template v-if="props.kind !== 'transfer' && !isPicking">
                          <div class="mbd-popover-divider" />
                          <MpPopoverListItem @click="addNewBatch">
                            <span class="mbd-popover-add-row"><MpIcon name="add" size="sm" />Add new batch</span>
                          </MpPopoverListItem>
                        </template>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </td>
                <td :colspan="trailingColspan" class="mbd-td mbd-td--select-empty" />
              </tr>

            </tbody>
          </table>
          <div class="mbd-pagination">
            Showing {{ displayRows.length }} of {{ rows.length }} batches
          </div>
          </template>
        </div>

        <p v-if="saveError" class="mbd-save-error">{{ saveError }}</p>

        </template>

      </div>

      <!-- Footer -->
      <footer class="mbd-footer">
        <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="handleCancel">Cancel</button>
        <button class="btn-enterprise btn-enterprise--primary" type="button" :disabled="isSaving" @click="handleSave">{{ isSaving ? 'Saving…' : 'Save' }}</button>
      </footer>

    </div>
  </div>
  </Transition>

  <!-- ── 2nd drawer: manage storage location per batch ───────────────────────── -->
  <Transition name="mbd-loc2">
  <div v-if="batchLocRow" class="mbd-loc2-overlay" @click.self="closeBatchLocDrawer">
    <div class="mbd-loc2-panel" role="dialog" aria-label="Manage storage location">
      <header class="mbd-loc2-header">
        <h2 class="mbd-loc2-title">Manage storage location</h2>
        <button class="mbd-close" type="button" aria-label="Close" @click="closeBatchLocDrawer">
          <MpIcon name="close" size="md" />
        </button>
      </header>

      <div class="mbd-loc2-content">
        <!-- Product + batch info bar -->
        <div class="mbd-info-bar">
          <div class="mbd-info-product">
            <img v-if="productImg" class="mbd-info-thumb" :src="productImg" :alt="productName" loading="lazy" />
            <span v-else class="mbd-info-thumb mbd-info-thumb--empty" />
            <div class="mbd-info-names">
              <span class="mbd-info-name">{{ productName }}</span>
              <span class="mbd-info-sku">{{ sku }} · {{ batchLocRow.batchNo }}</span>
            </div>
          </div>
          <div class="mbd-info-stats">
            <div class="mbd-stat">
              <span class="mbd-stat-label">{{ isPutAway ? 'Received qty' : 'Available qty' }}</span>
              <span class="mbd-stat-value">{{ batchLocRow.onHand.toLocaleString('id-ID') }}</span>
            </div>
          </div>
        </div>

        <!-- Out from (origin) -->
        <div v-if="hasOriginLoc" class="mbd-loc2-section">
          <div class="mbd-loc2-section-header">
            <span class="mbd-loc2-section-title">Out from (origin warehouse)</span>
            <span class="mbd-loc2-total">Total: {{ batchLocOriginTotal }}</span>
          </div>
          <div class="mbd-loc-tbl-wrap"><table class="mbd-loc-tbl">
            <colgroup><col /><col class="mbd-loc-col-qty" /><col class="mbd-loc-col-del" /></colgroup>
            <thead><tr>
              <th class="mbd-loc-th">Storage location</th>
              <th class="mbd-loc-th mbd-loc-th--num">Qty</th>
              <th class="mbd-loc-th mbd-loc-th--del" />
            </tr></thead>
            <tbody>
              <tr v-for="lr in batchLocOriginRows" :key="lr.id" class="mbd-loc-tr">
                <td class="mbd-loc-td mbd-loc-td--sel">
                  <MpPopover :id="`mbd2-lo-${lr.id}`" placement="bottom-start" use-portal :is-keep-alive="false" is-close-on-select @close="locActiveKey = null">
                    <MpPopoverTrigger>
                      <div class="mbd-loc-trigger">
                        <input
                          class="mbd-loc-input" type="text" autocomplete="off"
                          placeholder="Select bin"
                          :value="locActiveKey === `o-${lr.id}` ? (locSearches[`o-${lr.id}`] ?? '') : lr.locationId"
                          @focus="locActiveKey = `o-${lr.id}`"
                          @input="locSearches[`o-${lr.id}`] = ($event.target as HTMLInputElement).value"
                        />
                        <svg class="mbd-loc-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                      </div>
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ minWidth: '240px', width: 'max-content', padding: '0' })">
                      <template v-if="batchOriginLocOpts(lr).length">
                        <p class="mbd-loc-section-heading">Recommended locations</p>
                        <MpPopoverList>
                          <MpPopoverListItem v-for="p in recommendedOriginLocOpts(lr)" :key="p" @click="selectBatchOriginLoc(lr, p)">{{ p }}</MpPopoverListItem>
                        </MpPopoverList>
                        <template v-if="otherOriginLocOpts(lr).length">
                          <div class="mbd-loc-section-divider" />
                          <MpPopoverList>
                            <MpPopoverListItem v-for="p in otherOriginLocOpts(lr)" :key="p" @click="selectBatchOriginLoc(lr, p)">{{ p }}</MpPopoverListItem>
                          </MpPopoverList>
                        </template>
                      </template>
                      <MpPopoverList v-else>
                        <MpPopoverListItem disabled>No bins found.</MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </td>
                <td class="mbd-loc-td mbd-loc-td--qty">
                  <input v-model="lr.qty" class="mbd-loc-qty-input" type="number" min="0" placeholder="0" />
                </td>
                <td class="mbd-loc-td mbd-loc-td--del">
                  <button class="mbd-loc-del-btn" type="button" :disabled="batchLocOriginRows.length <= 1" @click="removeBatchOriginLoc(lr.id)">
                    <MpIcon name="minus-circular" size="sm" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table></div>
        </div>

        <!-- Into (destination) -->
        <div v-if="hasDestLoc" class="mbd-loc2-section">
          <div class="mbd-loc2-section-header">
            <span class="mbd-loc2-section-title">{{ isPutAway ? 'Put away in' : 'Into (destination warehouse)' }}</span>
            <span class="mbd-loc2-total">Total: {{ batchLocDestTotal }}</span>
          </div>
          <div class="mbd-loc-tbl-wrap"><table class="mbd-loc-tbl">
            <colgroup><col /><col class="mbd-loc-col-qty" /><col class="mbd-loc-col-del" /></colgroup>
            <thead><tr>
              <th class="mbd-loc-th">Storage location</th>
              <th class="mbd-loc-th mbd-loc-th--num">Qty</th>
              <th class="mbd-loc-th mbd-loc-th--del" />
            </tr></thead>
            <tbody>
              <tr v-for="lr in batchLocDestRows" :key="lr.id" class="mbd-loc-tr">
                <td class="mbd-loc-td mbd-loc-td--sel">
                  <MpPopover :id="`mbd2-ld-${lr.id}`" placement="bottom-start" use-portal :is-keep-alive="false" is-close-on-select @close="locActiveKey = null">
                    <MpPopoverTrigger>
                      <div class="mbd-loc-trigger">
                        <input
                          class="mbd-loc-input" type="text" autocomplete="off"
                          placeholder="Select bin"
                          :value="locActiveKey === `d-${lr.id}` ? (locSearches[`d-${lr.id}`] ?? '') : lr.locationId"
                          @focus="locActiveKey = `d-${lr.id}`"
                          @input="locSearches[`d-${lr.id}`] = ($event.target as HTMLInputElement).value"
                        />
                        <svg class="mbd-loc-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                      </div>
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ minWidth: '240px', width: 'max-content', padding: '0' })">
                      <template v-if="batchDestLocOpts(lr).length">
                        <p class="mbd-loc-section-heading">Recommended locations</p>
                        <MpPopoverList>
                          <MpPopoverListItem v-for="p in recommendedDestLocOpts(lr)" :key="p" @click="selectBatchDestLoc(lr, p)">{{ p }}</MpPopoverListItem>
                        </MpPopoverList>
                        <template v-if="otherDestLocOpts(lr).length">
                          <div class="mbd-loc-section-divider" />
                          <MpPopoverList>
                            <MpPopoverListItem v-for="p in otherDestLocOpts(lr)" :key="p" @click="selectBatchDestLoc(lr, p)">{{ p }}</MpPopoverListItem>
                          </MpPopoverList>
                        </template>
                      </template>
                      <MpPopoverList v-else>
                        <MpPopoverListItem disabled>No bins found.</MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </td>
                <td class="mbd-loc-td mbd-loc-td--qty">
                  <input v-model="lr.qty" class="mbd-loc-qty-input" type="number" min="0" placeholder="0" />
                </td>
                <td class="mbd-loc-td mbd-loc-td--del">
                  <button class="mbd-loc-del-btn" type="button" :disabled="batchLocDestRows.length <= 1" @click="removeBatchDestLoc(lr.id)">
                    <MpIcon name="minus-circular" size="sm" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table></div>
        </div>

        <p v-if="batchLocError" class="mbd-loc2-error">{{ batchLocError }}</p>
      </div>

      <footer class="mbd-loc2-footer">
        <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="closeBatchLocDrawer">Cancel</button>
        <button class="btn-enterprise btn-enterprise--primary" type="button" :disabled="isSavingLoc" @click="saveBatchLocDrawer">{{ isSavingLoc ? 'Saving…' : 'Save changes' }}</button>
      </footer>
    </div>
  </div>
  </Transition>
</template>

<style scoped>
/* ── Transitions ─────────────────────────────────────────────────────────────── */
.mbd-enter-active,
.mbd-leave-active { transition: background-color 250ms ease; }
.mbd-enter-from, .mbd-leave-to { background-color: transparent; }
.mbd-enter-active :deep(.mbd-panel) { transition: transform 350ms ease-out; }
.mbd-leave-active :deep(.mbd-panel) { transition: transform 250ms ease-in; }
.mbd-enter-from :deep(.mbd-panel),
.mbd-leave-to :deep(.mbd-panel) { transform: translateX(calc(100% + 12px)); }

.mbd-loc2-enter-active,
.mbd-loc2-leave-active { transition: background-color 250ms ease; }
.mbd-loc2-enter-from, .mbd-loc2-leave-to { background-color: transparent; }
.mbd-loc2-enter-active :deep(.mbd-loc2-panel) { transition: transform 350ms ease-out; }
.mbd-loc2-leave-active :deep(.mbd-loc2-panel) { transition: transform 250ms ease-in; }
.mbd-loc2-enter-from :deep(.mbd-loc2-panel),
.mbd-loc2-leave-to :deep(.mbd-loc2-panel) { transform: translateX(calc(100% + 12px)); }

/* ── Overlay + panel ─────────────────────────────────────────────────────────── */
.mbd-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}
.mbd-panel {
  margin: var(--mp-spacing-3);
  width: min(1400px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 24px;
  overflow: hidden;
}

/* ── Header ──────────────────────────────────────────────────────────────────── */
.mbd-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.mbd-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular, 400); color: var(--mp-text-default); }
.mbd-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.mbd-close:hover { background: var(--mp-background-neutral-hovered); }

/* ── Content area ────────────────────────────────────────────────────────────── */
.mbd-content {
  flex: 1; min-height: 0; overflow: hidden;
  padding: var(--mp-spacing-4); display: flex; flex-direction: column; gap: 20px;
}
.mbd-content > * { flex-shrink: 0; }

/* ── Product info bar ────────────────────────────────────────────────────────── */
.mbd-info-bar {
  display: flex; align-items: center; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
}
.mbd-info-product { display: flex; align-items: center; gap: var(--mp-spacing-3); flex: 1; min-width: 0; }
.mbd-info-thumb {
  width: 40px; height: 40px; border-radius: var(--mp-radii-md);
  object-fit: cover; flex-shrink: 0;
  border: 1px solid var(--mp-border-subtle);
  background: var(--mp-background-neutral);
}
.mbd-info-thumb--empty { background: var(--mp-background-neutral-subtle); }
.mbd-info-names { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.mbd-info-name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mbd-info-sku { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.mbd-info-stats { display: flex; gap: var(--mp-spacing-6); flex-shrink: 0; }
.mbd-stat { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; }
.mbd-stat-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
.mbd-stat-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-variant-numeric: tabular-nums; font-weight: var(--mp-font-weights-medium); }
.mbd-stat--pos .mbd-stat-value { color: var(--mp-text-success, #18794e); }
.mbd-stat--neg .mbd-stat-value { color: var(--mp-text-danger, #a8352d); }

/* ── Filter bar ──────────────────────────────────────────────────────────────── */
.mbd-filter-bar {
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3);
}
.mbd-filter-left {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
}
.mbd-popover-divider { height: 1px; background: var(--mp-border-default); margin: var(--mp-spacing-1) 0; }
.mbd-popover-add-row { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.mbd-progress-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-form, rgba(29,31,36,0.16)); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral); font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default); cursor: pointer;
}
.mbd-progress-btn svg { color: var(--mp-icon-default); }
.mbd-progress-btn--placeholder { color: var(--mp-text-placeholder); }
.mbd-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2); width: 280px;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px);
  color: var(--mp-icon-default);
}
.mbd-search-input { flex: 1; min-width: 0; border: none; outline: none; background: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.mbd-search-input::placeholder { color: var(--mp-text-placeholder); }

/* ── Table ───────────────────────────────────────────────────────────────────── */
.mbd-table-wrap {
  flex: 0 1 auto; min-height: 0;
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-md);
  overflow: auto;
}
.mbd-table {
  width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0;
  min-width: 1000px;
}
.mbd-col-batch   { width: 240px; }
.mbd-col-expiry  { width: 172px; }
.mbd-col-desc    { width: 120px; }
.mbd-col-location { width: 160px; }
.mbd-col-num     { width: 150px; }
.mbd-col-after   { width: 175px; }
.mbd-col-counted { width: 160px; }
.mbd-col-unit    { width: 78px; }
.mbd-col-del     { width: 44px; }
.mbd-col-pa-loc  { width: 300px; }

/* ── Put-away inline split-row table ──────────────────────────────────────────── */
.mbd-table--putaway .mbd-th { border-right: 1px solid var(--mp-border-default); }
.mbd-table--putaway .mbd-th:last-child { border-right: none; }
.mbd-table--putaway .mbd-td { border-right: 1px solid var(--mp-border-default); }
.mbd-table--putaway .mbd-td:last-child { border-right: none; }
.mbd-td--merged { border-left: none; }
.mbd-td--pa-loc  { padding: 0; background: var(--mp-background-neutral, #fff); }
.mbd-td--pa-loc:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }
.mbd-td--pa-qty  { padding: 0; background: var(--mp-background-neutral, #fff); }
.mbd-td--pa-qty:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }
.mbd-pa-loc-trigger {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  min-height: var(--mp-sizes-10, 40px); padding: 0 var(--mp-spacing-3); cursor: text;
}
.mbd-pa-loc-input {
  flex: 1; min-width: 0; border: none; outline: none; background: none; padding: 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mbd-pa-loc-input::placeholder { color: var(--mp-text-placeholder); }
.mbd-pa-loc-chevron { flex-shrink: 0; color: var(--mp-icon-default); }
.mbd-pa-loc-heading { margin: 0; padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.mbd-pa-loc-divider { height: 1px; margin: var(--mp-spacing-1) 0; background: var(--mp-border-default); }
.mbd-pa-loc-none { margin: 0; padding: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); text-align: center; }
.mbd-th {
  height: var(--mp-sizes-7, 28px);
  text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.mbd-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.mbd-th--del { padding: 0; }

.mbd-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  border-right: 1px solid var(--mp-border-default);
  vertical-align: top;
  background: var(--mp-background-neutral-subtle);
}
.mbd-td:last-child { border-right: none; }
.mbd-td--muted { color: var(--mp-text-secondary); }
@keyframes mbd-scan-flash {
  0%   { background: var(--mp-background-success-subtle, #f0fdf4); }
  20%  { background: var(--mp-background-success-subtle, #f0fdf4); }
  100% { background: var(--mp-background-neutral-subtle); }
}
.mbd-tr--scanned .mbd-td { animation: mbd-scan-flash 1s ease-out forwards; }
.mbd-td--num { text-align: right; white-space: nowrap; padding: 8px var(--mp-spacing-2) 8px var(--mp-spacing-4); }

/* White editable cells — focus ring via ::after (box-shadow: inset is painted
   before collapsed borders and gets covered on left/right; ::after is in the
   normal stacking context and paints on top of everything). */
.mbd-td--input { padding: 0; background: var(--mp-background-neutral, #fff); position: relative; }
.mbd-td--input:focus-within::after {
  content: ''; position: absolute; inset: 0;
  border: 1px solid var(--mp-border-bold);
  z-index: 2; pointer-events: none;
}

/* Counted cell is white + right-aligned */
.mbd-td--counted { padding: 0; background: var(--mp-background-neutral, #fff); position: relative; }
.mbd-td--counted:focus-within::after {
  content: ''; position: absolute; inset: 0;
  border: 1px solid var(--mp-border-bold);
  z-index: 2; pointer-events: none;
}

.mbd-cell-input {
  width: 100%; height: var(--mp-sizes-10, 40px);
  padding: 0 var(--mp-spacing-2); border: none; background: transparent;
  color: var(--mp-text-default); font-size: var(--mp-font-sizes-md); outline: none;
}
.mbd-cell-input::placeholder { color: var(--mp-text-placeholder); }

/* Date picker inside table cell — strip all borders/shadows from every child element.
   Safe because use-portal teleports the calendar popup outside the <td>. */
.mbd-td--datepicker :deep(.mp-datepicker__root) { width: 100%; height: 100%; }
.mbd-td--datepicker :deep(*) {
  border: none !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  outline: none !important;
}

.mbd-qty-input {
  width: 100%; text-align: right; height: var(--mp-sizes-10, 40px);
  padding: 0 var(--mp-spacing-2); border: none; background: transparent;
  color: var(--mp-text-default); font-size: var(--mp-font-sizes-md);
  font-variant-numeric: tabular-nums; outline: none;
}
.mbd-qty-input::placeholder { color: var(--mp-text-placeholder); }

/* Difference column */
.mbd-diff--pos { color: var(--mp-text-success, #18794e); }
.mbd-diff--neg { color: var(--mp-text-danger, #a8352d); }
.mbd-diff--uncounted { color: var(--mp-text-secondary); }

/* Remove button — 44px enforced by table-layout: fixed on the col */
.mbd-td--del {
  padding: 0; text-align: center; background: var(--mp-background-neutral-subtle);
}
.mbd-del-btn {
  display: flex; align-items: center; justify-content: center;
  width: 44px; height: var(--mp-sizes-10, 40px);
  border: none; background: none; cursor: pointer; color: var(--mp-text-secondary);
}
.mbd-del-btn:hover { background: var(--mp-background-neutral-subtle); color: var(--mp-text-danger, #dc2626); }

/* When any column has split rows, all columns get left/right borders; no outer borders */
.mbd-table--split .mbd-th { border-right: 1px solid var(--mp-border-default); }
.mbd-table--split .mbd-th:last-child { border-right: none; }
.mbd-table--split .mbd-td { border-right: 1px solid var(--mp-border-default); }
.mbd-table--split .mbd-td:last-child { border-right: none; }

/* Pagination row — white bg, no gray */
.mbd-pagination {
  position: sticky; bottom: 0;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
  background: var(--mp-background-default, #fff);
}
.mbd-empty {
  display: flex; flex-direction: column; align-items: center;
  padding: var(--mp-spacing-10, 40px) var(--mp-spacing-4);
  gap: var(--mp-spacing-2); flex: 1;
}
.mbd-empty-title {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); text-align: center;
}
.mbd-empty-desc { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); text-align: center; }

/* Select batch row — same pattern as "Select product" in warehouse transfer */
.mbd-td--select-cell { padding: 0; background: var(--mp-background-neutral, #fff); position: relative; }
.mbd-td--select-cell:focus-within::after {
  content: ''; position: absolute; inset: 0;
  border: 1px solid var(--mp-border-bold);
  z-index: 2; pointer-events: none;
}
.mbd-td--select-empty { background: var(--mp-background-neutral, #fff); }
.mbd-batch-trigger {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; min-height: var(--mp-sizes-10, 40px);
  padding: 0 var(--mp-spacing-3);
  cursor: pointer; background: transparent; border: none;
}
.mbd-batch-trigger:hover { background: var(--mp-background-neutral-subtle); }
.mbd-batch-placeholder { color: var(--mp-text-placeholder); font-size: var(--mp-font-sizes-md); }
.mbd-batch-chevron { color: var(--mp-icon-default); flex-shrink: 0; }

/* ── 2-row "Manage location" cell in batch table ─────────────────────────────── */
.mbd-td--loc-cell {
  padding: 0; background: var(--mp-background-neutral-subtle);
  display: flex; flex-direction: column; height: auto;
}
.mbd-cell-row { display: flex; align-items: center; height: 40px; padding: 0 var(--mp-spacing-2); }
.mbd-cell-row--total { justify-content: flex-end; }
.mbd-cell-val { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.mbd-cell-empty { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.mbd-cell-row--action { border-top: 1px solid var(--mp-border-default); justify-content: flex-end; }
.mbd-loc-link {
  background: none; border: none; cursor: pointer; padding: 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-link, #3b82f6); text-decoration: none;
}
.mbd-loc-link:hover { text-decoration: underline; }
.mbd-loc-link--set { color: var(--mp-text-success, #18794e); }

/* ── 2nd drawer: batch storage location ──────────────────────────────────────── */
.mbd-loc2-overlay {
  position: fixed; inset: 0; z-index: 1400;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}
.mbd-loc2-panel {
  margin: var(--mp-spacing-3);
  width: min(900px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 24px;
  overflow: hidden;
}
.mbd-loc2-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.mbd-loc2-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default); }
.mbd-loc2-content {
  flex: 1; min-height: 0; overflow-y: auto;
  padding: var(--mp-spacing-4); display: flex; flex-direction: column; gap: 20px;
}
.mbd-loc2-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.mbd-loc2-section-header { display: flex; align-items: center; justify-content: space-between; }
.mbd-loc2-section-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.mbd-loc2-total { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.mbd-loc2-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #a8352d); }
.mbd-save-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #a8352d); }
.mbd-loc2-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
  background: var(--mp-background-stage);
}
.mbd-loc-section-heading { margin: 0; padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.mbd-loc-section-divider { height: 1px; margin: var(--mp-spacing-1) 0; background: var(--mp-border-default); }
.mbd-loc-tbl-wrap { border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md); overflow: hidden; }
.mbd-loc-tbl { width: 100%; table-layout: fixed; border-collapse: collapse; }
.mbd-loc-col-qty { width: 80px; }
.mbd-loc-col-del { width: 36px; }
.mbd-loc-th {
  height: 28px; padding: 0 var(--mp-spacing-2); text-align: left;
  font-size: var(--mp-font-sizes-xs); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase; white-space: nowrap;
  background: var(--mp-background-neutral); border-bottom: 1px solid var(--mp-border-default);
}
.mbd-loc-th--num { text-align: right; }
.mbd-loc-th--del { padding: 0; }
.mbd-loc-tr .mbd-loc-td { border-bottom: 1px solid var(--mp-border-default); }
.mbd-loc-tr:last-child .mbd-loc-td { border-bottom: none; }
.mbd-loc-td { background: var(--mp-background-neutral); padding: 0; vertical-align: middle; }
.mbd-loc-td--sel:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }
.mbd-loc-td--qty { text-align: right; }
.mbd-loc-td--qty:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }
.mbd-loc-td--del { text-align: center; }
.mbd-loc-trigger { display: flex; align-items: center; height: 36px; padding: 0 var(--mp-spacing-2); gap: var(--mp-spacing-1); }
.mbd-loc-input {
  flex: 1; min-width: 0; height: 100%; border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default); font-family: inherit;
}
.mbd-loc-input::placeholder { color: var(--mp-text-placeholder); }
.mbd-loc-chevron { flex-shrink: 0; color: var(--mp-icon-default); }
.mbd-loc-qty-input {
  width: 100%; height: 36px; padding: 0 var(--mp-spacing-2); text-align: right;
  border: none; background: transparent; outline: none;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); font-family: inherit;
  color: var(--mp-text-default); font-variant-numeric: tabular-nums;
}
.mbd-loc-del-btn {
  display: flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; border: none; background: none; cursor: pointer; color: var(--mp-text-secondary);
}
.mbd-loc-del-btn:hover { color: var(--mp-text-danger, #dc2626); }
.mbd-loc-del-btn:disabled { opacity: 0.35; cursor: not-allowed; }

/* Footer */
.mbd-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
  background: var(--mp-background-stage);
}
</style>
