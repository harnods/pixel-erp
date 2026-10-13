<script setup lang="ts">
/**
 * Create / edit credit memo (Sales › Sales invoices › Credit memo › new|:id/edit).
 *
 * NOTE: the Figma index lists 8 credit-memo screens but no explicit create/edit
 * *form* — only an "Edit" action on the detail. This form is the inferred create/
 * edit surface (flagged as a design gap in the PRD): one customer, a transaction
 * date, one or more credit-account lines (account · reason · amount), memo and
 * attachments. It follows the same form shell as Apply / Refund. Editing is
 * blocked from reducing the memo below credit already spent, or re-pointing it at
 * another customer once used (enforced in the data layer).
 */
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  MpButton, MpInput, MpAutocomplete, MpDatePicker, MpTextarea, MpUpload, MpUploadList,
  MpIcon, MpFormControl, MpFormLabel, MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, MpTooltip,
} from '@mekari/pixel3'
import { successToast } from '~/utils/toasts'
import { formatIDR } from '~/utils/currency'
import {
  getCreditMemo, customerNameOf, customerOptions, CM_ACCOUNTS, cmAccountLabel, memoLabel,
  validateMemo, createCreditMemo, updateCreditMemo, memoUsed,
  type MemoErrors, type FieldError,
} from '~/data/creditMemos'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const route = useRoute()
const router = useRouter()

const isEdit = computed(() => props.orderId !== 'new')
const editing = computed(() => (isEdit.value ? getCreditMemo(props.orderId) : undefined))
const locked = computed(() => (editing.value ? memoUsed(editing.value.id) : 0))

interface LineRow { id: string; accountCode: string; reason: string; amount: string }
let seq = 0
function newLine(): LineRow { return { id: `l${seq++}`, accountCode: '', reason: '', amount: '' } }

const customerId = ref('')
const transactionDate = ref(displayToday())
const memo = ref('')
const lines = ref<LineRow[]>([newLine()])
const attachedFiles = ref<File[]>([])

function displayToday() { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` }
function toISO(display: string) { const [d, m, y] = display.split('/'); return `${y}-${m}-${d}` }
function displayFrom(iso: string) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
function num(s: string): number { return Number(String(s).replace(/\./g, '')) || 0 }
function onAmountInput(row: LineRow, val: string | number) {
  const digits = String(val).replace(/\D/g, '')
  row.amount = digits ? Number(digits).toLocaleString('id-ID') : ''
  if (errors.value.lines[row.id]) delete errors.value.lines[row.id]
  errors.value.total = undefined
}
function addLine() { lines.value.push(newLine()) }
function removeLine(id: string) { if (lines.value.length > 1) lines.value = lines.value.filter((l) => l.id !== id) }

const accountOptions = CM_ACCOUNTS.map((a) => ({ id: a.code, name: `${a.code} ${a.name}` }))
const totalCredit = computed(() => lines.value.reduce((s, l) => s + num(l.amount), 0))

const errors = ref<MemoErrors>({ lines: {} })
function fieldError(e?: FieldError): string {
  if (!e) return ''
  switch (e.code) {
    case 'REQUIRED': return t('This field is required')
    case 'AMOUNT_POSITIVE': return t('Enter an amount greater than 0')
    case 'NO_LINES': return t('Add at least one credit line')
    case 'BELOW_USED': return `${t('Total cannot be less than the credit already used')} (${formatIDR(e.used)})`
    case 'CUSTOMER_LOCKED': return t('Cannot change the customer — this credit memo is already in use')
    case 'AFTER_FIRST_USE': return t('Date cannot be after the credit was first used')
    default: return t('Check this value')
  }
}
const hasError = computed(() => !!errors.value.customer || !!errors.value.date || !!errors.value.total || Object.keys(errors.value.lines).length > 0)

function buildDraft() {
  return {
    customerId: customerId.value,
    date: toISO(transactionDate.value),
    lines: lines.value.map((l) => ({ id: l.id, accountCode: l.accountCode, reason: l.reason, amount: num(l.amount) })),
    memo: memo.value,
    attachments: attachedFiles.value.map((f) => ({ name: f.name, sizeKB: Math.round(f.size / 1024) })),
  }
}
function save() {
  const draft = buildDraft()
  const v = validateMemo(draft, editing.value?.id)
  errors.value = v.errors
  if (!v.ok) return
  const res = isEdit.value ? updateCreditMemo(props.orderId, draft) : createCreditMemo(draft)
  if (res.ok) { successToast(isEdit.value ? t('Credit memo saved') : t('Credit memo created')); router.push(`/credit-memos/${res.id}`) }
}
function cancel() { router.push(isEdit.value ? `/credit-memos/${props.orderId}` : '/sales-invoices') }

function onFiles(files: FileList | null) { if (!files) return; for (const f of Array.from(files)) if (!attachedFiles.value.some((x) => x.name === f.name)) attachedFiles.value.push(f) }
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
    customerId.value = editing.value.customerId
    transactionDate.value = displayFrom(editing.value.date)
    memo.value = editing.value.memo
    lines.value = editing.value.lines.map((l) => ({ id: `l${seq++}`, accountCode: l.accountCode, reason: l.reason, amount: l.amount.toLocaleString('id-ID') }))
  } else {
    const q = route.query.customer as string | undefined
    if (q) customerId.value = q
  }
  nextTick(checkOverflow)
})

const stageEl = ref<HTMLElement | null>(null)
const overflowing = ref(false)
function checkOverflow() { const el = stageEl.value; if (el) overflowing.value = el.scrollHeight > el.clientHeight + 1 }
let ro: ResizeObserver | null = null
onMounted(() => { ro = new ResizeObserver(checkOverflow); if (stageEl.value) { ro.observe(stageEl.value); stageEl.value.addEventListener('scroll', checkOverflow, { passive: true }) } })
onUnmounted(() => ro?.disconnect())
</script>

<template>
  <div class="cm-page">
    <header class="cm-bar">
      <div class="cm-bar-left">
        <nav class="cm-breadcrumb-trail">
          <MpButton class="cm-breadcrumb" @click="cancel">{{ isEdit && editing ? memoLabel(editing.number) : t('Sales invoices') }}</MpButton>
        </nav>
        <div class="cm-titlerow-left">
          <h1 class="cm-title">{{ isEdit ? t('Edit credit memo') : t('New credit memo') }}</h1>
        </div>
      </div>
    </header>

    <div ref="stageEl" class="cm-form-stage">
      <MpBanner v-if="hasError" id="memo-error-banner" variant="danger" align-items="center" class="cm-inline-banner">
        <MpBannerIcon id="memo-error-banner-icon" />
        <MpBannerTitle>{{ t('Could not save the credit memo') }}</MpBannerTitle>
        <MpBannerDescription>{{ t('Review the highlighted fields below.') }}</MpBannerDescription>
      </MpBanner>

      <!-- Customer + Total credit -->
      <div class="cm-form-row1">
        <MpFormControl id="memo-customer" class="cm-form-field" is-required :is-invalid="!!errors.customer">
          <MpFormLabel>{{ t('Customer') }}</MpFormLabel>
          <MpAutocomplete
            id="memo-customer-ac" v-model="customerId" :data="customerOptions()"
            label-prop="name" value-prop="id" is-searchable use-portal is-full-width
            :placeholder="t('Select customer')" :is-invalid="!!errors.customer" :is-disabled="locked > 0"
            data-devchange="new-cm-form"
            @update:model-value="errors.customer = undefined"
          />
          <p v-if="errors.customer" class="cm-form-error">{{ fieldError(errors.customer) }}</p>
        </MpFormControl>
        <div class="cm-form-right">
          <div class="cm-primary-figure">
            <span class="cm-figure-label">{{ t('Total credit') }}</span>
            <span class="cm-figure-amount">{{ formatIDR(totalCredit) }}</span>
          </div>
        </div>
      </div>

      <!-- Transaction date / Transaction no. -->
      <div class="cm-form-grid2">
        <MpFormControl id="memo-date" is-required :is-invalid="!!errors.date">
          <MpFormLabel>{{ t('Transaction date') }}</MpFormLabel>
          <div class="cm-datepicker">
            <MpDatePicker id="memo-date-dp" v-model="transactionDate" format="DD/MM/YYYY" value-type="format" use-portal @update:model-value="errors.date = undefined" />
          </div>
          <p v-if="errors.date" class="cm-form-error">{{ fieldError(errors.date) }}</p>
        </MpFormControl>
        <MpFormControl id="memo-no">
          <MpFormLabel>{{ t('Transaction no.') }}</MpFormLabel>
          <MpInput id="memo-no-input" :model-value="t('Auto')" is-full-width is-disabled />
        </MpFormControl>
      </div>

      <!-- Credit lines -->
      <div class="cm-form-table-section">
        <table class="cm-form-table">
          <colgroup>
            <col class="cm-col-account" /><col class="cm-col-grow" /><col class="cm-col-amount" /><col class="cm-col-del" />
          </colgroup>
          <thead>
            <tr>
              <th class="cm-ft-th">{{ t('Credit account') }}</th>
              <th class="cm-ft-th">{{ t('Reason') }}</th>
              <th class="cm-ft-th cm-ft-th--num">{{ t('Amount') }}</th>
              <th class="cm-ft-th" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in lines" :key="row.id">
              <td class="cm-ft-td cm-ft-td--input cm-ft-td--border" :class="{ 'cm-ft-td--error': errors.lines[row.id]?.account }">
                <MpAutocomplete :id="`memo-acc-${row.id}`" v-model="row.accountCode" :data="accountOptions" label-prop="name" value-prop="id" is-searchable use-portal is-full-width :placeholder="t('Select account')" @update:model-value="errors.lines[row.id] && (delete errors.lines[row.id])" />
              </td>
              <td class="cm-ft-td cm-ft-td--input cm-ft-td--border">
                <MpInput :id="`memo-reason-${row.id}`" v-model="row.reason" is-full-width class="cm-amount-input" />
              </td>
              <td class="cm-ft-td cm-ft-td--input cm-ft-td--border" :class="{ 'cm-ft-td--error': errors.lines[row.id]?.amount }">
                <div class="cm-amount-cell">
                  <span class="cm-amount-prefix">Rp</span>
                  <MpInput :id="`memo-amt-${row.id}`" :model-value="row.amount" inputmode="numeric" is-full-width class="cm-amount-input" :placeholder="'0'" @update:model-value="(v: string) => onAmountInput(row, v)" />
                </div>
              </td>
              <td class="cm-ft-td cm-ft-td--del">
                <MpTooltip :id="`memo-rm-${row.id}`" :label="t('Remove')" placement="top" use-portal>
                  <MpButton class="cm-line-del" :aria-label="t('Remove')" @click="removeLine(row.id)"><MpIcon name="minus-circular" size="sm" /></MpButton>
                </MpTooltip>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="errors.total" class="cm-form-error">{{ fieldError(errors.total) }}</p>
        <div class="cm-ft-count">
          <MpButton variant="textLink" left-icon="add" @click="addLine">{{ t('Add line') }}</MpButton>
        </div>
      </div>

      <!-- Memo + total -->
      <div class="cm-form-summary">
        <div class="cm-form-memo">
          <MpFormControl id="memo-note">
            <MpFormLabel>{{ t('Memo') }}</MpFormLabel>
            <MpTextarea id="memo-textarea" v-model="memo" is-full-width :rows="4" />
          </MpFormControl>
          <p class="cm-helper">{{ t('Only visible to you and your team') }}</p>
        </div>
        <div class="cm-form-totals">
          <div class="cm-total-row">
            <span class="cm-total-label cm-total-label--strong">{{ t('Total credit') }}</span>
            <span class="cm-total-amt cm-total-amt--strong">{{ formatIDR(totalCredit) }}</span>
          </div>
        </div>
      </div>

      <!-- Attachment -->
      <div class="cm-attach-section">
        <div class="cm-section-label">{{ t('Attachment') }}</div>
        <MpUpload id="memo-upload" accept=".xls,.xlsx,.doc,.docx,.pdf,.jpg,.jpeg,.png,.zip" is-multiple is-full-width :placeholder="t('or drag and drop here')" :button-text="t('Choose file')" @change="onFiles" />
        <p class="cm-helper">{{ t('Files must be in XLS, DOC, PDF, JPG, PNG, or ZIP with a maximum of 10 MB per file and 5 files per transaction') }}</p>
        <MpUploadList v-for="f in attachedFiles" :key="f.name" :id="`memo-file-${f.name}`" :title="f.name" status="success" :subtitle="t('Uploaded')" :icon-name="fileIcon(f.name)" is-show-remove-button @remove="removeFile(f.name)" />
      </div>
    </div>

    <footer class="cm-form-footer" :class="{ 'cm-form-footer--floating': overflowing }">
      <MpButton variant="ghost" is-rounded @click="cancel">{{ t('Cancel') }}</MpButton>
      <MpButton variant="primary" is-rounded data-devchange="new-cm-save" @click="save">{{ isEdit ? t('Save changes') : t('Save') }}</MpButton>
    </footer>
  </div>
</template>

<style scoped>
.cm-line-del { display: inline-flex !important; align-items: center; justify-content: center; min-width: 0 !important; padding: 0 !important; background: none !important; border: none !important; cursor: pointer; color: var(--mp-icon-default, var(--mp-text-secondary)); }
.cm-ft-td--del { width: 44px; text-align: center; vertical-align: middle; }
</style>
