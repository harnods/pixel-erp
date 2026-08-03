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
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, MpSelect, MpCheckbox, MpTooltip, MpIcon, css,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ClampText from '~/components/patterns/ClampText.vue'
import ActivityLogModal, { type ActivityEntry } from '~/components/patterns/ActivityLogModal.vue'
import ErpPagination from '~/components/patterns/ErpPagination.vue'
import StockSerialDrawer from '~/components/patterns/StockSerialDrawer.vue'
import PdfPreviewModal from '~/components/patterns/PdfPreviewModal.vue'
import PrintBarcodeOptionsModal from '~/components/patterns/PrintBarcodeOptionsModal.vue'
import {
  getProductDetail, getProductTransactions, getProductWarehouseStock, getProductBatches, getProductSerialStock,
  getProductAllSerials, type ProductBatchSummary,
} from '~/data/productDetails'
import { getWarehouseDetail, type WarehouseStockItem } from '~/data/warehouseDetails'
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
const TAB_NAMES = computed(() => ['transactions', 'unit-conversions', stockTabName.value])
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
function formatIDR(amount: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 2,
  }).format(amount)
}
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
            <ContentList label="Product type" :value="product.productType" />
            <ContentList label="Track stock by" :value="product.trackStockBy" />
            <ContentList v-if="!isWms" label="Default inventory account">
              <a class="pd-link">{{ product.defaultInventoryAccount }}</a>
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
              <ContentList label="Default purchase cost" :value="formatIDR(product.defaultPurchaseCost)" />
              <ContentList label="Average cost" :value="formatIDR(product.averageCost)" />
              <ContentList label="Last purchase cost" :value="formatIDR(product.lastPurchaseCost)" />
            </div>
            <div class="pd-field-col pd-field-col--flex">
              <ContentList label="Default purchase account">
                <a class="pd-link">{{ product.defaultPurchaseAccount }}</a>
              </ContentList>
              <ContentList label="Default purchase tax" :value="product.defaultPurchaseTax" />
            </div>
          </div>
        </section>
        <section v-if="!isWms" class="pd-section pd-section--flex">
          <h2 class="pd-section-title">Sales info</h2>
          <div class="pd-field-col pd-field-col--fixed">
            <ContentList label="Default sales price" :value="formatIDR(product.defaultSalesPrice)" />
            <ContentList label="Default sales account">
              <a class="pd-link">{{ product.defaultSalesAccount }}</a>
            </ContentList>
            <ContentList label="Default sales tax" :value="product.defaultSalesTax" />
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
          <MpTab id="pd-tab-units" value="unit-conversions">Unit conversions</MpTab>
          <MpTab v-if="product.trackStockBy === 'Batch'" id="pd-tab-batches" value="batches">Stock by batches</MpTab>
          <MpTab v-else-if="product.trackStockBy === 'Serial number'" id="pd-tab-serials" value="serials">Stock by serial numbers</MpTab>
          <MpTab v-else id="pd-tab-warehouses" value="warehouses">Stock by warehouses</MpTab>
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
                      <a class="cell-link cell-text" @click.stop>{{ tx.number }}</a>
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
              <p class="empty-full-desc">Warehouses will appear here.</p>
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

          <!-- Stock by warehouses -->
          <MpTabPanel v-else value="warehouses">
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
                    <td class="pd-td pd-td--num">{{ s.minStock.toLocaleString('id-ID') }}</td>
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
</style>
