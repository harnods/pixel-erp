<!-- prod-parity: quickbook/app/views/closing_the_books/new.html.haml (+ financial_period, check_reconciliations, worksheet, _worksheet_table, financial_statements, _trial_balance, _income_statement, _balance_sheet, _cash_flow, success.haml, show.html.haml; locking_periods/* for the period-lock variant) -->
<script setup lang="ts">
/**
 * Close-books wizard (full page, detailMatch). Routes:
 *   /close-books/new?type=ctb|lp       Financial Period (no draft yet)
 *   /close-books/:id/period            Financial Period (Change Period)
 *   /close-books/:id/reconciliations   Previous Reconciliations
 *   /close-books/:id/worksheet         Worksheet Trial Balance (+ tax / retained earnings for a closing book)
 *   /close-books/:id/statements        Financial Statements → Confirm Close Book / Confirm
 *   /close-books/:id/success           Book closed
 *   /close-books/:id                   Published lock → its financial statements
 * Every figure comes from the chart-of-accounts ledger; assertBalanced() throws if
 * the trial balance or assets = liabilities + equity ever breaks.
 */
import {
  MpButton, MpDatePicker, MpFormControl, MpFormErrorMessage, MpFormLabel, MpIcon, MpInput, MpTextarea, MpTooltip,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel,
} from '@mekari/pixel3'
import ErpStepper from '~/components/patterns/ErpStepper.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { infoToast, successToast } from '~/utils/toasts'
import { SIM_TODAY_ISO } from '~/data/simClock'
import { coaRecords, accountOptionLabel } from '~/data/chartOfAccounts'
import {
  COMPANY_NAME, getBook, draftOf, startDraft, updateBook, publish, nextStartDate, endDateError, lockDate,
  worksheetRows, worksheetTotals, trialBalance, incomeStatement, balanceSheet, cashFlow, assertBalanced,
  registerChecks, WAREHOUSE_ADJUSTMENTS, type ClosingBook, type LockType, type WizardStep,
} from '~/data/closeBooks'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()
const route = useRoute()

// ── Route → book + step ──
const segs = computed(() => props.orderId.split('/'))
const isNew = computed(() => segs.value[0] === 'new')
const book = computed<ClosingBook | undefined>(() => (isNew.value ? undefined : getBook(segs.value[0]!)))
type View = WizardStep | 'success' | 'show'
const view = computed<View>(() => {
  if (isNew.value) return 'period'
  const s = segs.value[1]
  if (!s) return book.value?.status === 'published' ? 'show' : (book.value?.step ?? 'period')
  return s as View
})
const lockType = computed<LockType>(() => book.value?.lockType ?? (route.query.type === 'lp' ? 'lp' : 'ctb'))
const isCtb = computed(() => lockType.value === 'ctb')

const STEP_LABEL: Record<WizardStep, string> = {
  period: 'Financial Period', reconciliations: 'Check Reconciliations', worksheet: 'Worksheet', statements: 'Financial Statement',
}
const steps = computed(() => (['period', 'reconciliations', 'worksheet', 'statements'] as WizardStep[]).map(k => ({ key: k, label: t(STEP_LABEL[k]) })))
const doneSteps = computed(() => {
  const order: WizardStep[] = ['period', 'reconciliations', 'worksheet', 'statements']
  const reached = book.value ? order.indexOf(book.value.step) : 0
  return order.filter((_, i) => i < reached)
})
function goStep(key: string) { if (book.value) router.push(`/close-books/${book.value.id}/${key}`) }

const headerLabel = computed(() => (isCtb.value ? t('Closing Books') : t('Period Lock')))
const TITLES: Record<View, string> = {
  period: 'Financial Period', reconciliations: 'Previous Reconciliations', worksheet: 'Worksheet Trial Balance',
  statements: 'Financial Statements', success: 'Book Closed', show: 'Financial Statements',
}
const title = computed(() => t(TITLES[view.value]))
const periodLabel = computed(() => {
  const b = book.value
  if (!b) return ''
  const end = formatDate(b.endDate)
  return b.startDate ? `${formatDate(b.startDate)} - ${end}` : `${t('From beginning until')} ${end}`
})

function back() { router.push('/close-books') }
function money(n: number) { return n < 0 ? `(${formatIDR(-n)})` : formatIDR(n) }
function cell(n: number) { return n ? formatIDR(n) : '' }

// ── 1. Financial period ──
const toDmy = (iso: string) => iso.split('-').reverse().join('/')
const toIso = (dmy: string) => dmy.split('/').reverse().join('-')
const endDate = ref('')
const endError = ref('')
watch([book, isNew], () => {
  const last = lockDate()
  const fallback = SIM_TODAY_ISO.slice(0, 8) + '01'
  const suggested = book.value?.endDate ?? (last && last >= fallback ? SIM_TODAY_ISO : new Date(new Date(fallback + 'T00:00:00Z').getTime() - 86_400_000).toISOString().slice(0, 10))
  endDate.value = toDmy(suggested)
  endError.value = ''
}, { immediate: true })
const fromLabel = computed(() => {
  const s = book.value ? book.value.startDate : nextStartDate(lockType.value)
  return s ? formatDate(s) : t('From beginning')
})
function submitPeriod() {
  const iso = endDate.value ? toIso(endDate.value) : ''
  endError.value = t(endDateError(iso))
  if (endError.value) return
  if (iso > SIM_TODAY_ISO) { endError.value = t('To date cannot be after today'); return }
  const b = startDraft(lockType.value, iso)
  updateBook(b.id, { step: maxStep(b.step, 'reconciliations') })
  router.push(`/close-books/${b.id}/reconciliations`)
}
function maxStep(a: WizardStep, b: WizardStep): WizardStep {
  const o: WizardStep[] = ['period', 'reconciliations', 'worksheet', 'statements']
  return o.indexOf(a) >= o.indexOf(b) ? a : b
}

// ── 2. Check reconciliations ──
const registers = computed(() => (book.value ? registerChecks(book.value) : []))
const openSections = reactive<Record<string, boolean>>({ bank: false, stock: false, drafts: false })
const draftLinks = [
  { label: 'Show Draft Sales Transactions', to: '/sales-invoices' },
  { label: 'Show Draft Purchases Transactions', to: '/purchase-invoices' },
  { label: 'Show Draft Expenses Transactions', to: '/expenses' },
]
function nextFromRecon() {
  if (!book.value) return
  updateBook(book.value.id, { step: maxStep(book.value.step, 'worksheet') })
  router.push(`/close-books/${book.value.id}/worksheet`)
}

// ── 3. Worksheet ──
const ws = computed(() => (book.value ? worksheetRows(book.value) : []))
const wsTotals = computed(() => worksheetTotals(ws.value))
const WS_SECTIONS = [
  { type: 'asset', label: 'Asset' }, { type: 'liability', label: 'Liability' }, { type: 'equity', label: 'Equity' },
  { type: 'income', label: 'Income' }, { type: 'expense', label: 'Expense' },
] as const
const wsBy = (type: string) => ws.value.filter(r => r.type === type)
const isPLType = (type: string) => type === 'income' || type === 'expense'
const dr = (n: number) => (n > 0 ? n : 0)
const cr = (n: number) => (n < 0 ? -n : 0)

const wsForm = reactive({ memo: '', taxExpenseAccount: '', taxPayableAccount: '', retainedEarningsAccount: '', taxPercentage: '0', taxAmount: '0' })
const wsErrors = reactive<Record<string, string>>({})
watch(book, (b) => {
  if (!b) return
  Object.assign(wsForm, {
    memo: b.memo, taxExpenseAccount: b.taxExpenseAccount, taxPayableAccount: b.taxPayableAccount,
    retainedEarningsAccount: b.retainedEarningsAccount, taxAmount: String(b.taxAmount || 0),
    taxPercentage: wsTotals.value.netProfit > 0 && b.taxAmount ? String(Math.round((b.taxAmount / wsTotals.value.netProfit) * 10000) / 100) : '0',
  })
}, { immediate: true })
const accOpts = (pred: (code: string) => boolean) => coaRecords.filter(a => pred(a.code) && !a.archived).map(a => ({ value: a.id, label: accountOptionLabel(a) }))
const taxExpenseOptions = computed(() => accOpts(c => c.startsWith('9-') || c.startsWith('8-') || c.startsWith('6-')))
const taxPayableOptions = computed(() => accOpts(c => c.startsWith('2-')))
const equityOptions = computed(() => accOpts(c => c.startsWith('3-')))
const parseNum = (v: string) => Number(String(v).replace(/[^0-9.-]/g, '')) || 0
const taxAmountNum = computed(() => parseNum(wsForm.taxAmount))
const netAfterTax = computed(() => wsTotals.value.netProfit - taxAmountNum.value)
function onTaxPercentage(v: string) {
  wsForm.taxPercentage = v
  delete wsErrors.taxPercentage
  const pct = parseNum(v)
  if (pct < 0 || pct > 100) { wsErrors.taxPercentage = t('Tax percentage must be between 0 and 100'); return }
  wsForm.taxAmount = String(Math.max(0, Math.round(wsTotals.value.netProfit * pct / 100)))
}
function onTaxAmount(v: string) { wsForm.taxAmount = v; delete wsErrors.taxAmount }
function saveWorksheet() {
  if (!book.value) return
  Object.keys(wsErrors).forEach(k => delete wsErrors[k])
  if (isCtb.value) {
    if (taxAmountNum.value < 0) wsErrors.taxAmount = t('Tax amount cannot be negative')
    else if (taxAmountNum.value > 0 && taxAmountNum.value > Math.max(0, wsTotals.value.netProfit)) wsErrors.taxAmount = t('Tax amount cannot exceed net profit')
    if (taxAmountNum.value > 0 && !wsForm.taxExpenseAccount) wsErrors.taxExpenseAccount = t('You must select tax expense account')
    if (taxAmountNum.value > 0 && !wsForm.taxPayableAccount) wsErrors.taxPayableAccount = t('You must select tax payable account')
    if (!wsForm.retainedEarningsAccount) wsErrors.retainedEarningsAccount = t('You must select retained earnings account')
  }
  if (Object.keys(wsErrors).length) return
  updateBook(book.value.id, {
    memo: wsForm.memo.trim(), taxAmount: isCtb.value ? taxAmountNum.value : 0,
    taxExpenseAccount: wsForm.taxExpenseAccount, taxPayableAccount: wsForm.taxPayableAccount, retainedEarningsAccount: wsForm.retainedEarningsAccount,
    totalDebit: wsTotals.value.isDebit, totalCredit: wsTotals.value.isCredit,
    step: maxStep(book.value.step, 'statements'),
  })
  successToast(t('Worksheet saved'))
  router.push(`/close-books/${book.value.id}/statements`)
}

// ── 4. Financial statements (also the published "show" page) ──
const activeTab = ref('tb')
const tb = computed(() => (book.value ? trialBalance(book.value) : []))
const tbTotals = computed(() => tb.value.reduce((s, r) => ({
  od: s.od + dr(r.opening), oc: s.oc + cr(r.opening), md: s.md + r.movementDebit, mc: s.mc + r.movementCredit, ed: s.ed + dr(r.ending), ec: s.ec + cr(r.ending),
}), { od: 0, oc: 0, md: 0, mc: 0, ed: 0, ec: 0 }))
const is = computed(() => (book.value ? incomeStatement(book.value) : null))
const bs = computed(() => (book.value ? balanceSheet(book.value) : null))
const cf = computed(() => (book.value ? cashFlow(book.value) : null))
const balanced = computed(() => { if (book.value && (view.value === 'statements' || view.value === 'show' || view.value === 'worksheet')) assertBalanced(book.value); return true })
const statementPeriod = computed(() => {
  const b = book.value
  if (!b) return ''
  return b.startDate ? `${formatDate(b.startDate)} - ${formatDate(b.endDate)}` : `${t('For period ended')} ${formatDate(b.endDate)}`
})
const tbBy = (type: string) => tb.value.filter(r => r.type === type)
function confirmClose() {
  if (!book.value) return
  publish(book.value.id)
  router.push(`/close-books/${book.value.id}/success`)
}
function accountLink(id: string) { router.push(`/chart-of-accounts/${encodeURIComponent(id)}`) }
const notInPrototype = () => infoToast(t('Not in this prototype'))

// A draft can't jump past the step it reached; a published lock only has show/success.
watch([book, view], () => {
  const b = book.value
  if (isNew.value) {
    const d = draftOf(lockType.value)
    if (d) router.replace(`/close-books/${d.id}/period`)
    return
  }
  if (!b) return
  if (b.status === 'published' && !['show', 'success'].includes(view.value)) router.replace(`/close-books/${b.id}`)
  else if (b.status === 'draft' && view.value !== 'period' && view.value !== 'success' && view.value !== 'show') {
    const o: WizardStep[] = ['period', 'reconciliations', 'worksheet', 'statements']
    if (o.indexOf(view.value as WizardStep) > o.indexOf(b.step)) router.replace(`/close-books/${b.id}/${b.step}`)
  }
}, { immediate: true })
</script>

<template>
  <div class="cbw-page">
    <header class="cbw-bar">
      <div class="cbw-bar-left">
        <MpButton variant="ghost" is-rounded class="cbw-crumb" @click="back">{{ t('Close books') }} · {{ headerLabel }}</MpButton>
        <h1 class="cbw-title">{{ title }}</h1>
      </div>
      <span v-if="book && view !== 'period'" class="cbw-period">{{ periodLabel }}</span>
    </header>

    <div class="cbw-stage">
      <template v-if="isNew || book">
        <ErpStepper v-if="view !== 'success' && view !== 'show'" :steps="steps" :current="view" :done="doneSteps" @select="goStep" />

        <!-- ── 1. Financial period ── -->
        <section v-if="view === 'period'" class="cbw-card cbw-card--narrow">
          <p class="cbw-card-head">{{ isCtb ? t('You are about to close your book for the financial period:') : t('Please select date for period lock') }}</p>
          <dl class="cbw-dl">
            <dt>{{ t('From Date') }}</dt>
            <dd>{{ fromLabel }}</dd>
            <dt>{{ t('To Date') }}</dt>
            <dd>
              <MpFormControl id="cbw-end" is-required :is-invalid="!!endError">
                <div class="cbw-date">
                  <MpDatePicker id="cbw-end-dp" v-model="endDate" format="DD/MM/YYYY" value-type="format" use-portal @update:model-value="endError = ''" />
                </div>
                <MpFormErrorMessage>{{ endError }}</MpFormErrorMessage>
              </MpFormControl>
            </dd>
          </dl>
          <div class="cbw-warning">
            <MpIcon name="info" color="icon.information" />
            <span>
              {{ isCtb ? t('After the book have been closed, You will not be able to make anymore changes to Your books on dates BEFORE') : t('After the period is locked, you cannot create, edit, and delete transactions before') }}
              <strong>{{ endDate || '-' }}</strong>
            </span>
          </div>
          <div class="cbw-actions">
            <MpButton variant="ghost" is-rounded @click="back">{{ t('Cancel') }}</MpButton>
            <MpButton variant="primary" is-rounded @click="submitPeriod">{{ t('Next') }}</MpButton>
          </div>
        </section>

        <!-- ── 2. Check reconciliations ── -->
        <section v-else-if="view === 'reconciliations' && book" class="cbw-card">
          <p class="cbw-card-head">{{ t('Let\'s check the date of your previous reconciliations to make sure you don\'t miss any!') }}</p>

          <div class="cbw-check">
            <MpButton variant="ghost" is-rounded class="cbw-check-head" :right-icon="openSections.bank ? 'chevrons-up' : 'chevrons-down'" @click="openSections.bank = !openSections.bank">
              <span class="cbw-check-title">{{ t('Bank Reconciliation') }} {{ formatDate(book.endDate) }}</span>
            </MpButton>
            <MpTooltip :label="t('More recent reconciliation is recommended before closing the book.')" placement="top" use-portal>
              <span class="cbw-check-flag"><MpIcon name="warning" size="sm" color="icon.warning" /></span>
            </MpTooltip>
          </div>
          <div v-if="openSections.bank" class="cbw-check-body">
            <div v-for="r in registers" :key="r.id" class="cbw-check-row">
              <span class="cell-link" @click="accountLink(r.id)">{{ r.name }} {{ r.currency === 'IDR' ? formatIDR(r.balance) : `${r.currency} ${r.balance.toLocaleString('id-ID')}` }}</span>
              <span v-if="r.lastReconcile">{{ formatDate(r.lastReconcile) }}</span>
              <span v-else class="cell-link" @click="router.push('/reconciliations')">{{ t('No Reconciliation') }}</span>
            </div>
          </div>

          <div class="cbw-check">
            <MpButton variant="ghost" is-rounded class="cbw-check-head" :right-icon="openSections.stock ? 'chevrons-up' : 'chevrons-down'" @click="openSections.stock = !openSections.stock">
              <span class="cbw-check-title">{{ t('Stock Adjustments') }} {{ formatDate(book.endDate) }}</span>
            </MpButton>
            <MpTooltip :label="t('More recent stock adjusment is recommended before closing the book.')" placement="top" use-portal>
              <span class="cbw-check-flag"><MpIcon name="warning" size="sm" color="icon.warning" /></span>
            </MpTooltip>
          </div>
          <div v-if="openSections.stock" class="cbw-check-body">
            <div v-for="w in WAREHOUSE_ADJUSTMENTS" :key="w.id" class="cbw-check-row">
              <span>
                <span class="cell-link" @click="router.push(`/warehouses/${w.id}`)">{{ w.name }}</span>
                <span v-if="w.archived" class="cbw-inactive"> ({{ t('Inactive') }})</span>
              </span>
              <span class="cell-link" @click="router.push('/stock-adjustments/new')">{{ w.lastAdjustment && w.lastAdjustment <= book.endDate ? formatDate(w.lastAdjustment) : t('No Adjustments') }}</span>
            </div>
          </div>

          <div class="cbw-check">
            <MpButton variant="ghost" is-rounded class="cbw-check-head" :right-icon="openSections.drafts ? 'chevrons-up' : 'chevrons-down'" @click="openSections.drafts = !openSections.drafts">
              <span class="cbw-check-title">{{ t('Draft Transactions') }}</span>
            </MpButton>
            <MpTooltip :label="t('Pending draft transactions are recommended to be approved before closing the book')" placement="top" use-portal>
              <span class="cbw-check-flag"><MpIcon name="warning" size="sm" color="icon.warning" /></span>
            </MpTooltip>
          </div>
          <div v-if="openSections.drafts" class="cbw-check-body">
            <div v-for="l in draftLinks" :key="l.to" class="cbw-check-row">
              <span class="cell-link" @click="router.push(l.to)">{{ t(l.label) }}</span>
            </div>
          </div>

          <div class="cbw-actions">
            <MpButton variant="ghost" is-rounded @click="goStep('period')">{{ t('Back') }}</MpButton>
            <MpButton variant="primary" is-rounded @click="nextFromRecon">{{ t('Next') }}</MpButton>
          </div>
        </section>

        <!-- ── 3. Worksheet ── -->
        <section v-else-if="view === 'worksheet' && book && balanced" class="cbw-section">
          <p class="cbw-lead">{{ t('Worksheet Preparation as of') }} {{ formatDate(book.endDate) }}</p>
          <div class="cbw-table-wrap">
            <table class="cbw-table cbw-table--split">
              <thead>
                <tr>
                  <th class="cbw-th" rowspan="2">{{ t('Accounts') }}</th>
                  <th class="cbw-th cbw-th--center" colspan="2">{{ t('Trial Balance') }}</th>
                  <th class="cbw-th cbw-th--center" colspan="2">{{ t('Income Statement') }}</th>
                  <th class="cbw-th cbw-th--center" colspan="2">{{ t('Balance Sheet') }}</th>
                </tr>
                <tr>
                  <th v-for="i in 6" :key="i" class="cbw-th cbw-th--num">{{ i % 2 ? t('Debit') : t('Credit') }}</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="sec in WS_SECTIONS" :key="sec.type">
                  <tr class="cbw-group"><td class="cbw-td" colspan="7">{{ t(sec.label) }}</td></tr>
                  <tr v-for="r in wsBy(sec.type)" :key="r.id">
                    <td class="cbw-td"><span class="cell-link" @click="accountLink(r.id)">({{ r.code }}) {{ r.name }}</span></td>
                    <td class="cbw-td cbw-td--num">{{ cell(dr(r.net)) }}</td>
                    <td class="cbw-td cbw-td--num">{{ cell(cr(r.net)) }}</td>
                    <td class="cbw-td cbw-td--num">{{ isPLType(r.type) ? cell(dr(r.net)) : '' }}</td>
                    <td class="cbw-td cbw-td--num">{{ isPLType(r.type) ? cell(cr(r.net)) : '' }}</td>
                    <td class="cbw-td cbw-td--num">{{ isPLType(r.type) ? '' : cell(dr(r.net)) }}</td>
                    <td class="cbw-td cbw-td--num">{{ isPLType(r.type) ? '' : cell(cr(r.net)) }}</td>
                  </tr>
                </template>
                <tr class="cbw-total">
                  <td class="cbw-td">{{ t('Total') }}</td>
                  <td class="cbw-td cbw-td--num">{{ formatIDR(wsTotals.tbDebit) }}</td>
                  <td class="cbw-td cbw-td--num">{{ formatIDR(wsTotals.tbCredit) }}</td>
                  <td class="cbw-td cbw-td--num">{{ formatIDR(wsTotals.isDebit) }}</td>
                  <td class="cbw-td cbw-td--num">{{ formatIDR(wsTotals.isCredit) }}</td>
                  <td class="cbw-td cbw-td--num">{{ formatIDR(wsTotals.bsDebit) }}</td>
                  <td class="cbw-td cbw-td--num">{{ formatIDR(wsTotals.bsCredit) }}</td>
                </tr>
                <tr :class="wsTotals.netProfit >= 0 ? 'cbw-profit' : 'cbw-loss'">
                  <td class="cbw-td cbw-strong">{{ wsTotals.netProfit >= 0 ? t('Net Profit/Loss') : t('Net Profit Loss') }}</td>
                  <td class="cbw-td" /><td class="cbw-td" />
                  <td class="cbw-td cbw-td--num">{{ wsTotals.netProfit >= 0 ? formatIDR(wsTotals.netProfit) : '' }}</td>
                  <td class="cbw-td cbw-td--num">{{ wsTotals.netProfit < 0 ? formatIDR(-wsTotals.netProfit) : '' }}</td>
                  <td class="cbw-td cbw-td--num">{{ wsTotals.netProfit < 0 ? formatIDR(-wsTotals.netProfit) : '' }}</td>
                  <td class="cbw-td cbw-td--num">{{ wsTotals.netProfit >= 0 ? formatIDR(wsTotals.netProfit) : '' }}</td>
                </tr>
                <template v-if="isCtb">
                  <tr>
                    <td class="cbw-td cbw-strong cbw-td--top">{{ t('Tax Expense') }}</td>
                    <td class="cbw-td cbw-td--top" colspan="2">
                      <div class="cbw-stack">
                        <MpFormControl id="cbw-tax-exp" :is-invalid="!!wsErrors.taxExpenseAccount">
                          <MpFormLabel>{{ t('Tax expense account') }}</MpFormLabel>
                          <ErpFilterSelect id="cbw-tax-exp-select" v-model="wsForm.taxExpenseAccount" :placeholder="t('Select account')" :options="taxExpenseOptions" width="100%" />
                          <MpFormErrorMessage>{{ wsErrors.taxExpenseAccount }}</MpFormErrorMessage>
                        </MpFormControl>
                        <MpFormControl id="cbw-tax-pay" :is-invalid="!!wsErrors.taxPayableAccount">
                          <MpFormLabel>{{ t('Tax payable account') }}</MpFormLabel>
                          <ErpFilterSelect id="cbw-tax-pay-select" v-model="wsForm.taxPayableAccount" :placeholder="t('Select account')" :options="taxPayableOptions" width="100%" />
                          <MpFormErrorMessage>{{ wsErrors.taxPayableAccount }}</MpFormErrorMessage>
                        </MpFormControl>
                      </div>
                    </td>
                    <td class="cbw-td cbw-td--top">
                      <MpFormControl id="cbw-tax-pct" :is-invalid="!!wsErrors.taxPercentage">
                        <MpFormLabel>{{ t('Tax percentage') }}</MpFormLabel>
                        <MpInput id="cbw-tax-pct-input" :model-value="wsForm.taxPercentage" inputmode="decimal" class="cbw-num-input" @update:model-value="onTaxPercentage" />
                        <MpFormErrorMessage>{{ wsErrors.taxPercentage }}</MpFormErrorMessage>
                      </MpFormControl>
                    </td>
                    <td class="cbw-td cbw-td--top">
                      <MpFormControl id="cbw-tax-amt" :is-invalid="!!wsErrors.taxAmount">
                        <MpFormLabel>{{ t('Tax amount') }}</MpFormLabel>
                        <MpInput id="cbw-tax-amt-input" :model-value="wsForm.taxAmount" inputmode="numeric" class="cbw-num-input" @update:model-value="onTaxAmount" />
                        <MpFormErrorMessage>{{ wsErrors.taxAmount }}</MpFormErrorMessage>
                      </MpFormControl>
                    </td>
                    <td class="cbw-td" /><td class="cbw-td" />
                  </tr>
                  <tr>
                    <td class="cbw-td cbw-strong cbw-td--top">{{ t('Net Profit/Loss After Tax') }}</td>
                    <td class="cbw-td cbw-td--top" colspan="2">
                      <MpFormControl id="cbw-re" :is-invalid="!!wsErrors.retainedEarningsAccount">
                        <MpFormLabel>{{ t('Retained earnings account') }}</MpFormLabel>
                        <ErpFilterSelect id="cbw-re-select" v-model="wsForm.retainedEarningsAccount" :placeholder="t('Select account')" :options="equityOptions" width="100%" />
                        <MpFormErrorMessage>{{ wsErrors.retainedEarningsAccount }}</MpFormErrorMessage>
                      </MpFormControl>
                    </td>
                    <td class="cbw-td cbw-td--num cbw-strong">{{ money(netAfterTax) }}</td>
                    <td class="cbw-td" /><td class="cbw-td" /><td class="cbw-td" />
                  </tr>
                </template>
              </tbody>
            </table>
          </div>

          <MpFormControl id="cbw-memo" class="cbw-memo">
            <MpFormLabel>{{ t('Memo') }}</MpFormLabel>
            <MpTextarea id="cbw-memo-input" v-model="wsForm.memo" :maxlength="255" />
          </MpFormControl>

          <div class="cbw-actions">
            <MpButton variant="ghost" is-rounded @click="goStep('reconciliations')">{{ t('Back') }}</MpButton>
            <MpButton variant="primary" is-rounded @click="saveWorksheet">{{ t('Save & Continue') }}</MpButton>
          </div>
        </section>

        <!-- ── 4. Financial statements / published show ── -->
        <section v-else-if="(view === 'statements' || view === 'show') && book && balanced && is && bs && cf" class="cbw-section">
          <p v-if="view === 'statements'" class="cbw-lead">{{ isCtb ? t('Please confirm to close book at the bottom of the page.') : t('Please confirm to period lock at the bottom of the page.') }}</p>
          <MpTabs id="cbw-tabs" v-model="activeTab" is-manual variant-color="green" class="detail-tabs">
            <MpTabList>
              <MpTab id="cbw-tab-tb" value="tb">{{ t('Trial Balance') }}</MpTab>
              <MpTab id="cbw-tab-is" value="is">{{ t('Income Statement') }}</MpTab>
              <MpTab id="cbw-tab-bs" value="bs">{{ t('Balance Sheet') }}</MpTab>
              <MpTab id="cbw-tab-cf" value="cf">{{ t('Cash Flow') }}</MpTab>
            </MpTabList>
            <MpTabPanels>
              <MpTabPanel value="tb">
                <div class="cbw-report-bar">
                  <div class="cbw-report-title">
                    <span class="cbw-report-company">{{ COMPANY_NAME }}</span>
                    <h2 class="cbw-report-name">{{ t('Trial Balance') }}</h2>
                    <span class="cbw-report-period">{{ statementPeriod }}</span>
                  </div>
                  <div class="cbw-report-actions">
                    <MpButton variant="secondary" is-rounded @click="notInPrototype">{{ t('Show PDF') }}</MpButton>
                    <MpButton variant="secondary" is-rounded @click="notInPrototype">{{ t('CSV') }}</MpButton>
                    <MpButton variant="secondary" is-rounded @click="notInPrototype">{{ t('Excel') }}</MpButton>
                  </div>
                </div>
                <div class="cbw-table-wrap">
                  <table class="cbw-table cbw-table--split">
                    <thead>
                      <tr>
                        <th class="cbw-th" rowspan="2">{{ t('Accounts') }}</th>
                        <th class="cbw-th cbw-th--center" colspan="2">{{ t('Opening Balance') }}</th>
                        <th class="cbw-th cbw-th--center" colspan="2">{{ t('Movement') }}</th>
                        <th class="cbw-th cbw-th--center" colspan="2">{{ t('End Balance') }}</th>
                      </tr>
                      <tr><th v-for="i in 6" :key="i" class="cbw-th cbw-th--num">{{ i % 2 ? t('Debit') : t('Credit') }}</th></tr>
                    </thead>
                    <tbody>
                      <template v-for="sec in WS_SECTIONS" :key="sec.type">
                        <tr class="cbw-group"><td class="cbw-td" colspan="7">{{ t(sec.label) }}</td></tr>
                        <tr v-for="r in tbBy(sec.type)" :key="r.id">
                          <td class="cbw-td"><span class="cell-link" @click="accountLink(r.id)">({{ r.code }}) {{ r.name }}</span></td>
                          <td class="cbw-td cbw-td--num">{{ cell(dr(r.opening)) }}</td>
                          <td class="cbw-td cbw-td--num">{{ cell(cr(r.opening)) }}</td>
                          <td class="cbw-td cbw-td--num">{{ cell(r.movementDebit) }}</td>
                          <td class="cbw-td cbw-td--num">{{ cell(r.movementCredit) }}</td>
                          <td class="cbw-td cbw-td--num">{{ cell(dr(r.ending)) }}</td>
                          <td class="cbw-td cbw-td--num">{{ cell(cr(r.ending)) }}</td>
                        </tr>
                      </template>
                      <tr class="cbw-total">
                        <td class="cbw-td">{{ t('Total') }}</td>
                        <td class="cbw-td cbw-td--num">{{ formatIDR(tbTotals.od) }}</td>
                        <td class="cbw-td cbw-td--num">{{ formatIDR(tbTotals.oc) }}</td>
                        <td class="cbw-td cbw-td--num">{{ formatIDR(tbTotals.md) }}</td>
                        <td class="cbw-td cbw-td--num">{{ formatIDR(tbTotals.mc) }}</td>
                        <td class="cbw-td cbw-td--num">{{ formatIDR(tbTotals.ed) }}</td>
                        <td class="cbw-td cbw-td--num">{{ formatIDR(tbTotals.ec) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </MpTabPanel>

              <MpTabPanel value="is">
                <div class="cbw-report-bar">
                  <div class="cbw-report-title">
                    <span class="cbw-report-company">{{ COMPANY_NAME }}</span>
                    <h2 class="cbw-report-name">{{ t('Income Statement') }}</h2>
                    <span class="cbw-report-period">{{ statementPeriod }}</span>
                  </div>
                  <div class="cbw-report-actions">
                    <MpButton variant="secondary" is-rounded @click="notInPrototype">{{ t('Show PDF') }}</MpButton>
                    <MpButton variant="secondary" is-rounded @click="notInPrototype">{{ t('CSV') }}</MpButton>
                    <MpButton variant="secondary" is-rounded @click="notInPrototype">{{ t('Excel') }}</MpButton>
                  </div>
                </div>
                <div class="cbw-report">
                  <div class="cbw-rep-head">{{ t('Primary Income/Expense') }}</div>
                  <template v-for="sec in [is.income, is.cogs]" :key="sec.key">
                    <div class="cbw-rep-sub">{{ t(sec.label) }}</div>
                    <div v-for="l in sec.lines" :key="l.id" class="cbw-rep-row"><span class="cell-link" @click="accountLink(l.id)">({{ l.code }}) {{ l.name }}</span><span>{{ money(l.amount) }}</span></div>
                    <div class="cbw-rep-row cbw-rep-row--sub"><span>{{ t(sec.totalLabel) }}</span><span>{{ money(sec.total) }}</span></div>
                  </template>
                  <div class="cbw-rep-row cbw-rep-row--total"><span>{{ t('Gross Profits') }}</span><span>{{ money(is.grossProfit) }}</span></div>
                  <div class="cbw-rep-sub">{{ t(is.expense.label) }}</div>
                  <div v-for="l in is.expense.lines" :key="l.id" class="cbw-rep-row"><span class="cell-link" @click="accountLink(l.id)">({{ l.code }}) {{ l.name }}</span><span>{{ money(l.amount) }}</span></div>
                  <div class="cbw-rep-row cbw-rep-row--sub"><span>{{ t(is.expense.totalLabel) }}</span><span>{{ money(is.expense.total) }}</span></div>
                  <div class="cbw-rep-row cbw-rep-row--total"><span>{{ t('Net Operating Income') }}</span><span>{{ money(is.netOperatingIncome) }}</span></div>
                  <template v-for="sec in [is.otherIncome, is.otherExpense]" :key="sec.key">
                    <div class="cbw-rep-sub">{{ t(sec.label) }}</div>
                    <div v-for="l in sec.lines" :key="l.id" class="cbw-rep-row"><span class="cell-link" @click="accountLink(l.id)">({{ l.code }}) {{ l.name }}</span><span>{{ money(l.amount) }}</span></div>
                    <div class="cbw-rep-row cbw-rep-row--sub"><span>{{ t(sec.totalLabel) }}</span><span>{{ money(sec.total) }}</span></div>
                  </template>
                  <div class="cbw-rep-row cbw-rep-row--total"><span>{{ t('Net Income') }}</span><span>{{ money(is.netIncome) }}</span></div>
                  <div class="cbw-rep-row cbw-rep-row--total"><span>{{ t('Total Comprehensive Income for the period') }}</span><span>{{ money(is.netIncome) }}</span></div>
                </div>
              </MpTabPanel>

              <MpTabPanel value="bs">
                <div class="cbw-report-bar">
                  <div class="cbw-report-title">
                    <span class="cbw-report-company">{{ COMPANY_NAME }}</span>
                    <h2 class="cbw-report-name">{{ t('Balance Sheet') }}</h2>
                    <span class="cbw-report-period">{{ t('For period ended') }} {{ formatDate(book.endDate) }}</span>
                  </div>
                  <div class="cbw-report-actions">
                    <MpButton variant="secondary" is-rounded @click="notInPrototype">{{ t('Show PDF') }}</MpButton>
                    <MpButton variant="secondary" is-rounded @click="notInPrototype">{{ t('CSV') }}</MpButton>
                    <MpButton variant="secondary" is-rounded @click="notInPrototype">{{ t('Excel') }}</MpButton>
                  </div>
                </div>
                <div class="cbw-report">
                  <div class="cbw-rep-head">{{ t('Assets') }}</div>
                  <template v-for="g in bs.assets" :key="g.id">
                    <div class="cbw-rep-sub">{{ t(g.label) }}</div>
                    <div v-for="l in g.lines" :key="l.id" class="cbw-rep-row"><span class="cell-link" @click="accountLink(l.id)">({{ l.code }}) {{ l.name }}</span><span>{{ money(l.amount) }}</span></div>
                    <div class="cbw-rep-row cbw-rep-row--sub"><span>{{ t('Total') }} {{ t(g.label) }}</span><span>{{ money(g.total) }}</span></div>
                  </template>
                  <div class="cbw-rep-row cbw-rep-row--total"><span>{{ t('Total Assets') }}</span><span>{{ money(bs.totalAssets) }}</span></div>

                  <div class="cbw-rep-head">{{ t('Liability & Equity') }}</div>
                  <template v-for="g in bs.liabilities" :key="g.id">
                    <div class="cbw-rep-sub">{{ t(g.label) }}</div>
                    <div v-for="l in g.lines" :key="l.id" class="cbw-rep-row"><span class="cell-link" @click="accountLink(l.id)">({{ l.code }}) {{ l.name }}</span><span>{{ money(l.amount) }}</span></div>
                    <div class="cbw-rep-row cbw-rep-row--sub"><span>{{ t('Total') }} {{ t(g.label) }}</span><span>{{ money(g.total) }}</span></div>
                  </template>
                  <div class="cbw-rep-row cbw-rep-row--sub"><span>{{ t('Total Liability') }}</span><span>{{ money(bs.totalLiabilities) }}</span></div>
                  <template v-for="g in bs.equity" :key="g.id">
                    <div class="cbw-rep-sub">{{ t(g.label) }}</div>
                    <div v-for="l in g.lines" :key="l.id" class="cbw-rep-row"><span class="cell-link" @click="accountLink(l.id)">({{ l.code }}) {{ l.name }}</span><span>{{ money(l.amount) }}</span></div>
                  </template>
                  <div class="cbw-rep-row"><span>{{ t('Current Period Earnings') }}</span><span>{{ money(bs.currentEarnings) }}</span></div>
                  <div class="cbw-rep-row cbw-rep-row--sub"><span>{{ t('Total Equity') }}</span><span>{{ money(bs.totalEquity) }}</span></div>
                  <div class="cbw-rep-row cbw-rep-row--total"><span>{{ t('Total Liability & Equity') }}</span><span>{{ money(bs.totalLiabilitiesAndEquity) }}</span></div>
                </div>
              </MpTabPanel>

              <MpTabPanel value="cf">
                <div class="cbw-report-bar">
                  <div class="cbw-report-title">
                    <span class="cbw-report-company">{{ COMPANY_NAME }}</span>
                    <h2 class="cbw-report-name">{{ t('Cash Flow') }}</h2>
                    <span class="cbw-report-period">{{ statementPeriod }}</span>
                  </div>
                  <div class="cbw-report-actions">
                    <MpButton variant="secondary" is-rounded @click="notInPrototype">{{ t('Show PDF') }}</MpButton>
                    <MpButton variant="secondary" is-rounded @click="notInPrototype">{{ t('CSV') }}</MpButton>
                    <MpButton variant="secondary" is-rounded @click="notInPrototype">{{ t('Excel') }}</MpButton>
                  </div>
                </div>
                <div class="cbw-report">
                  <div class="cbw-rep-head">{{ t('Operating Activities') }}</div>
                  <div class="cbw-rep-row"><span>{{ t('Income') }}</span><span>{{ money(cf.operatingIncome) }}</span></div>
                  <div class="cbw-rep-row"><span>{{ t('Less Expenses') }}</span><span>{{ money(-cf.operatingExpenses) }}</span></div>
                  <div class="cbw-rep-row cbw-rep-row--sub"><span>{{ t('Total Operating Activities') }}</span><span>{{ money(cf.totalOperating) }}</span></div>
                  <div class="cbw-rep-head">{{ t('Non Operating Activities') }}</div>
                  <div v-for="n in cf.nonOperating" :key="n.label" class="cbw-rep-row"><span>{{ t(n.label) }}</span><span>{{ money(n.amount) }}</span></div>
                  <div class="cbw-rep-row cbw-rep-row--sub"><span>{{ t('Total Non Operating Activities') }}</span><span>{{ money(cf.totalNonOperating) }}</span></div>
                  <div class="cbw-rep-row cbw-rep-row--total"><span>{{ t('Net Cash Movement') }}</span><span>{{ money(cf.netCashMovement) }}</span></div>
                  <div class="cbw-rep-head">{{ t('Summary') }}</div>
                  <div class="cbw-rep-row"><span>{{ t('Beginning cash balance') }}</span><span>{{ money(cf.beginning) }}</span></div>
                  <div class="cbw-rep-row"><span>{{ t('Increase (decrease) in cash') }}</span><span>{{ money(cf.netCashMovement) }}</span></div>
                  <div class="cbw-rep-row cbw-rep-row--total"><span>{{ t('Ending cash balance') }}</span><span>{{ money(cf.ending) }}</span></div>
                </div>
              </MpTabPanel>
            </MpTabPanels>
          </MpTabs>

          <div class="cbw-actions">
            <template v-if="view === 'statements'">
              <MpButton variant="ghost" is-rounded @click="goStep('worksheet')">{{ t('Back') }}</MpButton>
              <MpButton variant="primary" is-rounded @click="confirmClose">{{ isCtb ? t('Confirm Close Book') : t('Confirm') }}</MpButton>
            </template>
            <MpButton v-else variant="ghost" is-rounded @click="back">{{ t('Back') }}</MpButton>
          </div>
        </section>

        <!-- ── Success ── -->
        <section v-else-if="view === 'success' && book" class="cbw-success">
          <h2 class="cbw-success-title">{{ isCtb ? t('Close books finished!') : t('Period lock finished!') }}</h2>
          <p class="cbw-success-text">
            {{ t('Your book for period of') }}
            <strong>{{ book.startDate ? formatDate(book.startDate) : t('From beginning') }}</strong>
            -
            <strong>{{ formatDate(book.endDate) }}</strong>
            {{ isCtb ? t('has been closed successfully.') : t('has been locked successfully.') }}
          </p>
          <div>
            <MpButton variant="primary" is-rounded @click="back">{{ t('Ok, got it') }}</MpButton>
          </div>
        </section>
      </template>

      <div v-else class="cbw-missing">
        <p class="cbw-success-title">{{ t('Closing book not found') }}</p>
        <p class="cbw-success-text">{{ t('Recheck the URL you access and try again.') }}</p>
        <div><MpButton variant="primary" is-rounded @click="back">{{ t('Ok, got it') }}</MpButton></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cbw-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.cbw-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); background: var(--mp-background-neutral-subtle);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); padding: 0 var(--mp-spacing-6);
}
.cbw-bar-left { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 0; min-width: 0; }
.cbw-crumb {
  height: auto !important; min-width: 0 !important; padding: 0 !important; background: none !important;
  font-size: var(--mp-font-sizes-sm) !important; font-weight: var(--mp-font-weights-regular) !important;
  line-height: var(--mp-line-heights-md) !important; color: var(--mp-text-link) !important;
}
.cbw-crumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.cbw-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; color: var(--mp-text-default); }
.cbw-period { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); white-space: nowrap; }
.cbw-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0;
  padding: var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-6);
}

.cbw-card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 8px); padding: var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-4); max-width: 880px; }
.cbw-card--narrow { max-width: 640px; }
.cbw-card-head { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cbw-dl { display: grid; grid-template-columns: 160px minmax(0, 1fr); align-items: center; row-gap: var(--mp-spacing-4); column-gap: var(--mp-spacing-4); margin: 0; }
.cbw-dl dt { color: var(--mp-text-secondary); }
.cbw-dl dd { margin: 0; color: var(--mp-text-default); }
.cbw-date { width: 220px; }
.cbw-warning {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-colors-background-information, var(--mp-background-information)); border-radius: var(--mp-radii-md, 6px); color: var(--mp-text-default);
}
.cbw-actions { display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); }

.cbw-check { display: flex; align-items: center; gap: var(--mp-spacing-2); border-bottom: 1px solid var(--mp-border-default); padding-bottom: var(--mp-spacing-2); }
.cbw-check-head { flex: 1; justify-content: space-between !important; padding-left: 0 !important; padding-right: var(--mp-spacing-2) !important; }
.cbw-check-title { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cbw-check-flag { display: inline-flex; }
.cbw-check-body { display: flex; flex-direction: column; margin-top: calc(-1 * var(--mp-spacing-2)); }
.cbw-check-row { display: flex; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-2) 0 var(--mp-spacing-2) var(--mp-spacing-5); border-bottom: 1px solid var(--mp-border-default); }
.cbw-inactive { color: var(--mp-text-danger); }

.cbw-section { display: flex; flex-direction: column; gap: var(--mp-spacing-5); min-width: 0; }
.cbw-lead { margin: 0; color: var(--mp-text-default); }
.cbw-table-wrap { overflow-x: auto; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md, 6px); }
.cbw-table { width: 100%; min-width: 1040px; border-collapse: collapse; }
.cbw-th {
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2); background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; text-align: left; color: var(--mp-text-default); white-space: nowrap;
}
.cbw-th--center { text-align: center; }
.cbw-th--num { text-align: right; }
.cbw-td { padding: var(--mp-spacing-2\.5) var(--mp-spacing-4) var(--mp-spacing-2\.5) var(--mp-spacing-2); border-bottom: 1px solid var(--mp-border-default); color: var(--mp-text-default); vertical-align: middle; }
.cbw-td--num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.cbw-td--top { vertical-align: top; }
.cbw-table--split .cbw-th, .cbw-table--split .cbw-td { border-right: 1px solid var(--mp-border-default); }
.cbw-table--split .cbw-th:last-child, .cbw-table--split .cbw-td:last-child { border-right: none; }
.cbw-group .cbw-td { font-weight: var(--mp-font-weights-semi-bold); background: var(--mp-background-neutral-subtle); }
.cbw-total .cbw-td { font-weight: var(--mp-font-weights-semi-bold); }
.cbw-strong { font-weight: var(--mp-font-weights-semi-bold); }
.cbw-profit .cbw-td { background: var(--mp-colors-background-success); }
.cbw-loss .cbw-td { background: var(--mp-colors-background-danger); }
.cbw-stack { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.cbw-num-input :deep(input) { text-align: right; }
.cbw-memo { max-width: 558px; }

.detail-tabs :deep(.mp-tab--isSelected_true),
.detail-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.detail-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) { background-color: var(--mp-border-selected) !important; }
.detail-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }
.cbw-report-bar { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); }
.cbw-report-title { display: flex; flex-direction: column; }
.cbw-report-company { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cbw-report-name { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cbw-report-period { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cbw-report-actions { display: flex; gap: var(--mp-spacing-2); }
.cbw-report { max-width: 880px; display: flex; flex-direction: column; }
.cbw-rep-head { margin-top: var(--mp-spacing-4); padding: var(--mp-spacing-1) var(--mp-spacing-2); background: var(--mp-background-neutral-subtle); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase; color: var(--mp-text-default); }
.cbw-rep-sub { padding: var(--mp-spacing-2) var(--mp-spacing-2) 0; font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cbw-rep-row { display: flex; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-6); border-bottom: 1px solid var(--mp-border-default); font-variant-numeric: tabular-nums; }
.cbw-rep-row--sub { padding-left: var(--mp-spacing-2); font-weight: var(--mp-font-weights-semi-bold); }
.cbw-rep-row--total { padding-left: var(--mp-spacing-2); font-weight: var(--mp-font-weights-semi-bold); border-top: 1px solid var(--mp-border-bold, var(--mp-border-default)); border-bottom: 2px solid var(--mp-border-bold, var(--mp-border-default)); }

.cbw-success, .cbw-missing { display: flex; flex-direction: column; gap: var(--mp-spacing-3); max-width: 560px; padding-top: var(--mp-spacing-8); }
.cbw-success-title { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cbw-success-text { margin: 0; color: var(--mp-text-default); }
</style>
