<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import {
  MpButton, MpCheckbox, MpInput, MpInputGroup, MpInputLeftAddon, MpTextarea, MpAutocomplete, MpDatePicker,
  MpInputTag, MpIcon, MpUpload, MpUploadList, MpDropzone, MpSpinner, toast,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel,
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
  type DataInterface,
} from '@mekari/pixel3'
import { VENDORS } from '~/data/master'
import { addBill } from '~/data/bills'

const router = useRouter()

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
const ACCOUNT_OPTIONS = [
  { id: '485', name: '485 - Subscriptions' },
  { id: '520', name: '520 - Office supplies' },
  { id: '540', name: '540 - Travel' },
  { id: '610', name: '610 - Utilities' },
  { id: '710', name: '710 - Equipment' },
  { id: '810', name: '810 - Marketing' },
]
const TAX_OPTIONS = [
  { id: 'ppn10', name: 'PPN 10%' },
  { id: 'none', name: 'No tax' },
]
const BANK_ACCOUNT_OPTIONS = [
  { id: '1-10003', name: '1-10003 Bank BCA' },
  { id: '1-10004', name: '1-10004 VISA 8265' },
]

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

const transactionDate = ref(todayDisplay)
const transactionNo = ref('')
const referenceNo = ref('')
const tags = ref<DataInterface[]>([])
function onTagsChange(data: DataInterface[]) { tags.value = data }

const priceIncludesTax = ref(false)

// ── Line items ───────────────────────────────────────────────────────────────
interface LineRow {
  id: number
  accountId: string
  description: string
  taxId: string
  amount: string
  amountError: boolean
}
let rowSeq = 0
function makeRow(): LineRow {
  return { id: rowSeq++, accountId: '', description: '', taxId: '', amount: '', amountError: false }
}
const rows = ref<LineRow[]>([makeRow()])

function onAccountSelect(row: LineRow) {
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
function formatIDR(amount: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2 }).format(amount)
}

const subtotal = computed(() => rows.value.reduce((s, r) => s + (Number(r.amount) || 0), 0))
const taxableSubtotal = computed(() => rows.value.filter((r) => r.taxId === 'ppn10').reduce((s, r) => s + (Number(r.amount) || 0), 0))
const hasPpnTax = computed(() => taxableSubtotal.value > 0)
const ppnAmount = computed(() => (priceIncludesTax.value ? 0 : Math.round(taxableSubtotal.value * 0.1)))
const total = computed(() => subtotal.value + ppnAmount.value)

// ── Withholding ──────────────────────────────────────────────────────────────
interface WithholdingRow {
  id: number
  name: string
  amount: string
  unit: 'Rp' | '%'
  accountId: string
}
let whSeq = 0
function makeWithholdingRow(): WithholdingRow {
  return { id: whSeq++, name: whSeq === 1 ? 'Withholding tax' : '', amount: '', unit: 'Rp', accountId: '' }
}
const lessWithholding = ref(false)
const withholdingRows = ref<WithholdingRow[]>([makeWithholdingRow()])
function addWithholdingRow() { withholdingRows.value.push(makeWithholdingRow()) }
function removeWithholdingRow(id: number) {
  if (withholdingRows.value.length === 1) return
  withholdingRows.value = withholdingRows.value.filter((r) => r.id !== id)
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
const paymentDate = ref(todayDisplay)
const paymentReference = ref('')
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
const leftPanelOpen = ref(true)
// Narrow icon rail shown after a close the user didn't permanently suppress —
// keeps a one-click way back into the receipt panel instead of hiding it outright.
const leftPanelDocked = ref(false)
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
    return 'File type not supported. Please upload a PDF, PNG, or JPG file.'
  }
  if (file.size > DROPZONE_MAX_SIZE) {
    return 'File size exceeds the 10 MB limit.'
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
    dropzoneError.value = 'Please upload only 1 file at a time.'
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

// Close the left panel — confirms only the first time it's closed this session.
// The inline "Try autofill" link (next to the Attachment label) only appears once
// autofill has been permanently turned off — it's the replacement affordance for
// reopening the panel once the confirm dialog stops showing.
const showCloseConfirm = ref(false)
const showTurnOffConfirm = ref(false)
const closeConfirmShown = ref(false) // has the close-confirm modal been shown at least once this session
const autofillOff = ref(false) // permanently dismissed for this session — no more docked rail, no more confirm modal

function closePanel() {
  leftPanelOpen.value = false
  leftPanelDocked.value = !autofillOff.value
}
function requestClosePanel() {
  if (closeConfirmShown.value) {
    closePanel()
    return
  }
  showCloseConfirm.value = true
}
function closePanelKeepAsking() {
  closeConfirmShown.value = true
  showCloseConfirm.value = false
  closePanel()
}
function closePanelDontShowAgain() {
  closeConfirmShown.value = true
  autofillOff.value = true
  showCloseConfirm.value = false
  closePanel()
}
function requestTurnOffAutofill() {
  showTurnOffConfirm.value = true
}
function confirmTurnOffAutofill() {
  closeConfirmShown.value = true
  autofillOff.value = true
  showTurnOffConfirm.value = false
  closePanel()
}
function undockPanel() {
  leftPanelDocked.value = false
  leftPanelOpen.value = true
}
function reopenAutofillPanel() {
  leftPanelOpen.value = true
  leftPanelDocked.value = false
}

// ── Save ─────────────────────────────────────────────────────────────────────
function handleSave(mode: 'close' | 'new') {
  if (!beneficiary.value) { beneficiaryError.value = true; return }

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
    account: ACCOUNT_OPTIONS.find((a) => a.id === r.accountId)?.name ?? r.accountId,
    description: r.description,
    tax: TAX_OPTIONS.find((t) => t.id === r.taxId)?.name ?? '—',
    amount: Number(r.amount) || 0,
  }))

  addBill({
    beneficiary: { id: beneficiary.value, name: beneficiary.value },
    category: ACCOUNT_OPTIONS.find((a) => a.id === rows.value[0]?.accountId)?.name ?? 'Uncategorized',
    date: toISODate(transactionDate.value),
    dueDate: toISODate(iHavePaid.value ? transactionDate.value : dueDate.value),
    total: finalTotal.value,
    subtotal: subtotal.value,
    taxAmount: ppnAmount.value,
    balanceDue: iHavePaid.value ? 0 : finalTotal.value,
    status: iHavePaid.value ? 'paid' : 'unpaid',
    tags: tags.value.length ? tags.value.map((t) => String(t.name ?? t.id)) : undefined,
    memo: memo.value.trim() || undefined,
    attachments: attachments.length ? attachments : undefined,
    lineItems: lineItems.length ? lineItems : undefined,
    // Only a bill created already-paid carries a payment record — an unpaid bill
    // gets one later, through a not-yet-built "add payment" action.
    payment: iHavePaid.value ? {
      paymentAccount: BANK_ACCOUNT_OPTIONS.find((a) => a.id === paymentAccountId.value)?.name ?? paymentAccountId.value,
      amountPaid: amountPaid.value,
      paymentDate: toISODate(paymentDate.value),
      reference: paymentReference.value || undefined,
    } : undefined,
  })

  toast.notify({ variant: 'success', title: 'Expense saved' })
  if (mode === 'close') {
    goExpenses()
  } else {
    // "Save & new" — navigate away and immediately back so this component fully
    // unmounts and remounts as a genuinely fresh /expenses/new instance, rather
    // than wiping fields in place.
    router.push('/expenses').then(() => router.push('/expenses/new'))
  }
}
</script>

<template>
  <div class="detail-page">
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb" @click="goExpenses">Expenses</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">New expense</h1>
        </div>
      </div>
    </header>

    <!-- ── Two-panel stage ── -->
    <div class="ex-stage">

      <!-- ── Docked rail — shown after a close that wasn't permanently suppressed ── -->
      <div v-if="leftPanelDocked" class="ex-docked-rail">
        <button type="button" class="ex-docked-btn" aria-label="Open receipt autofill" @click="undockPanel">
          <MpIcon name="airene-brand" size="md" />
        </button>
      </div>

      <!-- ── Left panel: receipt dropzone / preview ── -->
      <div v-show="leftPanelOpen" class="ex-left" :style="{ width: leftWidth + 'px' }">
        <div class="ex-left-header">
          <template v-if="!uploadedFile">
            <div class="ex-left-header-title">
              <MpIcon name="airene-brand" size="md" />
              <h2 class="ex-left-header-heading">Autofill fields</h2>
            </div>
            <button class="ex-icon-btn" aria-label="Close receipt panel" @click="requestClosePanel">
              <MpIcon name="close" size="sm" />
            </button>
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
              <div class="ex-zoom-toggle" role="group" aria-label="Zoom">
                <button
                  type="button"
                  class="ex-zoom-part"
                  :class="{ 'ex-zoom-part--active': zoomMode === 'fit' }"
                  @click="zoomMode = 'fit'"
                >Fit</button>
                <button
                  type="button"
                  class="ex-zoom-part"
                  :class="{ 'ex-zoom-part--active': zoomMode === '100' }"
                  @click="zoomMode = '100'"
                >100%</button>
              </div>
              <button class="ex-icon-btn" aria-label="Close receipt panel" @click="requestClosePanel">
                <MpIcon name="close" size="sm" />
              </button>
            </div>
          </template>
        </div>

        <!-- Idle / loading / uploaded-preview states are all handled by MpDropzone itself
             (isShowPreview defaults to true) — the built-in preview gives us the hover
             "Replace your file here" overlay and the minus-circle clear button for free. -->
        <MpDropzone
          id="ex-receipt-dropzone"
          class="ex-dropzone"
          :class="{ 'ex-dropzone--filled': uploadedFile }"
          accept=".pdf,.png,.jpg,.jpeg"
          is-enable-input-file
          :is-loading="processingFile"
          :is-invalid="!!dropzoneError"
          button-text="Replace your file here"
          @change="onDropzoneFileChange"
          @clear="clearUploadedFile"
        >
          <template #idle="{ handleClickInput }">
            <img src="/illustrations/receipt-dropzone.png" alt="" class="ex-dropzone-thumb-img" />
            <p class="ex-dropzone-title">
              Drop your receipt file here or
              <button type="button" class="ex-dropzone-browse" @click.stop="handleClickInput">browse</button>
            </p>
            <p class="ex-dropzone-desc">
              This feature will reduce your monthly AI token usage.
              Supported formats: PDF, PNG and JPG.
              Maximum file size 10 MB.
            </p>
          </template>
          <template #loading>
            <div class="ex-dropzone-loading">
              <div class="ex-dropzone-loader"><MpSpinner /></div>
              <h2 class="ex-dropzone-loading-title">Processing autofill...</h2>
            </div>
          </template>
        </MpDropzone>

        <p v-if="dropzoneError" class="ex-dropzone-error">{{ dropzoneError }}</p>

        <button v-if="!uploadedFile" type="button" class="ex-turn-off-link" @click="requestTurnOffAutofill">
          Turn off autofill option
        </button>

        <!-- Uploaded-state footer: Airene disclaimer + feedback thumbs -->
        <div v-if="uploadedFile" class="ex-airene-disclaimer">
          <p class="ex-airene-disclaimer-text">
            Airene responses can be inaccurate or misleading.
            <button type="button" class="ex-airene-learn-more">Learn more</button>
          </p>
          <div class="ex-airene-feedback">
            <button
              class="ex-icon-btn"
              :class="{ 'ex-icon-btn--active': autofillFeedback === 'up' }"
              aria-label="Good autofill result"
              @click="setAutofillFeedback('up')"
            ><MpIcon name="like" size="sm" /></button>
            <button
              class="ex-icon-btn"
              :class="{ 'ex-icon-btn--active': autofillFeedback === 'down' }"
              aria-label="Poor autofill result"
              @click="setAutofillFeedback('down')"
            ><MpIcon name="dislike" size="sm" /></button>
          </div>
        </div>
      </div>

      <!-- Resize divider — drag to resize the left panel (right panel absorbs the rest) -->
      <div v-if="leftPanelOpen" class="ex-divider" aria-label="Resize panel" @mousedown="startPanelResize" />

      <!-- ── Right panel: bill fields ── -->
      <div class="ex-right">

        <!-- Beneficiary + paid checkbox -->
        <div class="ex-row-1">
          <MpFormControl id="ex-beneficiary" class="ex-field-flex" is-required :is-invalid="beneficiaryError">
            <MpFormLabel>Beneficiary</MpFormLabel>
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
                {{ currentSearch ? `Add "${currentSearch}" as a new beneficiary` : 'Add new beneficiary' }}
              </template>
            </MpAutocomplete>
            <MpFormErrorMessage>Please select a beneficiary</MpFormErrorMessage>
          </MpFormControl>
          <div class="ex-paid-check">
            <MpCheckbox id="ex-paid" :is-checked="iHavePaid" @change="iHavePaid = !iHavePaid" />
            <span>I have paid this bill</span>
          </div>
        </div>

        <!-- Transaction date -> Transaction no. -> Due date -> Reference no. -> Tag -->
        <div class="ex-grid-2 ex-section-divider">
          <MpFormControl id="ex-txdate">
            <MpFormLabel>Transaction date</MpFormLabel>
            <div class="ex-datepicker">
              <MpDatePicker id="ex-txdate-dp" v-model="transactionDate" format="DD/MM/YYYY" value-type="format" use-portal />
            </div>
          </MpFormControl>
          <MpFormControl id="ex-transno">
            <div class="ex-label-row">
              <MpFormLabel>Transaction no.</MpFormLabel>
              <span class="ex-label-icon" title="Auto-generated"><MpIcon name="settings" size="sm" /></span>
            </div>
            <MpInput id="ex-transno-input" v-model="transactionNo" placeholder="[Auto]" is-full-width is-disabled />
          </MpFormControl>
          <!-- Due date — only relevant while the bill is still unpaid -->
          <MpFormControl v-if="!iHavePaid" id="ex-duedate">
            <MpFormLabel>Due date</MpFormLabel>
            <div class="ex-datepicker">
              <MpDatePicker id="ex-duedate-dp" v-model="dueDate" format="DD/MM/YYYY" value-type="format" use-portal />
            </div>
          </MpFormControl>
          <MpFormControl id="ex-refno">
            <MpFormLabel>Reference no.</MpFormLabel>
            <MpInput id="ex-refno-input" v-model="referenceNo" is-full-width />
          </MpFormControl>
          <MpFormControl id="ex-tags">
            <MpFormLabel>Tag</MpFormLabel>
            <MpInputTag id="ex-tags-input" :data="tags" :is-enable-create-new-tag="true" :is-show-suggestions="false" @change="onTagsChange" />
          </MpFormControl>
        </div>

        <!-- Price includes tax -->
        <div class="ex-price-includes">
          <MpCheckbox id="ex-price-incl" :is-checked="priceIncludesTax" @change="priceIncludesTax = !priceIncludesTax" />
          <span>Price includes tax</span>
        </div>

        <!-- Line items -->
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
                  <th class="ex-th">Account</th>
                  <th class="ex-th">Description</th>
                  <th class="ex-th">Tax</th>
                  <th class="ex-th">Amount</th>
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
                  <td class="ex-td ex-td--input ex-td--border">
                    <MpAutocomplete
                      :id="`ex-account-${row.id}`" v-model="row.accountId" :data="ACCOUNT_OPTIONS"
                      label-prop="name" value-prop="id" is-searchable is-clearable use-portal is-full-width
                      placeholder="Select account"
                      @update:model-value="onAccountSelect(row)"
                    />
                  </td>
                  <template v-if="row.accountId">
                    <td class="ex-td ex-td--input ex-td--border">
                      <MpInput :id="`ex-desc-${row.id}`" v-model="row.description" is-full-width />
                    </td>
                    <td class="ex-td ex-td--input ex-td--border">
                      <MpAutocomplete
                        :id="`ex-tax-${row.id}`" v-model="row.taxId" :data="TAX_OPTIONS"
                        label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                        placeholder="Select tax"
                      />
                    </td>
                    <td class="ex-td ex-td--input ex-td--border ex-td--amount">
                      <div class="ex-amount-cell">
                        <span class="ex-amount-prefix">Rp</span>
                        <MpInput
                          :id="`ex-amount-${row.id}`" v-model="row.amount" type="number" is-full-width class="ex-amount-input"
                          :is-invalid="row.amountError" @update:model-value="row.amountError = false"
                        />
                      </div>
                    </td>
                    <td class="ex-td ex-td--del">
                      <button class="ex-del-btn" type="button" @click="removeRow(row.id)">
                        <MpIcon name="minus-circular" size="sm" />
                      </button>
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
                <MpFormLabel>Memo</MpFormLabel>
                <MpTextarea id="ex-memo-textarea" v-model="memo" is-full-width :rows="4" />
              </MpFormControl>
              <p class="ex-helper-text">Only visible to you and your team</p>
            </div>

            <!-- Attachment -->
            <div class="ex-section ex-attachment-section">
              <div class="ex-section-label-row">
                <div class="ex-section-label">Attachment</div>
                <MpButton v-if="!leftPanelOpen && autofillOff" variant="textLink" size="sm" left-icon="airene-brand" @click="reopenAutofillPanel">
                  Try autofill
                </MpButton>
              </div>
              <div class="ex-attachment">
                <MpUpload
                  id="ex-attachment-upload"
                  class="ex-attachment-upload"
                  :class="{ 'ex-attachment-upload--dragover': formDragOver }"
                  accept=".xls,.xlsx,.doc,.docx,.pdf,.jpg,.jpeg,.png,.zip"
                  is-multiple is-full-width
                  placeholder="or drag and drop here"
                  button-text="Browse file"
                  @change="onFormFileChange"
                  @dragover.prevent="formDragOver = true"
                  @dragleave.prevent="formDragOver = false"
                  @drop.prevent="onFormFileDrop"
                />
                <p class="ex-helper-text">Files must be in XLS, DOC, PDF, JPG, PNG, or ZIP with a maximum of 10 MB and 5 files per transaction</p>
                <MpUploadList
                  v-for="f in formAttachedFiles" :key="f.name"
                  :id="`ex-attachment-file-${f.name}`"
                  :title="f.name" status="success" subtitle="Uploaded"
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
              <span class="ex-total-label">Subtotal</span>
              <span class="ex-total-amt">{{ formatIDR(subtotal) }}</span>
            </div>
            <div v-if="hasPpnTax" class="ex-total-row">
              <span class="ex-total-label">PPN 10%</span>
              <span class="ex-total-amt">{{ formatIDR(ppnAmount) }}</span>
            </div>
            <div class="ex-total-rule" />
            <div class="ex-total-row">
              <span class="ex-total-label ex-total-label--strong">Total</span>
              <span class="ex-total-amt ex-total-amt--strong">{{ formatIDR(total) }}</span>
            </div>

            <div class="ex-withholding-check">
              <MpCheckbox id="ex-less-wht" :is-checked="lessWithholding" @change="lessWithholding = !lessWithholding" />
              <span>Less: Withholding</span>
            </div>

            <!-- Withholding detail rows — only when checked -->
            <div v-if="lessWithholding" class="ex-withholding-rows">
              <div v-for="(wh, idx) in withholdingRows" :key="wh.id" class="ex-withholding-row">
                <div class="ex-withholding-toprow">
                  <MpFormControl :id="`ex-wh-name-${wh.id}`" is-required>
                    <MpFormLabel>Name</MpFormLabel>
                    <MpInput :id="`ex-wh-name-input-${wh.id}`" v-model="wh.name" is-full-width />
                  </MpFormControl>
                  <MpFormControl :id="`ex-wh-amount-${wh.id}`" is-required>
                    <MpFormLabel>Amount</MpFormLabel>
                    <MpInputGroup :id="`ex-wh-amount-group-${wh.id}`">
                      <MpInputLeftAddon has-background class="ex-wh-unit-addon">
                        <MpPopover :id="`ex-wh-unit-${wh.id}`" is-close-on-select placement="bottom-start" use-portal :is-keep-alive="false">
                          <MpPopoverTrigger>
                            <button type="button" class="ex-wh-unit-trigger">
                              <span>{{ wh.unit }}</span>
                              <MpIcon name="chevrons-down" size="sm" />
                            </button>
                          </MpPopoverTrigger>
                          <MpPopoverContent :class="css({ minWidth: '64px', width: 'max-content' })">
                            <MpPopoverList>
                              <MpPopoverListItem :is-active="wh.unit === 'Rp'" @click="wh.unit = 'Rp'">Rp</MpPopoverListItem>
                              <MpPopoverListItem :is-active="wh.unit === '%'" @click="wh.unit = '%'">%</MpPopoverListItem>
                            </MpPopoverList>
                          </MpPopoverContent>
                        </MpPopover>
                      </MpInputLeftAddon>
                      <MpInput :id="`ex-wh-amount-input-${wh.id}`" v-model="wh.amount" type="number" is-full-width />
                    </MpInputGroup>
                  </MpFormControl>
                </div>
                <MpFormControl :id="`ex-wh-account-${wh.id}`" is-required class="ex-wh-account">
                  <MpFormLabel>Account</MpFormLabel>
                  <div class="ex-wh-account-row">
                    <MpAutocomplete
                      :id="`ex-wh-account-ac-${wh.id}`" v-model="wh.accountId" :data="BANK_ACCOUNT_OPTIONS"
                      label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                    />
                    <button v-if="withholdingRows.length > 1" class="ex-del-btn" type="button" @click="removeWithholdingRow(wh.id)">
                      <MpIcon name="minus-circular" size="sm" />
                    </button>
                  </div>
                </MpFormControl>
              </div>
              <MpButton variant="textLink" size="sm" left-icon="add" @click="addWithholdingRow">Add withholding</MpButton>
            </div>

            <div v-if="lessWithholding" class="ex-total-rule" />
            <div v-if="lessWithholding" class="ex-total-row">
              <span class="ex-total-label ex-total-label--strong">Total</span>
              <span class="ex-total-amt ex-total-amt--strong">{{ formatIDR(finalTotal) }}</span>
            </div>
          </div>
        </div>

        <!-- Payment — only when the bill is marked as paid -->
        <div v-if="iHavePaid" class="ex-section ex-payment-section">
          <MpTabs id="ex-payment-tabs" :default-value="0" variant-color="blue">
            <MpTabList>
              <MpTab value="payment">Payment</MpTab>
            </MpTabList>
            <MpTabPanels>
              <MpTabPanel value="payment">
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
                          <th class="ex-th">Payment account</th>
                          <th class="ex-th">Amount paid</th>
                          <th class="ex-th">Payment date</th>
                          <th class="ex-th">Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr class="ex-tr">
                          <td class="ex-td ex-td--input ex-td--border">
                            <MpAutocomplete
                              id="ex-pay-account-ac" v-model="paymentAccountId" :data="BANK_ACCOUNT_OPTIONS"
                              label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                              placeholder="Select account"
                            />
                          </td>
                          <td class="ex-td ex-td--input ex-td--border ex-td--amount">
                            <div class="ex-amount-cell">
                              <span class="ex-amount-prefix">Rp</span>
                              <MpInput
                                id="ex-pay-amount-input" v-model="amountPaid" type="number" is-full-width class="ex-amount-input"
                                @update:model-value="amountPaidTouched = true"
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
          <MpButton variant="ghost" is-rounded @click="goExpenses">Cancel</MpButton>
          <MpButton variant="secondary" is-rounded @click="handleSave('close')">Save &amp; close</MpButton>
          <MpButton variant="primary" is-rounded @click="handleSave('new')">Save &amp; new</MpButton>
        </footer>
      </div>
    </div>

    <!-- Close-panel confirmation -->
    <MpModal :is-open="showCloseConfirm" @close="showCloseConfirm = false">
      <MpModalContent>
        <MpModalHeader>Close receipt panel?<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          <p class="ex-modal-copy">You can turn it back on anytime from the same spot.</p>
        </MpModalBody>
        <MpModalFooter>
          <div class="ex-modal-footer-btns">
            <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="showCloseConfirm = false">Cancel</button>
            <button type="button" class="btn-enterprise btn-enterprise--secondary" @click="closePanelDontShowAgain">Close &amp; don't show again</button>
            <button type="button" class="btn-enterprise btn-enterprise--primary" @click="closePanelKeepAsking">Close</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- Turn-off-autofill confirmation -->
    <MpModal :is-open="showTurnOffConfirm" @close="showTurnOffConfirm = false">
      <MpModalContent>
        <MpModalHeader>Turn off autofill option?<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          <p class="ex-modal-copy">You can turn it back on anytime from the attachment field in expense form.</p>
        </MpModalBody>
        <MpModalFooter>
          <div class="ex-modal-footer-btns">
            <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="showTurnOffConfirm = false">Cancel</button>
            <button type="button" class="btn-enterprise btn-enterprise--primary" @click="confirmTurnOffAutofill">Turn off</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>
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
  background: #EFF1F1; border-radius: 12px 12px 0 0; overflow: hidden;
}

/* ── Left panel — no background, 24px left / 12px right (divider gap) / 12px top-bottom padding, full height ── */
.ex-left {
  flex-shrink: 0;
  padding: 12px 12px 32px 24px;
  display: flex; flex-direction: column; min-height: 0;
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
  display: inline-flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; padding: var(--mp-spacing-2, 8px);
  border: none; background: none; border-radius: var(--mp-radii-md, 6px);
  cursor: pointer;
}
.ex-docked-btn:hover { background: var(--mp-background-neutral-hovered); }

/* ── Resize divider — drag to resize the left panel ── */
.ex-divider {
  flex-shrink: 0; width: var(--mp-spacing-3); cursor: col-resize; z-index: 10;
  display: flex; align-items: center; justify-content: center;
}
.ex-divider::after { content: ''; display: block; width: 2px; height: var(--mp-spacing-10, 40px); background: var(--mp-border-default); border-radius: var(--mp-radii-full); }
.ex-divider:hover::after { background: var(--mp-border-bold, #758195); }
.ex-icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border: none; background: none; border-radius: var(--mp-radii-sm);
  color: var(--mp-text-secondary); cursor: pointer;
}
.ex-icon-btn:hover { background: rgba(0, 0, 0, 0.06); color: var(--mp-text-default); }
.ex-icon-btn--active,
.ex-icon-btn--active:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-link, #2563eb); }
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
  padding: 4px; border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral, #fff);
  border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16));
}
.ex-zoom-part {
  border: none; background: none; cursor: pointer;
  padding: 4px 8px; border-radius: var(--mp-radii-full, 999px);
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
  padding: 40px;
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
.ex-dropzone-thumb-img { width: 125px; height: auto; }

/* Uploading state — loader wrapped in a neutral-subtle circle, 24px above the title. */
.ex-dropzone-loading { display: flex; flex-direction: column; align-items: center; gap: 24px; }
.ex-dropzone-loader {
  display: flex; align-items: center; justify-content: center;
  width: 80px; height: 80px; padding: var(--mp-spacing-4, 16px);
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
  background: rgba(34, 34, 34, 0.8);
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

.ex-turn-off-link {
  flex-shrink: 0; align-self: center; margin-top: 24px;
  background: none; border: none; padding: 0; cursor: pointer;
  font: inherit; font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-link, #2563eb);
}
.ex-turn-off-link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* Same red convention as MpFormErrorMessage elsewhere in this form. */
.ex-dropzone-error {
  flex-shrink: 0; margin: 8px 0 0; font-size: 12px;
  color: var(--mp-text-danger, #a8352d);
}

/* ── Right panel — rounded left corners, neutral bg, 24px padding, scrollable ── */
.ex-right {
  flex: 1; min-width: 0; overflow-y: auto;
  background: var(--mp-background-neutral, white);
  border-radius: 12px 0 0 12px;
  padding: 24px;
  container-type: inline-size;
}

/* Beneficiary row shares the exact same grid column tracks as the field grid below, so its 1-column
   width always matches a single field (e.g. Transaction date) pixel-for-pixel — no calc()/ratio guesswork. */
.ex-row-1, .ex-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 24px; }
.ex-row-1 { align-items: flex-end; max-width: 620px; }
.ex-field-flex { grid-column: span 1; min-width: 0; }
.ex-paid-check { grid-column: span 1; display: flex; align-items: center; gap: var(--mp-spacing-2); padding-bottom: 8px; white-space: nowrap; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

/* Narrow (default): 2 equal columns, natural field order flows top-to-bottom */
.ex-grid-2 { padding: 20px 0; max-width: 620px; }
.ex-section-divider { border-bottom: 1px dashed var(--mp-border-default); }

/* Wide panel: all 5 fields inline in one row */
@container (min-width: 860px) {
  .ex-row-1, .ex-grid-2 { grid-template-columns: repeat(5, 1fr); max-width: none; }
}
.ex-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.ex-label-icon { display: flex; align-items: center; color: var(--mp-text-secondary); cursor: pointer; }
.ex-datepicker { width: 100%; }
.ex-datepicker :deep(.mp-datepicker__root) { width: 100%; }

.ex-price-includes { display: flex; align-items: center; gap: var(--mp-spacing-2); justify-content: flex-end; padding-top: 20px; margin-bottom: 12px; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Line items table ─────────────────────────────────────────────────────── */
.ex-table-section { overflow-x: auto; border-bottom: 1px solid var(--mp-border-default); }
.ex-table-scroll { overflow-x: auto; }
.ex-table { width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0; border-radius: 0; }
.ex-col-drag { width: 44px; }
.ex-col-account { width: 200px; }
.ex-col-desc { width: auto; }
.ex-col-tax { width: 140px; }
.ex-col-amount { width: 160px; }
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
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
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

/* Line items table: left-aligned container, right-side-only column dividers
   instead of row-separator borders. */
.ex-lineitems-table { min-width: 764px; margin-right: auto; }
.ex-lineitems-table .ex-td {
  height: 52px;
  vertical-align: middle;
  border-bottom: 1px solid var(--mp-border-default);
}
.ex-lineitems-table .ex-td--amount { padding: 0; }

.ex-amount-cell { display: flex; align-items: stretch; height: 100%; min-height: 52px; }
.ex-amount-prefix {
  flex-shrink: 0; display: flex; justify-content: center;
  padding: 16px var(--mp-spacing-2) 0;
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); border-radius: 0;
}
.ex-amount-input { flex: 1; min-width: 0; }

.ex-del-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border: none; background: none; border-radius: var(--mp-radii-sm);
  cursor: pointer; color: var(--mp-text-secondary); flex-shrink: 0;
}
.ex-del-btn:hover { background: var(--mp-background-neutral); color: var(--mp-text-danger, #dc2626); }

/* ── Memo/Attachment + Totals — inline when the panel is wide enough, stacked otherwise.
   Widths are spec'd at a 1440px screen (Memo 432px, Attachment matches the Beneficiary
   field's existing width, Totals 428px) and made fluid via `cqw` (relative to .ex-right's
   own container-type: inline-size) so they scale down proportionally on a narrower panel
   instead of staying pinned to those px values. 1440px reference right-panel content width
   measured at ~1321px, so 432px = 32.7cqw and 428px = 32.4cqw. ── */
.ex-notes { display: flex; flex-direction: column; gap: var(--mp-spacing-6); }
/* Stacked: Totals on top, Memo/Attachment below (order flips DOM order without changing tab order) */
.ex-notes-left { display: flex; flex-direction: column; flex-shrink: 0; order: 2; }
.ex-memo-section { width: min(432px, 32.7cqw); flex-shrink: 0; }
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
  display: flex; align-items: center; gap: 4px;
  padding: 6px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  border-radius: var(--mp-radii-md);
}
.ex-wh-unit-trigger:hover { background: var(--mp-background-neutral-hovered); }
.ex-wh-unit-trigger :deep(svg) { width: 16px; height: 16px; flex-shrink: 0; }
:deep([id^='ex-wh-amount-group-'] .mp-input__control) { padding: 2px; }

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

/* ── Close-panel confirmation modal ──────────────────────────────────────── */
.ex-modal-copy { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.ex-modal-check { display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ex-modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
/* Cancel here reads as a plain dismiss, not a bold action — regular weight, scoped
   to this panel's modals so the app-wide .btn-enterprise--ghost stays untouched. */
.ex-modal-footer-btns .btn-enterprise--ghost { font-weight: var(--mp-font-weights-regular); }
</style>
