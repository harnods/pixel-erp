<!-- prod-parity: jurnal-frontend-app/src/pages/reports/trial_balance -->
<script setup lang="ts">
/**
 * Trial balance report — Reports › Financials › Trial balance.
 *
 * Prod structure: Start date / End date / Period + Filter, Export; the table is
 * Accounts | Opening Balance (Debit, Credit) | Movement (Debit, Credit) |
 * End Balance (Debit, Credit), accounts grouped by account type, then a Total row.
 *
 * Figures come from the canonical ledger (data/cashFlowTrialBalance.ts →
 * chartOfAccounts.ts); tbAssertReport() checks debits = credits for every
 * column pair on every build.
 */
import { ref, computed, onBeforeUnmount } from 'vue'
import { MpIcon, MpSkeleton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css } from '@mekari/pixel3'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { infoToast } from '~/utils/toasts'
import { TB_PERIODS, tbPeriodRange, tbBuildReport, cfRangeLabel, type CfDateRange } from '~/data/cashFlowTrialBalance'

const { t } = useLocale()
const router = useRouter()

// ── Period ───────────────────────────────────────────────────────────────────
const toDate = (s: string) => new Date(s + 'T00:00:00')
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const period = ref('this_month')
const pendingRange = ref<Date[]>((() => { const r = tbPeriodRange('this_month')!; return [toDate(r.start), toDate(r.end)] })())
const formError = ref('')
function onPendingChange(v: Date[]) { pendingRange.value = v; period.value = 'custom'; formError.value = '' }
function onPeriodChange(v: string) {
  period.value = v || 'custom'
  const r = tbPeriodRange(period.value)
  if (r) pendingRange.value = [toDate(r.start), toDate(r.end)]
}

// ── idle → loading → ready ───────────────────────────────────────────────────
const applied = ref<CfDateRange | null>(null)
const reportState = ref<'idle' | 'loading' | 'ready'>('idle')
let timer: ReturnType<typeof setTimeout> | null = null
function applyFilter() {
  const [s, e] = pendingRange.value
  if (!s || !e) { formError.value = t('You must fill in date range'); return }
  if (s > e) { formError.value = t('Start date cannot be after end date.'); return }
  formError.value = ''
  applied.value = { start: toIso(s), end: toIso(e) }
  reportState.value = 'loading'
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { reportState.value = 'ready' }, 700)
}
onBeforeUnmount(() => { if (timer) clearTimeout(timer) })

const report = computed(() => (reportState.value === 'ready' && applied.value ? tbBuildReport(applied.value) : null))

/** Figures render without the currency unit (prod to_currency_wo_unit); zero renders blank-free as 0,00. */
const NUM = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function num(n: number) { return n < 0 ? `(${NUM.format(-n)})` : NUM.format(n) }

function openAccount(id: string) { router.push(`/chart-of-accounts/${id}`) }
function notInPrototype() { infoToast(t('Not in this prototype')) }
</script>

<template>
  <div class="tbr">
    <!-- ── Title bar ── -->
    <header class="tbr-titlebar">
      <div class="tbr-titlebar-left">
        <button class="tbr-breadcrumb" type="button" @click="router.push('/financial-report')">{{ t('Financials') }}</button>
        <h1 class="tbr-title">{{ t('Trial Balance') }} <span class="tbr-title-cur">(IDR)</span></h1>
      </div>
    </header>

    <div class="tbr-stage">
      <!-- ── Filter (prod tb-filter) ── -->
      <div class="tbr-controls">
        <div class="tbr-controls-left">
          <div class="tbr-datefield">
            <span class="tbr-field-label">{{ t('Start date - End date') }}</span>
            <AdvancedDateRangePicker
              id="tbr-date"
              :model-value="pendingRange"
              is-full-width
              period-mode
              hide-label
              :placeholder="t('Select date')"
              @update:model-value="onPendingChange"
            />
          </div>
          <ErpFilterSelect id="tbr-period" :model-value="period" :placeholder="t('Period')" :options="TB_PERIODS" width="200px" :is-clearable="false" @update:model-value="onPeriodChange" />
          <button class="btn-enterprise btn-enterprise--primary" type="button" @click="applyFilter">{{ t('Filter') }}</button>
        </div>
        <div class="tbr-controls-right">
          <MpPopover id="tbr-export" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <button class="btn-enterprise btn-enterprise--secondary tbr-menu-btn" type="button">
                {{ t('Export') }}
                <MpIcon name="caret-down" size="sm" />
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
              <MpPopoverList>
                <MpPopoverListItem @click="notInPrototype">PDF</MpPopoverListItem>
                <MpPopoverListItem @click="notInPrototype">XLSX</MpPopoverListItem>
                <MpPopoverListItem @click="notInPrototype">CSV</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>
      <p v-if="formError" class="tbr-form-error">{{ formError }}</p>

      <div class="tbr-report">
        <!-- Blank state (prod blank-title / desc-title) -->
        <div v-if="reportState === 'idle'" class="tbr-empty">
          <img src="/illustrations/report-empty.png" alt="" class="tbr-empty-img" width="240" height="200" />
          <p class="tbr-empty-title">{{ t('No report shown yet') }}</p>
          <p class="tbr-empty-desc">{{ t('The report that you filter will show here.') }}</p>
        </div>

        <template v-else>
          <div v-if="applied" class="tbr-report-head">
            <span class="tbr-report-range">{{ cfRangeLabel(applied) }}</span>
          </div>
          <div class="tbr-table-wrap">
            <table class="tbr-table">
              <thead>
                <tr>
                  <th class="tbr-th tbr-th--accounts" colspan="2" rowspan="2">{{ t('Accounts') }}</th>
                  <th class="tbr-th tbr-th--group" colspan="2">{{ t('Opening Balance') }}</th>
                  <th class="tbr-th tbr-th--group" colspan="2">{{ t('Movement') }}</th>
                  <th class="tbr-th tbr-th--group" colspan="2">{{ t('End Balance') }}</th>
                </tr>
                <tr>
                  <template v-for="g in 3" :key="g">
                    <th class="tbr-th tbr-th--sub">{{ t('Debit') }}</th>
                    <th class="tbr-th tbr-th--sub">{{ t('Credit') }}</th>
                  </template>
                </tr>
              </thead>

              <!-- Loading -->
              <tbody v-if="reportState === 'loading'">
                <tr v-for="n in 8" :key="n">
                  <td class="tbr-td" colspan="2"><MpSkeleton class="tbr-skel" height="10px" width="220px" rounded="sm" duration="0s" /></td>
                  <td v-for="c in 6" :key="c" class="tbr-td tbr-td--num"><MpSkeleton class="tbr-skel" height="10px" width="88px" rounded="sm" duration="0s" /></td>
                </tr>
              </tbody>

              <template v-else-if="report && report.groups.length">
                <tbody v-for="g in report.groups" :key="g.categoryId">
                  <tr>
                    <td class="tbr-td tbr-td--band" colspan="2">{{ t(g.accountType) }}</td>
                    <td v-for="i in 6" :key="i" class="tbr-td tbr-td--band" />
                  </tr>
                  <tr v-for="a in g.accounts" :key="a.id" class="tbr-row">
                    <td class="tbr-td tbr-td--code">
                      <span class="tbr-link" role="link" tabindex="0" @click="openAccount(a.id)" @keydown.enter="openAccount(a.id)">{{ a.code }}</span>
                    </td>
                    <td class="tbr-td tbr-td--name">
                      <span class="tbr-link" role="link" tabindex="0" @click="openAccount(a.id)" @keydown.enter="openAccount(a.id)">{{ a.name }}</span>
                    </td>
                    <td class="tbr-td tbr-td--num">{{ num(a.obDebit) }}</td>
                    <td class="tbr-td tbr-td--num">{{ num(a.obCredit) }}</td>
                    <td class="tbr-td tbr-td--num">{{ num(a.mvDebit) }}</td>
                    <td class="tbr-td tbr-td--num">{{ num(a.mvCredit) }}</td>
                    <td class="tbr-td tbr-td--num">{{ num(a.ebDebit) }}</td>
                    <td class="tbr-td tbr-td--num">{{ num(a.ebCredit) }}</td>
                  </tr>
                </tbody>
                <tbody>
                  <tr class="tbr-row--total">
                    <td class="tbr-td" colspan="2">{{ t('Total') }}</td>
                    <td class="tbr-td tbr-td--num">{{ num(report.total.obDebit) }}</td>
                    <td class="tbr-td tbr-td--num">{{ num(report.total.obCredit) }}</td>
                    <td class="tbr-td tbr-td--num">{{ num(report.total.mvDebit) }}</td>
                    <td class="tbr-td tbr-td--num">{{ num(report.total.mvCredit) }}</td>
                    <td class="tbr-td tbr-td--num">{{ num(report.total.ebDebit) }}</td>
                    <td class="tbr-td tbr-td--num">{{ num(report.total.ebCredit) }}</td>
                  </tr>
                </tbody>
              </template>

              <!-- No data (prod no-data) -->
              <tbody v-else>
                <tr><td class="tbr-td tbr-td--nodata" colspan="8">{{ t('No Data') }}</td></tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tbr { display: flex; flex-direction: column; height: 100%; min-height: 0; }

.tbr-titlebar { flex-shrink: 0; min-height: 72px; background: var(--mp-background-neutral-subtle); display: flex; align-items: center; padding: 0 var(--mp-spacing-6); }
.tbr-titlebar-left { display: flex; flex-direction: column; justify-content: center; }
.tbr-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm, 12px); line-height: var(--mp-line-heights-sm, 16px); color: var(--mp-text-link); font-family: inherit; }
.tbr-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.tbr-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.tbr-title-cur { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); }

.tbr-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage, #fff); border-top-left-radius: var(--mp-radii-lg, 12px); padding: var(--mp-spacing-5, 20px) var(--mp-spacing-6, 24px) var(--mp-spacing-6, 24px); display: flex; flex-direction: column; gap: var(--mp-spacing-3, 12px); }

.tbr-controls { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.tbr-controls-left { display: flex; align-items: flex-end; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.tbr-controls-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.tbr-field-label { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-default); }
.tbr-datefield { display: flex; flex-direction: column; gap: var(--mp-spacing-1); width: 260px; }
.tbr-menu-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); }
.tbr-form-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #c62828); }

.tbr-report { display: flex; flex-direction: column; min-width: 0; }
.tbr-report-head { display: flex; align-items: center; padding: var(--mp-spacing-2) 0; }
.tbr-report-range { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.tbr-table-wrap { overflow-x: auto; }
.tbr-table { width: 100%; min-width: 960px; border-collapse: collapse; }
.tbr-th {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle, #f4f5f7);
  border-top: 1px solid var(--mp-border-default);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; letter-spacing: 0.3px; color: var(--mp-text-secondary);
  white-space: nowrap;
}
.tbr-th--accounts { text-align: left; vertical-align: bottom; }
.tbr-th--group, .tbr-th--sub { text-align: center; border-left: 1px solid var(--mp-border-default); }
.tbr-td {
  height: var(--mp-sizes-10); padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default);
  vertical-align: middle;
}
.tbr-td--num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; border-left: 1px solid var(--mp-border-default); }
.tbr-td--band { background: var(--mp-background-neutral-subtle, #f4f5f7); height: 32px; font-weight: var(--mp-font-weights-semi-bold, 600); }
.tbr-td--code { padding-left: var(--mp-spacing-6, 24px); white-space: nowrap; width: 1%; }
.tbr-td--name { min-width: 200px; }
.tbr-td--nodata { text-align: center; color: var(--mp-text-secondary); height: 120px; }
.tbr-row:hover .tbr-td { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.tbr-row--total .tbr-td { font-weight: var(--mp-font-weights-semi-bold, 600); border-top: 2px solid var(--mp-border-default); border-bottom: 2px solid var(--mp-border-default); }
.tbr-link { color: var(--mp-text-link); cursor: pointer; }
.tbr-link:hover { text-decoration: underline; text-underline-offset: 2px; }

.tbr-empty { display: flex; flex-direction: column; align-items: center; padding: 72px 0 64px; }
.tbr-empty-img { width: 240px; height: 200px; object-fit: contain; }
.tbr-empty-title { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.tbr-empty-desc { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.tbr-skel { display: inline-block; background-color: var(--mp-border-default) !important; background-image: none !important; animation: none !important; }
</style>
