<!-- prod-parity: jurnal-frontend-app/src/pages/sales/merged_invoices/new_and_edit.vue · purchases/merged_invoices/new_and_edit.vue -->
<script setup lang="ts">
/**
 * Join Sales Invoice / Join Purchase Invoice — create (/join-invoices/new,
 * /join-purchase-invoices/new) and edit (…/:id/edit). Pick a contact, add 2–150
 * of that contact's unpaid invoices, set dates/terms, message, memo. Save opens
 * the "Joining invoice confirmation" modal, then lands on the detail page.
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  MpButton, MpInput, MpAutocomplete, MpDatePicker, MpInputTag, MpTextarea, MpUpload, MpUploadList,
  MpIcon, MpFormControl, MpFormLabel, MpFormErrorMessage, MpBanner, MpBannerIcon, MpBannerDescription, MpTextlink, MpTooltip,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpButtonGroup,
  type DataInterface,
} from '@mekari/pixel3'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { customers } from '~/data/customers'
import { vendors } from '~/data/vendors'
import { paymentTerms } from '~/data/paymentTerms'
import {
  getJoinInvoice, addJoinInvoice, updateJoinInvoice, joinContact, sourceInvoicesFor, sourceInvoice,
  joinedInvoiceIds, latestInvoiceDate, nextJoinSequence, JOIN_MIN_INVOICES, JOIN_MAX_INVOICES,
  type JoinKind,
} from '~/data/joinInvoices'
import { SIM_TODAY_ISO } from '~/data/simClock'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { successToast } from '~/utils/toasts'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()
const route = useRoute()

const kind = computed<JoinKind>(() => (route.path.startsWith('/join-purchase') ? 'purchase' : 'sales'))
const isSales = computed(() => kind.value === 'sales')
const base = computed(() => (isSales.value ? '/join-invoices' : '/join-purchase-invoices'))
/** Sidebar list page (Sales › Join invoice → /join-invoice). */
const listPath = computed(() => (isSales.value ? '/join-invoice' : '/join-purchase-invoices'))
const editing = computed(() => (props.orderId && props.orderId !== 'new' ? getJoinInvoice(props.orderId) : undefined))
const isEdit = computed(() => !!editing.value)

const typeName = computed(() => (isSales.value ? t('Join Sales Invoice') : t('Join Purchase Invoice')))
const pageTitle = computed(() => (isEdit.value ? `${t('Update')} ${typeName.value}` : typeName.value))
const listLabel = computed(() => (isSales.value ? t('Join invoice') : t('Join purchase invoices')))
// Keep the sidebar on Sales › Join invoice / Purchases › Join purchase invoices on these routes.
const { setActiveSectionOverride } = useNavigation()
watch(isSales, (v) => setActiveSectionOverride(v ? 'Join invoice' : 'Join purchase invoices'), { immediate: true })
onUnmounted(() => setActiveSectionOverride(null))
const contactLabel = computed(() => (isSales.value ? t('Customer') : t('Vendor')))
const invoiceHead = computed(() => (isSales.value ? t('Sales Invoice') : t('Purchase invoice')))

function toDmy(iso: string) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
function toIso(dmy: string) { if (!dmy) return ''; const [d, m, y] = dmy.split('/'); return `${y}-${m}-${d}` }
function addDays(iso: string, n: number) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

// ── Contact ──────────────────────────────────────────────────────────────────
// Sales lists customers with open receivables (prod select-contact type="open_receivables").
const contactOptions = computed(() => {
  if (isSales.value) {
    return customers
      .filter((c) => sourceInvoicesFor('sales', c.id).some((s) => s.balance > 0))
      .map((c) => ({ id: c.id, name: c.name }))
  }
  return vendors.map((v) => ({ id: v.id, name: v.name }))
})
const contactId = ref('')
const emails = ref<DataInterface[]>([])
const billingAddress = ref('')
function toTag(v: string): DataInterface { return { text: v, id: v, value: v, isInvalid: false, isReadOnly: false } }
function onContactChange(id: unknown) {
  const c = joinContact(kind.value, String(id ?? ''))
  if (!c) { emails.value = []; billingAddress.value = ''; return }
  emails.value = c.email ? c.email.split(',').map((e) => toTag(e.trim())) : []
  billingAddress.value = c.billingAddress
  changeTerm(c.term)
}
watch(contactId, (v, old) => { if (old !== undefined && v !== old && !loading.value) lines.value = [] })

// ── Dates + terms ────────────────────────────────────────────────────────────
const transactionDate = ref(toDmy(SIM_TODAY_ISO))
const dueDate = ref('')
const transactionNo = ref('')
const termOptions = computed(() => [...new Set(paymentTerms.map((p) => p.name))])
const term = ref('')
function termDays(name: string) { return paymentTerms.find((p) => p.name === name)?.days ?? 0 }
function changeTerm(name: unknown) {
  term.value = String(name ?? '')
  if (term.value && term.value !== 'Custom' && transactionDate.value) dueDate.value = toDmy(addDays(toIso(transactionDate.value), termDays(term.value)))
}
function onTransactionDate(v: unknown) {
  transactionDate.value = String(v ?? '')
  if (term.value && term.value !== 'Custom' && transactionDate.value) dueDate.value = toDmy(addDays(toIso(transactionDate.value), termDays(term.value)))
}
function onDueDate(v: unknown) {
  dueDate.value = String(v ?? '')
  if (dueDate.value && transactionDate.value && term.value !== 'Custom') {
    const expected = toDmy(addDays(toIso(transactionDate.value), termDays(term.value)))
    if (dueDate.value !== expected) term.value = 'Custom'
  }
}

// ── Invoice lines ────────────────────────────────────────────────────────────
interface Line { invoiceId: string; description: string }
const lines = ref<Line[]>([])
const resolved = computed(() => lines.value.flatMap((l) => {
  const s = sourceInvoice(kind.value, l.invoiceId)
  return s ? [{ ...s, line: l }] : []
}))
const availableInvoices = computed(() => {
  if (!contactId.value) return []
  const taken = joinedInvoiceIds(kind.value, editing.value?.id)
  const chosen = new Set(lines.value.map((l) => l.invoiceId))
  return sourceInvoicesFor(kind.value, contactId.value)
    .filter((s) => s.balance > 0 && !taken.has(s.id) && !chosen.has(s.id))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({ id: s.id, name: `${s.label} · ${formatIDR(s.balance)}` }))
})
const pickerKey = ref(0)
const maxInvoiceLine = computed(() => lines.value.length >= JOIN_MAX_INVOICES)
function addInvoice(id: unknown) {
  const v = String(id ?? '')
  if (!v || maxInvoiceLine.value) return
  lines.value.push({ invoiceId: v, description: '' })
  linesError.value = false
  pickerKey.value++
}
function removeLine(i: number) { lines.value.splice(i, 1) }

const totalAmount = computed(() => resolved.value.reduce((s, r) => s + r.total, 0))
const totalRemaining = computed(() => resolved.value.reduce((s, r) => s + r.balance, 0))

// ── Validation (prod: valid(), validDate, isBeforeInvoiceDate) ───────────────
const latestDate = computed(() => latestInvoiceDate(kind.value, lines.value.map((l) => l.invoiceId)))
const isBeforeInvoiceDate = computed(() => !!transactionDate.value && !!latestDate.value && toIso(transactionDate.value) < latestDate.value)
const beforeInvoiceDateError = computed(() => (isSales.value
  ? t("Transaction date can't be earlier than the latest sales invoice date ({date})")
  : t("Transaction date can't be earlier than the latest purchase invoice date ({date})")).replace('{date}', toDmy(latestDate.value)))
const validDate = computed(() => !transactionDate.value || !dueDate.value || toIso(transactionDate.value) <= toIso(dueDate.value))
const contactError = ref(false)
const dueDateError = ref(false)
const linesError = ref(false)
const formError = ref('')
watch(contactId, (v) => { if (v) contactError.value = false })
watch(dueDate, (v) => { if (v) dueDateError.value = false })

// ── Attachments (session only) ───────────────────────────────────────────────
const files = ref<File[]>([])
function onAttach(list: FileList | null) { if (list) for (const f of Array.from(list)) if (!files.value.some((x) => x.name === f.name)) files.value.push(f) }

const message = ref('')
const memo = ref('')

// ── Save flow ────────────────────────────────────────────────────────────────
const confirmOpen = ref(false)
const cancelOpen = ref(false)
function onSave() {
  contactError.value = !contactId.value
  dueDateError.value = !dueDate.value
  linesError.value = lines.value.length < JOIN_MIN_INVOICES
  if (contactError.value || dueDateError.value || linesError.value) { formError.value = t('Please fill in the required data to join the invoice.'); return }
  if (isBeforeInvoiceDate.value) { formError.value = beforeInvoiceDateError.value; return }
  if (!validDate.value) { formError.value = t('Transaction date exceeds the due date'); return }
  formError.value = ''
  confirmOpen.value = true
}
const contactName = computed(() => contactOptions.value.find((c) => c.id === contactId.value)?.name
  ?? joinContact(kind.value, contactId.value)?.name ?? '')
function onConfirm() {
  const input = {
    customNumber: transactionNo.value.trim() || undefined,
    contactId: contactId.value, contactName: contactName.value,
    email: emails.value.map((e) => e.text).join(', '), billingAddress: billingAddress.value.trim(),
    transactionDate: toIso(transactionDate.value), dueDate: toIso(dueDate.value), term: term.value,
    lines: lines.value.map((l) => ({ invoiceId: l.invoiceId, description: l.description.trim() })),
    message: message.value.trim(), memo: memo.value.trim(),
  }
  let id: string
  if (editing.value) {
    updateJoinInvoice(editing.value.id, input)
    id = editing.value.id
    successToast(t('Changes are saved'))
  } else {
    id = addJoinInvoice(kind.value, input).id
    successToast(isSales.value ? t('Sales invoice is joined') : t('Purchase invoice is joined'))
  }
  confirmOpen.value = false
  router.push(`${base.value}/${id}`)
}
function leave() { router.push(editing.value ? `${base.value}/${editing.value.id}` : listPath.value) }

const estimatedNo = computed(() => `Join Invoice - ${nextJoinSequence(kind.value)}`)

const loading = ref(true)
onMounted(() => {
  const j = editing.value
  if (j) {
    contactId.value = j.contactId
    emails.value = j.email ? j.email.split(',').map((e) => toTag(e.trim())).filter((e) => e.text) : []
    billingAddress.value = j.billingAddress
    transactionDate.value = toDmy(j.transactionDate)
    dueDate.value = toDmy(j.dueDate)
    term.value = j.term
    transactionNo.value = j.customNumber ?? ''
    lines.value = j.lines.map((l) => ({ ...l }))
    message.value = j.message
    memo.value = j.memo
  }
  setTimeout(() => { loading.value = false }, 0)
})
</script>

<template>
  <div class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <MpTextlink id="jif-breadcrumb" as="a" class="detail-breadcrumb" @click.prevent="cancelOpen = true">{{ listLabel }}</MpTextlink>
        </nav>
        <h1 class="detail-title">{{ pageTitle }}</h1>
      </div>
    </header>

    <div class="it-stage">
      <!-- Contact + Email + Total -->
      <section class="jif-header1">
        <MpFormControl id="jif-contact" class="jif-field" is-required :is-invalid="contactError">
          <MpFormLabel>{{ contactLabel }}</MpFormLabel>
          <MpAutocomplete
            id="jif-contact-inp" v-model="contactId" :data="contactOptions" label-prop="name" value-prop="id"
            is-searchable use-portal is-full-width :is-disabled="isEdit && isSales" :is-invalid="contactError"
            :placeholder="isSales ? t('Choose customer') : t('Select vendor')"
            @update:model-value="onContactChange"
          />
          <MpFormErrorMessage>{{ isSales ? t('Please select customer') : t('Please select vendor') }}</MpFormErrorMessage>
        </MpFormControl>
        <MpFormControl id="jif-email" class="jif-field">
          <MpFormLabel>{{ t('Email') }}</MpFormLabel>
          <MpInputTag id="jif-email-inp" :data="emails" :placeholder="t('Enter email')" @change="(d: DataInterface[]) => (emails = d)" />
        </MpFormControl>
        <div class="jif-header-total">
          <span v-if="!isSales" class="jif-header-total-label">{{ t('Total join invoice') }}</span>
          <h2 class="jif-header-total-value">{{ isSales ? `${t('Total')} ${formatIDR(totalAmount)}` : formatIDR(totalAmount) }}</h2>
        </div>
      </section>

      <!-- Billing address · dates · number + terms -->
      <section class="jif-header2">
        <MpFormControl id="jif-billing" class="jif-field">
          <MpFormLabel>{{ t('Billing address') }}</MpFormLabel>
          <MpTextarea id="jif-billing-inp" v-model="billingAddress" :rows="4" is-full-width />
        </MpFormControl>
        <div class="jif-col">
          <MpFormControl id="jif-trx-date" class="jif-field" :is-invalid="isBeforeInvoiceDate || !validDate">
            <MpFormLabel>{{ t('Transaction date') }}</MpFormLabel>
            <MpDatePicker id="jif-trx-date-inp" :model-value="transactionDate" class="jif-datepicker" format="DD/MM/YYYY" value-type="format" use-portal @update:model-value="onTransactionDate" />
            <MpFormErrorMessage>
              <span v-if="isBeforeInvoiceDate">{{ beforeInvoiceDateError }}</span>
              <span v-else-if="!validDate">{{ t('Transaction date exceeds the due date') }}</span>
            </MpFormErrorMessage>
          </MpFormControl>
          <MpFormControl id="jif-due-date" class="jif-field" is-required :is-invalid="dueDateError">
            <MpFormLabel>{{ t('Due date') }}</MpFormLabel>
            <MpDatePicker id="jif-due-date-inp" :model-value="dueDate" class="jif-datepicker" format="DD/MM/YYYY" value-type="format" use-portal @update:model-value="onDueDate" />
            <MpFormErrorMessage>{{ t('Due date is required') }}</MpFormErrorMessage>
          </MpFormControl>
        </div>
        <div class="jif-col">
          <MpFormControl id="jif-no" class="jif-field">
            <div class="ex-label-row">
              <MpFormLabel>{{ t('Transaction no.') }}</MpFormLabel>
              <MpTooltip v-if="!isEdit" id="jif-no-tt" :label="`${t('Transaction number will be generated automatically by system.')} ${t('Estimated number: ')}${estimatedNo}`" placement="top" use-portal>
                <MpIcon name="info" size="sm" />
              </MpTooltip>
            </div>
            <MpInput id="jif-no-inp" v-model="transactionNo" is-full-width />
          </MpFormControl>
          <MpFormControl id="jif-term" class="jif-field">
            <MpFormLabel>{{ t('Terms of payment') }}</MpFormLabel>
            <MpAutocomplete id="jif-term-inp" :model-value="term" :data="termOptions" use-portal is-full-width @update:model-value="changeTerm" />
          </MpFormControl>
        </div>
      </section>

      <!-- Invoice lines -->
      <section>
        <div class="ex-table-section">
          <table class="ex-table">
            <colgroup><col class="jif-col-inv" /><col /><col class="jif-col-date" /><col class="jif-col-status" /><col class="jif-col-amt" /><col class="jif-col-amt" /><col class="jif-col-del" /></colgroup>
            <thead>
              <tr>
                <th class="ex-th">{{ invoiceHead }}</th>
                <th class="ex-th">{{ t('Description') }}</th>
                <th class="ex-th">{{ t('Due date') }}</th>
                <th class="ex-th">{{ t('Status') }}</th>
                <th class="ex-th ex-th--num">{{ t('Amount billed') }}</th>
                <th class="ex-th ex-th--num">{{ t('Remaining billed') }}</th>
                <th class="ex-th" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in resolved" :key="r.id">
                <td class="ex-td ex-td--text"><span class="cell-link">{{ r.label }}</span></td>
                <td class="ex-td ex-td--input ex-td--border">
                  <MpTextarea :id="`jif-desc-${i}`" v-model="r.line.description" :rows="1" is-full-width :placeholder="t('Enter description')" />
                </td>
                <td class="ex-td ex-td--text">{{ formatDate(r.dueDate) }}</td>
                <td class="ex-td ex-td--text"><ErpStatusBadge :status="r.status" /></td>
                <td class="ex-td ex-td--text ex-td--num">{{ formatIDR(r.total) }}</td>
                <td class="ex-td ex-td--text ex-td--num">{{ formatIDR(r.balance) }}</td>
                <td class="ex-td ex-td--del">
                  <MpTooltip :id="`jif-del-tt-${i}`" :label="t('Delete')" placement="top" use-portal>
                    <MpButton class="ex-del-btn" is-rounded :aria-label="t('Delete')" @click="removeLine(i)"><MpIcon name="minus-circular" size="sm" /></MpButton>
                  </MpTooltip>
                </td>
              </tr>
              <tr>
                <td class="ex-td ex-td--input ex-td--picker">
                  <MpTooltip v-if="!contactId" id="jif-pick-tt" :label="isSales ? t('Please select customer') : t('Please select vendor')" placement="top" use-portal>
                    <div><MpAutocomplete id="jif-pick-disabled" :data="[]" is-disabled is-full-width :placeholder="t('Search or select invoice')" /></div>
                  </MpTooltip>
                  <MpAutocomplete
                    v-else :id="`jif-pick-${pickerKey}`" :key="pickerKey" :data="availableInvoices" label-prop="name" value-prop="id"
                    is-searchable use-portal is-full-width :is-disabled="maxInvoiceLine" :placeholder="t('Search or select invoice')"
                    @update:model-value="addInvoice"
                  />
                </td>
                <td colspan="6" class="ex-td ex-td--blank" />
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="maxInvoiceLine || linesError" class="jif-line-error">{{ t('Min. 2 invoices & max. 150 invoices') }}</p>
      </section>

      <!-- Message · Memo · Attachment + Total remaining billed -->
      <section class="it-summary">
        <div class="je-notes-left">
          <MpFormControl id="jif-message">
            <MpFormLabel>{{ t('Message') }}</MpFormLabel>
            <MpTextarea id="jif-message-ta" v-model="message" :rows="3" is-full-width />
          </MpFormControl>
          <MpFormControl id="jif-memo">
            <MpFormLabel>{{ t('Memo') }}</MpFormLabel>
            <MpTextarea id="jif-memo-ta" v-model="memo" :rows="3" is-full-width />
          </MpFormControl>
          <MpFormControl id="jif-attach">
            <MpFormLabel>{{ t('Attachment') }}</MpFormLabel>
            <MpUpload id="jif-attach-up" accept=".jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.pdf,.zip" is-multiple is-full-width :placeholder="t('or drag and drop here')" :button-text="t('Browse file')" @change="onAttach" />
            <p class="ex-helper-text">{{ t('Files must be in XLS, DOC, PDF, JPG, PNG, or ZIP format, with a maximum size of 10 MB per file and 5 files per transaction') }}</p>
            <MpUploadList v-for="f in files" :id="`jif-file-${f.name}`" :key="f.name" :title="f.name" status="success" :subtitle="t('Uploaded')" icon-name="doc" is-show-remove-button @remove="files = files.filter((x) => x.name !== f.name)" />
          </MpFormControl>
        </div>
        <div class="je-totals">
          <div class="je-total-row"><span>{{ t('Total remaining billed') }}</span><span>{{ formatIDR(totalRemaining) }}</span></div>
        </div>
      </section>

      <MpBanner v-if="formError" id="jif-error" variant="danger" align-items="center">
        <MpBannerIcon id="jif-error-icon" />
        <MpBannerDescription>{{ formError }}</MpBannerDescription>
      </MpBanner>
    </div>

    <footer class="detail-footer">
      <MpButton variant="ghost" is-rounded @click="cancelOpen = true">{{ t('Cancel') }}</MpButton>
      <MpButton id="jif-save" variant="primary" is-rounded @click="onSave">{{ isEdit ? t('Save changes') : t('Save') }}</MpButton>
    </footer>

    <ConfirmModal
      v-model:is-open="cancelOpen"
      :title="t('Cancel joining the invoice?')"
      :description="t('All data that has been filled in will not be saved.')"
      :cancel-label="t('Continue joining')"
      :confirm-label="t('Cancel')"
      @confirm="leave"
    />

    <MpModal id="jif-confirm" :is-open="confirmOpen" size="sm" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="confirmOpen = false">
      <MpModalContent>
        <MpModalHeader>{{ t('Joining invoice confirmation') }}</MpModalHeader>
        <MpModalBody>
          <dl class="jif-confirm-list">
            <dt>{{ contactLabel }}</dt><dd>{{ contactName }}</dd>
            <dt>{{ t('Due date') }}</dt><dd>{{ dueDate }}</dd>
          </dl>
        </MpModalBody>
        <MpModalFooter>
          <MpButtonGroup>
            <MpButton variant="ghost" is-rounded @click="confirmOpen = false">{{ t('Cancel') }}</MpButton>
            <MpButton id="jif-confirm-btn" variant="primary" is-rounded @click="onConfirm">{{ t('Confirm') }}</MpButton>
          </MpButtonGroup>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>
  </div>
</template>

<style scoped>
.detail-page { --jif-field: 318px; height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; min-width: 0; }
.detail-breadcrumb-trail { display: flex; align-self: flex-start; }
.detail-breadcrumb { cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); color: var(--mp-text-default); }
.it-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-neutral); border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0; padding: var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-6); }
.detail-footer { flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-neutral); border-top: 1px solid var(--mp-border-default); }

.jif-header1 { display: flex; align-items: flex-start; gap: var(--mp-spacing-4) var(--mp-spacing-6); padding-bottom: var(--mp-spacing-5); border-bottom: 1px dashed var(--mp-border-default); }
.jif-header1 > .jif-field { flex: 0 0 var(--jif-field); }
.jif-header-total { margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; }
.jif-header-total-label { color: var(--mp-text-secondary); }
.jif-header-total-value { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); white-space: nowrap; }
.jif-header2 { display: flex; align-items: flex-start; flex-wrap: wrap; gap: var(--mp-spacing-4) var(--mp-spacing-6); }
.jif-header2 > .jif-field, .jif-col { flex: 0 0 var(--jif-field); min-width: 0; }
.jif-col { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.jif-field { min-width: 0; }
.jif-field :deep(.input-tag__root) { width: 100%; }
.jif-datepicker { width: 100%; }
.jif-datepicker :deep(.mp-datepicker__root) { width: 100%; }
.ex-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); color: var(--mp-text-secondary); }

.ex-table-section { overflow-x: auto; border-bottom: 1px solid var(--mp-border-default); }
.ex-table { width: 100%; min-width: 1080px; table-layout: fixed; border-collapse: collapse; }
.jif-col-inv { width: 240px; }
.jif-col-date { width: 120px; }
.jif-col-status { width: 120px; }
.jif-col-amt { width: 168px; }
.jif-col-del { width: 44px; }
.ex-th { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; height: var(--mp-sizes-7, 28px); text-align: left; padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2); background: var(--mp-background-neutral-subtle); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase; color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); }
.ex-th--num { text-align: right; }
.ex-td { height: var(--mp-sizes-10, 40px); border-bottom: 1px solid var(--mp-border-default); vertical-align: top; }
.ex-td--text { padding: var(--mp-spacing-2-5, 10px) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-2); color: var(--mp-text-default); }
.ex-td--num { text-align: right; white-space: nowrap; }
.ex-td--input { padding: 0; }
.ex-td--input :deep([class*='input']), .ex-td--input :deep([class*='autocomplete']), .ex-td--input :deep(textarea) { border-radius: 0; border-color: transparent; }
.ex-td--input :deep(textarea) { min-height: var(--mp-sizes-10, 40px); height: var(--mp-sizes-10, 40px); resize: vertical; }
.ex-td--input:focus-within { box-shadow: inset 0 0 0 2px var(--mp-border-focused); }
.ex-td--border { border-right: 1px solid var(--mp-border-default); border-left: 1px solid var(--mp-border-default); }
.ex-td--picker { border-bottom: none; }
.ex-td--blank { border-bottom: none; }
.ex-td--del { padding: 0; text-align: center; vertical-align: middle; }
.ex-del-btn { display: inline-flex !important; align-items: center; justify-content: center; width: var(--mp-sizes-8, 32px) !important; height: var(--mp-sizes-8, 32px) !important; min-width: 0 !important; border: none !important; background: none !important; color: var(--mp-text-secondary); }
.cell-link { color: var(--mp-text-link); }
.jif-line-error { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }

.it-summary { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--mp-spacing-6); flex-wrap: wrap; }
.je-notes-left { display: flex; flex-direction: column; gap: var(--mp-spacing-6); width: min(432px, 100%); }
.ex-helper-text { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.je-totals { display: flex; flex-direction: column; gap: var(--mp-spacing-3); width: min(428px, 100%); }
.je-total-row { display: flex; justify-content: space-between; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.jif-confirm-list { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-4); margin: 0; }
.jif-confirm-list dt { color: var(--mp-text-secondary); }
.jif-confirm-list dd { margin: 0; color: var(--mp-text-default); }
</style>
