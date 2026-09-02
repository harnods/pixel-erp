<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, type Ref } from 'vue'
import { formatIDR } from '~/utils/currency'
import {
  MpButton, MpCheckbox, MpInput, MpInputGroup, MpInputLeftAddon, MpTextarea, MpAutocomplete, MpDatePicker,
  MpInputTag, MpIcon, MpUpload, MpUploadList, MpDropzone, MpSpinner, toast, MpTooltip,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel,
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpTextlink, css,
  type DataInterface,
} from '@mekari/pixel3'
import { VENDORS } from '~/data/master'
import { bills, addBill, updateBill } from '~/data/bills'
import type { Bill } from '~/data/types'
import { scrollToFirstError } from '~/utils/form'
import NumberFormatSettingsModal, { type NumberFormatConfig } from '~/components/patterns/NumberFormatSettingsModal.vue'
import ErpDropzoneIcon from '~/components/patterns/ErpDropzoneIcon.vue'

const props = defineProps<{ orderId?: string }>()
const router = useRouter()
const route = useRoute()
const { t } = useLocale()

// Edit mode — /expenses/:id/edit reuses this form. 'new' (or no id) = create.
const isEdit = computed(() => !!props.orderId && props.orderId !== 'new')
const editBill = computed(() => (isEdit.value ? bills.find((b) => b.id === props.orderId) ?? null : null))

// Duplicate — /expenses/new?duplicate=<id> opens the create form pre-filled from a
// source bill, minus its payment (a duplicate is always a fresh, unpaid expense).
const duplicateSource = computed(() => {
  const id = route.query.duplicate
  return typeof id === 'string' ? bills.find((b) => b.id === id) ?? null : null
})

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
  router.push({ path: '/expenses', query: { tab: 'Bills' } })
}

// ── Chart of accounts / tax — no master data module for these yet, so a small
// local list stands in (mirrors how CreateReceiptPage derives UNIT_OPTIONS locally).
// Reactive so edit-mode prefill can inject accounts a saved bill references that
// aren't in this small stand-in list (same trick as beneficiaryOptions).
const ACCOUNT_OPTIONS = ref([
  { id: '485', name: '485 - Subscriptions' },
  { id: '520', name: '520 - Office supplies' },
  { id: '540', name: '540 - Travel' },
  { id: '610', name: '610 - Utilities' },
  { id: '710', name: '710 - Equipment' },
  { id: '810', name: '810 - Marketing' },
])
const TAX_OPTIONS = [
  { id: 'ppn10', name: 'PPN 10%' },
  { id: 'none', name: t('No tax') },
]
const BANK_ACCOUNT_OPTIONS = ref([
  { id: '1-10003', name: '1-10003 Bank BCA' },
  { id: '1-10004', name: '1-10004 VISA 8265' },
])
// Ensures `id`/`name` exists in an options ref so an Autocomplete can display a
// prefilled value the stand-in list doesn't already contain.
function ensureOption(list: Ref<{ id: string; name: string }[]>, id: string, name = id) {
  if (id && !list.value.some((o) => o.id === id)) list.value.push({ id, name })
}

// ── Header fields ────────────────────────────────────────────────────────────
const beneficiary = ref('')
const beneficiaryError = ref(false)
const beneficiaryOptions = ref(VENDORS.map((v) => ({ id: v, name: v })))
function onBeneficiaryAdd(_suggestions: unknown, currentSearch: string) {
  const name = currentSearch.trim()
  if (!name) return
  if (!beneficiaryOptions.value.some((v) => v.id === name)) {
    beneficiaryOptions.value.push({ id: name, name })
  }
  beneficiary.value = name
  beneficiaryError.value = false
}

const iHavePaid = ref(true)
const dueDate = ref(todayDisplay)
const dueDateError = ref(false)

const transactionDate = ref(todayDisplay)
const transactionDateError = ref(false)
const transactionNo = ref('')
const referenceNo = ref('')
const tags = ref<DataInterface[]>([])
function onTagsChange(data: DataInterface[]) { tags.value = data }

// ── Transaction no. settings (auto-numbering) — shared global component ────────
const noSettingsOpen = ref(false)
const nextTxNo = computed(() => `Expense #${String(bills.reduce((m, b) => Math.max(m, b.number), 0) + 1).padStart(5, '0')}`)
const txNoFormats = [{ label: t('Auto'), value: 'auto' }]
function onNoFormatSave(_config: NumberFormatConfig) { noSettingsOpen.value = false }

const priceIncludesTax = ref(false)

// ── Line items ───────────────────────────────────────────────────────────────
interface LineRow {
  id: number
  accountId: string
  description: string
  taxId: string
  amount: string
  accountError: boolean
  amountError: boolean
  // Once an account has been picked, the rest of the row's columns stay visible
  // even if the account is later cleared via the autocomplete's X icon — only a
  // fresh, never-touched row hides them.
  revealed: boolean
}
let rowSeq = 0
function makeRow(): LineRow {
  return { id: rowSeq++, accountId: '', description: '', taxId: '', amount: '', accountError: false, amountError: false, revealed: false }
}
const rows = ref<LineRow[]>([makeRow()])

// Every row except the trailing "add new" row must have an account + a
// positive amount before saving (description and tax stay optional). When
// nothing has been entered yet, that lone row *is* the only row — not a
// placeholder after real content — so it must be validated too.
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

// Drag-and-drop row reorder (same pattern as CreateReceiptPage's product table).
const dragSrcIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)
function onDragStart(ev: DragEvent, idx: number) {
  dragSrcIndex.value = idx
  if (ev.dataTransfer) { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', String(idx)) }
}
function onDragOver(ev: DragEvent, idx: number) {
  ev.preventDefault()
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'
  dragOverIndex.value = idx
}
function onDrop(ev: DragEvent, toIdx: number) {
  ev.preventDefault()
  const fromIdx = dragSrcIndex.value
  if (fromIdx === null || fromIdx === toIdx) { dragSrcIndex.value = null; dragOverIndex.value = null; return }
  const arr = [...rows.value]
  const [moved] = arr.splice(fromIdx, 1)
  arr.splice(toIdx, 0, moved!)
  rows.value = arr
  dragSrcIndex.value = null
  dragOverIndex.value = null
}
function onDragEnd() { dragSrcIndex.value = null; dragOverIndex.value = null }

// ── Totals ───────────────────────────────────────────────────────────────────
// Sum of every line's entered amount (as typed by the user).
const lineSum = computed(() => rows.value.reduce((s, r) => s + (Number(r.amount) || 0), 0))
const taxableSubtotal = computed(() => rows.value.filter((r) => r.taxId === 'ppn10').reduce((s, r) => s + (Number(r.amount) || 0), 0))
const hasPpnTax = computed(() => taxableSubtotal.value > 0)
// "Price includes tax" → the taxable line amounts are GROSS (tax-inclusive): the
// 10% PPN is extracted from within them (amount × 10/110), NOT zeroed. Otherwise
// PPN is added on top (amount × 10%).
const ppnAmount = computed(() => priceIncludesTax.value
  ? Math.round(taxableSubtotal.value * 10 / 110)
  : Math.round(taxableSubtotal.value * 0.1))
// Subtotal (net / DPP): inclusive → strip the embedded tax out of the entered
// amounts; exclusive → the entered amounts already are the net.
const subtotal = computed(() => priceIncludesTax.value ? lineSum.value - ppnAmount.value : lineSum.value)
// Inclusive → equals the entered gross (lineSum); exclusive → net + tax on top.
const total = computed(() => subtotal.value + ppnAmount.value)

// ── Withholding ──────────────────────────────────────────────────────────────
interface WithholdingRow {
  id: number
  name: string
  amount: string
  unit: 'Rp' | '%'
  accountId: string
  nameError: boolean
  amountError: boolean
  accountError: boolean
}
let whSeq = 0
function makeWithholdingRow(): WithholdingRow {
  return {
    id: whSeq++, name: whSeq === 1 ? t('Withholding tax') : '', amount: '', unit: 'Rp', accountId: '',
    nameError: false, amountError: false, accountError: false,
  }
}
const lessWithholding = ref(false)
const withholdingRows = ref<WithholdingRow[]>([makeWithholdingRow()])
function addWithholdingRow() { withholdingRows.value.push(makeWithholdingRow()) }
function removeWithholdingRow(id: number) {
  if (withholdingRows.value.length === 1) return
  withholdingRows.value = withholdingRows.value.filter((r) => r.id !== id)
}

// Every withholding row needs a name, a positive amount, and an account —
// but only while "Less: Withholding" is actually checked on.
function validateWithholding(): boolean {
  if (!lessWithholding.value) return true
  let valid = true
  withholdingRows.value.forEach((row) => {
    if (!row.name) { row.nameError = true; valid = false }
    if (!(Number(row.amount) > 0)) { row.amountError = true; valid = false }
    if (!row.accountId) { row.accountError = true; valid = false }
  })
  return valid
}
const withholdingTotal = computed(() =>
  lessWithholding.value
    ? withholdingRows.value.reduce((s, r) => {
        const amt = Number(r.amount) || 0
        return s + (r.unit === '%' ? Math.round((amt / 100) * total.value) : amt)
      }, 0)
    : 0,
)
const finalTotal = computed(() => total.value - withholdingTotal.value)

// ── Memo + Attachment (form-level, separate from the receipt dropzone) ──────
const memo = ref('')
const formAttachedFiles = ref<File[]>([])
function addFormFiles(files: FileList | null) {
  if (!files) return
  for (const f of Array.from(files)) {
    if (!formAttachedFiles.value.some((x) => x.name === f.name)) formAttachedFiles.value.push(f)
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
function fileIconName(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'pdf-document'
  if (ext === 'doc' || ext === 'docx') return 'word-document'
  if (ext === 'xls' || ext === 'xlsx') return 'excel-document'
  if (['jpg', 'jpeg', 'png'].includes(ext)) return 'image-document'
  if (ext === 'zip') return 'zip'
  return 'doc'
}

// ── Payment (shown only when "I have paid this bill" is checked) ───────────
const paymentAccountId = ref('')
const paymentAccountError = ref(false)
const paymentDate = ref(todayDisplay)
const paymentReference = ref('')
const amountPaidError = ref(false)
// Prefilled from the total, editable — stops auto-syncing once the user types their own value.
const amountPaid = ref(finalTotal.value)
const amountPaidTouched = ref(false)
watch(finalTotal, (v) => {
  if (!amountPaidTouched.value) amountPaid.value = v
})

// ── Left panel resize (drag the divider — same pattern as the Airene panel) ─
const LEFT_PANEL_MIN = 320
const LEFT_PANEL_MAX = 640
const leftWidth = ref(456)
function startPanelResize(e: MouseEvent) {
  e.preventDefault()
  const startX = e.clientX
  const startW = leftWidth.value

  function onMove(ev: MouseEvent) {
    const delta = ev.clientX - startX
    leftWidth.value = Math.min(LEFT_PANEL_MAX, Math.max(LEFT_PANEL_MIN, startW + delta))
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

// ── Receipt dropzone (left panel) ───────────────────────────────────────────
// A duplicate opens with the autofill panel collapsed (docked) — the fields are
// already filled from the source, so there's nothing to scan.
const leftPanelOpen = ref(!duplicateSource.value)
// Narrow icon rail shown after a close the user didn't permanently suppress —
// keeps a one-click way back into the receipt panel instead of hiding it outright.
const leftPanelDocked = ref(!!duplicateSource.value)
const uploadedFile = ref<File | null>(null)
const uploadedFileUrl = ref('')
const processingFile = ref(false)

// ── Dropzone validation ──────────────────────────────────────────────────────
const DROPZONE_MAX_SIZE = 10 * 1024 * 1024
const DROPZONE_ACCEPTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg']
const DROPZONE_ACCEPTED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg']
const dropzoneError = ref('')

function validateDropzoneFile(file: File): string {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
  if (!DROPZONE_ACCEPTED_TYPES.includes(file.type) && !DROPZONE_ACCEPTED_EXTENSIONS.includes(ext)) {
    return t('File format not supported. Upload a PDF, PNG, or JPG file')
  }
  if (file.size > DROPZONE_MAX_SIZE) {
    return t('File size exceeds the 10 MB limit.')
  }
  return ''
}

function ingestFile(file: File) {
  processingFile.value = true
  // Simulated AI-autofill pass — swaps to the uploaded/preview variant once "done".
  setTimeout(() => {
    if (uploadedFileUrl.value) URL.revokeObjectURL(uploadedFileUrl.value)
    uploadedFile.value = file
    uploadedFileUrl.value = URL.createObjectURL(file)
    processingFile.value = false
  }, 900)
}
// MpDropzone emits "change" with the FileList for both the file-input path and drag/drop.
// Validate here rather than relying on `accept` — drag-and-drop ignores that attribute.
function onDropzoneFileChange(files: FileList | null) {
  if (!files || files.length === 0) return
  if (files.length > 1) {
    dropzoneError.value = t('Upload only one file at a time')
    return
  }
  const error = validateDropzoneFile(files[0])
  if (error) {
    dropzoneError.value = error
    return
  }
  dropzoneError.value = ''
  ingestFile(files[0])
}
// The dropzone's built-in minus-circle emits "clear" — drop our copy of the file too.
function clearUploadedFile() {
  if (uploadedFileUrl.value) URL.revokeObjectURL(uploadedFileUrl.value)
  uploadedFile.value = null
  uploadedFileUrl.value = ''
  dropzoneError.value = ''
  zoomMode.value = 'fit'
  autofillFeedback.value = null
}
onBeforeUnmount(() => {
  if (uploadedFileUrl.value) URL.revokeObjectURL(uploadedFileUrl.value)
})

// File-type icon — mirrors the mapping in BillsReviewFilesPage.vue's review-files table.
function iconForFile(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'pdf-document'
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') return 'image-document'
  return 'attachment'
}
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
// Preview zoom toggle (visual-only placeholder, like the earlier zoom buttons).
const zoomMode = ref<'fit' | '100'>('fit')
// Airene autofill feedback — mutually exclusive thumbs, no backend yet.
const autofillFeedback = ref<'up' | 'down' | null>(null)
function setAutofillFeedback(vote: 'up' | 'down') {
  autofillFeedback.value = autofillFeedback.value === vote ? null : vote
}

// Close the left panel — docks it immediately, no confirmation needed.
function closePanel() {
  leftPanelOpen.value = false
  leftPanelDocked.value = true
}
function undockPanel() {
  leftPanelDocked.value = false
  leftPanelOpen.value = true
}

// ── Save ─────────────────────────────────────────────────────────────────────
function handleSave(mode: 'close' | 'new') {
  // Every check runs (rather than stopping at the first failure) so all invalid
  // fields — header, line items, and payment — surface together on one attempt.
  let valid = true
  if (!beneficiary.value) { beneficiaryError.value = true; valid = false }
  if (!transactionDate.value) { transactionDateError.value = true; valid = false }
  if (!iHavePaid.value && !dueDate.value) { dueDateError.value = true; valid = false }
  if (!validateLineItems()) valid = false
  if (!validateWithholding()) valid = false
  if (iHavePaid.value) {
    if (!paymentAccountId.value) { paymentAccountError.value = true; valid = false }
    if (!(Number(amountPaid.value) > 0)) { amountPaidError.value = true; valid = false }
  }
  if (!valid) { scrollToFirstError(); return }

  // The dropzone receipt (if any) + the form's own Attachment files both land on
  // the saved bill as attachments. Fresh object URLs are minted here (rather than
  // reusing uploadedFileUrl) so revoking the dropzone's preview URL on unmount
  // doesn't invalidate the copy handed off to the saved record.
  const attachments = [
    ...(uploadedFile.value ? [{
      name: uploadedFile.value.name,
      sizeKB: uploadedFile.value.size / 1024,
      url: URL.createObjectURL(uploadedFile.value),
    }] : []),
    ...formAttachedFiles.value.map((f) => ({
      name: f.name,
      sizeKB: f.size / 1024,
      url: URL.createObjectURL(f),
    })),
  ]

  const filledRows = rows.value.filter((r) => r.accountId)
  const lineItems = filledRows.map((r) => ({
    account: ACCOUNT_OPTIONS.value.find((a) => a.id === r.accountId)?.name ?? r.accountId,
    description: r.description,
    tax: TAX_OPTIONS.find((tax) => tax.id === r.taxId)?.name ?? '—',
    amount: Number(r.amount) || 0,
  }))

  // Withholding is persisted (the Bill model carries a single deduction) so it
  // survives an edit round-trip. Multiple rows collapse to the first row's
  // name/account with the summed amount.
  const firstWh = withholdingRows.value[0]
  const withholding: Bill['withholding'] = lessWithholding.value && firstWh
    ? {
        name: firstWh.name || t('Withholding tax'),
        amount: withholdingTotal.value,
        account: BANK_ACCOUNT_OPTIONS.value.find((a) => a.id === firstWh.accountId)?.name ?? firstWh.accountId,
      }
    : undefined

  const payload: Omit<Bill, 'id' | 'number'> = {
    beneficiary: { id: beneficiary.value, name: beneficiary.value },
    category: ACCOUNT_OPTIONS.value.find((a) => a.id === rows.value[0]?.accountId)?.name ?? 'Uncategorized',
    date: toISODate(transactionDate.value),
    dueDate: toISODate(iHavePaid.value ? transactionDate.value : dueDate.value),
    total: finalTotal.value,
    subtotal: subtotal.value,
    taxAmount: ppnAmount.value,
    priceIncludesTax: priceIncludesTax.value || undefined,
    balanceDue: iHavePaid.value ? 0 : finalTotal.value,
    status: iHavePaid.value ? 'paid' : 'unpaid',
    tags: tags.value.length ? tags.value.map((tag) => String(tag.name ?? tag.id)) : undefined,
    memo: memo.value.trim() || undefined,
    attachments: attachments.length ? attachments : undefined,
    lineItems: lineItems.length ? lineItems : undefined,
    withholding,
    // Only a bill created already-paid carries a payment record — an unpaid bill
    // gets one later, through a not-yet-built "add payment" action.
    payment: iHavePaid.value ? {
      paymentAccount: BANK_ACCOUNT_OPTIONS.value.find((a) => a.id === paymentAccountId.value)?.name ?? paymentAccountId.value,
      amountPaid: amountPaid.value,
      paymentDate: toISODate(paymentDate.value),
      reference: paymentReference.value || undefined,
    } : undefined,
  }

  if (isEdit.value && props.orderId) {
    updateBill(props.orderId, payload)
    toast.notify({ variant: 'success', title: t('Changes saved') })
    router.push(`/expenses/${props.orderId}`)
    return
  }

  addBill(payload)
  toast.notify({ variant: 'success', title: t('Expense saved') })
  if (mode === 'close') {
    goExpenses()
  } else {
    // "Save & new" — navigate away and immediately back so this component fully
    // unmounts and remounts as a genuinely fresh /expenses/new instance, rather
    // than wiping fields in place.
    router.push('/expenses').then(() => router.push('/expenses/new'))
  }
}

// ── Edit-mode prefill ──────────────────────────────────────────────────────────
// Populate every field from an existing bill. Account/bank/beneficiary values the
// stand-in option lists don't already carry are injected so the Autocompletes can
// display them (and round-trip back on save).
function prefillFromBill(b: Bill, opts: { includePayment?: boolean } = {}) {
  // Duplicate drops payment entirely (fresh unpaid expense); edit keeps it.
  const includePayment = opts.includePayment !== false
  if (!beneficiaryOptions.value.some((v) => v.id === b.beneficiary.name)) {
    beneficiaryOptions.value.push({ id: b.beneficiary.name, name: b.beneficiary.name })
  }
  beneficiary.value = b.beneficiary.name
  transactionDate.value = toDisplayDate(b.date)
  dueDate.value = toDisplayDate(b.dueDate)
  iHavePaid.value = includePayment ? (b.status === 'paid' || !!b.payment) : false
  tags.value = (b.tags ?? []).map((name) => ({ id: name, name }))
  priceIncludesTax.value = !!b.priceIncludesTax
  memo.value = b.memo ?? ''

  if (b.lineItems?.length) {
    rows.value = b.lineItems.map((li) => {
      const match = ACCOUNT_OPTIONS.value.find((a) => a.name === li.account)
      const accountId = match?.id ?? li.account
      if (!match) ensureOption(ACCOUNT_OPTIONS, li.account)
      return {
        id: rowSeq++, accountId, description: li.description,
        taxId: /ppn/i.test(li.tax) ? 'ppn10' : 'none', amount: String(li.amount),
        accountError: false, amountError: false, revealed: true,
      }
    })
    rows.value.push(makeRow()) // trailing "add new" row
  }

  if (b.withholding) {
    lessWithholding.value = true
    ensureOption(BANK_ACCOUNT_OPTIONS, b.withholding.account)
    withholdingRows.value = [{
      id: whSeq++, name: b.withholding.name, amount: String(b.withholding.amount),
      unit: 'Rp', accountId: b.withholding.account,
      nameError: false, amountError: false, accountError: false,
    }]
  }

  if (includePayment && b.payment) {
    const pa = BANK_ACCOUNT_OPTIONS.value.find((a) => a.name === b.payment!.paymentAccount)
    const paymentAccount = pa?.id ?? b.payment.paymentAccount
    if (!pa) ensureOption(BANK_ACCOUNT_OPTIONS, b.payment.paymentAccount)
    paymentAccountId.value = paymentAccount
    paymentDate.value = toDisplayDate(b.payment.paymentDate)
    paymentReference.value = b.payment.reference ?? ''
    amountPaid.value = b.payment.amountPaid
    amountPaidTouched.value = true // keep the loaded amount from being reset to finalTotal
  }
}

if (editBill.value) prefillFromBill(editBill.value)
else if (duplicateSource.value) prefillFromBill(duplicateSource.value, { includePayment: false })
</script>

<template>
  <div class="detail-page">
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <MpTextlink id="ne-breadcrumb" as="a" class="detail-breadcrumb" @click.prevent="goExpenses">{{ t('Expenses') }}</MpTextlink>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ isEdit ? t('Edit expense') : t('New expense') }}</h1>
        </div>
      </div>
    </header>

    <!-- ── Two-panel stage ── -->
    <div class="ex-stage">

      <!-- ── Docked rail — shown after a close that wasn't permanently suppressed ── -->
      <Transition name="ex-dock-fade">
        <div v-if="leftPanelDocked" class="ex-docked-rail">
          <MpButton class="ex-docked-btn" :aria-label="t('Open receipt autofill')" @click="undockPanel">
            <MpIcon name="airene-brand" size="md" />
          </MpButton>
        </div>
      </Transition>

      <!-- ── Left panel: receipt dropzone / preview ── -->
      <div
        class="ex-left"
        :class="{ 'ex-left--closed': !leftPanelOpen }"
        :style="{ width: (leftPanelOpen ? leftWidth : 0) + 'px' }"
      >
        <div class="ex-left-header">
          <template v-if="!uploadedFile">
            <div class="ex-left-header-title">
              <MpIcon name="airene-brand" size="md" />
              <h2 class="ex-left-header-heading">{{ t('Scan a bill to autofill') }}</h2>
            </div>
            <MpButton class="ex-icon-btn" :aria-label="t('Close receipt panel')" @click="closePanel">
              <MpIcon name="close" size="sm" />
            </MpButton>
          </template>
          <template v-else>
            <div class="ex-file-meta">
              <MpIcon :name="iconForFile(uploadedFile.name)" size="sm" class="ex-file-meta-icon" />
              <div class="ex-file-meta-text">
                <span class="ex-file-name">{{ uploadedFile.name }}</span>
                <span class="ex-file-size">{{ formatFileSize(uploadedFile.size) }}</span>
              </div>
            </div>
            <div class="ex-file-controls">
              <div class="ex-zoom-toggle" role="group" :aria-label="t('Zoom')">
                <button
                  type="button"
                  class="ex-zoom-part"
                  :class="{ 'ex-zoom-part--active': zoomMode === 'fit' }"
                  @click="zoomMode = 'fit'"
                >{{ t('Fit') }}</button>
                <button
                  type="button"
                  class="ex-zoom-part"
                  :class="{ 'ex-zoom-part--active': zoomMode === '100' }"
                  @click="zoomMode = '100'"
                >100%</button>
              </div>
              <MpButton class="ex-icon-btn" :aria-label="t('Close receipt panel')" @click="closePanel">
                <MpIcon name="close" size="sm" />
              </MpButton>
            </div>
          </template>
        </div>

        <!-- Idle / loading / uploaded-preview states are all handled by MpDropzone itself
             (isShowPreview defaults to true) — the built-in preview gives us the hover
             "Replace your file here" overlay and the minus-circle clear button for free. -->
        <!-- Preview mode (isShowPreview default true) renders MpDropzone's own idle
             UI, so the idle copy comes from the `placeholder`/`description` PROPS —
             the #idle slot is ignored in this mode. -->
        <MpDropzone
          id="ex-receipt-dropzone"
          class="ex-dropzone"
          :class="{ 'ex-dropzone--filled': uploadedFile }"
          accept=".pdf,.png,.jpg,.jpeg"
          is-enable-input-file
          :is-loading="processingFile"
          :is-invalid="!!dropzoneError"
          :placeholder="t('Drop your file here or')"
          :description="t('Supported formats: PDF, PNG and JPG. Maximum file size 10 MB.')"
          :button-text="t('Replace your file here')"
          @change="onDropzoneFileChange"
          @clear="clearUploadedFile"
        >
          <template #loading>
            <div class="ex-dropzone-loading">
              <ErpDropzoneIcon loading />
              <h2 class="ex-dropzone-loading-title">{{ t('Processing') }}</h2>
            </div>
          </template>
        </MpDropzone>

        <p v-if="dropzoneError" class="ex-dropzone-error">{{ dropzoneError }}</p>

        <!-- Uploaded-state footer: Airene disclaimer + feedback thumbs -->
        <div v-if="uploadedFile" class="ex-airene-disclaimer">
          <p class="ex-airene-disclaimer-text">
            {{ t('Airene responses can be inaccurate or misleading.') }}
            <MpTextlink id="ne-airene-learn-more" as="a" class="ex-airene-learn-more" @click.prevent>{{ t('Learn more') }}</MpTextlink>
          </p>
          <div class="ex-airene-feedback">
            <button
              class="ex-icon-btn"
              :class="{ 'ex-icon-btn--active': autofillFeedback === 'up' }"
              :aria-label="t('Good autofill result')"
              @click="setAutofillFeedback('up')"
            ><MpIcon name="like" size="sm" /></button>
            <button
              class="ex-icon-btn"
              :class="{ 'ex-icon-btn--active': autofillFeedback === 'down' }"
              :aria-label="t('Poor autofill result')"
              @click="setAutofillFeedback('down')"
            ><MpIcon name="dislike" size="sm" /></button>
          </div>
        </div>
      </div>

      <!-- Resize divider — drag to resize the left panel (right panel absorbs the rest) -->
      <div v-if="leftPanelOpen" class="ex-divider" :aria-label="t('Resize panel')" @mousedown="startPanelResize" />

      <!-- ── Right panel: bill fields ── -->
      <div class="ex-right">

        <!-- Beneficiary + paid checkbox -->
        <div class="ex-row-1">
          <MpFormControl id="ex-beneficiary" class="ex-field-flex" is-required :is-invalid="beneficiaryError">
            <MpFormLabel>{{ t('Beneficiary') }}</MpFormLabel>
            <MpAutocomplete
              id="ex-beneficiary-ac"
              v-model="beneficiary"
              :data="beneficiaryOptions"
              label-prop="name"
              value-prop="id"
              is-searchable is-clearable use-portal is-full-width
              is-show-button-action
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
          <div class="ex-paid-check">
            <MpCheckbox id="ex-paid" :is-checked="iHavePaid" @change="iHavePaid = !iHavePaid" />
            <span>{{ t('This expense has been paid') }}</span>
          </div>
        </div>

        <!-- Transaction date -> Transaction no. -> Due date -> Reference no. -> Tag -->
        <div class="ex-grid-2 ex-section-divider">
          <MpFormControl id="ex-txdate" is-required :is-invalid="transactionDateError">
            <MpFormLabel>{{ t('Transaction date') }}</MpFormLabel>
            <div class="ex-datepicker">
              <MpDatePicker
                id="ex-txdate-dp" v-model="transactionDate" format="DD/MM/YYYY" value-type="format" use-portal
                @update:model-value="transactionDateError = false"
              />
            </div>
            <MpFormErrorMessage>{{ t('You must select transaction date') }}</MpFormErrorMessage>
          </MpFormControl>
          <MpFormControl id="ex-transno" is-required>
            <div class="ex-label-row">
              <MpFormLabel>{{ t('Transaction no.') }}</MpFormLabel>
              <button type="button" class="ex-label-icon" :aria-label="t('Transaction no. settings')" @click="noSettingsOpen = true"><MpIcon name="settings" size="sm" /></button>
            </div>
            <MpInput id="ex-transno-input" v-model="transactionNo" placeholder="Auto" is-full-width is-disabled />
          </MpFormControl>
          <!-- Due date — only relevant while the bill is still unpaid -->
          <MpFormControl v-if="!iHavePaid" id="ex-duedate" is-required :is-invalid="dueDateError">
            <MpFormLabel>{{ t('Due date') }}</MpFormLabel>
            <div class="ex-datepicker">
              <MpDatePicker
                id="ex-duedate-dp" v-model="dueDate" format="DD/MM/YYYY" value-type="format" use-portal
                @update:model-value="dueDateError = false"
              />
            </div>
            <MpFormErrorMessage>{{ t('You must select due date') }}</MpFormErrorMessage>
          </MpFormControl>
          <MpFormControl id="ex-refno">
            <MpFormLabel>{{ t('Reference no.') }}</MpFormLabel>
            <MpInput id="ex-refno-input" v-model="referenceNo" is-full-width />
          </MpFormControl>
          <MpFormControl id="ex-tags">
            <MpFormLabel>{{ t('Tag') }}</MpFormLabel>
            <MpInputTag id="ex-tags-input" :data="tags" :is-enable-create-new-tag="true" :is-show-suggestions="false" @change="onTagsChange" />
          </MpFormControl>
        </div>

        <!-- Price includes tax -->
        <div class="ex-price-includes">
          <MpCheckbox id="ex-price-incl" :is-checked="priceIncludesTax" @change="priceIncludesTax = !priceIncludesTax" />
          <span>{{ t('Price includes tax') }}</span>
        </div>

        <!-- Line items -->
        <MpBanner v-if="lineItemsHaveError" id="ex-lineitems-error-banner" variant="danger" align-items="center" class="ex-lineitems-error-banner">
          <MpBannerIcon id="ex-lineitems-error-banner-icon" />
          <MpBannerTitle>{{ t('Failed to save') }}</MpBannerTitle>
          <MpBannerDescription>{{ t('The transaction contains incomplete or invalid data. Review the highlighted fields.') }}</MpBannerDescription>
        </MpBanner>
        <div class="ex-table-section">
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
                <tr
                  v-for="(row, idx) in rows" :key="row.id" class="ex-tr"
                  :class="{ 'ex-tr--dragging': dragSrcIndex === idx, 'ex-tr--dragover': dragOverIndex === idx && dragSrcIndex !== idx }"
                  draggable="true"
                  @dragstart="onDragStart($event, idx)" @dragover="onDragOver($event, idx)" @drop="onDrop($event, idx)" @dragend="onDragEnd"
                >
                  <td class="ex-td ex-td--drag ex-td--border"><MpIcon name="drag" size="sm" /></td>
                  <td class="ex-td ex-td--input ex-td--border" :class="{ 'ex-td--error': row.accountError }">
                    <MpTooltip
                      v-if="row.accountError"
                      :id="`ex-account-tooltip-${row.id}`"
                      :label="t('You must select account')"
                      placement="top"
                      use-portal
                      class="ex-error-tooltip-wrap"
                    >
                      <MpAutocomplete
                        :id="`ex-account-${row.id}`" v-model="row.accountId" :data="ACCOUNT_OPTIONS"
                        label-prop="name" value-prop="id" is-searchable is-clearable use-portal is-full-width
                        :placeholder="t('Select account')"
                        @update:model-value="onAccountSelect(row)"
                      />
                    </MpTooltip>
                    <MpAutocomplete
                      v-else
                      :id="`ex-account-${row.id}`" v-model="row.accountId" :data="ACCOUNT_OPTIONS"
                      label-prop="name" value-prop="id" is-searchable is-clearable use-portal is-full-width
                      :placeholder="t('Select account')"
                      @update:model-value="onAccountSelect(row)"
                    />
                  </td>
                  <template v-if="row.revealed">
                    <td class="ex-td ex-td--input ex-td--border">
                      <MpInput :id="`ex-desc-${row.id}`" v-model="row.description" is-full-width />
                    </td>
                    <td class="ex-td ex-td--input ex-td--border">
                      <MpAutocomplete
                        :id="`ex-tax-${row.id}`" v-model="row.taxId" :data="TAX_OPTIONS"
                        label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                        :placeholder="t('Select tax')"
                      />
                    </td>
                    <td class="ex-td ex-td--input ex-td--border ex-td--amount" :class="{ 'ex-td--error': row.amountError }">
                      <MpTooltip
                        v-if="row.amountError"
                        :id="`ex-amount-tooltip-${row.id}`"
                        :label="t('Amount must be more than 0')"
                        placement="top"
                        use-portal
                        class="ex-error-tooltip-wrap"
                      >
                        <div class="ex-amount-cell">
                          <span class="ex-amount-prefix">Rp</span>
                          <MpInput
                            :id="`ex-amount-${row.id}`" v-model="row.amount" type="number" is-full-width class="ex-amount-input"
                            :is-invalid="row.amountError" @update:model-value="row.amountError = false"
                          />
                        </div>
                      </MpTooltip>
                      <div v-else class="ex-amount-cell">
                        <span class="ex-amount-prefix">Rp</span>
                        <MpInput
                          :id="`ex-amount-${row.id}`" v-model="row.amount" type="number" is-full-width class="ex-amount-input"
                          :is-invalid="row.amountError" @update:model-value="row.amountError = false"
                        />
                      </div>
                    </td>
                    <td class="ex-td ex-td--del">
                      <MpButton class="ex-del-btn" @click="removeRow(row.id)">
                        <MpIcon name="minus-circular" size="sm" />
                      </MpButton>
                    </td>
                  </template>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Memo/Attachment + Totals — inline when the panel is wide enough, stacked otherwise
             (same container-query rule as BillDetailsPage's .detail-notes) -->
        <div class="ex-notes">
          <div class="ex-notes-left">
            <!-- Memo -->
            <div class="ex-section ex-memo-section">
              <MpFormControl id="ex-memo">
                <MpFormLabel>{{ t('Memo') }}</MpFormLabel>
                <MpTextarea id="ex-memo-textarea" v-model="memo" is-full-width :rows="4" />
              </MpFormControl>
              <p class="ex-helper-text">{{ t('Only visible to you and your team') }}</p>
            </div>

            <!-- Attachment -->
            <div class="ex-section ex-attachment-section">
              <div class="ex-section-label-row">
                <div class="ex-section-label">{{ t('Attachment') }}</div>
              </div>
              <div class="ex-attachment">
                <MpUpload
                  id="ex-attachment-upload"
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
                <MpUploadList
                  v-for="f in formAttachedFiles" :key="f.name"
                  :id="`ex-attachment-file-${f.name}`"
                  :title="f.name" status="success" :subtitle="t('Uploaded')"
                  :icon-name="fileIconName(f.name)"
                  is-show-remove-button
                  @remove="removeFormFile(f.name)"
                />
              </div>
            </div>
          </div>

          <!-- Totals -->
          <div class="ex-totals">
            <div class="ex-total-row">
              <span class="ex-total-label">{{ t('Subtotal') }}</span>
              <span class="ex-total-amt">{{ formatIDR(subtotal) }}</span>
            </div>
            <div v-if="hasPpnTax" class="ex-total-row">
              <span class="ex-total-label">PPN 10%</span>
              <span class="ex-total-amt">{{ formatIDR(ppnAmount) }}</span>
            </div>
            <div class="ex-total-rule" />
            <div class="ex-total-row">
              <span class="ex-total-label ex-total-label--strong">{{ t('Total') }}</span>
              <span class="ex-total-amt ex-total-amt--strong">{{ formatIDR(total) }}</span>
            </div>

            <div class="ex-withholding-check">
              <MpCheckbox id="ex-less-wht" :is-checked="lessWithholding" @change="lessWithholding = !lessWithholding" />
              <span>{{ t('Less: Withholding tax') }}</span>
            </div>

            <!-- Withholding detail rows — only when checked -->
            <div v-if="lessWithholding" class="ex-withholding-rows">
              <div v-for="(wh, idx) in withholdingRows" :key="wh.id" class="ex-withholding-row">
                <div class="ex-withholding-toprow">
                  <MpFormControl :id="`ex-wh-name-${wh.id}`" is-required :is-invalid="wh.nameError">
                    <MpFormLabel>{{ t('Name') }}</MpFormLabel>
                    <MpInput
                      :id="`ex-wh-name-input-${wh.id}`" v-model="wh.name" is-full-width
                      :is-invalid="wh.nameError" @update:model-value="wh.nameError = false"
                    />
                    <MpFormErrorMessage>{{ t('You must fill in name') }}</MpFormErrorMessage>
                  </MpFormControl>
                  <MpFormControl :id="`ex-wh-amount-${wh.id}`" is-required :is-invalid="wh.amountError">
                    <MpFormLabel>{{ t('Amount') }}</MpFormLabel>
                    <MpInputGroup :id="`ex-wh-amount-group-${wh.id}`">
                      <MpInputLeftAddon has-background class="ex-wh-unit-addon">
                        <MpPopover :id="`ex-wh-unit-${wh.id}`" is-close-on-select placement="bottom-start" use-portal :is-keep-alive="false">
                          <MpPopoverTrigger>
                            <MpButton class="ex-wh-unit-trigger">
                              <span>{{ wh.unit }}</span>
                              <MpIcon name="chevrons-down" size="sm" />
                            </MpButton>
                          </MpPopoverTrigger>
                          <MpPopoverContent :class="css({ minWidth: '64px', width: 'max-content' })">
                            <MpPopoverList>
                              <MpPopoverListItem :is-active="wh.unit === 'Rp'" @click="wh.unit = 'Rp'">Rp</MpPopoverListItem>
                              <MpPopoverListItem :is-active="wh.unit === '%'" @click="wh.unit = '%'">%</MpPopoverListItem>
                            </MpPopoverList>
                          </MpPopoverContent>
                        </MpPopover>
                      </MpInputLeftAddon>
                      <MpInput
                        :id="`ex-wh-amount-input-${wh.id}`" v-model="wh.amount" type="number" is-full-width
                        :is-invalid="wh.amountError" @update:model-value="wh.amountError = false"
                      />
                    </MpInputGroup>
                    <MpFormErrorMessage>{{ t('You must fill in amount') }}</MpFormErrorMessage>
                  </MpFormControl>
                </div>
                <MpFormControl :id="`ex-wh-account-${wh.id}`" is-required :is-invalid="wh.accountError" class="ex-wh-account">
                  <MpFormLabel>{{ t('Account') }}</MpFormLabel>
                  <div class="ex-wh-account-row">
                    <MpAutocomplete
                      :id="`ex-wh-account-ac-${wh.id}`" v-model="wh.accountId" :data="BANK_ACCOUNT_OPTIONS"
                      label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                      :is-invalid="wh.accountError" @update:model-value="wh.accountError = false"
                    />
                    <MpButton v-if="withholdingRows.length > 1" class="ex-del-btn" @click="removeWithholdingRow(wh.id)">
                      <MpIcon name="minus-circular" size="sm" />
                    </MpButton>
                  </div>
                  <MpFormErrorMessage>{{ t('You must select account') }}</MpFormErrorMessage>
                </MpFormControl>
              </div>
              <MpButton variant="textLink" size="sm" left-icon="add" @click="addWithholdingRow">{{ t('Add withholding') }}</MpButton>
            </div>

            <div v-if="lessWithholding" class="ex-total-rule" />
            <div v-if="lessWithholding" class="ex-total-row">
              <span class="ex-total-label ex-total-label--strong">{{ t('Total') }}</span>
              <span class="ex-total-amt ex-total-amt--strong">{{ formatIDR(finalTotal) }}</span>
            </div>
          </div>
        </div>

        <!-- Payment — only when the bill is marked as paid -->
        <div v-if="iHavePaid" class="ex-section ex-payment-section">
          <MpTabs id="ex-payment-tabs" :default-value="0" variant-color="blue">
            <MpTabList>
              <MpTab value="payment">{{ t('Payment') }}</MpTab>
            </MpTabList>
            <MpTabPanels>
              <MpTabPanel value="payment">
                <h3 class="ex-payment-details-title">{{ t('Payment details') }}</h3>
                <div class="ex-table-section">
                  <div class="ex-table-scroll">
                    <table class="ex-table">
                      <colgroup>
                        <col />
                        <col />
                        <col />
                        <col />
                      </colgroup>
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
                              v-if="paymentAccountError"
                              id="ex-pay-account-tooltip"
                              :label="t('You must select account')"
                              placement="top"
                              use-portal
                              class="ex-error-tooltip-wrap"
                            >
                              <MpAutocomplete
                                id="ex-pay-account-ac" v-model="paymentAccountId" :data="BANK_ACCOUNT_OPTIONS"
                                label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                                :placeholder="t('Select account')"
                                @update:model-value="paymentAccountError = false"
                              />
                            </MpTooltip>
                            <MpAutocomplete
                              v-else
                              id="ex-pay-account-ac" v-model="paymentAccountId" :data="BANK_ACCOUNT_OPTIONS"
                              label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                              :placeholder="t('Select account')"
                              @update:model-value="paymentAccountError = false"
                            />
                          </td>
                          <td class="ex-td ex-td--input ex-td--border ex-td--amount" :class="{ 'ex-td--error': amountPaidError }">
                            <MpTooltip
                              v-if="amountPaidError"
                              id="ex-pay-amount-tooltip"
                              :label="t('Amount must be more than 0')"
                              placement="top"
                              use-portal
                              class="ex-error-tooltip-wrap"
                            >
                              <div class="ex-amount-cell">
                                <span class="ex-amount-prefix">Rp</span>
                                <MpInput
                                  id="ex-pay-amount-input" v-model="amountPaid" type="number" is-full-width class="ex-amount-input"
                                  :is-invalid="amountPaidError"
                                  @update:model-value="amountPaidTouched = true; amountPaidError = false"
                                />
                              </div>
                            </MpTooltip>
                            <div v-else class="ex-amount-cell">
                              <span class="ex-amount-prefix">Rp</span>
                              <MpInput
                                id="ex-pay-amount-input" v-model="amountPaid" type="number" is-full-width class="ex-amount-input"
                                :is-invalid="amountPaidError"
                                @update:model-value="amountPaidTouched = true; amountPaidError = false"
                              />
                            </div>
                          </td>
                          <td class="ex-td ex-td--input ex-td--border">
                            <div class="ex-datepicker">
                              <MpDatePicker id="ex-pay-date-dp" v-model="paymentDate" format="DD/MM/YYYY" value-type="format" use-portal />
                            </div>
                          </td>
                          <td class="ex-td ex-td--input">
                            <MpInput id="ex-pay-ref-input" v-model="paymentReference" is-full-width />
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

        <!-- Footer actions -->
        <footer class="ex-footer">
          <button class="btn-enterprise btn-enterprise--ghost" @click="goExpenses">{{ t('Cancel') }}</button>
          <template v-if="isEdit">
            <button class="btn-enterprise btn-enterprise--primary" @click="handleSave('close')">{{ t('Save changes') }}</button>
          </template>
          <template v-else>
            <button class="btn-enterprise btn-enterprise--secondary" @click="handleSave('close')">{{ t('Save & close') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" @click="handleSave('new')">{{ t('Save & create another') }}</button>
          </template>
        </footer>
      </div>
    </div>

    <NumberFormatSettingsModal
      v-model:open="noSettingsOpen"
      :title="t('Transaction no. settings')"
      :caption="t('Transaction numbers are auto-generated by the system.')"
      :next-number="nextTxNo"
      :existing-formats="txNoFormats"
      @save="onNoFormatSave"
    />
  </div>
</template>

<style scoped>
/* ── Page shell — canonical detail pattern ──────────────────────────────────── */
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
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  /* --mp-line-heights-2xl resolves to a unitless 1.67 in this app (not a px value), which
     computes to 40px on a 24px title — taller than intended and reads as a gap above the
     breadcrumb. Hardcode the real 32px instead of trusting the var/fallback. */
  line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}

/* ── Two-panel stage ──────────────────────────────────────────────────────────
   Zero padding, zero gap between panels. Rounded top corners clip both panels. */
.ex-stage {
  flex: 1; min-height: 0; display: flex; position: relative;
  background: var(--mp-colors-gray-50, #EFF1F1); border-radius: 12px 12px 0 0; overflow: hidden;
}

/* ── Left panel — no background, 24px left / 12px right (divider gap) / 12px top-bottom padding, full height ── */
.ex-left {
  flex-shrink: 0; overflow: hidden;
  padding: var(--mp-spacing-3, 12px) var(--mp-spacing-3, 12px) var(--mp-spacing-8, 32px) var(--mp-spacing-6, 24px);
  display: flex; flex-direction: column; min-height: 0;
  opacity: 1;
  transition: width 0.22s ease, padding 0.22s ease, opacity 0.16s ease;
}
.ex-left--closed {
  padding-left: 0; padding-right: 0;
  opacity: 0; pointer-events: none;
}
.ex-left-header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 32px; margin-bottom: 8px; }
.ex-left-header-title { display: flex; align-items: center; gap: 4px; }
.ex-left-header-heading {
  margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

/* ── Docked rail — narrow icon-only strip replacing the panel after a non-suppressed close ── */
.ex-docked-rail {
  flex-shrink: 0; width: fit-content; align-self: stretch;
  display: flex; flex-direction: column; align-items: flex-start;
  gap: var(--mp-spacing-2, 8px); padding: 12px 12px 24px;
}
.ex-docked-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  padding: var(--mp-spacing-2, 8px) !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-md, 6px) !important;
  cursor: pointer;
}
.ex-docked-btn:hover { background: var(--mp-background-neutral-hovered) !important; }

.ex-dock-fade-enter-active, .ex-dock-fade-leave-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.ex-dock-fade-enter-from, .ex-dock-fade-leave-to { opacity: 0; transform: translateX(-4px); }

/* ── Resize divider — drag to resize the left panel ── */
.ex-divider {
  flex-shrink: 0; width: var(--mp-spacing-3); cursor: col-resize; z-index: 10;
  display: flex; align-items: center; justify-content: center;
}
.ex-divider::after { content: ''; display: block; width: 2px; height: var(--mp-spacing-10, 40px); background: var(--mp-border-default); border-radius: var(--mp-radii-full); }
.ex-divider:hover::after { background: var(--mp-border-bold, #758195); }
.ex-icon-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px) !important; height: var(--mp-sizes-8, 32px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-sm) !important;
  color: var(--mp-text-secondary); cursor: pointer;
}
.ex-icon-btn:hover { background: var(--mp-background-neutral-hovered) !important; color: var(--mp-text-default); }
.ex-icon-btn--active,
.ex-icon-btn--active:hover { background: var(--mp-background-neutral-hovered) !important; color: var(--mp-text-link, #2563eb); }
.ex-file-controls { display: flex; align-items: center; gap: 8px; }

/* Uploaded-state header: file-type icon + filename/size stack (mirrors OCR Figma header) */
.ex-file-meta { display: flex; align-items: center; gap: 8px; min-width: 0; }
.ex-file-meta-icon { flex-shrink: 0; color: var(--mp-text-subtle); }
.ex-file-meta-text { display: flex; flex-direction: column; min-width: 0; }
.ex-file-name {
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-medium, 500);
  color: var(--mp-text-default); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ex-file-size { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* Fit / 100% zoom pill (hand-rolled per the (E)/enterprise-token convention) */
.ex-zoom-toggle {
  display: flex; align-items: center; gap: 4px; flex-shrink: 0;
  padding: var(--mp-spacing-1, 4px); border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral, #fff);
  border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16));
}
.ex-zoom-part {
  border: none; background: none; cursor: pointer;
  padding: var(--mp-spacing-1, 4px) var(--mp-spacing-2, 8px); border-radius: var(--mp-radii-full, 999px);
  font: inherit; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md, 20px);
  color: var(--mp-text-secondary);
}
.ex-zoom-part--active {
  background: var(--mp-background-neutral-subtle-selected, #dcdfe4);
  color: var(--mp-text-secondary-pressed, #4c5460);
}

/* Uploaded-state footer: Airene disclaimer + feedback thumbs (pinned to panel bottom) */
.ex-airene-disclaimer {
  flex-shrink: 0; margin-top: auto; padding-top: 16px;
  display: flex; align-items: flex-start; gap: 8px;
}
.ex-airene-disclaimer-text {
  flex: 1; min-width: 0; margin: 0;
  font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-text-secondary);
}
.ex-airene-learn-more {
  background: none; border: none; padding: 0; cursor: pointer;
  font: inherit; text-decoration: underline; text-underline-offset: 2px;
  color: var(--mp-text-link, #2563eb);
}
.ex-airene-feedback { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }

.ex-dropzone {
  flex: 1; min-height: 0; cursor: pointer;
}
/* MpDropzone draws its own border/background on the inner wrapper — style that
   instead of the root, so there's only one dashed outline and no default white fill.
   Default state: no fill, 1px dashed border-default. 40px padding keeps the content
   clear of the dashed line on every side. */
.ex-dropzone :deep(.mp-dropzone__wrapper) {
  border: 1px dashed var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-md, 6px);
  background: transparent;
  padding: var(--mp-sizes-10, 40px);
  gap: var(--mp-spacing-3);
  transition: border-color 0.1s, background 0.1s;
}
/* Focus state (Figma merges hover + click/keyboard focus into one): pale hovered
   fill + green selected border, matching the primary-action emerald. Our static
   border above wins over Pixel's own state rules (scoped-attribute specificity),
   so restate hover/focus here. */
.ex-dropzone :deep(.mp-dropzone__wrapper:hover),
.ex-dropzone :deep(.mp-dropzone__wrapper:focus),
.ex-dropzone :deep(.mp-dropzone__wrapper:focus-within) {
  border-color: var(--mp-border-selected, #029861);
  background: var(--mp-background-neutral-hovered, #f8f9f9);
  outline: none;
}
/* Invalid state (too many files / wrong type / over 10 MB) — same red convention as
   every other Pixel form field in erp.css. Comes after hover/focus so it wins. */
.ex-dropzone :deep(.mp-dropzone__wrapper[data-invalid]) {
  border-color: var(--mp-colors-red-400, #e2483d);
  background: var(--mp-background-neutral, #fff);
}
/* Center the idle description (MpDropzone left-aligns it by default). */
.ex-dropzone :deep(.mp-dropzone__wrapper p.mp-text--weight_regular) { text-align: center; }
.ex-dropzone :deep(.mp-dropzone__wrapper) { align-items: center; justify-content: center; }
.ex-dropzone-thumb-img { width: 125px; height: auto; }

/* Standard dropzone idle copy (shared look with ErpDropzone). */
.ex-dropzone-cta { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); text-align: center; }
.ex-dropzone-choose { font-weight: var(--mp-font-weights-semi-bold, 600); }
.ex-dropzone-hints { display: flex; flex-direction: column; gap: 2px; }
.ex-dropzone-hint { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); text-align: center; }

/* Uploading state — loader wrapped in a neutral-subtle circle, 24px above the title. */
.ex-dropzone-loading { display: flex; flex-direction: column; align-items: center; gap: 24px; }
.ex-dropzone-loader {
  display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-20, 80px); height: var(--mp-sizes-20, 80px); padding: var(--mp-spacing-4, 16px);
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  color: var(--mp-icon-default, #536062);
}
/* Size the whole spinner up (root + icon) so the built-in spin animation — which
   runs on the MpSpinner root, not the icon — keeps pivoting from its own centre. */
.ex-dropzone-loader :deep([data-pixel-component="MpSpinner"]),
.ex-dropzone-loader :deep(.mp-icon) { width: 48px; height: 48px; }
.ex-dropzone-loading-title {
  margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

/* Uploaded/preview state (ex-dropzone--filled is bound once a file is set) — image
   sits top-aligned, full width edge-to-edge, and the frame hugs the image height
   (no dashed border, no white fill, no padding gap). */
/* Pixel's .mp-dropzone__root is height:100% — override to auto so the root (not just
   the wrapper) hugs the image, leaving room for the disclaimer to pin to the bottom. */
.ex-dropzone--filled { flex: 0 0 auto; height: auto; }
.ex-dropzone--filled :deep(.mp-dropzone__wrapper) {
  border-style: solid;
  background: transparent;
  padding: 0;
  overflow: visible;
  height: auto;
}
/* Pixel's recipe stretches the preview to height:100%; override to auto so the frame
   hugs the image instead of filling the panel. */
.ex-dropzone--filled :deep(.mp-dropzone__preview) {
  align-items: flex-start; justify-content: flex-start;
  width: 100%; height: auto;
}
.ex-dropzone--filled :deep(.mp-dropzone__preview img) {
  width: 100% !important;
  height: auto !important;
  object-fit: contain !important;
}
/* Hover overlay ("Replace your file here") uses the same scrim colour as a modal
   overlay, not Pixel's dropzone default. */
.ex-dropzone :deep(.mp-dropzone__overlayPreview) {
  background: var(--mp-colors-overlay, rgba(34, 34, 34, 0.8));
}

.ex-dropzone-title {
  margin: 0;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); text-align: center;
}
.ex-dropzone-desc { margin: 0; max-width: 320px; text-align: center; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.ex-dropzone-browse {
  background: none; border: none; padding: 0; margin: 0; cursor: pointer;
  font: inherit; font-weight: inherit;
  color: var(--mp-text-link, #2563eb);
}
.ex-dropzone-browse:hover { text-decoration: underline; text-underline-offset: 2px; }

/* Same red convention as MpFormErrorMessage elsewhere in this form. */
.ex-dropzone-error {
  flex-shrink: 0; margin: 8px 0 0; font-size: 12px;
  color: var(--mp-text-danger, #a8352d);
}

/* ── Right panel — rounded left corners, neutral bg, 24px padding, scrollable ── */
.ex-right {
  --ex-field-width: 318px;
  flex: 1; min-width: 0; overflow-y: auto;
  background: var(--mp-background-neutral, white);
  border-radius: 12px 0 0 12px;
  padding: var(--mp-spacing-6, 24px);
  container-type: inline-size;
}

/* Fields keep a fixed comfortable width regardless of whether the receipt panel is
   open or closed — they wrap onto new rows as space allows instead of stretching
   narrower/wider with the container. Beneficiary matches the same fixed field width
   pixel-for-pixel (e.g. Transaction date) — no calc()/ratio guesswork. */
.ex-row-1 { display: flex; align-items: flex-start; flex-wrap: wrap; gap: 16px 24px; }
.ex-field-flex { flex: 0 0 var(--ex-field-width); min-width: 0; }
/* No gap here — MpCheckbox already renders its own 12px control-to-label gap
   internally (checkbox__root). A wrapper gap would stack into a double gap.
   margin-top offsets past the label (its height + the label-to-input gap, both
   fixed regardless of field state) so the checkbox centers against the input
   box itself — not the field's bottom, which shifts when an error message
   appears below the input. */
.ex-paid-check { display: flex; align-items: center; gap: 0; margin-top: var(--mp-spacing-6, 24px); height: 38px; white-space: nowrap; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.ex-grid-2 {
  display: grid; grid-template-columns: repeat(auto-fill, var(--ex-field-width));
  justify-content: flex-start; gap: 16px 24px; padding: 20px 0;
}
.ex-section-divider { border-bottom: 1px dashed var(--mp-border-default); }
.ex-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.ex-label-icon { display: flex; align-items: center; color: var(--mp-text-secondary); cursor: pointer; }
.ex-datepicker { width: 100%; }
.ex-datepicker :deep(.mp-datepicker__root) { width: 100%; }

.ex-price-includes { display: flex; align-items: center; gap: 0; justify-content: flex-end; padding-top: var(--mp-spacing-5, 20px); margin-bottom: var(--mp-spacing-3, 12px); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

/* ── Line items table ─────────────────────────────────────────────────────── */
.ex-lineitems-error-banner { margin-bottom: var(--mp-spacing-5, 20px); }
.ex-table-section { overflow-x: auto; border-bottom: 1px solid var(--mp-border-default); }
.ex-table-scroll { overflow-x: auto; }
.ex-table { width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0; border-radius: 0; }
.ex-col-drag { width: 44px; }
.ex-col-account { width: 240px; }
.ex-col-desc { width: auto; }
.ex-col-tax { width: 140px; }
.ex-col-amount { width: 280px; }
.ex-col-del { width: 44px; }

/* Matches the ERP index table's .erp-th pattern: uppercase, semi-bold, no vertical dividers. */
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
  border-bottom: 1px solid var(--mp-border-default);
  vertical-align: middle;
}
.ex-tr:last-child .ex-td { border-bottom: none; }
.ex-tr--dragging { opacity: 0.4; }
.ex-tr--dragover > .ex-td { border-top: 2px solid var(--mp-border-focused, #2563eb); }
.ex-td--drag { padding: 0; text-align: center; vertical-align: middle; color: var(--mp-text-placeholder); cursor: grab; }
.ex-tr--dragging .ex-td--drag { cursor: grabbing; }
.ex-td--input { padding: 0; vertical-align: middle; }
.ex-td--input :deep([class*='input']), .ex-td--input :deep([class*='autocomplete']), .ex-td--input :deep([class*='datepicker']) { border-radius: 0; border-color: transparent; }
.ex-td--input .ex-datepicker { width: 100%; }
.ex-td--input:focus-within { box-shadow: inset 0 0 0 2px var(--mp-border-focused, #2563eb); }
.ex-td--del { padding: 0; text-align: center; vertical-align: middle; }
.ex-td--border { border-right: 1px solid var(--mp-border-default); }

/* Line-item validation — same red convention as CreateReceiptPage's cr-td--prod-error/cr-td--qty-error. */
.ex-td--error { background: var(--mp-background-danger-subtle, #fef2f2); box-shadow: inset 0 -1px 0 0 var(--mp-border-danger, #dc2626); }
.ex-td--error :deep([class*='autocomplete']),
.ex-td--error :deep([class*='input']) { background: transparent; }
.ex-error-tooltip-wrap { display: block; width: 100%; }
.ex-error-tooltip-wrap :deep([class*='tooltip__trigger']) { display: block; width: 100%; }

/* Line items table: left-aligned container, right-side-only column dividers
   instead of row-separator borders. */
.ex-lineitems-table { min-width: 764px; margin-right: auto; }
.ex-lineitems-table .ex-td { height: var(--mp-sizes-10, 40px); vertical-align: middle; border-bottom: 1px solid var(--mp-border-default); }
.ex-lineitems-table .ex-td--amount { padding: 0; }

.ex-amount-cell { display: flex; align-items: stretch; height: 100%; min-height: var(--mp-sizes-10, 40px); }
.ex-amount-prefix {
  flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  padding: 0 var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
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
.ex-del-btn:hover { background: var(--mp-background-neutral) !important; color: var(--mp-text-danger, #dc2626); }

/* ── Memo/Attachment + Totals — inline when the panel is wide enough, stacked otherwise.
   Widths are spec'd at a 1440px screen (Memo 432px, Attachment matches the Beneficiary
   field's existing width, Totals 428px) and made fluid via `cqw` (relative to .ex-right's
   own container-type: inline-size) so they scale down proportionally on a narrower panel
   instead of staying pinned to those px values. 1440px reference right-panel content width
   measured at ~1321px, so 432px = 32.7cqw and 428px = 32.4cqw. ── */
.ex-notes { display: flex; flex-direction: column; gap: var(--mp-spacing-6); }
/* Stacked: Totals on top, Memo/Attachment below (order flips DOM order without changing tab order) */
.ex-notes-left { display: flex; flex-direction: column; flex-shrink: 0; order: 2; }
.ex-memo-section { width: clamp(318px, 32.7cqw, 432px); flex-shrink: 0; }
.ex-attachment-section { width: 318px; flex-shrink: 0; }
/* .ex-section (below) sets gap: spacing-2 with equal specificity but later source order,
   so it would win over a plain .ex-attachment-section override — combine both classes instead. */
.ex-section.ex-attachment-section { gap: var(--mp-spacing-1, 4px); }
.ex-attachment-section .ex-section-label-row { margin-bottom: 0; }
.ex-totals { order: 1; }
@container (min-width: 650px) {
  /* Inline: Memo/Attachment flush left, Totals flush right — neither block stretches,
     the leftover container space becomes the gap between them. */
  .ex-notes { flex-direction: row; justify-content: space-between; align-items: flex-start; }
  .ex-notes-left { order: 1; }
  .ex-totals { order: 2; }
}

/* ── Totals ───────────────────────────────────────────────────────────────── */
.ex-totals { display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding: var(--mp-spacing-4) 0; width: min(428px, 32.4cqw); }
.ex-total-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-4); }
.ex-total-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.ex-total-amt { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
.ex-total-label--strong, .ex-total-amt--strong { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ex-total-rule { border-top: 1px solid var(--mp-border-default); }

.ex-withholding-check { display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.ex-withholding-rows { display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding: var(--mp-spacing-2) 0; }
.ex-withholding-row { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.ex-withholding-toprow { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.ex-wh-account-row { display: flex; align-items: center; gap: 4px; }
.ex-wh-account { min-width: 0; }
.ex-wh-unit-addon :deep(.mp-input-addon__root) { padding: 0; background: var(--mp-background-neutral-subtle); border-radius: var(--mp-radii-md); }
.ex-wh-unit-trigger {
  display: flex !important; align-items: center; gap: 4px;
  padding: var(--mp-spacing-1\.5, 6px) !important;
  min-width: 0 !important;
  background: none !important;
  border: none !important;
  cursor: pointer;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  border-radius: var(--mp-radii-md) !important;
}
.ex-wh-unit-trigger:hover { background: var(--mp-background-neutral-hovered) !important; }
.ex-wh-unit-trigger :deep(svg) { width: 16px; height: 16px; flex-shrink: 0; }

/* ── Memo / Attachment ────────────────────────────────────────────────────── */
.ex-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); max-width: 440px; padding: var(--mp-spacing-4) 0; }
.ex-section-label-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-1); }
.ex-section-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ex-helper-text { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm); }

.ex-attachment { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
/* Empty-state label ("or drag and drop here") is colored via an inline --mp-text-color
   custom property set by MpText itself, which only an !important author rule can beat. */
.ex-attachment-upload :deep(p[data-pixel-component="MpText"]) {
  color: var(--mp-text-placeholder, #6e7a7c) !important;
}
/* --mp-colors-border-focused is the real (Enterprise-theme-aware) focus token —
   resolves to green (#41C6A0) in this app's theme. The shorthand alias
   --mp-border-focused used elsewhere in this file doesn't actually exist/resolve,
   so any fallback hardcoded on it (e.g. blue) silently wins instead. */
.ex-attachment-upload--dragover { border-color: var(--mp-colors-border-focused, #41c6a0) !important; }

/* ── Payment ──────────────────────────────────────────────────────────────── */
.ex-payment-section { max-width: none; padding-top: var(--mp-spacing-6); }
/* "Payment details" heading above the payment table — 14px/semibold, 8px to table. */
.ex-payment-details-title { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
/* MpTabList ships a fixed 24px margin-bottom below the tab row — trim to the 20px spec. */
.ex-payment-section :deep(.mp-tab-list__list) { margin-bottom: 20px; }
/* Our build's static Panda scan never emitted MpTabSelectedBorder's base position/size
   rule, nor its nextTheme:mp-bg_border.selected color utility (unlike the parent MpTab's
   own text-color utility, which did get emitted) — so the selected-tab underline renders
   0x0 and transparent. Values match Pixel's own documented CSS and the same
   --mp-colors-border-selected token the tab's variant-color="blue" already resolves to. */
.ex-payment-section :deep(.mp-tab-selected-border) {
  position: absolute;
  bottom: -2px;
  width: calc(100% - 8px);
  height: var(--mp-sizes-0\.5, 2px);
  background: var(--mp-colors-border-selected, #029861);
}

/* ── Footer ───────────────────────────────────────────────────────────────── */
.ex-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding-top: var(--mp-spacing-6); }

</style>
