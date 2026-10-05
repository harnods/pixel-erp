<!-- prod-parity: jurnal-frontend-app/src/pages/reports/profit_loss/profit_loss.vue -->
<script setup lang="ts">
/**
 * Profit & loss — Reports › Financials › Profit & Loss (/financial-report/profit-and-loss).
 *
 * Prod structure: Start date · End date · Period, Filter / More filter (drawer:
 * dates, Period, Compare with → Compare period + Ascending/Descending, Account
 * depth, Show accounts), table density, full screen, Select layout, Export,
 * "See profit & loss bugeting". Table = prod's default layout
 * (ReportingService::GetProfitLossCustomLayout): Revenue, Cost of Sales →
 * Gross Profit, Operational Expense → Operating Profit, Other Income (Expense)
 * with Other Income / Other Expense sub-labels → Profit (Loss). Each
 * account-type block ends with "Total of <type>"; percentages are vs the
 * previous period when comparing. Account rows open the account's transactions
 * for the period (prod /accounts/:id?q[transaction_date_*]).
 *
 * Figures: financialStatements.ts → canonical COA ledger. Profit (Loss) for the
 * financial year to date equals the Balance sheet's Current Period Earnings.
 */
import { MpIcon, MpTooltip, MpDatePicker, MpCheckbox, MpRadio, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpSkeleton, css } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { useReportFullscreen } from '~/composables/useReportFullscreen'
import { formatIDR } from '~/utils/currency'
import { infoToast } from '~/utils/toasts'
import { loadCreated, saveCreated } from '~/data/persist'
import { SIM_TODAY_ISO } from '~/data/simClock'
import {
  plReport, plBuildPeriods, plPeriodRange, bsPlMaxDepth, bsPlChangePct, bsPlAccountLink, bsPlDayLabel,
  bsAssertTiesToPl, PL_PERIOD_OPTIONS, BS_PL_COMPARE_COUNT_OPTIONS,
  type PlPeriodKey, type PlSection, type BsPlAccountRow,
} from '~/data/financialStatements'

const { t } = useLocale()
const router = useRouter()

// ── Saved user settings (filters/columns only) ──────────────────────────────
interface PlSettings {
  period: PlPeriodKey; compareBy: '' | 'period'; compareCount: string; order: 'asc' | 'desc'
  depth: string; showAccount: boolean; density: 'default' | 'compact'
}
const SETTINGS_KEY = 'pl-report-settings'
const DEFAULTS: PlSettings = { period: 'last_month', compareBy: '', compareCount: '0', order: 'desc', depth: '', showAccount: true, density: 'default' }
const settings = reactive<PlSettings>({ ...DEFAULTS, ...(loadCreated<PlSettings>(SETTINGS_KEY)[0] ?? {}) })
watch(settings, (v) => saveCreated(SETTINGS_KEY, [{ ...v }]), { deep: true })

// ── Filter bar (prod general-filter.vue) ────────────────────────────────────
const toDmy = (iso: string) => iso.split('-').reverse().join('/')
const toIso = (dmy: string) => dmy.split('/').reverse().join('-')
const isDmy = (s: string) => /^\d{2}\/\d{2}\/\d{4}$/.test(s)

const initRange = plPeriodRange(settings.period === 'custom' ? 'last_month' : settings.period)
const startDate = ref(toDmy(initRange.start))
const endDate = ref(toDmy(initRange.end))
const period = ref<PlPeriodKey>(settings.period === 'custom' ? 'last_month' : settings.period)
const formError = ref('')
const periodOptions = computed(() => PL_PERIOD_OPTIONS.map(o => ({ value: o.value, label: t(o.label) })))

function onPeriod(v: string) {
  const key = (v || 'last_month') as PlPeriodKey
  period.value = key
  if (key !== 'custom') { const r = plPeriodRange(key); startDate.value = toDmy(r.start); endDate.value = toDmy(r.end) }
  formError.value = ''
}
function onDateChange() {
  formError.value = ''
  if (!isDmy(startDate.value) || !isDmy(endDate.value)) return
  const s = toIso(startDate.value), e = toIso(endDate.value)
  const match = PL_PERIOD_OPTIONS.find(o => o.value !== 'custom' && o.value !== 'this_financial_year' && (() => { const r = plPeriodRange(o.value); return r.start === s && r.end === e })())
  period.value = match?.value ?? 'custom'
}

// ── Applied state: idle → loading → ready ───────────────────────────────────
interface Applied { start: string; end: string; period: PlPeriodKey; count: number; order: 'asc' | 'desc' }
const applied = ref<Applied | null>(null)
const state = ref<'idle' | 'loading' | 'ready'>('idle')
let timer: ReturnType<typeof setTimeout> | null = null
onBeforeUnmount(() => { if (timer) clearTimeout(timer) })

function validate(s: string, e: string): string {
  if (!isDmy(s) || !isDmy(e)) return t('You must fill in date range')
  if (toIso(s) > toIso(e)) return t('Start date cannot be after end date.')
  return ''
}
function runFilter() {
  const err = validate(startDate.value, endDate.value)
  if (err) { formError.value = err; return }
  formError.value = ''
  settings.period = period.value
  applied.value = {
    start: toIso(startDate.value), end: toIso(endDate.value), period: period.value,
    count: settings.compareBy ? Number(settings.compareCount) || 0 : 0, order: settings.order,
  }
  state.value = 'loading'
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { state.value = 'ready' }, 700)
}

// ── More filter drawer (prod more-filter.vue) ───────────────────────────────
const drawerOpen = ref(false)
const draft = reactive({ start: '', end: '', period: 'last_month' as PlPeriodKey, compareBy: '' as '' | 'period', compareCount: '0', order: 'desc' as 'asc' | 'desc', depth: '', showAccount: true })
const draftError = ref('')
function openDrawer() {
  Object.assign(draft, {
    start: startDate.value, end: endDate.value, period: period.value, compareBy: settings.compareBy, compareCount: settings.compareCount,
    order: settings.order, depth: settings.depth || String(maxDepth.value), showAccount: settings.showAccount,
  })
  draftError.value = ''
  drawerOpen.value = true
}
function onDraftPeriod(v: string) {
  draft.period = (v || 'last_month') as PlPeriodKey
  if (draft.period !== 'custom') { const r = plPeriodRange(draft.period); draft.start = toDmy(r.start); draft.end = toDmy(r.end) }
}
const compareByOptions = computed(() => [
  { value: 'none', label: t('None') },
  { value: 'period', label: t('Period') },
  { value: 'tag', label: t('Tag') },
  { value: 'tag_category', label: t('Tag Category') },
])
function onDraftCompareBy(v: string) {
  if (v === 'tag' || v === 'tag_category') { infoToast(t('Not in this prototype')); return }
  draft.compareBy = v === 'period' ? 'period' : ''
  if (draft.compareBy && draft.compareCount === '0') draft.compareCount = '1'
}
const countOptions = computed(() => {
  const months = (() => {
    if (!isDmy(draft.start) || !isDmy(draft.end)) return 1
    const s = toIso(draft.start), e = toIso(draft.end)
    return (Number(e.slice(0, 4)) - Number(s.slice(0, 4))) * 12 + Number(e.slice(5, 7)) - Number(s.slice(5, 7)) + 1
  })()
  return (months >= 12 ? BS_PL_COMPARE_COUNT_OPTIONS.slice(0, 4) : BS_PL_COMPARE_COUNT_OPTIONS).map(o => ({ value: o.value, label: t(o.label) }))
})
function resetDrawer() {
  const r = plPeriodRange('last_month')
  Object.assign(draft, { start: toDmy(r.start), end: toDmy(r.end), period: 'last_month', compareBy: '', compareCount: '0', order: 'desc', depth: String(maxDepth.value), showAccount: true })
  draftError.value = ''
}
function applyDrawer() {
  const err = validate(draft.start, draft.end)
  if (err) { draftError.value = err; return }
  startDate.value = draft.start
  endDate.value = draft.end
  period.value = draft.period
  settings.compareBy = draft.compareBy
  settings.compareCount = draft.compareBy ? draft.compareCount : '0'
  settings.order = draft.order
  settings.depth = draft.depth
  settings.showAccount = draft.showAccount
  drawerOpen.value = false
  runFilter()
}
const moreFilterActive = computed(() => !!settings.compareBy || !settings.showAccount || (!!settings.depth && Number(settings.depth) < maxDepth.value))

// ── Report data ──────────────────────────────────────────────────────────────
const periods = computed(() => {
  const a = applied.value
  if (!a) return []
  return plBuildPeriods(a.start, a.end, { compareCount: a.count, order: a.order, eachMonth: a.period === 'this_financial_year' })
})
const report = computed(() => (periods.value.length ? plReport(periods.value) : null))
// Statements tie check (P&L YTD net profit = BS Current Period Earnings).
watch(applied, (a) => { if (a) bsAssertTiesToPl(a.end > SIM_TODAY_ISO ? SIM_TODAY_ISO : a.end) })
const isCompare = computed(() => periods.value.length > 1)

const maxDepth = computed(() => {
  const r = report.value ?? plReport([{ start: '2026-01-01', end: SIM_TODAY_ISO, label: '' }])
  return Math.max(...[r.revenue, r.costOfSales, r.operationalExpense, r.otherIncome, r.otherExpense].map(s => bsPlMaxDepth(s.rows)))
})
const depthOptions = computed(() => Array.from({ length: maxDepth.value }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })))
const depthLimit = computed(() => Number(settings.depth) || maxDepth.value)

function flatten(rows: BsPlAccountRow[]): BsPlAccountRow[] {
  const out: BsPlAccountRow[] = []
  const walk = (r: BsPlAccountRow) => { out.push(r); if (r.level < depthLimit.value) r.children.forEach(walk) }
  rows.forEach(walk)
  return out
}

/** Prod default layout, as render blocks. line 1 = account type, 3 = net calculation. */
type Block =
  | { kind: 'type'; key: string; name: string; expenseAsPositive: boolean; groups: { label: string; section: PlSection }[]; totals: number[] }
  | { kind: 'net'; key: string; name: string; totals: number[] }
const blocks = computed<Block[]>(() => {
  const r = report.value
  if (!r) return []
  return [
    { kind: 'type', key: 'revenue', name: 'Revenue', expenseAsPositive: false, groups: [{ label: '', section: r.revenue }], totals: r.revenue.totals },
    { kind: 'type', key: 'cos', name: 'Cost of Sales', expenseAsPositive: true, groups: [{ label: '', section: r.costOfSales }], totals: r.costOfSales.totals },
    { kind: 'net', key: 'gross', name: 'Gross Profit', totals: r.grossProfit },
    { kind: 'type', key: 'opex', name: 'Operational Expense', expenseAsPositive: true, groups: [{ label: '', section: r.operationalExpense }], totals: r.operationalExpense.totals },
    { kind: 'net', key: 'operating', name: 'Operating Profit', totals: r.operatingProfit },
    {
      kind: 'type', key: 'other', name: 'Other Income (Expense)', expenseAsPositive: false,
      groups: [{ label: 'Other Income', section: r.otherIncome }, { label: 'Other Expense', section: r.otherExpense }], totals: r.otherIncomeExpense,
    },
    { kind: 'net', key: 'profit', name: 'Profit (Loss)', totals: r.netProfit },
  ]
})

// ── Formatting ───────────────────────────────────────────────────────────────
function money(n: number): string { return n < 0 ? `(${formatIDR(Math.abs(n))})` : formatIDR(n) }
/** prod handlePercentage: change vs the previous period; expense lines flip the colour. */
function pct(amounts: number[], i: number, expenseAsPositive: boolean): { text: string; tone: 'up' | 'down' | '' } {
  const prevIdx = applied.value?.order === 'asc' ? i - 1 : i + 1
  const p = bsPlChangePct(amounts[i]!, amounts[prevIdx])
  if (p === null) return { text: '', tone: '' }
  const text = p > 100 ? '>100%' : p < -100 ? '<-100%' : `${p.toFixed(1)}%`
  const good = expenseAsPositive ? p < 0 : p > 0
  return { text, tone: good ? 'up' : 'down' }
}
const showPct = computed(() => isCompare.value)
const colCount = computed(() => 1 + periods.value.length * (showPct.value ? 2 : 1))

function openAccount(row: BsPlAccountRow) {
  // Whole report range (all compared periods), like prod's start/end query.
  const ps = periods.value
  if (!ps.length) return
  const start = ps.reduce((m, p) => (p.start < m ? p.start : m), ps[0]!.start)
  const end = ps.reduce((m, p) => (p.end > m ? p.end : m), ps[0]!.end)
  router.push(bsPlAccountLink(row.id, start, end))
}
function toggleOrder() { settings.order = settings.order === 'asc' ? 'desc' : 'asc'; runFilter() }

// ── Layout / export / budgeting (backend features) ──────────────────────────
const layouts = ['Default']
const selectedLayout = ref('Default')
function notInPrototype() { infoToast(t('Not in this prototype')) }

// ── Full screen ──────────────────────────────────────────────────────────────
const fullscreen = ref(false)
const { isReportFullscreen } = useReportFullscreen()
watch(fullscreen, (v) => { isReportFullscreen.value = v })
onBeforeUnmount(() => { isReportFullscreen.value = false })

const rangeCaption = computed(() => (applied.value ? `${bsPlDayLabel(applied.value.start)} - ${bsPlDayLabel(applied.value.end)}` : ''))
const lastUpdated = computed(() => `${t('Last updated on')} ${bsPlDayLabel(SIM_TODAY_ISO)}`)
</script>

<template>
  <div class="plr" :class="{ 'plr--full': fullscreen, 'plr--compact': settings.density === 'compact' }">
    <header v-if="!fullscreen" class="plr-titlebar">
      <div class="plr-titlebar-left">
        <button class="plr-breadcrumb" type="button" @click="router.push('/financial-report')">{{ t('Financials') }}</button>
        <h1 class="plr-title">{{ t('Profit & Loss') }} <span class="plr-title-cur">(IDR)</span></h1>
      </div>
      <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="notInPrototype">{{ t('See profit & loss bugeting') }}</button>
    </header>

    <div class="plr-stage">
      <div v-if="!fullscreen" class="plr-controls">
        <div class="plr-controls-left">
          <div class="plr-field">
            <label class="plr-label" for="plr-start">{{ t('Start date') }}</label>
            <MpDatePicker id="plr-start" v-model="startDate" format="DD/MM/YYYY" value-type="format" use-portal :is-clearable="false" @update:model-value="onDateChange" />
          </div>
          <div class="plr-field">
            <label class="plr-label" for="plr-end">{{ t('End date') }}</label>
            <MpDatePicker id="plr-end" v-model="endDate" format="DD/MM/YYYY" value-type="format" use-portal :is-clearable="false" @update:model-value="onDateChange" />
          </div>
          <div class="plr-field">
            <label class="plr-label" for="plr-period">{{ t('Period') }}</label>
            <ErpFilterSelect id="plr-period" :model-value="period" :placeholder="t('Period')" :options="periodOptions" width="200px" :is-clearable="false" @update:model-value="onPeriod" />
          </div>
          <button class="btn-enterprise btn-enterprise--primary" type="button" @click="runFilter">{{ t('Filter') }}</button>
          <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" type="button" @click="openDrawer">
            <MpIcon name="filter" size="sm" /> {{ t('More filter') }}
            <span v-if="moreFilterActive" class="plr-dot" />
          </button>
        </div>
        <div class="plr-controls-right">
          <MpPopover id="plr-density" use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <button class="plr-icon-btn" type="button" :aria-label="t('Table density')"><MpIcon name="table-view-column" size="md" /></button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ width: '280px', padding: '16px' })">
              <p class="plr-pop-title">{{ t('Density') }}</p>
              <label class="plr-radio">
                <MpRadio id="plr-density-default" name="plr-density" value="default" :is-checked="settings.density === 'default'" @change="settings.density = 'default'" />
                <span><strong>{{ t('Default') }}</strong><br><span class="plr-radio-desc">{{ t('This screen provides more space for transactions for ease of reading.') }}</span></span>
              </label>
              <label class="plr-radio">
                <MpRadio id="plr-density-compact" name="plr-density" value="compact" :is-checked="settings.density === 'compact'" @change="settings.density = 'compact'" />
                <span><strong>{{ t('Compact') }}</strong><br><span class="plr-radio-desc">{{ t('This screen loads more transactions on the screen, which is ideal for faster data checking.') }}</span></span>
              </label>
            </MpPopoverContent>
          </MpPopover>
          <MpTooltip id="plr-fs" :label="t('Expand')" placement="bottom" use-portal>
            <button class="plr-icon-btn" type="button" :aria-label="t('Expand')" @click="fullscreen = true"><MpIcon name="full-screen" size="md" /></button>
          </MpTooltip>
          <!-- Select layout (prod select-layout.vue) -->
          <MpPopover id="plr-layout" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <button class="btn-enterprise btn-enterprise--secondary plr-export" type="button">{{ selectedLayout }} <MpIcon name="caret-down" size="sm" /></button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content' })">
              <MpPopoverList>
                <MpPopoverListItem v-for="l in layouts" :key="l" :is-active="l === selectedLayout" @click="selectedLayout = l">{{ t(l) }}</MpPopoverListItem>
                <MpPopoverListItem @click="notInPrototype">{{ t('Add new template') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
          <MpPopover id="plr-export" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <button class="btn-enterprise btn-enterprise--secondary plr-export" type="button">{{ t('Export') }} <MpIcon name="caret-down" size="sm" /></button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content' })">
              <MpPopoverList>
                <MpPopoverListItem @click="notInPrototype">{{ t('PDF') }}</MpPopoverListItem>
                <MpPopoverListItem @click="notInPrototype">{{ t('XLS') }}</MpPopoverListItem>
                <MpPopoverListItem @click="notInPrototype">{{ t('CSV') }}</MpPopoverListItem>
                <MpPopoverListItem @click="notInPrototype">{{ t('Print') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>
      <p v-if="!fullscreen && formError" class="plr-error">{{ formError }}</p>

      <div class="plr-report">
        <div v-if="fullscreen" class="plr-fs-topbar">
          <span class="plr-fs-title">{{ t('Profit & Loss') }} <span class="plr-title-cur">(IDR)</span></span>
          <MpTooltip id="plr-fs-exit" :label="t('Minimize')" placement="bottom-end" use-portal>
            <button class="plr-icon-btn" type="button" :aria-label="t('Minimize')" @click="fullscreen = false"><MpIcon name="minimize" size="md" /></button>
          </MpTooltip>
        </div>

        <div v-if="state === 'idle'" class="plr-empty">
          <img src="/illustrations/report-empty.png" alt="" class="plr-empty-img" width="240" height="200" />
          <p class="plr-empty-title">{{ t('Report data will appear here') }}</p>
          <p class="plr-empty-desc">{{ t('Select a date range, then click Filter button.') }}</p>
        </div>

        <div v-else-if="state === 'loading'" class="plr-table-wrap">
          <table class="plr-table">
            <tbody>
              <tr v-for="n in 8" :key="n"><td class="plr-td"><MpSkeleton class="plr-skel" height="10px" width="220px" rounded="sm" duration="0s" /></td><td class="plr-td plr-num"><MpSkeleton class="plr-skel" height="10px" width="120px" rounded="sm" duration="0s" /></td></tr>
            </tbody>
          </table>
        </div>

        <template v-else-if="report">
          <div class="plr-report-head">
            <span class="plr-report-range">{{ rangeCaption }}</span>
            <span class="plr-report-updated">{{ lastUpdated }}</span>
          </div>
          <div class="plr-table-wrap">
            <table class="plr-table">
              <thead>
                <tr>
                  <th class="plr-th">
                    <span class="plr-th-inner">{{ t('Date') }}
                      <MpTooltip v-if="isCompare && applied!.period !== 'this_financial_year'" id="plr-sort" :label="t('You can sort your report period in ascending or descending.')" placement="top" use-portal>
                        <button class="plr-sort" type="button" :aria-label="t('Sort periods')" @click="toggleOrder">
                          <MpIcon name="caret-right" size="sm" :class="{ 'plr-sort--desc': applied!.order === 'desc' }" />
                        </button>
                      </MpTooltip>
                    </span>
                  </th>
                  <template v-for="p in periods" :key="`h-${p.start}`">
                    <th class="plr-th plr-num">{{ p.label }}</th>
                    <th v-if="showPct" class="plr-th plr-pct" />
                  </template>
                </tr>
              </thead>
              <tbody>
                <template v-for="b in blocks" :key="b.key">
                  <template v-if="b.kind === 'type'">
                    <!-- Account type row: shows totals only when accounts are hidden and there are no sub-labels -->
                    <tr class="plr-row--type">
                      <td class="plr-td">{{ t(b.name) }}</td>
                      <template v-for="(p, i) in periods" :key="`${b.key}-${p.start}`">
                        <td class="plr-td plr-num">{{ !settings.showAccount && b.groups.length === 1 ? money(b.totals[i]!) : '' }}</td>
                        <td v-if="showPct" class="plr-td plr-pct" />
                      </template>
                    </tr>
                    <template v-for="g in b.groups" :key="`${b.key}-${g.label}`">
                      <!-- Sub-label (Other Income / Other Expense) -->
                      <tr v-if="g.label" class="plr-row--label">
                        <td class="plr-td plr-indent-1">{{ t(g.label) }}</td>
                        <template v-for="(p, i) in periods" :key="`${g.label}-${p.start}`">
                          <td class="plr-td plr-num">{{ settings.showAccount ? '' : money(g.section.totals[i]!) }}</td>
                          <td v-if="showPct" class="plr-td plr-pct" />
                        </template>
                      </tr>
                      <template v-if="settings.showAccount">
                        <tr v-for="r in flatten(g.section.rows)" :key="`${b.key}-${r.id}`" class="plr-row">
                          <td class="plr-td" :style="{ paddingLeft: `calc(var(--mp-spacing-6) + ${((g.label ? 1 : 0) + r.level - 1) * 16}px)` }">
                            <span class="plr-acct" role="link" tabindex="0" @click="openAccount(r)" @keydown.enter="openAccount(r)">
                              <span class="plr-code">{{ r.code }}</span>{{ r.name }}
                            </span>
                          </td>
                          <template v-for="(p, i) in periods" :key="`${r.id}-${p.start}`">
                            <td class="plr-td plr-num">{{ money(r.amounts[i]!) }}</td>
                            <td v-if="showPct" class="plr-td plr-pct" :class="`plr-${pct(r.amounts, i, b.expenseAsPositive).tone}`">{{ pct(r.amounts, i, b.expenseAsPositive).text }}</td>
                          </template>
                        </tr>
                        <tr v-if="!g.section.rows.length" class="plr-row">
                          <td class="plr-td plr-muted" :class="g.label ? 'plr-indent-2' : 'plr-indent-1'" :colspan="colCount">{{ t('No Data') }}</td>
                        </tr>
                      </template>
                    </template>
                    <tr class="plr-row--total">
                      <td class="plr-td plr-indent-1">{{ t('Total of') }} {{ t(b.name) }}</td>
                      <template v-for="(p, i) in periods" :key="`${b.key}-t-${p.start}`">
                        <td class="plr-td plr-num">{{ money(b.totals[i]!) }}</td>
                        <td v-if="showPct" class="plr-td plr-pct" />
                      </template>
                    </tr>
                  </template>
                  <!-- Net calculation (line type 3) -->
                  <tr v-else class="plr-row--net" :class="{ 'plr-row--final': b.key === 'profit' }">
                    <td class="plr-td">{{ t(b.name) }}</td>
                    <template v-for="(p, i) in periods" :key="`${b.key}-${p.start}`">
                      <td class="plr-td plr-num">{{ money(b.totals[i]!) }}</td>
                      <td v-if="showPct" class="plr-td plr-pct" :class="`plr-${pct(b.totals, i, false).tone}`">{{ pct(b.totals, i, false).text }}</td>
                    </template>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </template>
      </div>
    </div>

    <!-- ── More filter drawer (prod more-filter.vue: "Report filter") ── -->
    <Transition name="plr-dr">
      <div v-if="drawerOpen" class="plr-dr-overlay" @click.self="drawerOpen = false">
        <div class="plr-dr-panel" role="dialog" :aria-label="t('Report filter')">
          <header class="plr-dr-head">
            <span class="plr-dr-title">{{ t('Report filter') }}</span>
            <button class="plr-dr-close" type="button" :aria-label="t('Close')" @click="drawerOpen = false"><MpIcon name="close" size="md" /></button>
          </header>
          <div class="plr-dr-body">
            <div class="plr-dr-row">
              <div class="plr-field">
                <label class="plr-label" for="plr-dr-start">{{ t('Start date') }}</label>
                <MpDatePicker id="plr-dr-start" v-model="draft.start" format="DD/MM/YYYY" value-type="format" use-portal :is-clearable="false" @update:model-value="draft.period = 'custom'; draftError = ''" />
              </div>
              <div class="plr-field">
                <label class="plr-label" for="plr-dr-end">{{ t('End date') }}</label>
                <MpDatePicker id="plr-dr-end" v-model="draft.end" format="DD/MM/YYYY" value-type="format" use-portal :is-clearable="false" @update:model-value="draft.period = 'custom'; draftError = ''" />
              </div>
            </div>
            <p v-if="draftError" class="plr-error">{{ draftError }}</p>
            <div class="plr-field">
              <label class="plr-label" for="plr-dr-period">{{ t('Period') }}</label>
              <ErpFilterSelect id="plr-dr-period" :model-value="draft.period" :placeholder="t('Period')" :options="periodOptions" width="100%" :is-clearable="false" @update:model-value="onDraftPeriod" />
            </div>
            <div class="plr-field">
              <label class="plr-label" for="plr-dr-compare">{{ t('Compare with') }}</label>
              <ErpFilterSelect id="plr-dr-compare" :model-value="draft.compareBy || 'none'" :placeholder="t('None')" :options="compareByOptions" width="100%" :is-clearable="false" @update:model-value="onDraftCompareBy" />
            </div>
            <template v-if="draft.compareBy === 'period' && draft.period !== 'this_financial_year'">
              <div class="plr-field">
                <label class="plr-label" for="plr-dr-count">{{ t('Compare period') }}</label>
                <ErpFilterSelect id="plr-dr-count" v-model="draft.compareCount" :placeholder="t('None')" :options="countOptions" width="100%" :is-clearable="false" />
              </div>
              <div class="plr-radios">
                <label class="plr-radio plr-radio--inline">
                  <MpRadio id="plr-dr-asc" name="plr-dr-order" value="asc" :is-checked="draft.order === 'asc'" @change="draft.order = 'asc'" /><span>{{ t('Ascending') }}</span>
                </label>
                <label class="plr-radio plr-radio--inline">
                  <MpRadio id="plr-dr-desc" name="plr-dr-order" value="desc" :is-checked="draft.order === 'desc'" @change="draft.order = 'desc'" /><span>{{ t('Descending') }}</span>
                </label>
              </div>
            </template>
            <div v-if="depthOptions.length > 1" class="plr-field">
              <label class="plr-label" for="plr-dr-depth">{{ t('Account depth') }}</label>
              <ErpFilterSelect id="plr-dr-depth" v-model="draft.depth" :placeholder="t('Account depth')" :options="depthOptions" width="100%" :is-clearable="false" />
              <p class="plr-hint">{{ t('If the report is exported, account depth will not appear yet') }}</p>
            </div>
            <label class="plr-check">
              <MpCheckbox id="plr-dr-show-account" :is-checked="draft.showAccount" @change="draft.showAccount = !draft.showAccount">{{ t('Show accounts') }}</MpCheckbox>
            </label>
            <label class="plr-check">
              <MpCheckbox id="plr-dr-mcv1" :is-checked="false" @change="notInPrototype">{{ t('Use Multi Currency V1') }}</MpCheckbox>
            </label>
          </div>
          <footer class="plr-dr-foot">
            <button class="plr-dr-clear" type="button" @click="resetDrawer">{{ t('Clear filter') }}</button>
            <div class="plr-dr-actions">
              <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="drawerOpen = false">{{ t('Cancel') }}</button>
              <button class="btn-enterprise btn-enterprise--primary" type="button" @click="applyDrawer">{{ t('Apply') }}</button>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.plr { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.plr-titlebar { flex-shrink: 0; min-height: 72px; background: var(--mp-background-neutral-subtle); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: 0 var(--mp-spacing-6); }
.plr-titlebar-left { display: flex; flex-direction: column; justify-content: center; }
.plr-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm, 12px); line-height: var(--mp-line-heights-sm, 16px); color: var(--mp-text-link); font-family: inherit; }
.plr-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.plr-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.plr-title-cur { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); }

.plr-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage, #fff); border-top-left-radius: var(--mp-radii-lg, 12px); padding: var(--mp-spacing-5, 20px) var(--mp-spacing-6, 24px) var(--mp-spacing-6, 24px); display: flex; flex-direction: column; gap: var(--mp-spacing-3, 12px); }
.plr-controls { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.plr-controls-left { display: flex; align-items: flex-end; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.plr-controls-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.plr-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.plr-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.plr-hint { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.plr-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--mp-text-danger); }
.plr-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.plr-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-colors-icon-default); }
.plr-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.plr-export { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); }
.plr-pop-title { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 0.3px; text-transform: uppercase; color: var(--mp-text-secondary); }
.plr-radio { display: flex; align-items: flex-start; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); cursor: pointer; }
.plr-radio-desc { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.plr-radios { display: flex; gap: var(--mp-spacing-5); }
.plr-radio--inline { padding: 0; align-items: center; }
.plr-check { display: flex; }

.plr-report { display: flex; flex-direction: column; min-width: 0; }
.plr-fs-topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--mp-spacing-2); }
.plr-fs-title { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.plr-report-head { display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-2) 0; }
.plr-report-range, .plr-report-updated { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.plr-table-wrap { overflow-x: auto; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.plr-table { width: 100%; min-width: 720px; border-collapse: collapse; }
.plr-th { padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase; letter-spacing: 0.3px; color: var(--mp-text-secondary); text-align: left; white-space: nowrap; }
.plr-th-inner { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.plr-sort--desc { transform: rotate(180deg); }
.plr-sort { display: inline-flex; align-items: center; border: none; background: none; padding: 0; cursor: pointer; color: var(--mp-colors-icon-default); }
.plr-td { height: 40px; padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; vertical-align: middle; }
.plr--compact .plr-td { height: 28px; padding-top: var(--mp-spacing-1); padding-bottom: var(--mp-spacing-1); }
.plr-num { text-align: right; font-variant-numeric: tabular-nums; }
.plr-pct { width: 72px; text-align: left; font-size: var(--mp-font-sizes-sm); }
.plr-indent-1 { padding-left: var(--mp-spacing-6); }
.plr-indent-2 { padding-left: calc(var(--mp-spacing-6) + 16px); }
.plr-muted { color: var(--mp-text-secondary); }
.plr-row--type .plr-td { background: var(--mp-background-neutral-subtle); font-weight: var(--mp-font-weights-semi-bold); }
.plr-row--label .plr-td { font-weight: var(--mp-font-weights-semi-bold); }
.plr-row--total .plr-td { border-top: 1px solid var(--mp-border-bold, var(--mp-border-default)); border-bottom: 1px solid var(--mp-border-bold, var(--mp-border-default)); }
.plr-row--net .plr-td { font-weight: var(--mp-font-weights-semi-bold); }
.plr-row--final .plr-td { background: var(--mp-background-neutral-subtle); }
.plr-row:hover .plr-td { background: var(--mp-background-neutral-subtle); }
.plr-acct { color: var(--mp-text-link); cursor: pointer; }
.plr-acct:hover { text-decoration: underline; text-underline-offset: 2px; }
.plr-code { display: inline-block; min-width: 88px; margin-right: var(--mp-spacing-3); }
.plr-up { color: var(--mp-colors-text-success); }
.plr-down { color: var(--mp-text-danger); }

.plr-empty { display: flex; flex-direction: column; align-items: center; padding: 72px 0 64px; }
.plr-empty-img { width: 240px; height: 200px; object-fit: contain; }
.plr-empty-title { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.plr-empty-desc { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.plr-skel { display: inline-block; background-color: var(--mp-border-default) !important; background-image: none !important; animation: none !important; }

.plr-dr-enter-active, .plr-dr-leave-active { transition: background-color 250ms ease; }
.plr-dr-enter-from, .plr-dr-leave-to { background-color: transparent; }
.plr-dr-enter-active .plr-dr-panel { transition: transform 350ms ease-out; }
.plr-dr-leave-active .plr-dr-panel { transition: transform 250ms ease-in; }
.plr-dr-enter-from .plr-dr-panel, .plr-dr-leave-to .plr-dr-panel { transform: translateX(calc(100% + 12px)); }
.plr-dr-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.plr-dr-panel { margin: var(--mp-spacing-3); width: min(420px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 24px; overflow: hidden; }
.plr-dr-head { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); }
.plr-dr-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.plr-dr-close { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-colors-icon-default); }
.plr-dr-close:hover { background: var(--mp-background-neutral-hovered); }
.plr-dr-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding: var(--mp-spacing-4); }
.plr-dr-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-3); }
.plr-dr-foot { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.plr-dr-actions { display: flex; gap: var(--mp-spacing-2); }
.plr-dr-clear { border: none; background: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); font-family: inherit; }
.plr-dr-clear:hover { text-decoration: underline; }

.plr--full .plr-stage { border-radius: 0; padding-top: var(--mp-spacing-4); }
</style>
