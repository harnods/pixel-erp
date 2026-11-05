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
  MpButton, MpInput, MpInputTag, MpAutocomplete, MpDatePicker, MpTextarea, MpUpload, MpUploadList,
  MpIcon, MpFormControl, MpFormLabel, MpTooltip,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  css,
} from '@mekari/pixel3'
import type { DataInterface } from '@mekari/pixel3'
import { successToast } from '~/utils/toasts'
import { formatIDR } from '~/utils/currency'
import TransactionNoField from '~/components/patterns/TransactionNoField.vue'
import ErpDimensionTagUpsell from '~/components/patterns/ErpDimensionTagUpsell.vue'
import {
  getCreditMemo, customerNameOf, customerOptions, CM_ACCOUNTS, cmAccountLabel, memoLabel,
  validateMemo, createCreditMemo, updateCreditMemo, memoUsed, nextMemoNumber,
  type MemoErrors, type FieldError,
} from '~/data/creditMemos'
import { getContactIdByName } from '~/data/contacts'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const route = useRoute()
const router = useRouter()

const isEdit = computed(() => props.orderId !== 'new')
const editing = computed(() => (isEdit.value ? getCreditMemo(props.orderId) : undefined))
const locked = computed(() => (editing.value ? memoUsed(editing.value.id) : 0))
/** When navigating from a contact/customer page, the customer is pre-selected and locked. */
const customerFromContact = ref(false)
const customerLocked = computed(() => locked.value > 0 || customerFromContact.value)
/** Breadcrumb: customer name + link back to the contact details page. */
const sourceCustomerName = computed(() => customerFromContact.value ? customerNameOf(customerId.value) : '')
const sourceContactId = computed(() => {
  if (!customerFromContact.value) return ''
  return getContactIdByName(customerNameOf(customerId.value)) ?? ''
})
const nextTxNo = computed(() => memoLabel(editing.value ? editing.value.number : nextMemoNumber()))

interface LineRow { id: string; accountCode: string; reason: string; amount: string }
let seq = 0
function newLine(): LineRow { return { id: `l${seq++}`, accountCode: '', reason: '', amount: '' } }

const customerId = ref('')
const transactionDate = ref(displayToday())
const memo = ref('')
const lines = ref<LineRow[]>([newLine()])
const attachedFiles = ref<File[]>([])
const tagsList = ref<DataInterface[]>([])

function toTagData(values: string[]): DataInterface[] {
  return values.map((v, i) => ({ text: v, id: `${i}-${v}`, value: v, isInvalid: false, isReadOnly: false }))
}
function onTagsChange(data: DataInterface[]) { tagsList.value = data }

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

function buildDraft() {
  return {
    customerId: customerId.value,
    date: toISO(transactionDate.value),
    lines: lines.value.map((l) => ({ id: l.id, accountCode: l.accountCode, reason: l.reason, amount: num(l.amount) })),
    memo: memo.value,
    tags: tagsList.value.map((t2) => String(t2.value)),
    attachments: attachedFiles.value.map((f) => ({ name: f.name, sizeKB: Math.round(f.size / 1024) })),
  }
}
function save(mode: 'close' | 'new' = 'close') {
  const draft = buildDraft()
  const v = validateMemo(draft, editing.value?.id)
  errors.value = v.errors
  if (!v.ok) return
  const res = isEdit.value ? updateCreditMemo(props.orderId, draft) : createCreditMemo(draft)
  if (res.ok) {
    successToast(isEdit.value ? t('Credit memo saved') : t('Credit memo created'))
    if (mode === 'new' && !isEdit.value) {
      // Reset the form for another credit memo; keep customer if coming from contact page
      const keepCustomer = customerFromContact.value ? customerId.value : ''
      customerId.value = keepCustomer
      transactionDate.value = displayToday()
      memo.value = ''
      lines.value = [newLine()]
      attachedFiles.value = []
      tagsList.value = []
      errors.value = { lines: {} }
    } else {
      router.push(`/credit-memos/${res.id}`)
    }
  }
}
function cancel() {
  if (isEdit.value) return router.push(`/credit-memos/${props.orderId}`)
  if (sourceContactId.value) return router.push(`/customers/${sourceContactId.value}`)
  router.push('/sales-invoices')
}

function onFiles(payload: Event | FileList | null) {
  // MpUpload's @change emits the native Event (ev.target.files), not a
  // FileList. Accept both so the field actually stages what was picked.
  const files: FileList | null | undefined =
    payload && 'target' in payload ? (payload.target as HTMLInputElement).files : (payload as FileList | null)
  if (!files) return; for (const f of Array.from(files)) if (!attachedFiles.value.some((x) => x.name === f.name)) attachedFiles.value.push(f)
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
    customerId.value = editing.value.customerId
    transactionDate.value = displayFrom(editing.value.date)
    memo.value = editing.value.memo
    lines.value = editing.value.lines.map((l) => ({ id: `l${seq++}`, accountCode: l.accountCode, reason: l.reason, amount: l.amount.toLocaleString('id-ID') }))
  } else {
    const q = route.query.customer as string | undefined
    if (q) { customerId.value = q; customerFromContact.value = true }
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
          <template v-if="customerFromContact && sourceCustomerName">
            <MpButton class="cm-breadcrumb" @click="router.push('/customers')">{{ t('Customers') }}</MpButton>
            <span class="cm-breadcrumb-sep">/</span>
            <MpButton class="cm-breadcrumb" @click="cancel">{{ sourceCustomerName }}</MpButton>
          </template>
          <MpButton v-else class="cm-breadcrumb" @click="cancel">{{ isEdit && editing ? memoLabel(editing.number) : t('Sales invoices') }}</MpButton>
        </nav>
        <div class="cm-titlerow-left">
          <h1 class="cm-title">{{ isEdit ? t('Edit credit memo') : t('New credit memo') }}</h1>
        </div>
      </div>
    </header>

    <div ref="stageEl" class="cm-form-stage">
      <!-- Customer + Total credit -->
      <div class="cm-form-row1">
        <MpFormControl id="memo-customer" class="cm-form-field" is-required :is-invalid="!!errors.customer">
          <MpFormLabel>{{ t('Customer') }}</MpFormLabel>
          <MpAutocomplete
            id="memo-customer-ac" v-model="customerId" :data="customerOptions()"
            label-prop="name" value-prop="id" is-searchable use-portal is-full-width
            :placeholder="t('Select customer')" :is-invalid="!!errors.customer" :is-disabled="customerLocked"
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

      <!-- Transaction date / Transaction no. / Tag -->
      <div class="cm-form-grid3">
        <MpFormControl id="memo-date" is-required :is-invalid="!!errors.date">
          <MpFormLabel>{{ t('Transaction date') }}</MpFormLabel>
          <div class="cm-datepicker">
            <MpDatePicker id="memo-date-dp" v-model="transactionDate" format="DD/MM/YYYY" value-type="format" use-portal @update:model-value="errors.date = undefined" />
          </div>
          <p v-if="errors.date" class="cm-form-error">{{ fieldError(errors.date) }}</p>
        </MpFormControl>
        <TransactionNoField field-id="memo-no" :next-number="nextTxNo" />
        <MpFormControl id="memo-tags" class="cm-form-field">
          <MpFormLabel>{{ t('Tag') }}</MpFormLabel>
          <MpInputTag id="memo-tags-inp" :data="tagsList" :placeholder="t('Select tags')" @change="onTagsChange" />
          <ErpDimensionTagUpsell id="cm-dim-upsell" />
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
      <template v-if="isEdit">
        <MpButton variant="primary" is-rounded data-devchange="new-cm-save" @click="save('close')">{{ t('Save changes') }}</MpButton>
      </template>
      <template v-else>
        <div class="cm-split-btn">
          <MpButton variant="primary" class="btn-enterprise btn-enterprise--primary cm-split-btn__main" data-devchange="new-cm-save" @click="save('close')">
            {{ t('Save & close') }}
          </MpButton>
          <MpPopover id="cm-save-menu" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
            <MpPopoverTrigger>
              <MpButton variant="primary" class="btn-enterprise btn-enterprise--primary cm-split-btn__chevron" right-icon="chevrons-down" :aria-label="t('More save options')" />
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem @click="save('new')">{{ t('Save & create another') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </template>
    </footer>
  </div>
</template>

<style scoped>
.cm-line-del { display: inline-flex !important; align-items: center; justify-content: center; min-width: 0 !important; padding: 0 !important; background: none !important; border: none !important; cursor: pointer; color: var(--mp-icon-default, var(--mp-text-secondary)); }
.cm-ft-td--del { width: 44px; text-align: center; vertical-align: middle; }

/* Split button — "Save & close" main segment + chevron segment sharing one pill */
.cm-split-btn { display: inline-flex; align-items: stretch; }
.cm-split-btn__main { border-radius: var(--mp-radii-full, 999px) 0 0 var(--mp-radii-full, 999px); }
.cm-split-btn__chevron { padding-left: var(--mp-spacing-3); padding-right: var(--mp-spacing-3); border-radius: 0 var(--mp-radii-full, 999px) var(--mp-radii-full, 999px) 0; border-left: 1px solid rgba(255, 255, 255, 0.3); }
</style>
