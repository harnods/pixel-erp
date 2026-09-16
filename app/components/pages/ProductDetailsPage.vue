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
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, MpSelect, MpCheckbox, MpTooltip, MpIcon, MpInput, MpButton, MpButtonGroup, css,
} from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import ContentList from '~/components/patterns/ContentList.vue'
import ClampText from '~/components/patterns/ClampText.vue'
import ActivityLogModal, { type ActivityEntry } from '~/components/patterns/ActivityLogModal.vue'
import ErpPagination from '~/components/patterns/ErpPagination.vue'
import StockSerialDrawer from '~/components/patterns/StockSerialDrawer.vue'
import PdfPreviewModal from '~/components/patterns/PdfPreviewModal.vue'
import PrintBarcodeOptionsModal from '~/components/patterns/PrintBarcodeOptionsModal.vue'
import BatchFormModal from '~/components/patterns/BatchFormModal.vue'
import ExportModal from '~/components/patterns/ExportModal.vue'
import { BATCH_UPDATE_COLUMNS, batchUpdateTemplateRows } from '~/data/batchUpdateImport'
import { successToast } from '~/utils/toasts'
import {
  getProductDetail, getProductTransactions, getProductWarehouseStock, getProductBatches, getProductSerialStock,
  getProductAllSerials, type ProductBatchSummary,
} from '~/data/productDetails'
import {
  getBatchAttributeConfig, batchAttributeConfigActivity, batchAttributeDef, formatExpiry,
  type BatchAttributeSetting,
} from '~/data/batchAttributes'
import { gradeById } from '~/data/grades'
import { vendors } from '~/data/vendors'
import { getWarehouseDetail, setWarehouseMinStock, type WarehouseStockItem } from '~/data/warehouseDetails'
import { cutoverState } from '~/data/wmsCutover'
import { formatDateTimeLong } from '~/utils/date'
import { generateBarcodeLabelPdf, generateBarcodeSheetPdf } from '~/utils/barcodeLabelPdf'
import { TODAY } from '~/data/master'
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

// ── Tax info ───────────────────────────────────────────────────────────────────
// `djpCode` carries the DJP catalogue entry as one "<code> - <description>" label
// (that's how the classification list is stored, see taxClassificationCodes.ts).
// The PRD treats the Classification Code and its Description as two separate
// attributes — the description is looked up from the DJP master, never typed — so
// split the stored label back apart for display rather than duplicating the data.
const hasTaxInfo = computed(() => !!product.value?.djpCode)
const djpCodeOnly = computed(() => product.value?.djpCode?.split(' - ')[0] ?? '')
const djpDescription = computed(() => {
  const label = product.value?.djpCode ?? ''
  const sep = label.indexOf(' - ')
  return sep === -1 ? '' : label.slice(sep + 3)
})

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
const TAB_NAMES = computed(() => ['transactions', 'unit-conversions', ...new Set([stockTabName.value, 'warehouses'])])
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

// ── Formatters ─────────────────────────────────────────────────────────────────
function formatQty(n: number, unit: string) {
  return `${n.toLocaleString('id-ID')} ${unit}`
}
function formatDate(iso: string) {
  // A batch can have no expiry (the Unassigned batch, or an optional Expiry left
  // empty) — Intl throws "Invalid time value" on an invalid Date, so render "—".
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}
const createdLabel = computed(() => product.value ? formatDateTimeLong(product.value.createdAt) : '')

// ── Activity log ───────────────────────────────────────────────────────────────
const activityOpen = ref(false)

/** A batch attribute set as one line: "Expiry date (required), Vendor, Grade". */
function formatAttributeSet(settings: readonly { key: string; required: boolean }[]): string {
  if (!settings.length) return '—'
  return settings
    // Optional chaining: a failed attempt can carry a key that isn't in the catalog.
    .map(s => `${batchAttributeDef(s.key as BatchAttributeSetting['key'])?.label ?? s.key}${s.required ? ' (required)' : ''}`)
    .join(', ')
}
const batchAttributesLabel = computed(() => (product.value ? formatAttributeSet(getBatchAttributeConfig(product.value.sku)) : ''))

const ATTRIBUTE_ERROR_TEXT: Record<string, string> = {
  'too-many': 'More than 3 attributes',
  duplicate: 'Same attribute selected twice',
  'unknown-key': 'Attribute is not in the catalog',
}

const activityEntries = computed<ActivityEntry[]>(() => {
  const p = product.value
  if (!p) return []
  // Batch attribute set changes (Batch Attribute PRD story 6a), newest first —
  // failed attempts included, shown as old → new like any other edit.
  const attributeChanges: ActivityEntry[] = batchAttributeConfigActivity(p.sku).map(e => ({
    date: e.date,
    user: e.user,
    activity: e.outcome === 'success' ? 'Updated batch attributes' : 'Failed to update batch attributes',
    details: [
      { label: 'Batch attributes', value: `${formatAttributeSet(e.previous)} → ${formatAttributeSet(e.next)}` },
      ...(e.outcome === 'failed'
        ? [{ label: 'Result', value: `Failed — ${e.errors.map(c => ATTRIBUTE_ERROR_TEXT[c] ?? c).join('; ')}` }]
        : []),
    ],
  }))
  return [...attributeChanges, {
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

// Min. stock is the only figure here a person SETS — on hand, reserved, available
// and in transit are all measured by the warehouse, so they stay read only. Edits
// are held in a draft until Save: min. stock drives low-stock counts and
// replenishment, so a half-typed number shouldn't take effect on the way to the
// right one.
const whEditing = ref(false)
const whMinDraft = reactive<Record<string, string>>({})
function startEditMinStock() {
  for (const id of Object.keys(whMinDraft)) delete whMinDraft[id]
  for (const s of warehouseStock.value) whMinDraft[s.warehouseId] = String(s.minStock)
  whEditing.value = true
}
function saveMinStock() {
  if (!product.value) return
  for (const s of warehouseStock.value) {
    const cleaned = (whMinDraft[s.warehouseId] ?? '').replace(/\D/g, '')
    // A cleared field means "I didn't finish typing", not "no floor" — leave the
    // warehouse as it was. Zero is still settable by typing it.
    if (cleaned === '') continue
    const next = Number(cleaned)
    if (next === s.minStock) continue
    setWarehouseMinStock(s.warehouseId, product.value.sku, next)
  }
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

// ── Batch attributes in the batches table + New / Edit batch (Batch Attribute Phase 3) ──
/** One column per attribute on the product, in its order. */
const batchAttributeColumns = computed(() =>
  product.value
    ? getBatchAttributeConfig(product.value.sku).map(a => ({ key: a.key, label: batchAttributeDef(a.key).label }))
    : [],
)
/** An attribute as a table cell. Stored values are raw (vendor id, grade id, ISO date),
 *  so this names them; table dates stay numeric (rule/format-date). */
function batchAttributeCell(b: ProductBatchSummary, key: BatchAttributeSetting['key']): string {
  const value = b.attributes[key]
  if (!value) return '—'
  switch (key) {
    case 'expiry_date': return formatExpiry(value)
    case 'manufacturing_date':
    case 'best_before_date': return formatDate(value)
    case 'supplier': return vendors.find(v => v.id === value)?.name ?? value
    case 'grade': {
      const grade = gradeById(value)
      return grade ? `${grade.name} (Rank ${grade.rank})` : value
    }
    default: return value
  }
}

const batchFormOpen = ref(false)
/** null = New batch; a batch id = Edit that batch. */
const batchFormBatchId = ref<string | null>(null)
function openNewBatch() {
  batchFormBatchId.value = null
  batchFormOpen.value = true
}
function openEditBatch(b: ProductBatchSummary) {
  batchFormBatchId.value = b.id
  batchFormOpen.value = true
}

// Export batches (rule/export-modal) — same columns as the Update batches import
// template, so an export can be edited and imported back.
const batchExportOpen = ref(false)
const batchExportColumns = BATCH_UPDATE_COLUMNS.map((c, i) => ({ key: c.key, label: c.label, required: i < 2 }))
async function exportBatches({ columns }: { columns: string[] }) {
  batchExportOpen.value = false
  const picked = BATCH_UPDATE_COLUMNS.filter((c) => columns.includes(c.key))
  const rows = batchUpdateTemplateRows([product.value!.sku]).map((r) => picked.map((c) => r[c.key]))
  const XLSX = await import('xlsx')
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([picked.map((c) => c.label), ...rows]), 'Batches')
  XLSX.writeFile(book, `${product.value!.sku}-batches.xlsx`)
  successToast('Batches exported')
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
// The Unassigned batch has no barcode — it isn't a physical lot — so it's skipped.
function printAllBatchBarcodes() {
  const batches = filteredBatches.value.filter(b => b.barcode)
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
            <ContentList v-if="product.trackStockBy === 'Batch'" label="Batch attributes" :value="batchAttributesLabel" />
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

      <!-- Purchase info / Sales info / Tax info — all three are ERP only; WMS
           doesn't deal in pricing/accounting and has no tax module. -->
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

        <!-- Tax info — ERP only (WMS Standalone has no tax module), and always
             rendered once we're in ERP, whether or not the product is classified:
             tax classification is optional at creation and is typically completed
             later by Tax/Finance (PRD-03a BR-002), so the section doubles as the
             signal that a product still has a classification gap. Same vertical-list
             pattern as Sales info (single column, fixed 270px). -->
        <section v-if="!isWms" class="pd-section pd-section--flex">
          <h2 class="pd-section-title">Tax info</h2>
          <div v-if="!hasTaxInfo" class="pd-tax-empty">
            <MpIcon name="information" size="sm" color="icon.secondary" />
            <span>
              Tax info is incomplete.
              <a class="pd-link" @click.prevent="router.push(`/product-list/${product.sku}/edit`)">Add tax info</a>
              to use this product on a tax document.
            </span>
          </div>
          <div v-else class="pd-field-col pd-field-col--fixed">
            <ContentList label="Product classification" :value="product.productClassification" />
            <ContentList label="DJP code" :value="djpCodeOnly" />
            <ContentList label="DJP description">
              <ClampText :text="djpDescription" :lines="3" />
            </ContentList>
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
          <MpTabPanel value="unit-conversions">
            <div class="empty-full">
              <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
              <p class="empty-full-title">No unit conversions</p>
              <p class="empty-full-desc">Unit conversions will appear here.</p>
            </div>
          </MpTabPanel>

          <!-- Stock by batches (batch-tracked products) -->
          <MpTabPanel v-if="product.trackStockBy === 'Batch'" value="batches">
            <!-- rule/filter-bar-anatomy: left group | right group. Deviation, asked for by
                 design: Print all barcode sits to the RIGHT of the search pill rather than
                 search being last, and the archived filter sits with the tools. -->
            <div class="pd-filter-bar">
              <div class="pd-filter-left">
                <!-- rule/filter-bar-action-tertiary: the create action is the black tertiary
                     button. It leads the left group so it lines up with the table below. -->
                <MpButton variant="tertiary" is-rounded left-icon="add" @click="openNewBatch">New batch</MpButton>
              </div>
              <div class="pd-filter-right">
                <MpCheckbox
                  id="pd-show-archived-batches" :is-checked="showArchivedBatches"
                  @change="showArchivedBatches = !showArchivedBatches"
                >Show archived batches</MpCheckbox>
                <!-- rule/filter-bar-icon-group: ghost icon tools in one group, directly left
                     of the search pill. Export = download, Import = upload
                     (names checked against the Pixel library, rule/icon-pixel-library). -->
                <MpButtonGroup>
                  <MpTooltip id="tt-pd-batch-export" label="Export" placement="bottom" use-portal>
                    <MpButton
                      variant="ghost" is-rounded left-icon="download"
                      aria-label="Export" @click="batchExportOpen = true"
                    />
                  </MpTooltip>
                  <!-- rule/btn-dropdown-mppopover: Import opens a menu of import types. No
                       MpTooltip here — a tooltip wrapper breaks a popover trigger
                       (rule/btn-icon-tooltip's kebab exception); the aria-label names it. -->
                  <MpPopover id="pd-batch-import" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                    <MpPopoverTrigger>
                      <MpButton variant="ghost" is-rounded left-icon="upload" aria-label="Import" />
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
                      <MpPopoverList>
                        <MpPopoverListItem
                          @click="router.push({ path: '/product-list/import-batches', query: { sku: product.sku } })"
                        >Update batches from spreadsheet</MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </MpButtonGroup>
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
                  <!-- One column per batch attribute on the product (Batch Attribute Phase 3). -->
                  <col
                    v-for="c in batchAttributeColumns" :key="c.key"
                    :class="c.key === 'supplier' ? 'pd-col-attr pd-col-attr--vendor' : 'pd-col-attr'"
                  />
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
                    <th v-for="c in batchAttributeColumns" :key="c.key" class="pd-th">{{ c.label }}</th>
                    <th class="pd-th">Description</th>
                    <th class="pd-th pd-th--num">On hand</th>
                    <th class="pd-th pd-th--num">Reserved</th>
                    <th class="pd-th pd-th--num">Available</th>
                    <th class="pd-th">Unit</th>
                    <th class="pd-th"></th>
                  </tr>
                </thead>
                <tbody>
                  <!-- Keyed by the stable batch id, so a renamed batch keeps its row. -->
                  <tr v-for="b in pagedBatches" :key="b.id" class="pd-tr">
                    <td class="pd-td">
                      <a class="cell-link cell-text" @click.stop="viewBatch(b.batchNo)">{{ b.batchNo }}</a>
                    </td>
                    <td v-for="c in batchAttributeColumns" :key="c.key" class="pd-td">
                      <!-- Expiry keeps its near-expiry warning; a month expiry counts as its last day. -->
                      <span
                        v-if="c.key === 'expiry_date' && b.attributes.expiry_date"
                        class="pd-expiry-cell" :class="{ 'pd-expiry-cell--danger': isExpiryWarning(b.expiryDate) }"
                      >
                        {{ batchAttributeCell(b, c.key) }}
                        <MpTooltip v-if="isExpiryWarning(b.expiryDate)" :id="`pd-tt-exp-${b.batchNo}`" :label="expiryTooltip(b.expiryDate)" placement="top" use-portal>
                          <span class="pd-expiry-warn" @click.stop><MpIcon name="warning-triangle" size="sm" /></span>
                        </MpTooltip>
                      </span>
                      <template v-else>{{ batchAttributeCell(b, c.key) }}</template>
                    </td>
                    <td class="pd-td">{{ b.description || '—' }}</td>
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
                            <!-- The Unassigned batch can't be edited (PM answer A5). -->
                            <MpPopoverListItem v-if="!b.isUnassigned" @click="openEditBatch(b)">Edit</MpPopoverListItem>
                            <MpPopoverListItem v-if="!b.isUnassigned" @click="printBatchBarcode(b)">Print barcode</MpPopoverListItem>
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
              <!-- Search-not-matched differs from first-run (docs/design/reachable-states.md). -->
              <template v-if="batchSearch.trim()">
                <p class="empty-full-title">"{{ batchSearch.trim() }}" not found</p>
                <p class="empty-full-desc">Recheck the keywords you have typed and try searching again.</p>
              </template>
              <template v-else>
                <p class="empty-full-title">No batches</p>
                <p class="empty-full-desc">Batches will appear here.</p>
              </template>
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
                  <col style="width: 110px" />
                  <col style="width: 90px" />
                </colgroup>
                <thead>
                  <tr>
                    <th class="pd-th">Warehouse</th>
                    <th class="pd-th pd-th--num">On hand qty</th>
                    <th class="pd-th pd-th--num">Reserved qty</th>
                    <th class="pd-th pd-th--num">Available qty</th>
                    <th class="pd-th pd-th--num">In transit qty</th>
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
                    <td class="pd-td pd-td--num">
                      <MpInput
                        v-if="whEditing"
                        :id="`pd-wh-min-stock-${s.warehouseId}`"
                        v-model="whMinDraft[s.warehouseId]"
                        type="number"
                        :aria-label="`Min. stock for ${s.warehouseName}`"
                        :class="css({ width: '88px' })"
                      />
                      <template v-else>{{ s.minStock.toLocaleString('id-ID') }}</template>
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

    <!-- New batch / Edit batch — the list re-reads getProductBatches, so a saved batch
         shows up (or updates) in the Stock by batches table on its own. -->
    <BatchFormModal
      v-if="product.trackStockBy === 'Batch'"
      :open="batchFormOpen"
      :sku="product.sku"
      :batch-id="batchFormBatchId"
      @close="batchFormOpen = false"
    />

    <ExportModal
      v-if="product.trackStockBy === 'Batch'"
      :open="batchExportOpen"
      title="Export batches"
      entity-label="batches"
      :columns="batchExportColumns"
      :total="batchUpdateTemplateRows([product.sku]).length"
      @close="batchExportOpen = false"
      @export="exportBatches"
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
  background: var(--mp-background-neutral-subtle, #f8f9f9); padding: 0 var(--mp-spacing-6);
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
  background: var(--mp-background-stage, #ffffff);
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
  background: var(--mp-background-neutral-subtle, #f8f9f9); border: 1px solid var(--mp-border-subtle, #e5e7e7);
}
.pd-field-col { display: flex; flex-direction: column; }
.pd-field-col--flex { flex: 1; min-width: 0; }
.pd-field-col--fixed { width: 270px; }
/* Tax info empty state — an unclassified product isn't an error, just a gap Tax/
   Finance still has to close, so this reads as an inline hint, not a warning. */
.pd-tax-empty {
  display: flex;
  gap: var(--mp-spacing-2);
  align-items: flex-start;
  padding: var(--mp-spacing-2) 0;
  max-width: 360px;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-lg, 20px);
  color: var(--mp-text-secondary);
}
.pd-tax-empty :deep(svg) { flex: none; margin-top: 2px; }
.pd-two-col { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.pd-purchase-row { display: flex; gap: var(--mp-spacing-6); }
.pd-link { color: var(--mp-text-link); cursor: pointer; }
.pd-link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Filter bar (Transaction type + search, right-aligned search per detail-page-format.md) ── */
.pd-filter-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-5); }
.pd-filter-bar--end { justify-content: flex-end; }
.pd-filter-left { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.pd-filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
/* Batch attribute columns (Stock by batches) — Vendor names need more room than dates and grades. */
.pd-col-attr { width: var(--mp-sizes-36, 144px); }
.pd-col-attr--vendor { width: var(--mp-sizes-56, 224px); }
.pd-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  min-width: 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral, #ffffff); color: var(--mp-text-subtle);
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
.pd-search-clear:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

/* ── Tables (ErpTablePage header/row spec, raw table — mirrors WarehouseDetailsPage's tab tables) ── */
.pd-table-scroll { overflow-x: auto; }
.pd-table { width: 100%; min-width: max-content; border-collapse: collapse; }
.pd-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase; border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  white-space: nowrap;
}
.pd-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.pd-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  vertical-align: top; white-space: nowrap; background: var(--mp-background-neutral, #ffffff);
}
.pd-td--num { text-align: right; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); font-variant-numeric: tabular-nums; }
.pd-td--action { text-align: right; padding-top: var(--mp-spacing-1); padding-bottom: var(--mp-spacing-1); }
.pd-tx-number { color: var(--mp-text-default); }
.row-kebab { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); border-radius: var(--mp-radii-md); background: none; border: none; cursor: pointer; color: var(--mp-icon-default); }
.row-kebab:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.pd-tr:hover .pd-td { background: var(--mp-background-neutral-hovered, #eef0f3); }

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
</style>
