<script setup lang="ts">
/**
 * Apply credit memo (Sales › Sales invoices › Apply credit memo).
 *
 * Figma: "Sales Invoices / Apply Credit Memo". Spends one credit memo across the
 * customer's open invoices. Reachable from:
 *   • an invoice   → /sales-invoices/:id/apply-credit-memo  (that invoice pre-filled)
 *   • a credit memo→ /credit-memos/:id/apply                (that memo pre-selected)
 *   • edit         → /credit-memo-applications/:id/edit
 * The customer is fixed by the entry point (you can't apply one customer's credit
 * to another's invoice). Footer actions are always present; preconditions are
 * surfaced as inline errors on submit, never by disabling Save (rule/form-*).
 */
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  MpButton, MpInput, MpAutocomplete, MpDatePicker, MpTextarea, MpUpload, MpUploadList,
  MpFormControl, MpFormLabel,
} from '@mekari/pixel3'
import { successToast } from '~/utils/toasts'
import { formatIDR } from '~/utils/currency'
import TransactionNoField from '~/components/patterns/TransactionNoField.vue'
import {
  getCreditMemo, getApplication, invoiceById, customerNameOf, customerAvailableCredit,
  memosForCustomer, memoRemaining, memoLabel, invoiceLabel, applicableInvoices, invoiceBalance,
  validateApplication, createApplication, updateApplication, nextApplicationNumber,
  type ApplicationErrors, type FieldError,
} from '~/data/creditMemos'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const route = useRoute()
const router = useRouter()

// ── Entry point ─────────────────────────────────────────────────────────────────
const segs = computed(() => route.path.split('/').filter(Boolean))
const mode = computed<'from-invoice' | 'from-memo' | 'edit'>(() => {
  if (segs.value[0] === 'credit-memo-applications') return 'edit'
  if (segs.value[0] === 'credit-memos') return 'from-memo'
  return 'from-invoice'
})
const editingId = computed(() => (mode.value === 'edit' ? props.orderId : undefined))
const sourceInvoice = computed(() => (mode.value === 'from-invoice' ? invoiceById(props.orderId) : undefined))
const sourceMemo = computed(() => (mode.value === 'from-memo' ? getCreditMemo(props.orderId) : undefined))
const editing = computed(() => (editingId.value ? getApplication(editingId.value) : undefined))

// Resolve the customer context (always fixed).
const customerId = computed(() =>
  sourceInvoice.value?.customer.id ?? sourceMemo.value?.customerId ?? editing.value?.customerId ?? '',
)

// ── Form state ───────────────────────────────────────────────────────────────────
const creditMemoId = ref('')
const transactionDate = ref(displayToday())
const memo = ref('')
const amounts = ref<Record<string, string>>({})       // invoiceId → display amount
const attachedFiles = ref<File[]>([])

function displayToday() { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` }
function toISO(display: string) { const [d, m, y] = display.split('/'); return `${y}-${m}-${d}` }
function num(s: string | undefined): number { return Number(String(s ?? '').replace(/\./g, '')) || 0 }
function onAmountInput(invoiceId: string, val: string | number) {
  const digits = String(val).replace(/\D/g, '')
  amounts.value[invoiceId] = digits ? Number(digits).toLocaleString('id-ID') : ''
  clearRowError(invoiceId)
}

// ── Options & rows ─────────────────────────────────────────────────────────────
const memoOptions = computed(() =>
  memosForCustomer(customerId.value)
    .filter((m) => memoRemaining(m.id, { applicationId: editingId.value }) > 0 || m.id === creditMemoId.value)
    .map((m) => ({ id: m.id, name: memoLabel(m.number) })),
)
const selectedMemo = computed(() => getCreditMemo(creditMemoId.value))
const availableCredit = computed(() => (selectedMemo.value ? memoRemaining(selectedMemo.value.id, { applicationId: editingId.value }) : 0))

// Invoices the credit can go to — the customer's open invoices (+ any already in
// the edited application), oldest first. The source invoice (if any) floats to top.
const rows = computed(() => {
  const list = applicableInvoices(customerId.value, editingId.value)
  if (sourceInvoice.value) {
    const i = list.findIndex((x) => x.id === sourceInvoice.value!.id)
    if (i > 0) { const [row] = list.splice(i, 1); list.unshift(row!) }
    else if (i === -1 && sourceInvoice.value) list.unshift(sourceInvoice.value)
  }
  return list
})
function rowBalance(invoiceId: string) { return invoiceBalance(invoiceId, editingId.value) }

const amountToCredit = computed(() => rows.value.reduce((s, r) => s + num(amounts.value[r.id]), 0))
const remainingAfter = computed(() => Math.max(0, availableCredit.value - amountToCredit.value))
const nextTxNo = computed(() => `${t('Credit memo applied')} #${nextApplicationNumber()}`)

// ── Validation ───────────────────────────────────────────────────────────────────
const errors = ref<ApplicationErrors>({ rows: {} })
function clearRowError(invoiceId: string) { if (errors.value.rows[invoiceId]) { delete errors.value.rows[invoiceId]; errors.value.total = undefined } }
function fieldError(e?: FieldError): string {
  if (!e) return ''
  switch (e.code) {
    case 'REQUIRED': return t('This field is required')
    case 'AMOUNT_POSITIVE': return t('Enter an amount greater than 0')
    case 'OVER_BALANCE': return `${t('Cannot exceed the balance due')} (${formatIDR(e.limit)})`
    case 'OVER_AVAILABLE': return `${t('Exceeds the available credit')} (${formatIDR(e.limit)})`
    case 'BEFORE_MEMO_DATE': return t('Date cannot be before the credit memo date')
    case 'BEFORE_INVOICE_DATE': return t('Date cannot be before the invoice date')
    case 'NOTHING_ENTERED': return t('Enter an amount to apply on at least one invoice')
    default: return t('Check this value')
  }
}

function buildDraft() {
  return {
    customerId: customerId.value,
    creditMemoId: creditMemoId.value,
    date: toISO(transactionDate.value),
    allocations: rows.value.map((r) => ({ invoiceId: r.id, amount: num(amounts.value[r.id]) })),
    memo: memo.value,
    attachments: attachedFiles.value.map((f) => ({ name: f.name, sizeKB: Math.round(f.size / 1024) })),
  }
}
function save() {
  const draft = buildDraft()
  const v = validateApplication(draft, editingId.value)
  errors.value = v.errors
  if (!v.ok) return
  const res = editingId.value ? updateApplication(editingId.value, draft) : createApplication(draft)
  if (res.ok) {
    successToast(editingId.value ? t('Credit memo applied saved') : t('Credit memo applied'))
    router.push(`/credit-memo-applications/${res.id}`)
  }
}
function cancel() {
  if (mode.value === 'from-invoice') router.push(`/sales-invoices/${props.orderId}`)
  else if (mode.value === 'from-memo') router.push(`/credit-memos/${props.orderId}`)
  else if (editing.value) router.push(`/credit-memo-applications/${props.orderId}`)
  else router.push('/sales-invoices')
}

function onFiles(files: FileList | null) {
  if (!files) return
  for (const f of Array.from(files)) if (!attachedFiles.value.some((x) => x.name === f.name)) attachedFiles.value.push(f)
}
function removeFile(name: string) { attachedFiles.value = attachedFiles.value.filter((f) => f.name !== name) }
function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'pdf-document'
  if (['doc', 'docx'].includes(ext)) return 'word-document'
  if (['xls', 'xlsx'].includes(ext)) return 'excel-document'
  if (['jpg', 'jpeg', 'png'].includes(ext)) return 'image-document'
  return 'attachment'
}

// ── Prefill ────────────────────────────────────────────────────────────────────
onMounted(() => {
  if (editing.value) {
    creditMemoId.value = editing.value.creditMemoId
    transactionDate.value = displayFrom(editing.value.date)
    memo.value = editing.value.memo
    for (const al of editing.value.allocations) amounts.value[al.invoiceId] = al.amount.toLocaleString('id-ID')
  } else if (sourceMemo.value) {
    creditMemoId.value = sourceMemo.value.id
  } else {
    // From an invoice → default to the customer's first memo with remaining credit,
    // then pre-apply that credit to THIS invoice (capped by its balance due), so the
    // common case — "I opened this invoice to credit it" — is one click. The
    // customer's other open invoices stay at 0. (Figma: source invoice pre-filled.)
    creditMemoId.value = memoOptions.value[0]?.id ?? ''
    if (sourceInvoice.value && creditMemoId.value) {
      const prefill = Math.min(
        memoRemaining(creditMemoId.value, { applicationId: editingId.value }),
        invoiceBalance(sourceInvoice.value.id, editingId.value),
      )
      if (prefill > 0) amounts.value[sourceInvoice.value.id] = prefill.toLocaleString('id-ID')
    }
  }
  nextTick(checkOverflow)
})
function displayFrom(iso: string) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }

// Sticky-footer border once the stage scrolls.
const stageEl = ref<HTMLElement | null>(null)
const overflowing = ref(false)
function checkOverflow() { const el = stageEl.value; if (el) overflowing.value = el.scrollHeight > el.clientHeight + 1 }
let ro: ResizeObserver | null = null
onMounted(() => { ro = new ResizeObserver(checkOverflow); if (stageEl.value) { ro.observe(stageEl.value); stageEl.value.addEventListener('scroll', checkOverflow, { passive: true }) } })
onUnmounted(() => ro?.disconnect())

const breadcrumbLabel = computed(() => {
  if (sourceInvoice.value) return invoiceLabel(sourceInvoice.value.number)
  if (sourceMemo.value) return memoLabel(sourceMemo.value.number)
  if (editing.value) return `${t('Credit memo applied')} #${editing.value.number}`
  return t('Sales invoices')
})
</script>

<template>
  <div class="cm-page">
    <header class="cm-bar">
      <div class="cm-bar-left">
        <nav class="cm-breadcrumb-trail">
          <MpButton class="cm-breadcrumb" @click="cancel">{{ t('Sales invoices') }}</MpButton>
          <span class="cm-breadcrumb-sep">/</span>
          <span class="cm-breadcrumb cm-breadcrumb--static">{{ breadcrumbLabel }}</span>
        </nav>
        <div class="cm-titlerow-left">
          <h1 class="cm-title">{{ editingId ? t('Edit credit memo applied') : t('Apply credit memo') }}</h1>
        </div>
      </div>
    </header>

    <div ref="stageEl" class="cm-form-stage">
      <!-- Customer + Credit memo + Available credit -->
      <div class="cm-form-row1">
        <MpFormControl id="apply-customer" class="cm-form-field" is-required>
          <MpFormLabel>{{ t('Customer') }}</MpFormLabel>
          <MpInput id="apply-customer-input" :model-value="customerNameOf(customerId)" is-full-width is-disabled />
        </MpFormControl>
        <MpFormControl id="apply-memo" class="cm-form-field" is-required :is-invalid="!!errors.creditMemo">
          <MpFormLabel>{{ t('Credit memo') }}</MpFormLabel>
          <MpAutocomplete
            id="apply-memo-ac" v-model="creditMemoId" :data="memoOptions"
            label-prop="name" value-prop="id" is-searchable use-portal is-full-width
            :placeholder="t('Select credit memo')" :is-invalid="!!errors.creditMemo"
            data-devchange="apply-cm-form"
            @update:model-value="errors.creditMemo = undefined"
          />
          <p v-if="errors.creditMemo" class="cm-form-error">{{ fieldError(errors.creditMemo) }}</p>
        </MpFormControl>
        <div class="cm-form-right">
          <div class="cm-primary-figure">
            <span class="cm-figure-label">{{ t('Available credit') }}</span>
            <span class="cm-figure-amount">{{ formatIDR(availableCredit) }}</span>
          </div>
        </div>
      </div>

      <!-- Transaction date / Transaction no. -->
      <div class="cm-form-grid2">
        <MpFormControl id="apply-date" is-required :is-invalid="!!errors.date">
          <MpFormLabel>{{ t('Transaction date') }}</MpFormLabel>
          <div class="cm-datepicker">
            <MpDatePicker id="apply-date-dp" v-model="transactionDate" format="DD/MM/YYYY" value-type="format" use-portal @update:model-value="errors.date = undefined" />
          </div>
          <p v-if="errors.date" class="cm-form-error">{{ fieldError(errors.date) }}</p>
        </MpFormControl>
        <TransactionNoField field-id="apply-no" :next-number="nextTxNo" />
      </div>

      <!-- Allocation table -->
      <div class="cm-form-table-section">
        <table class="cm-form-table">
          <colgroup>
            <col class="cm-col-date" /><col class="cm-col-grow" /><col class="cm-col-num" /><col class="cm-col-num" /><col class="cm-col-amount" />
          </colgroup>
          <thead>
            <tr>
              <th class="cm-ft-th">{{ t('Date') }}</th>
              <th class="cm-ft-th">{{ t('Number') }}</th>
              <th class="cm-ft-th cm-ft-th--num">{{ t('Balance due') }}</th>
              <th class="cm-ft-th cm-ft-th--num">{{ t('Total') }}</th>
              <th class="cm-ft-th">{{ t('Amount to apply') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id">
              <td class="cm-ft-td cm-ft-td--read cm-ft-td--border">{{ new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(r.date)) }}</td>
              <td class="cm-ft-td cm-ft-td--read cm-ft-td--border">{{ invoiceLabel(r.number) }}</td>
              <td class="cm-ft-td cm-ft-td--read cm-ft-td--num cm-ft-td--border">{{ formatIDR(rowBalance(r.id)) }}</td>
              <td class="cm-ft-td cm-ft-td--read cm-ft-td--num cm-ft-td--border">{{ formatIDR(r.total) }}</td>
              <td class="cm-ft-td cm-ft-td--input" :class="{ 'cm-ft-td--error': errors.rows[r.id] }">
                <div class="cm-amount-cell">
                  <span class="cm-amount-prefix">Rp</span>
                  <MpInput :id="`apply-amt-${r.id}`" :model-value="amounts[r.id] ?? ''" inputmode="numeric" is-full-width class="cm-amount-input" :placeholder="'0'" @update:model-value="(v: string) => onAmountInput(r.id, v)" />
                </div>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td class="cm-ft-td cm-td--muted" colspan="5">{{ t('This customer has no open invoices to apply credit to.') }}</td>
            </tr>
          </tbody>
        </table>
        <p v-for="r in rows.filter(x => errors.rows[x.id])" :key="`e-${r.id}`" class="cm-form-error">{{ invoiceLabel(r.number) }}: {{ fieldError(errors.rows[r.id]) }}</p>
        <div class="cm-ft-count">{{ t('Showing') }} {{ rows.length }} {{ t('of') }} {{ rows.length }} {{ t('transactions') }}</div>
      </div>

      <!-- Memo + Amount to credit / Remaining credit -->
      <div class="cm-form-summary">
        <div class="cm-form-memo">
          <MpFormControl id="apply-memo-note">
            <MpFormLabel>{{ t('Memo') }}</MpFormLabel>
            <MpTextarea id="apply-memo-textarea" v-model="memo" is-full-width :rows="4" />
          </MpFormControl>
          <p class="cm-helper">{{ t('Only visible to you and your team') }}</p>
        </div>
        <div class="cm-form-totals">
          <div class="cm-total-row">
            <span class="cm-total-label cm-total-label--strong">{{ t('Amount to credit') }}</span>
            <span class="cm-total-amt cm-total-amt--strong">{{ formatIDR(amountToCredit) }}</span>
          </div>
          <div class="cm-total-row">
            <span class="cm-total-label">{{ t('Remaining credit') }}</span>
            <span class="cm-total-amt">{{ formatIDR(remainingAfter) }}</span>
          </div>
          <p v-if="errors.total" class="cm-form-error">{{ fieldError(errors.total) }}</p>
        </div>
      </div>

      <!-- Attachment -->
      <div class="cm-attach-section">
        <div class="cm-section-label">{{ t('Attachment') }}</div>
        <MpUpload
          id="apply-upload" accept=".xls,.xlsx,.doc,.docx,.pdf,.jpg,.jpeg,.png,.zip" is-multiple is-full-width
          :placeholder="t('or drag and drop here')" :button-text="t('Choose file')" @change="onFiles"
        />
        <p class="cm-helper">{{ t('Files must be in XLS, DOC, PDF, JPG, PNG, or ZIP with a maximum of 10 MB per file and 5 files per transaction') }}</p>
        <MpUploadList
          v-for="f in attachedFiles" :key="f.name" :id="`apply-file-${f.name}`"
          :title="f.name" status="success" :subtitle="t('Uploaded')" :icon-name="fileIcon(f.name)"
          is-show-remove-button @remove="removeFile(f.name)"
        />
      </div>
    </div>

    <footer class="cm-form-footer" :class="{ 'cm-form-footer--floating': overflowing }">
      <MpButton variant="ghost" is-rounded @click="cancel">{{ t('Cancel') }}</MpButton>
      <MpButton variant="primary" is-rounded data-devchange="apply-cm-save" @click="save">{{ editingId ? t('Save changes') : t('Save') }}</MpButton>
    </footer>
  </div>
</template>
