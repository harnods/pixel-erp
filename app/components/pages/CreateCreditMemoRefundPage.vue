<script setup lang="ts">
/**
 * Create credit memo refund (Sales › Sales invoices › Create credit memo refund).
 *
 * Figma: "Credit Memo / Create Credit Memo Refund". Pays a customer's remaining
 * credit back in cash from a bank/cash account, across one or more of their credit
 * memos. Reachable from a credit memo (/credit-memos/:id/refund) or edit
 * (/credit-memo-refunds/:id/edit). Customer is fixed by the memo context. Footer
 * always present; preconditions surface as inline errors on submit (rule/form-*).
 */
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  MpButton, MpInput, MpAutocomplete, MpDatePicker, MpTextarea, MpUpload, MpUploadList,
  MpFormControl, MpFormLabel, MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
} from '@mekari/pixel3'
import { successToast } from '~/utils/toasts'
import { formatIDR } from '~/utils/currency'
import {
  getCreditMemo, getRefund, customerNameOf, memosForCustomer, memoRemaining, memoLabel,
  refundPayFromAccounts, validateRefund, createRefund, updateRefund,
  type RefundErrors, type FieldError,
} from '~/data/creditMemos'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const route = useRoute()
const router = useRouter()

const segs = computed(() => route.path.split('/').filter(Boolean))
const mode = computed<'from-memo' | 'edit'>(() => (segs.value[0] === 'credit-memo-refunds' ? 'edit' : 'from-memo'))
const editingId = computed(() => (mode.value === 'edit' ? props.orderId : undefined))
const sourceMemo = computed(() => (mode.value === 'from-memo' ? getCreditMemo(props.orderId) : undefined))
const editing = computed(() => (editingId.value ? getRefund(editingId.value) : undefined))
const customerId = computed(() => sourceMemo.value?.customerId ?? editing.value?.customerId ?? '')

// ── State ────────────────────────────────────────────────────────────────────────
const payFromAccountId = ref('')
const transactionDate = ref(displayToday())
const memo = ref('')
const amounts = ref<Record<string, string>>({})     // creditMemoId → display amount
const reasons = ref<Record<string, string>>({})
const attachedFiles = ref<File[]>([])

function displayToday() { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` }
function toISO(display: string) { const [d, m, y] = display.split('/'); return `${y}-${m}-${d}` }
function displayFrom(iso: string) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
function num(s: string | undefined): number { return Number(String(s ?? '').replace(/\./g, '')) || 0 }
function onAmountInput(id: string, val: string | number) {
  const digits = String(val).replace(/\D/g, '')
  amounts.value[id] = digits ? Number(digits).toLocaleString('id-ID') : ''
  if (errors.value.rows[id]) { delete errors.value.rows[id]; errors.value.total = undefined }
}

const payFromOptions = computed(() => refundPayFromAccounts().map((a) => ({ id: a.id, name: `${a.code} ${a.name}` })))
const rows = computed(() =>
  memosForCustomer(customerId.value).filter((m) => memoRemaining(m.id, { refundId: editingId.value }) > 0 || (editing.value?.lines.some((l) => l.creditMemoId === m.id))),
)
function rowAvailable(memoId: string) { return memoRemaining(memoId, { refundId: editingId.value }) }
const totalRefund = computed(() => rows.value.reduce((s, r) => s + num(amounts.value[r.id]), 0))

// ── Validation ───────────────────────────────────────────────────────────────────
const errors = ref<RefundErrors>({ rows: {} })
function fieldError(e?: FieldError): string {
  if (!e) return ''
  switch (e.code) {
    case 'REQUIRED': return t('This field is required')
    case 'AMOUNT_POSITIVE': return t('Enter an amount greater than 0')
    case 'OVER_AVAILABLE': return `${t('Exceeds the available credit')} (${formatIDR(e.limit)})`
    case 'BEFORE_MEMO_DATE': return t('Date cannot be before the credit memo date')
    case 'NOTHING_ENTERED': return t('Enter a refund amount on at least one credit memo')
    default: return t('Check this value')
  }
}
const hasError = computed(() => !!errors.value.payFrom || !!errors.value.date || !!errors.value.total || Object.keys(errors.value.rows).length > 0)

function buildDraft() {
  return {
    customerId: customerId.value,
    payFromAccountId: payFromAccountId.value,
    date: toISO(transactionDate.value),
    lines: rows.value.map((r) => ({ creditMemoId: r.id, reason: reasons.value[r.id] ?? '', amount: num(amounts.value[r.id]) })),
    memo: memo.value,
    attachments: attachedFiles.value.map((f) => ({ name: f.name, sizeKB: Math.round(f.size / 1024) })),
  }
}
function save() {
  const draft = buildDraft()
  const v = validateRefund(draft, editingId.value)
  errors.value = v.errors
  if (!v.ok) return
  const res = editingId.value ? updateRefund(editingId.value, draft) : createRefund(draft)
  if (res.ok) {
    successToast(editingId.value ? t('Credit memo refund saved') : t('Credit memo refund created'))
    router.push(`/credit-memo-refunds/${res.id}`)
  }
}
function cancel() {
  if (mode.value === 'from-memo') router.push(`/credit-memos/${props.orderId}`)
  else if (editing.value) router.push(`/credit-memo-refunds/${props.orderId}`)
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

onMounted(() => {
  if (editing.value) {
    payFromAccountId.value = editing.value.payFromAccountId
    transactionDate.value = displayFrom(editing.value.date)
    memo.value = editing.value.memo
    for (const l of editing.value.lines) { amounts.value[l.creditMemoId] = l.amount.toLocaleString('id-ID'); reasons.value[l.creditMemoId] = l.reason }
  } else if (sourceMemo.value) {
    // default reason to the memo's own reason, prefill the source row's remaining
    reasons.value[sourceMemo.value.id] = 'Customer requested cash refund'
  }
  nextTick(checkOverflow)
})

const stageEl = ref<HTMLElement | null>(null)
const overflowing = ref(false)
function checkOverflow() { const el = stageEl.value; if (el) overflowing.value = el.scrollHeight > el.clientHeight + 1 }
let ro: ResizeObserver | null = null
onMounted(() => { ro = new ResizeObserver(checkOverflow); if (stageEl.value) { ro.observe(stageEl.value); stageEl.value.addEventListener('scroll', checkOverflow, { passive: true }) } })
onUnmounted(() => ro?.disconnect())

const breadcrumbLabel = computed(() => {
  if (sourceMemo.value) return memoLabel(sourceMemo.value.number)
  if (editing.value) return `${t('Credit memo refund')} #${editing.value.number}`
  return t('Credit memo')
})
</script>

<template>
  <div class="cm-page">
    <header class="cm-bar">
      <div class="cm-bar-left">
        <nav class="cm-breadcrumb-trail">
          <MpButton class="cm-breadcrumb" @click="cancel">{{ breadcrumbLabel }}</MpButton>
        </nav>
        <div class="cm-titlerow-left">
          <h1 class="cm-title">{{ editingId ? t('Edit credit memo refund') : t('Create credit memo refund') }}</h1>
        </div>
      </div>
    </header>

    <div ref="stageEl" class="cm-form-stage">
      <MpBanner v-if="hasError" id="refund-error-banner" variant="danger" align-items="center" class="cm-inline-banner">
        <MpBannerIcon id="refund-error-banner-icon" />
        <MpBannerTitle>{{ t('Could not create the refund') }}</MpBannerTitle>
        <MpBannerDescription>{{ t('Review the highlighted fields below.') }}</MpBannerDescription>
      </MpBanner>

      <!-- Pay from + Customer + Refund amount -->
      <div class="cm-form-row1">
        <MpFormControl id="refund-payfrom" class="cm-form-field" is-required :is-invalid="!!errors.payFrom">
          <MpFormLabel>{{ t('Pay from') }}</MpFormLabel>
          <MpAutocomplete
            id="refund-payfrom-ac" v-model="payFromAccountId" :data="payFromOptions"
            label-prop="name" value-prop="id" is-searchable use-portal is-full-width
            :placeholder="t('Select account')" :is-invalid="!!errors.payFrom"
            data-devchange="refund-cm-form"
            @update:model-value="errors.payFrom = undefined"
          />
          <p v-if="errors.payFrom" class="cm-form-error">{{ fieldError(errors.payFrom) }}</p>
        </MpFormControl>
        <MpFormControl id="refund-customer" class="cm-form-field" is-required>
          <MpFormLabel>{{ t('Customer') }}</MpFormLabel>
          <MpInput id="refund-customer-input" :model-value="customerNameOf(customerId)" is-full-width is-disabled />
        </MpFormControl>
        <div class="cm-form-right">
          <div class="cm-primary-figure">
            <span class="cm-figure-label">{{ t('Refund amount') }}</span>
            <span class="cm-figure-amount">{{ formatIDR(totalRefund) }}</span>
          </div>
        </div>
      </div>

      <!-- Transaction date / Transaction no. -->
      <div class="cm-form-grid2">
        <MpFormControl id="refund-date" is-required :is-invalid="!!errors.date">
          <MpFormLabel>{{ t('Transaction date') }}</MpFormLabel>
          <div class="cm-datepicker">
            <MpDatePicker id="refund-date-dp" v-model="transactionDate" format="DD/MM/YYYY" value-type="format" use-portal @update:model-value="errors.date = undefined" />
          </div>
          <p v-if="errors.date" class="cm-form-error">{{ fieldError(errors.date) }}</p>
        </MpFormControl>
        <MpFormControl id="refund-no">
          <MpFormLabel>{{ t('Transaction no.') }}</MpFormLabel>
          <MpInput id="refund-no-input" :model-value="t('Auto')" is-full-width is-disabled />
        </MpFormControl>
      </div>

      <!-- Refund table -->
      <div class="cm-form-table-section">
        <table class="cm-form-table">
          <colgroup>
            <col class="cm-col-amount" /><col class="cm-col-grow" /><col class="cm-col-num" /><col class="cm-col-amount" />
          </colgroup>
          <thead>
            <tr>
              <th class="cm-ft-th">{{ t('Credit memo') }}</th>
              <th class="cm-ft-th">{{ t('Reason') }}</th>
              <th class="cm-ft-th cm-ft-th--num">{{ t('Available credit') }}</th>
              <th class="cm-ft-th cm-ft-th--num">{{ t('Refund amount') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id">
              <td class="cm-ft-td cm-ft-td--read cm-ft-td--border">{{ memoLabel(r.number) }}</td>
              <td class="cm-ft-td cm-ft-td--input cm-ft-td--border">
                <MpInput :id="`refund-reason-${r.id}`" v-model="reasons[r.id]" is-full-width class="cm-amount-input" />
              </td>
              <td class="cm-ft-td cm-ft-td--read cm-ft-td--num cm-ft-td--border">{{ formatIDR(rowAvailable(r.id)) }}</td>
              <td class="cm-ft-td cm-ft-td--input" :class="{ 'cm-ft-td--error': errors.rows[r.id] }">
                <div class="cm-amount-cell">
                  <span class="cm-amount-prefix">Rp</span>
                  <MpInput :id="`refund-amt-${r.id}`" :model-value="amounts[r.id] ?? ''" inputmode="numeric" is-full-width class="cm-amount-input" :placeholder="'0'" @update:model-value="(v: string) => onAmountInput(r.id, v)" />
                </div>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td class="cm-ft-td cm-td--muted" colspan="4">{{ t('This customer has no remaining credit to refund.') }}</td>
            </tr>
          </tbody>
        </table>
        <p v-for="r in rows.filter(x => errors.rows[x.id])" :key="`e-${r.id}`" class="cm-form-error">{{ memoLabel(r.number) }}: {{ fieldError(errors.rows[r.id]) }}</p>
        <div class="cm-ft-count">{{ t('Showing') }} {{ rows.length }} {{ t('of') }} {{ rows.length }} {{ t('credit memos') }}</div>
      </div>

      <!-- Memo + Total refund -->
      <div class="cm-form-summary">
        <div class="cm-form-memo">
          <MpFormControl id="refund-memo-note">
            <MpFormLabel>{{ t('Memo') }}</MpFormLabel>
            <MpTextarea id="refund-memo-textarea" v-model="memo" is-full-width :rows="4" />
          </MpFormControl>
          <p class="cm-helper">{{ t('Only visible to you and your team') }}</p>
        </div>
        <div class="cm-form-totals">
          <div class="cm-total-row">
            <span class="cm-total-label cm-total-label--strong">{{ t('Total refund') }}</span>
            <span class="cm-total-amt cm-total-amt--strong">{{ formatIDR(totalRefund) }}</span>
          </div>
          <p v-if="errors.total" class="cm-form-error">{{ fieldError(errors.total) }}</p>
        </div>
      </div>

      <!-- Attachment -->
      <div class="cm-attach-section">
        <div class="cm-section-label">{{ t('Attachment') }}</div>
        <MpUpload
          id="refund-upload" accept=".xls,.xlsx,.doc,.docx,.pdf,.jpg,.jpeg,.png,.zip" is-multiple is-full-width
          :placeholder="t('or drag and drop here')" :button-text="t('Choose file')" @change="onFiles"
        />
        <p class="cm-helper">{{ t('Files must be in XLS, DOC, PDF, JPG, PNG, or ZIP with a maximum of 10 MB per file and 5 files per transaction') }}</p>
        <MpUploadList
          v-for="f in attachedFiles" :key="f.name" :id="`refund-file-${f.name}`"
          :title="f.name" status="success" :subtitle="t('Uploaded')" :icon-name="fileIcon(f.name)"
          is-show-remove-button @remove="removeFile(f.name)"
        />
      </div>
    </div>

    <footer class="cm-form-footer" :class="{ 'cm-form-footer--floating': overflowing }">
      <MpButton variant="ghost" is-rounded @click="cancel">{{ t('Cancel') }}</MpButton>
      <MpButton variant="primary" is-rounded data-devchange="refund-cm-save" @click="save">{{ editingId ? t('Save changes') : t('Save') }}</MpButton>
    </footer>
  </div>
</template>
