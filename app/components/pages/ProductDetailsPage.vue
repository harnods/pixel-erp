<script setup lang="ts">
/**
 * Product details — master-data detail page (Figma: "Products / Details").
 * Shell mirrors WarehouseDetailsPage.vue exactly (breadcrumb, Actions dropdown,
 * activity log link + modal, MpTabs). The Product info fields use ContentList
 * (see docs/patterns/ContentList.md) laid out in the Figma's image + 3-column
 * arrangement, since that's the actual layout this design calls for.
 */
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, MpSelect, MpCheckbox, MpTooltip, MpIcon, MpBadge, MpInput, css,
} from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import ContentList from '~/components/patterns/ContentList.vue'
import ClampText from '~/components/patterns/ClampText.vue'
import ActivityLogModal, { type ActivityEntry } from '~/components/patterns/ActivityLogModal.vue'
import ErpPagination from '~/components/patterns/ErpPagination.vue'
import StockSerialDrawer from '~/components/patterns/StockSerialDrawer.vue'
import PdfPreviewModal from '~/components/patterns/PdfPreviewModal.vue'
import PrintBarcodeOptionsModal from '~/components/patterns/PrintBarcodeOptionsModal.vue'
import VendorItemDrawer from '~/components/patterns/VendorItemDrawer.vue'
import {
  getProductDetail, getProductTransactions, getProductWarehouseStock, getProductBatches, getProductSerialStock,
  getProductAllSerials, type ProductBatchSummary,
} from '~/data/productDetails'
import { getWarehouseDetail, setWarehouseMinStock, type WarehouseStockItem } from '~/data/warehouseDetails'
import { buildRow, invalidateReplenishmentCaches } from '~/data/replenishment'
import { getSkuWarehouseOverride, saveSkuWarehouseOverride } from '~/data/replenishmentSettings'
import { replenishmentRevision } from '~/data/replenishmentStore'
import { cutoverState } from '~/data/wmsCutover'
import { formatDateTimeLong } from '~/utils/date'
import { generateBarcodeLabelPdf, generateBarcodeSheetPdf } from '~/utils/barcodeLabelPdf'
import { TODAY } from '~/data/master'
import { vendorItemsForSku, preferredVendorItem, vendorNameFor } from '~/data/vendorItems'
import {
  unitConversionsForSku, upsertUnitConversion, removeUnitConversion, describeQty,
} from '~/data/productUnits'
import type jsPDF from 'jspdf'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const route = useRoute()

const product = computed(() => getProductDetail(props.orderId))

// WMS doesn't deal in pricing/costing/accounting — those fields/sections are ERP-only.
const { activeScenario } = useScenario()
const isWms = computed(() => activeScenario.value.startsWith('WMS'))

// "WMS upgrade to ERP" migration scenario (separate axis): every price/cost/
// account value is empty until the user runs the migration (Settings →
// Migration date), so those fields render "—" until then. The fields/sections
// still show (we're in the ERP view post-upgrade); only the VALUES are blanked.
// Default scenario is untouched.
const { migrationScenario } = useMigrationScenario()
// Pending only until the WMS→ERP opening balance is published in Data migration.
const isMigrationPending = computed(() =>
  migrationScenario.value === 'WMS upgrade to ERP' && !cutoverState.published,
)

function goBack() { router.push('/product-list') }

// ── Tabs — driven by ?section= (NOT ?tab=: this route's first segment, "product-list",
// is also the index page's pageKey, whose OWN ?tab= is managed globally in
// [...slug].vue — reusing that name here would fight with it) so back/forward still
// restores the active tab. "Transactions" is first/default, matching Figma. The 3rd
// tab depends on Track stock by: "Batch" → Stock by batches, "Serial number" →
// Stock by serial numbers, else → Stock by warehouses. ──
const stockTabName = computed(() => {
  const t = product.value?.trackStockBy
  if (t === 'Batch') return 'batches'
  if (t === 'Serial number') return 'serials'
  return 'warehouses'
})
// Stock by warehouses is last and always present — and for a quantity-tracked
// product it IS the tracking tab, so de-dupe instead of listing it twice. The
// list has to match the rendered tab order exactly: MpTabs addresses tabs by
// index, so an entry missing here sends ?section= to the wrong tab.
const TAB_NAMES = computed(() => ['transactions', 'vendors', 'unit-conversions', ...new Set([stockTabName.value, 'warehouses'])])
const activeTabIndex = computed({
  get(): number {
    const tab = route.query.section as string | undefined
    const idx = tab ? TAB_NAMES.value.indexOf(tab) : -1
    return idx >= 0 ? idx : 0
  },
  set(idx: number) {
    router.replace({ query: { ...route.query, section: TAB_NAMES.value[idx] ?? 'transactions' } })
  },
})

// ── Unit conversions (the product's multi-unit setup) ─────────────────────────
// One larger unit = N base units. Vendor MOQ and pack size are quoted in one of
// these, so this table is what gives the vendor form its unit options.
const unitTick = ref(0)
const conversions = computed(() => {
  void unitTick.value
  return product.value ? unitConversionsForSku(product.value.sku) : []
})

const newUnitName = ref('')
const newUnitFactor = ref('')
const unitError = ref('')

function addConversion() {
  if (!product.value) return
  const name = newUnitName.value.trim()
  const factor = Number(newUnitFactor.value)
  // Validate on click and show an inline error — never a disabled button.
  if (!name) { unitError.value = 'Enter a unit name'; return }
  if (name.toLowerCase() === product.value.unit.toLowerCase()) {
    unitError.value = `"${name}" is already the base unit`
    return
  }
  if (!factor || Number.isNaN(factor) || factor <= 1 || !Number.isInteger(factor)) {
    unitError.value = 'Quantity must be a whole number greater than 1'
    return
  }
  upsertUnitConversion(product.value.sku, name, factor)
  newUnitName.value = ''
  newUnitFactor.value = ''
  unitError.value = ''
  unitTick.value++
  // Vendor terms quote MOQ in these units, so their labels change too.
  vendorTick.value++
}

function editFactor(name: string, raw: string) {
  if (!product.value) return
  const factor = Number(raw)
  if (!factor || Number.isNaN(factor) || factor <= 1) return
  upsertUnitConversion(product.value.sku, name, factor)
  unitTick.value++
  vendorTick.value++
}

function deleteConversion(name: string) {
  if (!product.value) return
  // A unit still used by a vendor's MOQ cannot be removed without silently
  // changing what that MOQ means, so say so instead of doing it.
  const inUse = vendorItemsForSku(product.value.sku).filter((v) => v.purchaseUnit === name)
  if (inUse.length) {
    unitError.value = `${name} is used by ${inUse.length === 1 ? 'a vendor' : inUse.length + ' vendors'}. Change their MOQ unit first.`
    return
  }
  removeUnitConversion(product.value.sku, name)
  unitError.value = ''
  unitTick.value++
}

// ── Vendors (who sells us this product, and on what terms) ────────────────────
// Read live from the vendor↔item link table, so the terms shown here are the same
// ones the replenishment engine uses to size a suggested order.
const vendorOpen = ref(false)
const vendorTick = ref(0)

const vendorRows = computed(() => {
  void vendorTick.value // re-read after the drawer saves
  return product.value ? vendorItemsForSku(product.value.sku) : []
})

const preferredVendor = computed(() => {
  void vendorTick.value
  return product.value ? preferredVendorItem(product.value.sku) : undefined
})

/** MOQ in the purchase unit, plus what that means in stock units — "4 Pallet" is
 *  meaningless on its own when a pallet is 20 sacks. */
function moqLabel(moq: number, purchaseUnit: string, unitsPer: number): string {
  const base = `${moq.toLocaleString('id-ID')} ${purchaseUnit}`
  if (unitsPer <= 1 || !product.value) return base
  return `${base} = ${(moq * unitsPer).toLocaleString('id-ID')} ${product.value.unit}`
}

// ── Formatters ─────────────────────────────────────────────────────────────────
function formatQty(n: number, unit: string) {
  return `${n.toLocaleString('id-ID')} ${unit}`
}
function formatDate(iso: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}
const createdLabel = computed(() => product.value ? formatDateTimeLong(product.value.createdAt) : '')

// ── Activity log ───────────────────────────────────────────────────────────────
const activityOpen = ref(false)
const activityEntries = computed<ActivityEntry[]>(() => {
  const p = product.value
  if (!p) return []
  return [{
    date: p.createdAt,
    user: p.createdBy,
    activity: 'Created',
    details: [
      { label: 'Name', value: p.name },
      { label: 'SKU', value: p.sku },
      { label: 'Category', value: p.category },
    ],
  }]
})

// empty-state illustration (runtime public path, not a build-time import)
const emptyIllustration = '/illustrations/empty-folder.png'

// ── Transactions tab ─────────────────────────────────────────────────────────────
const allTransactions = computed(() => product.value ? getProductTransactions(product.value.sku) : [])
const txTypeFilter = ref('')
const txSearch = ref('')
const txTypeOptions = computed(() => [...new Set(allTransactions.value.map(t => t.type))])
const filteredTransactions = computed(() => {
  let list = allTransactions.value
  if (txTypeFilter.value) list = list.filter(t => t.type === txTypeFilter.value)
  const q = txSearch.value.trim().toLowerCase()
  if (q) list = list.filter(t => t.number.toLowerCase().includes(q))
  return list
})
const txPage = ref(1)
const txPerPage = ref(25)
const pagedTransactions = computed(() => {
  const start = (txPage.value - 1) * txPerPage.value
  return filteredTransactions.value.slice(start, start + txPerPage.value)
})
watch([txTypeFilter, txSearch], () => { txPage.value = 1 })

// ── Stock by warehouses tab ──────────────────────────────────────────────────────
const warehouseStock = computed(() => product.value ? getProductWarehouseStock(product.value.sku) : [])
const whPage = ref(1)
const whPerPage = ref(25)
const pagedWarehouseStock = computed(() => {
  const start = (whPage.value - 1) * whPerPage.value
  return warehouseStock.value.slice(start, start + whPerPage.value)
})

/**
 * Replenishment settings at the WAREHOUSE grain (PRD US-024, US-011 AC-02).
 *
 * This is the grain the PRD actually specifies — "Reorder point, settings,
 * demand, lead time, worklist and netting are all at the item × warehouse
 * grain" (decision D2). A SKU selling 3/day in Jakarta and 0.2/day in Medan
 * genuinely needs different floors, and a product-level number cannot express
 * that. The product form sets the SKU-level DEFAULT; this table overrides it per
 * location, which is the precedence chain's top tier.
 *
 * Safety days is the input; min. stock is what it works out to, because the PRD
 * defines them as one quantity: "Reorder Point = MINIMUM STOCK THRESHOLD =
 * avg daily demand × (lead time + safety days)".
 */
const whReplenishment = computed(() => {
  // The engine reads its settings from localStorage, which Vue cannot track, so
  // without this the table would keep showing the pre-save values after an edit —
  // the same stale-read that once made the worklist tab badge disagree with its
  // own list. `writeStore` bumps this on every save.
  void replenishmentRevision.value
  const sku = product.value?.sku
  const out: Record<string, {
    effective: number
    source: string
    safetyDays: number
    safetyDaysSource: string
    velocity: number
    leadTimeDays: number
    leadTimeTier: string
    leadTimeEstimated: boolean
    /** What the formula gives, ignoring any override — the placeholder. */
    recommended: number | null
  }> = {}
  if (!sku) return out

  for (const s of warehouseStock.value) {
    const row = buildRow(sku, s.warehouseId)
    const velocity = row.velocity.avgDailySales
    out[s.warehouseId] = {
      effective: row.reorderPoint,
      source: row.reorderPointSource,
      safetyDays: row.safetyDays,
      safetyDaysSource: row.safetyDaysSource,
      velocity,
      leadTimeDays: row.leadTimeDays,
      leadTimeTier: row.leadTimeTier,
      leadTimeEstimated: row.leadTimeEstimated,
      // No demand basis means no floor to recommend — the same rule the worklist
      // applies, so this table cannot show a number the engine would refuse.
      recommended: velocity > 0 ? Math.ceil(velocity * (row.leadTimeDays + row.safetyDays)) : null,
    }
  }
  return out
})

/**
 * The little grey line under each figure, in read AND edit mode.
 *
 * It used to disappear the moment Edit was clicked, which is exactly backwards:
 * "7" and "39" mean nothing on their own, and the moment you most need to know
 * whether a number is inherited or calculated is while you are deciding whether
 * to overwrite it. The full arithmetic stays on the cell's hover title; these are
 * the short forms that fit a 130px column.
 */
/**
 * Annotate the EXCEPTION, not the rule.
 *
 * Labelling every cell "inherited" / "calculated" put the same two words under
 * all nine rows and doubled the table's height to state something true of almost
 * every row — noise, not information. In a table the default is carried once, in
 * the caption above; only a row that DEPARTS from it earns a word of its own.
 * The full arithmetic stays on each cell's hover title either way.
 */
function whSafetyIsCustom(warehouseId: string): boolean {
  return whReplenishment.value[warehouseId]?.safetyDaysSource === 'sku-warehouse'
}

function whMinStockIsCustom(warehouseId: string): boolean {
  const src = whReplenishment.value[warehouseId]?.source
  return src === 'sku-warehouse' || src === 'sku'
}

/**
 * What the formula WOULD give for this warehouse, whether or not it is in use.
 *
 * Shown beside an overridden figure so the two are legible at once: telling a
 * user their number is "custom" answers which is which, but not the question
 * they actually have — is my override still sensible? Demand moves, so a floor
 * typed three months ago can quietly drift far from what the product now needs,
 * and the only way to notice is to see both numbers together.
 */
function whCalculatedHint(warehouseId: string): string {
  const r = whReplenishment.value[warehouseId]
  if (!r || r.recommended === null) return ''
  return `calculated ${r.recommended}`
}

function whSafetySub(warehouseId: string): string {
  const r = whReplenishment.value[warehouseId]
  if (!r) return ''
  return whSafetyIsCustom(warehouseId) ? `custom · inherits ${r.safetyDays}` : ''
}

function whMinStockSub(warehouseId: string): string {
  const r = whReplenishment.value[warehouseId]
  if (!r) return ''
  // Two genuine departures: a floor somebody typed, and one that could not be
  // calculated at all. Everything else is the documented default.
  if (whMinStockIsCustom(warehouseId)) {
    const calc = whCalculatedHint(warehouseId)
    return calc ? `custom · ${calc}` : 'custom'
  }
  if (r.recommended === null) return 'not calculated'
  return ''
}

/** Hover explanation for the safety-days cell — where the value comes from. */
function whSafetyTitle(warehouseId: string): string {
  const r = whReplenishment.value[warehouseId]
  if (!r) return ''
  const where = {
    'sku-warehouse': 'Set for this warehouse.',
    sku: 'Inherited from this product.',
    warehouse: 'Inherited from this warehouse.',
    category: 'Inherited from the category default.',
    global: 'Inherited from the company default.',
  }[r.safetyDaysSource] ?? 'Inherited.'
  return `${r.safetyDays} days of extra cover on top of the ${r.leadTimeDays}-day lead time. `
    + `${where} Leave the box empty to keep inheriting it.`
}

/** Per-row explanation for the min-stock cell, shown on hover. */
function whMinStockTitle(warehouseId: string): string {
  const r = whReplenishment.value[warehouseId]
  if (!r) return ''
  if (r.recommended === null) {
    return 'No sales in this warehouse yet, so there is nothing to calculate a floor from. '
      + 'The stored min. stock still applies to low-stock alerts — type a figure to set it deliberately.'
  }
  const lead = r.leadTimeEstimated ? `${r.leadTimeDays} days lead time (estimated)` : `${r.leadTimeDays} days lead time`
  const sum = `${r.velocity.toFixed(2)}/day × (${lead} + ${r.safetyDays} safety) = ${r.recommended}`
  return r.source === 'calculated' || r.source === 'none'
    ? `Calculated: ${sum}`
    : `Set by you. Calculated would be ${r.recommended} — ${sum}`
}

// On hand, reserved, available and in transit are all MEASURED by the warehouse,
// so they stay read only. Safety days and min. stock are decisions, so they are
// the two editable columns. Edits are held in a draft until Save — both drive
// low-stock alerts and the replenishment worklist, so a half-typed number
// shouldn't take effect on the way to the right one.
const whEditing = ref(false)
const whMinDraft = reactive<Record<string, string>>({})
const whSafetyDraft = reactive<Record<string, string>>({})

function startEditMinStock() {
  for (const id of Object.keys(whMinDraft)) delete whMinDraft[id]
  for (const id of Object.keys(whSafetyDraft)) delete whSafetyDraft[id]
  const sku = product.value?.sku
  for (const s of warehouseStock.value) {
    const override = sku ? getSkuWarehouseOverride(sku, s.warehouseId) : {}
    // Only an OVERRIDE prefills. An inherited or calculated value shows as the
    // placeholder, so leaving the box alone keeps it inherited rather than
    // silently pinning today's number as a permanent override.
    whMinDraft[s.warehouseId] = override.reorderPoint !== undefined ? String(override.reorderPoint) : ''
    whSafetyDraft[s.warehouseId] = override.safetyDays !== undefined ? String(override.safetyDays) : ''
  }
  whEditing.value = true
}

function saveMinStock() {
  const sku = product.value?.sku
  if (!sku) return

  for (const s of warehouseStock.value) {
    const rec = whReplenishment.value[s.warehouseId]
    const minRaw = (whMinDraft[s.warehouseId] ?? '').replace(/\D/g, '')
    const safetyRaw = (whSafetyDraft[s.warehouseId] ?? '').replace(/\D/g, '')

    // Empty means INHERIT, so it clears the override rather than storing a value.
    // Passing undefined is how replenishmentSettings clears a key.
    const safetyDays = safetyRaw === '' ? undefined : Number(safetyRaw)
    const typedMin = minRaw === '' ? null : Number(minRaw)
    // Accepting the calculated figure leaves it calculated, so it keeps tracking
    // demand instead of freezing at today's number.
    const reorderPoint = typedMin === null || typedMin === rec?.recommended ? undefined : typedMin

    saveSkuWarehouseOverride(sku, s.warehouseId, { safetyDays, reorderPoint })

    // Keep the legacy per-warehouse minStock in step. It feeds the low-stock
    // counts on the Products and warehouse screens and in Cowork, which read
    // `minStock` rather than the engine — without this the same product would
    // show one floor here and a different one there.
    if (typedMin !== null && typedMin !== s.minStock) {
      setWarehouseMinStock(s.warehouseId, sku, typedMin)
    }
  }

  invalidateReplenishmentCaches()
  whEditing.value = false
}

// ── Stock by batches tab (batch-tracked products only) ────────────────────────────
const allBatches = computed(() => product.value ? getProductBatches(product.value.sku) : [])
const showArchivedBatches = ref(false)
const batchSearch = ref('')
const filteredBatches = computed(() => {
  let list = allBatches.value
  if (!showArchivedBatches.value) list = list.filter(b => !b.archived)
  const q = batchSearch.value.trim().toLowerCase()
  if (q) list = list.filter(b => b.batchNo.toLowerCase().includes(q))
  return list
})
const batchPage = ref(1)
const batchPerPage = ref(25)
const pagedBatches = computed(() => {
  const start = (batchPage.value - 1) * batchPerPage.value
  return filteredBatches.value.slice(start, start + batchPerPage.value)
})
watch([showArchivedBatches, batchSearch], () => { batchPage.value = 1 })

function daysToExpiry(iso: string) { return Math.ceil((new Date(iso).getTime() - TODAY.getTime()) / 86_400_000) }
function isExpiryWarning(iso: string) { return daysToExpiry(iso) < 30 }
function expiryTooltip(iso: string) {
  const d = formatDate(iso)
  const days = daysToExpiry(iso)
  if (days < 0) return `Expired on ${d}`
  if (days === 0) return `Expires today (${d})`
  return `Expiring in ${days} day${days === 1 ? '' : 's'} (${d})`
}
function viewBatch(batchNo: string) {
  if (!product.value) return
  router.push(`/product-list/${product.value.sku}/batches/${encodeURIComponent(batchNo)}`)
}

type PrintBarcodeTarget =
  | { kind: 'batch'; batch: ProductBatchSummary }
  | { kind: 'sku' }
  | { kind: 'serials'; serials: string[] }
  | { kind: 'batches'; batches: ProductBatchSummary[] }
const printBarcodeOptionsOpen = ref(false)
const printBarcodeTarget = ref<PrintBarcodeTarget | null>(null)
function printBatchBarcode(b: ProductBatchSummary) {
  printBarcodeTarget.value = { kind: 'batch', batch: b }
  printBarcodeOptionsOpen.value = true
}
// Print one barcode per batch currently listed (respects the archived toggle + search).
function printAllBatchBarcodes() {
  const batches = filteredBatches.value
  if (!batches.length) return
  printBarcodeTarget.value = { kind: 'batches', batches: [...batches] }
  printBarcodeOptionsOpen.value = true
}
function printSkuBarcode() {
  printBarcodeTarget.value = { kind: 'sku' }
  printBarcodeOptionsOpen.value = true
}
// Print one barcode per serial number (available + reserved) for this SKU.
function printAllSerialBarcodes() {
  if (!product.value) return
  const serials = getProductAllSerials(product.value.sku)
  if (!serials.length) return
  printBarcodeTarget.value = { kind: 'serials', serials }
  printBarcodeOptionsOpen.value = true
}

const barcodePreviewOpen = ref(false)
const barcodePreviewDoc = ref<jsPDF | null>(null)
const barcodePreviewFilename = ref('')
async function confirmPrintBarcode({ qty, columns }: { qty: number; columns: 1 | 2 | 3 }) {
  const target = printBarcodeTarget.value
  if (!product.value || !target) return
  printBarcodeOptionsOpen.value = false
  if (target.kind === 'serials') {
    // One label per serial number — its own barcode + the SN as the headline.
    const labels = target.serials.map((sn) => ({
      barcode: sn,
      batchNo: sn,
      productName: product.value!.name,
      sku: product.value!.sku,
    }))
    barcodePreviewDoc.value = await generateBarcodeSheetPdf(labels, columns, qty)
    barcodePreviewFilename.value = `Barcodes - ${product.value.sku} (serial numbers).pdf`
  } else if (target.kind === 'batches') {
    // One label per batch — the batch's own barcode + batch number headline.
    const labels = target.batches.map((b) => ({
      barcode: b.barcode,
      batchNo: b.batchNo,
      productName: product.value!.name,
      sku: product.value!.sku,
    }))
    barcodePreviewDoc.value = await generateBarcodeSheetPdf(labels, columns, qty)
    barcodePreviewFilename.value = `Barcodes - ${product.value.sku} (batches).pdf`
  } else if (target.kind === 'batch') {
    const b = target.batch
    barcodePreviewDoc.value = await generateBarcodeLabelPdf({
      barcode: b.barcode,
      batchNo: b.batchNo,
      productName: product.value.name,
      sku: product.value.sku,
    }, qty, columns)
    barcodePreviewFilename.value = `Barcode - ${b.batchNo}.pdf`
  } else {
    // No separate batch/serial identifier for a plain SKU label — the SKU itself
    // is already shown below, so leave the bold headline field blank.
    barcodePreviewDoc.value = await generateBarcodeLabelPdf({
      barcode: product.value.barcode,
      batchNo: '',
      productName: product.value.name,
      sku: product.value.sku,
    }, qty, columns)
    barcodePreviewFilename.value = `Barcode - ${product.value.sku}.pdf`
  }
  barcodePreviewOpen.value = true
}
// ── Stock by serial numbers tab (serial-tracked products only) ────────────────────
const serialStock = computed(() => product.value ? getProductSerialStock(product.value.sku) : [])
const serialPage = ref(1)
const serialPerPage = ref(25)
const pagedSerialStock = computed(() => {
  const start = (serialPage.value - 1) * serialPerPage.value
  return serialStock.value.slice(start, start + serialPerPage.value)
})
function serialCountLabel(n: number) { return `${n} ${n === 1 ? 'serial number' : 'serial numbers'}` }
const serialTotal = computed(() => serialStock.value.reduce((n, s) => n + s.availableCount + s.reservedCount, 0))

const serialDrawerOpen = ref(false)
const serialDrawerProduct = ref<WarehouseStockItem | null>(null)
const serialDrawerWarehouseId = ref('')
const serialDrawerTab = ref<'available' | 'reserved'>('available')
function openSerialDrawer(warehouseId: string, tab: 'available' | 'reserved') {
  if (!product.value) return
  const item = getWarehouseDetail(warehouseId)?.stock.find(s => s.sku === product.value!.sku)
  if (!item) return
  serialDrawerProduct.value = item
  serialDrawerWarehouseId.value = warehouseId
  serialDrawerTab.value = tab
  serialDrawerOpen.value = true
}
</script>

<template>
  <div v-if="product" class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goBack">Products</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ product.name }}</h1>
        </div>
      </div>

      <MpPopover id="pd-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="detail-btn detail-btn--primary">
            Actions
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="router.push(`/product-list/${product.sku}/edit`)">Edit</MpPopoverListItem>
            <MpPopoverListItem @click="printSkuBarcode">Print barcode</MpPopoverListItem>
            <MpPopoverListItem>Duplicate</MpPopoverListItem>
            <MpPopoverListItem>Archive</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </header>

    <!-- ── Stage ── -->
    <div class="detail-stage">

      <!-- Product info -->
      <section class="pd-section">
        <h2 class="pd-section-title">Product info</h2>
        <div class="pd-info-row">
          <div class="pd-image-col">
            <img :src="product.img" :alt="product.name" class="pd-image" />
          </div>
          <div class="pd-field-col" style="width: 368px">
            <ContentList label="SKU" :value="product.sku" />
            <ContentList label="Barcode" :value="product.barcode" />
            <ContentList label="Category" :value="product.category" />
            <ContentList label="Base unit" :value="product.unit" />
            <ContentList label="Description">
              <ClampText :text="product.desc" :lines="2" />
            </ContentList>
          </div>
          <div class="pd-field-col pd-field-col--flex">
            <!-- Product type is an ERP concept — every WMS Standalone product is single. -->
            <ContentList v-if="!isWms" label="Product type" :value="product.productType" />
            <ContentList label="Track stock by" :value="product.trackStockBy" />
            <ContentList v-if="!isWms" label="Default inventory account">
              <span v-if="isMigrationPending">—</span>
              <a v-else class="pd-link">{{ product.defaultInventoryAccount }}</a>
            </ContentList>
          </div>
          <div class="pd-field-col pd-field-col--flex">
            <ContentList label="On hand" :value="formatQty(product.onHand, product.unit)" />
            <ContentList label="Reserved" :value="formatQty(product.reserved, product.unit)" />
            <ContentList label="Available" :value="formatQty(product.available, product.unit)" />
            <ContentList label="Min. stock" :value="formatQty(product.minStock, product.unit)" />
          </div>
        </div>
      </section>

      <!-- Purchase info / Sales info — ERP only, WMS doesn't deal in pricing/accounting.
           Tax info sits in the same row but gates on product.djpCode independently,
           since tax classification applies regardless of ERP/WMS scenario. -->
      <div class="pd-two-col">
        <section v-if="!isWms" class="pd-section pd-section--flex">
          <h2 class="pd-section-title">Purchase info</h2>
          <div class="pd-purchase-row">
            <div class="pd-field-col pd-field-col--flex">
              <ContentList label="Default purchase cost" :value="isMigrationPending ? '—' : formatIDR(product.defaultPurchaseCost)" />
              <ContentList label="Average cost" :value="isMigrationPending ? '—' : formatIDR(product.averageCost)" />
              <ContentList label="Last purchase cost" :value="isMigrationPending ? '—' : formatIDR(product.lastPurchaseCost)" />
            </div>
            <div class="pd-field-col pd-field-col--flex">
              <ContentList label="Default purchase account">
                <span v-if="isMigrationPending">—</span>
                <a v-else class="pd-link">{{ product.defaultPurchaseAccount }}</a>
              </ContentList>
              <ContentList label="Default purchase tax" :value="isMigrationPending ? '—' : product.defaultPurchaseTax" />
              <!-- Preferred vendor + its minimum order — the two facts a buyer
                   opens this page for. The full comparison is in the Vendors tab. -->
              <ContentList label="Preferred vendor">
                <template v-if="preferredVendor">
                  <span>{{ vendorNameFor(preferredVendor.vendorId) }}</span>
                  <span class="pd-vendor-note">
                    Lead time {{ preferredVendor.leadTimeDays }} days ·
                    MOQ {{ moqLabel(preferredVendor.moq, preferredVendor.purchaseUnit, preferredVendor.unitsPerPurchaseUnit) }}
                  </span>
                </template>
                <template v-else>
                  <span class="pd-vendor-none">Not set</span>
                  <span class="pd-vendor-note">This product cannot be ordered until a vendor is added.</span>
                </template>
              </ContentList>
            </div>
          </div>
        </section>
        <section v-if="!isWms" class="pd-section pd-section--flex">
          <h2 class="pd-section-title">Sales info</h2>
          <div class="pd-field-col pd-field-col--fixed">
            <ContentList label="Default sales price" :value="isMigrationPending ? '—' : formatIDR(product.defaultSalesPrice)" />
            <ContentList label="Default sales account">
              <span v-if="isMigrationPending">—</span>
              <a v-else class="pd-link">{{ product.defaultSalesAccount }}</a>
            </ContentList>
            <ContentList label="Default sales tax" :value="isMigrationPending ? '—' : product.defaultSalesTax" />
          </div>
        </section>

        <!-- Tax info — only shown once tax info has actually been filled in on the
             product. Same vertical-list pattern as Sales info (single column, fixed 270px). -->
        <section v-if="product.djpCode" class="pd-section pd-section--flex">
          <h2 class="pd-section-title">Tax info</h2>
          <div class="pd-field-col pd-field-col--fixed">
            <ContentList label="Product classification" :value="product.productClassification" />
            <ContentList label="DJP code" :value="product.djpCode" />
            <ContentList label="DJP unit" :value="product.djpUnit" />
          </div>
        </section>
      </div>

      <a class="detail-updated" @click.prevent="activityOpen = true">
        Created by {{ product.createdBy }} on {{ createdLabel }}
      </a>

      <!-- ── Tabs ── -->
      <MpTabs id="pd-detail-tabs" v-model="activeTabIndex" is-manual variant-color="green" class="detail-tabs">
        <MpTabList>
          <MpTab id="pd-tab-transactions" value="transactions">Transactions</MpTab>
          <MpTab id="pd-tab-vendors" value="vendors">Vendors</MpTab>
          <MpTab id="pd-tab-units" value="unit-conversions">Unit conversions</MpTab>
          <MpTab v-if="product.trackStockBy === 'Batch'" id="pd-tab-batches" value="batches">Stock by batches</MpTab>
          <MpTab v-else-if="product.trackStockBy === 'Serial number'" id="pd-tab-serials" value="serials">Stock by serial numbers</MpTab>
          <!-- Every product sits in warehouses, whatever it's tracked by — and this is
               the only place a warehouse's min. stock can be set, so batch- and
               serial-tracked products need it too, not just quantity-tracked ones.
               Kept last so no existing tab shifts position. -->
          <MpTab id="pd-tab-warehouses" value="warehouses">Stock by warehouses</MpTab>
        </MpTabList>
        <MpTabPanels>

          <!-- Transactions -->
          <MpTabPanel value="transactions">
            <div class="pd-filter-bar">
              <div class="pd-filter-left">
                <MpPopover id="pd-tx-type-filter" is-close-on-select>
                  <MpPopoverTrigger>
                    <MpSelect
                      id="pd-tx-type-select"
                      placeholder="Transaction type"
                      :model-value="txTypeFilter"
                      is-clearable
                      :class="css({ width: '200px' })"
                      @mousedown.prevent
                      @clear="txTypeFilter = ''"
                    >
                      <option v-if="txTypeFilter" :value="txTypeFilter">{{ txTypeFilter }}</option>
                    </MpSelect>
                  </MpPopoverTrigger>
                  <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content' })">
                    <MpPopoverList>
                      <MpPopoverListItem
                        v-for="t in txTypeOptions"
                        :key="t"
                        :is-active="t === txTypeFilter"
                        @click="txTypeFilter = t"
                      >{{ t }}</MpPopoverListItem>
                    </MpPopoverList>
                  </MpPopoverContent>
                </MpPopover>
              </div>
              <div class="pd-search">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                <input v-model="txSearch" class="pd-search-input" type="text" placeholder="Search..." />
                <button v-if="txSearch" class="pd-search-clear" type="button" aria-label="Clear search" @click="txSearch = ''">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                  </svg>
                </button>
              </div>
            </div>

            <div v-if="pagedTransactions.length" class="pd-table-scroll">
              <table class="pd-table">
                <colgroup>
                  <col style="width: 120px" />
                  <col style="width: 220px" />
                  <col style="width: 110px" />
                  <col style="width: 100px" />
                  <col style="width: 100px" />
                  <col style="width: 100px" />
                  <col style="width: 100px" />
                  <col style="width: 90px" />
                </colgroup>
                <thead>
                  <tr>
                    <th class="pd-th">Date</th>
                    <th class="pd-th">Number</th>
                    <th class="pd-th">Movement</th>
                    <th class="pd-th pd-th--num">On hand qty</th>
                    <th class="pd-th pd-th--num">Reserved qty</th>
                    <th class="pd-th pd-th--num">Available qty</th>
                    <th class="pd-th pd-th--num">In transit qty</th>
                    <th class="pd-th">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="tx in pagedTransactions" :key="tx.id" class="pd-tr">
                    <td class="pd-td">{{ formatDate(tx.date) }}</td>
                    <td class="pd-td">
                      <!-- Plain text, not a link: a warehouse manager shouldn't be able to
                           open transactions from warehouses they aren't assigned to. -->
                      <span class="pd-tx-number">{{ tx.number }}</span>
                    </td>
                    <td class="pd-td">
                      <div class="pd-movement" :class="tx.delta >= 0 ? 'pd-movement--pos' : 'pd-movement--neg'">
                        {{ tx.delta >= 0 ? `+${tx.delta}` : tx.delta }}
                      </div>
                      <span v-for="a in tx.affects" :key="a" class="pd-movement-caption">{{ a }}</span>
                    </td>
                    <td class="pd-td pd-td--num">{{ tx.onHand.toLocaleString('id-ID') }}</td>
                    <td class="pd-td pd-td--num">{{ tx.reserved.toLocaleString('id-ID') }}</td>
                    <td class="pd-td pd-td--num">{{ tx.available.toLocaleString('id-ID') }}</td>
                    <td class="pd-td pd-td--num">{{ tx.onTheWay.toLocaleString('id-ID') }}</td>
                    <td class="pd-td">{{ tx.unit }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="empty-full">
              <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
              <p class="empty-full-title">No transactions</p>
              <p class="empty-full-desc">Transactions will appear here.</p>
            </div>

            <ErpPagination
              v-if="filteredTransactions.length"
              :current-page="txPage"
              :per-page="txPerPage"
              :total="filteredTransactions.length"
              @page-change="txPage = $event"
              @per-page-change="txPerPage = $event; txPage = 1"
            />
          </MpTabPanel>

          <!-- Unit conversions -->
          <!-- Vendors — who supplies this product and on what terms. Same numbers
               the replenishment engine sizes an order from, so a buyer can see why
               a suggested quantity came out the way it did. -->
          <MpTabPanel value="vendors">
            <div v-if="vendorRows.length" class="pd-vendor-panel">
              <div class="pd-filter-bar pd-filter-bar--end">
                <button
                  class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm"
                  type="button"
                  @click="vendorOpen = true"
                >Edit vendors</button>
              </div>
              <div class="pd-table-scroll">
                <table class="pd-table">
                  <colgroup>
                    <col style="width: 240px" />
                    <col style="width: 116px" />
                    <col style="width: 104px" />
                    <col style="width: 110px" />
                    <col style="width: 130px" />
                    <col style="width: 160px" />
                    <col style="width: 104px" />
                    <col style="width: 160px" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th class="pd-th">Vendor</th>
                      <th class="pd-th">Preference</th>
                      <th class="pd-th pd-th--num">Lead time</th>
                      <th class="pd-th pd-th--num">MOQ</th>
                      <th class="pd-th">MOQ unit</th>
                      <th class="pd-th pd-th--num">In base unit</th>
                      <th class="pd-th pd-th--num">Pack size</th>
                      <th class="pd-th pd-th--num">Unit cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="vi in vendorRows" :key="vi.id" class="pd-tr">
                      <td class="pd-td">
                        <span class="pd-vendor-name">{{ vendorNameFor(vi.vendorId) }}</span>
                        <span class="pd-vendor-note">
                          Buys by the {{ vi.purchaseUnit }}
                          <template v-if="vi.unitsPerPurchaseUnit > 1">
                            = {{ vi.unitsPerPurchaseUnit }} {{ product.unit }}
                          </template>
                        </span>
                      </td>
                      <td class="pd-td">
                        <MpBadge v-if="vi.isPreferred" for="tableStatus" type="completed">Preferred</MpBadge>
                        <span v-else class="pd-vendor-alt">Alternate</span>
                      </td>
                      <td class="pd-td pd-td--num">{{ vi.leadTimeDays }} days</td>
                      <td class="pd-td pd-td--num">{{ vi.moq.toLocaleString('id-ID') }}</td>
                      <td class="pd-td">
                        {{ vi.purchaseUnit }}
                        <span v-if="vi.unitsPerPurchaseUnit > 1" class="pd-vendor-note">
                          multi-unit
                        </span>
                        <span v-else class="pd-vendor-note">base unit</span>
                      </td>
                      <td class="pd-td pd-td--num">
                        {{ (vi.moq * vi.unitsPerPurchaseUnit).toLocaleString('id-ID') }} {{ product.unit }}
                      </td>
                      <td class="pd-td pd-td--num">{{ vi.packSize }} {{ vi.purchaseUnit }}</td>
                      <td class="pd-td pd-td--num">{{ formatIDR(vi.unitCost) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p class="pd-vendor-hint">
                An order is raised to the vendor's minimum, then rounded up to a whole pack.
                The preferred vendor is used by default when a draft purchase order is created.
              </p>
            </div>
            <div v-else class="empty-full">
              <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
              <p class="empty-full-title">No vendors</p>
              <p class="empty-full-desc">
                No vendor supplies this product yet, so it cannot be ordered or replenished.
              </p>
              <button
                class="btn-enterprise btn-enterprise--secondary empty-cta"
                type="button"
                @click="vendorOpen = true"
              >Add vendor</button>
            </div>
          </MpTabPanel>

          <!-- Unit conversions — larger units this product is handled in. Vendor MOQ
               and pack size are quoted in one of these, so editing a factor here
               changes what every vendor's minimum means. -->
          <MpTabPanel value="unit-conversions">
            <div class="pd-unit-panel">
              <p class="pd-unit-intro">
                Base unit is <strong>{{ product.unit }}</strong>. Add the larger units this product
                is bought or handled in — a vendor's minimum order can then be quoted in any of them.
              </p>

              <div v-if="conversions.length" class="pd-table-scroll">
                <table class="pd-table">
                  <colgroup>
                    <col style="width: 220px" />
                    <col style="width: 160px" />
                    <col style="width: 240px" />
                    <col style="width: 200px" />
                    <col style="width: 90px" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th class="pd-th">Unit</th>
                      <th class="pd-th pd-th--num">Quantity</th>
                      <th class="pd-th">Conversion</th>
                      <th class="pd-th">Used by</th>
                      <th class="pd-th" />
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in conversions" :key="c.id" class="pd-tr">
                      <td class="pd-td">{{ c.name }}</td>
                      <td class="pd-td pd-td--num">
                        <MpInput
                          :id="`pd-uc-factor-${c.name}`"
                          :model-value="String(c.factor)"
                          type="number"
                          :class="css({ width: '88px' })"
                          @update:model-value="(v: string) => editFactor(c.name, v)"
                        />
                      </td>
                      <td class="pd-td">1 {{ c.name }} = {{ c.factor }} {{ product.unit }}</td>
                      <td class="pd-td">
                        <span v-if="vendorRows.filter(v => v.purchaseUnit === c.name).length" class="pd-vendor-note">
                          {{ vendorRows.filter(v => v.purchaseUnit === c.name).length }}
                          vendor MOQ
                        </span>
                        <span v-else class="pd-vendor-alt">—</span>
                      </td>
                      <td class="pd-td pd-td--num">
                        <button
                          class="pd-uc-remove"
                          type="button"
                          aria-label="Remove"
                          @click="deleteConversion(c.name)"
                        ><MpIcon name="minus-circular" size="md" /></button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="pd-unit-empty">
                No larger units yet — this product is only handled by the {{ product.unit }}.
              </p>

              <div class="pd-unit-add">
                <span class="pd-unit-add-label">Add unit</span>
                <MpInput
                  id="pd-uc-new-name"
                  v-model="newUnitName"
                  placeholder="Pack"
                  :class="css({ width: '160px' })"
                />
                <span class="pd-unit-eq">=</span>
                <MpInput
                  id="pd-uc-new-factor"
                  v-model="newUnitFactor"
                  type="number"
                  placeholder="12"
                  :class="css({ width: '96px' })"
                />
                <span class="pd-unit-eq">{{ product.unit }}</span>
                <button
                  class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm"
                  type="button"
                  @click="addConversion"
                >Add</button>
              </div>
              <p v-if="unitError" class="pd-unit-error">{{ unitError }}</p>
            </div>
          </MpTabPanel>

          <!-- Stock by batches (batch-tracked products) -->
          <MpTabPanel v-if="product.trackStockBy === 'Batch'" value="batches">
            <div class="pd-filter-bar pd-filter-bar--end">
              <div class="pd-filter-right">
                <MpCheckbox
                  id="pd-show-archived-batches" :is-checked="showArchivedBatches"
                  @change="showArchivedBatches = !showArchivedBatches"
                >Show archived batches</MpCheckbox>
                <div class="pd-search">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                  <input v-model="batchSearch" class="pd-search-input" type="text" placeholder="Search..." />
                  <button v-if="batchSearch" class="pd-search-clear" type="button" aria-label="Clear search" @click="batchSearch = ''">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                    </svg>
                  </button>
                </div>
                <button
                  v-if="filteredBatches.length"
                  class="detail-btn detail-btn--secondary"
                  type="button"
                  @click="printAllBatchBarcodes"
                >
                  Print all barcode
                </button>
              </div>
            </div>

            <div v-if="pagedBatches.length" class="pd-table-scroll">
              <table class="pd-table">
                <colgroup>
                  <col style="width: 140px" />
                  <col style="width: 130px" />
                  <col style="width: 220px" />
                  <col style="width: 110px" />
                  <col style="width: 110px" />
                  <col style="width: 110px" />
                  <col style="width: 90px" />
                  <col style="width: 56px" />
                </colgroup>
                <thead>
                  <tr>
                    <th class="pd-th">Number</th>
                    <th class="pd-th">Expiration date</th>
                    <th class="pd-th">Description</th>
                    <th class="pd-th pd-th--num">On hand</th>
                    <th class="pd-th pd-th--num">Reserved</th>
                    <th class="pd-th pd-th--num">Available</th>
                    <th class="pd-th">Unit</th>
                    <th class="pd-th"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="b in pagedBatches" :key="b.batchNo" class="pd-tr">
                    <td class="pd-td">
                      <a class="cell-link cell-text" @click.stop="viewBatch(b.batchNo)">{{ b.batchNo }}</a>
                    </td>
                    <td class="pd-td">
                      <span class="pd-expiry-cell" :class="{ 'pd-expiry-cell--danger': isExpiryWarning(b.expiryDate) }">
                        {{ formatDate(b.expiryDate) }}
                        <MpTooltip v-if="isExpiryWarning(b.expiryDate)" :id="`pd-tt-exp-${b.batchNo}`" :label="expiryTooltip(b.expiryDate)" placement="top" use-portal>
                          <span class="pd-expiry-warn" @click.stop><MpIcon name="warning-triangle" size="sm" /></span>
                        </MpTooltip>
                      </span>
                    </td>
                    <td class="pd-td">{{ b.description }}</td>
                    <td class="pd-td pd-td--num">{{ b.onHand.toLocaleString('id-ID') }}</td>
                    <td class="pd-td pd-td--num">{{ b.reserved.toLocaleString('id-ID') }}</td>
                    <td class="pd-td pd-td--num">{{ b.available.toLocaleString('id-ID') }}</td>
                    <td class="pd-td">{{ b.unit }}</td>
                    <td class="pd-td pd-td--action">
                      <MpPopover :id="`pd-batch-actions-${b.batchNo}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                        <MpPopoverTrigger>
                          <button class="row-kebab" aria-label="More actions" @click.stop>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
                            </svg>
                          </button>
                        </MpPopoverTrigger>
                        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
                          <MpPopoverList>
                            <MpPopoverListItem @click="viewBatch(b.batchNo)">View details</MpPopoverListItem>
                            <MpPopoverListItem @click="printBatchBarcode(b)">Print barcode</MpPopoverListItem>
                          </MpPopoverList>
                        </MpPopoverContent>
                      </MpPopover>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="empty-full">
              <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
              <p class="empty-full-title">No batches</p>
              <p class="empty-full-desc">Batches will appear here.</p>
            </div>

            <ErpPagination
              v-if="filteredBatches.length"
              :current-page="batchPage"
              :per-page="batchPerPage"
              :total="filteredBatches.length"
              @page-change="batchPage = $event"
              @per-page-change="batchPerPage = $event; batchPage = 1"
            />
          </MpTabPanel>

          <!-- Stock by serial numbers (serial-tracked products) -->
          <MpTabPanel v-else-if="product.trackStockBy === 'Serial number'" value="serials">
            <div class="pd-section-head">
              <h3 class="linked-section-title">Serial numbers</h3>
              <button
                v-if="serialTotal > 0"
                class="detail-btn detail-btn--secondary"
                type="button"
                @click="printAllSerialBarcodes"
              >
                Print all barcode
              </button>
            </div>
            <div v-if="pagedSerialStock.length" class="pd-table-scroll">
              <table class="pd-table">
                <colgroup>
                  <col style="width: 240px" />
                  <col style="width: 200px" />
                  <col style="width: 200px" />
                </colgroup>
                <thead>
                  <tr>
                    <th class="pd-th">Warehouse</th>
                    <th class="pd-th">Available</th>
                    <th class="pd-th">Reserved</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="s in pagedSerialStock" :key="s.warehouseId" class="pd-tr">
                    <td class="pd-td">
                      <a class="cell-link cell-text" @click.stop="router.push(`/warehouses/${s.warehouseId}`)">{{ s.warehouseName }}</a>
                    </td>
                    <td class="pd-td">
                      <a class="cell-link cell-text" @click.stop="openSerialDrawer(s.warehouseId, 'available')">{{ serialCountLabel(s.availableCount) }}</a>
                    </td>
                    <td class="pd-td">
                      <a class="cell-link cell-text" @click.stop="openSerialDrawer(s.warehouseId, 'reserved')">{{ serialCountLabel(s.reservedCount) }}</a>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="empty-full">
              <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
              <p class="empty-full-title">No stock</p>
              <p class="empty-full-desc">Serial numbers will appear here.</p>
            </div>

            <ErpPagination
              v-if="serialStock.length"
              :current-page="serialPage"
              :per-page="serialPerPage"
              :total="serialStock.length"
              @page-change="serialPage = $event"
              @per-page-change="serialPerPage = $event; serialPage = 1"
            />
          </MpTabPanel>

          <!-- Stock by warehouses — shown for every product, alongside the batch /
               serial breakdown rather than instead of it. -->
          <MpTabPanel value="warehouses">
            <p v-if="pagedWarehouseStock.length" class="pd-table-caption">
              Min. stock is calculated as daily sales × (lead time + safety days), per warehouse.
              Figures with no note are calculated or inherited; a figure you set is marked
              <span class="pd-caption-mark">custom</span> and shows what the calculation would give.
            </p>
            <div v-if="pagedWarehouseStock.length" class="pd-filter-bar pd-filter-bar--end">
              <div v-if="whEditing" class="pd-filter-right">
                <button
                  class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm"
                  type="button"
                  @click="whEditing = false"
                >Cancel</button>
                <button
                  class="btn-enterprise btn-enterprise--primary btn-enterprise--sm"
                  type="button"
                  @click="saveMinStock"
                >Save</button>
              </div>
              <button
                v-else
                class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm"
                type="button"
                @click="startEditMinStock"
              >Edit</button>
            </div>
            <div v-if="pagedWarehouseStock.length" class="pd-table-scroll">
              <table class="pd-table">
                <colgroup>
                  <col style="width: 240px" />
                  <col style="width: 110px" />
                  <col style="width: 110px" />
                  <col style="width: 110px" />
                  <col style="width: 110px" />
                  <col style="width: 120px" />
                  <col style="width: 130px" />
                  <col style="width: 90px" />
                </colgroup>
                <thead>
                  <tr>
                    <th class="pd-th">Warehouse</th>
                    <th class="pd-th pd-th--num">On hand qty</th>
                    <th class="pd-th pd-th--num">Reserved qty</th>
                    <th class="pd-th pd-th--num">Available qty</th>
                    <th class="pd-th pd-th--num">In transit qty</th>
                    <!-- The input comes before the number it produces. -->
                    <th class="pd-th pd-th--num">Safety days</th>
                    <th class="pd-th pd-th--num">Min. stock</th>
                    <th class="pd-th">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="s in pagedWarehouseStock" :key="s.warehouseId" class="pd-tr">
                    <td class="pd-td">
                      <a class="cell-link cell-text" @click.stop="router.push(`/warehouses/${s.warehouseId}`)">{{ s.warehouseName }}</a>
                    </td>
                    <td class="pd-td pd-td--num">{{ s.onHand.toLocaleString('id-ID') }}</td>
                    <td class="pd-td pd-td--num">{{ s.reserved.toLocaleString('id-ID') }}</td>
                    <td class="pd-td pd-td--num">{{ s.available.toLocaleString('id-ID') }}</td>
                    <td class="pd-td pd-td--num">{{ s.onTheWay.toLocaleString('id-ID') }}</td>

                    <!-- Safety days — the decision. Placeholder shows what this
                         warehouse inherits, so an untouched box means inherit. -->
                    <td class="pd-td pd-td--num" :title="whSafetyTitle(s.warehouseId)">
                      <MpInput
                        v-if="whEditing"
                        :id="`pd-wh-safety-${s.warehouseId}`"
                        v-model="whSafetyDraft[s.warehouseId]"
                        type="number"
                        :placeholder="String(whReplenishment[s.warehouseId]?.safetyDays ?? '')"
                        :aria-label="`Safety days for ${s.warehouseName}`"
                        :class="css({ width: '88px' })"
                      />
                      <template v-else>{{ whReplenishment[s.warehouseId]?.safetyDays ?? '—' }}</template>
                      <span v-if="whSafetySub(s.warehouseId)" class="pd-cell-sub">
                        {{ whSafetySub(s.warehouseId) }}
                        <!-- Clearing the box IS the revert, so name it instead of
                             leaving the user to guess that empty means inherit. -->
                        <a
                          v-if="whEditing"
                          class="pd-cell-link"
                          @click="whSafetyDraft[s.warehouseId] = ''"
                        >Use inherited</a>
                      </span>
                    </td>

                    <!-- Min. stock — what safety days works out to, per the PRD's
                         "Reorder Point = MINIMUM STOCK THRESHOLD". Calculated
                         unless someone overwrote it. -->
                    <td class="pd-td pd-td--num" :title="whMinStockTitle(s.warehouseId)">
                      <MpInput
                        v-if="whEditing"
                        :id="`pd-wh-min-stock-${s.warehouseId}`"
                        v-model="whMinDraft[s.warehouseId]"
                        type="number"
                        :placeholder="whReplenishment[s.warehouseId]?.recommended !== null ? String(whReplenishment[s.warehouseId]?.recommended ?? '') : String(s.minStock)"
                        :aria-label="`Min. stock for ${s.warehouseName}`"
                        :class="css({ width: '88px' })"
                      />
                      <!--
                        Three provenances, never conflated. Showing "—" for a
                        warehouse with no sales would be honest about the
                        CALCULATION but wrong about the FLOOR: the stored
                        min. stock is what the low-stock alerts on the Products
                        and warehouse screens actually enforce, so the number in
                        force is shown and labelled as not demand-derived.
                      -->
                      <template v-else-if="whReplenishment[s.warehouseId]?.recommended === null && whReplenishment[s.warehouseId]?.source === 'none'">
                        {{ s.minStock.toLocaleString('id-ID') }}
                      </template>
                      <template v-else>
                        {{ (whReplenishment[s.warehouseId]?.effective ?? s.minStock).toLocaleString('id-ID') }}
                      </template>
                      <span v-if="whMinStockSub(s.warehouseId)" class="pd-cell-sub">
                        {{ whMinStockSub(s.warehouseId) }}
                        <a
                          v-if="whEditing && whMinStockIsCustom(s.warehouseId) && whCalculatedHint(s.warehouseId)"
                          class="pd-cell-link"
                          @click="whMinDraft[s.warehouseId] = ''"
                        >Use calculated</a>
                      </span>
                    </td>
                    <td class="pd-td">{{ s.unit }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="empty-full">
              <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
              <p class="empty-full-title">No stock</p>
              <p class="empty-full-desc">Warehouses will appear here.</p>
            </div>

            <ErpPagination
              v-if="warehouseStock.length"
              :current-page="whPage"
              :per-page="whPerPage"
              :total="warehouseStock.length"
              @page-change="whPage = $event"
              @per-page-change="whPerPage = $event; whPage = 1"
            />
          </MpTabPanel>

        </MpTabPanels>
      </MpTabs>
    </div>

    <ActivityLogModal
      :is-open="activityOpen"
      :subject="product.name"
      :entries="activityEntries"
      @close="activityOpen = false"
    />

    <StockSerialDrawer
      :open="serialDrawerOpen"
      :product="serialDrawerProduct"
      :warehouse-id="serialDrawerWarehouseId"
      :initial-tab="serialDrawerTab"
      @update:open="serialDrawerOpen = $event"
    />

    <PrintBarcodeOptionsModal
      :open="printBarcodeOptionsOpen"
      @close="printBarcodeOptionsOpen = false"
      @confirm="confirmPrintBarcode"
    />

    <PdfPreviewModal
      :open="barcodePreviewOpen"
      :doc="barcodePreviewDoc"
      :filename="barcodePreviewFilename"
      title="Barcode preview"
      @close="barcodePreviewOpen = false"
    />

    <!-- Same drawer the replenishment worklist uses, so vendor terms are edited in
         exactly one place no matter where the user came from. -->
    <VendorItemDrawer
      v-model:is-open="vendorOpen"
      :sku="product.sku"
      @saved="vendorTick++"
    />
  </div>

  <div v-else class="detail-page">
    <div class="pd-notfound">
      <p class="empty-full-title">Product not found</p>
      <a class="pd-link" @click.prevent="goBack">Back to Products</a>
    </div>
  </div>
</template>

<style scoped>
/* ── Shell — identical to WarehouseDetailsPage.vue (docs/patterns/details-page-format.md §C) ── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: 12px; color: var(--mp-text-link); line-height: var(--mp-line-heights-md);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default);
}
.detail-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer; border: 1px solid transparent; white-space: nowrap; font-family: inherit;
}
.detail-btn--primary {
  background: var(--mp-colors-emerald-700, #029861); border-color: var(--mp-colors-emerald-700, #029861);
  color: var(--mp-text-inverse);
}
.detail-btn--primary:hover {
  background: var(--mp-colors-emerald-800, #186f4a); border-color: var(--mp-colors-emerald-800, #186f4a);
}
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column; gap: var(--mp-spacing-8);
}
.detail-updated {
  align-self: flex-start;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-link);
  cursor: pointer;
}
.detail-updated:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Tabs (green active-state override, per details-page-format.md §A.8) ── */
.detail-tabs { margin-top: 0; }
.detail-tabs :deep(.mp-tab--isSelected_true),
.detail-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.detail-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) {
  background-color: var(--mp-border-selected, #029861) !important;
}
.detail-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }

/* ── Product info / Purchase / Sales sections ── */
.pd-section { display: flex; flex-direction: column; }
.pd-section--flex { flex: 1; min-width: 0; }
.pd-section-title {
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px);
  color: var(--mp-text-default);
}
.pd-info-row { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.pd-image-col { flex-shrink: 0; width: 172px; }
.pd-image {
  width: 172px; height: 172px; object-fit: cover; border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral-subtle); border: 1px solid var(--mp-border-subtle);
}
.pd-field-col { display: flex; flex-direction: column; }
.pd-field-col--flex { flex: 1; min-width: 0; }
.pd-field-col--fixed { width: 270px; }
.pd-two-col { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.pd-purchase-row { display: flex; gap: var(--mp-spacing-6); }
.pd-link { color: var(--mp-text-link); cursor: pointer; }
.pd-link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Filter bar (Transaction type + search, right-aligned search per detail-page-format.md) ── */
.pd-filter-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-5); }
.pd-filter-bar--end { justify-content: flex-end; }
.pd-filter-left { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.pd-filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.pd-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  min-width: 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral); color: var(--mp-text-subtle);
}
.pd-search-input { flex: 1; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); min-width: 0; }
.pd-search-input::placeholder { color: var(--mp-text-placeholder); }
.pd-search-clear {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.pd-search-clear:hover { background: var(--mp-background-neutral-hovered); }

/* ── Tables (ErpTablePage header/row spec, raw table — mirrors WarehouseDetailsPage's tab tables) ── */
/* Where a number came from, under the number itself — muted so the figure still
   reads first and the provenance is there when questioned. */
.pd-table-caption {
  margin: 0 0 8px;
  max-width: 72ch;
  font-size: 12px;
  line-height: 1.5;
  color: var(--mp-text-subdued, #6b7280);
}

/* Echoes the in-table marker so the caption's word is recognisably the same. */
.pd-caption-mark { color: var(--mp-text-default, #374151); font-weight: 500; }

.pd-cell-link {
  margin-left: 6px;
  color: var(--mp-text-brand, #029861);
  cursor: pointer;
}
.pd-cell-link:hover { text-decoration: underline; }

.pd-cell-sub {
  display: block;
  font-size: 11px;
  line-height: 1.4;
  font-weight: 400;
  color: var(--mp-text-subdued, #9ca3af);
}
.pd-table-scroll { overflow-x: auto; }
.pd-table { width: 100%; min-width: max-content; border-collapse: collapse; }
.pd-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase; border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.pd-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.pd-tx-number { color: var(--mp-text-default); }
.pd-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default);
  vertical-align: top; white-space: nowrap; background: var(--mp-background-neutral);
}
.pd-td--num { text-align: right; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); font-variant-numeric: tabular-nums; }
.pd-td--action { text-align: right; padding-top: var(--mp-spacing-1); padding-bottom: var(--mp-spacing-1); }
.row-kebab { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); border-radius: var(--mp-radii-md); background: none; border: none; cursor: pointer; color: var(--mp-icon-default); }
.row-kebab:hover { background: var(--mp-background-neutral-hovered); }
.pd-tr:hover .pd-td { background: var(--mp-background-neutral-hovered); }

/* Number / Warehouse cells — the value links to the record's detail */
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

/* Expiration date cell — warning icon + tint when a batch is near/past expiry
   (mirrors StockTables.vue's wh-expiry-cell) */
.pd-expiry-cell { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); white-space: nowrap; }
.pd-expiry-cell--danger { color: var(--mp-text-danger, #a8352d); }
.pd-expiry-warn { display: inline-flex; align-items: center; color: var(--mp-text-danger, #a8352d); flex-shrink: 0; cursor: default; }

/* Movement cell: signed delta (green/red) + small caption lines */
.pd-movement { font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); }
.pd-movement--pos { color: var(--mp-text-success, #0f6d4d); }
.pd-movement--neg { color: var(--mp-text-danger); }
.pd-movement-caption {
  display: block;
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-text-secondary);
}

/* ── Empty state (illustrated — matches every other index/detail page) ── */
.empty-full { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-10, 40px) 0; }
.empty-illustration { width: auto; height: 240px; object-fit: contain; }
.empty-full-title { margin: 0 0 var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.pd-notfound { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-10) 0; }

/* Section title above a tab's table (matches PickingTaskDetailsPage.vue's "Sales orders") */
.linked-section-title { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pd-section-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-2); }
.pd-section-head .linked-section-title { margin: 0; }
.detail-btn--secondary { background: var(--mp-background-neutral, #fff); border-color: var(--mp-text-default, #080d0e); color: var(--mp-text-default); }
.detail-btn--secondary:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }

/* ── Unit conversions ── */
.pd-unit-panel { display: flex; flex-direction: column; }
.pd-unit-intro { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); margin-bottom: var(--mp-spacing-3); }
.pd-unit-empty {
  padding: var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.pd-unit-add {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  margin-top: var(--mp-spacing-4); flex-wrap: wrap;
}
.pd-unit-add-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pd-unit-eq { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.pd-unit-error { margin-top: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.pd-uc-remove {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary);
}
.pd-uc-remove:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-danger); }

/* ── Vendors ── */
.pd-vendor-panel { display: flex; flex-direction: column; }
.pd-vendor-name { display: block; color: var(--mp-text-default); }
.pd-vendor-note {
  display: block; margin-top: 2px;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle);
}
.pd-vendor-none { color: var(--mp-text-secondary); }
.pd-vendor-alt { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.pd-vendor-hint {
  margin-top: var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
</style>
