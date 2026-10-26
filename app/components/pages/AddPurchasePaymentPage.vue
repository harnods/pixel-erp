<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { formatIDR } from '~/utils/currency'
import {
  MpButton, MpInput, MpInputGroup, MpInputLeftAddon, MpAutocomplete, MpDatePicker, MpTextarea, MpUpload, MpUploadList,
  MpIcon, MpFormControl, MpFormLabel, MpFormErrorMessage, MpTextlink, MpCheckbox, toast,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
  type DataInterface,
} from '@mekari/pixel3'
import TransactionNoField from '~/components/patterns/TransactionNoField.vue'
import {
  depositToAccounts, cashAccountLabel, WHT_ACCOUNTS, whtAccountLabel,
  payableInvoices, invoiceBalanceAfterPayments, invoiceLabel, invoiceById,
  createPurchasePayment, updatePurchasePayment, getPurchasePayment,
  paymentSubtotal, paymentWht, paymentTotal, validatePayment,
  purchasePayments,
  type PaymentDraft, type PaymentAllocation, type PpAttachment,
} from '~/data/purchasePayments'
import { vendorNameOf } from '~/data/debitMemos'
import { vendorById } from '~/data/vendors'
import { SIM_TODAY_ISO } from '~/data/simClock'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

function toDisplayDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function toISODate(display: string) {
  const [d, m, y] = display.split('/')
  return `${y}-${m}-${d}`
}

const isEdit = computed(() => props.orderId.startsWith('pp-') || props.orderId.startsWith('pp_'))
const editingPayment = computed(() => isEdit.value ? getPurchasePayment(props.orderId) : null)

const sourceInvoice = computed(() => {
  if (isEdit.value) return null
  return invoiceById(props.orderId) ?? null
})
const vendorId = computed(() => {
  if (editingPayment.value) return editingPayment.value.vendorId
  return sourceInvoice.value?.vendor.id ?? ''
})
const vendorName = computed(() => vendorNameOf(vendorId.value))
const vendorData = computed(() => vendorById(vendorId.value))
const vendorEmails = computed(() => {
  const v = vendorData.value
  if (!v) return []
  const slug = v.name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12) || 'vendor'
  return [v.email, `ap.finance@${slug}.com`]
})

const invoiceNumber = computed(() => {
  if (sourceInvoice.value) return invoiceLabel(sourceInvoice.value.number)
  if (editingPayment.value) {
    const firstAlloc = editingPayment.value.allocations[0]
    if (firstAlloc) {
      const inv = invoiceById(firstAlloc.invoiceId)
      if (inv) return invoiceLabel(inv.number)
    }
  }
  return ''
})

function goBack() {
  if (isEdit.value && editingPayment.value) {
    router.push(`/purchase-payments/${editingPayment.value.id}`)
  } else if (sourceInvoice.value) {
    router.push(`/purchase-invoices/${sourceInvoice.value.id}`)
  } else {
    router.push('/purchase-invoices')
  }
}

// ── Account (Deposit to) ──────────────────────────────────────────────────
const depositAccounts = computed(() => depositToAccounts().map(a => ({ id: a.id, name: `${a.code} ${a.name}` })))
const depositToId = ref(editingPayment.value?.depositToAccountId ?? '')
const depositToError = ref(false)

// ── Payment method ─────────────────────────────────────────────────────────
const PAYMENT_METHODS = ['Bank transfer', 'Virtual account', 'Cash', 'Giro']
const paymentMethodOptions = computed(() => PAYMENT_METHODS.map(m => ({ id: m, name: m })))
const paymentMethod = ref('Bank transfer')

// ── Header fields ───────────────────────────────────────────────────────────
const transactionDate = ref(toDisplayDate(editingPayment.value?.date ?? SIM_TODAY_ISO))
const referenceNo = ref('')

const nextTxNo = computed(() => `PP-${String(purchasePayments.reduce((m, p) => Math.max(m, p.number), 60000) + 1).padStart(5, '0')}`)

// ── Withholding tax ─────────────────────────────────────────────────────────
const whtEnabled = ref(!!editingPayment.value?.withholding)
const whtAccountCode = ref(editingPayment.value?.withholding?.accountCode ?? '')
const whtAmount = ref(editingPayment.value?.withholding ? String(editingPayment.value.withholding.amount) : '')
const whtAccountError = ref(false)
const whtAmountError = ref(false)
const whtAccountOptions = computed(() => WHT_ACCOUNTS.map(a => ({ id: a.code, name: `${a.code} ${a.name}` })))

// ── Line items ──────────────────────────────────────────────────────────────
interface PaymentRow {
  id: number
  invoiceId: string
  invoiceLabel: string
  dueDate: string
  balanceDue: number
  total: number
  amount: string
  error: string
}
let rowSeq = 0
function makeRow(invId: string, amount: string): PaymentRow {
  const inv = invoiceById(invId)
  if (!inv) return { id: rowSeq++, invoiceId: invId, invoiceLabel: invId, dueDate: '', balanceDue: 0, total: 0, amount, error: '' }
  const balance = invoiceBalanceAfterPayments(invId, isEdit.value ? props.orderId : undefined)
  return {
    id: rowSeq++, invoiceId: invId,
    invoiceLabel: invoiceLabel(inv.number),
    dueDate: toDisplayDate(inv.dueDate),
    balanceDue: balance, total: inv.total,
    amount, error: '',
  }
}

function buildInitialRows(): PaymentRow[] {
  if (isEdit.value && editingPayment.value) {
    const p = editingPayment.value
    const allocInvIds = new Set(p.allocations.map(a => a.invoiceId))
    const rows = p.allocations.map(a => makeRow(a.invoiceId, String(a.amount)))
    const siblings = payableInvoices(p.vendorId, p.id).filter(i => !allocInvIds.has(i.id))
    rows.push(...siblings.map(i => makeRow(i.id, '')))
    return rows
  }
  if (!sourceInvoice.value) return []
  const inv = sourceInvoice.value
  const balance = invoiceBalanceAfterPayments(inv.id)
  const siblings = payableInvoices(inv.vendor.id).filter(i => i.id !== inv.id)
  return [
    makeRow(inv.id, String(balance)),
    ...siblings.map(i => makeRow(i.id, '')),
  ]
}
const rows = ref<PaymentRow[]>(buildInitialRows())

const transactionCount = computed(() => rows.value.length)

const subtotal = computed(() => rows.value.reduce((s, r) => s + (Number(r.amount) || 0), 0))
const whtAmountNum = computed(() => whtEnabled.value ? (Number(whtAmount.value) || 0) : 0)
const totalAmount = computed(() => subtotal.value - whtAmountNum.value)

// ── Memo / Attachment ───────────────────────────────────────────────────────
const memo = ref(editingPayment.value?.memo ?? '')
const attachedFiles = ref<File[]>([])
function onAttachmentChange(files: FileList | null) {
  if (!files) return
  for (const f of Array.from(files)) {
    if (!attachedFiles.value.some(x => x.name === f.name)) attachedFiles.value.push(f)
  }
}
function removeAttachedFile(name: string) {
  attachedFiles.value = attachedFiles.value.filter(f => f.name !== name)
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

// ── Save ────────────────────────────────────────────────────────────────────
const totalError = ref('')

function handleSave() {
  let hasError = false
  totalError.value = ''
  rows.value.forEach(r => { r.error = '' })

  if (!depositToId.value) { depositToError.value = true; hasError = true }

  const allocations: PaymentAllocation[] = rows.value.map(r => ({ invoiceId: r.invoiceId, amount: Number(r.amount) || 0 }))
  const activeAllocations = allocations.filter(a => a.amount > 0)
  if (!activeAllocations.length) { totalError.value = t('Enter at least one payment amount'); hasError = true }

  for (const r of rows.value) {
    const amt = Number(r.amount) || 0
    if (amt < 0) { r.error = t('Amount must be positive'); hasError = true; continue }
    if (amt <= 0) continue
    const limit = invoiceBalanceAfterPayments(r.invoiceId, isEdit.value ? props.orderId : undefined)
    if (amt > limit) { r.error = `${t('Maximum')}: ${formatIDR(limit)}`; hasError = true }
  }

  if (whtEnabled.value) {
    if (!whtAccountCode.value) { whtAccountError.value = true; hasError = true }
    if (!(Number(whtAmount.value) > 0)) { whtAmountError.value = true; hasError = true }
  }

  if (hasError) return

  const draft: PaymentDraft = {
    vendorId: vendorId.value,
    depositToAccountId: depositToId.value,
    date: toISODate(transactionDate.value),
    paymentMethod: paymentMethod.value,
    referenceNo: referenceNo.value,
    allocations,
    withholding: whtEnabled.value ? { accountCode: whtAccountCode.value, amount: Number(whtAmount.value) || 0 } : null,
    memo: memo.value,
    tags: [],
    attachments: attachedFiles.value.map(f => ({ name: f.name, sizeKB: Math.round(f.size / 1024) })),
  }

  const result = isEdit.value
    ? updatePurchasePayment(props.orderId, draft)
    : createPurchasePayment(draft)

  if (!result.ok) return

  toast.notify({ variant: 'success', title: t('Payment saved'), rootProps: { class: 'toast-enterprise' } })
  router.push(`/purchase-payments/${result.id}`)
}

// ── Sticky footer ──────────────────────────────────────────────────────────
const stageEl = ref<HTMLElement | null>(null)
const overflowing = ref(false)
function checkOverflow() { const el = stageEl.value; if (el) overflowing.value = el.scrollHeight > el.clientHeight + 1 }
let ro: ResizeObserver | null = null
onMounted(() => { ro = new ResizeObserver(checkOverflow); if (stageEl.value) { ro.observe(stageEl.value); stageEl.value.addEventListener('scroll', checkOverflow, { passive: true }) } })
onUnmounted(() => ro?.disconnect())
</script>

<template>
  <div v-if="vendorId" class="cm-page">
    <header class="cm-bar">
      <div class="cm-bar-left">
        <nav class="cm-breadcrumb-trail">
          <MpButton variant="link" class="cm-breadcrumb" @click="router.push('/purchase-invoices')">{{ t('Purchase invoices') }}</MpButton>
          <span class="cm-breadcrumb-sep">/</span>
          <MpButton variant="link" class="cm-breadcrumb" @click="goBack">{{ invoiceNumber }}</MpButton>
        </nav>
        <div class="cm-titlerow-left">
          <h1 class="cm-title">{{ isEdit ? t('Edit payment') : t('Add payment') }}</h1>
        </div>
      </div>
    </header>

    <div ref="stageEl" class="cm-form-stage">

      <!-- Header row 1: Vendor / Email -->
      <div class="rp-grid rp-grid--first rp-dashed-divider" data-devchange="purchase-payment-header">
        <div class="rp-cell">
          <span class="rp-info-label">{{ t('Vendor') }}</span>
          <span class="rp-info-value">{{ vendorName }}</span>
        </div>
        <div class="rp-cell">
          <span class="rp-info-label">{{ t('Email') }}</span>
          <span v-for="email in vendorEmails" :key="email" class="rp-info-value">{{ email }}</span>
        </div>
      </div>

      <!-- Header row 2: Date paid / Transaction no. / Reference no. -->
      <div class="rp-grid rp-grid--fields">
        <MpFormControl id="rp-txdate" class="rp-cell">
          <MpFormLabel>{{ t('Date paid') }}</MpFormLabel>
          <div class="cm-datepicker">
            <MpDatePicker id="rp-txdate-dp" v-model="transactionDate" format="DD/MM/YYYY" value-type="format" use-portal />
          </div>
        </MpFormControl>
        <TransactionNoField field-id="rp-transno" :next-number="nextTxNo" class="rp-cell" />
        <MpFormControl id="rp-refno" class="rp-cell">
          <MpFormLabel>{{ t('Reference no.') }}</MpFormLabel>
          <MpInput id="rp-refno-input" v-model="referenceNo" is-full-width />
        </MpFormControl>
      </div>

      <!-- Header row 3: Account / Payment method -->
      <div class="rp-grid rp-grid--fields rp-grid--last">
        <MpFormControl id="rp-account" class="rp-cell" :is-invalid="depositToError">
          <MpFormLabel>{{ t('Account') }}<span class="rp-required">*</span></MpFormLabel>
          <MpAutocomplete
            id="rp-account-ac"
            v-model="depositToId"
            :data="depositAccounts"
            label-prop="name" value-prop="id"
            is-searchable is-clearable use-portal is-full-width
            :is-invalid="depositToError"
            @update:model-value="depositToError = false"
          />
          <MpFormErrorMessage>{{ t('You must select an account') }}</MpFormErrorMessage>
        </MpFormControl>
        <MpFormControl id="rp-method" class="rp-cell">
          <MpFormLabel>{{ t('Payment method') }}</MpFormLabel>
          <MpAutocomplete
            id="rp-method-ac"
            v-model="paymentMethod"
            :data="paymentMethodOptions"
            label-prop="name" value-prop="id"
            use-portal is-full-width
          />
        </MpFormControl>
      </div>

      <!-- Line items table -->
      <MpBanner v-if="totalError" id="rp-error-banner" variant="danger" align-items="center" class="rp-error-banner">
        <MpBannerIcon id="rp-error-banner-icon" />
        <MpBannerTitle>{{ t('Failed to save') }}</MpBannerTitle>
        <MpBannerDescription>{{ totalError }}</MpBannerDescription>
      </MpBanner>
      <div class="cm-form-table-section">
        <table class="cm-form-table">
          <colgroup>
            <col class="rp-col-number" />
            <col class="rp-col-due" />
            <col class="cm-col-num" />
            <col class="cm-col-num" />
            <col class="cm-col-amount" />
          </colgroup>
          <thead>
            <tr>
              <th class="cm-ft-th">{{ t('Number') }}</th>
              <th class="cm-ft-th">{{ t('Due date') }}</th>
              <th class="cm-ft-th cm-ft-th--num">{{ t('Balance due') }}</th>
              <th class="cm-ft-th cm-ft-th--num">{{ t('Total') }}</th>
              <th class="cm-ft-th">{{ t('Amount paid') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td class="cm-ft-td cm-ft-td--read cm-ft-td--border">{{ row.invoiceLabel }}</td>
              <td class="cm-ft-td cm-ft-td--read cm-ft-td--border">{{ row.dueDate }}</td>
              <td class="cm-ft-td cm-ft-td--read cm-ft-td--num cm-ft-td--border">{{ formatIDR(row.balanceDue) }}</td>
              <td class="cm-ft-td cm-ft-td--read cm-ft-td--num cm-ft-td--border">{{ formatIDR(row.total) }}</td>
              <td class="cm-ft-td cm-ft-td--input" :class="{ 'cm-ft-td--error': row.error }">
                <div class="cm-amount-cell">
                  <span class="cm-amount-prefix">Rp</span>
                  <MpInput :id="`rp-amount-${row.id}`" v-model="row.amount" type="number" is-full-width class="cm-amount-input" :is-invalid="!!row.error" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <p class="rp-txn-count">{{ t('Showing') }} {{ transactionCount }} {{ t('of') }} {{ transactionCount }} {{ t('transactions') }}</p>
        <p v-for="row in rows.filter(r => r.error)" :key="`e-${row.id}`" class="cm-form-error">{{ row.invoiceLabel }}: {{ row.error }}</p>
      </div>

      <!-- Notes + Attachment + Totals (same layout as New Sales Invoice) -->
      <section class="rp-bottom-section">
        <div class="rp-notes-col">
          <MpFormControl id="rp-memo" class="rp-note-field">
            <MpFormLabel class="rp-memo-label">{{ t('Memo') }}</MpFormLabel>
            <MpTextarea id="rp-memo-textarea" v-model="memo" is-full-width :rows="3" />
            <span class="rp-field-caption">{{ t('Only visible to you and your team') }}</span>
          </MpFormControl>

          <div class="rp-attachment-section">
            <span class="rp-attachment-label">{{ t('Attachment') }}</span>
            <MpUpload
              id="rp-attachment-upload"
              accept=".xls,.xlsx,.doc,.docx,.pdf,.jpg,.jpeg,.png,.zip"
              is-multiple is-full-width
              :placeholder="t('or drag and drop here')"
              :button-text="t('Choose file')"
              @change="onAttachmentChange"
            />
            <p class="rp-field-caption">{{ t('Files must be in XLS, DOC, PDF, JPG, PNG, or ZIP format, with a maximum size of 10 MB per file and 5 files per transaction') }}</p>
            <div v-if="attachedFiles.length" class="rp-attachment-list">
              <MpUploadList
                v-for="f in attachedFiles" :key="f.name"
                :id="`rp-attachment-file-${f.name}`"
                :title="f.name" status="success" :subtitle="t('Uploaded')"
                :icon-name="fileIconName(f.name)"
                is-show-remove-button
                @remove="removeAttachedFile(f.name)"
              />
            </div>
          </div>
        </div>

        <div class="rp-totals-col" data-devchange="purchase-payment-wht">
          <div class="rp-totals-row">
            <span>{{ t('Subtotal') }}</span>
            <span>{{ formatIDR(subtotal) }}</span>
          </div>

          <div class="rp-less-check">
            <MpCheckbox id="rp-wht-check" v-model:is-checked="whtEnabled">
              {{ t('Less: Withholding tax') }}
            </MpCheckbox>
          </div>
          <div v-if="whtEnabled" class="rp-less-rows">
            <div class="rp-wht-toprow">
              <MpFormControl id="rp-wht-account" :is-invalid="whtAccountError">
                <MpFormLabel>{{ t('Withholding tax') }}</MpFormLabel>
                <MpAutocomplete
                  id="rp-wht-account-ac"
                  v-model="whtAccountCode"
                  :data="whtAccountOptions"
                  label-prop="name" value-prop="id"
                  is-searchable is-clearable use-portal is-full-width
                  :is-invalid="whtAccountError"
                  @update:model-value="whtAccountError = false"
                />
                <MpFormErrorMessage>{{ t('Select a withholding tax account') }}</MpFormErrorMessage>
              </MpFormControl>
              <MpFormControl id="rp-wht-amount" :is-invalid="whtAmountError">
                <MpFormLabel>{{ t('Amount') }}</MpFormLabel>
                <MpInputGroup id="rp-wht-amount-group">
                  <MpInputLeftAddon has-background>Rp</MpInputLeftAddon>
                  <MpInput id="rp-wht-amount-input" v-model="whtAmount" type="number" is-full-width :is-invalid="whtAmountError" @update:model-value="whtAmountError = false" />
                </MpInputGroup>
                <MpFormErrorMessage>{{ t('Amount must be positive') }}</MpFormErrorMessage>
              </MpFormControl>
            </div>
          </div>

          <div class="rp-total-rule" />
          <div class="rp-totals-row rp-totals-row--h3">
            <span>{{ t('Total') }}</span>
            <span>{{ formatIDR(totalAmount) }}</span>
          </div>
        </div>
      </section>
    </div>

    <footer class="cm-form-footer" :class="{ 'cm-form-footer--floating': overflowing }">
      <MpButton variant="ghost" is-rounded @click="goBack">{{ t('Cancel') }}</MpButton>
      <MpButton variant="primary" is-rounded @click="handleSave">{{ t('Save') }}</MpButton>
    </footer>
  </div>

  <div v-else class="bd-not-found">
    <p>{{ t('Invoice not found.') }}</p>
    <MpTextlink id="rp-not-found-back" as="a" class="detail-breadcrumb" @click.prevent="router.push('/purchase-invoices')">{{ t('Back to Purchase Invoices') }}</MpTextlink>
  </div>
</template>

<style scoped>
/* ── 12-column grid ── */
.rp-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  column-gap: var(--mp-spacing-6);
  padding: var(--mp-spacing-5) 0 0;
}
.rp-grid--first { padding-top: 0; }
.rp-dashed-divider {
  padding-bottom: var(--mp-spacing-5);
  border-bottom: 1px dashed var(--mp-border-default, #e3e7e9);
}
.rp-grid--fields { padding: var(--mp-spacing-5) 0 0; align-items: flex-end; }
.rp-grid--last { padding-bottom: var(--mp-spacing-6); }
.rp-cell { grid-column: span 3; }

/* ── Vendor info (read-only text) ── */
.rp-info-label {
  display: block;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle);
  line-height: var(--mp-line-heights-sm, 16px); margin-bottom: 2px;
}
.rp-info-value {
  display: block;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md, 20px);
}
.rp-required { color: var(--mp-text-danger, #dc2626); margin-left: 2px; }

.rp-error-banner { margin-bottom: var(--mp-spacing-5); }

/* ── Table column widths ── */
.rp-col-number { width: 240px; }
.rp-col-due { width: 160px; }

/* ── Transaction count ── */
.rp-txn-count {
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle);
  padding: var(--mp-spacing-3) var(--mp-spacing-2\.5, 10px);
  margin: 0;
}

/* ── Memo label ── */
.rp-memo-label { font-weight: var(--mp-font-weights-semi-bold); }

/* ── Bottom section (same layout as New Sales Invoice) ── */
.rp-bottom-section { display: flex; align-items: flex-start; gap: var(--mp-spacing-6); padding-top: var(--mp-spacing-6); }
.rp-notes-col { display: flex; flex-direction: column; gap: 20px; width: 432px; flex-shrink: 0; }
.rp-note-field { display: flex; flex-direction: column; }
.rp-field-caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm); margin-top: var(--mp-spacing-1); }
.rp-attachment-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.rp-attachment-section :deep(.mp-upload__root:focus-within) {
  border-color: var(--mp-border-default);
  outline: 1px solid var(--mp-border-default);
}
.rp-attachment-section :deep(.mp-button:focus-visible) {
  border-color: var(--mp-border-default) !important;
  outline: 1px solid var(--mp-border-default) !important;
}
.rp-attachment-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rp-attachment-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-1); }

/* ── Totals column ── */
.rp-totals-col { margin-left: auto; width: 428px; flex-shrink: 0; display: flex; flex-direction: column; }
.rp-totals-row {
  display: flex; justify-content: space-between; align-items: center;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-2) 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}
.rp-totals-row--h3 { font-weight: var(--mp-font-weights-semi-bold); font-size: var(--mp-font-sizes-lg); }
.rp-total-rule {
  height: var(--mp-border-width-sm, 1px); margin: var(--mp-spacing-2) 0;
  background: repeating-linear-gradient(
    to right,
    var(--mp-border-default) 0,
    var(--mp-border-default) 4px,
    transparent 4px,
    transparent 8px
  );
}

/* ── WHT fields ── */
.rp-less-check { padding: var(--mp-spacing-2) 0; }
.rp-less-rows { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.rp-wht-toprow { display: flex; gap: var(--mp-spacing-4); }
.rp-wht-toprow > * { flex: 1; min-width: 0; }

.bd-not-found { padding: var(--mp-spacing-6); }
</style>
