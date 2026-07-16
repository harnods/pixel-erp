<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
import {
  MpButton, MpCheckbox, MpInput, MpTextarea, MpAutocomplete, MpDatePicker,
  MpInputTag, MpIcon, MpSpinner, toast,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel,
  MpFormControl, MpFormLabel, MpFormErrorMessage,
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
const ppnAmount = computed(() => (priceIncludesTax.value ? 0 : Math.round(subtotal.value * 0.1)))
const total = computed(() => subtotal.value + ppnAmount.value)

// ── Withholding ──────────────────────────────────────────────────────────────
interface WithholdingRow {
  id: number
  name: string
  amount: string
  accountId: string
}
let whSeq = 0
function makeWithholdingRow(): WithholdingRow {
  return { id: whSeq++, name: whSeq === 1 ? 'Withholding tax' : '', amount: '', accountId: '' }
}
const lessWithholding = ref(false)
const withholdingRows = ref<WithholdingRow[]>([makeWithholdingRow()])
function addWithholdingRow() { withholdingRows.value.push(makeWithholdingRow()) }
function removeWithholdingRow(id: number) {
  if (withholdingRows.value.length === 1) return
  withholdingRows.value = withholdingRows.value.filter((r) => r.id !== id)
}
const withholdingTotal = computed(() =>
  lessWithholding.value ? withholdingRows.value.reduce((s, r) => s + (Number(r.amount) || 0), 0) : 0,
)
const finalTotal = computed(() => total.value - withholdingTotal.value)

// ── Memo + Attachment (form-level, separate from the receipt dropzone) ──────
const memo = ref('')
const formFileInput = ref<HTMLInputElement | null>(null)
const formAttachedFiles = ref<File[]>([])
function onFormFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  if (input.files) {
    for (const f of Array.from(input.files)) {
      if (!formAttachedFiles.value.some((x) => x.name === f.name)) formAttachedFiles.value.push(f)
    }
  }
  if (formFileInput.value) formFileInput.value.value = ''
}
function removeFormFile(name: string) {
  formAttachedFiles.value = formAttachedFiles.value.filter((f) => f.name !== name)
}

// ── Payment (shown only when "I have paid this bill" is checked) ───────────
const paymentAccountId = ref('')
const paymentDate = ref(todayDisplay)
const paymentReference = ref('')
const amountPaid = computed(() => finalTotal.value)

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
const uploadedFile = ref<File | null>(null)
const uploadedFileUrl = ref('')
const dragOver = ref(false)
const processingFile = ref(false)
const dropzoneFileInput = ref<HTMLInputElement | null>(null)

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
function onDropzoneDrop(ev: DragEvent) {
  dragOver.value = false
  const file = ev.dataTransfer?.files?.[0]
  if (file) ingestFile(file)
}
function onDropzoneFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) ingestFile(file)
  if (dropzoneFileInput.value) dropzoneFileInput.value.value = ''
}
function clearUploadedFile() {
  if (uploadedFileUrl.value) URL.revokeObjectURL(uploadedFileUrl.value)
  uploadedFile.value = null
  uploadedFileUrl.value = ''
}
onBeforeUnmount(() => {
  if (uploadedFileUrl.value) URL.revokeObjectURL(uploadedFileUrl.value)
})

// Close the left panel — confirms first unless the user opted out of the prompt.
const HIDE_CLOSE_CONFIRM_KEY = 'erp-hide-expense-panel-close-confirm'
const showCloseConfirm = ref(false)
const dontShowCloseConfirmAgain = ref(false)
function requestClosePanel() {
  if (import.meta.client && localStorage.getItem(HIDE_CLOSE_CONFIRM_KEY) === '1') {
    leftPanelOpen.value = false
    return
  }
  showCloseConfirm.value = true
}
function confirmClosePanel() {
  if (dontShowCloseConfirmAgain.value && import.meta.client) {
    localStorage.setItem(HIDE_CLOSE_CONFIRM_KEY, '1')
  }
  showCloseConfirm.value = false
  leftPanelOpen.value = false
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

      <!-- ── Left panel: receipt dropzone / preview ── -->
      <div v-show="leftPanelOpen" class="ex-left" :style="{ width: leftWidth + 'px' }">
        <div class="ex-left-header">
          <template v-if="!uploadedFile">
            <button class="ex-icon-btn ex-icon-btn--end" aria-label="Close receipt panel" @click="requestClosePanel">
              <MpIcon name="close" size="sm" />
            </button>
          </template>
          <template v-else>
            <span class="ex-file-name">{{ uploadedFile.name }}</span>
            <div class="ex-file-controls">
              <button class="ex-icon-btn" aria-label="Zoom in"><MpIcon name="zoom-in" size="sm" /></button>
              <button class="ex-icon-btn" aria-label="Zoom out"><MpIcon name="zoom-out" size="sm" /></button>
              <button class="ex-icon-btn" aria-label="Fit to screen"><MpIcon name="fit-screen" size="sm" /></button>
              <button class="ex-icon-btn" aria-label="Remove receipt" @click="clearUploadedFile">
                <MpIcon name="close" size="sm" />
              </button>
            </div>
          </template>
        </div>

        <!-- Empty state — Dropzone component (idle / focused / processing) -->
        <div
          v-if="!uploadedFile"
          class="ex-dropzone"
          :class="{ 'ex-dropzone--focused': dragOver }"
          @dragover.prevent="dragOver = true"
          @dragleave.prevent="dragOver = false"
          @drop.prevent="onDropzoneDrop"
          @click="!processingFile && dropzoneFileInput?.click()"
        >
          <input
            ref="dropzoneFileInput" type="file" class="ex-file-hidden"
            accept=".pdf,.png,.jpg,.jpeg" @change="onDropzoneFileChange" @click.stop
          />
          <template v-if="processingFile">
            <div class="ex-processing-badge"><MpSpinner size="md" /></div>
            <p class="ex-processing-label">Processing...</p>
          </template>
          <template v-else>
            <img src="/illustrations/receipt-dropzone.png" alt="" class="ex-dropzone-thumb-img" />
            <p class="ex-dropzone-title">
              <MpIcon name="airene-brand" size="sm" />
              Drop your receipt file here to autofill fields
            </p>
            <p class="ex-dropzone-desc">
              This feature will reduce your monthly AI token usage.
              Supported formats: PDF, PNG and JPG.
              Maximum file size 10 MB.
            </p>
          </template>
        </div>

        <!-- Uploaded state — real file rendered as an image -->
        <div v-else class="ex-preview">
          <img :src="uploadedFileUrl" class="ex-preview-img" alt="Uploaded receipt" />
        </div>
      </div>

      <!-- Resize divider — drag to resize the left panel (right panel absorbs the rest) -->
      <div v-if="leftPanelOpen" class="ex-divider" aria-label="Resize panel" @mousedown="startPanelResize" />

      <!-- Restore affordance when the left panel has been closed -->
      <button v-if="!leftPanelOpen" class="ex-restore-btn" aria-label="Show receipt panel" @click="leftPanelOpen = true">
        <MpIcon name="sidebar-show" size="sm" />
      </button>

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
                  <td class="ex-td ex-td--drag"><MpIcon name="drag" size="sm" /></td>
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

        <!-- Totals -->
        <div class="ex-totals">
          <div class="ex-total-row">
            <span class="ex-total-label">Subtotal</span>
            <span class="ex-total-amt">{{ formatIDR(subtotal) }}</span>
          </div>
          <div class="ex-total-row">
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
              <MpFormControl :id="`ex-wh-name-${wh.id}`" is-required>
                <MpFormLabel>Name</MpFormLabel>
                <MpInput :id="`ex-wh-name-input-${wh.id}`" v-model="wh.name" is-full-width />
              </MpFormControl>
              <MpFormControl :id="`ex-wh-amount-${wh.id}`" is-required>
                <MpFormLabel>Amount</MpFormLabel>
                <MpInput :id="`ex-wh-amount-input-${wh.id}`" v-model="wh.amount" type="number" is-full-width placeholder="Rp" />
              </MpFormControl>
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

        <!-- Memo -->
        <div class="ex-section ex-section--gap-top">
          <MpFormControl id="ex-memo">
            <MpFormLabel>Memo</MpFormLabel>
            <MpTextarea id="ex-memo-textarea" v-model="memo" is-full-width :rows="4" />
          </MpFormControl>
          <p class="ex-helper-text">Only visible to you and your team</p>
        </div>

        <!-- Attachment -->
        <div class="ex-section">
          <div class="ex-section-label">Attachment</div>
          <div class="ex-attachment">
            <input
              ref="formFileInput" type="file" multiple
              accept=".xls,.xlsx,.doc,.docx,.pdf,.jpg,.jpeg,.png,.zip"
              class="ex-file-hidden" @change="onFormFileChange"
            />
            <div class="ex-attachment-row">
              <MpButton variant="secondary" size="sm" is-rounded @click="formFileInput?.click()">Choose file</MpButton>
              <span class="ex-attach-or">or drag and drop here</span>
            </div>
            <p class="ex-helper-text">Files must be in XLS, DOC, PDF, JPG, PNG, or ZIP with a maximum of 10 MB and 5 files per transaction</p>
            <ul v-if="formAttachedFiles.length" class="ex-file-list">
              <li v-for="f in formAttachedFiles" :key="f.name" class="ex-file-item">
                <span class="ex-file-name-text">{{ f.name }}</span>
                <button class="ex-file-remove" type="button" @click="removeFormFile(f.name)">
                  <MpIcon name="close" size="xs" />
                </button>
              </li>
            </ul>
          </div>
        </div>

        <!-- Payment — only when the bill is marked as paid -->
        <div v-if="iHavePaid" class="ex-section ex-payment-section">
          <MpTabs id="ex-payment-tabs" :default-value="0" variant-color="green">
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
                          <td class="ex-td ex-td--input">
                            <MpAutocomplete
                              id="ex-pay-account-ac" v-model="paymentAccountId" :data="BANK_ACCOUNT_OPTIONS"
                              label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                              placeholder="Select account"
                            />
                          </td>
                          <td class="ex-td ex-td--input">
                            <MpInput id="ex-pay-amount-input" :model-value="String(amountPaid)" is-full-width is-disabled />
                          </td>
                          <td class="ex-td ex-td--input">
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
          <p class="ex-modal-copy">You can bring it back anytime from the same spot.</p>
          <div class="ex-modal-check">
            <MpCheckbox id="ex-dont-show-again" :is-checked="dontShowCloseConfirmAgain" @change="dontShowCloseConfirmAgain = !dontShowCloseConfirmAgain" />
            <span>Don't ask me again</span>
          </div>
        </MpModalBody>
        <MpModalFooter>
          <div class="ex-modal-footer-btns">
            <MpButton variant="ghost" is-rounded @click="showCloseConfirm = false">Cancel</MpButton>
            <MpButton variant="primary" is-rounded @click="confirmClosePanel">Close panel</MpButton>
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
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}

/* ── Two-panel stage ──────────────────────────────────────────────────────────
   Zero padding, zero gap between panels. Rounded top corners clip both panels. */
.ex-stage {
  flex: 1; min-height: 0; display: flex; position: relative;
  background: #EFF1F1; border-radius: 12px 12px 0 0; overflow: hidden;
}

/* ── Left panel — no background, 24px side / 12px top-bottom padding, full height ── */
.ex-left {
  flex-shrink: 0;
  padding: 12px 24px;
  display: flex; flex-direction: column; min-height: 0;
}
.ex-left-header { flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; height: 32px; margin-bottom: 8px; }
.ex-icon-btn--end { margin-left: auto; }

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
.ex-file-name { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-medium, 500); color: var(--mp-text-default); }
.ex-file-controls { display: flex; align-items: center; gap: 2px; }

.ex-dropzone {
  flex: 1; min-height: 0; cursor: pointer;
  border: 1px dashed var(--mp-border-bold, #758195);
  border-radius: var(--mp-radii-md, 6px);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--mp-spacing-3); padding: var(--mp-spacing-5);
  transition: background 0.1s, border-color 0.1s;
}
.ex-dropzone--focused { background: var(--mp-background-neutral-hovered, #f7f8f9); border-color: var(--mp-border-focused, #7586e5); }
.ex-file-hidden { display: none; }

.ex-dropzone-thumb-img { width: 125px; height: auto; }

.ex-dropzone-title {
  margin: 0; display: flex; align-items: center; gap: 4px;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); text-align: center;
}
.ex-dropzone-desc { margin: 0; max-width: 320px; text-align: center; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.ex-processing-badge {
  width: 80px; height: 80px; border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral-subtle, #f0f1f3);
  display: flex; align-items: center; justify-content: center;
}
.ex-processing-label { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.ex-preview { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: auto; }
.ex-preview-img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: var(--mp-radii-md); }

.ex-restore-btn {
  position: absolute; top: 12px; left: 24px; z-index: 1;
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border: none; border-radius: var(--mp-radii-sm);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary); cursor: pointer;
}
.ex-restore-btn:hover { color: var(--mp-text-default); }

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
.ex-col-desc { width: 220px; }
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

/* Line items table: left-aligned container, right-side-only column dividers
   instead of row-separator borders. */
.ex-lineitems-table { margin-right: auto; }
.ex-lineitems-table .ex-td {
  height: 52px;
  vertical-align: middle;
  border-bottom: 1px solid var(--mp-border-default);
}
.ex-lineitems-table .ex-td--border { border-right: 1px solid var(--mp-border-default); }
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

/* ── Totals ───────────────────────────────────────────────────────────────── */
.ex-totals { display: flex; flex-direction: column; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4) 0; max-width: 620px; align-self: flex-end; width: 100%; }
.ex-total-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-4); }
.ex-total-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.ex-total-amt { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
.ex-total-label--strong, .ex-total-amt--strong { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ex-total-rule { border-top: 1px solid var(--mp-border-default); }

.ex-withholding-check { display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.ex-withholding-rows { display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding: var(--mp-spacing-2) 0; }
.ex-withholding-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
.ex-wh-account-row { display: flex; align-items: center; gap: 4px; }
.ex-wh-account { min-width: 0; }

/* ── Memo / Attachment ────────────────────────────────────────────────────── */
.ex-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); max-width: 440px; padding: var(--mp-spacing-4) 0; }
.ex-section--gap-top { padding-top: var(--mp-spacing-6); }
.ex-section-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin-bottom: var(--mp-spacing-1); }
.ex-helper-text { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm); }

.ex-attachment { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ex-attachment-row { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.ex-attach-or { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ex-file-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.ex-file-item { display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }
.ex-file-name-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ex-file-remove { display: flex; align-items: center; background: none; border: none; padding: 0; cursor: pointer; color: var(--mp-text-secondary); }
.ex-file-remove:hover { color: var(--mp-text-default); }

/* ── Payment ──────────────────────────────────────────────────────────────── */
.ex-payment-section { max-width: none; padding-top: var(--mp-spacing-6); }

/* ── Footer ───────────────────────────────────────────────────────────────── */
.ex-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding-top: var(--mp-spacing-6); }

/* ── Close-panel confirmation modal ──────────────────────────────────────── */
.ex-modal-copy { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.ex-modal-check { display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ex-modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
</style>
