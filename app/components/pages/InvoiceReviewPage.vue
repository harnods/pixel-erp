<script setup lang="ts">
/**
 * InvoiceReviewPage — "File review N of M" for a file classified as a Purchase
 * invoice (Figma 4712:75380 first-run, 4712:75451 filled).
 *
 * Same spine as BillReviewPage — the chrome comes from FileReviewShell, and the
 * section shells, match card, blank slate, totals and Additional info all follow
 * the expense review's patterns. What differs is the two things a purchase
 * invoice actually needs:
 *
 *   Section 1  vendor + shipping — Payment terms, Requires shipping, Warehouse
 *              and Ship to on top of the usual date/number pair.
 *   Products   the match card's *product* variant (Figma 4342:54061): the
 *              extracted line carries Qty / Unit cost / Amount and maps onto
 *              Product + Unit + Tax, rather than the expense's single Account.
 *
 * An invoice has many extracted lines, so this page renders one card per line
 * and keeps exactly one of them open at a time — closing the open card moves
 * the open state to the next one rather than collapsing everything.
 */
import { ref, computed, watch } from 'vue'
import { formatIDR } from '~/utils/currency'
import {
  MpButton, MpCheckbox, MpInput, MpTextarea, MpAutocomplete, MpDatePicker,
  MpInputTag, MpIcon, MpUpload, MpUploadList, toast, MpTooltip, MpSelect,
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
  type DataInterface,
} from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import FileReviewShell from '~/components/patterns/FileReviewShell.vue'
import EditClassificationModal, { type Classification } from '~/components/patterns/EditClassificationModal.vue'
import { useReviewQueue } from '~/composables/useReviewQueue'
import { scrollToFirstError } from '~/utils/form'

const props = defineProps<{ orderId: string }>()

const { t } = useLocale()
const { queue, index, backLabel, queueBase, goBack, goToNext, removeFromQueue } = useReviewQueue(() => props.orderId)
const isLastFile = computed(() => index.value === queue.value.length - 1)

const reviewFile = computed(() => queue.value.find((rf) => rf.id === props.orderId) ?? queue.value[0])

// ── Date helpers ─────────────────────────────────────────────────────────────
function toDisplayDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// ── Master data ──────────────────────────────────────────────────────────────
const VENDOR_OPTIONS = [
  { id: 'EXPAT', name: 'EXPAT' },
  { id: 'EXPAT Roasters Bali', name: 'EXPAT Roasters Bali' },
  { id: 'PT Kopi Nusantara Jaya', name: 'PT Kopi Nusantara Jaya' },
]
const PRODUCT_OPTIONS = [
  { id: 'arabica-kintamani', name: 'Arabica Kintamani' },
  { id: 'espresso-blend', name: 'Espresso Blend' },
  { id: 'house-blend', name: 'House Blend' },
  { id: 'robusta-gayo', name: 'Robusta Gayo' },
]
const UNIT_OPTIONS = [
  { id: 'pcs', name: 'Pcs' },
  { id: 'pack', name: 'Pack' },
  { id: 'box', name: 'Box' },
  { id: 'kg', name: 'Kg' },
]
const TAX_OPTIONS = [
  { id: 'ppn10', name: 'PPN 10%' },
  { id: 'pbjt10', name: 'PBJT 10%' },
  { id: 'none', name: t('No tax') },
]
const WAREHOUSE_OPTIONS = [
  { id: 'gudang-bsd', name: 'Gudang BSD' },
  { id: 'gudang-pusat', name: 'Gudang Pusat' },
  { id: 'gudang-surabaya', name: 'Gudang Surabaya' },
]
const PAYMENT_TERM_OPTIONS = [
  { id: 'net30', name: 'Net 30' },
  { id: 'net14', name: 'Net 14' },
  { id: 'net60', name: 'Net 60' },
  { id: 'due-on-receipt', name: t('Due on receipt') },
]

/** >10 Products scenario — every line OCR lifted off a longer, multi-page
 *  invoice (Figma's 2-page sample: coffee lines + merchandise + drip bags +
 *  gift sets), none matched yet so the "to match" list actually stacks up. */
const MANY_PRODUCTS_SOURCE: { label: string; qty: number; unit: string; unitCost: number }[] = [
  { label: 'Kintamani Bali (250g)',        qty: 3,  unit: 'Pack', unitCost: 120_000 },
  { label: 'House Blend (1kg)',            qty: 2,  unit: 'Pack', unitCost: 320_000 },
  { label: 'Bali Honey (250g)',            qty: 4,  unit: 'Pack', unitCost: 140_000 },
  { label: 'Single Origin Flores (250g)',  qty: 3,  unit: 'Pack', unitCost: 150_000 },
  { label: 'Cold Brew Blend (1kg)',        qty: 2,  unit: 'Pack', unitCost: 340_000 },
  { label: 'Merchandise - Tumbler',        qty: 5,  unit: 'Pcs',  unitCost: 110_000 },
  { label: 'Merchandise - Tote Bag',       qty: 5,  unit: 'Pcs',  unitCost: 85_000  },
  { label: 'Merchandise - Mug',            qty: 6,  unit: 'Pcs',  unitCost: 90_000  },
  { label: 'Merchandise - Cap',            qty: 5,  unit: 'Pcs',  unitCost: 75_000  },
  { label: 'Merchandise - T-Shirt (M)',    qty: 4,  unit: 'Pcs',  unitCost: 120_000 },
  { label: 'Merchandise - T-Shirt (L)',    qty: 4,  unit: 'Pcs',  unitCost: 120_000 },
  { label: 'Merchandise - Hoodie (M)',     qty: 2,  unit: 'Pcs',  unitCost: 250_000 },
  { label: 'Merchandise - Hoodie (L)',     qty: 2,  unit: 'Pcs',  unitCost: 250_000 },
  { label: 'Drip Bag - Kintamani Bali (10g)', qty: 10, unit: 'Box', unitCost: 80_000 },
  { label: 'Drip Bag - House Blend (10g)', qty: 10, unit: 'Box', unitCost: 80_000  },
  { label: 'Gift Box Set (2 x 250g)',      qty: 3,  unit: 'Set',  unitCost: 220_000 },
  { label: 'Gift Box Set (3 x 250g)',      qty: 2,  unit: 'Set',  unitCost: 300_000 },
  { label: 'Pour Over Dripper',            qty: 2,  unit: 'Pcs',  unitCost: 180_000 },
  { label: 'Coffee Server 600ml',          qty: 2,  unit: 'Pcs',  unitCost: 220_000 },
  { label: 'Coffee Scale',                 qty: 2,  unit: 'Pcs',  unitCost: 350_000 },
  { label: 'Bali Blue Moon (250g)',        qty: 2,  unit: 'Pack', unitCost: 160_000 },
  { label: 'Sunset Espresso Blend (1kg)',  qty: 1,  unit: 'Pack', unitCost: 330_000 },
  { label: 'Decaf House Blend (250g)',     qty: 2,  unit: 'Pack', unitCost: 130_000 },
]

// ── Scenario state (dev FAB) ─────────────────────────────────────────────────
type Scenario = 'ai_not_found' | 'ai_matched' | 'filled' | 'many_products' | 'unreadable'
const scenario = ref<Scenario>('ai_matched')
const scenarios: { value: Scenario; label: string }[] = [
  { value: 'ai_not_found',  label: t('AI not found')     },
  { value: 'ai_matched',    label: t('AI matched')       },
  { value: 'filled',        label: t('Filled')           },
  { value: 'many_products', label: t('>10 Products')     },
  { value: 'unreadable',    label: t('Error - file unreadable') },
]
/** Only the >10 Products scenario simulates a multi-page source document —
 *  every other scenario is the usual single-page scan. */
const pageCount = computed(() => (scenario.value === 'many_products' ? 2 : 1))
const previewImages = computed(() => (
  scenario.value === 'many_products'
    ? ['/illustrations/ocr/purchase-invoice-10-1.png', '/illustrations/ocr/purchase-invoice-10-2.png']
    : ['/illustrations/ocr/purchase-invoice.png']
))

// ── Header fields ────────────────────────────────────────────────────────────
const vendor = ref('')
const vendorError = ref(false)
const vendorOptions = ref([...VENDOR_OPTIONS])
function onVendorAdd(_suggestions: unknown, currentSearch: string) {
  const name = currentSearch.trim()
  if (!name) return
  if (!vendorOptions.value.some((v) => v.id === name)) vendorOptions.value.push({ id: name, name })
  vendor.value = name
  vendorError.value = false
}
/** Airene's read of the vendor from the document. */
const vendorAiHint = ref('')

const transactionDate = ref('')
const transactionDateError = ref(false)
const transactionNo = ref('')
const dueDate = ref('')
const dueDateError = ref(false)
const paymentTerms = ref('net30')

const requiresShipping = ref(true)
const warehouse = ref('gudang-bsd')
/** Airene inferred the warehouse from the document's shipping address. */
const warehouseAiHint = ref('')
const shipTo = ref('')

const priceIncludesTax = ref(true)

const moreInfoOpen = ref(false)
const referenceNo = ref('')
const tags = ref<DataInterface[]>([])
function onTagsChange(data: DataInterface[]) { tags.value = data }
/** Vendor contact — same MpInputTag treatment as the PO form's Email field. */
const emailTags = ref<DataInterface[]>([])
function onEmailChange(data: DataInterface[]) { emailTags.value = data }

// ── Reclassify (the ✎ next to the section title) ─────────────────────────────
const classificationModalOpen = ref(false)
function saveClassification(next: Classification) {
  classificationModalOpen.value = false
  // Every reclassification takes the file out of this queue; none of the
  // destinations have a review surface of their own yet, so report and move on.
  const go = goToNext()
  removeFromQueue(props.orderId)
  toast.notify({
    variant: 'success',
    title: `1 ${t('file')} ${t('moved to')} ${next === 'expense' ? t('Expense') : t('Payment receipt')}`,
    rootProps: { class: 'toast-enterprise' },
  })
  go()
}

// ── Product line items (the accepted table) ──────────────────────────────────
interface LineRow {
  id: number
  productId: string
  description: string
  qty: string
  unitId: string
  unitCost: string
  taxId: string
  productError: boolean
  qtyError: boolean
}
let rowSeq = 0
function makeRow(): LineRow {
  return { id: rowSeq++, productId: '', description: '', qty: '', unitId: '', unitCost: '', taxId: '', productError: false, qtyError: false }
}
const rows = ref<LineRow[]>([makeRow()])

function validateLineItems(): boolean {
  let valid = true
  const rowsToCheck = rows.value.length > 1 ? rows.value.slice(0, -1) : rows.value
  rowsToCheck.forEach((row) => {
    if (!row.productId) { row.productError = true; valid = false }
    if (!(Number(row.qty) > 0)) { row.qtyError = true; valid = false }
  })
  return valid
}
const lineItemsHaveError = computed(() => rows.value.some((r) => r.productError || r.qtyError))

function onProductSelect(row: LineRow) {
  if (row.productId) row.productError = false
  const last = rows.value[rows.value.length - 1]
  if (last && last.id === row.id) rows.value.push(makeRow())
}
function removeRow(id: number) {
  if (rows.value.length === 1) return
  rows.value = rows.value.filter((r) => r.id !== id)
}

// ── "To match" cards — one per OCR-extracted product line ────────────────────
interface MatchCard {
  id: number
  /** what the OCR lifted straight off the document */
  sourceLabel: string
  sourceQty: number
  sourceUnit: string
  sourceUnitCost: number
  sourceAmount: number
  /** what Airene proposed — all blank when nothing matched */
  productId: string
  unitId: string
  taxId: string
  /** true when the proposal came from Airene rather than the user */
  aiMatched: boolean
  productError: boolean
}
let cardSeq = 0
const matchCards = ref<MatchCard[]>([])
/** Exactly one card is expanded at a time — closing the open one hands the open
 *  state to the next card rather than collapsing the whole stack. */
const openCardId = ref<number | null>(null)
function toggleCard(id: number) {
  if (openCardId.value !== id) { openCardId.value = id; return }
  const list = matchCards.value
  const i = list.findIndex((c) => c.id === id)
  const next = list[i + 1] ?? list[0]
  openCardId.value = next && next.id !== id ? next.id : id
}
const checkedCards = ref<Set<number>>(new Set())
function toggleChecked(id: number) {
  const s = new Set(checkedCards.value)
  if (s.has(id)) s.delete(id); else s.add(id)
  checkedCards.value = s
}
const allCardsChecked = computed(() => matchCards.value.length > 0 && matchCards.value.every((c) => checkedCards.value.has(c.id)))
const someCardsChecked = computed(() => checkedCards.value.size > 0 && !allCardsChecked.value)
function toggleSelectAllCards() {
  checkedCards.value = allCardsChecked.value ? new Set() : new Set(matchCards.value.map((c) => c.id))
}

/** Products is Ready once every extracted line has been accepted into the table. */
const productsStatus = computed(() => (matchCards.value.length || !rows.value.some((r) => r.productId)) ? 'needs review' : 'ready')
const invoiceStatus = computed(() => {
  const filled = !!vendor.value && !!transactionDate.value && (!requiresShipping.value || !!warehouse.value)
  return filled ? 'ready' : 'needs review'
})

/** Accept every checked card at once — cards that still fail validation (e.g.
 *  no product matched yet) stay checked and keep their error state. */
function acceptCheckedMatches() {
  for (const id of [...checkedCards.value]) {
    const card = matchCards.value.find((c) => c.id === id)
    if (card) acceptMatch(card)
  }
  checkedCards.value = new Set([...checkedCards.value].filter((id) => matchCards.value.some((c) => c.id === id)))
}

/** Accept one card's proposal — the extracted line becomes a real line item. */
function acceptMatch(card: MatchCard) {
  if (!card.productId) { card.productError = true; scrollToFirstError(); return }
  const accepted: LineRow = {
    id: rowSeq++,
    productId: card.productId,
    description: card.sourceLabel,
    qty: String(card.sourceQty),
    unitId: card.unitId,
    unitCost: String(card.sourceUnitCost),
    taxId: card.taxId,
    productError: false, qtyError: false,
  }
  // Drop the trailing blank row while inserting, then re-add one.
  const filled = rows.value.filter((r) => r.productId)
  rows.value = [...filled, accepted, makeRow()]

  const remaining = matchCards.value.filter((c) => c.id !== card.id)
  matchCards.value = remaining
  openCardId.value = remaining[0]?.id ?? null
  itemsUnresolvedError.value = false
  if (!remaining.length) scenario.value = 'filled'
  toast.notify({ variant: 'success', title: t('Product matched'), rootProps: { class: 'toast-enterprise' } })
}

// ── Scenario seeding ─────────────────────────────────────────────────────────
function applyScenario(s: Scenario) {
  rowSeq = 0
  cardSeq = 0
  itemsUnresolvedError.value = false
  vendorError.value = false
  transactionDateError.value = false
  dueDateError.value = false
  checkedCards.value = new Set()
  // The sample invoice is tax-exclusive — its own footer reads
  // 1.000.000 + 100.000 tax + 50.000 shipping = 1.150.000 — so tax is added on
  // top here, unlike the expense review where the printed amount is gross.
  priceIncludesTax.value = false
  requiresShipping.value = true
  paymentTerms.value = 'net30'
  warehouse.value = 'gudang-bsd'
  warehouseAiHint.value = t('from shipping address')
  shipTo.value = 'Jln. Raya Serpong KM 8, Tangerang, Banten 15345'
  transactionDate.value = '30/04/2026'
  dueDate.value = '30/05/2026'
  transactionNo.value = ''
  shippingFee.value = '50000'
  message.value = 'Bank Details\n  Bank name: Bank Central Asia (BCA)\n  Branch: KCU Kuta\n  Account name: EXPAT ROASTERS\n  Account no: 147 2300 020\n  Swift code: CENAIDJA'
  memo.value = ''

  if (s === 'filled') {
    vendor.value = 'EXPAT'
    vendorAiHint.value = 'EXPAT Roasters Bali'
    matchCards.value = []
    openCardId.value = null
    rows.value = [
      { id: rowSeq++, productId: 'arabica-kintamani', description: 'Kintamani Bali (250g)', qty: '3', unitId: 'pack', unitCost: '120000', taxId: 'ppn10', productError: false, qtyError: false },
      { id: rowSeq++, productId: 'espresso-blend',    description: 'House Blend (1kg)',     qty: '2', unitId: 'pack', unitCost: '320000', taxId: 'ppn10', productError: false, qtyError: false },
      makeRow(),
    ]
    return
  }

  // A longer, multi-page invoice — every line lands as its own unmatched
  // "to match" card, so the list actually stacks past ten.
  if (s === 'many_products') {
    vendor.value = 'EXPAT'
    vendorAiHint.value = 'EXPAT Roasters Bali'
    rows.value = [makeRow()]
    matchCards.value = MANY_PRODUCTS_SOURCE.map((p) => ({
      id: cardSeq++,
      sourceLabel: p.label, sourceQty: p.qty, sourceUnit: p.unit,
      sourceUnitCost: p.unitCost, sourceAmount: p.qty * p.unitCost,
      productId: '', unitId: '', taxId: 'ppn10',
      aiMatched: false, productError: false,
    }))
    openCardId.value = matchCards.value[0]!.id
    return
  }

  // OCR couldn't read the file at all — no extracted proposal, so the form
  // renders in its plain empty state (no AI hint, no "to match" cards).
  if (s === 'unreadable') {
    vendor.value = ''
    vendorAiHint.value = ''
    matchCards.value = []
    openCardId.value = null
    rows.value = [makeRow()]
    return
  }

  rows.value = [makeRow()]
  const ai = s === 'ai_matched'
  vendor.value = ai ? 'EXPAT' : ''
  vendorAiHint.value = ai ? 'EXPAT Roasters Bali' : ''
  matchCards.value = [
    {
      id: cardSeq++,
      sourceLabel: 'Kintamani Bali (250g)', sourceQty: 3, sourceUnit: 'Pack',
      sourceUnitCost: 120_000, sourceAmount: 360_000,
      productId: ai ? 'arabica-kintamani' : '', unitId: ai ? 'pcs' : '', taxId: 'ppn10',
      aiMatched: ai, productError: false,
    },
    {
      // Even when Airene can't match the *product*, the tax is stated on the
      // document itself, so the line still carries it — the totals reflect what
      // the invoice says (Rp100.000 PPN) rather than only the matched half.
      id: cardSeq++,
      sourceLabel: 'House Blend (1Kg)', sourceQty: 2, sourceUnit: 'Pack',
      sourceUnitCost: 320_000, sourceAmount: 640_000,
      productId: '', unitId: '', taxId: 'ppn10',
      aiMatched: false, productError: false,
    },
  ]
  openCardId.value = matchCards.value[0]!.id
}
function setScenario(s: Scenario) {
  scenario.value = s
  applyScenario(s)
}

// ── Totals ───────────────────────────────────────────────────────────────────
const shippingFee = ref('0')

/** Gross of every line. While matches are still pending the extracted amounts
 *  stand in, so the totals aren't empty on first run. */
const grossTotal = computed(() => {
  const fromRows = rows.value.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.unitCost) || 0), 0)
  const fromCards = matchCards.value.reduce((s, c) => s + c.sourceAmount, 0)
  return fromRows + fromCards
})
const taxableGross = computed(() => {
  const fromRows = rows.value
    .filter((r) => r.taxId && r.taxId !== 'none')
    .reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.unitCost) || 0), 0)
  const fromCards = matchCards.value
    .filter((c) => c.taxId && c.taxId !== 'none')
    .reduce((s, c) => s + c.sourceAmount, 0)
  return fromRows + fromCards
})
const taxLabel = computed(() => {
  const id = rows.value.find((r) => r.taxId && r.taxId !== 'none')?.taxId
    ?? matchCards.value.find((c) => c.taxId && c.taxId !== 'none')?.taxId
  return TAX_OPTIONS.find((o) => o.id === id)?.name ?? ''
})
const taxAmount = computed(() => Math.round(taxableGross.value * 0.1))
const hasTax = computed(() => taxableGross.value > 0)
const subtotal = computed(() => (priceIncludesTax.value ? grossTotal.value - taxAmount.value : grossTotal.value))
const total = computed(() =>
  (priceIncludesTax.value ? grossTotal.value : grossTotal.value + taxAmount.value) + (Number(shippingFee.value) || 0),
)

// ── Message / Memo / Attachment ──────────────────────────────────────────────
const message = ref('')
const memo = ref('')
const formAttachedFiles = ref<{ name: string; size: number }[]>([])
function addFormFiles(files: FileList | null) {
  if (!files) return
  for (const f of Array.from(files)) {
    if (!formAttachedFiles.value.some((x) => x.name === f.name)) {
      formAttachedFiles.value.push({ name: f.name, size: f.size })
    }
  }
}
function onFormFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  addFormFiles(input.files)
  input.value = ''
}
const formDragOver = ref(false)
function onFormFileDrop(ev: DragEvent) {
  formDragOver.value = false
  addFormFiles(ev.dataTransfer?.files ?? null)
}
function removeFormFile(name: string) {
  formAttachedFiles.value = formAttachedFiles.value.filter((f) => f.name !== name)
}
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
function fileIconName(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'pdf-document'
  if (ext === 'doc' || ext === 'docx') return 'word-document'
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return 'excel-document'
  if (['jpg', 'jpeg', 'png'].includes(ext)) return 'image-document'
  return 'attachment'
}

// ── Save ─────────────────────────────────────────────────────────────────────
const itemsUnresolvedError = ref(false)

function handleSave() {
  let valid = true
  if (!vendor.value) { vendorError.value = true; valid = false }
  if (!transactionDate.value) { transactionDateError.value = true; valid = false }

  if (matchCards.value.length) {
    // Nothing can be saved while extracted lines are still unmatched.
    itemsUnresolvedError.value = true
    matchCards.value.forEach((c) => { if (!c.productId) c.productError = true })
    valid = false
  } else if (!validateLineItems()) {
    valid = false
  }
  if (!valid) { scrollToFirstError(); return }

  // TODO: create a PurchaseInvoice record and land on its detail page once that
  // page exists — parked deliberately, there is no purchase-invoice detail
  // surface yet (the index doesn't link rows anywhere).
  const next = goToNext()
  removeFromQueue(props.orderId)
  toast.notify({ variant: 'success', title: t('Purchase invoice saved'), rootProps: { class: 'toast-enterprise' } })
  next()
}

// For a real user-uploaded file, override the header fields with its own OCR
// data instead of the scenario dummy values. Seed rows (no uploadedAt) keep
// their scenario data. Amount is derived from line items here, so it's left alone.
function applyRealData() {
  const rf = reviewFile.value
  if (!rf?.uploadedAt) return
  if (rf.beneficiary?.name) vendor.value = rf.beneficiary.name
  if (rf.date) transactionDate.value = toDisplayDate(rf.date)
  if (rf.number) transactionNo.value = rf.number
}

applyScenario(scenario.value)
applyRealData()
watch(() => props.orderId, () => { applyScenario(scenario.value); applyRealData() })
</script>

<template>
  <FileReviewShell
    :queue="queue" :file-id="props.orderId"
    :back-label="backLabel" :queue-base="queueBase"
    :is-unreadable="scenario === 'unreadable'"
    :page-count="pageCount"
    :preview-images="previewImages"
    @back="goBack"
  >
    <!-- ══ Section: Invoice ══ -->
    <div class="br-section">
      <div class="br-section-header">
        <div class="br-section-titlerow">
          <h2 class="br-section-title">{{ t('Invoice') }}</h2>
          <!-- Reclassify — the file may not be a purchase invoice at all -->
          <MpButton class="br-icon-btn" :aria-label="t('Edit classification')" @click="classificationModalOpen = true">
            <MpIcon name="edit" size="sm" />
          </MpButton>
          <ErpStatusBadge :status="invoiceStatus" badge-for="additionalInformation" />
        </div>
        <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" @click="moreInfoOpen = !moreInfoOpen">
          {{ moreInfoOpen ? t('Show less') : t('Show more') }}
        </button>
      </div>

      <!-- Vendor -->
      <div class="ex-row-1 ex-section-divider">
        <div class="br-ai-field ex-field-flex">
          <MpFormControl id="iv-vendor" is-required :is-invalid="vendorError" :class="{ 'br-ai-anchor': vendorAiHint }">
            <MpFormLabel>{{ t('Vendor') }}</MpFormLabel>
            <MpAutocomplete
              id="iv-vendor-ac" v-model="vendor" :data="vendorOptions"
              label-prop="name" value-prop="id"
              is-searchable is-clearable use-portal is-full-width is-show-button-action
              :is-invalid="vendorError"
              @update:model-value="vendorError = false"
              @button-action="onVendorAdd"
            >
              <template #buttonAction="{ currentSearch }">
                {{ currentSearch ? `${t('Add')} "${currentSearch}" ${t('as a new vendor')}` : t('Add new vendor') }}
              </template>
            </MpAutocomplete>
            <MpFormErrorMessage>{{ t('You must select vendor') }}</MpFormErrorMessage>
          </MpFormControl>
          <div v-if="vendorAiHint" class="br-ai-banner">
            <MpIcon name="airene-brand" size="sm" />
            <span>{{ t('AI matched') }} — {{ vendorAiHint }} {{ t('in doc') }}</span>
          </div>
        </div>
        <!-- Vendor contact, revealed by "Add more info" — same width as Vendor,
             sitting in the row's own 24px column gap. -->
        <MpFormControl v-if="moreInfoOpen" id="iv-email" class="ex-field-flex">
          <MpFormLabel>{{ t('Email') }}</MpFormLabel>
          <MpInputTag id="iv-email-input" :data="emailTags" :placeholder="t('+ Add email')" @change="onEmailChange" />
        </MpFormControl>
      </div>

      <!-- Dates / terms -->
      <div class="ex-grid-2">
        <MpFormControl id="iv-txdate" is-required :is-invalid="transactionDateError">
          <MpFormLabel>{{ t('Transaction date') }}</MpFormLabel>
          <div class="ex-datepicker">
            <MpDatePicker
              id="iv-txdate-dp" v-model="transactionDate" format="DD/MM/YYYY" value-type="format" use-portal
              @update:model-value="transactionDateError = false"
            />
          </div>
          <MpFormErrorMessage>{{ t('You must select transaction date') }}</MpFormErrorMessage>
        </MpFormControl>
        <MpFormControl id="iv-transno" is-required>
          <div class="ex-label-row">
            <MpFormLabel>{{ t('Transaction no.') }}</MpFormLabel>
            <span class="ex-label-icon" :title="t('Auto-generated')"><MpIcon name="settings" size="sm" /></span>
          </div>
          <MpInput id="iv-transno-input" v-model="transactionNo" placeholder="[Auto]" is-full-width is-disabled />
        </MpFormControl>
        <MpFormControl id="iv-duedate" :is-invalid="dueDateError">
          <MpFormLabel>{{ t('Due date') }}</MpFormLabel>
          <div class="ex-datepicker">
            <MpDatePicker
              id="iv-duedate-dp" v-model="dueDate" format="DD/MM/YYYY" value-type="format" use-portal
              @update:model-value="dueDateError = false"
            />
          </div>
          <MpFormErrorMessage>{{ t('You must select due date') }}</MpFormErrorMessage>
        </MpFormControl>
        <MpFormControl id="iv-terms">
          <MpFormLabel>{{ t('Payment terms') }}</MpFormLabel>
          <MpSelect id="iv-terms-select" v-model="paymentTerms" is-full-width>
            <option v-for="o in PAYMENT_TERM_OPTIONS" :key="o.id" :value="o.id">{{ o.name }}</option>
          </MpSelect>
        </MpFormControl>
        <template v-if="moreInfoOpen">
          <MpFormControl id="iv-refno">
            <MpFormLabel>{{ t('Reference no.') }}</MpFormLabel>
            <MpInput id="iv-refno-input" v-model="referenceNo" is-full-width />
          </MpFormControl>
          <MpFormControl id="iv-tags">
            <MpFormLabel>{{ t('Tag') }}</MpFormLabel>
            <MpInputTag id="iv-tags-input" :data="tags" :is-enable-create-new-tag="true" :is-show-suggestions="false" @change="onTagsChange" />
          </MpFormControl>
        </template>
      </div>

      <!-- Shipping -->
      <div class="iv-shipping-check">
        <MpCheckbox id="iv-requires-shipping" :is-checked="requiresShipping" @change="requiresShipping = !requiresShipping" />
        <span>{{ t('Requires shipping') }}</span>
      </div>
      <div v-if="requiresShipping" class="ex-grid-2 iv-shipping-grid">
        <div class="br-ai-field">
          <MpFormControl id="iv-warehouse" :class="{ 'br-ai-anchor': warehouseAiHint }">
            <MpFormLabel>{{ t('Warehouse') }}</MpFormLabel>
            <MpAutocomplete
              id="iv-warehouse-ac" v-model="warehouse" :data="WAREHOUSE_OPTIONS"
              label-prop="name" value-prop="id" is-searchable use-portal is-full-width
              :placeholder="t('Select warehouse')"
            />
          </MpFormControl>
          <div v-if="warehouseAiHint" class="br-ai-banner">
            <MpIcon name="airene-brand" size="sm" />
            <span>{{ t('AI matched') }} — {{ warehouseAiHint }}</span>
          </div>
        </div>
        <MpFormControl id="iv-shipto">
          <MpFormLabel>{{ t('Ship to') }}</MpFormLabel>
          <MpTextarea id="iv-shipto-textarea" v-model="shipTo" is-full-width :rows="2" />
        </MpFormControl>
      </div>
    </div>

    <!-- ══ Section: Products ══ -->
    <div class="br-section">
      <div class="br-section-header">
        <div class="br-section-titlerow">
          <h2 class="br-section-title">{{ t('Products') }}</h2>
          <ErpStatusBadge :status="productsStatus" badge-for="additionalInformation" />
        </div>
      </div>

      <div v-if="!matchCards.length" class="ex-price-includes">
        <MpCheckbox id="iv-price-incl" :is-checked="priceIncludesTax" @change="priceIncludesTax = !priceIncludesTax" />
        <span>{{ t('Price includes tax') }}</span>
      </div>

      <MpBanner
        v-if="lineItemsHaveError || itemsUnresolvedError"
        id="iv-items-error-banner" variant="danger" align-items="center" class="br-items-error-banner"
      >
        <MpBannerIcon id="iv-items-error-banner-icon" />
        <MpBannerTitle>{{ t('Failed to save') }}</MpBannerTitle>
        <MpBannerDescription>{{ t('The transaction contains incomplete or invalid data. Review the highlighted fields.') }}</MpBannerDescription>
      </MpBanner>

      <!-- ── To-match flow ── -->
      <template v-if="matchCards.length">
        <div class="br-accordion">
          <div class="br-accordion-head">
            <MpIcon name="chevrons-down" size="sm" class="br-accordion-chevron" />
            <span class="br-accordion-labels">
              <span class="br-accordion-title">{{ t('To match') }}</span>
              <span class="br-accordion-desc">{{ t('Start matching to add product lines') }}</span>
            </span>
          </div>

          <div class="br-match-wrap">
            <!-- Bulk bar — select-all checkbox is always visible once there's more than
                 one match card; "Accept match" only appears once something is checked. -->
            <div v-if="matchCards.length > 1" class="br-match-bulk-bar">
              <div class="br-match-bulk-bar__left">
                <MpCheckbox :is-checked="allCardsChecked" :is-indeterminate="someCardsChecked" @change="toggleSelectAllCards" />
                <span>{{ t('Select all matches') }}</span>
              </div>
              <button v-if="checkedCards.size > 0" class="btn-enterprise btn-enterprise--primary btn-enterprise--sm" @click="acceptCheckedMatches">{{ t('Accept match') }}</button>
            </div>
            <div v-for="card in matchCards" :key="card.id" class="br-match-card">
              <!-- Card header: what the doc says ⟷ what it maps to -->
              <div class="br-match-head">
                <div class="br-match-head-col br-match-head-col--src">
                  <div class="br-match-head-controls">
                    <MpCheckbox v-if="matchCards.length > 1" :id="`iv-match-check-${card.id}`" :is-checked="checkedCards.has(card.id)" @change="toggleChecked(card.id)" />
                    <MpButton class="br-icon-btn" :aria-label="t('Toggle details')" @click="toggleCard(card.id)">
                      <MpIcon :name="openCardId === card.id ? 'chevrons-down' : 'chevrons-right'" size="md" />
                    </MpButton>
                  </div>
                  <div class="br-match-stack br-match-stack--end">
                    <span class="br-match-name">{{ card.sourceLabel }}</span>
                    <span class="br-match-sub">{{ card.sourceQty }} {{ card.sourceUnit }}</span>
                  </div>
                </div>

                <div class="br-match-link" aria-hidden="true"><span class="br-match-link-line" /></div>

                <div class="br-match-head-col br-match-head-col--dest">
                  <div class="br-match-stack">
                    <div class="br-match-name-row">
                      <span class="br-match-name" :class="{ 'br-match-name--empty': !card.productId }">
                        {{ PRODUCT_OPTIONS.find(p => p.id === card.productId)?.name || t('Match not found') }}
                      </span>
                      <span v-if="card.aiMatched" class="br-ai-badge">
                        <MpIcon name="airene-brand" size="sm" />{{ t('AI matched') }}
                      </span>
                    </div>
                    <span v-if="card.productId" class="br-match-sub">
                      {{ card.sourceQty }} {{ UNIT_OPTIONS.find(u => u.id === card.unitId)?.name || card.sourceUnit }}
                    </span>
                  </div>
                  <MpTooltip :id="`iv-accept-tip-${card.id}`" :label="t('Accept match')" placement="top" use-portal>
                    <MpButton
                      class="br-accept-btn" :class="{ 'br-accept-btn--idle': !card.productId }"
                      :aria-label="t('Accept match')" @click="acceptMatch(card)"
                    >
                      <MpIcon name="check" size="md" />
                    </MpButton>
                  </MpTooltip>
                </div>
              </div>

              <!-- Card body: the extracted values, and the fields they map to -->
              <div v-if="openCardId === card.id" class="br-match-body">
                <div class="br-match-body-left">
                  <p class="br-match-body-title">{{ card.sourceLabel }}</p>
                  <div class="br-match-rows">
                    <div class="br-match-row">
                      <span class="br-match-row-key">{{ t('Qty') }}</span>
                      <span class="br-match-row-val">{{ card.sourceQty }} {{ card.sourceUnit }}</span>
                    </div>
                    <div class="br-match-row">
                      <span class="br-match-row-key">{{ t('Unit cost') }}</span>
                      <span class="br-match-row-val">{{ formatIDR(card.sourceUnitCost) }}</span>
                    </div>
                    <div class="br-match-row">
                      <span class="br-match-row-key">{{ t('Amount') }}</span>
                      <span class="br-match-row-val">{{ formatIDR(card.sourceAmount) }}</span>
                    </div>
                  </div>
                </div>
                <div class="br-match-body-right">
                  <div v-if="card.aiMatched" class="br-ai-banner br-ai-banner--boxed">
                    <MpIcon name="airene-brand" size="sm" />
                    <span>{{ t('AI matched from previous transactions') }}</span>
                  </div>
                  <div class="br-match-form">
                    <MpFormControl :id="`iv-match-product-${card.id}`" is-required :is-invalid="card.productError">
                      <MpFormLabel>{{ t('Product') }}</MpFormLabel>
                      <MpAutocomplete
                        :id="`iv-match-product-ac-${card.id}`" v-model="card.productId" :data="PRODUCT_OPTIONS"
                        label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                        :placeholder="t('Select product')"
                        :is-invalid="card.productError"
                        @update:model-value="card.productError = false; itemsUnresolvedError = false"
                      />
                      <MpFormErrorMessage>{{ t('You must select product') }}</MpFormErrorMessage>
                    </MpFormControl>
                    <div class="iv-match-pair">
                      <MpFormControl :id="`iv-match-unit-${card.id}`">
                        <MpFormLabel>{{ t('Unit') }}</MpFormLabel>
                        <MpAutocomplete
                          :id="`iv-match-unit-ac-${card.id}`" v-model="card.unitId" :data="UNIT_OPTIONS"
                          label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                          :placeholder="t('Select unit')"
                        />
                      </MpFormControl>
                      <MpFormControl :id="`iv-match-tax-${card.id}`">
                        <MpFormLabel>{{ t('Tax') }}</MpFormLabel>
                        <MpAutocomplete
                          :id="`iv-match-tax-ac-${card.id}`" v-model="card.taxId" :data="TAX_OPTIONS"
                          label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                          :placeholder="t('Select tax')"
                        />
                      </MpFormControl>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Nothing accepted into the invoice yet -->
        <div v-if="!rows.some(r => r.productId)" class="br-blank-slate">
          <img src="/illustrations/empty-folder.png" alt="" width="144" height="120" />
          <p class="br-blank-title">{{ t('No matched product yet') }}</p>
          <p class="br-blank-desc">{{ t('Matched products will appear here.') }}</p>
        </div>
      </template>

      <!-- ── The editable product table ── -->
      <div v-if="rows.some(r => r.productId) || !matchCards.length" class="ex-table-section">
        <div class="ex-table-scroll">
          <table class="ex-table iv-lineitems-table">
            <colgroup>
              <col class="ex-col-drag" />
              <col class="iv-col-product" />
              <col class="iv-col-desc" />
              <col class="iv-col-qty" />
              <col class="iv-col-unit" />
              <col class="iv-col-cost" />
              <col class="ex-col-del" />
            </colgroup>
            <thead>
              <tr>
                <th class="ex-th ex-th--drag" />
                <th class="ex-th">{{ t('Product') }}</th>
                <th class="ex-th">{{ t('Description') }}</th>
                <th class="ex-th">{{ t('Qty') }}</th>
                <th class="ex-th">{{ t('Unit') }}</th>
                <th class="ex-th">{{ t('Unit cost') }}</th>
                <th class="ex-th ex-th--del" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.id" class="ex-tr">
                <td class="ex-td ex-td--drag"><div class="ex-cell-center"><MpIcon name="drag" size="sm" /></div></td>
                <td class="ex-td ex-td--input ex-td--border" :class="{ 'ex-td--error': row.productError }">
                  <MpAutocomplete
                    :id="`iv-row-product-${row.id}`" v-model="row.productId" :data="PRODUCT_OPTIONS"
                    label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                    :placeholder="t('Select product')"
                    @update:model-value="onProductSelect(row)"
                  />
                </td>
                <td class="ex-td ex-td--input ex-td--border">
                  <MpInput :id="`iv-row-desc-${row.id}`" v-model="row.description" is-full-width />
                </td>
                <td class="ex-td ex-td--input ex-td--border" :class="{ 'ex-td--error': row.qtyError }">
                  <MpInput :id="`iv-row-qty-${row.id}`" v-model="row.qty" is-full-width @update:model-value="row.qtyError = false" />
                </td>
                <td class="ex-td ex-td--input ex-td--border">
                  <MpAutocomplete
                    :id="`iv-row-unit-${row.id}`" v-model="row.unitId" :data="UNIT_OPTIONS"
                    label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                  />
                </td>
                <td class="ex-td ex-td--input ex-td--border ex-td--amount">
                  <div class="ex-amount-cell">
                    <span class="ex-amount-prefix">Rp</span>
                    <MpInput :id="`iv-row-cost-${row.id}`" v-model="row.unitCost" class="ex-amount-input" is-full-width />
                  </div>
                </td>
                <td class="ex-td ex-td--del">
                  <div class="ex-cell-center">
                    <MpButton v-if="rows.length > 1" class="ex-del-btn" :aria-label="t('Remove row')" @click="removeRow(row.id)">
                      <MpIcon name="minus-circular" size="sm" />
                    </MpButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>

    <!-- ══ Bottom: Additional info notes (left) + Totals (right) ══ -->
    <div class="br-section">
      <div class="rv-bottom">
        <div class="rv-notes">
          <!-- Message — unlike Memo, this one goes out to the vendor -->
          <div class="ex-section">
            <MpFormControl id="iv-message">
              <MpFormLabel>{{ t('Message') }}</MpFormLabel>
              <MpTextarea id="iv-message-textarea" v-model="message" is-full-width :rows="6" />
            </MpFormControl>
            <p class="ex-helper-text">{{ t('Visible to vendor') }}</p>
          </div>

          <div class="ex-section">
            <MpFormControl id="iv-memo">
              <MpFormLabel>{{ t('Memo') }}</MpFormLabel>
              <MpTextarea id="iv-memo-textarea" v-model="memo" is-full-width :rows="4" />
            </MpFormControl>
            <p class="ex-helper-text">{{ t('Only visible to you and your team') }}</p>
          </div>

          <div class="ex-section ex-attachment-section">
            <div class="ex-section-label">{{ t('Attachment') }}</div>
            <div class="ex-attachment">
              <MpUpload
                id="iv-attachment-upload"
                class="ex-attachment-upload"
                :class="{ 'ex-attachment-upload--dragover': formDragOver }"
                accept=".xls,.xlsx,.doc,.docx,.pdf,.jpg,.jpeg,.png,.zip"
                is-multiple is-full-width
                :placeholder="t('or drag and drop here')"
                :button-text="t('Choose file')"
                @change="onFormFileChange"
                @dragover.prevent="formDragOver = true"
                @dragleave.prevent="formDragOver = false"
                @drop.prevent="onFormFileDrop"
              />
              <p class="ex-helper-text">{{ t('Files must be in XLS, DOC, PDF, JPG, PNG, or ZIP format, with a maximum size of 10 MB per file and 5 files per transaction') }}</p>
              <MpUploadList
                v-if="reviewFile"
                id="iv-source-file"
                :title="reviewFile.file" status="success" subtitle="128 KB"
                :icon-name="fileIconName(reviewFile.file)"
              />
              <MpUploadList
                v-for="f in formAttachedFiles" :key="f.name"
                :id="`iv-attachment-file-${f.name}`"
                :title="f.name" status="success" :subtitle="formatFileSize(f.size)"
                :icon-name="fileIconName(f.name)"
                is-show-remove-button
                @remove="removeFormFile(f.name)"
              />
            </div>
          </div>
        </div>

        <!-- Totals -->
        <div class="rv-totals">
          <div class="br-totals">
            <div class="ex-total-row">
              <span class="ex-total-label">{{ t('Subtotal') }}</span>
              <span class="ex-total-amt">{{ formatIDR(subtotal) }}</span>
            </div>
            <div v-if="hasTax" class="ex-total-row">
              <span class="ex-total-label">{{ taxLabel }}</span>
              <span class="ex-total-amt">{{ formatIDR(taxAmount) }}</span>
            </div>
            <div class="ex-total-row">
              <span class="ex-total-label">{{ t('Shipping fee') }}</span>
              <div class="iv-shipping-fee">
                <span class="ex-amount-prefix">Rp</span>
                <MpInput id="iv-shipping-fee-input" v-model="shippingFee" class="ex-amount-input" is-full-width />
              </div>
            </div>
            <div class="ex-total-rule" />
            <div class="ex-total-row">
              <span class="ex-total-label ex-total-label--strong">{{ t('Total') }}</span>
              <span class="ex-total-amt ex-total-amt--strong">{{ formatIDR(total) }}</span>
            </div>
          </div>
        </div>
      </div>

      <footer class="ex-footer">
        <button class="btn-enterprise btn-enterprise--ghost" @click="goBack">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--secondary" @click="goToNext()()">{{ t('Skip without saving') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" @click="handleSave">{{ isLastFile ? t('Save') : t('Save & next') }}</button>
      </footer>
    </div>

    <template #overlays>
      <EditClassificationModal
        :is-open="classificationModalOpen"
        current="invoice"
        @close="classificationModalOpen = false"
        @save="saveClassification"
      />

      <!-- ── Demo scenario FAB — same component as the expense review ── -->
      <MpPopover id="iv-demo-fab" is-close-on-select use-portal placement="top-end">
        <MpPopoverTrigger>
          <MpButton class="demo-fab" :aria-label="t('Change scenario state')">
            <MpIcon name="sliders" size="md" color="icon.inverse" />
          </MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
          <p class="demo-fab-heading">{{ t('Scenario state') }}</p>
          <MpPopoverList>
            <MpPopoverListItem
              v-for="s in scenarios" :key="s.value"
              :is-active="s.value === scenario" @click="setScenario(s.value)"
            >{{ s.label }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>
  </FileReviewShell>
</template>

<style scoped>
/* ── Section shell ────────────────────────────────────────────────────────── */
.br-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); padding-bottom: var(--mp-spacing-6); }
.br-section-header { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.br-section-titlerow { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.br-section-title {
  margin: 0; font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl); color: var(--mp-text-default);
}
.br-icon-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px) !important; height: var(--mp-sizes-8, 32px) !important; min-width: 0 !important;
  padding: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-sm) !important;
  color: var(--mp-text-secondary); cursor: pointer;
}
.br-icon-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3) !important; color: var(--mp-text-default); }

/* ── Airene hints ─────────────────────────────────────────────────────────── */
.br-ai-field { display: flex; flex-direction: column; }
.br-ai-anchor { margin-bottom: calc(-1 * var(--mp-spacing-2)); position: relative; z-index: 2; }
.br-ai-banner {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-3);
  position: relative; z-index: 1;
  background: var(--mp-airene-banner-bg, #f6f3ff); color: var(--mp-airene-banner-text, #5221a5);
  padding: var(--mp-spacing-4) var(--mp-spacing-1\.5) var(--mp-spacing-1\.5);
  border-radius: 0 0 var(--mp-radii-md) var(--mp-radii-md);
  font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm, 16px);
}
.br-ai-banner--boxed { padding: var(--mp-spacing-1\.5); border-radius: var(--mp-radii-md); margin: 0; }
.br-ai-badge {
  display: inline-flex; align-items: center; flex-shrink: 0; gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-1);
  border-radius: var(--mp-radii-full);
  background: var(--mp-airene-banner-bg, #f6f3ff); color: var(--mp-airene-banner-text, #5221a5);
  font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm); white-space: nowrap;
}
/* The airene-brand glyph has no intrinsic box — MpIcon's size prop leaves it at
   its natural (oversized) dimensions, so pin it to what each context expects. */
.br-ai-badge :deep(svg) { width: 10px; height: 10px; flex-shrink: 0; }
.br-ai-banner :deep(svg) { width: 16px; height: 16px; flex-shrink: 0; }

/* ── Header field rows ────────────────────────────────────────────────────── */
.ex-row-1 { display: flex; align-items: flex-start; flex-wrap: wrap; gap: var(--mp-spacing-4) var(--mp-spacing-6); }
.ex-field-flex { flex: 0 0 var(--ex-field-width); min-width: 0; }
.ex-grid-2 {
  display: grid; grid-template-columns: repeat(auto-fill, var(--ex-field-width));
  justify-content: flex-start; gap: var(--mp-spacing-4) var(--mp-spacing-6); padding-top: var(--mp-spacing-5, 20px);
}
/* Dashed rule between the vendor row and the date grid — 20px clear on each
   side. .br-section's 12px flex gap is cancelled so it doesn't stack onto the
   grid's own 20px padding-top and push the rule off-centre. */
.ex-section-divider {
  border-bottom: 1px dashed var(--mp-border-default, #e3e7e9);
  padding-bottom: var(--mp-spacing-5, 20px);
  margin-bottom: calc(-1 * var(--mp-spacing-3));
}
.ex-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.ex-label-icon { display: flex; align-items: center; color: var(--mp-text-secondary); cursor: pointer; }
.ex-datepicker { width: 100%; }
.ex-datepicker :deep(.mp-datepicker__root) { width: 100%; }

/* No gap — MpCheckbox renders its own 12px control-to-label gap internally */
.iv-shipping-check {
  display: flex; align-items: center; gap: 0; padding-top: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.iv-shipping-grid { padding-top: var(--mp-spacing-1); }

/* Same text style/spacing as "I have paid this bill" on the expense review —
   gap:0 since MpCheckbox renders its own 12px control-to-label gap. */
.ex-price-includes {
  display: flex; align-items: center; gap: 0; justify-content: flex-end;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}

/* ── "To match" accordion ─────────────────────────────────────────────────── */
.br-items-error-banner { margin-bottom: var(--mp-spacing-1); }
.br-accordion { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.br-accordion-head { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); text-align: left; }
.br-accordion-chevron { flex-shrink: 0; margin-top: var(--mp-spacing-0\.5, 2px); color: var(--mp-text-default); }
.br-accordion-labels { display: flex; flex-direction: column; gap: 0; min-width: 0; }
.br-accordion-title {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg); color: var(--mp-text-default);
}
.br-accordion-desc {
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary);
}

/* Highlight tray the match cards sit in (--mp-background-highlight is not
   defined in this app's token set, so the Figma value backs it up). */
.br-match-wrap {
  display: flex; flex-direction: column; gap: var(--mp-spacing-3);
  background: var(--mp-background-highlight, #f3f1fc);
  border-radius: var(--mp-radii-md); padding: var(--mp-spacing-3);
  margin-left: var(--mp-spacing-8);
}
/* Bulk bar — mirrors ErpTablePage's erp-bulk-bar (checkbox + count on the
   left, primary action flush right) for the "to match" checkbox selection. */
.br-match-bulk-bar {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-3);
}
/* Reuses .ex-paid-check's checkbox+label layout ("I have paid this bill") —
   gap:0 since MpCheckbox renders its own 12px control-to-label gap. */
.br-match-bulk-bar__left {
  display: flex; align-items: center; gap: 0; min-width: 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap;
}
.br-match-card {
  background: var(--mp-background-neutral, #ffffff); border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-md); overflow: hidden;
}
.br-match-head {
  display: flex; align-items: stretch; min-height: 60px;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.br-match-head-col { display: flex; align-items: center; gap: var(--mp-spacing-4); flex: 1 1 0; min-width: 0; }
.br-match-head-col--src { padding: var(--mp-spacing-2) var(--mp-spacing-3); }
.br-match-head-col--dest { padding: var(--mp-spacing-2) var(--mp-spacing-6) var(--mp-spacing-2) var(--mp-spacing-3); }
.br-match-head-controls { display: flex; align-items: center; flex-shrink: 0; }
.br-match-link { flex: 0 0 52px; display: flex; align-items: center; justify-content: center; }
.br-match-link-line { width: 24px; border-top: 1px solid var(--mp-border-bold, #758195); }

.br-match-stack { display: flex; flex-direction: column; gap: var(--mp-spacing-1); flex: 1 1 0; min-width: 0; }
.br-match-stack--end { align-items: flex-end; text-align: right; }
.br-match-name {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md); color: var(--mp-text-default);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;
}
/* "Match not found" — nothing to name yet, so it reads as placeholder text */
.br-match-name--empty { font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); }
.br-match-name-row { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.br-match-sub {
  font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;
}
.br-accept-btn {
  flex-shrink: 0;
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  padding: 0 !important;
  border: 2px solid var(--mp-border-bold, #758195) !important;
  background: transparent !important;
  border-radius: var(--mp-radii-full) !important;
  color: var(--mp-border-bold, #758195); cursor: pointer;
}
.br-accept-btn:hover {
  border-color: var(--mp-border-selected, #029861) !important;
  color: var(--mp-border-selected, #029861);
}
/* Unmatched line — accepting isn't available until a product is picked */
.br-accept-btn--idle {
  border-color: var(--mp-border-default) !important;
  color: var(--mp-text-placeholder);
}

.br-match-body { display: flex; align-items: stretch; }
.br-match-body-left {
  flex: 1 1 0; min-width: 0;
  display: flex; flex-direction: column;
  padding: var(--mp-spacing-4) 38px var(--mp-spacing-4) var(--mp-spacing-6);
  border-right: 1px solid var(--mp-border-default, #e3e7e9);
}
.br-match-body-title {
  margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg); color: var(--mp-text-default);
}
.br-match-rows { display: flex; flex-direction: column; }
.br-match-row { display: flex; align-items: flex-start; gap: var(--mp-spacing-2); }
.br-match-row-key {
  flex: 0 0 160px; padding: var(--mp-spacing-1) 0;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default);
}
.br-match-row-val {
  flex: 1 1 0; min-width: 0; padding: var(--mp-spacing-1) 0;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default);
}
.br-match-body-right {
  flex: 1 1 0; min-width: 0;
  display: flex; flex-direction: column; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6) var(--mp-spacing-4) 38px;
}
.br-match-form { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
/* Unit and Tax share a row in the product variant (Figma 4342:66718) */
.iv-match-pair { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-4); }

/* ── Blank slate ──────────────────────────────────────────────────────────── */
.br-blank-slate {
  display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-8) var(--mp-spacing-6); text-align: center;
}
.br-blank-title {
  margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg); color: var(--mp-text-default);
}
.br-blank-desc {
  margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary);
}

/* ── Line-items table ─────────────────────────────────────────────────────── */
.ex-table-section { overflow-x: auto; border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.ex-table-scroll { overflow-x: auto; }
.ex-table { width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0; border-radius: 0; }
.ex-col-drag { width: 44px; }
.iv-col-product { width: 200px; }
.iv-col-desc { width: auto; }
.iv-col-qty { width: 96px; }
.iv-col-unit { width: 120px; }
.iv-col-cost { width: 160px; }
.ex-col-del { width: 44px; }
.ex-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  font-style: normal; text-transform: uppercase; letter-spacing: var(--mp-letter-spacings-normal);
  color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  white-space: nowrap;
}
.ex-th--drag, .ex-th--del { padding: 0; }
.ex-td {
  padding: var(--mp-sizes-2\.5, 10px) var(--mp-spacing-4) var(--mp-sizes-2\.5, 10px) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  /* A taller cell (wrapped text, error tooltip, etc.) must not pull the row's
     other cells to its vertical center — everything pins to the top instead. */
  vertical-align: top;
}
.ex-tr:last-child .ex-td { border-bottom: none; }
.ex-td--drag { padding: 0; text-align: center; color: var(--mp-text-placeholder); cursor: grab; }
.ex-td--input { padding: 0; }
.ex-td--input :deep([class*='input']), .ex-td--input :deep([class*='autocomplete']) { border-radius: 0; border-color: transparent; }
.ex-td--input:focus-within { box-shadow: inset 0 0 0 2px var(--mp-colors-border-focused, #41c6a0); }
.ex-td--del { padding: 0; text-align: center; }
.ex-td--border { border-right: 1px solid var(--mp-border-default, #e3e7e9); }
.ex-td--error { background: var(--mp-background-danger-subtle, #fef2f2); box-shadow: inset 0 -1px 0 0 var(--mp-border-danger, #dc2626); }
.ex-td--error :deep([class*='autocomplete']), .ex-td--error :deep([class*='input']) { background: transparent; }
.iv-lineitems-table { min-width: 820px; margin-right: auto; }
.iv-lineitems-table .ex-td { height: var(--mp-sizes-10, 40px); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.iv-lineitems-table .ex-td--amount { padding: 0; position: relative; }
/* Pins the drag/delete control to the first row's height instead of drifting
   to the vertical center of a taller row. */
.ex-cell-center { display: flex; align-items: center; justify-content: center; height: var(--mp-sizes-10, 40px); }
/* inset:0 (not height:100%) fills the full — possibly taller — row height.
   align-items:stretch then lets .ex-amount-prefix (auto cross-size) grow to
   match, while the input keeps its own fixed height and simply docks to the
   top (a flex item with a definite cross size doesn't stretch). */
.ex-amount-cell { display: flex; align-items: stretch; position: absolute; inset: 0; min-height: var(--mp-sizes-10, 40px); }
.ex-amount-prefix {
  flex-shrink: 0; display: flex; align-items: flex-start; justify-content: center;
  padding: var(--mp-sizes-2\.5, 10px) var(--mp-spacing-2) 0 var(--mp-spacing-2); background: var(--mp-background-neutral-subtle, #f8f9f9);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); border-radius: 0;
}
.ex-amount-input { flex: 1; min-width: 0; }
.ex-del-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px) !important; height: var(--mp-sizes-8, 32px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-sm) !important;
  cursor: pointer; color: var(--mp-text-secondary); flex-shrink: 0;
}
.ex-del-btn:hover { background: var(--mp-background-neutral, #ffffff) !important; color: var(--mp-text-danger); }

/* ── Bottom: notes (left) + totals (right) ────────────────────────────────── */
.rv-bottom { display: flex; align-items: flex-start; gap: var(--mp-spacing-6); flex-wrap: wrap; }
.rv-notes  { display: flex; flex-direction: column; gap: 20px; flex: 1 1 380px; min-width: 320px; }
.rv-totals { flex: 0 0 428px; max-width: 100%; display: flex; flex-direction: column; }

/* ── Totals ───────────────────────────────────────────────────────────────── */
.br-totals { display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding-top: var(--mp-spacing-4); }
.ex-total-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.ex-total-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.ex-total-amt { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
.ex-total-label--strong, .ex-total-amt--strong {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.ex-total-rule { border-top: 1px solid var(--mp-border-default, #e3e7e9); }
/* Shipping fee is the one editable total (Figma 4712:75451) */
.iv-shipping-fee {
  display: flex; align-items: stretch; width: 180px; height: var(--mp-sizes-9, 36px);
  border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16));
  border-radius: var(--mp-radii-md); overflow: hidden;
}
.iv-shipping-fee :deep([class*='input']) { border: none; border-radius: 0; }

/* ── Message / Memo / Attachment ──────────────────────────────────────────── */
.ex-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); max-width: 440px; }
.ex-section-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ex-helper-text { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm); }
.ex-attachment { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ex-section.ex-attachment-section { gap: var(--mp-spacing-1); }
/* MpText sets its colour through an inline custom property — only !important wins */
.ex-attachment-upload :deep(p[data-pixel-component="MpText"]) { color: var(--mp-text-placeholder) !important; }
.ex-attachment-upload--dragover { border-color: var(--mp-colors-border-focused, #41c6a0) !important; }

/* ── Footer ───────────────────────────────────────────────────────────────── */
.ex-footer {
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding-top: var(--mp-spacing-6); padding-bottom: var(--mp-spacing-12, 48px);
}

/* ── Demo scenario FAB — mirrors BillReviewPage.vue's .demo-fab ──────────── */
.demo-fab {
  position: fixed; right: var(--mp-spacing-6); bottom: var(--mp-spacing-6);
  width: var(--mp-spacing-12, 48px); height: var(--mp-spacing-12, 48px);
  padding: 0 !important; min-width: 0 !important;
  display: inline-flex !important; align-items: center; justify-content: center;
  border: none !important; border-radius: var(--mp-radii-full, 999px) !important;
  background: var(--mp-background-inverse) !important; color: var(--mp-text-inverse);
  cursor: pointer; z-index: 1200;
  box-shadow: 0 4px 6px -2px rgba(0,0,0,0.1), 0 10px 15px -3px rgba(0,0,0,0.2); /* pixel-police-allow-shadow: floating FAB trigger */
}
.demo-fab:hover { opacity: 0.9; background: var(--mp-background-inverse) !important; }
.demo-fab-heading {
  padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
</style>
