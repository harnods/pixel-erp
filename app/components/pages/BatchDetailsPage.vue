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
 */
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
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
import { getBatchTrace, batchAttributeChanges } from '~/data/batchTraceability'
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

// ── Tabs — driven by ?section= (see ProductDetailsPage.vue for why not ?tab=). ──
const TAB_NAMES = ['transactions', 'warehouses']
const activeTabIndex = computed({
  get(): number {
    const tab = route.query.section as string | undefined
    const idx = tab ? TAB_NAMES.indexOf(tab) : -1
    return idx >= 0 ? idx : 0
  },
  set(idx: number) {
    router.replace({ query: { ...route.query, section: TAB_NAMES[idx] ?? 'transactions' } })
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

// ── Traceability (Batch Traceability plan decision Q8) ──────────────────────────
/** The report traces product batches; warehouse-scoped lots and the Unassigned batch
 *  aren't in its ledger, so they don't get the link. */
const canTrace = computed(() =>
  !warehouseId.value && !!batch.value && !batch.value.isUnassigned && !!getBatchTrace(sku.value, batchNo.value),
)
function openTraceability() {
  router.push(`/inventory-report/batch-traceability/${sku.value}/${encodeURIComponent(batchNo.value)}`)
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
const allTransactions = computed(() => batch.value ? getBatchTransactions(sku.value, batchNo.value) : [])
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
          <button class="detail-breadcrumb" @click="goToWarehouses">Warehouses</button>
          <span class="detail-breadcrumb-sep">/</span>
          <button class="detail-breadcrumb" @click="goToWarehouse">{{ warehouseName }}</button>
        </div>
        <div v-else class="detail-breadcrumb-row">
          <button class="detail-breadcrumb" @click="goToProducts">Products</button>
          <span class="detail-breadcrumb-sep">/</span>
          <button class="detail-breadcrumb" @click="goToProduct">{{ batch.productName }}</button>
        </div>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ batch.batchNo }}</h1>
        </div>
      </div>

      <MpPopover id="bd-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
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
            <MpPopoverListItem v-if="canEdit" @click="editOpen = true">Edit</MpPopoverListItem>
            <MpPopoverListItem v-if="canTrace" @click="openTraceability">View traceability</MpPopoverListItem>
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
