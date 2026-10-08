<script setup lang="ts">
/**
 * Batch details — one lot of a batch-tracked product (Figma: "Products / Batch
 * details"). Reached from the product's "Stock by batches" tab. Shares the exact
 * master-data detail shell with ProductDetailsPage.vue / WarehouseDetailsPage.vue
 * (breadcrumb, Actions dropdown, activity log link + modal, MpTabs) but a simpler
 * 2-column info section (no photo, no Purchase/Sales info) since a batch has no
 * accounting fields of its own — those live on the parent product.
 *
 * Batch Attribute (plan Phase 3): Batch info lists the product's attributes in its
 * order, Edit opens BatchFormModal, and the activity log shows recorded creates/edits.
 *
 * Batch Traceability (merged here 2026-10-08, replacing the separate traceability detail
 * page): for a product batch the Transactions tab's rows come from the traceability
 * ledger (`batchLedgerRows`), so each line also carries its transaction type, warehouses,
 * counterparty, signed mutation and secondary-unit balance, expands to the attribute
 * values recorded on it, and shows the attribute-change markers between movements.
 * Batch info carries Total received / Total issued, and Related batch is a tab.
 * A warehouse-scoped lot and the Unassigned batch aren't in that ledger, so they keep
 * the plain transaction list and get no Related batch tab.
 */
import {
  MpButton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, MpSelect, css,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ClampText from '~/components/patterns/ClampText.vue'
import ActivityLogModal, { type ActivityEntry } from '~/components/patterns/ActivityLogModal.vue'
import ErpPagination from '~/components/patterns/ErpPagination.vue'
import PrintBarcodeOptionsModal from '~/components/patterns/PrintBarcodeOptionsModal.vue'
import PdfPreviewModal from '~/components/patterns/PdfPreviewModal.vue'
import BatchFormModal from '~/components/patterns/BatchFormModal.vue'
import { generateBarcodeLabelPdf } from '~/utils/barcodeLabelPdf'
import type jsPDF from 'jspdf'
import {
  getBatchDetail, getWarehouseBatchDetail, getBatchTransactions, getBatchWarehouseStock,
  type ProductBatchSummary,
} from '~/data/productDetails'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import {
  getBatchTrace, batchAttributeChanges, batchLedgerRows, batchStockPosition,
  relatedBatches, attributeCell,
  type BatchLedgerRow, type RelatedBatchRow,
} from '~/data/batchTraceability'
import { TRACE_ATTRIBUTE_COLUMNS, useTraceabilityCells } from '~/composables/useTraceabilityCells'
import { warehouses } from '~/data/warehouses'
import { customerName } from '~/data/customers'
import { batchAttributeDef, formatExpiry, getBatchAttributeConfig, type BatchAttributeKey } from '~/data/batchAttributes'
import { batchActivityFor } from '~/data/batchStore'
import { gradeById } from '~/data/grades'
import { vendors } from '~/data/vendors'
import { formatDateLong, formatDateTimeLong } from '~/utils/date'

// orderId is "sku::batchNo" from the Products path, OR "warehouseId::sku::batchNo" when
// opened from Warehouse Details — the batch page stays under /warehouses in that case,
// same page format, just warehouse-scoped data + breadcrumb.
const props = defineProps<{ orderId: string }>()
const router = useRouter()
const route = useRoute()

const parts = computed(() => props.orderId.split('::'))
const warehouseId = computed(() => (parts.value.length >= 3 ? parts.value[0]! : null))
const sku = computed(() => (warehouseId.value ? parts.value[1]! : parts.value[0]!))
const batchNo = computed(() => (warehouseId.value ? parts.value[2]! : parts.value[1]!))
const warehouseName = computed(() => (warehouseId.value ? getWarehouseDetail(warehouseId.value)?.name ?? '' : ''))
const batch = computed(() =>
  warehouseId.value
    ? getWarehouseBatchDetail(warehouseId.value, sku.value, batchNo.value)
    : getBatchDetail(sku.value, batchNo.value),
)

function goToProduct() { router.push(`/product-list/${sku.value}`) }
function goToProducts() { router.push('/product-list') }
function goToWarehouse() { if (warehouseId.value) router.push(`/warehouses/${warehouseId.value}?tab=batches`) }
function goToWarehouses() { router.push('/warehouses') }

const { attributeText, mutationText, qtyText, vendorName } = useTraceabilityCells()

// ── Tabs — driven by ?section= (see ProductDetailsPage.vue for why not ?tab=). ──
// Related batch only exists for a traced product batch (see isTraced below), and the
// list must match the rendered order — MpTabs addresses tabs by index.
const TAB_NAMES = computed(() => (isTraced.value
  ? ['transactions', 'warehouses', 'related']
  : ['transactions', 'warehouses']))
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
const updatedLabel = computed(() => batch.value ? formatDateTimeLong(batch.value.updatedAt) : '')

/** One attribute (or batch number / description) value as shown to people. Stored
 *  values are raw — vendor id, grade id, ISO date — so this is where they're named. */
function formatAttributeValue(field: BatchAttributeKey | 'batchNo' | 'description', value: string | null | undefined): string {
  if (!value) return '—'
  switch (field) {
    case 'expiry_date': return formatExpiry(value, 'long')
    case 'manufacturing_date':
    case 'best_before_date': return formatDateLong(value)
    case 'supplier': return vendors.find(v => v.id === value)?.name ?? value
    case 'grade': {
      const grade = gradeById(value)
      if (!grade) return value
      return `${grade.name} (Rank ${grade.rank})${grade.status === 'inactive' ? ' · Inactive' : ''}`
    }
    default: return value
  }
}

// ── Batch attributes ─────────────────────────────────────────────────────────────
/** The product's current attribute set, in its order. The Unassigned batch never
 *  carries attributes (PM answer A5), so it shows none. */
const attributeRows = computed(() => {
  const b = batch.value
  if (!b || b.isUnassigned) return []
  return getBatchAttributeConfig(sku.value).map(a => ({
    key: a.key,
    label: batchAttributeDef(a.key).label,
    value: formatAttributeValue(a.key, b.attributes[a.key]),
  }))
})

// ── Edit ─────────────────────────────────────────────────────────────────────────
/** Product batches only: warehouse lots are seed data outside the product's batch
 *  list, and the Unassigned batch can't be edited (PM answer A5). */
const canEdit = computed(() => !!batch.value && !batch.value.isUnassigned && !batch.value.id.includes('::lot::'))

// ── Traceability ────────────────────────────────────────────────────────────────
/** The report traces product batches; warehouse-scoped lots and the Unassigned batch
 *  aren't in its ledger, so they keep the plain transaction list. */
const isTraced = computed(() =>
  !warehouseId.value && !!batch.value && !batch.value.isUnassigned && !!getBatchTrace(sku.value, batchNo.value),
)
/** Totals behind Batch info's Total received / Total issued. */
const position = computed(() => (isTraced.value ? batchStockPosition(sku.value, batchNo.value) : undefined))
function warehouseLabel(id: string | null): string {
  return id ? warehouses.find((w) => w.id === id)?.name ?? id : '—'
}
function counterpartyLabel(row: BatchLedgerRow): string {
  if (!row.counterparty) return '—'
  return row.counterparty.kind === 'customer' ? customerName(row.counterparty.id) : vendorName(row.counterparty.id)
}
/** Dual Unit Inventory products carry a second unit; the rest read NA. */
const secondaryUnit = computed(() => position.value?.secondaryUnit ?? null)
function secondaryMutation(row: BatchLedgerRow): string {
  return row.secondaryDelta === null ? 'NA' : mutationText(row.direction, row.secondaryDelta, secondaryUnit.value)
}
function secondaryBalance(row: BatchLedgerRow): string {
  return row.balanceSecondary === null ? 'NA' : qtyText(row.balanceSecondary, secondaryUnit.value)
}
/** Recorded attribute values behind an expanded row. */
function recordedAttributes(row: BatchLedgerRow) {
  return TRACE_ATTRIBUTE_COLUMNS.map((a) => ({
    key: a.key,
    label: a.label,
    value: attributeText(attributeCell(sku.value, row.attributes, a.key), a.key) || '—',
    changed: row.changedAttributes.includes(a.key),
  }))
}

const editOpen = ref(false)
function onBatchSaved(saved: ProductBatchSummary) {
  // A rename changes the batch number in the URL — follow it so the page still resolves.
  if (!warehouseId.value && saved.batchNo !== batchNo.value) {
    router.replace({ path: `/product-list/${sku.value}/batches/${encodeURIComponent(saved.batchNo)}`, query: route.query })
  }
}

// ── Activity log ───────────────────────────────────────────────────────────────
const CHANGE_LABELS: Record<string, string> = { batchNo: 'Number', description: 'Description' }
function changeLabel(field: string): string {
  return CHANGE_LABELS[field] ?? batchAttributeDef(field as BatchAttributeKey)?.label ?? field
}

const activityOpen = ref(false)
const activityEntries = computed<ActivityEntry[]>(() => {
  const b = batch.value
  if (!b) return []
  const recorded = batchActivityFor(b.id)
  // Recorded creates/edits, newest first — an edit reads old → new.
  const entries: ActivityEntry[] = recorded.map(e => ({
    date: e.date,
    user: e.user,
    activity: e.action === 'created' ? 'Created' : 'Updated',
    details: e.changes.map(c => ({
      label: changeLabel(c.field),
      value: e.action === 'created'
        ? formatAttributeValue(c.field, c.to)
        : `${formatAttributeValue(c.field, c.from)} → ${formatAttributeValue(c.field, c.to)}`,
    })),
  }))
  // Seed batches existed before anything was recorded — start their trail from the
  // record itself (rule/activity-log-entries).
  if (!recorded.some(e => e.action === 'created')) {
    entries.push({
      date: b.createdAt ?? b.updatedAt,
      user: b.createdBy ?? b.updatedBy,
      activity: 'Created',
      details: [
        { label: 'Number', value: b.batchNo },
        ...(b.attributes.expiry_date ? [{ label: 'Expiry date', value: formatExpiry(b.attributes.expiry_date, 'long') }] : []),
      ],
    })
  }
  // The seeded regrade behind a graded batch's receipt (Batch Traceability story 9) —
  // listed here too, so this trail and the traceability journey tell the same story.
  if (!warehouseId.value) {
    for (const marker of batchAttributeChanges(sku.value, b.batchNo).filter(m => m.id.endsWith('::regrade'))) {
      entries.push({
        date: marker.date,
        user: marker.user,
        activity: 'Updated',
        details: marker.changes.map(c => ({
          label: changeLabel(c.key),
          value: `${formatAttributeValue(c.key, c.from)} → ${formatAttributeValue(c.key, c.to)}`,
        })),
      })
    }
  }
  return entries.sort((a, z) => z.date.localeCompare(a.date))
})

// empty-state illustration (runtime public path, not a build-time import)
const emptyIllustration = '/illustrations/empty-folder.png'

// ── Transactions tab ─────────────────────────────────────────────────────────────
// A traced product batch reads the traceability ledger (type, warehouses, counterparty,
// mutation, balance, recorded attributes + the quantity columns); anything else keeps
// the plain seeded transaction list, which fills only the columns it has.
const tracedRows = computed<BatchLedgerRow[]>(() =>
  isTraced.value ? [...batchLedgerRows(sku.value, batchNo.value)].reverse() : [])

interface TxRow {
  id: string
  date: string
  number: string
  type: string
  delta: number
  affects: string[]
  onHand: number
  reserved: number
  available: number
  inTransit: number
  unit: string
  /** Traced rows only — the journey columns and the expandable snapshot. */
  traced: BatchLedgerRow | null
}

const allTransactions = computed<TxRow[]>(() => {
  if (!batch.value) return []
  if (isTraced.value) {
    return tracedRows.value.map((r) => ({
      id: r.id,
      date: r.date,
      number: r.number,
      type: r.type,
      delta: r.baseDelta,
      affects: [],
      onHand: r.balanceBase,
      reserved: r.reserved,
      available: r.available,
      inTransit: r.inTransit,
      unit: r.unit,
      traced: r,
    }))
  }
  return getBatchTransactions(sku.value, batchNo.value).map((t) => ({
    id: t.id,
    date: t.date,
    number: t.number,
    type: t.type,
    delta: t.delta,
    affects: t.affects,
    onHand: t.onHand,
    reserved: t.reserved,
    available: t.available,
    inTransit: t.onTheWay,
    unit: t.unit,
    traced: null,
  }))
})

// Attribute changes are not movements, so they stay out of this table — the Activity
// log lists them (Batch Traceability story 9).

// A row expands to the attribute values recorded on that transaction.
const expandedRows = ref(new Set<string>())
function isRowOpen(id: string) { return expandedRows.value.has(id) }
function toggleRow(id: string) {
  const next = new Set(expandedRows.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedRows.value = next
}
/** Arriving from By transaction highlights that line. */
const highlightTransaction = computed(() => (typeof route.query.transaction === 'string' ? route.query.transaction : ''))

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

// ── Print barcode (same options + preview flow as Product/Inventory batch print) ──
const printBarcodeOptionsOpen = ref(false)
const barcodePreviewOpen = ref(false)
const barcodePreviewDoc = ref<jsPDF | null>(null)
const barcodePreviewFilename = ref('')
function openPrintBarcode() { printBarcodeOptionsOpen.value = true }
async function confirmPrintBarcode({ qty, columns }: { qty: number; columns: 1 | 2 | 3 }) {
  const b = batch.value
  if (!b) return
  printBarcodeOptionsOpen.value = false
  barcodePreviewDoc.value = await generateBarcodeLabelPdf({
    barcode: b.barcode,
    batchNo: b.batchNo,
    productName: b.productName,
    sku: b.sku,
  }, qty, columns)
  barcodePreviewFilename.value = `Barcode - ${b.batchNo}.pdf`
  barcodePreviewOpen.value = true
}

// ── Related batch tab (Batch Traceability story 10) ─────────────────────────────
const related = computed(() => (isTraced.value
  ? relatedBatches(sku.value, batchNo.value)
  : { sources: [] as RelatedBatchRow[], results: [] as RelatedBatchRow[] }))
function openRelated(row: RelatedBatchRow) {
  router.push(`/product-list/${row.sku}/batches/${encodeURIComponent(row.batchNo)}`)
}

// ── Stock by warehouses tab ──────────────────────────────────────────────────────
const warehouseStock = computed(() => batch.value ? getBatchWarehouseStock(sku.value, batchNo.value) : [])
const whPage = ref(1)
const whPerPage = ref(25)
const pagedWarehouseStock = computed(() => {
  const start = (whPage.value - 1) * whPerPage.value
  return warehouseStock.value.slice(start, start + whPerPage.value)
})
</script>

<template>
  <div v-if="batch" class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <div v-if="warehouseId" class="detail-breadcrumb-row">
          <MpButton class="detail-breadcrumb" @click="goToWarehouses">Warehouses</MpButton>
          <span class="detail-breadcrumb-sep">/</span>
          <MpButton class="detail-breadcrumb" @click="goToWarehouse">{{ warehouseName }}</MpButton>
        </div>
        <div v-else class="detail-breadcrumb-row">
          <MpButton class="detail-breadcrumb" @click="goToProducts">Products</MpButton>
          <span class="detail-breadcrumb-sep">/</span>
          <MpButton class="detail-breadcrumb" @click="goToProduct">{{ batch.productName }}</MpButton>
        </div>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ batch.batchNo }}</h1>
        </div>
      </div>

      <MpPopover id="bd-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton class="detail-btn detail-btn--primary">
            Actions
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem v-if="canEdit" @click="editOpen = true">Edit</MpPopoverListItem>
            <!-- The Unassigned batch isn't a physical lot, so it has no label to print. -->
            <MpPopoverListItem v-if="!batch?.isUnassigned" @click="openPrintBarcode">Print barcode</MpPopoverListItem>
            <MpPopoverListItem :class="css({ color: 'var(--mp-text-critical)' })">Archive</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </header>

    <!-- ── Stage ── -->
    <div class="detail-stage">

      <!-- Batch info -->
      <section class="pd-section">
        <h2 class="pd-section-title">Batch info</h2>
        <div class="pd-info-row">
          <div class="pd-field-col" style="width: 368px">
            <ContentList label="Number" :value="batch.batchNo" />
            <!-- The product's batch attributes, in its order (Batch Attribute Phase 3). -->
            <ContentList v-for="a in attributeRows" :key="a.key" :label="a.label" :value="a.value" />
            <ContentList label="Description">
              <ClampText :text="batch.description || '—'" :lines="2" />
            </ContentList>
          </div>
          <div class="pd-field-col pd-field-col--flex">
            <ContentList label="On hand qty" :value="formatQty(batch.onHand, batch.unit)" />
            <ContentList label="Reserved qty" :value="formatQty(batch.reserved, batch.unit)" />
            <ContentList label="Available qty" :value="formatQty(batch.available, batch.unit)" />
            <ContentList label="Min. stock" :value="formatQty(batch.minStock, batch.unit)" />
            <!-- Traceability totals (Received − Issued = on hand) -->
            <template v-if="position">
              <ContentList label="Total received" :value="formatQty(position.received, batch.unit)" />
              <ContentList label="Total issued" :value="formatQty(position.issued, batch.unit)" />
            </template>
          </div>
        </div>
      </section>

      <a class="detail-updated" @click.prevent="activityOpen = true">
        Last updated by {{ batch.updatedBy }} on {{ updatedLabel }}
      </a>

      <!-- ── Tabs ── -->
      <MpTabs id="bd-detail-tabs" v-model="activeTabIndex" is-manual variant-color="green" class="detail-tabs">
        <MpTabList>
          <MpTab id="bd-tab-transactions" value="transactions">Transactions</MpTab>
          <MpTab id="bd-tab-warehouses" value="warehouses">Stock by warehouses</MpTab>
          <MpTab v-if="isTraced" id="bd-tab-related" value="related">Related batch</MpTab>
        </MpTabList>
        <MpTabPanels>

          <!-- Transactions -->
          <MpTabPanel value="transactions">
            <div class="pd-filter-bar">
              <div class="pd-filter-left">
                <MpPopover id="bd-tx-type-filter" is-close-on-select>
                  <MpPopoverTrigger>
                    <MpSelect
                      id="bd-tx-type-select"
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
                <MpButton v-if="txSearch" class="pd-search-clear" type="button" aria-label="Clear search" @click="txSearch = ''">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                  </svg>
                </MpButton>
              </div>
            </div>

            <div v-if="pagedTransactions.length" class="pd-table-scroll">
              <table class="pd-table">
                <colgroup>
                  <col v-if="isTraced" style="width: 32px" />
                  <col style="width: 120px" />
                  <col style="width: 220px" />
                  <col v-if="isTraced" style="width: 160px" />
                  <col style="width: 110px" />
                  <col v-if="isTraced" style="width: 180px" />
                  <col v-if="isTraced" style="width: 180px" />
                  <col v-if="isTraced" style="width: 200px" />
                  <col style="width: 100px" />
                  <col style="width: 100px" />
                  <col style="width: 100px" />
                  <col style="width: 100px" />
                  <col style="width: 90px" />
                  <col v-if="isTraced" style="width: 160px" />
                  <col v-if="isTraced" style="width: 160px" />
                </colgroup>
                <thead>
                  <tr>
                    <th v-if="isTraced" class="pd-th" />
                    <th class="pd-th">Date</th>
                    <th class="pd-th">Number</th>
                    <th v-if="isTraced" class="pd-th">Transaction type</th>
                    <th class="pd-th">Movement</th>
                    <th v-if="isTraced" class="pd-th">Warehouse origin</th>
                    <th v-if="isTraced" class="pd-th">Warehouse destination</th>
                    <th v-if="isTraced" class="pd-th">Counterparty</th>
                    <th class="pd-th pd-th--num">On hand qty</th>
                    <th class="pd-th pd-th--num">Reserved qty</th>
                    <th class="pd-th pd-th--num">Available qty</th>
                    <th class="pd-th pd-th--num">In transit qty</th>
                    <th class="pd-th">Unit</th>
                    <th v-if="isTraced" class="pd-th pd-th--num">Mutation (secondary unit)</th>
                    <th v-if="isTraced" class="pd-th pd-th--num">Balance (secondary unit)</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="tx in pagedTransactions" :key="tx.id">
                    <tr
                      class="pd-tr" :class="{ 'pd-tr--clickable': !!tx.traced, 'pd-tr--highlight': tx.number === highlightTransaction }"
                      @click="tx.traced && toggleRow(tx.id)"
                    >
                      <td v-if="isTraced" class="pd-td pd-td--chevron">
                        <span v-if="tx.traced" class="pd-chevron" :class="{ 'pd-chevron--open': isRowOpen(tx.id) }" aria-hidden="true">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                          </svg>
                        </span>
                      </td>
                      <td class="pd-td">{{ formatDate(tx.date) }}</td>
                      <td class="pd-td">
                        <a class="cell-link cell-text" @click.stop>{{ tx.number }}</a>
                      </td>
                      <td v-if="isTraced" class="pd-td">{{ tx.type }}</td>
                      <td class="pd-td">
                        <div class="pd-movement" :class="tx.delta >= 0 ? 'pd-movement--pos' : 'pd-movement--neg'">
                          {{ tx.delta >= 0 ? `+${tx.delta}` : tx.delta }}
                        </div>
                        <span v-for="a in tx.affects" :key="a" class="pd-movement-caption">{{ a }}</span>
                      </td>
                      <td v-if="isTraced" class="pd-td">{{ warehouseLabel(tx.traced?.originWarehouseId ?? null) }}</td>
                      <td v-if="isTraced" class="pd-td">{{ warehouseLabel(tx.traced?.destinationWarehouseId ?? null) }}</td>
                      <td v-if="isTraced" class="pd-td">{{ tx.traced ? counterpartyLabel(tx.traced) : '—' }}</td>
                      <td class="pd-td pd-td--num">{{ tx.onHand.toLocaleString('id-ID') }}</td>
                      <td class="pd-td pd-td--num">{{ tx.reserved.toLocaleString('id-ID') }}</td>
                      <td class="pd-td pd-td--num">{{ tx.available.toLocaleString('id-ID') }}</td>
                      <td class="pd-td pd-td--num">{{ tx.inTransit.toLocaleString('id-ID') }}</td>
                      <td class="pd-td">{{ tx.unit }}</td>
                      <td v-if="isTraced" class="pd-td pd-td--num">{{ tx.traced ? secondaryMutation(tx.traced) : '—' }}</td>
                      <td v-if="isTraced" class="pd-td pd-td--num">{{ tx.traced ? secondaryBalance(tx.traced) : '—' }}</td>
                    </tr>

                    <!-- The attribute values recorded on that transaction (ContentList
                         key/value, as the detail pages render any field) -->
                    <tr v-if="tx.traced && isRowOpen(tx.id)" :key="`${tx.id}-snapshot`" class="pd-tr pd-tr--snapshot">
                      <td class="pd-td" :colspan="15">
                        <p class="pd-snapshot-title">Recorded values</p>
                        <div class="pd-snapshot-grid">
                          <ContentList v-for="a in recordedAttributes(tx.traced)" :key="a.key" :label="a.label">
                            <span class="pd-snapshot-value">{{ a.value }}</span>
                            <span v-if="a.changed" class="pd-snapshot-dot" title="Value at the time of this transaction" />
                          </ContentList>
                        </div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
            <div v-else class="empty-full">
              <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
              <p class="empty-full-title">No transactions</p>
              <p class="empty-full-desc">Batch transactions will appear here.</p>
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

          <!-- Stock by warehouses -->
          <MpTabPanel value="warehouses">
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
              <p class="empty-full-title">Not stocked anywhere</p>
              <p class="empty-full-desc">Warehouses that stock this batch will appear here.</p>
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

          <!-- Related batch (Batch Traceability story 10) — one Work order level each way -->
          <MpTabPanel v-if="isTraced" value="related">
            <div v-for="group in (['sources', 'results'] as const)" :key="group" class="bd-related">
              <div class="bd-related-head">
                <h3 class="bd-related-title">{{ group === 'sources' ? 'Source batch' : 'Result batch' }}</h3>
                <p class="bd-related-caption">
                  {{ group === 'sources'
                    ? 'Batches consumed by the work order that produced this batch'
                    : 'Batches produced by work orders that consumed this batch' }}
                </p>
              </div>
              <div class="pd-table-scroll">
                <table v-if="related[group].length" class="pd-table">
                  <thead>
                    <tr>
                      <th class="pd-th">Product</th>
                      <th class="pd-th">Batch number</th>
                      <th class="pd-th">Work order number</th>
                      <th class="pd-th">Work order date</th>
                      <th class="pd-th pd-th--num">{{ group === 'sources' ? 'Qty consumed' : 'Qty produced' }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in related[group]" :key="`${r.workOrderNumber}::${r.sku}::${r.batchNo}`" class="pd-tr">
                      <td class="pd-td">{{ r.productName }}</td>
                      <td class="pd-td">
                        <a class="cell-link cell-text" @click.stop="openRelated(r)">{{ r.batchNo }}</a>
                      </td>
                      <td class="pd-td">{{ r.workOrderNumber }}</td>
                      <td class="pd-td">{{ formatDate(r.workOrderDate) }}</td>
                      <td class="pd-td pd-td--num">{{ formatQty(r.qty, r.unit) }}</td>
                    </tr>
                  </tbody>
                </table>
                <p v-else class="bd-related-empty">{{ group === 'sources' ? 'No source batch' : 'No result batch' }}</p>
              </div>
            </div>
          </MpTabPanel>

        </MpTabPanels>
      </MpTabs>
    </div>

    <ActivityLogModal
      :is-open="activityOpen"
      :subject="batch.batchNo"
      :entries="activityEntries"
      @close="activityOpen = false"
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

    <BatchFormModal
      v-if="canEdit"
      :open="editOpen"
      :sku="sku"
      :batch-id="batch.id"
      @close="editOpen = false"
      @saved="onBatchSaved"
    />
  </div>

  <div v-else class="detail-page">
    <div class="pd-notfound">
      <p class="empty-full-title">Batch not found</p>
      <a class="pd-link" @click.prevent="goToProducts">Back to Products</a>
    </div>
  </div>
</template>

<style scoped>
/* ── Traceability rows in the Transactions table ── */
.pd-tr--clickable { cursor: pointer; }
.pd-tr--highlight > .pd-td { background: var(--mp-background-selected, #e8f1fb); }
.pd-td--chevron { width: var(--mp-sizes-8, 32px); }
.pd-chevron {
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--mp-text-secondary); transition: transform 120ms ease;
}
.pd-chevron--open { transform: rotate(180deg); }
.pd-tr--snapshot > .pd-td {
  white-space: normal; background: var(--mp-background-neutral-subtle, #f8f9f9);
  /* Its own padding — the row's tight cell padding crowds a multi-field panel. */
  padding: var(--mp-spacing-4) var(--mp-spacing-5, 20px);
}
.pd-snapshot-title {
  margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
/* ContentList fields side by side; each keeps its own 8px top/bottom padding, and a
   floor width so the labels line up in a column when the row wraps. */
.pd-snapshot-grid { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2) var(--mp-spacing-8, 32px); }
.pd-snapshot-grid > :deep(.content-list) { min-width: var(--mp-sizes-45, 180px); padding-top: 0; }
.pd-snapshot-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pd-snapshot-dot {
  display: inline-block; margin-left: var(--mp-spacing-1);
  width: var(--mp-sizes-2, 8px); height: var(--mp-sizes-2, 8px); border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-warning-bold, #e5a400);
}

/* ── Related batch tab ── */
.bd-related { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.bd-related + .bd-related { margin-top: var(--mp-spacing-8, 32px); }
.bd-related-head { display: flex; flex-direction: column; }
.bd-related-title {
  margin: 0; font-size: var(--mp-font-sizes-lg, 16px); line-height: var(--mp-line-heights-lg, 24px);
  font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.bd-related-caption { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.bd-related-empty { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* ── Shell — identical to ProductDetailsPage.vue / WarehouseDetailsPage.vue (docs/patterns/details-page-format.md §C) ── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle, #f8f9f9); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: 12px; color: var(--mp-text-link); line-height: var(--mp-line-heights-md);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-breadcrumb-sep { font-size: 12px; color: var(--mp-text-secondary); }
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

/* ── Batch info section ── */
.pd-section { display: flex; flex-direction: column; }
.pd-section-title {
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px);
  color: var(--mp-text-default);
}
.pd-info-row { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.pd-field-col { display: flex; flex-direction: column; }
.pd-field-col--flex { flex: 1; min-width: 0; }
.pd-link { color: var(--mp-text-link); cursor: pointer; }
.pd-link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Filter bar (Transaction type + search, right-aligned search per detail-page-format.md) ── */
.pd-filter-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-5); }
.pd-filter-left { display: flex; align-items: center; gap: var(--mp-spacing-2); }
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

/* ── Tables (ErpTablePage header/row spec, raw table — mirrors ProductDetailsPage.vue's tab tables) ── */
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
.pd-tr:hover .pd-td { background: var(--mp-background-neutral-hovered, #eef0f3); }

/* Number / Warehouse cells — value is a link to detail */
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

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
</style>
