<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpAutocomplete, MpInput, MpTextarea, MpButton, MpIcon, MpInputTag, MpDatePicker,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpAccordion, MpAccordionHeader, MpAccordionIcon, MpAccordionItem, MpAccordionPanel,
  MpCheckbox,
  toast, css, type DataInterface,
} from '@mekari/pixel3'
import SelectProductDrawer, { type PickerProduct } from '~/components/patterns/SelectProductDrawer.vue'
import ManageBatchDrawer, { type CommittedBatch } from '~/components/patterns/ManageBatchDrawer.vue'
import ManageSerialDrawer, { type CommittedSerial } from '~/components/patterns/ManageSerialDrawer.vue'
import NumberFormatSettingsModal, { type NumberFormatConfig } from '~/components/patterns/NumberFormatSettingsModal.vue'
import LineBudgetCounter from '~/components/patterns/LineBudgetCounter.vue'
import { STOCK_ADJUSTMENT_LINE_CAP, STOCK_ADJUSTMENT_COUNTER_SHOW_FROM } from '~/utils/stockAdjustmentLimits'
import { warehouses } from '~/data/warehouses'
import { productBySku, PRODUCTS } from '~/data/inventory'
import { getWarehouseDetail, getLocationStock } from '~/data/warehouseDetails'
import { addAdjustment, accountOptions, stockAdjustments } from '~/data/stockAdjustments'
import { addWmsAdjustment } from '~/data/wmsStockAdjustments'
import { getStorageTree, findLocation, type LocNode } from '~/data/storageLocations'
import { getWarehouseOperators } from '~/data/warehouseTeam'
import { scrollToFirstError } from '~/utils/form'

const router = useRouter()
const route = useRoute()
const { t } = useLocale()
const { activeScenario } = useScenario()
const isWms = computed(() => activeScenario.value.startsWith('WMS'))

function toDisplayDate(iso: string) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
function toISODate(display: string) { const [d, m, y] = display.split('/'); return `${y}-${m}-${d}` }
const todayDisplay = toDisplayDate(new Date().toISOString().slice(0, 10))

// ── Warehouse + account options ─────────────────────────────────────────────────
// Default warehouse carries no real team/operations (excluded everywhere else too —
// receipts, orders, picking) so it's not a selectable stock-count target.
const warehouseOptions = computed(() => warehouses.filter(w => w.status === 'active' && !w.isDefault).map(w => ({ id: w.id, name: w.name })))
const realWarehouses = warehouses.filter(w => w.status === 'active' && !w.isDefault)
function warehouseName(id: string) { return warehouseOptions.value.find(w => w.id === id)?.name ?? '' }
// Assignee choices are scoped to the selected warehouse — only its Operators are valid.
const assigneeOptions = computed(() => getWarehouseOperators(warehouseId.value))
const acctOptions = accountOptions()

// ── Form state ───────────────────────────────────────────────────────────────────
const transactionDate = ref(todayDisplay)
const transactionDateError = ref(false)
const warehouseId = ref(realWarehouses[0]?.id ?? warehouseOptions.value[0]?.id ?? '')
const warehouseError = ref(false)
const accountId = ref(acctOptions.find(a => a.id === 'Inventory adjustment')?.id ?? acctOptions[0]?.id ?? '')
const tags = ref<DataInterface[]>([])
const memo = ref('')
const assigneeId = ref('')
const assigneeError = ref(false)
const assigneeLabel = computed(() => assigneeOptions.value.find(a => a.id === assigneeId.value)?.name ?? '')

// ── Warehouse stock (system on-hand, coherent with the warehouse detail page) ──────
const stock = computed(() => (warehouseId.value ? getWarehouseDetail(warehouseId.value)?.stock ?? [] : []))
const stockMap = computed(() => new Map(stock.value.map(s => [s.sku, s])))
function onHandFor(sku: string): number { return stockMap.value.get(sku)?.onHand ?? 0 }
function unitFor(sku: string): string { return stockMap.value.get(sku)?.unit ?? productBySku(sku)?.unit ?? '' }
function avgCostFor(sku: string): number { return productBySku(sku)?.averageCost ?? 0 }
function nameFor(sku: string): string { return stockMap.value.get(sku)?.name ?? productBySku(sku)?.name ?? sku }
function imgFor(sku: string): string | undefined { return productBySku(sku)?.img }
function descFor(sku: string): string | undefined { return productBySku(sku)?.desc }

// Products offered in the picker — the full product catalog (PRODUCTS). On-hand for
// a chosen product comes from this warehouse's stock (0 if it doesn't stock it yet).
const pickerProducts = computed<PickerProduct[]>(() =>
  PRODUCTS.map(p => ({ sku: p.sku, name: p.name, img: p.img, desc: p.desc })),
)

// ── Batch-tracking helpers ────────────────────────────────────────────────────────
const BATCH_CATS = new Set(['Green Beans', 'Roasted Beans'])
function isBatchTrackedSku(sku: string): boolean {
  const si = stockMap.value.get(sku)
  if (si) return (si.batches?.length ?? 0) > 0
  const p = productBySku(sku)
  return p ? BATCH_CATS.has(p.category) : false
}

const SERIAL_CATS = new Set(['Espresso Machine', 'Grinder', 'Equipment'])
function isSerialTrackedSku(sku: string): boolean {
  const si = stockMap.value.get(sku)
  if (si) return !!si.serials
  const p = productBySku(sku)
  return p ? SERIAL_CATS.has(p.category) : false
}

// ── Shared line budget (Stock Adjustment: pooled Product-Batch cap) ────────────────
// One shared 10,000-line pool across the whole document — a batch-tracked row
// contributes its committed batch count, everything else contributes exactly 1.
function productLineCount(sku: string, batchLines?: CommittedBatch[]): number {
  return isBatchTrackedSku(sku) ? (batchLines?.length ?? 0) : 1
}

// ── Product rows (each a counted product) ──────────────────────────────────────────
interface CountRow { sku: string; counted: string; countedError: boolean; avgMode: 'auto' | 'custom'; avgCostInput: string; batchLines?: CommittedBatch[]; serialLines?: string[] }
const rows = ref<CountRow[]>([])
const selectedSkus = computed(() => rows.value.map(r => r.sku))
function defaultAvgCostInput(sku: string): string {
  const cost = avgCostFor(sku)
  return cost > 0 ? cost.toLocaleString('id-ID') : ''
}

const drawerOpen = ref(false)
const batchDrawerRow = ref<CountRow | null>(null)
const batchDrawerOpen = computed({
  get: () => batchDrawerRow.value !== null,
  set: (v) => { if (!v) batchDrawerRow.value = null }
})
function openBatchDrawer(row: CountRow) { batchDrawerRow.value = row }
function saveBatchLines(batches: CommittedBatch[]) {
  if (!batchDrawerRow.value) return
  batchDrawerRow.value.batchLines = batches
}
// Rest-of-document line count with the currently-open drawer's own (pre-edit)
// contribution excluded, so the drawer's live working total isn't double-counted.
const batchDrawerBaseLines = computed(() =>
  batchDrawerRow.value ? usedLines.value - (batchDrawerRow.value.batchLines?.length ?? 0) : 0,
)
function batchHasCounts(row: CountRow): boolean {
  return (row.batchLines ?? []).some(b => b.counted !== null)
}
function batchTotalFor(row: CountRow): number {
  return (row.batchLines ?? []).reduce((s, b) => s + (b.counted ?? 0), 0)
}

const serialDrawerRow = ref<CountRow | null>(null)
const serialDrawerOpen = computed({
  get: () => serialDrawerRow.value !== null,
  set: (v) => { if (!v) serialDrawerRow.value = null }
})
function openSerialDrawer(row: CountRow) {
  if (row.counted.trim() === '') {
    toast.notify({ variant: 'error', title: t('Enter counted qty first') , maxWidth: 'max-content'})
    return
  }
  serialDrawerRow.value = row
}
function saveSerialLines(serials: CommittedSerial[]) {
  if (!serialDrawerRow.value) return
  serialDrawerRow.value.serialLines = serials.map(cs => cs.serial)
}
function serialHasCounts(row: CountRow): boolean {
  return (row.serialLines?.length ?? 0) > 0
}
function serialTotalFor(row: CountRow): number {
  return row.serialLines?.length ?? 0
}

function applyPicker(skus: string[]) {
  const existing = new Map(rows.value.map(r => [r.sku, r]))
  rows.value = skus.map(sku => existing.get(sku) ?? { sku, counted: '', countedError: false, avgMode: 'auto', avgCostInput: defaultAvgCostInput(sku) })
}
function removeRow(sku: string) { rows.value = rows.value.filter(r => r.sku !== sku) }

// Average cost per row: 'auto' shows the product's moving-average cost (read-only);
// 'custom' turns the cell into a "Rp"-prefixed input. Switch via the hover edit menu.
function onAvgInput(row: CountRow, ev: Event) {
  const input = ev.target as HTMLInputElement
  const digits = input.value.replace(/\D/g, '')
  row.avgCostInput = digits ? Number(digits).toLocaleString('id-ID') : ''
  nextTick(() => { input.setSelectionRange(input.value.length, input.value.length) })
}
function setAvgMode(row: CountRow, mode: 'auto' | 'custom') {
  row.avgMode = mode
  if (mode === 'custom' && row.avgCostInput === '') row.avgCostInput = defaultAvgCostInput(row.sku)
}
// ── Inline product swap (change a row's product without removing/re-adding) ────────
const swapSearch = ref('')
function swapProductSku(row: CountRow, newSku: string) {
  row.sku = newSku
  row.counted = ''
  row.countedError = false
  row.avgMode = 'auto'
  row.avgCostInput = defaultAvgCostInput(newSku)
  row.batchLines = undefined
  row.serialLines = undefined
}
function swapCandidates(currentSku: string): PickerProduct[] {
  const used = new Set(rows.value.map(r => r.sku))
  const q = swapSearch.value.trim().toLowerCase()
  return pickerProducts.value.filter(p =>
    (p.sku === currentSku || !used.has(p.sku)) &&
    (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)))
}

function onCountedInput(row: CountRow, ev: Event) {
  const input = ev.target as HTMLInputElement
  const digits = input.value.replace(/\D/g, '')
  row.counted = digits ? Number(digits).toLocaleString('id-ID') : ''
  row.countedError = false
  nextTick(() => { input.setSelectionRange(input.value.length, input.value.length) })
}
function parseCounted(val: string): number {
  return Number(val.replace(/\./g, '')) || 0
}
function isCounted(row: CountRow) {
  if (isBatchTrackedSku(row.sku)) return batchHasCounts(row)
  return row.counted.trim() !== ''
}
function differenceOf(row: CountRow): number | null {
  if (isBatchTrackedSku(row.sku)) {
    if (!batchHasCounts(row)) return null
    return batchTotalFor(row) - onHandFor(row.sku)
  }
  return isCounted(row) ? parseCounted(row.counted) - onHandFor(row.sku) : null
}
function diffLabel(row: CountRow): string {
  const d = differenceOf(row)
  if (d === null) return t('Uncounted')
  return d > 0 ? `+${d.toLocaleString('id-ID')}` : d.toLocaleString('id-ID')
}

// ── Count progress + search filters ────────────────────────────────────────────────
type Progress = '' | 'counted' | 'uncounted'
const progress = ref<Progress>('')
const progressOptions: { value: Progress; label: string }[] = [
  { value: 'counted', label: t('Counted') },
  { value: 'uncounted', label: t('Uncounted') },
]
// Default (all items) shows the field name "Count progress" as a placeholder.
const progressLabel = computed(() => progress.value === '' ? t('Count progress') : (progressOptions.find(o => o.value === progress.value)?.label ?? t('Count progress')))
const search = ref('')
const displayRows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return rows.value.filter(r => {
    if (progress.value === 'counted' && !isCounted(r)) return false
    if (progress.value === 'uncounted' && isCounted(r)) return false
    if (q && !nameFor(r.sku).toLowerCase().includes(q) && !r.sku.toLowerCase().includes(q)) return false
    return true
  })
})
function importProducts() { /* bulk import — not built in this prototype */ }
function printStockCard() { /* print stock card — not built in this prototype */ }

// ── Transaction no. settings (auto-numbering) — shared global component ────────
const noSettingsOpen = ref(false)
const nextTxNo = computed(() => `Stock Count #${stockAdjustments.reduce((m, a) => a.number.startsWith('Stock Count') ? Math.max(m, Number((a.number.match(/(\d+)/) || [])[1] || 0)) : m, 0) + 1}`)
const txNoFormats = [{ label: t('Auto'), value: 'auto' }]
function onNoFormatSave(_config: NumberFormatConfig) { noSettingsOpen.value = false }

// ── Tags ─────────────────────────────────────────────────────────────────────────
function onTagsChange(data: DataInterface[]) { tags.value = data }
function tagStrings(): string[] { return tags.value.map(t => String(t.text ?? t.value ?? '')).map(s => s.trim()).filter(Boolean) }

// ── Attachment ─────────────────────────────────────────────────────────────────────
const fileInput = ref<HTMLInputElement | null>(null)
const attachedFiles = ref<File[]>([])
function onFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  if (input.files) for (const f of Array.from(input.files)) {
    if (!attachedFiles.value.some(x => x.name === f.name)) attachedFiles.value.push(f)
  }
  if (fileInput.value) fileInput.value.value = ''
}
function removeFile(name: string) { attachedFiles.value = attachedFiles.value.filter(f => f.name !== name) }

// ── Navigation + save ──────────────────────────────────────────────────────────────
const fromStockCounts = computed(() => route.query.from === 'stock-counts')
function goBack() {
  if (fromStockCounts.value) { router.push('/stock-counts'); return }
  router.push(isWms.value ? '/cycle-counts' : '/stock-adjustments')
}
const formError = ref('')
const isSaving = ref(false)
async function handleSave() {
  formError.value = ''
  let valid = true
  if (!transactionDate.value) { transactionDateError.value = true; valid = false }
  if (!warehouseId.value) { warehouseError.value = true; valid = false }
  if (isWms.value && !assigneeId.value) { assigneeError.value = true; valid = false }
  if (hasStorageLocs.value) {
    if (!selectedLocations.value.length || !selectedLocations.value.some(l => l.rows.length)) {
      formError.value = t('You must select at least one location with products to count')
      valid = false
    }
    for (const loc of selectedLocations.value) {
      for (const r of loc.rows) {
        if (!isSerialTrackedSku(r.sku) || !r.counted.trim()) continue
        const expected = parseCounted(r.counted)
        const actual = r.serialLines?.length ?? 0
        if (actual !== expected) {
          formError.value = `${t('Enter all serial numbers for')} "${nameFor(r.sku)}" (${actual}/${expected} ${t('entered')})`
          valid = false
        }
      }
    }
  } else {
    if (!rows.value.length) { formError.value = t('You must add at least one product to count'); valid = false }
    for (const r of rows.value) {
      if (!isSerialTrackedSku(r.sku) || !r.counted.trim()) continue
      const expected = parseCounted(r.counted)
      const actual = r.serialLines?.length ?? 0
      if (actual !== expected) {
        formError.value = `${t('Enter all serial numbers for')} "${nameFor(r.sku)}" (${actual}/${expected} ${t('entered')})`
        valid = false
      }
    }
  }
  if (!valid) { scrollToFirstError(); return }
  isSaving.value = true
  await new Promise(r => setTimeout(r, 600))

  let lines: { sku: string; qty: number }[]

  if (hasStorageLocs.value) {
    lines = []
    for (const loc of selectedLocations.value) {
      for (const r of loc.rows) {
        // WMS cycle count task: store 0 — actual counting happens on the counting page.
        const qty = isWms.value
          ? 0
          : (isBatchTrackedSku(r.sku)
            ? (locBatchHasCounts(r) ? locBatchTotalFor(r) : r.onHand)
            : (r.counted.trim() ? parseCounted(r.counted) : r.onHand))
        lines.push({ sku: r.sku, qty })
      }
    }
  } else {
    // Store each line's counted qty (uncounted rows default to on-hand = no change).
    // WMS cycle count task: store 0 — actual counting happens on the counting page.
    lines = rows.value.map(r => ({
      sku: r.sku,
      qty: isWms.value
        ? 0
        : (isBatchTrackedSku(r.sku)
          ? (batchHasCounts(r) ? batchTotalFor(r) : onHandFor(r.sku))
          : (isCounted(r) ? parseCounted(r.counted) : onHandFor(r.sku)))
    }))
  }

  const input = {
    kind: 'count' as const,
    date: toISODate(transactionDate.value),
    warehouseId: warehouseId.value,
    warehouseName: warehouseName(warehouseId.value),
    category: 'Stock count' as const,
    tags: tagStrings(),
    memo: memo.value.trim() || undefined,
    lines,
    ...(isWms.value ? { assignee: assigneeLabel.value || undefined } : {}),
  }
  if (isWms.value) {
    const adj = addWmsAdjustment(input)
    toast.notify({ variant: 'success', title: t('Cycle count saved'), maxWidth: 'max-content' })
    router.push(`/cycle-counts/${adj.id}`)
  } else {
    const adj = addAdjustment(input)
    toast.notify({ variant: 'success', title: t('Stock count saved'), maxWidth: 'max-content' })
    router.push(`/stock-adjustments/${adj.id}`)
  }
}

// ── Storage-location mode ────────────────────────────────────────────────────────
interface LocRow { sku: string; onHand: number; counted: string; countedError: boolean; isAuto: boolean; avgMode: 'auto' | 'custom'; avgCostInput: string; batchLines?: CommittedBatch[]; serialLines?: string[] }
interface LocEntry {
  locId: string; fullPath: string
  skuStart: number; skuQty: number
  rows: LocRow[]; productDrawerOpen: boolean
}

const hasStorageLocs = computed(() => getStorageTree(warehouseId.value).length > 0)
const locationDrawerOpen = ref(false)
const selectedLocations = ref<LocEntry[]>([])
watch(warehouseId, () => { selectedLocations.value = []; assigneeId.value = '' })

const usedLines = computed(() => hasStorageLocs.value
  ? selectedLocations.value.reduce((sum, loc) => sum + loc.rows.reduce((s, r) => s + productLineCount(r.sku, r.batchLines), 0), 0)
  : rows.value.reduce((s, r) => s + productLineCount(r.sku, r.batchLines), 0))
const atLineCap = computed(() => usedLines.value >= STOCK_ADJUSTMENT_LINE_CAP)

// Builds location groups directly from a flat SKU list (used for preselect deep-links,
// e.g. from Cycle count recommendations) — the location-grouped table is the only mode.
function rebuildLocsBySkus(skus: string[]) {
  if (!skus.length) { selectedLocations.value = []; return }
  const wh = getWarehouseDetail(warehouseId.value)
  if (!wh) { selectedLocations.value = []; return }
  const allFlat = flatStorageNodes()
  const locMap = new Map<string, LocEntry>()
  for (const sku of skus) {
    const stockIdx = wh.stock.findIndex(s => s.sku === sku)
    const matchingNodes = stockIdx >= 0
      ? allFlat.filter(n => stockIdx >= n.skuStart && stockIdx < n.skuStart + n.skuQty)
      : []
    for (const node of matchingNodes) {
      if (!locMap.has(node.id)) {
        const fullPath = findLocation(warehouseId.value, node.id)?.path.map(n => n.name).join(' / ') ?? node.name
        locMap.set(node.id, { locId: node.id, fullPath, skuStart: node.skuStart, skuQty: node.skuQty, rows: [], productDrawerOpen: false })
      }
      const entry = locMap.get(node.id)!
      if (!entry.rows.some(r => r.sku === sku)) {
        const onHand = getLocationStock(warehouseId.value, node.skuStart, node.skuQty).find(s => s.sku === sku)?.onHand ?? 0
        entry.rows.push({ sku, onHand, counted: '', countedError: false, isAuto: false, avgMode: 'auto', avgCostInput: defaultAvgCostInput(sku) })
      }
    }
  }
  selectedLocations.value = [...locMap.values()]
}

interface FlatLoc { id: string; name: string; level: string; depth: number; skuStart: number; skuQty: number }
function flatStorageNodes(): FlatLoc[] {
  const result: FlatLoc[] = []
  const walk = (nodes: LocNode[], depth: number) => {
    for (const n of nodes) {
      if (n.type === 'Storage' && n.children.length === 0) result.push({ id: n.id, name: n.name, level: n.level, depth, skuStart: n.skuStart, skuQty: n.skuQty })
      walk(n.children, depth + 1)
    }
  }
  walk(getStorageTree(warehouseId.value), 0)
  return result
}

interface TreeDrawerItem { id: string; name: string; fullPath: string; depth: number; isLeaf: boolean; isExpanded: boolean; leafIds: string[] }

const locDrawerSel = ref<Set<string>>(new Set())
const locDrawerSearch = ref('')
const locDrawerExpanded = ref<Set<string>>(new Set())
watch(locationDrawerOpen, (o) => {
  if (o) {
    locDrawerSel.value = new Set(selectedLocations.value.map(l => l.locId))
    locDrawerSearch.value = ''
    // expand all nodes by default
    const expanded = new Set<string>()
    const walkExp = (nodes: LocNode[]) => {
      for (const n of nodes) {
        if (n.children.length > 0) { expanded.add(n.id); walkExp(n.children) }
      }
    }
    walkExp(getStorageTree(warehouseId.value))
    locDrawerExpanded.value = expanded
  }
})
function collectLeafIds(nodes: LocNode[]): string[] {
  const ids: string[] = []
  const walk = (ns: LocNode[]) => ns.forEach(n => n.children.length ? walk(n.children) : ids.push(n.id))
  walk(nodes)
  return ids
}
const locDrawerItems = computed((): TreeDrawerItem[] => {
  const q = locDrawerSearch.value.trim().toLowerCase()
  const result: TreeDrawerItem[] = []
  const walk = (nodes: LocNode[], depth: number, trail: string[]) => {
    for (const n of nodes) {
      const here = [...trail, n.name]
      const isLeaf = n.children.length === 0
      const fullPath = here.join(' / ')
      if (q) {
        // search mode: flat list of matching leaves
        if (isLeaf && fullPath.toLowerCase().includes(q))
          result.push({ id: n.id, name: n.name, fullPath, depth: 0, isLeaf: true, isExpanded: false, leafIds: [n.id] })
        else if (!isLeaf) walk(n.children, 0, here)
      } else {
        const isExpanded = locDrawerExpanded.value.has(n.id)
        const leafIds = isLeaf ? [n.id] : collectLeafIds(n.children)
        result.push({ id: n.id, name: n.name, fullPath, depth, isLeaf, isExpanded, leafIds })
        if (!isLeaf && isExpanded) walk(n.children, depth + 1, here)
      }
    }
  }
  walk(getStorageTree(warehouseId.value), 0, [])
  return result
})
function toggleLocDrawerSel(id: string) {
  const s = new Set(locDrawerSel.value)
  s.has(id) ? s.delete(id) : s.add(id)
  locDrawerSel.value = s
}
function toggleLocExpanded(id: string) {
  const s = new Set(locDrawerExpanded.value)
  s.has(id) ? s.delete(id) : s.add(id)
  locDrawerExpanded.value = s
}
function toggleParentSel(leafIds: string[]) {
  const s = new Set(locDrawerSel.value)
  const allSelected = leafIds.every(id => s.has(id))
  leafIds.forEach(id => allSelected ? s.delete(id) : s.add(id))
  locDrawerSel.value = s
}
function confirmLocSelection() {
  const all = flatStorageNodes()
  const existing = new Map(selectedLocations.value.map(l => [l.locId, l]))
  selectedLocations.value = [...locDrawerSel.value]
    .map(id => {
      if (existing.has(id)) return existing.get(id)!
      const node = all.find(n => n.id === id)
      if (!node) return null
      const stockItems = getLocationStock(warehouseId.value, node.skuStart, node.skuQty)
      const rows: LocRow[] = stockItems.map(s => ({ sku: s.sku, onHand: s.onHand, counted: '', countedError: false, isAuto: true, avgMode: 'auto', avgCostInput: defaultAvgCostInput(s.sku) }))
      const fullPath = findLocation(warehouseId.value, id)?.path.map(n => n.name).join(' / ') ?? node.name
      return { locId: id, fullPath, skuStart: node.skuStart, skuQty: node.skuQty, rows, productDrawerOpen: false }
    })
    .filter(Boolean) as LocEntry[]
  locationDrawerOpen.value = false
}

function removeLoc(locId: string) { selectedLocations.value = selectedLocations.value.filter(l => l.locId !== locId) }

const locBatchDrawerRow = ref<LocRow | null>(null)
const locBatchDrawerOpen = computed({
  get: () => locBatchDrawerRow.value !== null,
  set: (v) => { if (!v) locBatchDrawerRow.value = null }
})
function openLocBatchDrawer(row: LocRow) { locBatchDrawerRow.value = row }
function saveLocBatchLines(batches: CommittedBatch[]) {
  if (!locBatchDrawerRow.value) return
  locBatchDrawerRow.value.batchLines = batches
}
const locBatchDrawerBaseLines = computed(() =>
  locBatchDrawerRow.value ? usedLines.value - (locBatchDrawerRow.value.batchLines?.length ?? 0) : 0,
)
function locBatchHasCounts(row: LocRow): boolean {
  return (row.batchLines ?? []).some(b => b.counted !== null)
}
function locBatchTotalFor(row: LocRow): number {
  return (row.batchLines ?? []).reduce((s, b) => s + (b.counted ?? 0), 0)
}

const locSerialDrawerRow = ref<LocRow | null>(null)
const locSerialDrawerOpen = computed({
  get: () => locSerialDrawerRow.value !== null,
  set: (v) => { if (!v) locSerialDrawerRow.value = null }
})
function openLocSerialDrawer(row: LocRow) {
  if (row.counted.trim() === '') {
    toast.notify({ variant: 'error', title: t('Enter counted qty first') , maxWidth: 'max-content'})
    return
  }
  locSerialDrawerRow.value = row
}
function saveLocSerialLines(serials: CommittedSerial[]) {
  if (!locSerialDrawerRow.value) return
  locSerialDrawerRow.value.serialLines = serials.map(cs => cs.serial)
}

function locDiff(row: LocRow): number | null {
  if (isBatchTrackedSku(row.sku)) {
    if (!locBatchHasCounts(row)) return null
    return locBatchTotalFor(row) - row.onHand
  }
  if (!row.counted.trim()) return null
  return parseCounted(row.counted) - row.onHand
}
function locDiffLabel(row: LocRow): string {
  const d = locDiff(row)
  if (d === null) return t('Uncounted')
  return d > 0 ? `+${d.toLocaleString('id-ID')}` : d.toLocaleString('id-ID')
}
function onLocCountedInput(row: LocRow, ev: Event) {
  const input = ev.target as HTMLInputElement
  const digits = input.value.replace(/\D/g, '')
  row.counted = digits ? Number(digits).toLocaleString('id-ID') : ''
  row.countedError = false
  nextTick(() => { input.setSelectionRange(input.value.length, input.value.length) })
}
function onLocAvgInput(row: LocRow, ev: Event) {
  const input = ev.target as HTMLInputElement
  const digits = input.value.replace(/\D/g, '')
  row.avgCostInput = digits ? Number(digits).toLocaleString('id-ID') : ''
  nextTick(() => { input.setSelectionRange(input.value.length, input.value.length) })
}
function setLocAvgMode(row: LocRow, mode: 'auto' | 'custom') {
  row.avgMode = mode
  if (mode === 'custom' && row.avgCostInput === '') row.avgCostInput = defaultAvgCostInput(row.sku)
}
function isLocCounted(row: LocRow): boolean {
  if (isBatchTrackedSku(row.sku)) return locBatchHasCounts(row)
  return row.counted.trim() !== ''
}
function locDisplayRows(loc: LocEntry): LocRow[] {
  const q = search.value.trim().toLowerCase()
  return loc.rows.filter(r => {
    if (progress.value === 'counted' && !isLocCounted(r)) return false
    if (progress.value === 'uncounted' && isLocCounted(r)) return false
    if (q && !nameFor(r.sku).toLowerCase().includes(q) && !r.sku.toLowerCase().includes(q)) return false
    return true
  })
}
function removeLocRow(loc: LocEntry, sku: string) { loc.rows = loc.rows.filter(r => r.sku !== sku) }
function addProductsToLoc(loc: LocEntry, skus: string[]) {
  const existingSkus = new Set(loc.rows.map(r => r.sku))
  for (const sku of skus) {
    if (!existingSkus.has(sku)) {
      const onHand = getLocationStock(warehouseId.value, loc.skuStart, loc.skuQty).find(s => s.sku === sku)?.onHand ?? 0
      loc.rows.push({ sku, onHand, counted: '', countedError: false, isAuto: false, avgMode: 'auto', avgCostInput: defaultAvgCostInput(sku) })
    }
  }
  loc.productDrawerOpen = false
}

function productsForLoc(loc: LocEntry): PickerProduct[] {
  return getLocationStock(warehouseId.value, loc.skuStart, loc.skuQty).map(s => {
    const p = productBySku(s.sku)
    return { sku: s.sku, name: p?.name ?? s.sku, img: p?.img, desc: p?.desc }
  })
}
function swapLocProductSku(loc: LocEntry, row: LocRow, newSku: string) {
  row.sku = newSku
  row.onHand = getLocationStock(warehouseId.value, loc.skuStart, loc.skuQty).find(s => s.sku === newSku)?.onHand ?? 0
  row.counted = ''
  row.countedError = false
  row.isAuto = false
  row.avgMode = 'auto'
  row.avgCostInput = defaultAvgCostInput(newSku)
  row.batchLines = undefined
  row.serialLines = undefined
}
function locSwapCandidates(loc: LocEntry, currentSku: string): PickerProduct[] {
  const used = new Set(loc.rows.map(r => r.sku))
  const q = swapSearch.value.trim().toLowerCase()
  return productsForLoc(loc).filter(p =>
    (p.sku === currentSku || !used.has(p.sku)) &&
    (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)))
}

// ── Sticky footer divider ────────────────────────────────────────────────────────
const stageEl = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)
function checkStageOverflow() { const el = stageEl.value; if (el) stageOverflowing.value = el.scrollHeight > el.clientHeight + 1 }
let stageObserver: ResizeObserver | null = null
onMounted(() => nextTick(() => {
  checkStageOverflow()
  stageObserver = new ResizeObserver(checkStageOverflow)
  if (stageEl.value) { stageObserver.observe(stageEl.value); stageEl.value.addEventListener('scroll', checkStageOverflow, { passive: true }) }
}))
onUnmounted(() => { stageObserver?.disconnect() })

// Pre-fill from Cycle count recommendations (query: warehouse, preselect)
onMounted(() => {
  const warehouseParam = route.query.warehouse as string | undefined
  if (warehouseParam && warehouseOptions.value.find(w => w.id === warehouseParam)) {
    warehouseId.value = warehouseParam
  }
  const preselectParam = route.query.preselect as string | undefined
  if (preselectParam) {
    const skus = preselectParam.split(',').filter(Boolean)
    nextTick(() => {
      if (hasStorageLocs.value) {
        rebuildLocsBySkus(skus)
      } else {
        applyPicker(skus)
      }
    })
  }
})
</script>

<template>
  <div class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goBack">{{ fromStockCounts ? t('All stock counts') : isWms ? t('Cycle counts') : t('All stock adjustments') }}</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ t('New stock count') }}</h1>
        </div>
      </div>
    </header>

    <div ref="stageEl" class="detail-stage">
      <div class="scf-body">

        <!-- Header fields -->
        <div class="scf-form-grid">
          <MpFormControl id="scf-txdate" class="scf-f-date" is-required :is-invalid="transactionDateError">
            <MpFormLabel>{{ t('Transaction date') }}</MpFormLabel>
            <div class="scf-datepicker">
              <MpDatePicker id="scf-txdate-dp" v-model="transactionDate" format="DD/MM/YYYY" value-type="format" use-portal @update:model-value="transactionDateError = false" />
            </div>
            <MpFormErrorMessage>{{ t('You must select transaction date') }}</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl id="scf-transno" class="scf-f-transno">
            <div class="scf-label-row">
              <MpFormLabel>{{ t('Transaction no.') }}</MpFormLabel>
              <button type="button" class="scf-label-icon" :aria-label="t('Transaction no. settings')" @click="noSettingsOpen = true"><MpIcon name="settings" size="sm" /></button>
            </div>
            <MpInput id="scf-transno-input" model-value="" :placeholder="t('[Auto]')" is-full-width is-disabled />
          </MpFormControl>

          <MpFormControl v-if="!isWms" id="scf-tags" class="scf-f-tags">
            <MpFormLabel>{{ t('Tags') }}</MpFormLabel>
            <MpInputTag id="scf-tags-input" :placeholder="t('Select tag')" :data="tags" :is-enable-create-new-tag="true" :is-show-suggestions="false" @change="onTagsChange" />
          </MpFormControl>

          <MpFormControl id="scf-warehouse" class="scf-f-warehouse" is-required :is-invalid="warehouseError">
            <MpFormLabel>{{ t('Warehouse') }}</MpFormLabel>
            <MpAutocomplete id="scf-warehouse-ac" v-model="warehouseId" :data="warehouseOptions" label-prop="name" value-prop="id" is-searchable use-portal is-full-width :is-invalid="warehouseError" @update:model-value="warehouseError = false" />
            <MpFormErrorMessage>{{ t('You must select warehouse') }}</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl v-if="!isWms" id="scf-account" class="scf-f-account">
            <MpFormLabel>{{ t('Account') }}</MpFormLabel>
            <MpAutocomplete id="scf-account-ac" v-model="accountId" :data="acctOptions" label-prop="name" value-prop="id" is-searchable use-portal is-full-width />
          </MpFormControl>

          <MpFormControl v-if="isWms" id="scf-assignee" class="scf-f-assignee" is-required :is-invalid="assigneeError">
            <MpFormLabel>{{ t('Assignee') }}</MpFormLabel>
            <MpAutocomplete id="scf-assignee-ac" v-model="assigneeId" :data="assigneeOptions" label-prop="name" value-prop="id" is-searchable use-portal is-full-width :placeholder="t('Select assignee')" :is-invalid="assigneeError" @update:model-value="assigneeError = false" />
            <MpFormErrorMessage>{{ t('You must select assignee') }}</MpFormErrorMessage>
          </MpFormControl>

        </div>

        <!-- Product table toolbar -->
        <div class="scf-table-toolbar">
          <LineBudgetCounter :used="usedLines" :cap="STOCK_ADJUSTMENT_LINE_CAP" :show-from="STOCK_ADJUSTMENT_COUNTER_SHOW_FROM" />
          <MpPopover v-if="!isWms" id="scf-progress" is-close-on-select>
            <MpPopoverTrigger>
              <button class="scf-progress-btn" :class="{ 'scf-progress-btn--placeholder': progress === '' }" type="button">
                {{ progressLabel }}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
              <MpPopoverList>
                <MpPopoverListItem v-for="o in progressOptions" :key="o.value" :is-active="o.value === progress" @click="progress = o.value">{{ o.label }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>

          <div class="scf-toolbar-right">
            <div class="scf-search">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              <input v-model="search" class="scf-search-input" type="text" :placeholder="t('Search...')" />
              <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
            <button class="scf-import-btn" type="button" @click="importProducts">{{ t('Import') }}</button>
          </div>
        </div>

        <!-- Storage location mode -->
        <template v-if="hasStorageLocs">
          <div class="scf-loc-banner">
            {{ t('This warehouse uses storage locations. Select a location before making adjustments.') }}
          </div>
          <div class="scf-loc-actions">
            <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" type="button" @click="locationDrawerOpen = true">
              <MpIcon name="add" size="sm" />
              {{ t('Select location') }}
            </button>
          </div>

          <MpAccordion is-allow-multiple is-allow-toggle class="scf-loc-accordions">
            <MpAccordionItem
              v-for="loc in selectedLocations"
              :key="loc.locId"
              :id="`scf-acc-${loc.locId}`"
              is-default-open
              icon-position="start"
            >
              <MpAccordionHeader>
                <MpAccordionIcon />
                <span class="scf-acc-label">{{ loc.fullPath }}</span>
                <button class="scf-acc-remove" type="button" :aria-label="t('Remove location')" @click.stop="removeLoc(loc.locId)">
                  <MpIcon name="minus-circular" size="sm" />
                </button>
              </MpAccordionHeader>
              <MpAccordionPanel>
              <div class="scf-acc-body">
                <div class="scf-table-scroll">
                  <table class="scf-table scf-table--loc">
                    <colgroup>
                      <col class="scf-col-prod" />
                      <col class="scf-col-sku" />
                      <col class="scf-col-onhand" />
                      <col class="scf-col-counted" />
                      <col class="scf-col-diff" />
                      <col class="scf-col-unit" />
                      <col class="scf-col-avg" />
                      <col class="scf-col-del" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th class="scf-th">{{ t('Product') }}</th>
                        <th class="scf-th">{{ t('SKU') }}</th>
                        <th class="scf-th scf-th--num">{{ t('On hand qty') }}</th>
                        <th class="scf-th">{{ t('Counted qty') }}</th>
                        <th class="scf-th scf-th--num">{{ t('Difference') }}</th>
                        <th class="scf-th">{{ t('Unit') }}</th>
                        <th class="scf-th">{{ t('Average cost') }}</th>
                        <th class="scf-th scf-th--del" />
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in locDisplayRows(loc)" :key="row.sku" class="scf-tr">
                        <td class="scf-td scf-td--prod">
                          <MpPopover :id="`scf-loc-swap-${loc.locId}-${row.sku}`" is-close-on-select use-portal placement="bottom-start" @update:is-open="(v: boolean) => { if (v) swapSearch = '' }">
                            <MpPopoverTrigger as-child>
                              <button type="button" class="scf-prod scf-prod--swap">
                                <img v-if="imgFor(row.sku)" class="scf-thumb" :src="imgFor(row.sku)" :alt="nameFor(row.sku)" loading="lazy" />
                                <span v-else class="scf-thumb scf-thumb--empty" />
                                <span class="scf-prod-info">
                                  <span class="scf-prod-name">{{ nameFor(row.sku) }}</span>
                                  <span v-if="descFor(row.sku)" class="scf-prod-desc">{{ descFor(row.sku) }}</span>
                                </span>
                                <MpIcon name="chevrons-down" size="sm" class="scf-prod-chevron" />
                              </button>
                            </MpPopoverTrigger>
                            <MpPopoverContent :class="css({ width: '280px', maxHeight: '320px', overflowY: 'auto', padding: '0' })">
                              <div class="scf-swap-search">
                                <input v-model="swapSearch" type="text" :placeholder="t('Search...')" />
                              </div>
                              <MpPopoverList>
                                <MpPopoverListItem
                                  v-for="p in locSwapCandidates(loc, row.sku)" :key="p.sku"
                                  :is-active="p.sku === row.sku"
                                  @click="swapLocProductSku(loc, row, p.sku)"
                                >{{ p.name }} <span class="scf-swap-sku">{{ p.sku }}</span></MpPopoverListItem>
                              </MpPopoverList>
                            </MpPopoverContent>
                          </MpPopover>
                        </td>
                        <td class="scf-td scf-td--muted">{{ row.sku }}</td>
                        <td class="scf-td scf-td--num">{{ row.onHand.toLocaleString('id-ID') }}</td>
                        <!-- batch-tracked SKU -->
                        <td v-if="isBatchTrackedSku(row.sku)" class="scf-td scf-td--counted-batch scf-td--active">
                          <div class="scf-qty-stack">
                            <span v-if="locBatchHasCounts(row)" class="scf-batch-total">{{ locBatchTotalFor(row).toLocaleString('id-ID') }}</span>
                            <button class="scf-manage-btn" type="button" @click="openLocBatchDrawer(row)">{{ t('Manage batch') }}</button>
                          </div>
                        </td>
                        <td v-else-if="isSerialTrackedSku(row.sku)" class="scf-td scf-td--counted-batch scf-td--active">
                          <div class="scf-qty-stack">
                            <input
                              :id="`scf-loc-counted-${loc.locId}-${row.sku}`"
                              class="scf-qty-input"
                              type="text"
                              inputmode="numeric"
                              :value="row.counted"
                              placeholder="0"
                              @input="onLocCountedInput(row, $event)"
                            />
                            <button class="scf-manage-btn" type="button" @click="openLocSerialDrawer(row)">{{ t('Manage serial number') }}</button>
                          </div>
                        </td>
                        <!-- regular SKU -->
                        <td v-else class="scf-td scf-td--input">
                          <input :id="`scf-loc-counted-${loc.locId}-${row.sku}`" class="scf-qty-input" type="text" inputmode="numeric" :value="row.counted" placeholder="0" @input="onLocCountedInput(row, $event)" />
                        </td>
                        <td class="scf-td scf-td--num" :class="{ 'scf-diff--pos': (locDiff(row) ?? 0) > 0, 'scf-diff--neg': (locDiff(row) ?? 0) < 0, 'scf-diff--uncounted': locDiff(row) === null }">{{ locDiffLabel(row) }}</td>
                        <td class="scf-td scf-td--muted">{{ unitFor(row.sku) }}</td>
                        <td class="scf-td scf-td--avg scf-td--input">
                          <div class="scf-avg-wrap" :class="{ 'scf-avg-wrap--auto': row.avgMode !== 'custom' }">
                            <span class="scf-avg-prefix">Rp</span>
                            <input
                              class="scf-avg-num"
                              type="text"
                              inputmode="numeric"
                              :value="row.avgMode === 'custom' ? row.avgCostInput : defaultAvgCostInput(row.sku)"
                              placeholder="0"
                              :disabled="row.avgMode !== 'custom'"
                              @input="onLocAvgInput(row, $event)"
                            />
                            <MpPopover :id="`scf-loc-avg-${loc.locId}-${row.sku}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                              <MpPopoverTrigger>
                                <button class="scf-avg-edit" type="button" :aria-label="t('Edit average cost')"><MpIcon name="edit" size="sm" /></button>
                              </MpPopoverTrigger>
                              <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
                                <MpPopoverList>
                                  <MpPopoverListItem :is-active="row.avgMode === 'auto'" @click="setLocAvgMode(row, 'auto')">{{ t('Auto-calculate') }}</MpPopoverListItem>
                                  <MpPopoverListItem :is-active="row.avgMode === 'custom'" @click="setLocAvgMode(row, 'custom')">{{ t('Custom') }}</MpPopoverListItem>
                                </MpPopoverList>
                              </MpPopoverContent>
                            </MpPopover>
                          </div>
                        </td>
                        <td class="scf-td scf-td--del">
                          <button class="scf-del-btn" type="button" @click="removeLocRow(loc, row.sku)"><MpIcon name="minus-circular" size="sm" /></button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p class="scf-showing">{{ t('Showing') }} {{ locDisplayRows(loc).length }} {{ t('of') }} {{ loc.rows.length }} {{ t('products') }}</p>
                <button class="scf-add-btn" type="button" :disabled="atLineCap" @click="loc.productDrawerOpen = true">
                  <MpIcon name="add" size="sm" /> {{ t('Select product') }}
                </button>
                <p v-if="atLineCap" class="scf-limit-msg">{{ t('Maximum 10.000 lines reached. Remove a product or batch to add more') }}</p>

                <!-- Product drawer per location -->
                <SelectProductDrawer
                  v-model:open="loc.productDrawerOpen"
                  :products="productsForLoc(loc)"
                  :model-value="loc.rows.map(r => r.sku)"
                  @save="skus => addProductsToLoc(loc, skus)"
                />
              </div>
              </MpAccordionPanel>
            </MpAccordionItem>
          </MpAccordion>

          <p v-if="formError" class="scf-form-error">{{ formError }}</p>
        </template>

        <!-- Existing flat-table (non-storage-location warehouses) -->
        <div v-else class="scf-table-section">
          <div class="scf-table-scroll">
            <table class="scf-table">
              <colgroup>
                <col class="scf-col-prod" /><col class="scf-col-sku" /><col class="scf-col-onhand" /><col class="scf-col-counted" /><col class="scf-col-diff" /><col class="scf-col-unit" /><col class="scf-col-avg" /><col class="scf-col-del" />
              </colgroup>
              <thead>
                <tr>
                  <th class="scf-th">{{ t('Product') }}</th>
                  <th class="scf-th">{{ t('SKU') }}</th>
                  <th class="scf-th scf-th--num">{{ t('On hand qty') }}</th>
                  <th class="scf-th">{{ t('Counted qty') }}</th>
                  <th class="scf-th scf-th--num">{{ t('Difference') }}</th>
                  <th class="scf-th">{{ t('Unit') }}</th>
                  <th class="scf-th">{{ t('Average cost') }}</th>
                  <th class="scf-th scf-th--del" />
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in displayRows" :key="row.sku" class="scf-tr">
                  <td class="scf-td scf-td--prod">
                    <MpPopover :id="`scf-swap-${row.sku}`" is-close-on-select use-portal placement="bottom-start" @update:is-open="(v: boolean) => { if (v) swapSearch = '' }">
                      <MpPopoverTrigger as-child>
                        <button type="button" class="scf-prod scf-prod--swap">
                          <img v-if="imgFor(row.sku)" class="scf-thumb" :src="imgFor(row.sku)" :alt="nameFor(row.sku)" loading="lazy" />
                          <span v-else class="scf-thumb scf-thumb--empty" />
                          <span class="scf-prod-info">
                            <span class="scf-prod-name">{{ nameFor(row.sku) }}</span>
                            <span v-if="descFor(row.sku)" class="scf-prod-desc">{{ descFor(row.sku) }}</span>
                          </span>
                          <MpIcon name="chevrons-down" size="sm" class="scf-prod-chevron" />
                        </button>
                      </MpPopoverTrigger>
                      <MpPopoverContent :class="css({ width: '280px', maxHeight: '320px', overflowY: 'auto', padding: '0' })">
                        <div class="scf-swap-search">
                          <input v-model="swapSearch" type="text" :placeholder="t('Search...')" />
                        </div>
                        <MpPopoverList>
                          <MpPopoverListItem
                            v-for="p in swapCandidates(row.sku)" :key="p.sku"
                            :is-active="p.sku === row.sku"
                            @click="swapProductSku(row, p.sku)"
                          >{{ p.name }} <span class="scf-swap-sku">{{ p.sku }}</span></MpPopoverListItem>
                        </MpPopoverList>
                      </MpPopoverContent>
                    </MpPopover>
                  </td>
                  <td class="scf-td scf-td--muted">{{ row.sku }}</td>
                  <td class="scf-td scf-td--num">{{ onHandFor(row.sku).toLocaleString('id-ID') }}</td>
                  <!-- batch-tracked SKU -->
                  <td v-if="isBatchTrackedSku(row.sku)" class="scf-td scf-td--counted-batch scf-td--active">
                    <div class="scf-qty-stack">
                      <span v-if="batchHasCounts(row)" class="scf-batch-total">{{ batchTotalFor(row).toLocaleString('id-ID') }}</span>
                      <button class="scf-manage-btn" type="button" @click="openBatchDrawer(row)">{{ t('Manage batch') }}</button>
                    </div>
                  </td>
                  <td v-else-if="isSerialTrackedSku(row.sku)" class="scf-td scf-td--counted-batch scf-td--active">
                    <div class="scf-qty-stack">
                      <input
                        :id="`scf-counted-${row.sku}`"
                        class="scf-qty-input"
                        type="text"
                        inputmode="numeric"
                        :value="row.counted"
                        placeholder="0"
                        @input="onCountedInput(row, $event)"
                      />
                      <button class="scf-manage-btn" type="button" @click="openSerialDrawer(row)">{{ t('Manage serial number') }}</button>
                    </div>
                  </td>
                  <!-- regular SKU (existing behavior unchanged) -->
                  <td v-else class="scf-td scf-td--input">
                    <input :id="`scf-counted-${row.sku}`" class="scf-qty-input" type="text" inputmode="numeric" :value="row.counted" placeholder="0" @input="onCountedInput(row, $event)" />
                  </td>
                  <td class="scf-td scf-td--num" :class="{ 'scf-diff--pos': (differenceOf(row) ?? 0) > 0, 'scf-diff--neg': (differenceOf(row) ?? 0) < 0, 'scf-diff--uncounted': differenceOf(row) === null }">{{ diffLabel(row) }}</td>
                  <td class="scf-td scf-td--muted">{{ unitFor(row.sku) }}</td>
                  <td class="scf-td scf-td--avg scf-td--input">
                    <div class="scf-avg-wrap" :class="{ 'scf-avg-wrap--auto': row.avgMode !== 'custom' }">
                      <span class="scf-avg-prefix">Rp</span>
                      <input
                        class="scf-avg-num"
                        type="text"
                        inputmode="numeric"
                        :value="row.avgMode === 'custom' ? row.avgCostInput : defaultAvgCostInput(row.sku)"
                        placeholder="0"
                        :disabled="row.avgMode !== 'custom'"
                        @input="onAvgInput(row, $event)"
                      />
                      <MpPopover :id="`scf-avg-${row.sku}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                        <MpPopoverTrigger>
                          <button class="scf-avg-edit" type="button" :aria-label="t('Edit average cost')"><MpIcon name="edit" size="sm" /></button>
                        </MpPopoverTrigger>
                        <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
                          <MpPopoverList>
                            <MpPopoverListItem :is-active="row.avgMode === 'auto'" @click="setAvgMode(row, 'auto')">{{ t('Auto-calculate') }}</MpPopoverListItem>
                            <MpPopoverListItem :is-active="row.avgMode === 'custom'" @click="setAvgMode(row, 'custom')">{{ t('Custom') }}</MpPopoverListItem>
                          </MpPopoverList>
                        </MpPopoverContent>
                      </MpPopover>
                    </div>
                  </td>
                  <td class="scf-td scf-td--del">
                    <button class="scf-del-btn" type="button" :aria-label="t('Remove product')" @click="removeRow(row.sku)"><MpIcon name="minus-circular" size="sm" /></button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="scf-showing">{{ t('Showing') }} {{ displayRows.length }} {{ t('of') }} {{ rows.length }} {{ t('products') }}</p>
          <button class="scf-add-btn" type="button" :disabled="atLineCap" @click="drawerOpen = true">
            <MpIcon name="add" size="sm" /> {{ t('Select product') }}
          </button>
          <p v-if="atLineCap" class="scf-limit-msg">{{ t('Maximum 10.000 lines reached. Remove a product or batch to add more') }}</p>
          <p v-if="formError" class="scf-form-error">{{ formError }}</p>
        </div>

        <!-- Memo -->
        <div class="scf-section scf-section--gap-top">
          <MpFormControl id="scf-memo">
            <MpFormLabel>{{ t('Memo') }}</MpFormLabel>
            <MpTextarea id="scf-memo-textarea" v-model="memo" is-full-width :rows="4" />
          </MpFormControl>
          <p class="scf-helper-text">{{ t('Only visible to you and your team') }}</p>
        </div>

        <!-- Attachment -->
        <div class="scf-section scf-section--last">
          <div class="scf-section-label">{{ t('Attachment') }}</div>
          <div class="scf-attachment">
            <input ref="fileInput" type="file" multiple accept=".xls,.xlsx,.doc,.docx,.pdf,.jpg,.jpeg,.png,.zip" class="scf-file-hidden" @change="onFileChange" />
            <div class="scf-attachment-row">
              <MpButton variant="secondary" size="sm" is-rounded @click="fileInput?.click()">{{ t('Choose file') }}</MpButton>
              <span class="scf-attach-or">{{ t('or drag and drop here') }}</span>
            </div>
            <p class="scf-helper-text">{{ t('File must be in XLS, DOC, PDF, JPG, PNG, or ZIP with a maximum of 10 MB and 5 files per transaction') }}</p>
            <ul v-if="attachedFiles.length" class="scf-file-list">
              <li v-for="f in attachedFiles" :key="f.name" class="scf-file-item">
                <span class="scf-file-name">{{ f.name }}</span>
                <button class="scf-file-remove" type="button" @click="removeFile(f.name)"><MpIcon name="close" size="xs" /></button>
              </li>
            </ul>
          </div>
        </div>

      </div>
    </div>

    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <button class="btn-enterprise btn-enterprise--ghost" @click="goBack">{{ t('Cancel') }}</button>
      <button class="btn-enterprise btn-enterprise--primary" :disabled="isSaving" @click="handleSave">{{ isSaving ? t('Saving…') : t('Save') }}</button>
    </footer>

    <SelectProductDrawer v-model:open="drawerOpen" :products="pickerProducts" :model-value="selectedSkus" @save="applyPicker" />

    <!-- Select locations drawer -->
    <Transition name="scf-loc">
      <div v-if="locationDrawerOpen" class="loc-spd-overlay" @click.self="locationDrawerOpen = false">
        <div class="loc-spd-panel" role="dialog" :aria-label="t('Select locations')">
          <div class="loc-spd-header">
            <span class="loc-spd-title">{{ t('Select locations') }}</span>
            <button class="loc-spd-close" type="button" @click="locationDrawerOpen = false"><MpIcon name="close" size="sm" /></button>
          </div>
          <div class="loc-spd-search-wrap">
            <input v-model="locDrawerSearch" class="loc-spd-search-input" type="text" :placeholder="t('Search...')" />
            <button v-if="locDrawerSearch" class="search-clear-btn search-clear-btn--overlay" type="button" :aria-label="t('Clear search')" @click="locDrawerSearch = ''">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="loc-spd-list">
            <template v-for="node in locDrawerItems" :key="node.id">
              <div v-if="!node.isLeaf"
                class="loc-drawer-item loc-drawer-item--parent"
                :style="{ paddingLeft: `${16 + node.depth * 20}px` }"
              >
                <span class="loc-drawer-chevron" :class="{ 'loc-drawer-chevron--open': node.isExpanded }" @click="toggleLocExpanded(node.id)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </span>
                <MpCheckbox
                  :is-checked="node.leafIds.every(id => locDrawerSel.has(id))"
                  :is-indeterminate="node.leafIds.some(id => locDrawerSel.has(id)) && !node.leafIds.every(id => locDrawerSel.has(id))"
                  @change="toggleParentSel(node.leafIds)"
                />
                <span class="loc-drawer-name loc-drawer-name--parent" @click="toggleLocExpanded(node.id)">{{ node.name }}</span>
              </div>
              <div v-else
                class="loc-drawer-item loc-drawer-item--leaf"
                :style="{ paddingLeft: `${16 + node.depth * 20 + 40}px` }"
              >
                <MpCheckbox
                  :is-checked="locDrawerSel.has(node.id)"
                  @change="toggleLocDrawerSel(node.id)"
                />
                <span class="loc-drawer-name" @click="toggleLocDrawerSel(node.id)">{{ locDrawerSearch.trim() ? node.fullPath : node.name }}</span>
              </div>
            </template>
            <div v-if="!locDrawerItems.length" class="loc-drawer-empty">{{ t('No storage locations found') }}</div>
          </div>
          <div class="loc-spd-footer">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="locationDrawerOpen = false">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="confirmLocSelection">
              {{ t('Select') }} ({{ locDrawerSel.size }})
            </button>
          </div>
        </div>
      </div>
    </Transition>
    <ManageBatchDrawer
      v-if="batchDrawerRow"
      :open="batchDrawerOpen"
      :sku="batchDrawerRow.sku"
      :warehouse-id="warehouseId"
      :model-value="batchDrawerRow.batchLines ?? []"
      :document-base-lines="batchDrawerBaseLines"
      :document-line-cap="STOCK_ADJUSTMENT_LINE_CAP"
      @update:open="batchDrawerOpen = $event"
      @save="saveBatchLines"
    />
    <ManageBatchDrawer
      v-if="locBatchDrawerRow"
      :open="locBatchDrawerOpen"
      :sku="locBatchDrawerRow.sku"
      :warehouse-id="warehouseId"
      :location-on-hand="locBatchDrawerRow.onHand"
      :model-value="locBatchDrawerRow.batchLines ?? []"
      :document-base-lines="locBatchDrawerBaseLines"
      :document-line-cap="STOCK_ADJUSTMENT_LINE_CAP"
      @update:open="locBatchDrawerOpen = $event"
      @save="saveLocBatchLines"
    />
    <ManageSerialDrawer
      v-if="serialDrawerRow"
      :open="true"
      :sku="serialDrawerRow.sku"
      :warehouse-id="warehouseId"
      :target-count="parseCounted(serialDrawerRow.counted)"
      :model-value="(serialDrawerRow.serialLines ?? []).map(s => ({ serial: s }))"
      @update:open="serialDrawerOpen = false"
      @save="saveSerialLines"
    />
    <NumberFormatSettingsModal
      v-model:open="noSettingsOpen"
      :title="t('Transaction no. settings')"
      :caption="t('Transaction numbers are auto-generated by the system.')"
      :next-number="nextTxNo"
      :existing-formats="txNoFormats"
      @save="onNoFormatSave"
    />
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px); }
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-8); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); }
.detail-footer { flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage); border-top: 1px solid transparent; transition: border-top-color 0.15s; }
.detail-footer--floating { border-top-color: var(--mp-border-default); }

.scf-body { display: flex; flex-direction: column; }
.scf-form-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 318px)); column-gap: var(--mp-spacing-6); row-gap: var(--mp-spacing-4); align-items: start; }
.scf-f-date { grid-column: 1; grid-row: 1; }
.scf-f-transno { grid-column: 2; grid-row: 1; }
.scf-f-tags { grid-column: 3; grid-row: 1; }
.scf-f-warehouse { grid-column: 1; grid-row: 2; }
.scf-f-account { grid-column: 2; grid-row: 2; }
.scf-f-assignee { grid-column: 2; grid-row: 2; }
.scf-f-startdate { grid-column: 1; grid-row: 3; }
.scf-f-enddate { grid-column: 2; grid-row: 3; }
.scf-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.scf-label-icon { display: flex; align-items: center; color: var(--mp-text-secondary); cursor: pointer; }
.scf-datepicker { width: 100%; }
.scf-datepicker :deep(.mp-datepicker__root) { width: 100%; }

.scf-table-toolbar { margin-top: 32px; display: flex; align-items: center; gap: var(--mp-spacing-3); width: 100%; }
.scf-progress-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-form, rgba(29,31,36,0.16)); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); cursor: pointer; }
.scf-progress-btn svg { color: var(--mp-icon-default); }
.scf-progress-btn--placeholder { color: var(--mp-text-placeholder); }
.scf-toolbar-right { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-left: auto; }
.scf-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 280px; padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px); color: var(--mp-icon-default); }
.scf-search-input { flex: 1; min-width: 0; border: none; outline: none; background: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.scf-search-input::placeholder { color: var(--mp-text-placeholder); }
.scf-import-btn { padding: var(--mp-spacing-2) var(--mp-spacing-4); border: 1px solid var(--mp-background-inverse, #080d0e); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-inverse, #080d0e); color: #fff; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer; }
.scf-import-btn:hover { opacity: 0.9; }

.scf-table-section { margin-top: var(--mp-spacing-5); }
.scf-table-scroll { overflow-x: auto; }
.scf-table { width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0; min-width: 900px; }
.scf-col-prod    { width: 26%; }
.scf-col-sku     { width: 12%; }
.scf-col-onhand  { width: 8%; }
.scf-col-counted { width: 15%; }
.scf-col-diff    { width: 9%; }
.scf-col-unit    { width: 8%; }
.scf-col-avg     { width: 17%; }
.scf-col-del     { width: 44px; max-width: 44px; }
.scf-table--loc .scf-th { background: var(--mp-background-neutral, #fff); }
.scf-th { height: var(--mp-sizes-7, 28px); text-align: left; padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2); background: var(--mp-background-neutral, #fff); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-transform: uppercase; border-bottom: 1px solid var(--mp-border-default); white-space: nowrap; }
.scf-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.scf-th--del { width: 44px; max-width: 44px; padding: 0; }
/* Read-only cells are gray; editable/interactive cells (Product, Counted, custom Average
   cost, the delete-icon column) are white. Every body cell gets a right divider except
   the trailing delete column, which sits flush against the table edge. */
.scf-td { padding: 8px var(--mp-spacing-4) 8px var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); border-right: 1px solid var(--mp-border-default); vertical-align: middle; background: var(--mp-background-neutral-subtle); }
.scf-td--muted { color: var(--mp-text-secondary); }
.scf-td--num { text-align: right; white-space: nowrap; padding: 8px var(--mp-spacing-2) 8px var(--mp-spacing-4); }
.scf-diff--pos { color: var(--mp-text-success, #18794e); }
.scf-diff--neg { color: var(--mp-text-danger, #a8352d); }
.scf-diff--uncounted { color: var(--mp-text-secondary); }
/* Average cost — value + edit icon to its right. The icon's space is always reserved
   (visibility toggled, not display) so hovering never shifts the row or the icon.
   height:1px on the td enables height:100% on the child wrap, which then always
   matches the row's actual (content-driven) height. */
.scf-td--avg.scf-td--input { height: 1px; }
.scf-avg-wrap { display: flex; align-items: stretch; width: 100%; height: 100%; }
/* Auto-calculate: fill the whole wrap (prefix to the edit button's reserved slot)
   with the disabled color, so it reads as one seamless block with no white gap —
   applied here (not on the input/button, which are visibility:hidden until hovered
   and so never paint their own background) rather than the input alone. */
.scf-avg-wrap--auto { background: var(--mp-background-disabled, rgba(29,31,36,0.04)); }
/* Average cost is always the "Rp"-prefixed input; disabled (Auto-calculate) just
   greys out the input rather than swapping to plain text. */
.scf-avg-prefix { align-self: stretch; display: flex; align-items: center; padding: 0 var(--mp-spacing-2); background: var(--mp-background-neutral-subtle); color: var(--mp-text-secondary); border-right: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); white-space: nowrap; }
.scf-avg-num { flex: 1; min-width: 0; height: 100%; padding: 0 var(--mp-spacing-2); border: none; background: transparent; color: var(--mp-text-default); font-size: var(--mp-font-sizes-md); font-variant-numeric: tabular-nums; outline: none; }
.scf-avg-num:disabled { color: var(--mp-text-secondary); cursor: not-allowed; -webkit-text-fill-color: var(--mp-text-secondary); }
.scf-avg-edit { visibility: hidden; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; margin-right: var(--mp-spacing-1); align-self: center; padding: 0; border: none; background: none; border-radius: var(--mp-radii-sm); cursor: pointer; color: var(--mp-icon-default); flex-shrink: 0; }
.scf-tr:hover .scf-avg-edit { visibility: visible; }
.scf-avg-edit:hover { background: var(--mp-background-neutral-subtle); color: var(--mp-text-default); }
.scf-td--prod { width: 40%; max-width: 0; height: 1px; padding: 0; background: var(--mp-background-neutral, #fff); }
/* Product cell is a button that opens the swap-product popover — reset button chrome. */
.scf-prod { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; width: 100%; height: 100%; padding: 8px var(--mp-spacing-4) 8px var(--mp-spacing-2); border: none; background: none; cursor: pointer; text-align: left; font: inherit; color: inherit; }
.scf-prod:hover { background: var(--mp-background-neutral-subtle); }
.scf-prod-chevron { margin-left: auto; flex-shrink: 0; color: var(--mp-icon-default); }
.scf-thumb { width: 40px; height: 40px; border-radius: var(--mp-radii-md); object-fit: cover; flex-shrink: 0; border: 1px solid var(--mp-border-subtle); background: var(--mp-background-neutral); }
.scf-thumb--empty { background: var(--mp-background-neutral-subtle); }
.scf-prod-info { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: 0; }
.scf-prod-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scf-prod-desc { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scf-swap-search { padding: var(--mp-spacing-2); border-bottom: 1px solid var(--mp-border-default); }
.scf-swap-search input { width: 100%; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); padding: var(--mp-spacing-2) var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); outline: none; }
.scf-swap-sku { color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-sm); }
.scf-td--input { padding: 0; background: var(--mp-background-neutral, #fff); }
.scf-td--input:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }
.scf-batch-total { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.scf-batch-empty { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
/* Counted cell for batch/serial-tracked rows — value/input on top, "Manage…" link stacked below.
   Active/white background (not the muted read-only gray) — this column is always editable. */
.scf-td--counted-batch { padding: 6px var(--mp-spacing-2) 6px var(--mp-spacing-4); vertical-align: middle; white-space: nowrap; }
.scf-td--active { background: var(--mp-background-neutral, #fff); }
.scf-qty-stack { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.scf-qty-stack .scf-qty-input { width: 72px; text-align: right; height: 26px; padding: 0 4px; border-bottom: 1px solid var(--mp-border-default); background: transparent; }
.scf-qty-stack .scf-qty-input:focus { border-bottom-color: var(--mp-border-bold); }
.scf-manage-btn { background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.scf-manage-btn:hover { text-decoration: underline; text-underline-offset: 2px; }
.scf-showing { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.scf-qty-input { width: 100%; text-align: right; height: var(--mp-sizes-10, 40px); padding: 0 var(--mp-spacing-2); border: none; background: transparent; color: var(--mp-text-default); font-size: var(--mp-font-sizes-md); font-variant-numeric: tabular-nums; outline: none; }
.scf-qty-input::placeholder { color: var(--mp-text-placeholder); }
.scf-td--del { width: 44px; max-width: 44px; padding: 0; text-align: center; background: var(--mp-background-neutral, #fff); border-right: none; }
.scf-del-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; background: none; border-radius: var(--mp-radii-sm); cursor: pointer; color: var(--mp-text-secondary); }
.scf-del-btn:hover { background: var(--mp-background-neutral-subtle); color: var(--mp-text-danger, #dc2626); }
.scf-add-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-3); background: none; border: none; padding: var(--mp-spacing-2) var(--mp-spacing-3); border-radius: var(--mp-radii-full, 999px); cursor: pointer; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular, 400); color: var(--mp-text-default); }
.scf-add-btn:hover { background: var(--mp-background-neutral-subtle); }
.scf-add-btn:disabled { cursor: not-allowed; opacity: 0.5; }
.scf-add-btn:disabled:hover { background: none; }
.scf-limit-msg { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #a8352d); }
.scf-form-error { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #a8352d); }

.scf-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); max-width: 440px; padding: var(--mp-spacing-6) 0; }
.scf-section--gap-top { padding-top: 32px; padding-bottom: 0; }
.scf-section--last { padding-top: 20px; }
.scf-section-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin-bottom: var(--mp-spacing-1); }
.scf-helper-text { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm); }
.scf-file-hidden { display: none; }
.scf-attachment { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.scf-attachment-row { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.scf-attach-or { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.scf-file-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.scf-file-item { display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }
.scf-file-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scf-file-remove { display: flex; align-items: center; background: none; border: none; padding: 0; cursor: pointer; color: var(--mp-text-secondary); }
.scf-file-remove:hover { color: var(--mp-text-default); }

/* Storage location banner + actions */
.scf-loc-banner { margin-top: var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-subtle); }
.scf-loc-actions { margin-top: 12px; }
.scf-loc-accordions { margin-top: 20px; }

/* Accordion content slots */
.scf-acc-label { flex: 1; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scf-acc-meta { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); white-space: nowrap; }
.scf-acc-remove { margin-left: var(--mp-spacing-2); flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: none; background: none; border-radius: var(--mp-radii-sm); cursor: pointer; color: var(--mp-icon-default); }
.scf-acc-remove:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }
.scf-acc-body { padding: var(--mp-spacing-4) var(--mp-spacing-4) var(--mp-spacing-4) 0; }

/* Location drawer transition */
.scf-loc-enter-active, .scf-loc-leave-active { transition: background-color 250ms ease; }
.scf-loc-enter-from, .scf-loc-leave-to { background-color: transparent; }
.scf-loc-enter-active .loc-spd-panel { transition: transform 350ms ease-out; }
.scf-loc-leave-active .loc-spd-panel { transition: transform 250ms ease-in; }
.scf-loc-enter-from .loc-spd-panel, .scf-loc-leave-to .loc-spd-panel { transform: translateX(calc(100% + 12px)); }

/* Location drawer — standalone styles (spd-* classes are scoped to SelectProductDrawer) */
.loc-spd-overlay { position: fixed; inset: 0; z-index: 1300; background: rgba(8, 13, 14, 0.45); display: flex; justify-content: flex-end; }
.loc-spd-panel { margin: var(--mp-spacing-3); width: min(480px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 24px; overflow: hidden; }
.loc-spd-header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); background: var(--mp-background-neutral-subtle); }
.loc-spd-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.loc-spd-close { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.loc-spd-close:hover { background: var(--mp-background-neutral-hovered); }
.loc-spd-search-wrap { padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); position: relative; }
.loc-spd-search-input { width: 100%; height: 36px; border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full); background: var(--mp-background-neutral); padding: 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; box-sizing: border-box; padding-right: 34px; }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }
.search-clear-btn--overlay { position: absolute; right: 18px; top: 50%; transform: translateY(-50%); }
.loc-spd-list { flex: 1; overflow-y: auto; }
.loc-spd-footer { flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }

/* Location drawer items */
.loc-drawer-item { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: 8px 16px; border-bottom: 1px solid var(--mp-border-default); }
.loc-drawer-item:last-child { border-bottom: none; }
.loc-drawer-item--parent { cursor: pointer; min-height: 36px; }
.loc-drawer-item--parent:hover { background: var(--mp-background-neutral-subtle); }
.loc-drawer-item--leaf { cursor: pointer; min-height: 40px; }
.loc-drawer-item--leaf:hover { background: var(--mp-background-neutral-subtle); }
.loc-drawer-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: 1.4; }
.loc-drawer-name--parent { font-weight: var(--mp-font-weights-semi-bold); }
.loc-drawer-chevron { display: inline-flex; align-items: center; justify-content: center; width: 20px; flex-shrink: 0; color: var(--mp-icon-subtle); transition: transform 150ms ease; }
.loc-drawer-chevron--open { transform: rotate(90deg); }
.loc-drawer-empty { padding: var(--mp-spacing-8); text-align: center; color: var(--mp-text-subtle); font-size: var(--mp-font-sizes-md); }

/* btn-enterprise variants used in storage-location mode */
.btn-enterprise--icon-before { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
