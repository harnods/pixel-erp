<script setup lang="ts">
/**
 * ReceiptReviewPage — "File review N of M" for a file classified as a Payment
 * receipt (Figma 4712:75648 first-run, 4712:75709 filled).
 *
 * The lightest of the three review forms. A payment receipt doesn't describe
 * new goods — it says money moved against invoices that already exist — so:
 *
 *   Section 1     just Vendor + Date paid + the auto transaction no.
 *   Transactions  the match card's *transaction* variant: the extracted payment
 *                 line (reference + amount paid) maps onto a single field, the
 *                 purchase invoice it settles. Airene matches on reference no.
 *                 rather than on previous transactions.
 *
 * Chrome comes from FileReviewShell; the section shells, match card, blank
 * slate, totals and Additional info follow the expense review's patterns.
 */
import { ref, computed, watch } from 'vue'
import {
  MpButton, MpCheckbox, MpInput, MpTextarea, MpAutocomplete, MpDatePicker,
  MpInputTag, MpIcon, MpUpload, MpUploadList, toast, MpTooltip,
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
  type DataInterface,
} from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import FileReviewShell from '~/components/patterns/FileReviewShell.vue'
import EditClassificationModal, { type Classification } from '~/components/patterns/EditClassificationModal.vue'
import { useReviewQueue } from '~/composables/useReviewQueue'
import { purchaseInvoices } from '~/data'
import { scrollToFirstError } from '~/utils/form'

const props = defineProps<{ orderId: string }>()

const { t } = useLocale()
const { queue, backLabel, queueBase, goBack, goToNext, removeFromQueue } = useReviewQueue(() => props.orderId)

const reviewFile = computed(() => queue.value.find((rf) => rf.id === props.orderId) ?? queue.value[0])

// ── Master data ──────────────────────────────────────────────────────────────
const VENDOR_OPTIONS = [
  { id: 'PT Inspirasi Digital Eksperiensia', name: 'PT Inspirasi Digital Eksperiensia' },
  { id: 'Tera Logistics', name: 'Tera Logistics' },
  { id: 'EXPAT Roasters Bali', name: 'EXPAT Roasters Bali' },
]
/** The open purchase invoices a receipt can be matched against. */
const INVOICE_OPTIONS = computed(() => [
  { id: 'PI-94040', name: 'Purchase Invoice #94040', dueDate: '17/04/2026', balanceDue: 800_000, total: 800_000 },
  ...purchaseInvoices.slice(0, 6).map((pi) => ({
    id: pi.id,
    name: `Purchase Invoice #${pi.number.replace(/\D/g, '').slice(-5)}`,
    dueDate: pi.dueDate.split('-').reverse().join('/'),
    balanceDue: pi.amount,
    total: pi.amount,
  })),
])

// ── Scenario state (dev FAB) ─────────────────────────────────────────────────
type Scenario = 'ai_not_found' | 'ai_matched' | 'filled' | 'unreadable'
const scenario = ref<Scenario>('ai_matched')
const scenarios: { value: Scenario; label: string }[] = [
  { value: 'ai_not_found', label: t('AI not found') },
  { value: 'ai_matched',   label: t('AI matched')   },
  { value: 'filled',       label: t('Filled')       },
  { value: 'unreadable',   label: t('Error - file unreadable') },
]

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
const vendorAiHint = ref('')

const datePaid = ref('')
const datePaidError = ref(false)
const transactionNo = ref('')

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
  const go = goToNext()
  removeFromQueue(props.orderId)
  toast.notify({
    variant: 'success',
    title: `1 ${t('file')} ${t('moved to')} ${next === 'expense' ? t('Expense') : t('Invoice')}`,
    rootProps: { class: 'toast-enterprise' },
  })
  go()
}

// ── Settled transactions (the accepted table) ────────────────────────────────
interface LineRow {
  id: number
  invoiceId: string
  dueDate: string
  balanceDue: number
  total: number
  invoiceError: boolean
}
let rowSeq = 0
function makeRow(): LineRow {
  return { id: rowSeq++, invoiceId: '', dueDate: '', balanceDue: 0, total: 0, invoiceError: false }
}
const rows = ref<LineRow[]>([makeRow()])

function validateLineItems(): boolean {
  let valid = true
  const rowsToCheck = rows.value.length > 1 ? rows.value.slice(0, -1) : rows.value
  rowsToCheck.forEach((row) => {
    if (!row.invoiceId) { row.invoiceError = true; valid = false }
  })
  return valid
}
const lineItemsHaveError = computed(() => rows.value.some((r) => r.invoiceError))

function onInvoiceSelect(row: LineRow) {
  const opt = INVOICE_OPTIONS.value.find((o) => o.id === row.invoiceId)
  if (opt) {
    row.dueDate = opt.dueDate
    row.balanceDue = opt.balanceDue
    row.total = opt.total
    row.invoiceError = false
  }
  const last = rows.value[rows.value.length - 1]
  if (last && last.id === row.id) rows.value.push(makeRow())
}
function removeRow(id: number) {
  if (rows.value.length === 1) return
  rows.value = rows.value.filter((r) => r.id !== id)
}

// ── "To match" cards — one per extracted payment line ────────────────────────
interface MatchCard {
  id: number
  /** what the OCR lifted straight off the receipt */
  reference: string
  amountPaid: number
  /** the purchase invoice this payment settles — blank when nothing matched */
  invoiceId: string
  aiMatched: boolean
  invoiceError: boolean
}
let cardSeq = 0
const matchCards = ref<MatchCard[]>([])
/** Exactly one card open at a time — closing the open one hands the open state
 *  to the next card rather than collapsing the whole stack. */
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

const transactionsStatus = computed(() => (matchCards.value.length || !rows.value.some((r) => r.invoiceId)) ? 'needs review' : 'ready')
const receiptStatus = computed(() => (vendor.value && datePaid.value ? 'ready' : 'needs review'))

/** Accept every checked card at once — cards that still fail validation (e.g.
 *  no invoice matched yet) stay checked and keep their error state. */
function acceptCheckedMatches() {
  for (const id of [...checkedCards.value]) {
    const card = matchCards.value.find((c) => c.id === id)
    if (card) acceptMatch(card)
  }
  checkedCards.value = new Set([...checkedCards.value].filter((id) => matchCards.value.some((c) => c.id === id)))
}

function acceptMatch(card: MatchCard) {
  if (!card.invoiceId) { card.invoiceError = true; scrollToFirstError(); return }
  const opt = INVOICE_OPTIONS.value.find((o) => o.id === card.invoiceId)
  const accepted: LineRow = {
    id: rowSeq++,
    invoiceId: card.invoiceId,
    dueDate: opt?.dueDate ?? '',
    balanceDue: card.amountPaid,
    total: opt?.total ?? card.amountPaid,
    invoiceError: false,
  }
  const filled = rows.value.filter((r) => r.invoiceId)
  rows.value = [...filled, accepted, makeRow()]

  const remaining = matchCards.value.filter((c) => c.id !== card.id)
  matchCards.value = remaining
  openCardId.value = remaining[0]?.id ?? null
  itemsUnresolvedError.value = false
  if (!remaining.length) scenario.value = 'filled'
  toast.notify({ variant: 'success', title: t('Transaction matched'), rootProps: { class: 'toast-enterprise' } })
}

// ── Scenario seeding ─────────────────────────────────────────────────────────
function applyScenario(s: Scenario) {
  rowSeq = 0
  cardSeq = 0
  itemsUnresolvedError.value = false
  vendorError.value = false
  datePaidError.value = false
  checkedCards.value = new Set()
  lessWithholding.value = false
  datePaid.value = '17/04/2026'
  transactionNo.value = ''
  memo.value = ''

  if (s === 'filled') {
    vendor.value = 'PT Inspirasi Digital Eksperiensia'
    vendorAiHint.value = 'PT Inspirasi Digital Eksperiensia'
    matchCards.value = []
    openCardId.value = null
    rows.value = [
      { id: rowSeq++, invoiceId: 'PI-94040', dueDate: '17/04/2026', balanceDue: 800_000, total: 800_000, invoiceError: false },
      makeRow(),
    ]
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
  vendor.value = ai ? 'PT Inspirasi Digital Eksperiensia' : ''
  vendorAiHint.value = ai ? 'PT Inspirasi Digital Eksperiensia' : ''
  matchCards.value = [
    {
      id: cardSeq++,
      reference: 'INV-1610', amountPaid: 800_000,
      invoiceId: ai ? 'PI-94040' : '', aiMatched: ai, invoiceError: false,
    },
  ]
  openCardId.value = matchCards.value[0]!.id
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
const lessWithholding = ref(false)
const withholdingAmount = ref('0')

const subtotal = computed(() => {
  const fromRows = rows.value.reduce((s, r) => s + r.balanceDue, 0)
  const fromCards = matchCards.value.reduce((s, c) => s + c.amountPaid, 0)
  return fromRows + fromCards
})
const total = computed(() =>
  subtotal.value - (lessWithholding.value ? Number(withholdingAmount.value) || 0 : 0),
)

// ── Memo / Attachment ────────────────────────────────────────────────────────
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
  if (!datePaid.value) { datePaidError.value = true; valid = false }

  if (matchCards.value.length) {
    itemsUnresolvedError.value = true
    matchCards.value.forEach((c) => { if (!c.invoiceId) c.invoiceError = true })
    valid = false
  } else if (!validateLineItems()) {
    valid = false
  }
  if (!valid) { scrollToFirstError(); return }

  // TODO: settle the matched purchase invoices and land on the receipt's own
  // detail page once that exists — parked deliberately, there is no
  // purchase-invoice detail surface yet.
  const next = goToNext()
  removeFromQueue(props.orderId)
  toast.notify({ variant: 'success', title: t('Payment receipt saved'), rootProps: { class: 'toast-enterprise' } })
  next()
}

applyScenario(scenario.value)
watch(() => props.orderId, () => applyScenario(scenario.value))
</script>

<template>
  <FileReviewShell
    :queue="queue" :file-id="props.orderId"
    :back-label="backLabel" :queue-base="queueBase"
    :is-unreadable="scenario === 'unreadable'"
    @back="goBack"
  >
    <!-- ══ Section: Payment Receipt ══ -->
    <div class="br-section">
      <div class="br-section-header">
        <div class="br-section-titlerow">
          <h2 class="br-section-title">{{ t('Payment Receipt') }}</h2>
          <!-- Reclassify — the file may not be a payment receipt at all -->
          <MpButton class="br-icon-btn" :aria-label="t('Edit classification')" @click="classificationModalOpen = true">
            <MpIcon name="edit" size="sm" />
          </MpButton>
          <ErpStatusBadge :status="receiptStatus" badge-for="additionalInformation" />
        </div>
        <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" @click="moreInfoOpen = !moreInfoOpen">
          {{ moreInfoOpen ? t('Less info') : t('Add more info') }}
        </button>
      </div>

      <!-- Vendor -->
      <div class="ex-row-1 ex-section-divider">
        <div class="br-ai-field ex-field-flex">
          <MpFormControl id="rc-vendor" is-required :is-invalid="vendorError" :class="{ 'br-ai-anchor': vendorAiHint }">
            <MpFormLabel>{{ t('Vendor') }}</MpFormLabel>
            <MpAutocomplete
              id="rc-vendor-ac" v-model="vendor" :data="vendorOptions"
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
            <span>{{ t('AI matched') }} - {{ vendorAiHint }} {{ t('in doc') }}</span>
          </div>
        </div>
        <!-- Vendor contact, revealed by "Add more info" — same width as Vendor,
             sitting in the row's own 24px column gap. -->
        <MpFormControl v-if="moreInfoOpen" id="rc-email" class="ex-field-flex">
          <MpFormLabel>{{ t('Email') }}</MpFormLabel>
          <MpInputTag id="rc-email-input" :data="emailTags" :placeholder="t('+ Add email')" @change="onEmailChange" />
        </MpFormControl>
      </div>

      <!-- Date paid / transaction no. -->
      <div class="ex-grid-2">
        <MpFormControl id="rc-datepaid" is-required :is-invalid="datePaidError">
          <MpFormLabel>{{ t('Date paid') }}</MpFormLabel>
          <div class="ex-datepicker">
            <MpDatePicker
              id="rc-datepaid-dp" v-model="datePaid" format="DD/MM/YYYY" value-type="format" use-portal
              @update:model-value="datePaidError = false"
            />
          </div>
          <MpFormErrorMessage>{{ t('You must select date paid') }}</MpFormErrorMessage>
        </MpFormControl>
        <MpFormControl id="rc-transno" is-required>
          <div class="ex-label-row">
            <MpFormLabel>{{ t('Transaction no.') }}</MpFormLabel>
            <span class="ex-label-icon" :title="t('Auto-generated')"><MpIcon name="settings" size="sm" /></span>
          </div>
          <MpInput id="rc-transno-input" v-model="transactionNo" placeholder="[Auto]" is-full-width is-disabled />
        </MpFormControl>
        <template v-if="moreInfoOpen">
          <MpFormControl id="rc-refno">
            <MpFormLabel>{{ t('Reference no.') }}</MpFormLabel>
            <MpInput id="rc-refno-input" v-model="referenceNo" is-full-width />
          </MpFormControl>
          <MpFormControl id="rc-tags">
            <MpFormLabel>{{ t('Tag') }}</MpFormLabel>
            <MpInputTag id="rc-tags-input" :data="tags" :is-enable-create-new-tag="true" :is-show-suggestions="false" @change="onTagsChange" />
          </MpFormControl>
        </template>
      </div>
    </div>

    <!-- ══ Section: Transactions ══ -->
    <div class="br-section">
      <div class="br-section-header">
        <div class="br-section-titlerow">
          <h2 class="br-section-title">{{ t('Transactions') }}</h2>
          <ErpStatusBadge :status="transactionsStatus" badge-for="additionalInformation" />
        </div>
      </div>

      <MpBanner
        v-if="lineItemsHaveError || itemsUnresolvedError"
        id="rc-items-error-banner" variant="danger" align-items="center" class="br-items-error-banner"
      >
        <MpBannerIcon id="rc-items-error-banner-icon" />
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
              <span class="br-accordion-desc">{{ t('Start matching to add transaction lines') }}</span>
            </span>
          </div>

          <div class="br-match-wrap">
            <!-- Bulk bar — appears once at least one match item is checked -->
            <div v-if="checkedCards.size > 0" class="br-match-bulk-bar">
              <div class="br-match-bulk-bar__left">
                <MpCheckbox :is-checked="allCardsChecked" :is-indeterminate="someCardsChecked" @change="toggleSelectAllCards" />
                <span class="br-match-bulk-bar__count">{{ checkedCards.size }} {{ t(checkedCards.size === 1 ? 'item selected' : 'items selected') }}</span>
              </div>
              <button class="btn-enterprise btn-enterprise--primary btn-enterprise--sm" @click="acceptCheckedMatches">{{ t('Accept match') }}</button>
            </div>
            <div v-for="card in matchCards" :key="card.id" class="br-match-card">
              <div class="br-match-head">
                <div class="br-match-head-col br-match-head-col--src">
                  <div class="br-match-head-controls">
                    <MpCheckbox v-if="matchCards.length > 1" :id="`rc-match-check-${card.id}`" :is-checked="checkedCards.has(card.id)" @change="toggleChecked(card.id)" />
                    <MpButton class="br-icon-btn" :aria-label="t('Toggle details')" @click="toggleCard(card.id)">
                      <MpIcon :name="openCardId === card.id ? 'chevrons-down' : 'chevrons-right'" size="md" />
                    </MpButton>
                  </div>
                  <div class="br-match-stack br-match-stack--end">
                    <span class="br-match-name">{{ card.reference }}</span>
                    <span class="br-match-sub">{{ formatIDR(card.amountPaid) }}</span>
                  </div>
                </div>

                <div class="br-match-link" aria-hidden="true"><span class="br-match-link-line" /></div>

                <div class="br-match-head-col br-match-head-col--dest">
                  <div class="br-match-stack">
                    <div class="br-match-name-row">
                      <span class="br-match-name" :class="{ 'br-match-name--empty': !card.invoiceId }">
                        {{ INVOICE_OPTIONS.find(o => o.id === card.invoiceId)?.name || t('Match not found') }}
                      </span>
                      <span v-if="card.aiMatched" class="br-ai-badge">
                        <MpIcon name="airene-brand" size="sm" />{{ t('AI matched') }}
                      </span>
                    </div>
                    <span v-if="card.invoiceId" class="br-match-sub">{{ formatIDR(card.amountPaid) }}</span>
                  </div>
                  <MpTooltip :id="`rc-accept-tip-${card.id}`" :label="t('Accept match')" placement="top" use-portal>
                    <MpButton
                      class="br-accept-btn" :class="{ 'br-accept-btn--idle': !card.invoiceId }"
                      :aria-label="t('Accept match')" @click="acceptMatch(card)"
                    >
                      <MpIcon name="check" size="md" />
                    </MpButton>
                  </MpTooltip>
                </div>
              </div>

              <div v-if="openCardId === card.id" class="br-match-body">
                <div class="br-match-body-left">
                  <p class="br-match-body-title">{{ card.reference }}</p>
                  <div class="br-match-rows">
                    <div class="br-match-row">
                      <span class="br-match-row-key">{{ t('Amount paid') }}</span>
                      <span class="br-match-row-val">{{ formatIDR(card.amountPaid) }}</span>
                    </div>
                  </div>
                </div>
                <div class="br-match-body-right">
                  <!-- A receipt carries the invoice's reference, so Airene matches
                       on that rather than on previous transactions. -->
                  <div v-if="card.aiMatched" class="br-ai-banner br-ai-banner--boxed">
                    <MpIcon name="airene-brand" size="sm" />
                    <span>{{ t('AI matched from reference no.') }}</span>
                  </div>
                  <div class="br-match-form">
                    <MpFormControl :id="`rc-match-invoice-${card.id}`" is-required :is-invalid="card.invoiceError">
                      <MpFormLabel>{{ t('Number') }}</MpFormLabel>
                      <MpAutocomplete
                        :id="`rc-match-invoice-ac-${card.id}`" v-model="card.invoiceId" :data="INVOICE_OPTIONS"
                        label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                        :placeholder="t('Select transaction')"
                        :is-invalid="card.invoiceError"
                        @update:model-value="card.invoiceError = false; itemsUnresolvedError = false"
                      />
                      <MpFormErrorMessage>{{ t('You must select transaction') }}</MpFormErrorMessage>
                    </MpFormControl>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!rows.some(r => r.invoiceId)" class="br-blank-slate">
          <img src="/illustrations/empty-folder.png" alt="" width="144" height="120" />
          <p class="br-blank-title">{{ t('No matched transactions yet') }}</p>
          <p class="br-blank-desc">{{ t('Matched transactions will appear here.') }}</p>
        </div>
      </template>

      <!-- ── The settled-transactions table ── -->
      <div v-if="rows.some(r => r.invoiceId) || !matchCards.length" class="ex-table-section">
        <div class="ex-table-scroll">
          <table class="ex-table rc-lineitems-table">
            <colgroup>
              <col class="rc-col-transaction" />
              <col class="rc-col-duedate" />
              <col class="rc-col-balance" />
              <col class="rc-col-total" />
              <col class="ex-col-del" />
            </colgroup>
            <thead>
              <tr>
                <th class="ex-th">{{ t('Transaction') }}</th>
                <th class="ex-th">{{ t('Due date') }}</th>
                <th class="ex-th">{{ t('Balance due') }}</th>
                <th class="ex-th">{{ t('Total') }}</th>
                <th class="ex-th ex-th--del" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.id" class="ex-tr">
                <td class="ex-td ex-td--input ex-td--border" :class="{ 'ex-td--error': row.invoiceError }">
                  <MpAutocomplete
                    :id="`rc-row-invoice-${row.id}`" v-model="row.invoiceId" :data="INVOICE_OPTIONS"
                    label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                    :placeholder="t('Select transaction')"
                    @update:model-value="onInvoiceSelect(row)"
                  />
                </td>
                <td class="ex-td ex-td--border">{{ row.dueDate || '—' }}</td>
                <td class="ex-td ex-td--input ex-td--border ex-td--amount">
                  <div class="ex-amount-cell">
                    <span class="ex-amount-prefix">Rp</span>
                    <span class="rc-amount-static">{{ row.balanceDue ? formatIDR(row.balanceDue).replace('Rp', '') : '—' }}</span>
                  </div>
                </td>
                <td class="ex-td ex-td--input ex-td--border ex-td--amount">
                  <div class="ex-amount-cell">
                    <span class="ex-amount-prefix">Rp</span>
                    <span class="rc-amount-static">{{ row.total ? formatIDR(row.total).replace('Rp', '') : '—' }}</span>
                  </div>
                </td>
                <td class="ex-td ex-td--del">
                  <MpButton v-if="rows.length > 1" class="ex-del-btn" :aria-label="t('Remove row')" @click="removeRow(row.id)">
                    <MpIcon name="minus-circle" size="sm" />
                  </MpButton>
                </td>
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
        <div class="ex-total-row rc-withholding-row">
          <div class="rc-withholding-check">
            <MpCheckbox id="rc-less-wht" :is-checked="lessWithholding" @change="lessWithholding = !lessWithholding" />
            <span>{{ t('Less: Withholding tax') }}</span>
          </div>
          <div v-if="lessWithholding" class="rc-withholding-amount">
            <span class="ex-amount-prefix">Rp</span>
            <MpInput id="rc-wht-input" v-model="withholdingAmount" class="ex-amount-input" is-full-width />
          </div>
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

      <div class="ex-section">
        <MpFormControl id="rc-memo">
          <MpFormLabel>{{ t('Memo') }}</MpFormLabel>
          <MpTextarea id="rc-memo-textarea" v-model="memo" is-full-width :rows="4" />
        </MpFormControl>
        <p class="ex-helper-text">{{ t('Only visible to you and your team') }}</p>
      </div>

      <div class="ex-section ex-attachment-section">
        <div class="ex-section-label">{{ t('Attachment') }}</div>
        <div class="ex-attachment">
          <MpUpload
            id="rc-attachment-upload"
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
            id="rc-source-file"
            :title="reviewFile.file" status="success" subtitle="128 KB"
            :icon-name="fileIconName(reviewFile.file)"
          />
          <MpUploadList
            v-for="f in formAttachedFiles" :key="f.name"
            :id="`rc-attachment-file-${f.name}`"
            :title="f.name" status="success" :subtitle="formatFileSize(f.size)"
            :icon-name="fileIconName(f.name)"
            is-show-remove-button
            @remove="removeFormFile(f.name)"
          />
        </div>
      </div>

      <footer class="ex-footer">
        <button class="btn-enterprise btn-enterprise--ghost" @click="goBack">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--secondary" @click="goToNext()()">{{ t('Skip without saving') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" @click="handleSave">{{ t('Save & next') }}</button>
      </footer>
    </div>

    <template #overlays>
      <EditClassificationModal
        :is-open="classificationModalOpen"
        current="payment_receipt"
        @close="classificationModalOpen = false"
        @save="saveClassification"
      />

      <!-- ── Demo scenario FAB — same component as the expense review ── -->
      <MpPopover id="rc-demo-fab" is-close-on-select use-portal placement="top-end">
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
.br-icon-btn:hover { background: var(--mp-background-neutral-hovered) !important; color: var(--mp-text-default); }

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
.br-ai-badge :deep(svg) { width: 10px; height: 10px; flex-shrink: 0; }
.br-ai-banner :deep(svg) { width: 16px; height: 16px; flex-shrink: 0; }

/* ── Header field rows ────────────────────────────────────────────────────── */
.ex-row-1 { display: flex; align-items: flex-start; flex-wrap: wrap; gap: var(--mp-spacing-4) var(--mp-spacing-6); }
.ex-field-flex { flex: 0 0 var(--ex-field-width); min-width: 0; }
.ex-grid-2 {
  display: grid; grid-template-columns: repeat(auto-fill, var(--ex-field-width));
  justify-content: flex-start; gap: var(--mp-spacing-4) var(--mp-spacing-6); padding-top: var(--mp-spacing-5, 20px);
}
/* Dashed rule between the vendor row and the date grid — 20px clear on each side */
.ex-section-divider {
  border-bottom: 1px dashed var(--mp-border-default);
  padding-bottom: var(--mp-spacing-5, 20px);
  margin-bottom: calc(-1 * var(--mp-spacing-3));
}
.ex-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.ex-label-icon { display: flex; align-items: center; color: var(--mp-text-secondary); cursor: pointer; }
.ex-datepicker { width: 100%; }
.ex-datepicker :deep(.mp-datepicker__root) { width: 100%; }

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
.br-match-bulk-bar__left { display: flex; align-items: center; gap: var(--mp-spacing-3); min-width: 0; }
.br-match-bulk-bar__count {
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default); white-space: nowrap;
}
.br-match-card {
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md); overflow: hidden;
}
.br-match-head {
  display: flex; align-items: stretch; min-height: 60px;
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
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
.br-accept-btn--idle { border-color: var(--mp-border-default) !important; color: var(--mp-text-placeholder); }

.br-match-body { display: flex; align-items: stretch; }
.br-match-body-left {
  flex: 1 1 0; min-width: 0;
  display: flex; flex-direction: column;
  padding: var(--mp-spacing-4) 38px var(--mp-spacing-4) var(--mp-spacing-6);
  border-right: 1px solid var(--mp-border-default);
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

/* ── Transactions table ───────────────────────────────────────────────────── */
.ex-table-section { overflow-x: auto; border-bottom: 1px solid var(--mp-border-default); }
.ex-table-scroll { overflow-x: auto; }
.ex-table { width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0; border-radius: 0; }
.rc-col-transaction { width: 240px; }
.rc-col-duedate { width: 140px; }
.rc-col-balance { width: 180px; }
.rc-col-total { width: 180px; }
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
.ex-th--del { padding: 0; }
.ex-td {
  padding: var(--mp-sizes-2\.5, 10px) var(--mp-spacing-4) var(--mp-sizes-2\.5, 10px) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); vertical-align: middle;
}
.ex-tr:last-child .ex-td { border-bottom: none; }
.ex-td--input { padding: 0; vertical-align: middle; }
.ex-td--input :deep([class*='input']), .ex-td--input :deep([class*='autocomplete']) { border-radius: 0; border-color: transparent; }
.ex-td--input:focus-within { box-shadow: inset 0 0 0 2px var(--mp-colors-border-focused, #41c6a0); }
.ex-td--del { padding: 0; text-align: center; vertical-align: middle; }
.ex-td--border { border-right: 1px solid var(--mp-border-default); }
.ex-td--error { background: var(--mp-background-danger-subtle, #fef2f2); box-shadow: inset 0 -1px 0 0 var(--mp-border-danger, #dc2626); }
.ex-td--error :deep([class*='autocomplete']) { background: transparent; }
.rc-lineitems-table { min-width: 784px; margin-right: auto; }
.rc-lineitems-table .ex-td { height: var(--mp-sizes-10, 40px); vertical-align: middle; border-bottom: 1px solid var(--mp-border-default); }
.rc-lineitems-table .ex-td--amount { padding: 0; }
.ex-amount-cell { display: flex; align-items: stretch; height: 100%; min-height: var(--mp-sizes-10, 40px); }
.ex-amount-prefix {
  flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  padding: 0 var(--mp-spacing-2); background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); border-radius: 0;
}
/* Balance due and Total mirror the matched invoice — read-only here */
.rc-amount-static {
  flex: 1; min-width: 0; display: flex; align-items: center;
  padding: 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
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
.ex-total-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.ex-total-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.ex-total-amt { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
.ex-total-label--strong, .ex-total-amt--strong {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.ex-total-rule { border-top: 1px solid var(--mp-border-default); }
/* No gap — MpCheckbox renders its own 12px control-to-label gap internally */
.rc-withholding-check {
  display: flex; align-items: center; gap: 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.rc-withholding-amount {
  display: flex; align-items: stretch; width: 180px; height: var(--mp-sizes-9, 36px);
  border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16));
  border-radius: var(--mp-radii-md); overflow: hidden;
}
.rc-withholding-amount :deep([class*='input']) { border: none; border-radius: 0; }

/* ── Memo / Attachment ────────────────────────────────────────────────────── */
.ex-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); max-width: 440px; }
.ex-section-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ex-helper-text { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm); }
.ex-attachment { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ex-section.ex-attachment-section { gap: var(--mp-spacing-1); }
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
