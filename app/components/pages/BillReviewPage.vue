<script setup lang="ts">
/**
 * BillReviewPage — "File review N of M" for a file classified as a Bill.
 *
 * Reuses NewExpensePage.vue's form sections wholesale (left preview panel,
 * header fields, line-items table, totals, memo/attachment, payment tabs,
 * validation) and adds the OCR-review-only pieces: section status badges,
 * the Airene match hint, and the "To match" accordion card.
 *
 * Three scenario states (dev FAB, same pattern as NewProductPage.vue):
 *   ai_not_found — nothing matched; the to-match card is blank, user picks
 *                  product + tax by hand.
 *   ai_matched   — Airene proposed a product/tax from previous transactions;
 *                  card shows the match, user accepts (✓) or edits.
 *   filled       — the match has been accepted, so Items is a normal editable
 *                  line-items table and the section reads Ready.
 * Accepting a match in either to-match state transitions the page to `filled`,
 * so the states are one flow rather than three unrelated mocks.
 */
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import {
  MpButton, MpCheckbox, MpInput, MpTextarea, MpAutocomplete, MpDatePicker,
  MpInputTag, MpIcon, MpUpload, MpUploadList, toast, MpTooltip,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel,
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpTextlink, css,
  type DataInterface,
} from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { reviewFiles, moveReviewFilesToPurchaseInvoice } from '~/data'
import { addBill } from '~/data/bills'
import { scrollToFirstError } from '~/utils/form'

const props = defineProps<{ id: string }>()

const router = useRouter()
const { t } = useLocale()

// ── Date helpers (same conversions as NewExpensePage) ────────────────────────
function toDisplayDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function toISODate(display: string) {
  const [d, m, y] = display.split('/')
  return `${y}-${m}-${d}`
}
const todayDisplay = toDisplayDate(new Date().toISOString().slice(0, 10))

function goExpenses() {
  router.push({ path: '/expenses', query: { tab: 'Review files' } })
}

// ── The file under review + its position in the queue ("3 of 5") ─────────────
const reviewFile = computed(() => reviewFiles.find((rf) => rf.id === props.id) ?? reviewFiles[0])
const queueIndex = computed(() => {
  const i = reviewFiles.findIndex((rf) => rf.id === props.id)
  return i === -1 ? 0 : i
})
const queueTotal = computed(() => reviewFiles.length)
function goToFile(id: string) {
  if (id !== props.id) router.push(`/expenses/review/${id}`)
}
function fileIconName(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'pdf-document'
  if (ext === 'doc' || ext === 'docx') return 'word-document'
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return 'excel-document'
  if (['jpg', 'jpeg', 'png'].includes(ext)) return 'image-document'
  return 'attachment'
}

// ── Master data — same local stand-ins as NewExpensePage, plus the parking
// account the OCR sample matches against. ────────────────────────────────────
const ACCOUNT_OPTIONS = [
  { id: '486', name: '486 - Parking Expense' },
  { id: '6-60040', name: '6-60040 - Parking Expense' },
  { id: '485', name: '485 - Subscriptions' },
  { id: '520', name: '520 - Office supplies' },
  { id: '540', name: '540 - Travel' },
  { id: '610', name: '610 - Utilities' },
  { id: '710', name: '710 - Equipment' },
  { id: '810', name: '810 - Marketing' },
]
const TAX_OPTIONS = [
  { id: 'pbjt10', name: 'PBJT 10%' },
  { id: 'ppn10', name: 'PPN 10%' },
  { id: 'none', name: t('No tax') },
]
const BANK_ACCOUNT_OPTIONS = [
  { id: '1-10003', name: '1-10003 Bank BCA' },
  { id: '1-10004', name: '1-10004 VISA 8265' },
]
const BENEFICIARY_OPTIONS = [
  { id: 'MidPlaza', name: 'MidPlaza' },
  { id: 'KOMPLEKS MIDPLAZA', name: 'KOMPLEKS MIDPLAZA' },
]

// ── Scenario state (dev FAB) ─────────────────────────────────────────────────
type Scenario = 'ai_not_found' | 'ai_matched' | 'filled'
const scenario = ref<Scenario>('ai_matched')
const scenarios: { value: Scenario; label: string }[] = [
  { value: 'ai_not_found', label: t('AI not found') },
  { value: 'ai_matched',   label: t('AI matched')   },
  { value: 'filled',       label: t('Filled')       },
]

// ── Header fields ────────────────────────────────────────────────────────────
const beneficiary = ref('')
const beneficiaryError = ref(false)
const beneficiaryOptions = ref([...BENEFICIARY_OPTIONS])
function onBeneficiaryAdd(_suggestions: unknown, currentSearch: string) {
  const name = currentSearch.trim()
  if (!name) return
  if (!beneficiaryOptions.value.some((v) => v.id === name)) {
    beneficiaryOptions.value.push({ id: name, name })
  }
  beneficiary.value = name
  beneficiaryError.value = false
}
/** Airene's read of the vendor from the document — only when it actually matched. */
const beneficiaryAiHint = ref('')

const iHavePaid = ref(true)
const dueDate = ref(todayDisplay)
const dueDateError = ref(false)
const transactionDate = ref(todayDisplay)
const transactionDateError = ref(false)
const transactionNo = ref('')
const priceIncludesTax = ref(true)

// "Add more info" reveals the optional header fields this review flow hides by
// default (they exist on the full New expense form).
const moreInfoOpen = ref(false)
const referenceNo = ref('')
const tags = ref<DataInterface[]>([])
function onTagsChange(data: DataInterface[]) { tags.value = data }

// ── Line items (identical shape + validation to NewExpensePage) ──────────────
interface LineRow {
  id: number
  accountId: string
  description: string
  taxId: string
  amount: string
  accountError: boolean
  amountError: boolean
  revealed: boolean
}
let rowSeq = 0
function makeRow(): LineRow {
  return { id: rowSeq++, accountId: '', description: '', taxId: '', amount: '', accountError: false, amountError: false, revealed: false }
}
const rows = ref<LineRow[]>([makeRow()])

function validateLineItems(): boolean {
  let valid = true
  const rowsToCheck = rows.value.length > 1 ? rows.value.slice(0, -1) : rows.value
  rowsToCheck.forEach((row) => {
    if (!row.accountId) { row.accountError = true; valid = false }
    if (!(Number(row.amount) > 0)) { row.amountError = true; valid = false }
  })
  return valid
}
const lineItemsHaveError = computed(() => rows.value.some((r) => r.accountError || r.amountError))

function onAccountSelect(row: LineRow) {
  if (row.accountId) { row.revealed = true; row.accountError = false }
  const last = rows.value[rows.value.length - 1]
  if (last && last.id === row.id) rows.value.push(makeRow())
}
function removeRow(id: number) {
  if (rows.value.length === 1) return
  rows.value = rows.value.filter((r) => r.id !== id)
}

// ── "To match" card — the OCR-extracted line waiting to be confirmed ─────────
interface MatchCard {
  /** label + amount the OCR lifted straight off the document */
  sourceLabel: string
  sourceAmount: number
  /** what Airene proposed (blank in the ai_not_found scenario) */
  productId: string
  taxId: string
  priceIncludesTax: boolean
  /** true when the proposal came from Airene rather than the user */
  aiMatched: boolean
  productError: boolean
}
const matchCard = ref<MatchCard | null>(null)
const matchExpanded = ref(true)
const matchAccordionOpen = ref(true)
const matchChecked = ref(false)
/** Items is Ready once the extracted line has been accepted into the table. */
const itemsStatus = computed(() => (matchCard.value ? 'needs review' : 'ready'))
const expenseStatus = computed(() => (itemsStatus.value === 'ready' && !!beneficiary.value ? 'ready' : 'needs review'))

/** Accept the proposal (the ✓ on the card): the extracted line becomes a real
 *  line item and the Items section flips to the normal editable table. */
function acceptMatch() {
  const card = matchCard.value
  if (!card) return
  if (!card.productId) { card.productError = true; scrollToFirstError(); return }
  rows.value = [
    {
      id: rowSeq++,
      accountId: card.productId,
      description: card.sourceLabel,
      taxId: card.taxId,
      amount: String(card.sourceAmount),
      accountError: false, amountError: false, revealed: true,
    },
    makeRow(),
  ]
  priceIncludesTax.value = card.priceIncludesTax
  matchCard.value = null
  itemsUnresolvedError.value = false
  scenario.value = 'filled'
  toast.notify({ variant: 'success', title: t('Item matched'), rootProps: { class: 'toast-enterprise' } })
}

// ── Scenario seeding ─────────────────────────────────────────────────────────
function applyScenario(s: Scenario) {
  rowSeq = 0
  itemsUnresolvedError.value = false
  matchAccordionOpen.value = true
  matchExpanded.value = true
  matchChecked.value = false
  priceIncludesTax.value = true
  beneficiaryError.value = false
  transactionDate.value = '30/04/2026'
  transactionDateError.value = false
  dueDate.value = '30/04/2026'
  dueDateError.value = false
  iHavePaid.value = true
  paymentAccountId.value = ''
  paymentAccountError.value = false
  amountPaidError.value = false
  amountPaidTouched.value = false
  paymentDate.value = '21/04/2026'
  paymentReference.value = '6032982548863263'

  if (s === 'filled') {
    beneficiary.value = 'MidPlaza'
    beneficiaryAiHint.value = 'KOMPLEKS MIDPLAZA'
    matchCard.value = null
    rows.value = [
      {
        id: rowSeq++, accountId: '6-60040', description: 'Biaya Parkir', taxId: 'pbjt10',
        amount: '21000', accountError: false, amountError: false, revealed: true,
      },
      makeRow(),
    ]
    return
  }

  rows.value = [makeRow()]
  const ai = s === 'ai_matched'
  beneficiary.value = ai ? 'MidPlaza' : ''
  beneficiaryAiHint.value = ai ? 'KOMPLEKS MIDPLAZA' : ''
  matchCard.value = {
    sourceLabel: 'Biaya Parkir',
    sourceAmount: 21_000,
    productId: ai ? '486' : '',
    taxId: ai ? 'pbjt10' : '',
    priceIncludesTax: true,
    aiMatched: ai,
    productError: false,
  }
}
function setScenario(s: Scenario) {
  scenario.value = s
  applyScenario(s)
}

// ── Totals ───────────────────────────────────────────────────────────────────
function formatIDR(amount: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2 })
    .format(amount).replace(/^(Rp)\s/, '$1')
}

/** Gross of every line (what's printed on the document). While a match is still
 *  pending, the card's own amount stands in so the totals aren't empty. */
const grossTotal = computed(() =>
  matchCard.value
    ? matchCard.value.sourceAmount
    : rows.value.reduce((s, r) => s + (Number(r.amount) || 0), 0),
)
const taxableGross = computed(() => {
  if (matchCard.value) return matchCard.value.taxId && matchCard.value.taxId !== 'none' ? matchCard.value.sourceAmount : 0
  return rows.value
    .filter((r) => r.taxId && r.taxId !== 'none')
    .reduce((s, r) => s + (Number(r.amount) || 0), 0)
})
const taxLabel = computed(() => {
  const id = matchCard.value ? matchCard.value.taxId : rows.value.find((r) => r.taxId && r.taxId !== 'none')?.taxId
  return TAX_OPTIONS.find((o) => o.id === id)?.name ?? ''
})
/** Price-includes-tax splits the printed amount into net + tax; otherwise tax is
 *  added on top. Matches the Figma sample (Rp21.000 → Rp18.900 + Rp2.100). */
const taxAmount = computed(() => Math.round(taxableGross.value * 0.1))
const hasTax = computed(() => taxableGross.value > 0)
const subtotal = computed(() => (priceIncludesTax.value ? grossTotal.value - taxAmount.value : grossTotal.value))
const total = computed(() => (priceIncludesTax.value ? grossTotal.value : grossTotal.value + taxAmount.value))

// ── Memo + Attachment ────────────────────────────────────────────────────────
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

// ── Payment ──────────────────────────────────────────────────────────────────
const paymentAccountId = ref('')
const paymentAccountError = ref(false)
const paymentDate = ref(todayDisplay)
const paymentReference = ref('')
const amountPaidError = ref(false)
const amountPaid = ref(total.value)
const amountPaidTouched = ref(false)
watch(total, (v) => {
  if (!amountPaidTouched.value) amountPaid.value = v
}, { immediate: true })

// ── Left panel resize + zoom (same as NewExpensePage) ────────────────────────
const LEFT_PANEL_MIN = 320
const LEFT_PANEL_MAX = 720
const leftWidth = ref(552)
function startPanelResize(e: MouseEvent) {
  e.preventDefault()
  const startX = e.clientX
  const startW = leftWidth.value
  function onMove(ev: MouseEvent) {
    leftWidth.value = Math.min(LEFT_PANEL_MAX, Math.max(LEFT_PANEL_MIN, startW + (ev.clientX - startX)))
  }
  function onUp() {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
onBeforeUnmount(() => {
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
})
const zoomMode = ref<'fit' | '100'>('fit')

// ── Reclassify (the ✎ next to the section title) ─────────────────────────────
function moveToPurchaseInvoice() {
  const file = reviewFile.value
  if (!file) return
  moveReviewFilesToPurchaseInvoice([file.id])
  toast.notify({
    variant: 'success',
    title: `1 ${t('file')} ${t('moved to Purchase invoice')}`,
    rootProps: { class: 'toast-enterprise' },
  })
  goExpenses()
}

// ── Save (same validation contract as NewExpensePage) ────────────────────────
/** True once a save has been attempted and the Items section still isn't
 *  resolved — drives the danger banner above the to-match card. */
const itemsUnresolvedError = ref(false)

function handleSave() {
  // Every check runs (rather than stopping at the first failure) so all invalid
  // fields — header, line items, and payment — surface together on one attempt.
  let valid = true
  if (!beneficiary.value) { beneficiaryError.value = true; valid = false }
  if (!transactionDate.value) { transactionDateError.value = true; valid = false }
  if (!iHavePaid.value && !dueDate.value) { dueDateError.value = true; valid = false }

  if (matchCard.value) {
    // Nothing has been accepted into the table yet — the extracted line still
    // needs a product before this file can be saved as an expense.
    itemsUnresolvedError.value = true
    if (!matchCard.value.productId) matchCard.value.productError = true
    valid = false
  } else if (!validateLineItems()) {
    valid = false
  }

  if (iHavePaid.value) {
    if (!paymentAccountId.value) { paymentAccountError.value = true; valid = false }
    if (!(Number(amountPaid.value) > 0)) { amountPaidError.value = true; valid = false }
  }
  if (!valid) { scrollToFirstError(); return }

  const file = reviewFile.value
  const filledRows = rows.value.filter((r) => r.accountId)
  addBill({
    beneficiary: { id: beneficiary.value, name: beneficiary.value },
    category: ACCOUNT_OPTIONS.find((a) => a.id === filledRows[0]?.accountId)?.name ?? 'Uncategorized',
    date: toISODate(transactionDate.value),
    dueDate: toISODate(iHavePaid.value ? transactionDate.value : dueDate.value),
    total: total.value,
    subtotal: subtotal.value,
    taxAmount: taxAmount.value,
    balanceDue: iHavePaid.value ? 0 : total.value,
    status: iHavePaid.value ? 'paid' : 'unpaid',
    tags: tags.value.length ? tags.value.map((tag) => String(tag.name ?? tag.id)) : undefined,
    memo: memo.value.trim() || undefined,
    attachments: [
      ...(file ? [{ name: file.file, sizeKB: 128 }] : []),
      ...formAttachedFiles.value.map((f) => ({ name: f.name, sizeKB: f.size / 1024 })),
    ],
    lineItems: filledRows.map((r) => ({
      account: ACCOUNT_OPTIONS.find((a) => a.id === r.accountId)?.name ?? r.accountId,
      description: r.description,
      tax: TAX_OPTIONS.find((tax) => tax.id === r.taxId)?.name ?? '—',
      amount: Number(r.amount) || 0,
    })),
    payment: iHavePaid.value ? {
      paymentAccount: BANK_ACCOUNT_OPTIONS.find((a) => a.id === paymentAccountId.value)?.name ?? paymentAccountId.value,
      amountPaid: amountPaid.value,
      paymentDate: toISODate(paymentDate.value),
      reference: paymentReference.value || undefined,
    } : undefined,
  })

  // The reviewed file leaves the queue; move on to whatever is next in it.
  const nextFile = reviewFiles[queueIndex.value + 1] ?? reviewFiles[queueIndex.value - 1]
  const nextId = nextFile && file && nextFile.id !== file.id ? nextFile.id : null
  if (file) {
    const i = reviewFiles.findIndex((rf) => rf.id === file.id)
    if (i !== -1) reviewFiles.splice(i, 1)
  }
  toast.notify({ variant: 'success', title: t('Expense saved'), rootProps: { class: 'toast-enterprise' } })
  if (nextId) router.push(`/expenses/review/${nextId}`)
  else goExpenses()
}

/** Leave this file untouched in the queue and move to the next one. */
function skipWithoutSaving() {
  const nextFile = reviewFiles[queueIndex.value + 1]
  if (nextFile) router.push(`/expenses/review/${nextFile.id}`)
  else goExpenses()
}

// Seed the initial scenario. Runs here, after every ref applyScenario touches
// has been declared — calling it up beside the scenario refs would hit the
// payment refs before their initializers have run.
applyScenario(scenario.value)

// Re-seed whenever the route points at a different file.
watch(() => props.id, () => applyScenario(scenario.value))
</script>

<template>
  <div class="detail-page">
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <MpTextlink id="br-breadcrumb" as="a" class="detail-breadcrumb" @click.prevent="goExpenses">{{ t('Expenses') }}</MpTextlink>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">
            {{ t('File review') }}
            <span class="detail-title-count">{{ queueIndex + 1 }} {{ t('of') }} {{ queueTotal }}</span>
          </h1>
          <!-- Jump straight to any other file still in the review queue -->
          <MpPopover id="br-file-nav" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
            <MpPopoverTrigger>
              <MpButton class="br-icon-btn" :aria-label="t('Switch file')">
                <MpIcon name="caret-down" size="sm" />
              </MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '240px', width: 'max-content', maxWidth: '360px' })">
              <MpPopoverList>
                <MpPopoverListItem
                  v-for="(rf, i) in reviewFiles" :key="rf.id"
                  :is-active="rf.id === props.id" @click="goToFile(rf.id)"
                >{{ i + 1 }}. {{ rf.file }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>
    </header>

    <!-- ── Two-panel stage ── -->
    <div class="ex-stage">

      <!-- ── Left panel: document preview ── -->
      <div class="ex-left" :style="{ width: leftWidth + 'px' }">
        <div class="ex-left-header">
          <div class="ex-file-meta">
            <MpIcon :name="fileIconName(reviewFile?.file ?? '')" size="sm" class="ex-file-meta-icon" />
            <div class="ex-file-meta-text">
              <span class="ex-file-name">{{ reviewFile?.file }}</span>
              <span class="ex-file-size">1 {{ t('page') }}</span>
            </div>
          </div>
          <div class="ex-zoom-toggle" role="group" :aria-label="t('Zoom')">
            <button
              type="button" class="ex-zoom-part"
              :class="{ 'ex-zoom-part--active': zoomMode === 'fit' }"
              @click="zoomMode = 'fit'"
            >{{ t('Fit') }}</button>
            <button
              type="button" class="ex-zoom-part"
              :class="{ 'ex-zoom-part--active': zoomMode === '100' }"
              @click="zoomMode = '100'"
            >100%</button>
          </div>
        </div>
        <div class="br-preview" :class="{ 'br-preview--zoom': zoomMode === '100' }">
          <img src="/illustrations/receipt-dropzone.png" alt="" class="br-preview-img" />
        </div>
      </div>

      <!-- Resize divider -->
      <div class="ex-divider" :aria-label="t('Resize panel')" @mousedown="startPanelResize" />

      <!-- ── Right panel: review form ── -->
      <div class="ex-right">

        <!-- ══ Section: Expense ══ -->
        <div class="br-section">
          <div class="br-section-header">
            <div class="br-section-titlerow">
              <h2 class="br-section-title">{{ t('Expense') }}</h2>
              <!-- Reclassify — the file may not belong in Expenses at all -->
              <MpPopover id="br-reclassify" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
                <MpPopoverTrigger>
                  <MpButton class="br-icon-btn" :aria-label="t('Change classification')">
                    <MpIcon name="edit" size="sm" />
                  </MpButton>
                </MpPopoverTrigger>
                <MpPopoverContent :class="css({ minWidth: '220px', width: 'max-content', whiteSpace: 'nowrap' })">
                  <MpPopoverList>
                    <MpPopoverListItem @click="moveToPurchaseInvoice">{{ t('Move files to Purchase invoice') }}</MpPopoverListItem>
                  </MpPopoverList>
                </MpPopoverContent>
              </MpPopover>
              <ErpStatusBadge :status="expenseStatus" badge-for="additionalInformation" />
            </div>
            <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" @click="moreInfoOpen = !moreInfoOpen">
              {{ moreInfoOpen ? t('Less info') : t('Add more info') }}
            </button>
          </div>

          <!-- Beneficiary + paid checkbox -->
          <div class="ex-row-1">
            <div class="br-ai-field ex-field-flex">
              <MpFormControl id="br-beneficiary" is-required :is-invalid="beneficiaryError" :class="{ 'br-ai-anchor': beneficiaryAiHint }">
                <MpFormLabel>{{ t('Beneficiary') }}</MpFormLabel>
                <MpAutocomplete
                  id="br-beneficiary-ac"
                  v-model="beneficiary"
                  :data="beneficiaryOptions"
                  label-prop="name" value-prop="id"
                  is-searchable is-clearable use-portal is-full-width is-show-button-action
                  :is-invalid="beneficiaryError"
                  @update:model-value="beneficiaryError = false"
                  @button-action="onBeneficiaryAdd"
                >
                  <template #buttonAction="{ currentSearch }">
                    {{ currentSearch ? `${t('Add')} "${currentSearch}" ${t('as a new beneficiary')}` : t('Add new beneficiary') }}
                  </template>
                </MpAutocomplete>
                <MpFormErrorMessage>{{ t('You must select beneficiary') }}</MpFormErrorMessage>
              </MpFormControl>
              <!-- Airene's reading of the vendor from the document -->
              <div v-if="beneficiaryAiHint" class="br-ai-banner">
                <MpIcon name="airene-brand" size="sm" />
                <span>{{ t('AI matched') }} - {{ beneficiaryAiHint }} {{ t('in doc') }}</span>
              </div>
            </div>
            <div class="ex-paid-check">
              <MpCheckbox id="br-paid" :is-checked="iHavePaid" @change="iHavePaid = !iHavePaid" />
              <span>{{ t('I have paid this bill') }}</span>
            </div>
          </div>

          <!-- Transaction date -> Transaction no. -> Due date (unpaid only) -->
          <div class="ex-grid-2">
            <MpFormControl id="br-txdate" is-required :is-invalid="transactionDateError">
              <MpFormLabel>{{ t('Transaction date') }}</MpFormLabel>
              <div class="ex-datepicker">
                <MpDatePicker
                  id="br-txdate-dp" v-model="transactionDate" format="DD/MM/YYYY" value-type="format" use-portal
                  @update:model-value="transactionDateError = false"
                />
              </div>
              <MpFormErrorMessage>{{ t('You must select transaction date') }}</MpFormErrorMessage>
            </MpFormControl>
            <MpFormControl id="br-transno" is-required>
              <div class="ex-label-row">
                <MpFormLabel>{{ t('Transaction no.') }}</MpFormLabel>
                <span class="ex-label-icon" :title="t('Auto-generated')"><MpIcon name="settings" size="sm" /></span>
              </div>
              <MpInput id="br-transno-input" v-model="transactionNo" placeholder="Auto" is-full-width is-disabled />
            </MpFormControl>
            <!-- Due date — only relevant while the bill is still unpaid -->
            <MpFormControl v-if="!iHavePaid" id="br-duedate" is-required :is-invalid="dueDateError">
              <MpFormLabel>{{ t('Due date') }}</MpFormLabel>
              <div class="ex-datepicker">
                <MpDatePicker
                  id="br-duedate-dp" v-model="dueDate" format="DD/MM/YYYY" value-type="format" use-portal
                  @update:model-value="dueDateError = false"
                />
              </div>
              <MpFormErrorMessage>{{ t('You must select due date') }}</MpFormErrorMessage>
            </MpFormControl>
            <template v-if="moreInfoOpen">
              <MpFormControl id="br-refno">
                <MpFormLabel>{{ t('Reference no.') }}</MpFormLabel>
                <MpInput id="br-refno-input" v-model="referenceNo" is-full-width />
              </MpFormControl>
              <MpFormControl id="br-tags">
                <MpFormLabel>{{ t('Tag') }}</MpFormLabel>
                <MpInputTag id="br-tags-input" :data="tags" :is-enable-create-new-tag="true" :is-show-suggestions="false" @change="onTagsChange" />
              </MpFormControl>
            </template>
          </div>
        </div>

        <!-- ══ Section: Items ══ -->
        <div class="br-section">
          <div class="br-section-header">
            <div class="br-section-titlerow">
              <h2 class="br-section-title">{{ t('Items') }}</h2>
              <ErpStatusBadge :status="itemsStatus" badge-for="additionalInformation" />
            </div>
          </div>

          <div class="ex-price-includes">
            <MpCheckbox id="br-price-incl" :is-checked="priceIncludesTax" @change="priceIncludesTax = !priceIncludesTax" />
            <span>{{ t('Price includes tax') }}</span>
          </div>

          <!-- Save-attempt banner — same danger banner the line-items table uses -->
          <MpBanner
            v-if="lineItemsHaveError || itemsUnresolvedError"
            id="br-items-error-banner" variant="danger" align-items="center" class="br-items-error-banner"
          >
            <MpBannerIcon id="br-items-error-banner-icon" />
            <MpBannerTitle>{{ t('Failed to save') }}</MpBannerTitle>
            <MpBannerDescription>{{ t('The transaction contains incomplete or invalid data. Review the highlighted fields.') }}</MpBannerDescription>
          </MpBanner>

          <!-- ── To-match flow (ai_not_found / ai_matched) ── -->
          <template v-if="matchCard">
            <div class="br-accordion">
              <button class="br-accordion-head" @click="matchAccordionOpen = !matchAccordionOpen">
                <MpIcon :name="matchAccordionOpen ? 'chevrons-down' : 'chevrons-right'" size="sm" class="br-accordion-chevron" />
                <span class="br-accordion-labels">
                  <span class="br-accordion-title">{{ t('To match') }}</span>
                  <span class="br-accordion-desc">{{ t('Start matching to add item lines') }}</span>
                </span>
              </button>

              <div v-if="matchAccordionOpen" class="br-match-wrap">
                <div class="br-match-card">
                  <!-- Card header: what the doc says ⟷ what it maps to -->
                  <div class="br-match-head">
                    <div class="br-match-head-left">
                      <MpCheckbox id="br-match-check" :is-checked="matchChecked" @change="matchChecked = !matchChecked" />
                      <MpButton class="br-icon-btn" :aria-label="t('Toggle details')" @click="matchExpanded = !matchExpanded">
                        <MpIcon :name="matchExpanded ? 'chevrons-down' : 'chevrons-right'" size="sm" />
                      </MpButton>
                      <div class="br-match-line">
                        <span class="br-match-line-label">{{ matchCard.sourceLabel }}</span>
                        <span class="br-match-line-amt">{{ formatIDR(matchCard.sourceAmount) }}</span>
                      </div>
                    </div>
                    <span class="br-match-link" aria-hidden="true" />
                    <div class="br-match-head-right">
                      <div class="br-match-line">
                        <span class="br-match-line-label">
                          {{ ACCOUNT_OPTIONS.find(a => a.id === matchCard!.productId)?.name || t('Not matched yet') }}
                          <span v-if="matchCard.aiMatched" class="br-ai-badge">
                            <MpIcon name="airene-brand" size="sm" />{{ t('AI matched') }}
                          </span>
                        </span>
                        <span class="br-match-line-amt">{{ formatIDR(matchCard.sourceAmount) }}</span>
                      </div>
                      <MpTooltip id="br-accept-tip" :label="t('Accept match')" placement="top" use-portal>
                        <MpButton class="br-accept-btn" :aria-label="t('Accept match')" @click="acceptMatch">
                          <MpIcon name="check" size="sm" />
                        </MpButton>
                      </MpTooltip>
                    </div>
                  </div>

                  <!-- Card body: the extracted values, and the fields they map to -->
                  <div v-if="matchExpanded" class="br-match-body">
                    <div class="br-match-body-left">
                      <p class="br-match-body-title">{{ matchCard.sourceLabel }}</p>
                      <div class="br-match-kv">
                        <span class="br-match-kv-key">{{ t('Amount') }}</span>
                        <span class="br-match-kv-val">{{ formatIDR(matchCard.sourceAmount) }}</span>
                      </div>
                    </div>
                    <div class="br-match-body-right">
                      <div v-if="matchCard.aiMatched" class="br-ai-banner br-ai-banner--boxed">
                        <MpIcon name="airene-brand" size="sm" />
                        <span>{{ t('AI matched from previous transactions') }}</span>
                      </div>
                      <MpFormControl id="br-match-product" is-required :is-invalid="matchCard.productError">
                        <MpFormLabel>{{ t('Product') }}</MpFormLabel>
                        <MpAutocomplete
                          id="br-match-product-ac" v-model="matchCard.productId" :data="ACCOUNT_OPTIONS"
                          label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                          :placeholder="t('Select product')"
                          :is-invalid="matchCard.productError"
                          @update:model-value="matchCard.productError = false; itemsUnresolvedError = false"
                        />
                        <MpFormErrorMessage>{{ t('You must select product') }}</MpFormErrorMessage>
                      </MpFormControl>
                      <MpFormControl id="br-match-tax">
                        <MpFormLabel>{{ t('Tax') }}</MpFormLabel>
                        <MpAutocomplete
                          id="br-match-tax-ac" v-model="matchCard.taxId" :data="TAX_OPTIONS"
                          label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                          :placeholder="t('Select tax')"
                        />
                      </MpFormControl>
                      <div class="br-match-check">
                        <MpCheckbox
                          id="br-match-price-incl" :is-checked="matchCard.priceIncludesTax"
                          @change="matchCard.priceIncludesTax = !matchCard.priceIncludesTax"
                        />
                        <span>{{ t('Price includes tax') }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Nothing accepted into the expense yet -->
            <div class="br-blank-slate">
              <img src="/illustrations/empty-folder.png" alt="" width="144" height="120" />
              <p class="br-blank-title">{{ t('No matched expenses yet') }}</p>
              <p class="br-blank-desc">{{ t('Matched expenses will appear here.') }}</p>
            </div>
          </template>

          <!-- ── Filled: the normal editable line-items table ── -->
          <div v-else class="ex-table-section">
            <div class="ex-table-scroll">
              <table class="ex-table ex-lineitems-table">
                <colgroup>
                  <col class="ex-col-drag" />
                  <col class="ex-col-account" />
                  <col class="ex-col-desc" />
                  <col class="ex-col-tax" />
                  <col class="ex-col-amount" />
                  <col class="ex-col-del" />
                </colgroup>
                <thead>
                  <tr>
                    <th class="ex-th ex-th--drag" />
                    <th class="ex-th">{{ t('Account') }}</th>
                    <th class="ex-th">{{ t('Description') }}</th>
                    <th class="ex-th">{{ t('Tax') }}</th>
                    <th class="ex-th">{{ t('Amount') }}</th>
                    <th class="ex-th ex-th--del" />
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in rows" :key="row.id" class="ex-tr">
                    <td class="ex-td ex-td--drag ex-td--border"><MpIcon name="drag" size="sm" /></td>
                    <td class="ex-td ex-td--input ex-td--border" :class="{ 'ex-td--error': row.accountError }">
                      <MpTooltip
                        v-if="row.accountError" :id="`br-account-tooltip-${row.id}`"
                        :label="t('You must select account')" placement="top" use-portal class="ex-error-tooltip-wrap"
                      >
                        <MpAutocomplete
                          :id="`br-account-${row.id}`" v-model="row.accountId" :data="ACCOUNT_OPTIONS"
                          label-prop="name" value-prop="id" is-searchable is-clearable use-portal is-full-width
                          :placeholder="t('Select account')" @update:model-value="onAccountSelect(row)"
                        />
                      </MpTooltip>
                      <MpAutocomplete
                        v-else
                        :id="`br-account-${row.id}`" v-model="row.accountId" :data="ACCOUNT_OPTIONS"
                        label-prop="name" value-prop="id" is-searchable is-clearable use-portal is-full-width
                        :placeholder="t('Select account')" @update:model-value="onAccountSelect(row)"
                      />
                    </td>
                    <template v-if="row.revealed">
                      <td class="ex-td ex-td--input ex-td--border">
                        <MpInput :id="`br-desc-${row.id}`" v-model="row.description" is-full-width />
                      </td>
                      <td class="ex-td ex-td--input ex-td--border">
                        <MpAutocomplete
                          :id="`br-tax-${row.id}`" v-model="row.taxId" :data="TAX_OPTIONS"
                          label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                          :placeholder="t('Select tax')"
                        />
                      </td>
                      <td class="ex-td ex-td--input ex-td--border ex-td--amount" :class="{ 'ex-td--error': row.amountError }">
                        <MpTooltip
                          v-if="row.amountError" :id="`br-amount-tooltip-${row.id}`"
                          :label="t('Amount must be more than 0')" placement="top" use-portal class="ex-error-tooltip-wrap"
                        >
                          <div class="ex-amount-cell">
                            <span class="ex-amount-prefix">Rp</span>
                            <MpInput
                              :id="`br-amount-${row.id}`" v-model="row.amount" type="number" is-full-width class="ex-amount-input"
                              :is-invalid="row.amountError" @update:model-value="row.amountError = false"
                            />
                          </div>
                        </MpTooltip>
                        <div v-else class="ex-amount-cell">
                          <span class="ex-amount-prefix">Rp</span>
                          <MpInput
                            :id="`br-amount-${row.id}`" v-model="row.amount" type="number" is-full-width class="ex-amount-input"
                            :is-invalid="row.amountError" @update:model-value="row.amountError = false"
                          />
                        </div>
                      </td>
                      <td class="ex-td ex-td--del">
                        <MpButton class="ex-del-btn" :aria-label="t('Remove')" @click="removeRow(row.id)">
                          <MpIcon name="minus-circular" size="sm" />
                        </MpButton>
                      </td>
                    </template>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Totals -->
          <div class="br-totals">
            <div class="ex-total-row">
              <span class="ex-total-label">{{ t('Subtotal') }}</span>
              <span class="ex-total-amt">{{ formatIDR(subtotal) }}</span>
            </div>
            <div v-if="hasTax" class="ex-total-row">
              <span class="ex-total-label">{{ taxLabel }}</span>
              <span class="ex-total-amt">{{ formatIDR(taxAmount) }}</span>
            </div>
            <div class="ex-total-rule" />
            <div class="ex-total-row">
              <span class="ex-total-label ex-total-label--strong">{{ t('Total') }}</span>
              <span class="ex-total-amt ex-total-amt--strong">{{ formatIDR(total) }}</span>
            </div>
          </div>
        </div>

        <!-- ══ Section: Additional info ══ -->
        <div class="br-section">
          <div class="br-section-header">
            <div class="br-section-titlerow">
              <h2 class="br-section-title">{{ t('Additional info') }}</h2>
            </div>
          </div>

          <!-- Memo -->
          <div class="ex-section">
            <MpFormControl id="br-memo">
              <MpFormLabel>{{ t('Memo') }}</MpFormLabel>
              <MpTextarea id="br-memo-textarea" v-model="memo" is-full-width :rows="4" />
            </MpFormControl>
            <p class="ex-helper-text">{{ t('Only visible to you and your team') }}</p>
          </div>

          <!-- Attachment -->
          <div class="ex-section ex-attachment-section">
            <div class="ex-section-label">{{ t('Attachment') }}</div>
            <div class="ex-attachment">
              <MpUpload
                id="br-attachment-upload"
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
              <p class="ex-helper-text">{{ t('Files must be in XLS, DOC, PDF, JPG, PNG, or ZIP with a maximum of 10 MB per file and 5 files per transaction') }}</p>
              <!-- The reviewed document itself is always attached to the expense -->
              <MpUploadList
                v-if="reviewFile"
                id="br-source-file"
                :title="reviewFile.file" status="success" subtitle="128 KB"
                :icon-name="fileIconName(reviewFile.file)"
              />
              <MpUploadList
                v-for="f in formAttachedFiles" :key="f.name"
                :id="`br-attachment-file-${f.name}`"
                :title="f.name" status="success" :subtitle="formatFileSize(f.size)"
                :icon-name="fileIconName(f.name)"
                is-show-remove-button
                @remove="removeFormFile(f.name)"
              />
            </div>
          </div>

          <!-- Payment — only when the bill is marked as paid -->
          <div v-if="iHavePaid" class="ex-section ex-payment-section">
            <MpTabs id="br-payment-tabs" :default-value="0" variant-color="blue">
              <MpTabList>
                <MpTab value="payment">{{ t('Payment') }}</MpTab>
              </MpTabList>
              <MpTabPanels>
                <MpTabPanel value="payment">
                  <div class="ex-table-section">
                    <div class="ex-table-scroll">
                      <table class="ex-table">
                        <colgroup><col /><col /><col /><col /></colgroup>
                        <thead>
                          <tr>
                            <th class="ex-th">{{ t('Payment account') }}</th>
                            <th class="ex-th">{{ t('Amount paid') }}</th>
                            <th class="ex-th">{{ t('Payment date') }}</th>
                            <th class="ex-th">{{ t('Reference') }}</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr class="ex-tr">
                            <td class="ex-td ex-td--input ex-td--border" :class="{ 'ex-td--error': paymentAccountError }">
                              <MpTooltip
                                v-if="paymentAccountError" id="br-pay-account-tooltip"
                                :label="t('You must select account')" placement="top" use-portal class="ex-error-tooltip-wrap"
                              >
                                <MpAutocomplete
                                  id="br-pay-account-ac" v-model="paymentAccountId" :data="BANK_ACCOUNT_OPTIONS"
                                  label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                                  :placeholder="t('Select payment account')" @update:model-value="paymentAccountError = false"
                                />
                              </MpTooltip>
                              <MpAutocomplete
                                v-else
                                id="br-pay-account-ac" v-model="paymentAccountId" :data="BANK_ACCOUNT_OPTIONS"
                                label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                                :placeholder="t('Select payment account')" @update:model-value="paymentAccountError = false"
                              />
                            </td>
                            <td class="ex-td ex-td--input ex-td--border ex-td--amount" :class="{ 'ex-td--error': amountPaidError }">
                              <MpTooltip
                                v-if="amountPaidError" id="br-pay-amount-tooltip"
                                :label="t('Amount must be more than 0')" placement="top" use-portal class="ex-error-tooltip-wrap"
                              >
                                <div class="ex-amount-cell">
                                  <span class="ex-amount-prefix">Rp</span>
                                  <MpInput
                                    id="br-pay-amount-input" v-model="amountPaid" type="number" is-full-width class="ex-amount-input"
                                    :is-invalid="amountPaidError"
                                    @update:model-value="amountPaidTouched = true; amountPaidError = false"
                                  />
                                </div>
                              </MpTooltip>
                              <div v-else class="ex-amount-cell">
                                <span class="ex-amount-prefix">Rp</span>
                                <MpInput
                                  id="br-pay-amount-input" v-model="amountPaid" type="number" is-full-width class="ex-amount-input"
                                  :is-invalid="amountPaidError"
                                  @update:model-value="amountPaidTouched = true; amountPaidError = false"
                                />
                              </div>
                            </td>
                            <td class="ex-td ex-td--input ex-td--border">
                              <div class="ex-datepicker">
                                <MpDatePicker id="br-pay-date-dp" v-model="paymentDate" format="DD/MM/YYYY" value-type="format" use-portal />
                              </div>
                            </td>
                            <td class="ex-td ex-td--input">
                              <MpInput id="br-pay-ref-input" v-model="paymentReference" is-full-width />
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </MpTabPanel>
              </MpTabPanels>
            </MpTabs>
          </div>
        </div>

        <!-- Footer actions -->
        <footer class="ex-footer">
          <button class="btn-enterprise btn-enterprise--ghost" @click="goExpenses">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--secondary" @click="skipWithoutSaving">{{ t('Skip without saving') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" @click="handleSave">{{ t('Save & next') }}</button>
        </footer>
      </div>
    </div>

    <!-- ── Demo scenario FAB — previews the review states from Figma ── -->
    <MpPopover id="br-demo-fab" is-close-on-select use-portal placement="top-end">
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
  </div>
</template>

<style scoped>
/* ── Page shell — canonical detail pattern (copied from NewExpensePage) ────── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb-trail { display: flex; align-items: center; gap: var(--mp-spacing-1); align-self: flex-start; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  /* --mp-line-heights-2xl resolves to a unitless multiplier here, not px — hardcode
     the intended 32px rather than trusting the var (same fix as NewExpensePage). */
  line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}
/* "3 of 5" is the regular-weight counterpart to the semibold "File review" */
.detail-title-count { font-weight: var(--mp-font-weights-regular); }

/* ── Two-panel stage ──────────────────────────────────────────────────────── */
.ex-stage {
  flex: 1; min-height: 0; display: flex; position: relative;
  background: var(--mp-colors-gray-50, #EFF1F1);
  border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0; overflow: hidden;
}
.ex-left {
  flex-shrink: 0; overflow-y: auto; overflow-x: hidden;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-8) var(--mp-spacing-6);
  display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px); min-height: 0;
}
.ex-left-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-2); min-height: var(--mp-sizes-8, 32px);
}
.ex-file-meta { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.ex-file-meta-icon { flex-shrink: 0; color: var(--mp-text-subtle); }
.ex-file-meta-text { display: flex; flex-direction: column; min-width: 0; }
.ex-file-name {
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-medium, 500);
  color: var(--mp-text-default); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ex-file-size { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.ex-zoom-toggle {
  display: flex; align-items: center; gap: var(--mp-spacing-1); flex-shrink: 0;
  padding: var(--mp-spacing-1); border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16));
}
.ex-zoom-part {
  border: none; background: none; cursor: pointer;
  padding: var(--mp-spacing-1) var(--mp-spacing-2); border-radius: var(--mp-radii-full, 999px);
  font: inherit; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
}
.ex-zoom-part--active {
  background: var(--mp-background-neutral-subtle-selected, #dcdfe4);
  color: var(--mp-text-secondary-pressed, #4c5460);
}

/* Document preview — Fit hugs the panel width, 100% overflows and scrolls */
.br-preview {
  flex-shrink: 0; background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  padding: var(--mp-spacing-2); overflow: auto;
}
.br-preview-img { display: block; width: 100%; height: auto; }
.br-preview--zoom .br-preview-img { width: auto; max-width: none; }

.ex-divider {
  flex-shrink: 0; width: var(--mp-spacing-3); cursor: col-resize; z-index: 10;
  display: flex; align-items: center; justify-content: center;
}
.ex-divider::after {
  content: ''; display: block; width: 2px; height: var(--mp-spacing-10, 40px);
  background: var(--mp-border-default); border-radius: var(--mp-radii-full);
}
.ex-divider:hover::after { background: var(--mp-border-bold); }

/* ── Right panel ──────────────────────────────────────────────────────────── */
.ex-right {
  --ex-field-width: 318px;
  flex: 1; min-width: 0; overflow-y: auto;
  background: var(--mp-background-neutral);
  border-radius: var(--mp-radii-xl, 12px) 0 0 var(--mp-radii-xl, 12px);
  padding: var(--mp-spacing-6);
  container-type: inline-size;
}

/* ── Section shell (header + content), one per Figma "Section" ─────────────── */
.br-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); padding-bottom: var(--mp-spacing-6); }
.br-section-header {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-4); min-height: var(--mp-spacing-8, 32px);
}
.br-section-titlerow { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.br-section-title {
  margin: 0; font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl); color: var(--mp-text-default);
}

/* Icon-only button (title caret, section edit, card chevron) */
.br-icon-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px) !important; height: var(--mp-sizes-8, 32px) !important; min-width: 0 !important;
  padding: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-sm) !important;
  color: var(--mp-text-secondary); cursor: pointer;
}
.br-icon-btn:hover { background: var(--mp-background-neutral-hovered) !important; color: var(--mp-text-default); }

/* ── Airene match hint — same treatment as NewProductPage's .np-ai-banner:
   the strip tucks under the field it annotates and shares its rounded bottom. ── */
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
/* Standalone variant (inside the match card) — fully rounded, even padding */
.br-ai-banner--boxed {
  padding: var(--mp-spacing-1\.5); border-radius: var(--mp-radii-md); margin: 0;
}
.br-ai-badge {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1);
  margin-left: var(--mp-spacing-2);
  color: var(--mp-airene-banner-text, #5221a5); font-size: var(--mp-font-sizes-sm);
  white-space: nowrap;
}
/* The airene-brand glyph has no intrinsic box — MpIcon's size prop leaves it at
   its natural (oversized) dimensions, so pin it to the 16px the badge expects. */
.br-ai-badge :deep(svg) { width: 16px; height: 16px; flex-shrink: 0; }
.br-ai-banner :deep(svg) { width: 16px; height: 16px; flex-shrink: 0; }

/* ── Header field rows (from NewExpensePage) ──────────────────────────────── */
.ex-row-1 { display: flex; align-items: flex-start; flex-wrap: wrap; gap: var(--mp-spacing-4) var(--mp-spacing-6); }
.ex-field-flex { flex: 0 0 var(--ex-field-width); min-width: 0; }
/* No gap — MpCheckbox renders its own 12px control-to-label gap internally.
   margin-top clears the field label so the box centers against the input. */
.ex-paid-check {
  display: flex; align-items: center; gap: 0; margin-top: var(--mp-spacing-6); height: 38px;
  white-space: nowrap; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.ex-grid-2 {
  display: grid; grid-template-columns: repeat(auto-fill, var(--ex-field-width));
  justify-content: flex-start; gap: var(--mp-spacing-4) var(--mp-spacing-6); padding-top: var(--mp-spacing-5, 20px);
}
.ex-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.ex-label-icon { display: flex; align-items: center; color: var(--mp-text-secondary); cursor: pointer; }
.ex-datepicker { width: 100%; }
.ex-datepicker :deep(.mp-datepicker__root) { width: 100%; }

.ex-price-includes {
  display: flex; align-items: center; gap: var(--mp-spacing-2); justify-content: flex-end;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}

/* ── "To match" accordion ─────────────────────────────────────────────────── */
.br-items-error-banner { margin-bottom: var(--mp-spacing-1); }
.br-accordion { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.br-accordion-head {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-3);
  background: none; border: none; padding: 0; cursor: pointer; text-align: left; font: inherit;
}
.br-accordion-chevron { flex-shrink: 0; margin-top: var(--mp-spacing-0\.5, 2px); color: var(--mp-text-default); }
.br-accordion-labels { display: flex; flex-direction: column; gap: 0; min-width: 0; }
.br-accordion-title {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg); color: var(--mp-text-default);
}
.br-accordion-desc {
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary);
}

/* Highlight tray the match card sits in (--mp-background-highlight is not
   defined in this app's token set, so the Figma value backs it up). */
.br-match-wrap {
  background: var(--mp-background-highlight, #f3f1fc);
  border-radius: var(--mp-radii-md); padding: var(--mp-spacing-3);
  margin-left: var(--mp-spacing-8);
}
.br-match-card {
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md); overflow: hidden;
}
.br-match-head {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.br-match-head-left,
.br-match-head-right { display: flex; align-items: center; gap: var(--mp-spacing-2); flex: 1 1 0; min-width: 0; }
/* Dotted connector between "what the doc says" and "what it maps to" */
.br-match-link {
  flex: 0 0 var(--mp-spacing-8, 32px); align-self: center;
  border-top: 1px dashed var(--mp-border-bold);
}
.br-match-line { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-2); flex: 1 1 0; min-width: 0; }
.br-match-line-label {
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
}
.br-match-line-amt { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
.br-accept-btn {
  flex-shrink: 0;
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px) !important; height: var(--mp-sizes-8, 32px) !important; min-width: 0 !important;
  padding: 0 !important;
  border: 1px solid var(--mp-border-default) !important;
  background: var(--mp-background-neutral) !important;
  border-radius: var(--mp-radii-full) !important;
  color: var(--mp-text-secondary); cursor: pointer;
}
.br-accept-btn:hover {
  border-color: var(--mp-border-selected, #029861) !important;
  color: var(--mp-border-selected, #029861);
}

.br-match-body { display: flex; align-items: stretch; }
.br-match-body-left {
  flex: 1 1 0; min-width: 0;
  display: flex; flex-direction: column; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4); border-right: 1px solid var(--mp-border-default);
}
.br-match-body-title {
  margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.br-match-kv { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-4); }
.br-match-kv-key { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.br-match-kv-val { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.br-match-body-right {
  flex: 1 1 0; min-width: 0;
  display: flex; flex-direction: column; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4);
}
/* Checkbox rows keep gap:0 — MpCheckbox brings its own control-to-label gap */
.br-match-check { display: flex; align-items: center; gap: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

/* ── Blank slate — nothing accepted into the expense yet ──────────────────── */
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

/* ── Line-items table (from NewExpensePage) ───────────────────────────────── */
.ex-table-section { overflow-x: auto; border-bottom: 1px solid var(--mp-border-default); }
.ex-table-scroll { overflow-x: auto; }
.ex-table { width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0; border-radius: 0; }
.ex-col-drag { width: 44px; }
.ex-col-account { width: 200px; }
.ex-col-desc { width: auto; }
.ex-col-tax { width: 140px; }
.ex-col-amount { width: 160px; }
.ex-col-del { width: 44px; }
.ex-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  font-style: normal; text-transform: uppercase; letter-spacing: var(--mp-letter-spacings-normal);
  color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.ex-th--drag, .ex-th--del { padding: 0; }
.ex-td {
  padding: var(--mp-sizes-2\.5, 10px) var(--mp-spacing-4) var(--mp-sizes-2\.5, 10px) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); vertical-align: middle;
}
.ex-tr:last-child .ex-td { border-bottom: none; }
.ex-td--drag { padding: 0; text-align: center; vertical-align: middle; color: var(--mp-text-placeholder); cursor: grab; }
.ex-td--input { padding: 0; vertical-align: middle; }
.ex-td--input :deep([class*='input']), .ex-td--input :deep([class*='autocomplete']), .ex-td--input :deep([class*='datepicker']) { border-radius: 0; border-color: transparent; }
.ex-td--input .ex-datepicker { width: 100%; }
.ex-td--input:focus-within { box-shadow: inset 0 0 0 2px var(--mp-colors-border-focused, #41c6a0); }
.ex-td--del { padding: 0; text-align: center; vertical-align: middle; }
.ex-td--border { border-right: 1px solid var(--mp-border-default); }
.ex-td--error { background: var(--mp-background-danger-subtle, #fef2f2); box-shadow: inset 0 -1px 0 0 var(--mp-border-danger, #dc2626); }
.ex-td--error :deep([class*='autocomplete']),
.ex-td--error :deep([class*='input']) { background: transparent; }
.ex-error-tooltip-wrap { display: block; width: 100%; }
.ex-error-tooltip-wrap :deep([class*='tooltip__trigger']) { display: block; width: 100%; }
.ex-lineitems-table { min-width: 764px; margin-right: auto; }
.ex-lineitems-table .ex-td { height: var(--mp-sizes-10, 40px); vertical-align: middle; border-bottom: 1px solid var(--mp-border-default); }
.ex-lineitems-table .ex-td--amount { padding: 0; }
.ex-amount-cell { display: flex; align-items: stretch; height: 100%; min-height: var(--mp-sizes-10, 40px); }
.ex-amount-prefix {
  flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  padding: 0 var(--mp-spacing-2); background: var(--mp-background-neutral-subtle);
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
.ex-del-btn:hover { background: var(--mp-background-neutral) !important; color: var(--mp-text-danger); }

/* ── Totals ───────────────────────────────────────────────────────────────── */
.br-totals { display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding-top: var(--mp-spacing-4); }
.ex-total-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-4); }
.ex-total-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.ex-total-amt { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
.ex-total-label--strong, .ex-total-amt--strong {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.ex-total-rule { border-top: 1px solid var(--mp-border-default); }

/* ── Memo / Attachment ────────────────────────────────────────────────────── */
.ex-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); max-width: 440px; }
.ex-section-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ex-helper-text { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm); }
.ex-attachment { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ex-section.ex-attachment-section { gap: var(--mp-spacing-1); }
/* MpText sets its colour through an inline custom property — only !important wins */
.ex-attachment-upload :deep(p[data-pixel-component="MpText"]) { color: var(--mp-text-placeholder) !important; }
/* --mp-colors-border-focused is the theme-aware focus token (green here); the
   --mp-border-focused shorthand used elsewhere doesn't resolve. */
.ex-attachment-upload--dragover { border-color: var(--mp-colors-border-focused, #41c6a0) !important; }

/* ── Payment ──────────────────────────────────────────────────────────────── */
.ex-payment-section { max-width: none; }
.ex-payment-section :deep(.mp-tab-list__list) { margin-bottom: var(--mp-spacing-5, 20px); }
/* Panda's static scan never emitted MpTabSelectedBorder's base position/size rule
   nor its selected-colour utility, so the underline renders 0x0 and transparent. */
.ex-payment-section :deep(.mp-tab-selected-border) {
  position: absolute; bottom: -2px; width: calc(100% - 8px);
  height: var(--mp-sizes-0\.5, 2px); background: var(--mp-colors-border-selected, #029861);
}

/* ── Footer ───────────────────────────────────────────────────────────────── */
/* Extra bottom padding keeps the actions clear of the fixed demo FAB (48px tall,
   24px off the viewport bottom) once the panel is scrolled all the way down. */
.ex-footer {
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding-top: var(--mp-spacing-6); padding-bottom: var(--mp-spacing-12, 48px);
}

/* ── Demo scenario FAB — mirrors NewProductPage.vue's .demo-fab ───────────── */
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
