<!-- prod-parity: jurnal-accounting-frontend/src/modules/cash-management/bank-deposits/views/BankDepositFormView.vue + bank-withdrawals/views/BankWithdrawalFormView.vue -->
<script setup lang="ts">
/**
 * Receive money (bank deposit) / Spend money (bank withdrawal) — create, edit
 * and duplicate. One form, two kinds: the route's first segment decides
 * (/bank-deposits/* vs /bank-withdrawals/*), matching prod's two route trees.
 */
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import {
  MpButton, MpInput, MpAutocomplete, MpDatePicker, MpInputTag, MpTextarea, MpUpload, MpUploadList,
  MpIcon, MpCheckbox, MpTooltip, MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, toast,
  type DataInterface,
} from '@mekari/pixel3'
import NumberFormatSettingsModal, { type NumberFormatConfig } from '~/components/patterns/NumberFormatSettingsModal.vue'
import { cashAccounts } from '~/data/cashAccounts'
import { contacts } from '~/data/contacts'
import {
  type CashTxKind, addCashTx, updateCashTx, getCashTx, nextCashTxNumber, cashTxTotals,
  CASH_TX_TAX_OPTIONS, LINE_ACCOUNT_OPTIONS,
} from '~/data/bankTransactions'
import { formatMoney } from '~/utils/currency'
import { payablePrefill, recordPayablePayment, accountLabel as payrollAccountLabel, rupiah, payrollAccount, useChartAccount } from '~/data/payrollStore'

const props = defineProps<{ orderId?: string }>()
const { t } = useLocale()
const router = useRouter()
const route = useRoute()

const kind: CashTxKind = route.path.startsWith('/bank-withdrawals') ? 'withdrawal' : 'deposit'
const base = kind === 'deposit' ? '/bank-deposits' : '/bank-withdrawals'
const isEdit = route.path.endsWith('/edit')
const duplicateFrom = typeof route.query.duplicateFrom === 'string' ? route.query.duplicateFrom : ''
const accountFrom = typeof route.query.accountFrom === 'string' ? route.query.accountFrom : ''
// ?payable=<key>: opened from Payroll payables > Pay. The form is prefilled with that payable, and
// saving it records the payment against it (the payable turns Paid or Partly paid).
const payableKey = kind === 'withdrawal' && typeof route.query.payable === 'string' ? route.query.payable : ''
const payable = payableKey ? payablePrefill(payableKey) : null

// Prod copy per kind (cashManagement.bankDeposit.* / bankWithdrawal.*)
const L = kind === 'deposit'
  ? { create: 'New receive money', edit: 'Edit receive money', account: 'Deposit to', contact: 'Payer', selectContact: 'Select payer', saved: 'Receive money saved' }
  : { create: 'New spend money', edit: 'Edit spend money', account: 'Pay from', contact: 'Payee', selectContact: 'Select payee', saved: 'Spend money saved' }

function toDisplayDate(iso: string) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
function toISODate(display: string) { const [d, m, y] = display.split('/'); return `${y}-${m}-${d}` }

// ── Header ─────────────────────────────────────────────────────────────────────
const cashAccountOptions = computed(() =>
  cashAccounts.filter((a) => !a.isArchived).map((a) => ({ id: a.id, name: `${a.code} ${a.name}` })),
)
const contactOptions = computed(() => {
  const list = contacts.map((c) => ({ id: c.displayName, name: c.displayName }))
  if (payable && !list.some((c) => c.id === payable.payee)) list.unshift({ id: payable.payee, name: payable.payee })
  return list
})
// The payable's account may not be in the default line account list; add it so the line shows it.
const lineAccountOptions = computed(() => (payable && !LINE_ACCOUNT_OPTIONS.some((o) => o.id === payable.account)
  ? [{ id: payable.account, name: payrollAccountLabel(payable.account) }, ...LINE_ACCOUNT_OPTIONS]
  : LINE_ACCOUNT_OPTIONS))

const cashAccountId = ref('')
const cashAccountError = ref(false)
const contact = ref('')
const transactionDate = ref(toDisplayDate(new Date().toISOString().slice(0, 10)))
const transactionNo = ref('')
const referenceNo = ref('')
const tags = ref<DataInterface[]>([])
function onTagsChange(data: DataInterface[]) { tags.value = data }
const priceIncludesTax = ref(false)

const currency = computed(() => cashAccounts.find((a) => a.id === cashAccountId.value)?.currency ?? 'IDR')

// Transaction no. — auto-numbered (prod "Transaction numbering" popover).
const noSettingsOpen = ref(false)
const nextNo = computed(() => String(nextCashTxNumber(kind)))
const noFormats = [{ label: t('Auto'), value: 'auto' }]
function onNoFormatSave(_c: NumberFormatConfig) { noSettingsOpen.value = false }

// ── Lines — the trailing empty row is the add-row anchor (prod LineTable) ─────
interface Row { id: number; accountCode: string; description: string; taxId: string; amount: string; accountError: boolean; amountError: boolean }
let seq = 1
function makeRow(): Row { return { id: seq++, accountCode: '', description: '', taxId: '', amount: '', accountError: false, amountError: false } }
const rows = ref<Row[]>([makeRow()])
function onAccountSelect(row: Row) {
  if (row.accountCode) row.accountError = false
  const last = rows.value[rows.value.length - 1]
  if (last && last.id === row.id && row.accountCode) rows.value.push(makeRow())
}
function removeRow(id: number) {
  if (rows.value.length === 1) return
  rows.value = rows.value.filter((r) => r.id !== id)
}
function amountOf(r: Row): number { return Number(String(r.amount).replace(/\./g, '')) || 0 }
function onAmountInput(r: Row, v: string | number) {
  const digits = String(v).replace(/\D/g, '')
  r.amount = digits ? Number(digits).toLocaleString('id-ID') : ''
  r.amountError = false
}
const filledRows = computed(() => rows.value.filter((r) => r.accountCode))
const totals = computed(() => cashTxTotals(
  filledRows.value.map((r) => ({ accountCode: r.accountCode, description: r.description, taxId: r.taxId, amount: amountOf(r) })),
  priceIncludesTax.value,
))

// ── Memo / attachment ──────────────────────────────────────────────────────────
const memo = ref('')
const attachedFiles = ref<File[]>([])
function onAttachmentChange(files: FileList | null) {
  if (!files) return
  for (const f of Array.from(files)) if (!attachedFiles.value.some((x) => x.name === f.name)) attachedFiles.value.push(f)
}
function removeAttachedFile(name: string) { attachedFiles.value = attachedFiles.value.filter((f) => f.name !== name) }

// ── Save ───────────────────────────────────────────────────────────────────────
const saveFailed = ref(false)
function goBack() {
  if (payable) { router.push('/payroll-payables'); return }
  if (isEdit && props.orderId) router.push(`${base}/${props.orderId}`)
  else if (accountFrom) router.push(`/cash-management/${accountFrom}`)
  else router.push('/cash-management')
}
function handleSave() {
  let ok = true
  if (!cashAccountId.value) { cashAccountError.value = true; ok = false }
  if (!filledRows.value.length) { const r = rows.value[0]; if (r) r.accountError = true; ok = false }
  for (const r of filledRows.value) if (amountOf(r) <= 0) { r.amountError = true; ok = false }
  saveFailed.value = !ok
  if (!ok) return
  const payload = {
    cashAccountId: cashAccountId.value,
    contact: contact.value || '',
    transactionDate: toISODate(transactionDate.value),
    referenceNo: referenceNo.value.trim() || undefined,
    tags: tags.value.map((tg) => tg.label ?? String(tg.value ?? '')).filter(Boolean),
    priceIncludesTax: priceIncludesTax.value,
    lines: filledRows.value.map((r) => ({ accountCode: r.accountCode, description: r.description.trim(), taxId: r.taxId || '', amount: amountOf(r) })),
    memo: memo.value.trim() || undefined,
  }
  const saved = isEdit && props.orderId ? updateCashTx(props.orderId, payload) : addCashTx(kind, payload)
  if (saved && payable) {
    const paidNow = filledRows.value.filter((r) => r.accountCode === payable.account).reduce((sum, r) => sum + amountOf(r), 0)
    const cash = cashAccounts.find((a) => a.id === cashAccountId.value)
    const bank = cash?.code ?? ''
    if (cash && !payrollAccount(bank)) useChartAccount({ code: bank, name: cash.name, type: 'cash' })
    const res = recordPayablePayment(payable.key, { cashTxId: saved.id, number: `Spend money #${saved.number}`, bank, date: payload.transactionDate, amount: paidNow })
    if (!res.ok) { toast.notify({ variant: 'error', title: t(res.message ?? 'Unable to record the payment on the payable.') }); return }
    toast.notify({ variant: 'success', title: t(`${payable.label} paid: ${rupiah(paidNow)}`) })
    router.push('/payroll-payables')
    return
  }
  toast.notify({ variant: 'success', title: t(L.saved) })
  if (saved) router.push(`${base}/${saved.id}`)
}

// ── Prefill (edit / duplicate / ?accountFrom=) ─────────────────────────────────
function prefill(id: string) {
  const tx = getCashTx(id)
  if (!tx) return
  cashAccountId.value = tx.cashAccountId
  contact.value = tx.contact
  transactionDate.value = toDisplayDate(tx.transactionDate)
  referenceNo.value = tx.referenceNo ?? ''
  tags.value = tx.tags.map((label) => ({ value: label, label } as DataInterface))
  priceIncludesTax.value = tx.priceIncludesTax
  memo.value = tx.memo ?? ''
  rows.value = [
    ...tx.lines.map((l) => ({ ...makeRow(), accountCode: l.accountCode, description: l.description, taxId: l.taxId, amount: l.amount ? l.amount.toLocaleString('id-ID') : '' })),
    makeRow(),
  ]
  if (isEdit) transactionNo.value = String(tx.number)
}

// Sticky footer border once the stage scrolls.
const stageEl = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)
function checkStageOverflow() { const el = stageEl.value; if (el) stageOverflowing.value = el.scrollHeight > el.clientHeight + 1 }
let observer: ResizeObserver | null = null
onMounted(() => {
  if (isEdit && props.orderId) prefill(props.orderId)
  else if (duplicateFrom) prefill(duplicateFrom)
  else if (accountFrom && cashAccounts.some((a) => a.id === accountFrom)) cashAccountId.value = accountFrom
  else if (payable) {
    cashAccountId.value = cashAccounts.find((a) => a.name === 'Bank BCA' && !a.isArchived)?.id ?? ''
    contact.value = payable.payee
    transactionDate.value = toDisplayDate(payable.date)
    memo.value = payable.memo
    rows.value = [{ ...makeRow(), accountCode: payable.account, description: payable.label, amount: payable.amount.toLocaleString('id-ID') }, makeRow()]
  }
  nextTick(() => {
    checkStageOverflow()
    observer = new ResizeObserver(checkStageOverflow)
    if (stageEl.value) { observer.observe(stageEl.value); stageEl.value.addEventListener('scroll', checkStageOverflow, { passive: true }) }
  })
})
onUnmounted(() => { observer?.disconnect() })
</script>

<template>
  <div class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <span class="detail-breadcrumb detail-breadcrumb--static">{{ t('Cash management') }}</span>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ isEdit ? t(L.edit) : t(L.create) }}</h1>
        </div>
      </div>
    </header>

    <div ref="stageEl" class="it-stage">
      <MpBanner v-if="payable" id="ctf-payable" variant="info" data-testid="ctf-payable">
        <MpBannerIcon />
        <MpBannerTitle>{{ t('Paying a payroll payable') }}</MpBannerTitle>
        <MpBannerDescription>{{ t(`${payable.label}: ${rupiah(payable.amount)} still owed to ${payable.payee}. Saving records the payment, and Payroll payables shows it paid.`) }}</MpBannerDescription>
      </MpBanner>
      <!-- Deposit to / Pay from + Payer / Payee + Total -->
      <div class="ex-row-1">
        <MpFormControl id="ctf-account" class="ex-field-flex" :is-invalid="cashAccountError" is-required>
          <MpFormLabel>{{ t(L.account) }}</MpFormLabel>
          <MpAutocomplete
            id="ctf-account-ac" v-model="cashAccountId" :data="cashAccountOptions"
            label-prop="name" value-prop="id" is-searchable is-clearable use-portal is-full-width
            :is-invalid="cashAccountError" :placeholder="t('Select account')"
            @update:model-value="cashAccountError = false"
          />
          <MpFormErrorMessage>{{ t('You must select account') }}</MpFormErrorMessage>
        </MpFormControl>
        <MpFormControl id="ctf-contact" class="ex-field-flex">
          <MpFormLabel>{{ t(L.contact) }}</MpFormLabel>
          <MpAutocomplete
            id="ctf-contact-ac" v-model="contact" :data="contactOptions"
            label-prop="name" value-prop="id" is-searchable is-clearable use-portal is-full-width
            :placeholder="t(L.selectContact)"
          />
        </MpFormControl>
        <div class="it-total-inline">
          <span class="detail-total-amount">
            <span class="detail-total-label">{{ t('Total') }}</span> {{ formatMoney(totals.total, currency) }}
          </span>
        </div>
      </div>

      <div class="ex-grid-2">
        <MpFormControl id="ctf-txdate">
          <MpFormLabel>{{ t('Transaction date') }}</MpFormLabel>
          <div class="ex-datepicker">
            <MpDatePicker id="ctf-txdate-dp" v-model="transactionDate" format="DD/MM/YYYY" value-type="format" use-portal />
          </div>
        </MpFormControl>
        <MpFormControl id="ctf-transno">
          <div class="ex-label-row">
            <MpFormLabel>{{ t('Transaction no.') }}</MpFormLabel>
            <button class="ex-label-icon btn-enterprise" type="button" :aria-label="t('Transaction numbering')" @click="noSettingsOpen = true">
              <MpIcon name="settings" size="sm" />
            </button>
          </div>
          <MpInput id="ctf-transno-input" v-model="transactionNo" :placeholder="t('[Auto]')" is-full-width is-disabled />
        </MpFormControl>
        <MpFormControl id="ctf-refno">
          <MpFormLabel>{{ t('Reference no.') }}</MpFormLabel>
          <MpInput id="ctf-refno-input" v-model="referenceNo" is-full-width />
        </MpFormControl>
        <MpFormControl id="ctf-tags">
          <MpFormLabel>{{ t('Tags') }}</MpFormLabel>
          <MpInputTag id="ctf-tags-input" :data="tags" :is-enable-create-new-tag="true" :is-show-suggestions="false" :placeholder="t('Select tags')" @change="onTagsChange" />
        </MpFormControl>
      </div>

      <MpBanner v-if="saveFailed" id="ctf-error-banner" variant="danger" align-items="center" class="ctf-banner">
        <MpBannerIcon id="ctf-error-banner-icon" />
        <MpBannerTitle>{{ t('Failed to save') }}</MpBannerTitle>
        <MpBannerDescription>{{ t('The transaction contains incomplete or invalid data. Review the highlighted fields.') }}</MpBannerDescription>
      </MpBanner>

      <div class="ex-price-includes">
        <MpCheckbox id="ctf-price-incl" :is-checked="priceIncludesTax" @change="priceIncludesTax = !priceIncludesTax" />
        <span>{{ t('Price includes tax') }}</span>
      </div>

      <div class="ex-table-section">
        <div class="ex-table-scroll">
          <table class="ex-table ex-lineitems-table">
            <colgroup>
              <col class="ex-col-account" />
              <col class="ex-col-desc" />
              <col class="ex-col-tax" />
              <col class="ex-col-amount" />
              <col class="ex-col-del" />
            </colgroup>
            <thead>
              <tr>
                <th class="ex-th">{{ t('Account') }}</th>
                <th class="ex-th">{{ t('Description') }}</th>
                <th class="ex-th">{{ t('Tax') }}</th>
                <th class="ex-th">{{ t('Amount') }}</th>
                <th class="ex-th" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.id">
                <td class="ex-td ex-td--input ex-td--border" :class="{ 'ex-td--error': row.accountError }">
                  <MpTooltip v-if="row.accountError" :id="`ctf-acc-tip-${row.id}`" :label="t('You must select account')" placement="top" use-portal>
                    <MpAutocomplete
                      :id="`ctf-acc-${row.id}`" v-model="row.accountCode" :data="lineAccountOptions"
                      label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                      :placeholder="t('Select account')" @update:model-value="onAccountSelect(row)"
                    />
                  </MpTooltip>
                  <MpAutocomplete
                    v-else
                    :id="`ctf-acc-${row.id}`" v-model="row.accountCode" :data="lineAccountOptions"
                    label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                    :placeholder="t('Select account')" @update:model-value="onAccountSelect(row)"
                  />
                </td>
                <template v-if="row.accountCode">
                  <td class="ex-td ex-td--input ex-td--border">
                    <MpInput :id="`ctf-desc-${row.id}`" v-model="row.description" is-full-width />
                  </td>
                  <td class="ex-td ex-td--input ex-td--border">
                    <MpAutocomplete
                      :id="`ctf-tax-${row.id}`" v-model="row.taxId" :data="CASH_TX_TAX_OPTIONS"
                      label-prop="name" value-prop="id" is-searchable is-clearable use-portal is-full-width
                      :placeholder="t('Select tax')"
                    />
                  </td>
                  <td class="ex-td ex-td--input ex-td--amount" :class="{ 'ex-td--error': row.amountError }">
                    <div class="ex-amount-cell">
                      <span class="ex-amount-prefix">{{ currency === 'IDR' ? 'Rp' : currency }}</span>
                      <MpInput :id="`ctf-amount-${row.id}`" :model-value="row.amount" inputmode="numeric" is-full-width class="ex-amount-input" placeholder="0" @update:model-value="(v: string | number) => onAmountInput(row, v)" />
                    </div>
                  </td>
                  <td class="ex-td ex-td--del">
                    <div class="ex-cell-center">
                      <MpButton class="ex-del-btn" is-rounded :aria-label="t('Remove')" @click="removeRow(row.id)">
                        <MpIcon name="minus-circular" size="sm" />
                      </MpButton>
                    </div>
                  </td>
                </template>
                <template v-else>
                  <td class="ex-td" /><td class="ex-td" /><td class="ex-td" /><td class="ex-td" />
                </template>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Memo + Attachment | Subtotal / Tax total / Total -->
      <div class="it-summary">
        <div class="ctf-notes-left">
          <div class="ex-section it-memo">
            <MpFormControl id="ctf-memo">
              <MpFormLabel>{{ t('Memo') }}</MpFormLabel>
              <MpTextarea id="ctf-memo-textarea" v-model="memo" is-full-width :rows="3" />
            </MpFormControl>
            <p class="ex-helper-text">{{ t('Only visible to you and your team') }}</p>
          </div>
          <div class="ex-section it-attachment-section">
            <div class="ex-section-label-row"><div class="ex-section-label">{{ t('Attachment') }}</div></div>
            <div class="ex-attachment">
              <MpUpload
                id="ctf-attachment-upload" class="ex-attachment-upload"
                accept=".xls,.xlsx,.doc,.docx,.pdf,.jpg,.jpeg,.png,.zip" is-multiple is-full-width
                :placeholder="t('or drag and drop here')" :button-text="t('Choose file')"
                @change="onAttachmentChange"
              />
              <MpUploadList
                v-for="f in attachedFiles" :id="`ctf-file-${f.name}`" :key="f.name"
                :title="f.name" status="success" :subtitle="t('Uploaded')" icon-name="doc"
                is-show-remove-button @remove="removeAttachedFile(f.name)"
              />
            </div>
          </div>
        </div>
        <div class="ctf-totals">
          <div class="ctf-total-row"><span>{{ t('Subtotal') }}</span><span>{{ formatMoney(totals.subtotal, currency) }}</span></div>
          <div class="ctf-total-row"><span>{{ t('Tax total') }}</span><span>{{ formatMoney(totals.taxTotal, currency) }}</span></div>
          <div class="ctf-total-row ctf-total-row--grand"><span>{{ t('Total') }}</span><span>{{ formatMoney(totals.total, currency) }}</span></div>
        </div>
      </div>
    </div>

    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <MpButton variant="ghost" is-rounded @click="goBack">{{ t('Cancel') }}</MpButton>
      <MpButton variant="primary" is-rounded @click="handleSave">{{ t('Save') }}</MpButton>
    </footer>

    <NumberFormatSettingsModal
      v-model:open="noSettingsOpen"
      :title="t('Transaction numbering')"
      :caption="t('Numbers are auto-generated by the system.')"
      :next-number="nextNo"
      :existing-formats="noFormats"
      @save="onNoFormatSave"
    />
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb-trail { display: flex; align-items: center; gap: var(--mp-spacing-1); align-self: flex-start; }
.detail-breadcrumb { align-self: flex-start; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px); }
.detail-breadcrumb--static { cursor: default; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default);
}
.it-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-neutral); border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0;
  padding: var(--mp-spacing-6); container-type: inline-size;
}
.detail-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-neutral);
  border-top: 1px solid transparent; transition: border-top-color 0.15s;
}
.detail-footer--floating { border-top-color: var(--mp-border-default); }

.ex-row-1 {
  display: flex; align-items: flex-end; gap: var(--mp-spacing-6); flex-wrap: wrap;
  padding-bottom: var(--mp-spacing-5); border-bottom: 1px dashed var(--mp-border-default);
}
.ex-field-flex { width: var(--mp-sizes-79, 316px); flex-shrink: 0; min-width: 0; }
.it-total-inline { margin-left: auto; display: flex; align-items: flex-end; padding-bottom: var(--mp-spacing-2); white-space: nowrap; }
.detail-total-amount { font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.detail-total-label { font-weight: var(--mp-font-weights-semi-bold); }

.ex-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-4) var(--mp-spacing-6); padding: var(--mp-spacing-5) 0 var(--mp-spacing-6); max-width: 620px; }
@container (min-width: 860px) { .ex-grid-2 { grid-template-columns: repeat(4, 1fr); max-width: none; } }
.ex-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.ex-label-icon { display: flex; align-items: center; color: var(--mp-text-secondary); cursor: pointer; background: none; border: none; padding: 0; }
.ex-datepicker { width: 100%; }
.ex-datepicker :deep(.mp-datepicker__root) { width: 100%; }
.ctf-banner { margin-bottom: var(--mp-spacing-3); }
.ex-price-includes { display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

/* Line table — same form-table as InternalTransferFormPage / NewExpensePage. */
.ex-table-section { overflow-x: auto; border-bottom: 1px solid var(--mp-border-default); }
.ex-table-scroll { overflow-x: auto; }
.ex-table { width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0; }
.ex-col-account { width: 260px; }
.ex-col-desc { width: auto; }
.ex-col-tax { width: 180px; }
.ex-col-amount { width: 240px; }
.ex-col-del { width: 44px; }
.ex-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.ex-td {
  height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); vertical-align: top;
}
.ex-td--input { padding: 0; }
.ex-td--input :deep([class*='input']), .ex-td--input :deep([class*='autocomplete']) { border-radius: 0; border-color: transparent; }
.ex-td--input:focus-within { box-shadow: inset 0 0 0 2px var(--mp-border-focused); }
.ex-td--border { border-right: 1px solid var(--mp-border-default); }
.ex-td--error { background: var(--mp-colors-background-danger); box-shadow: inset 0 -1px 0 0 var(--mp-border-danger); }
.ex-td--error :deep([class*='autocomplete']), .ex-td--error :deep([class*='input']) { background: transparent; }
.ex-lineitems-table { min-width: 764px; }
.ex-td--amount { padding: 0; position: relative; }
.ex-amount-cell { display: flex; align-items: stretch; position: absolute; inset: 0; }
.ex-amount-prefix {
  flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  padding: 0 var(--mp-spacing-2); background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.ex-amount-input { flex: 1; min-width: 0; }
.ex-amount-cell :deep(.mp-input__root) { flex: 1; min-width: 0; height: var(--mp-sizes-10, 40px); }
.ex-td--del { padding: 0; text-align: center; }
.ex-cell-center { display: flex; align-items: center; justify-content: center; height: 100%; }
.ex-del-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px) !important; height: var(--mp-sizes-8, 32px) !important; min-width: 0 !important;
  border: none !important; background: none !important; cursor: pointer; color: var(--mp-text-secondary);
}
.ex-del-btn:hover { color: var(--mp-text-danger); }

.it-summary { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-6); padding: var(--mp-spacing-4) 0; flex-wrap: wrap; }
.ctf-notes-left { display: flex; flex-direction: column; gap: var(--mp-spacing-6); flex: 1 1 320px; max-width: 440px; }
.ex-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ex-helper-text { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm); }
.ex-section-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ex-attachment { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ctf-totals { display: flex; flex-direction: column; gap: var(--mp-spacing-3); width: min(428px, 100%); padding-top: var(--mp-spacing-2); }
.ctf-total-row { display: flex; justify-content: space-between; gap: var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ctf-total-row--grand { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); padding-top: var(--mp-spacing-3); border-top: 1px solid var(--mp-border-default); }
</style>
