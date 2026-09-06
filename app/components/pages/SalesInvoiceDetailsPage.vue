<script setup lang="ts">
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpTooltip, MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, MpIcon, MpSpinner, MpButton, MpTextlink, css, toast,
} from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import ActivityLogModal from '~/components/patterns/ActivityLogModal.vue'
import CreateTaxDocumentDrawer from '~/components/patterns/CreateTaxDocumentDrawer.vue'
import CannotCreateTaxDocumentDrawer from '~/components/patterns/CannotCreateTaxDocumentDrawer.vue'
import TaxDocumentDetailDrawer from '~/components/patterns/TaxDocumentDetailDrawer.vue'
import { getSalesInvoiceDetail } from '~/data/salesInvoiceDetails'
import { canGenerateTaxDocument } from '~/data/salesInvoiceLineItems'
import { salesInvoices } from '~/data'
import PdfPreviewModal from '~/components/patterns/PdfPreviewModal.vue'
import {
  getTaxDocumentsForInvoice, formatTaxDocumentNumber, updateTaxDocumentStatus,
  taxDocMenuItemDefs, DJP_STATUS_CONFIG, type TaxDocument,
} from '~/data/taxDocuments'
import { generateEFakturPdf } from '~/utils/eFakturPdf'
import type jsPDF from 'jspdf'
import ErpLineDimensionsView from '~/components/patterns/ErpLineDimensionsView.vue'
import { applicableDimensions } from '~/data/dimensions'

// `orderId` is the shared detail-route prop name — [...slug].vue binds :order-id
// for every detail page, whatever the module.
const props = defineProps<{ orderId: string }>()

const { t } = useLocale()

// Info banner temporarily hidden in the prototype (toggle back on when ready)
const showBanner = false

// Title-bar icon actions (Task + Comment) only when the page has an approval flow.
const hasApproval = true

const router = useRouter()
const invoice = computed(() => getSalesInvoiceDetail(props.orderId))
const { dimensionsActivated } = useDimensionsActivation()
const showDimensionsColumn = computed(() => dimensionsActivated.value && applicableDimensions('sales').length > 0)
function dimensionValuesFor(dimensions?: Record<string, string>): { name: string; value: string }[] {
  if (!dimensions) return []
  return Object.entries(dimensions).map(([name, value]) => ({ name, value }))
}

const activityOpen = ref(false)
const taxDocDrawerOpen = ref(false)
const cannotCreateTaxDocDrawerOpen = ref(false)
const taxDocuments = computed(() => getTaxDocumentsForInvoice(invoice.value.id))

// "Create tax document" is blocked whenever one of the invoice's products is
// missing a DJP code/unit — opens the read-only "Cannot create" drawer instead
// (see CannotCreateTaxDocumentDrawer.vue) so the user knows what to fix first.
function openCreateTaxDocument() {
  if (canGenerateTaxDocument(invoice.value.id)) {
    taxDocDrawerOpen.value = true
  } else {
    cannotCreateTaxDocDrawerOpen.value = true
  }
}

// Tabs only appear once they have something to show — an invoice with no
// payments yet shouldn't offer an empty "Payments" tab, etc.
const hasLinkedTransactions = computed(() => invoice.value.linkedTransactions.length > 0)
const hasPayments = computed(() => invoice.value.payments.length > 0)
const hasTaxDocuments = computed(() => taxDocuments.value.length > 0)

function onTaxDocumentSaved() {
  toast.notify({ variant: 'success', title: t('Tax document saved'), rootProps: { class: 'toast-enterprise' } })
}

// ── Tax document detail drawer ("View details") ─────────────────────────────────
const taxDocDetailOpen = ref(false)
const taxDocDetailDoc = ref<TaxDocument | null>(null)
function openTaxDocDetail(doc: TaxDocument) {
  taxDocDetailDoc.value = doc
  taxDocDetailOpen.value = true
}

// ── e-Faktur print preview (Approved tax documents only) ───────────────────────
const eFakturPreviewOpen = ref(false)
const eFakturPreviewDoc = ref<jsPDF | null>(null)
const eFakturPreviewFilename = ref('')
function printEFaktur(doc: TaxDocument) {
  eFakturPreviewDoc.value = generateEFakturPdf(doc, invoice.value)
  eFakturPreviewFilename.value = `e-Faktur ${formatTaxDocumentNumber(doc)}.pdf`
  eFakturPreviewOpen.value = true
}

function submitTaxDocToDjp(doc: TaxDocument) {
  updateTaxDocumentStatus(doc.id, 'awaiting-approval')
  toast.notify({ variant: 'success', title: t('Submitted to DJP'), rootProps: { class: 'toast-enterprise' } })
}
// "for demo purpose" — a real DJP status check has no backend here, so this
// just resolves straight to Approved instead of actually polling anything.
function refreshTaxDocStatus(doc: TaxDocument) {
  updateTaxDocumentStatus(doc.id, 'approved')
  toast.notify({ variant: 'success', title: t('DJP status updated'), rootProps: { class: 'toast-enterprise' } })
}

/** Row kebab menu (and the detail drawer's own "Actions" button, which reuses
 *  this with View details dropped) — labels/order/disabled come from the
 *  shared taxDocMenuItemDefs; onClick handlers are wired here by label. */
interface TaxDocMenuItem { label: string; disabled?: boolean; tooltip?: string; onClick?: () => void }
function taxDocMenuItems(doc: TaxDocument, opts: { excludeViewDetails?: boolean } = {}): TaxDocMenuItem[] {
  return taxDocMenuItemDefs(doc.status)
    .filter(item => !(opts.excludeViewDetails && item.label === 'View details'))
    .map(item => ({
      ...item,
      onClick:
        item.label === 'View details' ? () => openTaxDocDetail(doc)
        : item.label === 'Submit to DJP' ? () => submitTaxDocToDjp(doc)
        : item.label === 'Refresh DJP status' ? () => refreshTaxDocStatus(doc)
        : item.label === 'Print e-faktur' ? () => printEFaktur(doc)
        : undefined,
    }))
}
const taxDocDetailMenuItems = computed(() =>
  taxDocDetailDoc.value ? taxDocMenuItems(taxDocDetailDoc.value, { excludeViewDetails: true }) : [],
)
/** Unique per-row-per-item tooltip id (MpTooltip requires one). */
function taxDocTooltipId(doc: TaxDocument, item: TaxDocMenuItem): string {
  return `taxdoc-tt-${doc.id}-${item.label.toLowerCase().replace(/\s+/g, '-')}`
}
// Fixed (not max-content) so the Edit/Delete tooltip can be forced to the exact
// same width as the popover itself — comfortably fits the longest item label
// ("Refresh DJP status").
const taxDocMenuWidth = '200px'
const activityEntries = computed(() => [{
  date: invoice.value.lastUpdatedAt,
  user: invoice.value.lastUpdatedBy,
  activity: t('Created'),
  details: [
    { label: t('Transaction no.'), value: `${t('Sales Invoice')} #${invoice.value.number}` },
    { label: t('Transaction date'), value: formatDateLong(invoice.value.date) },
    { label: t('Customer'), value: invoice.value.customer.name },
    { label: t('Warehouse'), value: invoice.value.warehouse },
  ],
}])

// ── Line-items progressive pagination (auto lazy-load on scroll) ───────────────
const PAGE_SIZE = 10
const shownCount = ref(PAGE_SIZE)               // show 10 by default
const loadingMore = ref(false)
const visibleItems = computed(() => invoice.value.lineItems.slice(0, shownCount.value))
const hasMoreItems = computed(() => shownCount.value < invoice.value.lineItems.length)
// progressive pagination kicks in past the default page → the table becomes a
// bordered, internally-scrolling panel
const isProgressive = computed(() => invoice.value.lineItems.length > PAGE_SIZE)

function loadMoreItems() {
  if (loadingMore.value || !hasMoreItems.value) return
  loadingMore.value = true
  // brief loading state before the next batch appends
  setTimeout(() => {
    shownCount.value = Math.min(shownCount.value + PAGE_SIZE, invoice.value.lineItems.length)
    loadingMore.value = false
  }, 500)
}

// Auto-load the next batch when the user scrolls near the bottom of the table
// (IntersectionObserver on a sentinel inside the table's own scroll container).
const itemsScrollEl = ref<HTMLElement | null>(null)
const itemsSentinelEl = ref<HTMLElement | null>(null)
let itemsObserver: IntersectionObserver | null = null
function setupItemsObserver() {
  itemsObserver?.disconnect()
  if (!itemsScrollEl.value || !itemsSentinelEl.value) return
  itemsObserver = new IntersectionObserver(
    (entries) => { if (entries[0]!.isIntersecting) loadMoreItems() },
    { root: itemsScrollEl.value, rootMargin: '0px 0px 120px 0px' },
  )
  itemsObserver.observe(itemsSentinelEl.value)
}
onMounted(() => nextTick(setupItemsObserver))
onUnmounted(() => itemsObserver?.disconnect())
watch(() => props.orderId, () => {
  shownCount.value = PAGE_SIZE
  loadingMore.value = false
  nextTick(() => {
    if (itemsScrollEl.value) itemsScrollEl.value.scrollTop = 0
    setupItemsObserver()
  })
})

// ── Jump-to-transaction switcher (title-bar chevron) ───────────────────────────
const jumpSearch = ref('')
const jumpResults = computed(() => {
  const recent = [...salesInvoices].sort((a, b) => b.date.localeCompare(a.date))   // most recent first
  const q = jumpSearch.value.trim().toLowerCase()
  const matched = q
    ? recent.filter(inv => String(inv.number).includes(q) || inv.customer.name.toLowerCase().includes(q))
    : recent
  return matched.slice(0, 5)   // 5 most recent (or top 5 matches)
})
function jumpTo(id: string) { router.push(`/sales-invoices/${id}`) }

// ─── Formatters ───────────────────────────────────────────────────────────────
/** Parenthesised deduction, e.g. (Rp100.000,00); plain Rp0,00 for zero. */
function formatDeduction(amount: number) {
  return amount > 0 ? `(${formatIDR(amount)})` : formatIDR(0)
}
function formatDateLong(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso))
}
function formatDateNumeric(iso: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}
function formatUpdatedAt(iso: string) {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return `${date}, ${time}`
}

function discountText(pct: number) { return pct > 0 ? `${pct}%` : '' }
function paymentStageLabel(stage: string) { return stage === 'down-payment' ? t('Down payment') : t('Settlement') }

/** File-type → Pixel document icon for an attachment. */
function attachmentIcon(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf') return 'pdf-document'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic'].includes(ext)) return 'image-document'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'excel-document'
  if (['doc', 'docx'].includes(ext)) return 'word-document'
  return 'attachment'
}

function goBack() { router.push('/sales-invoices') }
function receivePayment() { router.push('/sales-invoices') }
</script>

<template>
  <div class="detail-page">

    <!-- ── Title bar (breadcrumb + title + status dropdown + icon actions) ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <MpTextlink id="detail-breadcrumb" as="a" class="detail-breadcrumb" @click.prevent="goBack">{{ t('Sales invoices') }}</MpTextlink>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ t('Sales Invoice') }} #{{ invoice.number }}</h1>
          <ErpStatusBadge :status="invoice.status" badge-for="additionalInformation" size="md" />

          <!-- Chevron → jump-to-transaction switcher (search + 5 recent) -->
          <MpPopover id="detail-jump" use-portal :is-keep-alive="false" placement="bottom-start">
            <MpPopoverTrigger>
              <MpButton class="detail-jump-chevron" :aria-label="t('Switch transaction')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ width: '304px' })">
              <div class="detail-jump">
                <div class="detail-jump-search-wrap">
                  <input
                    v-model="jumpSearch"
                    class="detail-jump-search"
                    type="text"
                    :placeholder="t('Search...')"
                  />
                  <MpButton v-if="jumpSearch" class="search-clear-btn search-clear-btn--overlay" :aria-label="t('Clear search')" @click="jumpSearch = ''">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                    </svg>
                  </MpButton>
                </div>
                <div class="detail-jump-list">
                  <button
                    v-for="inv in jumpResults"
                    :key="inv.id"
                    class="detail-jump-item"
                    @click="jumpTo(inv.id)"
                  >
                    <span class="detail-jump-item-number">{{ t('Sales Invoice') }} #{{ inv.number }}</span>
                    <span class="detail-jump-item-customer">{{ inv.customer.name }}</span>
                  </button>
                  <p v-if="!jumpResults.length" class="detail-jump-empty">{{ t('No transactions found') }}</p>
                </div>
              </div>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>

      <!-- Right-side icon actions — only when the page has an approval flow -->
      <div v-if="hasApproval" class="detail-titlerow-right">
          <MpTooltip id="detail-tt-tasks" :label="t('Approval log')" placement="bottom" use-portal>
            <MpButton class="detail-icon-btn" :aria-label="t('Approval log')">
              <MpIcon name="task-todo" size="md" />
            </MpButton>
          </MpTooltip>
          <MpTooltip id="detail-tt-comments" :label="t('Comments')" placement="bottom" use-portal>
            <MpButton class="detail-icon-btn" :aria-label="t('Comments')">
              <MpIcon name="comment" size="md" />
            </MpButton>
          </MpTooltip>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="detail-stage">

      <!-- Info banner (conditional) — temporarily hidden in the prototype -->
      <div v-if="showBanner && invoice.banner" class="detail-banner">
        <svg class="detail-banner-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/>
          <path d="M12 11v5M12 8h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <span class="detail-banner-text">{{ invoice.banner.message }}</span>
        <a class="detail-banner-link" @click.prevent>{{ invoice.banner.linkLabel }}</a>
      </div>

      <!-- ── Header summary ── -->
      <section class="detail-summary">
        <!-- Primary row: shares the header grid (col 1 = 318px) + emphasised Total -->
        <div class="content-list-grid">
          <div class="content-list-col">
            <ContentList :label="t('Customer')" :value="invoice.customer.name" />
          </div>
          <div class="content-list-col">
            <ContentList :label="t('Email')">
              <span v-for="(e, i) in invoice.email" :key="i" class="content-list__line">{{ e }}</span>
            </ContentList>
          </div>
          <div class="detail-primary-total">
            <span class="detail-total-label">{{ t('Total') }}</span>
            <span class="detail-total-amount">{{ formatIDR(invoice.totals.total) }}</span>
          </div>
        </div>

        <div class="detail-divider" />

        <!-- Detail grid: col 1 = 318px, col 2+ fill equally (max 5 cols) -->
        <div class="content-list-grid">
          <!-- col 1: addresses -->
          <div class="content-list-col">
            <ContentList :label="t('Billing address')" :value="invoice.billingAddress" />
            <ContentList :label="t('Ship to')" :value="invoice.shipTo" />
          </div>
          <!-- col 2: invoice dates -->
          <div class="content-list-col">
            <ContentList :label="t('Transaction date')" :value="formatDateLong(invoice.date)" />
            <ContentList :label="t('Due date')" :value="formatDateLong(invoice.dueDate)" />
            <ContentList :label="t('Payment terms')" :value="invoice.paymentTerms" />
          </div>
          <!-- col 3: settlement -->
          <div class="content-list-col">
            <ContentList :label="t('Amount paid')" :value="formatIDR(invoice.amountPaid)" />
            <ContentList :label="t('Balance due')" :value="formatIDR(invoice.balance)" />
          </div>
          <!-- col 4: references -->
          <div class="content-list-col">
            <ContentList :label="t('Transaction no.')" :value="`${t('Sales Invoice')} #${invoice.number}`" />
            <ContentList :label="t('Reference no.')" :value="invoice.referenceNo" />
            <ContentList :label="t('Warehouse')" :value="invoice.warehouse" />
          </div>
          <!-- col 5: tags -->
          <div class="content-list-col">
            <ContentList :label="t('Tags')">
              <ErpTagList v-if="invoice.tags?.length" :tags="invoice.tags" />
              <template v-else>—</template>
            </ContentList>
          </div>
        </div>
      </section>

      <!-- ── Line items table (read-only) — auto lazy-load, internal scroll ── -->
      <section class="detail-items-section" :class="{ 'detail-items-section--bordered': isProgressive }">
        <div ref="itemsScrollEl" class="detail-items-scroll">
        <table class="detail-items">
          <thead>
            <tr>
              <th class="detail-th">{{ t('Product') }}</th>
              <th class="detail-th">{{ t('Description') }}</th>
              <th class="detail-th detail-th--num">{{ t('Qty') }}</th>
              <th class="detail-th">{{ t('Unit') }}</th>
              <th class="detail-th detail-th--num">{{ t('Unit price') }}</th>
              <th class="detail-th detail-th--num">{{ t('Discount') }}</th>
              <th class="detail-th">{{ t('Tax') }}</th>
              <th v-if="showDimensionsColumn" class="detail-th">{{ t('Dimensions') }}</th>
              <th class="detail-th detail-th--num">{{ t('Amount') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(it, i) in visibleItems" :key="i" class="detail-item-row">
              <td class="detail-td">
                <div class="cell-with-action">
                  <span class="detail-item-primary">
                    <a class="cell-link detail-item-name" @click.stop>{{ it.product }}</a>
                    <span class="detail-item-sku">{{ t('SKU') }}: {{ it.sku }}</span>
                  </span>
                </div>
              </td>
              <td class="detail-td detail-td--muted">{{ it.description }}</td>
              <td class="detail-td detail-td--num">{{ it.qty }}</td>
              <td class="detail-td">{{ it.unit }}</td>
              <td class="detail-td detail-td--num">{{ formatIDR(it.unitPrice) }}</td>
              <td class="detail-td detail-td--num">{{ discountText(it.discountPct) }}</td>
              <td class="detail-td">{{ it.taxLabel }}</td>
              <td v-if="showDimensionsColumn" class="detail-td">
                <ErpLineDimensionsView :values="dimensionValuesFor(it.dimensions)" />
              </td>
              <td class="detail-td detail-td--num">{{ formatIDR(it.amount) }}</td>
            </tr>
          </tbody>
        </table>
          <!-- sentinel observed for auto lazy-load + inline loading row -->
          <div ref="itemsSentinelEl" class="detail-items-sentinel" aria-hidden="true" />
          <div v-if="loadingMore" class="detail-loading detail-items-loading">
            <MpSpinner size="sm" /> {{ t('Loading items…') }}
          </div>
        </div>
        <div class="detail-items-count">
          <span>{{ t('Showing') }} {{ visibleItems.length }} {{ t('of') }} {{ invoice.lineItems.length }} {{ t('products') }}</span>
        </div>
      </section>

      <!-- ── Notes + totals ── -->
      <section class="detail-notes">
        <!-- Left: message / memo / attachment -->
        <div class="detail-notes-left">
          <ContentList :label="t('Message')">
            <p class="detail-note-text">{{ invoice.message }}</p>
          </ContentList>
          <ContentList :label="t('Memo')">
            <p class="detail-note-text">{{ invoice.memo }}</p>
          </ContentList>
          <ContentList :label="`${t('Attachment')} (${invoice.attachments.length})`">
            <div class="detail-attach-list">
              <a v-for="(a, i) in invoice.attachments" :key="i" class="detail-attach" @click.prevent>
                <span class="detail-attach-icon"><MpIcon :name="attachmentIcon(a.name)" size="md" /></span>
                <span class="detail-attach-meta">
                  <span class="detail-attach-name">{{ a.name }}</span>
                  <span class="detail-attach-size">{{ a.sizeKB.toFixed(1) }} KB</span>
                </span>
              </a>
            </div>
          </ContentList>
        </div>

        <!-- Right: totals summary -->
        <div class="detail-totals">
          <div class="detail-total-row">
            <span class="detail-total-row-label detail-total-row-label--strong">{{ t('Subtotal') }}</span>
            <span class="detail-total-row-amt detail-total-row-amt--strong">{{ formatIDR(invoice.totals.subtotal) }}</span>
          </div>
          <div class="detail-total-row">
            <span class="detail-total-row-label">{{ t('Discount per line') }}</span>
            <span class="detail-total-row-amt">{{ formatDeduction(invoice.totals.discountPerLine) }}</span>
          </div>
          <div class="detail-total-row">
            <span class="detail-total-row-label">{{ t('Global discount') }}</span>
            <span class="detail-total-row-amt">{{ formatDeduction(invoice.totals.globalDiscount) }}</span>
          </div>
          <div v-if="invoice.hasPpn" class="detail-total-row">
            <span class="detail-total-row-label">{{ invoice.totals.taxLabel }}</span>
            <span class="detail-total-row-amt">{{ formatIDR(invoice.totals.taxAmount) }}</span>
          </div>
          <div class="detail-total-rule" />
          <div class="detail-total-row">
            <span class="detail-total-row-label detail-total-row-label--total">{{ t('Total') }}</span>
            <span class="detail-total-row-amt detail-total-row-amt--total">{{ formatIDR(invoice.totals.total) }}</span>
          </div>
          <div class="detail-total-row">
            <span class="detail-total-row-label">{{ t('Amount paid') }}</span>
            <span class="detail-total-row-amt">{{ formatDeduction(invoice.amountPaid) }}</span>
          </div>
          <div class="detail-total-rule" />
          <div class="detail-total-row">
            <span class="detail-total-row-label detail-total-row-label--total">{{ t('Balance due') }}</span>
            <span class="detail-total-row-amt detail-total-row-amt--total">{{ formatIDR(invoice.balance) }}</span>
          </div>
        </div>
      </section>

      <!-- Last updated -->
      <a class="detail-updated" @click.prevent="activityOpen = true">{{ t('Last updated by') }} {{ invoice.lastUpdatedBy }} {{ t('on') }} {{ formatUpdatedAt(invoice.lastUpdatedAt) }}</a>

      <!-- ── Tabs — only the ones with content to show ── -->
      <MpTabs
        v-if="hasLinkedTransactions || hasPayments || hasTaxDocuments"
        :key="invoice.id" id="detail-tabs" :default-value="0" variant-color="green" class="detail-tabs"
      >
        <MpTabList>
          <MpTab v-if="hasLinkedTransactions" id="detail-tab-linked" value="linked">{{ t('Linked transactions') }}</MpTab>
          <MpTab v-if="hasPayments" id="detail-tab-payments" value="payments">{{ t('Payments') }}</MpTab>
          <MpTab v-if="hasTaxDocuments" id="detail-tab-taxdoc" value="tax-document">{{ t('Tax document') }}</MpTab>
        </MpTabList>
        <MpTabPanels>
          <MpTabPanel v-if="hasLinkedTransactions" value="linked">
            <h3 class="detail-tab-heading">{{ t('Transactions') }}</h3>
            <table class="detail-linked">
              <colgroup>
                <col class="detail-linked-col--date" />
                <col class="detail-linked-col--number" />
                <col class="detail-linked-col--status" />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th class="detail-th">{{ t('Date') }}</th>
                  <th class="detail-th">{{ t('Number') }}</th>
                  <th class="detail-th">{{ t('Status') }}</th>
                  <th class="detail-th" aria-hidden="true"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(txn, i) in invoice.linkedTransactions" :key="i" class="detail-item-row">
                  <td class="detail-td">{{ formatDateNumeric(txn.date) }}</td>
                  <td class="detail-td">
                    <a class="cell-link cell-text" @click.stop>{{ txn.type }} {{ txn.number }}</a>
                  </td>
                  <td class="detail-td"><ErpStatusBadge :status="txn.status" /></td>
                  <td class="detail-td"></td>
                </tr>
              </tbody>
            </table>
          </MpTabPanel>

          <MpTabPanel v-if="hasPayments" value="payments">
            <h3 class="detail-tab-heading">{{ t('Payments') }}</h3>
            <table class="detail-linked">
              <colgroup>
                <col class="detail-linked-col--date" />
                <col class="detail-linked-col--number" />
                <col class="detail-linked-col--status" />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th class="detail-th">{{ t('Date') }}</th>
                  <th class="detail-th">{{ t('Payment method') }}</th>
                  <th class="detail-th">{{ t('Reference') }}</th>
                  <th class="detail-th detail-th--num">{{ t('Amount') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(p, i) in invoice.payments" :key="i" class="detail-item-row">
                  <td class="detail-td">{{ formatDateNumeric(p.date) }}</td>
                  <td class="detail-td">{{ p.method }}</td>
                  <td class="detail-td detail-td--muted">{{ p.reference }}</td>
                  <td class="detail-td detail-td--num">{{ formatIDR(p.amount) }}</td>
                </tr>
              </tbody>
            </table>
          </MpTabPanel>

          <MpTabPanel v-if="hasTaxDocuments" value="tax-document">
            <h3 class="detail-tab-heading">{{ t('Tax documents') }}</h3>
            <table class="detail-linked">
              <colgroup>
                <col class="detail-linked-col--date" />
                <col class="detail-linked-col--number" />
                <col class="detail-linked-col--stage" />
                <col />
                <col class="detail-linked-col--actions" />
              </colgroup>
              <thead>
                <tr>
                  <th class="detail-th">{{ t('Date') }}</th>
                  <th class="detail-th">{{ t('Number') }}</th>
                  <th class="detail-th">{{ t('Payment stage') }}</th>
                  <th class="detail-th">{{ t('DJP Status') }}</th>
                  <th class="detail-th" aria-hidden="true"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="doc in taxDocuments" :key="doc.id" class="detail-item-row">
                  <td class="detail-td">{{ doc.date }}</td>
                  <td class="detail-td">{{ formatTaxDocumentNumber(doc) }}</td>
                  <td class="detail-td">{{ paymentStageLabel(doc.paymentStage) }}</td>
                  <td class="detail-td">
                    <ErpStatusBadge
                      :status="doc.status"
                      :label="DJP_STATUS_CONFIG[doc.status].label"
                      :type="DJP_STATUS_CONFIG[doc.status].type"
                    />
                  </td>
                  <td class="detail-td">
                    <MpPopover :id="`taxdoc-row-actions-${doc.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                      <MpPopoverTrigger>
                        <MpButton class="row-kebab" :aria-label="t('More actions')">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <circle cx="12" cy="5" r="2" />
                            <circle cx="12" cy="12" r="2" />
                            <circle cx="12" cy="19" r="2" />
                          </svg>
                        </MpButton>
                      </MpPopoverTrigger>
                      <MpPopoverContent :class="css({ width: taxDocMenuWidth, whiteSpace: 'nowrap' })">
                        <MpPopoverList>
                          <template v-for="item in taxDocMenuItems(doc)" :key="item.label">
                            <MpTooltip
                              v-if="item.tooltip"
                              :id="taxDocTooltipId(doc, item)"
                              placement="top"
                              use-portal
                            >
                              <template #label>
                                <span class="taxdoc-tt-content" :style="{ width: taxDocMenuWidth }">{{ t(item.tooltip) }}</span>
                              </template>
                              <span class="taxdoc-menu-item-wrap">
                                <MpPopoverListItem :is-disabled="item.disabled">{{ t(item.label) }}</MpPopoverListItem>
                              </span>
                            </MpTooltip>
                            <MpPopoverListItem v-else :is-disabled="item.disabled" @click="item.onClick?.()">
                              {{ t(item.label) }}
                            </MpPopoverListItem>
                          </template>
                        </MpPopoverList>
                      </MpPopoverContent>
                    </MpPopover>
                  </td>
                </tr>
              </tbody>
            </table>
          </MpTabPanel>
        </MpTabPanels>
      </MpTabs>

      <!-- ── Footer action bar ── -->
      <div class="detail-footer">
        <!-- Print & share (secondary dropdown) -->
        <MpPopover id="detail-print-share" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
          <MpPopoverTrigger>
            <button class="btn-enterprise btn-enterprise--secondary">
              {{ t('Print & share') }}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem>{{ t('Print PDF') }}</MpPopoverListItem>
              <MpPopoverListItem>{{ t('Print dot matrix') }}</MpPopoverListItem>
            </MpPopoverList>
            <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
            <MpPopoverList>
              <MpPopoverListItem>{{ t('Share via WhatsApp') }}</MpPopoverListItem>
              <MpPopoverListItem>{{ t('Share via email') }}</MpPopoverListItem>
              <MpPopoverListItem>{{ t('Copy link') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <!-- Paid: a plain "Actions" primary dropdown (no payment left to record) -->
        <MpPopover v-if="invoice.status === 'paid'" id="detail-actions" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
          <MpPopoverTrigger>
            <button class="btn-enterprise btn-enterprise--primary">
              {{ t('Actions') }}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem>{{ t('Preview') }}</MpPopoverListItem>
              <MpPopoverListItem>{{ t('Set as recurring') }}</MpPopoverListItem>
              <MpPopoverListItem>{{ t('Create sales return') }}</MpPopoverListItem>
              <MpPopoverListItem v-if="invoice.hasPpn" @click="openCreateTaxDocument">{{ t('Create tax document') }}</MpPopoverListItem>
            </MpPopoverList>
            <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
            <MpPopoverList>
              <MpPopoverListItem>{{ t('Edit') }}</MpPopoverListItem>
              <MpPopoverListItem>{{ t('Duplicate') }}</MpPopoverListItem>
              <MpPopoverListItem>{{ t('Delete') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <!-- Open/Overdue: "Add payment" primary split button — main segment records
             a payment; chevron segment opens the rest (Reject + the create-document
             actions that only make sense before the invoice is settled). -->
        <div v-else class="detail-split-btn">
          <button class="btn-enterprise btn-enterprise--primary detail-split-btn__main" @click="receivePayment">
            {{ t('Add payment') }}
          </button>
          <MpPopover id="detail-actions" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
            <MpPopoverTrigger>
              <button class="btn-enterprise btn-enterprise--primary detail-split-btn__chevron" :aria-label="t('More actions')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem>{{ t('Preview') }}</MpPopoverListItem>
                <MpPopoverListItem>{{ t('Set as recurring') }}</MpPopoverListItem>
                <MpPopoverListItem>{{ t('Create join invoice') }}</MpPopoverListItem>
                <MpPopoverListItem>{{ t('Create progress invoice') }}</MpPopoverListItem>
                <MpPopoverListItem>{{ t('Create sales return') }}</MpPopoverListItem>
                <MpPopoverListItem v-if="invoice.hasPpn" @click="openCreateTaxDocument">{{ t('Create tax document') }}</MpPopoverListItem>
                <MpPopoverListItem>{{ t('Apply credit memo') }}</MpPopoverListItem>
              </MpPopoverList>
              <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
              <MpPopoverList>
                <MpPopoverListItem>{{ t('Edit') }}</MpPopoverListItem>
                <MpPopoverListItem>{{ t('Duplicate') }}</MpPopoverListItem>
                <MpPopoverListItem>{{ t('Reject') }}</MpPopoverListItem>
                <MpPopoverListItem>{{ t('Void') }}</MpPopoverListItem>
                <MpPopoverListItem>{{ t('Delete') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>

    </div><!-- /detail-stage -->

    <ActivityLogModal
      :is-open="activityOpen"
      :subject="`${t('Sales Invoice')} #${invoice.number}`"
      :updated-by="invoice.lastUpdatedBy"
      :updated-at="invoice.lastUpdatedAt"
      :entries="activityEntries"
      @close="activityOpen = false"
    />

    <CreateTaxDocumentDrawer
      v-model:is-open="taxDocDrawerOpen"
      :invoice="invoice"
      @saved="onTaxDocumentSaved"
    />

    <CannotCreateTaxDocumentDrawer
      v-model:is-open="cannotCreateTaxDocDrawerOpen"
      :invoice="invoice"
    />

    <PdfPreviewModal
      :open="eFakturPreviewOpen"
      :doc="eFakturPreviewDoc"
      :filename="eFakturPreviewFilename"
      :title="t('Print e-faktur')"
      @close="eFakturPreviewOpen = false"
    />

    <TaxDocumentDetailDrawer
      v-model:is-open="taxDocDetailOpen"
      :doc="taxDocDetailDoc"
      :invoice="invoice"
      :menu-items="taxDocDetailMenuItems"
    />
  </div>
</template>

<style scoped>
.detail-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* ── Title bar ── */
.detail-bar {
  flex-shrink: 0;
  height: var(--mp-sizes-18, 72px);   /* page title bar is always 72px */
  box-sizing: border-box;
  background: var(--mp-background-neutral-subtle);
  padding: 0 var(--mp-spacing-6);
  display: flex;
  flex-direction: row;
  align-items: center;                /* icon actions vertically centred to the 72px bar */
  justify-content: space-between;
  gap: var(--mp-spacing-4);
}
/* left stack: breadcrumb directly above the title — no gap */
.detail-bar-left {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0;
  min-width: 0;
}
.detail-breadcrumb {
  align-self: flex-start;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-link);
  line-height: var(--mp-line-heights-sm, 16px);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
}
.detail-title {
  margin: 0;
  font-size: var(--mp-font-sizes-2xl);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px;
  letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
  white-space: nowrap;
}
/* chevron next to the badge → jump-to-transaction switcher */
.detail-jump-chevron {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-7, 28px) !important;
  height: var(--mp-sizes-7, 28px) !important;
  min-width: 0 !important;
  background: none !important;
  border: none !important;
  padding: 0 !important;
  border-radius: var(--mp-radii-md);
  cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
}
.detail-jump-chevron:hover { background: var(--mp-background-neutral-hovered); }

/* jump-to popover (304px): search on top (280px input, 12px padding), 5 recent below */
.detail-jump { display: flex; flex-direction: column; }
.detail-jump-search-wrap { padding: var(--mp-spacing-3); position: relative; }   /* 12px around the search */
.detail-jump-search {
  width: 100%;        /* = 280px inside the 304px popover minus 12px padding each side */
  box-sizing: border-box;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  outline: none;
  padding-right: 34px;
}
.detail-jump-search:focus { border-color: var(--mp-border-brand-bold, #029861); }
.detail-jump-search::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  flex-shrink: 0; width: var(--mp-sizes-4\.5, 18px) !important; height: var(--mp-sizes-4\.5, 18px) !important; min-width: 0 !important;
  padding: 0 !important; border: none !important; background: none !important; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }
.search-clear-btn--overlay { position: absolute; right: 18px; top: 50%; transform: translateY(-50%); }
.detail-jump-list { display: flex; flex-direction: column; }
.detail-jump-item {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-0\.5);
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border-radius: var(--mp-radii-md);
}
.detail-jump-item:hover { background: var(--mp-background-neutral-subtle); }
.detail-jump-item-number { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.detail-jump-item-customer { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-jump-empty {
  margin: 0;
  padding: var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
.detail-titlerow-right {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-1);
}
.detail-icon-btn {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-9, 36px) !important;
  height: var(--mp-sizes-9, 36px) !important;
  min-width: 0 !important;
  border-radius: var(--mp-radii-md);
  background: none !important;
  border: none !important;
  cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
}
.detail-icon-btn:hover { background: var(--mp-background-neutral-hovered); }

/* ── Stage ── */
.detail-stage {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  /* fixed 24px top border keeps content off the stage's top edge while scrolling */
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-8);   /* 32px between every region (transaction detail pages) */
}

/* ── Info banner ── */
.detail-banner {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-information, #eef0fc);
  border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}
.detail-banner-icon { color: var(--mp-icon-information, #1d6fdc); flex-shrink: 0; }
.detail-banner-text { flex: 1; }
.detail-banner-link {
  color: var(--mp-text-link);
  cursor: pointer;
  font-weight: var(--mp-font-weights-semi-bold);
}
.detail-banner-link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Header summary ── */
.detail-summary { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
/* emphasised Total sits in the last columns of the primary grid, top- & right-aligned */
.detail-primary-total {
  grid-column: 3 / -1;
  justify-self: end;
  align-self: start;
  padding-top: var(--mp-spacing-2);   /* matches ContentList top padding → aligns with the labels */
  display: flex;
  align-items: baseline;
  gap: var(--mp-spacing-2);
}
.detail-total-label {
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.detail-total-amount {
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

/* dashed rule between header 1 (primary row) and header 2 (detail grid): 4px dash / 4px gap */
.detail-divider {
  height: var(--mp-border-width-sm, 1px);
  background: repeating-linear-gradient(
    to right,
    var(--mp-border-default) 0,
    var(--mp-border-default) 4px,
    transparent 4px,
    transparent 8px
  );
}

/* Detail grid: col 1 = 318px (shrinks proportionally when tight), col 2+ fill
   equally. Column gap 24px; no row gap — ContentList self-pads (8px top/bottom). */
.content-list-grid {
  display: grid;
  grid-template-columns: minmax(0, 318px) repeat(4, minmax(0, 1fr));
  column-gap: var(--mp-spacing-6);
  row-gap: 0;
}
/* no gap between fields in a column — spacing comes from ContentList padding */
.content-list-col { display: flex; flex-direction: column; }

/* ── Line items table ── */
.detail-items-section { display: flex; flex-direction: column; flex-shrink: 0; }
/* progressive case → contained panel with a 1px bold outer border */
.detail-items-section--bordered {
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-md);
  overflow: hidden;
}
.detail-items-section--bordered .detail-items-count {
  border-bottom: none;
}
/* table scrolls internally past ~10 rows so the page doesn't grow unbounded */
.detail-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: auto; }
/* header stays visible while the body scrolls */
.detail-items thead .detail-th { position: sticky; top: 0; z-index: 1; }
.detail-items-sentinel { height: 1px; }
.detail-items-loading { justify-content: center; padding: var(--mp-spacing-3); }
.detail-items, .detail-linked {
  width: 100%;
  border-collapse: collapse;
}
/* Header — per ErpTablePage.md: neutral-subtle gray, 28px, 12px/600 uppercase,
   padding 4px 16px 4px 8px (left) / 4px 8px 4px 16px (right). */
.detail-th {
  height: var(--mp-sizes-7, 28px);
  text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary);
  text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.detail-th--num {
  text-align: right;
  padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4);
}
/* Row — per ErpTablePage.md: 40px single-line, 6px vertical padding,
   vertical-align middle (conditional: top only when a cell wraps). */
.detail-td {
  height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-4) var(--mp-spacing-1\.5) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-lg, 20px);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  vertical-align: middle;
}
.detail-td--num {
  text-align: right;
  white-space: nowrap;
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-2) var(--mp-spacing-1\.5) var(--mp-spacing-4);
}
/* line-items rows carry a 2-line product cell → that whole row top-aligns */
.detail-items tbody .detail-td { vertical-align: top; }
.detail-td--muted { color: var(--mp-text-secondary); }
.detail-item-primary { display: block; }
.detail-item-name { display: block; color: var(--mp-text-default); }
.detail-item-sku {
  display: block;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-subtle);
  margin-top: var(--mp-spacing-0\.5);
}

/* fixed, left-aligned columns for the linked-transactions table (4th col fills) */
.detail-linked { table-layout: auto; }
.detail-linked-col--date   { width: 140px; }
.detail-linked-col--number { width: 260px; }
.detail-linked-col--status { width: 160px; }
.detail-linked-col--stage  { width: 160px; }
.detail-linked-col--actions { width: 52px; }

.row-kebab {
  display: flex !important;
  align-items: center;
  justify-content: center;
  padding: var(--mp-spacing-1) !important;
  min-width: 0 !important;
  border: none !important;
  background: transparent !important;
  cursor: pointer;
  border-radius: var(--mp-radii-sm) !important;
  color: var(--mp-text-subtle);
}
.row-kebab:hover {
  background: var(--mp-background-neutral-hovered);
  color: var(--mp-text-default);
}

/* MpTooltip clones its trigger-event handlers straight onto a non-Pixel single
   child (see MpTooltip's isPixelTagComponent check) — wrapping MpPopoverListItem
   directly would clobber its own data-pixel-component/disabled styling hook, so
   the tooltip wraps this plain, layout-transparent span instead. */
.taxdoc-menu-item-wrap { display: block; width: 100%; }
.taxdoc-tt-content { display: block; white-space: normal; }
/* Pixel's own popover-list-item recipe ships no :disabled visual treatment at
   all (verified: empty variant map) — this greys it out ourselves. */
:deep(.mp-popover-list-item:disabled) {
  color: var(--mp-text-disabled, rgba(29, 31, 36, 0.32)) !important;
  cursor: not-allowed !important;
}

.cell-with-action { position: relative; }
.cell-text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* progressive pagination (load-more) row — see ErpPagination.md */
.detail-items-count {
  display: flex;
  align-items: center;
  justify-content: flex-start;   /* Load link sits right beside the count */
  gap: var(--mp-spacing-3);      /* 12px between count and "Load N more…" */
  margin: 0;
  padding: var(--mp-spacing-3) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
  border-bottom: 1px solid var(--mp-border-default);
}
.detail-loading {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  color: var(--mp-text-secondary);
}

/* ── Notes + totals ── */
.detail-notes {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: var(--mp-spacing-6);
  align-items: start;
}
.detail-notes-left { display: flex; flex-direction: column; }
.detail-note-text {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-lg, 20px);
  color: var(--mp-text-default);
  white-space: pre-line;
}
.detail-attach-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.detail-attach {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  cursor: pointer;
  width: fit-content;
}
.detail-attach-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.detail-attach-meta { display: flex; flex-direction: column; }
.detail-attach-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.detail-attach:hover .detail-attach-name { text-decoration: underline; text-underline-offset: 2px; }
.detail-attach-size { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* 8px top padding matches the left column's ContentList padding → Subtotal aligns with Message */
.detail-totals { display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding-top: var(--mp-spacing-2); }
.detail-total-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
}
.detail-total-row-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.detail-total-row-amt { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
/* Subtotal + Total rows: H3 — 16px semibold */
.detail-total-row-label--strong, .detail-total-row-amt--strong,
.detail-total-row-label--total, .detail-total-row-amt--total {
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
/* dashed rule before Total: 4px dash / 4px gap, border-default */
.detail-total-rule {
  height: var(--mp-border-width-sm, 1px);
  background: repeating-linear-gradient(
    to right,
    var(--mp-border-default) 0,
    var(--mp-border-default) 4px,
    transparent 4px,
    transparent 8px
  );
}

/* ── Last updated ── */
.detail-updated {
  margin: 0;
  align-self: flex-start;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-link);
  cursor: pointer;
}
.detail-updated:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Tabs ── */
.detail-tabs { margin-top: 0; }
/* active tab uses text/selected + border/selected (not the raw green variant) */
.detail-tabs :deep(.mp-tab--isSelected_true),
.detail-tabs :deep(.mp-tab--isSelected_true:hover) {
  color: var(--mp-text-selected) !important;
}
/* Only the SELECTED tab's underline — matching the bare class hit every tab's
   underline div regardless of state, painting a green bar under all of them. */
.detail-tabs :deep(.mp-tab-selected-border--isSelected_true) {
  /* border/selected token (#029861); not exposed as a CSS var in this build → fallback */
  background-color: var(--mp-border-selected, #029861) !important;
}
/* MpTabList ships a 24px bottom margin → tighten the tabs→heading gap to 20px */
.detail-tabs :deep([data-pixel-component="MpTabList"]) {
  margin-bottom: var(--mp-spacing-5) !important;
}
.detail-tab-heading {
  /* 20px from the tab list above (set on MpTabList), 12px to the table below */
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

/* ── Footer action bar ── */
.detail-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--mp-spacing-3);
  padding-top: var(--mp-spacing-4);
}
/* Split button — "Add payment" main segment + chevron segment sharing one pill,
   separated by a 1px divider. Only the outer corners are rounded. */
.detail-split-btn {
  display: inline-flex;
  align-items: stretch;
}
.detail-split-btn__main {
  border-radius: var(--mp-radii-full, 999px) 0 0 var(--mp-radii-full, 999px);
}
.detail-split-btn__chevron {
  padding-left: var(--mp-spacing-3);
  padding-right: var(--mp-spacing-3);
  border-radius: 0 var(--mp-radii-full, 999px) var(--mp-radii-full, 999px) 0;
  border-left: 1px solid rgba(255, 255, 255, 0.3);
}
</style>
