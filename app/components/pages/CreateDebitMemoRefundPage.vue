<script setup lang="ts">
/**
 * Create debit memo refund (Purchase › Purchase invoices › Create debit memo refund).
 * AP-side mirror of CreateCreditMemoRefundPage.vue.
 * Key difference: "Deposit to" (cash IN from vendor) instead of "Pay from".
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
  getDebitMemo, getRefund, vendorNameOf, memosForVendor, memoRemaining, memoLabel,
  refundDepositToAccounts, validateRefund, createRefund, updateRefund, nextRefundNumber,
  type RefundErrors, type FieldError,
} from '~/data/debitMemos'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const route = useRoute()
const router = useRouter()

const segs = computed(() => route.path.split('/').filter(Boolean))
const mode = computed<'from-memo' | 'edit'>(() => (segs.value[0] === 'debit-memo-refunds' ? 'edit' : 'from-memo'))
const editingId = computed(() => (mode.value === 'edit' ? props.orderId : undefined))
const sourceMemo = computed(() => (mode.value === 'from-memo' ? getDebitMemo(props.orderId) : undefined))
const editing = computed(() => (editingId.value ? getRefund(editingId.value) : undefined))
const vendorId = computed(() => sourceMemo.value?.vendorId ?? editing.value?.vendorId ?? '')

const depositToAccountId = ref('')
const transactionDate = ref(displayToday())
const memo = ref('')
const amounts = ref<Record<string, string>>({})
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

const depositToOptions = computed(() => refundDepositToAccounts().map((a) => ({ id: a.id, name: `${a.code} ${a.name}` })))
const rows = computed(() =>
  memosForVendor(vendorId.value).filter((m) => memoRemaining(m.id, { refundId: editingId.value }) > 0 || (editing.value?.lines.some((l) => l.debitMemoId === m.id))),
)
function rowAvailable(memoId: string) { return memoRemaining(memoId, { refundId: editingId.value }) }
const totalRefund = computed(() => rows.value.reduce((s, r) => s + num(amounts.value[r.id]), 0))
const nextTxNo = computed(() => `${t('Debit memo refund')} #${nextRefundNumber()}`)

const errors = ref<RefundErrors>({ rows: {} })
function fieldError(e?: FieldError): string {
  if (!e) return ''
  switch (e.code) {
    case 'REQUIRED': return t('This field is required')
    case 'AMOUNT_POSITIVE': return t('Enter an amount greater than 0')
    case 'OVER_AVAILABLE': return `${t('Exceeds the available debit')} (${formatIDR(e.limit)})`
    case 'BEFORE_MEMO_DATE': return t('Date cannot be before the debit memo date')
    case 'NOTHING_ENTERED': return t('Enter a refund amount on at least one debit memo')
    default: return t('Check this value')
  }
}

function buildDraft() {
  return {
    vendorId: vendorId.value,
    depositToAccountId: depositToAccountId.value,
    date: toISO(transactionDate.value),
    lines: rows.value.map((r) => ({ debitMemoId: r.id, reason: reasons.value[r.id] ?? '', amount: num(amounts.value[r.id]) })),
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
    successToast(editingId.value ? t('Debit memo refund saved') : t('Debit memo refund created'))
    router.push(`/debit-memo-refunds/${res.id}`)
  }
}
function cancel() {
  if (mode.value === 'from-memo') router.push(`/debit-memos/${props.orderId}`)
  else if (editing.value) router.push(`/debit-memo-refunds/${props.orderId}`)
  else router.push('/purchase-invoices')
}

function onFiles(payload: Event | FileList | null) {
  // MpUpload's @change emits the native Event (ev.target.files), not a
  // FileList. Accept both so the field actually stages what was picked.
  const files: FileList | null | undefined =
    payload && 'target' in payload ? (payload.target as HTMLInputElement).files : (payload as FileList | null)
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
    depositToAccountId.value = editing.value.depositToAccountId
    transactionDate.value = displayFrom(editing.value.date)
    memo.value = editing.value.memo
    for (const l of editing.value.lines) { amounts.value[l.debitMemoId] = l.amount.toLocaleString('id-ID'); reasons.value[l.debitMemoId] = l.reason }
  } else if (sourceMemo.value) {
    reasons.value[sourceMemo.value.id] = 'Vendor agreed to cash refund'
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
  if (editing.value) return `${t('Debit memo refund')} #${editing.value.number}`
  return t('Debit memo')
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
          <h1 class="cm-title">{{ editingId ? t('Edit debit memo refund') : t('Create debit memo refund') }}</h1>
        </div>
      </div>
    </header>

    <div ref="stageEl" class="cm-form-stage">
      <div class="cm-form-row1">
        <MpFormControl id="refund-depositto" class="cm-form-field" is-required :is-invalid="!!errors.depositTo">
          <MpFormLabel>{{ t('Deposit to') }}</MpFormLabel>
          <MpAutocomplete
            id="refund-depositto-ac" v-model="depositToAccountId" :data="depositToOptions"
            label-prop="name" value-prop="id" is-searchable use-portal is-full-width
            :placeholder="t('Select account')" :is-invalid="!!errors.depositTo"
            data-devchange="refund-dm-form"
            @update:model-value="errors.depositTo = undefined"
          />
          <p v-if="errors.depositTo" class="cm-form-error">{{ fieldError(errors.depositTo) }}</p>
        </MpFormControl>
        <MpFormControl id="refund-vendor" class="cm-form-field" is-required>
          <MpFormLabel>{{ t('Vendor') }}</MpFormLabel>
          <MpInput id="refund-vendor-input" :model-value="vendorNameOf(vendorId)" is-full-width is-disabled />
        </MpFormControl>
        <div class="cm-form-right">
          <div class="cm-primary-figure">
            <span class="cm-figure-label">{{ t('Refund amount') }}</span>
            <span class="cm-figure-amount">{{ formatIDR(totalRefund) }}</span>
          </div>
        </div>
      </div>

      <div class="cm-form-grid2">
        <MpFormControl id="refund-date" is-required :is-invalid="!!errors.date">
          <MpFormLabel>{{ t('Transaction date') }}</MpFormLabel>
          <div class="cm-datepicker">
            <MpDatePicker id="refund-date-dp" v-model="transactionDate" format="DD/MM/YYYY" value-type="format" use-portal @update:model-value="errors.date = undefined" />
          </div>
          <p v-if="errors.date" class="cm-form-error">{{ fieldError(errors.date) }}</p>
        </MpFormControl>
        <TransactionNoField field-id="refund-no" :next-number="nextTxNo" />
      </div>

      <div class="cm-form-table-section">
        <table class="cm-form-table">
          <colgroup>
            <col class="cm-col-amount" /><col class="cm-col-grow" /><col class="cm-col-num" /><col class="cm-col-amount" />
          </colgroup>
          <thead>
            <tr>
              <th class="cm-ft-th">{{ t('Debit memo') }}</th>
              <th class="cm-ft-th">{{ t('Reason') }}</th>
              <th class="cm-ft-th cm-ft-th--num">{{ t('Available debit') }}</th>
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
              <td class="cm-ft-td cm-td--muted" colspan="4">{{ t('This vendor has no remaining debit to refund.') }}</td>
            </tr>
          </tbody>
        </table>
        <p v-for="r in rows.filter(x => errors.rows[x.id])" :key="`e-${r.id}`" class="cm-form-error">{{ memoLabel(r.number) }}: {{ fieldError(errors.rows[r.id]) }}</p>
        <div class="cm-ft-count">{{ t('Showing') }} {{ rows.length }} {{ t('of') }} {{ rows.length }} {{ t('debit memos') }}</div>
      </div>

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
      <MpButton variant="primary" is-rounded data-devchange="refund-dm-save" @click="save">{{ editingId ? t('Save changes') : t('Save') }}</MpButton>
    </footer>
  </div>
</template>
