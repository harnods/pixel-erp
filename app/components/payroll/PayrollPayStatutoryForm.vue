<script setup lang="ts">
/**
 * Statutory payment from the payable (OD-20): PPh 21, PPh 26, BPJS Kesehatan, BPJS
 * Ketenagakerjaan or another payroll payable. Debit payable, credit bank, one party per
 * payment. Several periods of one party pay in one deposit: an amount and a billing code per
 * period line, nothing filled oldest-first. Billing code (15 digits) and NTPN (16 characters)
 * are optional; a wrong length warns. Pay never adds DTP (TN-03). Over-payments need a
 * difference account (PSAK 201).
 */
import { MpButton, MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpDatePicker, MpSegmentedControl, MpBanner, MpBannerIcon, MpBannerDescription } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import PayrollPayDrawer from '~/components/payroll/PayrollPayDrawer.vue'
import { payStatutory, rupiah, today, accountLabel, monthLabel, dateLabel, type PayableRow } from '~/data/payrollStore'
import type { PayableParty } from '~/data/payrollMaster'
import { cashAccounts, differenceAccounts, latestTalentaFor, bpjsInvoiceTotal, toIso, fromIso } from '~/data/payrollUiPayables'
import { successToast, infoToast } from '~/utils/toasts'

const props = defineProps<{ isOpen: boolean; rows: PayableRow[] }>()
const emit = defineEmits<{ (e: 'update:isOpen', v: boolean): void; (e: 'posted'): void }>()
const { t } = useLocale()

interface Line { month: string; open: number; ledger: number; talenta: number | null; invoice: number | null; basis: 'ledger' | 'talenta' | 'invoice'; amount: string; billingCode: string; ntpn: string }
const lines = ref<Line[]>([])
const bank = ref('')
const date = ref('')
const diffAccount = ref('')
const showErrors = ref(false)
const error = ref('')

const party = computed<PayableParty | null>(() => props.rows[0]?.party ?? null)
const account = computed(() => props.rows[0]?.account ?? '')
const multi = computed(() => lines.value.length > 1)
const isTax = computed(() => party.value === 'DJP PPh 21' || party.value === 'DJP PPh 26')
const bankOptions = computed(() => cashAccounts.value.map((a) => ({ value: a.code, label: accountLabel(a.code) })))
const diffOptions = computed(() => differenceAccounts.value.map((a) => ({ value: a.code, label: accountLabel(a.code) })))
const title = computed(() => (party.value === 'Other' ? `${t('Pay')} ${accountLabel(account.value)}` : `${t('Pay')} ${party.value ?? ''}`))

watch(() => props.isOpen, (o) => {
  if (!o || !props.rows.length) return
  lines.value = props.rows.slice().sort((a, b) => a.month.localeCompare(b.month)).map((r) => {
    const talenta = latestTalentaFor(r.account, r.month)
    const invoice = bpjsInvoiceTotal(r.month, r.party)
    const invOpen = invoice == null ? null : invoice - r.paid
    return {
      month: r.month, open: r.balance, ledger: r.balance,
      talenta: talenta == null ? null : talenta - r.paid,
      invoice: invOpen != null && invOpen !== r.balance ? invOpen : null,
      basis: 'ledger' as const,
      amount: props.rows.length > 1 ? '' : String(r.balance),
      billingCode: '', ntpn: '',
    }
  })
  bank.value = cashAccounts.value[0]?.code ?? ''
  const start = `${lines.value[lines.value.length - 1]!.month}-01`
  date.value = fromIso(today() < start ? start : today())
  diffAccount.value = ''
  showErrors.value = false
  error.value = ''
}, { immediate: true })

function pickBasis(l: Line, basis: 'ledger' | 'talenta' | 'invoice') {
  l.basis = basis
  const v = basis === 'talenta' ? l.talenta : basis === 'invoice' ? l.invoice : l.ledger
  l.amount = String(v ?? l.ledger)
}
const basisOptions = (l: Line) => [
  { id: `${l.month}-ledger`, label: `${t('Ledger')} ${rupiah(l.ledger)}`, value: 'ledger' },
  ...(l.talenta != null ? [{ id: `${l.month}-talenta`, label: `${t('Latest Talenta')} ${rupiah(l.talenta)}`, value: 'talenta' }] : []),
  ...(l.invoice != null ? [{ id: `${l.month}-invoice`, label: `${t('BPJS invoice')} ${rupiah(l.invoice)}`, value: 'invoice' }] : []),
]

const num = (s: string) => Number(String(s).replace(/[^\d-]/g, '')) || 0
const total = computed(() => lines.value.reduce((s, l) => s + num(l.amount), 0))
const over = computed(() => lines.value.reduce((s, l) => s + Math.max(0, num(l.amount) - l.open), 0))
const lineError = (l: Line) => (num(l.amount) <= 0 ? t('Type an amount for this period.') : '')
const codeWarn = (l: Line) => (l.billingCode && !/^\d{15}$/.test(l.billingCode) ? t('A billing code has 15 digits.') : '')
const ntpnWarn = (l: Line) => (l.ntpn && l.ntpn.length !== 16 ? t('An NTPN has 16 characters.') : '')
const bankError = computed(() => (!bank.value ? t('Pick a Cash & Bank account.') : ''))
const dateError = computed(() => (!toIso(date.value) ? t('Pick a payment date.') : ''))
const diffError = computed(() => (over.value > 0 && !diffAccount.value ? t('Pick an expense or receivable account for the difference.') : ''))

function post() {
  showErrors.value = true
  error.value = ''
  if (!party.value || party.value === 'Staff') return
  if (bankError.value || dateError.value || diffError.value || lines.value.some((l) => lineError(l))) return
  const r = payStatutory({
    party: party.value,
    bank: bank.value,
    date: toIso(date.value),
    account: account.value,
    differenceAccount: diffAccount.value || undefined,
    periods: lines.value.map((l) => ({ month: l.month, amount: num(l.amount), billingCode: l.billingCode || undefined, ntpn: l.ntpn || undefined })),
  })
  if (!r.ok) { error.value = r.message ?? t('The payment did not post.'); return }
  successToast(`${t('Payment posted as')} ${r.number as string}`)
  for (const w of (r.warnings as string[] | undefined) ?? []) infoToast(w)
  emit('posted')
  emit('update:isOpen', false)
}
</script>

<template>
  <PayrollPayDrawer :is-open="isOpen" :title="title" :wide="multi" @update:is-open="(v: boolean) => emit('update:isOpen', v)">
    <template v-if="rows.length">
      <MpBanner v-if="multi" id="pst-multi" variant="info">
        <MpBannerIcon id="pst-multi-icon" />
        <MpBannerDescription>{{ t('Type the amount and billing code for each period. Nothing fills oldest-first.') }}</MpBannerDescription>
      </MpBanner>

      <div v-for="(l, i) in lines" :key="l.month" class="pst-line">
        <div class="pst-line-head">
          <span class="pst-line-title">{{ monthLabel(l.month) }}</span>
          <span class="pst-line-open">{{ t('Open') }} {{ rupiah(l.open) }} · {{ t('due') }} {{ rows[i]?.due ? dateLabel(rows[i]!.due!) : t('Not set') }}</span>
        </div>
        <template v-if="l.talenta != null || l.invoice != null">
          <p v-if="l.talenta != null" class="pst-warn">{{ t('Latest Talenta figure') }} {{ rupiah(l.talenta) }}, {{ t('ledger') }} {{ rupiah(l.ledger) }}. {{ t('Pick one before posting.') }}</p>
          <MpSegmentedControl :id="`pst-basis-${l.month}`" :name="`pst-basis-${l.month}`" :model-value="l.basis" :data="basisOptions(l)" @update:model-value="(v: 'ledger' | 'talenta' | 'invoice') => pickBasis(l, v)" />
        </template>
        <MpFormControl :id="`pst-amount-${l.month}`" is-required :is-invalid="showErrors && !!lineError(l)">
          <MpFormLabel>{{ t('Amount') }}</MpFormLabel>
          <MpInput :id="`pst-amount-${l.month}-input`" v-model="l.amount" autocomplete="off" />
          <MpFormErrorMessage>{{ lineError(l) }}</MpFormErrorMessage>
        </MpFormControl>
        <p v-if="num(l.amount) > 0 && num(l.amount) < l.open" class="pst-hint">{{ rupiah(l.open - num(l.amount)) }} {{ t('stays open.') }}</p>
        <p v-if="num(l.amount) > l.open" class="pst-hint">{{ rupiah(num(l.amount) - l.open) }} {{ t('above the open balance posts to the difference account.') }}</p>
        <div class="pst-pair">
          <MpFormControl :id="`pst-code-${l.month}`">
            <MpFormLabel>{{ isTax ? t('Billing code') : t('Payment code') }}</MpFormLabel>
            <MpInput :id="`pst-code-${l.month}-input`" v-model="l.billingCode" autocomplete="off" />
            <span v-if="codeWarn(l)" class="pst-warn">{{ codeWarn(l) }}</span>
          </MpFormControl>
          <MpFormControl v-if="isTax" :id="`pst-ntpn-${l.month}`">
            <MpFormLabel>{{ t('NTPN') }}</MpFormLabel>
            <MpInput :id="`pst-ntpn-${l.month}-input`" v-model="l.ntpn" autocomplete="off" />
            <span v-if="ntpnWarn(l)" class="pst-warn">{{ ntpnWarn(l) }}</span>
          </MpFormControl>
        </div>
      </div>

      <MpFormControl id="pst-bank" is-required :is-invalid="showErrors && !!bankError">
        <MpFormLabel>{{ t('Pay from') }}</MpFormLabel>
        <ErpFilterSelect id="pst-bank-select" :model-value="bank" :placeholder="t('Select account')" :options="bankOptions" :is-clearable="false" width="100%" @update:model-value="(v: string) => (bank = v)" />
        <MpFormErrorMessage>{{ bankError }}</MpFormErrorMessage>
      </MpFormControl>

      <MpFormControl v-if="over > 0" id="pst-diff" is-required :is-invalid="showErrors && !!diffError">
        <MpFormLabel>{{ t('Difference account') }}</MpFormLabel>
        <ErpFilterSelect id="pst-diff-select" :model-value="diffAccount" :placeholder="t('Select account')" :options="diffOptions" :is-clearable="false" width="100%" @update:model-value="(v: string) => (diffAccount = v)" />
        <MpFormErrorMessage>{{ diffError }}</MpFormErrorMessage>
      </MpFormControl>

      <MpFormControl id="pst-date" is-required :is-invalid="showErrors && !!dateError">
        <MpFormLabel>{{ t('Payment date') }}</MpFormLabel>
        <MpDatePicker id="pst-date-input" v-model="date" format="DD/MM/YYYY" value-type="format" use-portal />
        <MpFormErrorMessage>{{ dateError }}</MpFormErrorMessage>
      </MpFormControl>

      <div class="pst-total">
        <span>{{ t('Total deposit') }}</span>
        <span class="pst-num">{{ rupiah(total) }}</span>
      </div>
      <p v-if="party === 'DJP PPh 21'" class="pst-hint">{{ t('PPh 21 DTP sends no cash to DJP and is never added to this payment.') }}</p>
      <p v-if="error" class="pst-error">{{ error }}</p>
    </template>

    <template #footer>
      <MpButton variant="ghost" is-rounded @click="emit('update:isOpen', false)">{{ t('Cancel') }}</MpButton>
      <MpButton is-rounded @click="post">{{ t('Post payment') }}</MpButton>
    </template>
  </PayrollPayDrawer>
</template>

<style scoped>
.pst-line { display: flex; flex-direction: column; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border: 1px solid var(--mp-colors-border-default); border-radius: var(--mp-radii-md); }
.pst-line-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-3); }
.pst-line-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default); }
.pst-line-open { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
.pst-pair { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-3); }
.pst-hint { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
.pst-warn { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-warning); }
.pst-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.pst-total { display: flex; justify-content: space-between; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); padding-top: var(--mp-spacing-3); border-top: 1px solid var(--mp-colors-border-default); }
.pst-num { font-variant-numeric: tabular-nums; }
</style>
