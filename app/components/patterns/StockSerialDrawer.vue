<script setup lang="ts">
import {
  MpIcon, MpSpinner, MpCheckbox,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import {
  getReservationForSerial, type WarehouseStockItem, type SerialUnit,
} from '~/data/warehouseDetails'
import { outgoingOrders } from '~/data/outgoing'
import { warehouses } from '~/data/warehouses'
import ContentList from '~/components/patterns/ContentList.vue'
import PrintBarcodeOptionsModal from '~/components/patterns/PrintBarcodeOptionsModal.vue'
import PdfPreviewModal from '~/components/patterns/PdfPreviewModal.vue'
import { generateBarcodeLabelPdf, generateBarcodeSheetPdf, type BarcodeLabelInfo } from '~/utils/barcodeLabelPdf'
import type jsPDF from 'jspdf'

const props = defineProps<{
  open: boolean
  product: WarehouseStockItem | null
  warehouseId: string
  initialTab?: 'available' | 'reserved'
}>()

const emit = defineEmits<{ 'update:open': [boolean] }>()

const list = computed<SerialUnit[]>(() =>
  props.initialTab === 'reserved'
    ? (props.product?.serials?.reserved ?? [])
    : (props.product?.serials?.available ?? [])
)

function salesNoFor(serial: string): string {
  if (!props.product) return '—'
  const r = getReservationForSerial(props.warehouseId, props.product.sku, serial)
  if (!r) return '—'
  return outgoingOrders.find((o) => o.id === r.taskId)?.salesNo ?? r.taskId
}

const search = ref('')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return list.value
  return list.value.filter(u => u.serial.toLowerCase().includes(q))
})

const PAGE = 50
const shown       = ref(PAGE)
const loadingMore = ref(false)
const visibleRows = computed(() => filtered.value.slice(0, shown.value))
const hasMore     = computed(() => shown.value < filtered.value.length)

function loadMore() {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  setTimeout(() => {
    shown.value    = Math.min(shown.value + PAGE, filtered.value.length)
    loadingMore.value = false
  }, 200)
}

// ssd-content is the scroll container; table-wrap hugs content height
const contentEl  = ref<HTMLElement | null>(null)
const sentinelEl = ref<HTMLElement | null>(null)
let scrollObserver: IntersectionObserver | null = null

function setupObserver() {
  scrollObserver?.disconnect()
  if (!contentEl.value || !sentinelEl.value) return
  scrollObserver = new IntersectionObserver(
    (entries) => { if (entries[0]!.isIntersecting) loadMore() },
    { root: contentEl.value, rootMargin: '0px 0px 80px 0px' },
  )
  scrollObserver.observe(sentinelEl.value)
}

watch(() => props.open, (v) => {
  if (!v) return
  shown.value  = PAGE
  search.value = ''
  step.value = 'list'
  selected.value = new Set()
  nextTick(setupObserver)
})

watch(search, () => {
  shown.value = PAGE
  nextTick(setupObserver)
})

// ── Bulk selection — checkboxes on the currently loaded rows (visibleRows),
// same scope as what's actually rendered under progressive loading. ──
const selected = ref<Set<string>>(new Set())
function toggleRow(row: SerialUnit): void {
  const next = new Set(selected.value)
  if (next.has(row.serial)) next.delete(row.serial)
  else next.add(row.serial)
  selected.value = next
}
function clearSelection(): void { selected.value = new Set() }
const allSelected  = computed(() => visibleRows.value.length > 0 && visibleRows.value.every(r => selected.value.has(r.serial)))
const someSelected = computed(() => !allSelected.value && selected.value.size > 0)
function toggleAll(): void {
  selected.value = allSelected.value ? new Set() : new Set(visibleRows.value.map(r => r.serial))
}
const selectedLabel = computed(() => {
  const n = selected.value.size
  return `${n} ${n === 1 ? 'serial number' : 'serial numbers'} selected`
})
// Selection can go stale once rows are filtered out (search) — drop anything no longer visible.
watch(visibleRows, (rows) => {
  const live = new Set(rows.map(r => r.serial))
  const next = new Set([...selected.value].filter(s => live.has(s)))
  if (next.size !== selected.value.size) selected.value = next
})

onUnmounted(() => scrollObserver?.disconnect())

const title = computed(() =>
  props.initialTab === 'reserved' ? 'Reserved serial numbers' : 'Available serial numbers'
)

function fmt(n: number) { return n.toLocaleString('id-ID') }
function close() { emit('update:open', false) }

// ── Serial number details — a second STEP within this same drawer (not a second
// drawer): picking a row swaps the panel's content in place; "back" returns to
// the list, close (X) always closes the whole drawer regardless of step. ──
const step = ref<'list' | 'detail'>('list')
const detailSerial = ref<SerialUnit | null>(null)
const warehouseName = computed(() => warehouses.find(w => w.id === props.warehouseId)?.name ?? '')
function openDetail(row: SerialUnit) {
  detailSerial.value = row
  step.value = 'detail'
}
function backToList() { step.value = 'list' }
// A serial number's barcode IS the serial number itself — no separate generated code.
const detailBarcode = computed(() => detailSerial.value?.serial ?? '')

// ── Print barcode — options modal (qty + columns) then the shared PDF preview.
// One target row prints a single label; a bulk target (row-selection "Print
// barcode" or the drawer-wide "Print all barcode") prints one label per serial
// on a shared sheet via generateBarcodeSheetPdf. ──
const printBarcodeOptionsOpen = ref(false)
const printBarcodeTarget = ref<SerialUnit | null>(null)
const printBulkTarget = ref<SerialUnit[] | null>(null)
const printBulkFilename = ref('')
function printSerialBarcode(row: SerialUnit) {
  printBarcodeTarget.value = row
  printBulkTarget.value = null
  printBarcodeOptionsOpen.value = true
}
function printSelectedBarcodes() {
  const rows = visibleRows.value.filter(r => selected.value.has(r.serial))
  if (!rows.length) return
  printBarcodeTarget.value = null
  printBulkTarget.value = rows
  printBulkFilename.value = `Barcodes - ${props.product?.sku ?? 'serial numbers'} (selected).pdf`
  printBarcodeOptionsOpen.value = true
}
function printAllBarcodes() {
  if (!filtered.value.length) return
  printBarcodeTarget.value = null
  printBulkTarget.value = filtered.value
  printBulkFilename.value = `Barcodes - ${props.product?.sku ?? 'serial numbers'} (all).pdf`
  printBarcodeOptionsOpen.value = true
}

const barcodePreviewOpen = ref(false)
const barcodePreviewDoc = ref<jsPDF | null>(null)
const barcodePreviewFilename = ref('')
async function confirmPrintBarcode({ qty, columns }: { qty: number; columns: 1 | 2 | 3 }) {
  if (!props.product) return
  const bulk = printBulkTarget.value
  const row  = printBarcodeTarget.value
  printBarcodeOptionsOpen.value = false
  if (bulk) {
    const labels: BarcodeLabelInfo[] = bulk.map(u => ({
      barcode: u.serial, batchNo: u.serial, productName: props.product!.name, sku: props.product!.sku,
    }))
    barcodePreviewDoc.value = await generateBarcodeSheetPdf(labels, columns, qty)
    barcodePreviewFilename.value = printBulkFilename.value
  } else if (row) {
    barcodePreviewDoc.value = await generateBarcodeLabelPdf({
      barcode: row.serial,
      batchNo: row.serial,
      productName: props.product.name,
      sku: props.product.sku,
    }, qty, columns)
    barcodePreviewFilename.value = `Barcode - ${row.serial}.pdf`
  } else {
    return
  }
  if (bulk) clearSelection()
  barcodePreviewOpen.value = true
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}
function seedFrom(s: string): number {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}
// The one transaction every serial has — the receipt that brought it into stock.
const receiptNumber = computed(() =>
  detailSerial.value ? `Stock In/Out #${10050 - (seedFrom(detailSerial.value.serial) % 40)}` : ''
)
</script>

<template>
  <Transition name="ssd">
  <div v-if="open && product" class="ssd-overlay" @click.self="close">
    <div class="ssd-panel" role="dialog" :aria-label="title">

      <header class="ssd-header">
        <div class="ssd-header-left">
          <button v-if="step === 'detail'" class="ssd-back" type="button" aria-label="Back to list" @click="backToList">
            <MpIcon name="chevrons-left" size="md" />
          </button>
          <h2 class="ssd-title">{{ step === 'detail' ? 'Serial number details' : title }}</h2>
        </div>
        <button class="ssd-close" type="button" aria-label="Close" @click="close">
          <MpIcon name="close" size="md" />
        </button>
      </header>

      <!-- Step: detail — one serial's own record, replacing the list in place -->
      <div v-if="step === 'detail' && detailSerial" class="ssd-content">
        <ContentList label="Serial number" :value="detailSerial.serial" />
        <ContentList label="Barcode" :value="detailBarcode" />
        <ContentList label="Warehouse" :value="warehouseName" />
        <ContentList label="Location" :value="detailSerial.location" />

        <h3 class="ssd-section-title">Transactions</h3>
        <div class="ssd-table-wrap">
          <table class="ssd-table">
            <thead>
              <tr>
                <th class="ssd-th">Date</th>
                <th class="ssd-th">Number</th>
              </tr>
            </thead>
            <tbody>
              <tr class="ssd-tr">
                <td class="ssd-td">{{ formatDate(detailSerial.createdAt) }}</td>
                <td class="ssd-td">{{ receiptNumber }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Step: list -->
      <template v-else>
      <!-- Product info bar -->
      <div class="ssd-infobar">
        <div class="ssd-infobar-product">
          <img class="ssd-thumb" :src="product.photo" :alt="product.name" loading="lazy" />
          <div class="ssd-infobar-names">
            <span class="ssd-name">{{ product.name }}</span>
            <span class="ssd-sku">{{ product.sku }}</span>
          </div>
        </div>
      </div>

      <!-- Search toolbar — no border/bg, search on right -->
      <div class="ssd-toolbar">
        <div class="ssd-search">
          <MpIcon name="search" size="md" />
          <input v-model="search" class="ssd-search-input" type="text" placeholder="Search..." />
          <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- ssd-content scrolls; table-wrap hugs content and scrolls x when wide -->
      <div ref="contentEl" class="ssd-content">
        <div class="ssd-table-wrap">
          <table class="ssd-table">
            <colgroup>
              <col style="width: 200px" />
              <col />
              <col v-if="initialTab === 'reserved'" style="width: 200px" />
              <col style="width: 56px" />
            </colgroup>
            <thead>
              <!-- Bulk bar — replaces the column headers while anything's selected,
                   same pattern as the misplaced-serials bulk bar (StockAdjustmentDetailsPage). -->
              <tr v-if="selected.size" class="ssd-tr-bulk">
                <th :colspan="initialTab === 'reserved' ? 4 : 3" class="ssd-th ssd-th--bulk">
                  <div class="ssd-bulkbar">
                    <MpCheckbox
                      id="ssd-select-all"
                      :is-checked="allSelected"
                      :is-indeterminate="someSelected"
                      @change="toggleAll"
                    />
                    <span class="ssd-bulkbar__count">{{ selectedLabel }}</span>
                    <button class="btn-enterprise btn-enterprise--primary btn-enterprise--sm" type="button" @click="printSelectedBarcodes">Print barcode</button>
                    <a class="ssd-bulkbar__clear" @click="clearSelection">Clear</a>
                  </div>
                </th>
              </tr>
              <tr v-else>
                <th class="ssd-th">
                  <span class="ssd-serial-cell">
                    <MpCheckbox
                      id="ssd-select-all"
                      :is-checked="allSelected"
                      :is-indeterminate="someSelected"
                      @change="toggleAll"
                    />
                    Serial number
                  </span>
                </th>
                <th class="ssd-th">Storage location</th>
                <th v-if="initialTab === 'reserved'" class="ssd-th">Sales order</th>
                <th class="ssd-th"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in visibleRows" :key="row.serial" class="ssd-tr">
                <td class="ssd-td">
                  <span class="ssd-serial-cell">
                    <MpCheckbox
                      :id="`ssd-select-${row.serial}`"
                      :is-checked="selected.has(row.serial)"
                      @change="toggleRow(row)"
                    />
                    <a class="cell-link cell-text" @click.stop="openDetail(row)">{{ row.serial }}</a>
                  </span>
                </td>
                <td class="ssd-td ssd-td--muted">{{ row.location }}</td>
                <td v-if="initialTab === 'reserved'" class="ssd-td">{{ salesNoFor(row.serial) }}</td>
                <td class="ssd-td ssd-td--action">
                  <MpPopover :id="`ssd-actions-${row.serial}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                    <MpPopoverTrigger>
                      <button class="row-kebab" aria-label="More actions" @click.stop>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
                        </svg>
                      </button>
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
                      <MpPopoverList>
                        <MpPopoverListItem @click="openDetail(row)">View details</MpPopoverListItem>
                        <MpPopoverListItem @click="printSerialBarcode(row)">Print barcode</MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </td>
              </tr>
              <tr v-if="!filtered.length">
                <td :colspan="initialTab === 'reserved' ? 4 : 3" class="ssd-td ssd-td--empty">
                  {{ search ? 'No matching serial numbers.' : 'No serial numbers.' }}
                </td>
              </tr>
              <!-- sentinel row at end of tbody triggers progressive load -->
              <tr aria-hidden="true" class="ssd-sentinel-row">
                <td :colspan="initialTab === 'reserved' ? 4 : 3"><div ref="sentinelEl" /></td>
              </tr>
            </tbody>
            <!-- sticky count/loading bar at the bottom of the table -->
            <tfoot>
              <tr>
                <td :colspan="initialTab === 'reserved' ? 4 : 3" class="ssd-td--count">
                  <span v-if="loadingMore" class="ssd-td--count-loading">
                    <MpSpinner size="sm" /> Loading…
                  </span>
                  <span v-else-if="filtered.length">
                    Showing {{ fmt(visibleRows.length) }} of {{ fmt(filtered.length) }} serial numbers
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <footer v-if="filtered.length" class="ssd-footer">
        <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="printAllBarcodes">
          Print all barcode
        </button>
      </footer>
      </template>

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
  </div>
  </Transition>
</template>

<style scoped>
.ssd-enter-active,
.ssd-leave-active { transition: background-color 250ms ease; }
.ssd-enter-from, .ssd-leave-to { background-color: transparent; }
.ssd-enter-active :deep(.ssd-panel) { transition: transform 350ms ease-out; }
.ssd-leave-active :deep(.ssd-panel)  { transition: transform 250ms ease-in; }
.ssd-enter-from :deep(.ssd-panel),
.ssd-leave-to :deep(.ssd-panel) { transform: translateX(calc(100% + 12px)); }

.ssd-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}
.ssd-panel {
  margin: var(--mp-spacing-3);
  width: min(680px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 24px;
  overflow: hidden;
}

/* Header */
.ssd-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.ssd-header-left { display: flex; align-items: center; gap: var(--mp-spacing-1); min-width: 0; }
.ssd-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ssd-back,
.ssd-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9); height: var(--mp-sizes-9); flex-shrink: 0;
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.ssd-back:hover,
.ssd-close:hover { background: var(--mp-background-neutral-hovered); }

/* Serial number detail step */
.ssd-section-title {
  margin: var(--mp-spacing-4) 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}

/* Info bar */
.ssd-infobar {
  flex-shrink: 0; display: flex; align-items: center;
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
}
.ssd-infobar-product { display: flex; align-items: center; gap: var(--mp-spacing-3); min-width: 0; }
.ssd-thumb {
  width: 40px; height: 40px; border-radius: var(--mp-radii-md); object-fit: cover; flex-shrink: 0;
  border: 1px solid var(--mp-border-subtle); background: var(--mp-background-neutral);
}
.ssd-infobar-names { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ssd-name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ssd-sku  { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* Search toolbar — no border/bg, search on right */
.ssd-toolbar {
  flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  margin-bottom: 20px;
}
.ssd-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary);
  width: 260px;
}
.ssd-search:focus-within { border-color: var(--mp-border-bold, #8c9596); box-shadow: inset 0 0 0 1px var(--mp-border-bold, #8c9596); }
.ssd-search-input {
  flex: 1; border: none; background: transparent;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md); outline: none;
}
.ssd-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }

/* ssd-content is the scroll container; shrinks when rows are few */
.ssd-content {
  flex: 1; min-height: 0; overflow-y: auto;
  padding: var(--mp-spacing-4);
}

/* List step: toolbar's own margin-bottom already sets the gap to the table, so drop the duplicate top padding */
.ssd-toolbar + .ssd-content {
  padding-top: 0;
}

/* Table-wrap hugs content height; overflow: clip lets sticky thead/tfoot work through it */
.ssd-table-wrap {
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-md);
  overflow: clip;
  overflow-x: auto;
}
.ssd-table { width: 100%; min-width: max-content; border-collapse: collapse; }

/* Sticky header */
.ssd-th {
  height: var(--mp-sizes-7); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
  position: sticky; top: 0; z-index: 2;
}

/* Data rows */
.ssd-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: 14px; font-weight: 400; font-family: Inter, sans-serif;
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); vertical-align: middle;
  background: var(--mp-background-neutral); white-space: nowrap;
}
.ssd-td--muted { color: var(--mp-text-secondary); }
.ssd-td--action { text-align: right; padding-top: var(--mp-spacing-1); padding-bottom: var(--mp-spacing-1); }
.row-kebab { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); border-radius: var(--mp-radii-md); background: none; border: none; cursor: pointer; color: var(--mp-icon-default); }
.row-kebab:hover { background: var(--mp-background-neutral-hovered); }
.ssd-td--empty { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-6); }

/* Row selection — checkbox merged into the Serial number cell (matches the
   misplaced-serials pattern in StockAdjustmentDetailsPage), and a bulk-actions
   row that replaces the column headers while anything's selected. */
/* vertical-align: middle — an inline-flex box still defaults to baseline
   alignment within its line box, which left the checkbox a couple px off from
   the header/row text next to it even with align-items: center centering its
   own children. */
.ssd-serial-cell { display: inline-flex; align-items: center; vertical-align: middle; gap: var(--mp-spacing-2); }
.ssd-serial-cell :deep(.mp-checkbox__root) { vertical-align: middle; }
.ssd-th--bulk { padding: 0; }
.ssd-bulkbar {
  display: flex; align-items: center; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-2) var(--mp-spacing-2);
  text-transform: none; font-weight: normal;
}
.ssd-bulkbar__count { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ssd-bulkbar__clear {
  margin-left: auto; cursor: pointer; text-decoration: none;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link);
}
.ssd-bulkbar__clear:hover { text-decoration: underline; text-underline-offset: 2px; }

/* Serial number cell — value is a link that switches to the detail step */
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

/* Sentinel row — zero height, invisible */
.ssd-sentinel-row td { padding: 0; height: 0; border: none; background: transparent; }
.ssd-sentinel-row td > div { height: 1px; }

/* Sticky count/loading footer — sticky on the td is more reliable cross-browser */
.ssd-td--count {
  position: sticky; bottom: 0; z-index: 2;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
  background: var(--mp-background-neutral);
}
.ssd-td--count-loading { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }

/* Sticky footer — secondary "Print all barcode" action, left-icon variant */
.ssd-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end;
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
  background: var(--mp-background-stage);
}

</style>
