<script setup lang="ts">
/**
 * Payroll accrual (FG-7): month-end accrual (OD-29) and the claims summary (OD-26).
 * Accrual settings (account, cut-off day) are the Finance Manager's. Loans (OD-27), exit pay
 * (OD-28), THR and bonus release (OD-30) and transfer cost split (OD-31) are Next.
 */
import {
  MpButton, MpSegmentedControl, MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import PayrollAccrualEstimate from '~/components/payroll/PayrollAccrualEstimate.vue'
import PayrollAccrualClaims from '~/components/payroll/PayrollAccrualClaims.vue'
import PayrollPayDrawer from '~/components/payroll/PayrollPayDrawer.vue'
import { payroll, accrualFor, accrualEstimate, setAccrualSettings, can, rupiah, monthLabel, accountLabel, today, journalById, journalTotals } from '~/data/payrollStore'
import { successToast, infoToast } from '~/utils/toasts'

const { t } = useLocale()
const route = useRoute()

const view = ref<'accrual' | 'claims'>(route.query.tab === 'claims' ? 'claims' : 'accrual')
const viewOptions = computed(() => [{ id: 'pa-v-acc', label: t('Accrual'), value: 'accrual' }, { id: 'pa-v-claims', label: t('Claims'), value: 'claims' }])

/** Months from the first live period to the current month, newest first. */
const months = computed(() => {
  const first = payroll.settings.cutover.firstLive ?? today().slice(0, 7)
  const out: string[] = []
  let m = today().slice(0, 7)
  while (m >= first && out.length < 24) { out.push(m); const [y, mm] = m.split('-').map(Number) as [number, number]; m = mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, '0')}` }
  return out
})
const defaultMonth = computed(() => months.value.find((m) => !accrualFor(m) && accrualEstimate(m).state !== 'none') ?? months.value[0] ?? today().slice(0, 7))
const month = ref(typeof route.query.month === 'string' ? route.query.month : defaultMonth.value)
const monthOptions = computed(() => months.value.map((m) => ({ value: m, label: monthLabel(m) })))

// ─── Stats ──────────────────────────────────────────────────────────────────
const openAccruals = computed(() => payroll.accruals.filter((a) => !a.reversalJournalId))
const amountOf = (id: string) => { const j = journalById(id); return j ? journalTotals(j).debit : 0 }
const est = computed(() => accrualEstimate(month.value))

// ─── Settings (Finance Manager) ─────────────────────────────────────────────
const settingsOpen = ref(false)
const sAccount = ref('')
const sCutoff = ref('')
const sError = ref('')
function openSettings() { sAccount.value = payroll.settings.accrual.account; sCutoff.value = payroll.settings.accrual.cutoffDay == null ? '' : String(payroll.settings.accrual.cutoffDay); sError.value = ''; settingsOpen.value = true }
const liabilityOptions = computed(() => payroll.accounts.filter((a) => a.type === 'liability' && !a.party && !a.archived).map((a) => ({ value: a.code, label: accountLabel(a.code) })))
function saveSettings() {
  const day = sCutoff.value.trim() === '' ? null : Number(sCutoff.value)
  if (day != null && (!Number.isInteger(day) || day < 1 || day > 28)) { sError.value = t('Type a cut-off day from 1 to 28.'); return }
  const r = setAccrualSettings({ account: sAccount.value, cutoffDay: day })
  if (!r.ok) { sError.value = r.message ?? ''; return }
  settingsOpen.value = false
  successToast(t('Accrual settings saved'))
}
const NEXT = ['Employee loans', 'Exit pay routing', 'THR and bonus accrual release', 'Transfer cost split']
</script>

<template>
  <div class="pa">
    <div class="pa-bar">
      <div class="pa-bar-left">
        <MpSegmentedControl id="pa-view" v-model="view" name="pa-view" :data="viewOptions" />
        <ErpFilterSelect v-if="view === 'accrual'" id="pa-month" v-model="month" :placeholder="t('Month')" :options="monthOptions" :is-clearable="false" />
      </div>
      <div class="pa-bar-right">
        <MpButton variant="secondary" is-rounded @click="openSettings">{{ t('Accrual settings') }}</MpButton>
        <MpPopover id="pa-more" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="secondary" right-icon="chevrons-down" is-rounded>{{ t('More') }}</MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent class="erp-dropdown-menu">
            <MpPopoverList>
              <MpPopoverListItem v-for="n in NEXT" :key="n" @click="infoToast(t('Not in this prototype'))">{{ t(n) }}</MpPopoverListItem>
              <MpPopoverListItem @click="infoToast(t('Not in this prototype'))">{{ t('Export') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>
    </div>

    <template v-if="view === 'accrual'">
      <div class="stats-section">
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Estimate') }}</div>
          <div class="stat-period">{{ monthLabel(month) }} · {{ est.state === 'ready' ? `${est.days} ${t('of')} ${est.baseDays} ${t('days')}` : t('Nothing to estimate') }}</div>
          <div class="stat-amount">{{ rupiah(est.total) }}</div>
        </div>
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Open accruals') }}</div>
          <div class="stat-period">{{ t('Posted, waiting for the next run') }}</div>
          <div class="stat-amount">{{ rupiah(openAccruals.reduce((s, a) => s + amountOf(a.journalId), 0)) }}</div>
          <a v-if="openAccruals[0]" class="stat-link" @click="month = openAccruals[0]!.month">{{ openAccruals.map((a) => monthLabel(a.month)).join(', ') }}</a>
        </div>
        <div class="stat-card">
          <div class="stat-title">{{ t('Accrued payroll account') }}</div>
          <div class="stat-period">{{ t('Cut-off') }}: {{ payroll.settings.accrual.cutoffDay ? `${t('day')} ${payroll.settings.accrual.cutoffDay}` : t('read from the last three runs') }}</div>
          <div class="stat-amount pa-acct">{{ accountLabel(payroll.settings.accrual.account) }}</div>
        </div>
      </div>
      <PayrollAccrualEstimate :month="month" />
    </template>

    <PayrollAccrualClaims v-else />

    <PayrollPayDrawer v-model:is-open="settingsOpen" :title="t('Accrual settings')">
      <template v-if="can('accrual.settings')">
        <MpFormControl id="pa-s-account" is-required>
          <MpFormLabel>{{ t('Accrued payroll account') }}</MpFormLabel>
          <ErpFilterSelect id="pa-s-account-select" :model-value="sAccount" :placeholder="t('Select account')" :options="liabilityOptions" :is-clearable="false" width="100%" @update:model-value="(v: string) => (sAccount = v)" />
        </MpFormControl>
        <MpFormControl id="pa-s-cutoff" :is-invalid="!!sError">
          <MpFormLabel>{{ t('Cut-off day') }}</MpFormLabel>
          <MpInput id="pa-s-cutoff-input" v-model="sCutoff" autocomplete="off" />
          <MpFormErrorMessage>{{ sError }}</MpFormErrorMessage>
        </MpFormControl>
        <p class="pa-sub">{{ t('Leave the cut-off day empty to read it from the last three regular runs. Day 28 gives no February accrual.') }}</p>
      </template>
      <template v-else>
        <p class="pa-body">{{ t('Accrued payroll account') }}: {{ accountLabel(payroll.settings.accrual.account) }}</p>
        <p class="pa-body">{{ t('Cut-off day') }}: {{ payroll.settings.accrual.cutoffDay ?? t('read from the last three runs') }}</p>
        <p class="pa-sub">{{ t('Only the Finance Manager changes accrual settings.') }}</p>
      </template>
      <template #footer>
        <MpButton variant="ghost" is-rounded @click="settingsOpen = false">{{ can('accrual.settings') ? t('Cancel') : t('Close') }}</MpButton>
        <MpButton v-if="can('accrual.settings')" is-rounded @click="saveSettings">{{ t('Save') }}</MpButton>
      </template>
    </PayrollPayDrawer>
  </div>
</template>

<style scoped>
.pa { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.pa-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.pa-bar-left, .pa-bar-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }

.stats-section { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.stat-card { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding-right: var(--mp-spacing-6); align-self: stretch; }
.stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.stat-title { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); white-space: nowrap; }
.stat-period { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); white-space: nowrap; }
.stat-amount { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl, 32px); white-space: nowrap; }
.stat-link { display: inline-flex; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); line-height: var(--mp-line-heights-md); cursor: pointer; padding: 0 var(--mp-spacing-0\.5); }
.pa-acct { font-size: var(--mp-font-sizes-md); overflow: hidden; text-overflow: ellipsis; }
.pa-sub { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
.pa-body { margin: 0; font-size: var(--mp-font-sizes-md); }
</style>
