<!-- prod-parity: quickbook/app/views/reports/bank_statement_report.html.haml (via jurnal-frontend-app/src/pages/reports/cash_and_bank_report) -->
<script setup lang="ts">
/**
 * Bank statement report — Reports › Cash & bank › Bank statement.
 *
 * Prod layout: Start date / End date / Filter by period + Filter, a More filter
 * drawer (dates, period, Filter by account), Export (PDF / XLS / CSV), then the
 * statement for one account: Opening balance, each record (date, description,
 * date imported, reconciled, source, receive, spent, balance), Closing balance,
 * and "Showing total of N transaction lines".
 *
 * Data: app/data/cashBankReport.ts — the same per-account ledger and posted
 * movements Cash management uses, so the closing balance through the latest
 * record equals that account's Book balance on the Cash management list.
 */
import { ref, computed } from 'vue'
import { MpButton, MpIcon, MpDatePicker, MpFormControl, MpFormLabel, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { formatMoney } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { infoToast } from '~/utils/toasts'
import { TODAY_ISO } from '~/data/master'
import { RPT_PERIOD_PRESETS, rptPresetRange, rptPresetFor, rptIsoToDmy, rptDmyToIso, type RptPeriodPreset } from '~/data/inventoryValuationReport'
import { cbrAccounts, cashBankReport } from '~/data/cashBankReport'

const { t } = useLocale()
const router = useRouter()

// ── Dates + period (defaults to This year so the seeded ledger is in range) ──
const initial = rptPresetRange('this_year', TODAY_ISO)!
const startDate = ref(rptIsoToDmy(initial[0]))
const endDate = ref(rptIsoToDmy(initial[1]))
const period = ref<RptPeriodPreset>('this_year')
const periodOptions = computed(() => RPT_PERIOD_PRESETS.map((o) => ({ value: o.value, label: t(o.label) })))
function syncPeriod() { period.value = rptPresetFor(rptDmyToIso(startDate.value), rptDmyToIso(endDate.value), TODAY_ISO) }
function onStartChange(v: string) { startDate.value = v; if (rptDmyToIso(v) > rptDmyToIso(endDate.value)) endDate.value = v; syncPeriod() }
function onEndChange(v: string) { endDate.value = v; if (rptDmyToIso(v) < rptDmyToIso(startDate.value)) startDate.value = v; syncPeriod() }
function onPeriodChange(v: string) {
  const p = (v || 'custom') as RptPeriodPreset
  period.value = p
  const r = rptPresetRange(p, TODAY_ISO)
  if (r) { startDate.value = rptIsoToDmy(r[0]); endDate.value = rptIsoToDmy(r[1]) }
}

// ── Account (prod: first accessible bank / credit-card account by id) ────────
const accounts = cbrAccounts()
const accountOptions = accounts.map((a) => ({ value: a.id, label: `(${a.code}) ${a.name}` }))
const accountId = ref(accounts.find((a) => a.statementBalance !== null)?.id ?? accounts[0]?.id ?? '')
const draftAccountId = ref(accountId.value)
const drawerOpen = ref(false)
function openDrawer() { draftAccountId.value = accountId.value; drawerOpen.value = true }
function applyDrawer() { if (draftAccountId.value) accountId.value = draftAccountId.value; drawerOpen.value = false; runFilter() }

// ── Report ───────────────────────────────────────────────────────────────────
const shown = ref<[string, string]>([initial[0], initial[1]])
function runFilter() { shown.value = [rptDmyToIso(startDate.value), rptDmyToIso(endDate.value)] }
const report = computed(() => cashBankReport(accountId.value, shown.value[0], shown.value[1]))
const cur = computed(() => report.value?.account.currency ?? 'IDR')
const money = (n: number) => formatMoney(n, cur.value)

function openAccount() { if (report.value) router.push(`/cash-management/${report.value.account.id}`) }
</script>

<template>
  <div class="cbr">
    <header class="cbr-titlebar">
      <div class="cbr-titlebar-left">
        <MpButton class="cbr-breadcrumb" variant="textLink" is-rounded @click="router.push('/cash-and-bank-report')">{{ t('Cash & Bank') }}</MpButton>
        <h1 class="cbr-title">{{ t('Bank statement') }} <span class="cbr-title-cur">({{ cur }})</span></h1>
      </div>
    </header>

    <div class="cbr-stage">
      <div class="cbr-controls">
        <div class="cbr-controls-left">
          <MpFormControl id="cbr-start" class="cbr-field">
            <MpFormLabel>{{ t('Start date') }}</MpFormLabel>
            <div class="cbr-datepicker">
              <MpDatePicker id="cbr-start-dp" :model-value="startDate" format="DD/MM/YYYY" value-type="format" :is-clearable="false" use-portal @update:model-value="onStartChange" />
            </div>
          </MpFormControl>
          <MpFormControl id="cbr-end" class="cbr-field">
            <MpFormLabel>{{ t('End date') }}</MpFormLabel>
            <div class="cbr-datepicker">
              <MpDatePicker id="cbr-end-dp" :model-value="endDate" format="DD/MM/YYYY" value-type="format" :is-clearable="false" use-portal @update:model-value="onEndChange" />
            </div>
          </MpFormControl>
          <MpFormControl id="cbr-period" class="cbr-field">
            <MpFormLabel>{{ t('Filter by period') }}</MpFormLabel>
            <ErpFilterSelect id="cbr-period-select" :model-value="period" :placeholder="t('Filter by period')" :options="periodOptions" width="176px" :is-clearable="false" @update:model-value="onPeriodChange" />
          </MpFormControl>
          <MpButton is-rounded @click="runFilter">{{ t('Filter') }}</MpButton>
          <MpButton variant="secondary" is-rounded @click="openDrawer">{{ t('More filter') }}</MpButton>
        </div>
        <MpPopover id="cbr-export" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="secondary" is-rounded right-icon="caret-down">{{ t('Export') }}</MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '140px', width: 'max-content' })">
            <MpPopoverList>
              <MpPopoverListItem @click="infoToast(t('Not in this prototype'))">PDF</MpPopoverListItem>
              <MpPopoverListItem @click="infoToast(t('Not in this prototype'))">XLS</MpPopoverListItem>
              <MpPopoverListItem @click="infoToast(t('Not in this prototype'))">CSV</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>

      <p v-if="report" class="cbr-account">
        <span class="cbr-account-label">{{ t('Account name') }}</span>
        <span class="cbr-link" @click="openAccount">({{ report.account.code }}) {{ report.account.name }}</span>
      </p>

      <div class="cbr-table-wrap">
        <table class="cbr-table">
          <thead>
            <tr>
              <th class="cbr-th">{{ t('Date') }}</th>
              <th class="cbr-th cbr-th--desc">{{ t('Description') }}</th>
              <th class="cbr-th">{{ t('Date imported') }}</th>
              <th class="cbr-th">{{ t('Reconciled') }}</th>
              <th class="cbr-th">{{ t('Source') }}</th>
              <th class="cbr-th cbr-th--num">{{ t('Receive') }}</th>
              <th class="cbr-th cbr-th--num">{{ t('Spent') }}</th>
              <th class="cbr-th cbr-th--num">{{ t('Balance') }}</th>
            </tr>
          </thead>
          <tbody v-if="!report">
            <tr><td class="cbr-td cbr-td--none" colspan="8">{{ t('No Cash and Bank Account found') }}</td></tr>
          </tbody>
          <tbody v-else>
            <tr class="cbr-row cbr-row--balance">
              <td class="cbr-td">{{ formatDate(report.startIso) }}</td>
              <td class="cbr-td" colspan="6">{{ t('Opening balance') }}</td>
              <td class="cbr-td cbr-td--num">{{ money(report.openingBalance) }}</td>
            </tr>
            <tr v-for="r in report.rows" :key="r.id" class="cbr-row">
              <td class="cbr-td">{{ formatDate(r.date) }}</td>
              <td class="cbr-td cbr-td--desc">{{ r.description }}</td>
              <td class="cbr-td">{{ formatDate(r.dateImported) }}</td>
              <td class="cbr-td">{{ r.reconciled ? t('Yes') : t('No') }}</td>
              <td class="cbr-td">{{ t(r.source) }}</td>
              <td class="cbr-td cbr-td--num">{{ money(r.receive) }}</td>
              <td class="cbr-td cbr-td--num">{{ money(r.spent) }}</td>
              <td class="cbr-td cbr-td--num">{{ money(r.balance) }}</td>
            </tr>
            <tr class="cbr-row cbr-row--balance cbr-row--closing">
              <td class="cbr-td">{{ formatDate(report.endIso) }}</td>
              <td class="cbr-td" colspan="6">{{ t('Closing balance') }}</td>
              <td class="cbr-td cbr-td--num">{{ money(report.closingBalance) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="cbr-showing">{{ t('Showing total of') }} {{ report?.rows.length ?? 0 }} {{ t('transaction lines') }}</p>
    </div>

    <!-- ── More filter drawer (Reports filter) ── -->
    <Teleport to="body">
      <Transition name="cbrf">
        <div v-if="drawerOpen" class="cbrf-overlay" @click.self="drawerOpen = false">
          <div class="cbrf-panel" role="dialog" :aria-label="t('Reports filter')">
            <header class="cbrf-head">
              <span class="cbrf-title">{{ t('Reports filter') }}</span>
              <MpButton variant="ghost" is-rounded :aria-label="t('Close')" @click="drawerOpen = false"><MpIcon name="close" size="md" /></MpButton>
            </header>
            <div class="cbrf-body">
              <div class="cbrf-grid">
                <MpFormControl id="cbrf-start">
                  <MpFormLabel>{{ t('Start date') }}</MpFormLabel>
                  <div class="cbr-datepicker">
                    <MpDatePicker id="cbrf-start-dp" :model-value="startDate" format="DD/MM/YYYY" value-type="format" :is-clearable="false" use-portal @update:model-value="onStartChange" />
                  </div>
                </MpFormControl>
                <MpFormControl id="cbrf-end">
                  <MpFormLabel>{{ t('End date') }}</MpFormLabel>
                  <div class="cbr-datepicker">
                    <MpDatePicker id="cbrf-end-dp" :model-value="endDate" format="DD/MM/YYYY" value-type="format" :is-clearable="false" use-portal @update:model-value="onEndChange" />
                  </div>
                </MpFormControl>
              </div>
              <MpFormControl id="cbrf-period">
                <MpFormLabel>{{ t('Filter by period') }}</MpFormLabel>
                <ErpFilterSelect id="cbrf-period-select" :model-value="period" :placeholder="t('Filter by period')" :options="periodOptions" width="100%" :is-clearable="false" @update:model-value="onPeriodChange" />
              </MpFormControl>
              <MpFormControl id="cbrf-account">
                <MpFormLabel>{{ t('Filter by account') }}</MpFormLabel>
                <ErpFilterSelect id="cbrf-account-select" v-model="draftAccountId" :placeholder="t('Account')" :options="accountOptions" width="100%" :is-clearable="false" />
              </MpFormControl>
            </div>
            <footer class="cbrf-foot">
              <MpButton variant="ghost" is-rounded @click="drawerOpen = false">{{ t('Cancel') }}</MpButton>
              <MpButton is-rounded @click="applyDrawer">{{ t('Filter') }}</MpButton>
            </footer>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.cbr { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.cbr-titlebar { flex-shrink: 0; min-height: 72px; background: var(--mp-background-neutral-subtle); display: flex; align-items: center; padding: 0 var(--mp-spacing-6); }
.cbr-titlebar-left { display: flex; flex-direction: column; justify-content: center; align-items: flex-start; }
.cbr-breadcrumb { padding: 0; height: auto; font-size: var(--mp-font-sizes-sm); }
.cbr-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); color: var(--mp-text-default); }
.cbr-title-cur { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); }

.cbr-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage); border-top-left-radius: var(--mp-radii-lg); padding: var(--mp-spacing-5) var(--mp-spacing-6) var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.cbr-controls { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.cbr-controls-left { display: flex; align-items: flex-end; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.cbr-field { width: var(--mp-sizes-44, 176px); }
.cbr-datepicker { width: 100%; }
.cbr-datepicker :deep(.mp-datepicker__root) { width: 100%; }
.cbr-account { margin: 0; display: flex; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); }
.cbr-account-label { color: var(--mp-text-secondary); }
.cbr-link { color: var(--mp-text-link); cursor: pointer; font-weight: var(--mp-font-weights-semi-bold); }
.cbr-link:hover { text-decoration: underline; text-underline-offset: 2px; }

.cbr-table-wrap { flex-shrink: 0; overflow-x: auto; }
.cbr-table { width: 100%; min-width: 1100px; border-collapse: collapse; }
.cbr-th { padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral-subtle); border-top: 1px solid var(--mp-border-default); border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-align: left; white-space: nowrap; }
.cbr-th--num { text-align: right; }
.cbr-th--desc { min-width: var(--mp-sizes-72, 288px); }
.cbr-td { padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); vertical-align: middle; white-space: nowrap; }
.cbr-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.cbr-td--desc { white-space: normal; }
.cbr-td--none { text-align: center; color: var(--mp-text-secondary); font-weight: var(--mp-font-weights-semi-bold); padding: var(--mp-spacing-6) 0; }
.cbr-row--balance .cbr-td { font-weight: var(--mp-font-weights-semi-bold); }
.cbr-row--closing .cbr-td { border-top: 1px solid var(--mp-border-bold, var(--mp-border-default)); }
.cbr-showing { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.cbrf-enter-active, .cbrf-leave-active { transition: background-color 250ms ease; }
.cbrf-enter-from, .cbrf-leave-to { background-color: transparent; }
.cbrf-enter-active .cbrf-panel { transition: transform 350ms ease-out; }
.cbrf-leave-active .cbrf-panel { transition: transform 250ms ease-in; }
.cbrf-enter-from .cbrf-panel, .cbrf-leave-to .cbrf-panel { transform: translateX(calc(100% + 12px)); }
.cbrf-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.cbrf-panel { margin: var(--mp-spacing-3); width: min(420px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage); border-radius: var(--mp-radii-3xl, 24px); overflow: hidden; }
.cbrf-head { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); }
.cbrf-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cbrf-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding: var(--mp-spacing-4); }
.cbrf-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-3); }
.cbrf-foot { flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
</style>
