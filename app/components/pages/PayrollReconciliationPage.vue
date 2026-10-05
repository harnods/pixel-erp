<script setup lang="ts">
/**
 * Payroll reconciliation (FG-6: OD-22, OD-23; OD-25 audit export is Next).
 * Month picker; Talenta beside the ledger by account and tag, payables and pay item, with
 * variance notes; independent checks; PPh 21 monthly and annual with the e-Bupot filed total;
 * Ready for sign-off (Accountant) and sign-off with the HR tick (Finance Manager only);
 * Out of date once a new version, journal, payment or manual entry lands after sign-off.
 */
import { MpButton, MpBadge, MpCheckbox, MpSegmentedControl, MpFormControl, MpFormLabel, MpFormErrorMessage, MpTextarea, MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import PayrollReconTable from '~/components/payroll/PayrollReconTable.vue'
import PayrollReconChecks from '~/components/payroll/PayrollReconChecks.vue'
import PayrollReconManualEntry from '~/components/payroll/PayrollReconManualEntry.vue'
import PayrollPph21Panel from '~/components/payroll/PayrollPph21Panel.vue'
import PayrollPayDrawer from '~/components/payroll/PayrollPayDrawer.vue'
import { can, rupiah, monthLabel, wib, setVarianceNote, today, dateLabel } from '~/data/payrollStore'
import { reconView, reconMonths, confirmSuggested, markReady, signOff, REASONS, type ReconRow } from '~/data/payrollUiRecon'
import { successToast, infoToast } from '~/utils/toasts'

const { t } = useLocale()
const route = useRoute()

const months = computed(() => reconMonths.value)
const month = ref(typeof route.query.month === 'string' ? route.query.month : (months.value.find((m) => m <= today().slice(0, 7)) ?? months.value[0] ?? today().slice(0, 7)))
const monthOptions = computed(() => months.value.map((m) => ({ value: m, label: monthLabel(m) })))
const v = computed(() => reconView(month.value))

const section = ref<'payroll' | 'pph21'>(route.query.tab === 'pph21' ? 'pph21' : 'payroll')
const sectionOptions = computed(() => [{ id: 'pr-s-payroll', label: t('Payroll'), value: 'payroll' }, { id: 'pr-s-pph21', label: t('PPh 21'), value: 'pph21' }])
const by = ref<'account' | 'item'>('account')
const byOptions = computed(() => [{ id: 'pr-by-acc', label: t('By account and tag'), value: 'account' }, { id: 'pr-by-item', label: t('By pay item'), value: 'item' }])

// ─── Stats ──────────────────────────────────────────────────────────────────
const checksOff = computed(() => v.value.checks.filter((c) => c.status === 'Off').length)
const varianceTotal = computed(() => [...v.value.accountRows, ...v.value.payableRows].reduce((s, r) => s + Math.abs(r.variance), 0))
const statusType = computed(() => ({ 'Signed off': 'completed', 'Ready for sign-off': 'information', 'Out of date': 'critical', Open: 'warning' } as Record<string, 'completed' | 'information' | 'critical' | 'warning'>)[v.value.status] ?? 'warning')
const highlight = ref<string | null>(null)
function goFirstUnexplained() {
  const r = v.value.unexplainedRows[0]
  if (!r) return
  section.value = 'payroll'
  by.value = r.payItem ? 'item' : 'account'
  highlight.value = r.key
}

// ─── Notes ──────────────────────────────────────────────────────────────────
const noteOpen = ref(false)
const noteRow = ref<ReconRow | null>(null)
const noteReason = ref('Timing')
const noteText = ref('')
const noteError = ref('')
function openNote(r: ReconRow) {
  noteRow.value = r
  noteReason.value = r.note?.reason ?? (r.suggested ? 'Manual entry' : 'Timing')
  noteText.value = r.note?.note ?? r.suggested ?? ''
  noteError.value = ''
  noteOpen.value = true
}
function saveNote() {
  if (!noteRow.value) return
  const r = setVarianceNote(month.value, noteRow.value.key, { reason: noteReason.value, note: noteText.value })
  if (!r.ok) { noteError.value = r.message ?? ''; return }
  noteOpen.value = false
  if (highlight.value === noteRow.value.key) highlight.value = null
  successToast(t('Note saved'))
}
function confirmNote(r: ReconRow) {
  const res = confirmSuggested(month.value, r.key, r.suggested ?? '')
  if (!res.ok) { infoToast(res.message ?? ''); return }
  successToast(t('Note confirmed'))
}

// ─── Sign-off ───────────────────────────────────────────────────────────────
const hrConfirmed = ref(false)
const signError = ref('')
const signWarnings = ref<string[]>([])
watch(month, () => { hrConfirmed.value = false; signError.value = ''; signWarnings.value = []; highlight.value = null })
function ready() {
  signError.value = ''
  const r = markReady(month.value)
  if (!r.ok) { signError.value = r.message ?? ''; goFirstUnexplained(); return }
  successToast(`${monthLabel(month.value)} ${t('is ready for sign-off')}`)
}
function doSignOff() {
  signError.value = ''
  const r = signOff(month.value, hrConfirmed.value)
  if (!r.ok) { signError.value = r.message ?? ''; return }
  signWarnings.value = (r.warnings as string[] | undefined) ?? []
  hrConfirmed.value = false
  successToast(`${monthLabel(month.value)} ${t('signed off')}`)
}
const snapshot = computed(() => v.value.signOff?.snapshot as { versions?: { run: string; version: number | null }[]; journals?: string[] } | undefined)
const manualOpen = ref(false)
</script>

<template>
  <div class="pr">
    <div class="pr-bar">
      <div class="pr-bar-left">
        <ErpFilterSelect id="pr-month" v-model="month" :placeholder="t('Month')" :options="monthOptions" :is-clearable="false" />
        <MpSegmentedControl id="pr-section" v-model="section" name="pr-section" :data="sectionOptions" />
      </div>
      <div class="pr-bar-right">
        <MpButton v-if="can('recon.note')" variant="secondary" is-rounded @click="manualOpen = true">{{ t('Record manual entry') }}</MpButton>
        <MpButton variant="secondary" is-rounded @click="infoToast(t('Not in this prototype'))">{{ t('Export') }}</MpButton>
        <MpButton variant="secondary" is-rounded @click="infoToast(t('Not in this prototype'))">{{ t('Audit evidence') }}</MpButton>
      </div>
    </div>

    <div class="stats-section">
      <div class="stat-card stat-card--bordered">
        <div class="stat-title">{{ t('Status') }}</div>
        <div class="stat-period">{{ monthLabel(month) }}</div>
        <div class="stat-amount"><MpBadge for="additionalInformation" :type="statusType">{{ t(v.status) }}</MpBadge></div>
        <span class="stat-note">{{ v.signOff ? `${t('Signed off by')} ${v.reSignOff?.by ?? v.signOff.by}` : v.readyBy ? `${t('Ready, set by')} ${v.readyBy}` : t('Not ready for sign-off') }}</span>
      </div>
      <div class="stat-card stat-card--bordered">
        <div class="stat-title">{{ t('Variances to explain') }}</div>
        <div class="stat-period">{{ t('Rows with no reason and note') }}</div>
        <div class="stat-amount" :class="{ 'stat-amount--danger': v.unexplained }">{{ v.unexplained }}</div>
        <a class="stat-link" @click="goFirstUnexplained">{{ v.unexplained ? t('Go to the first row') : t('All explained') }}</a>
      </div>
      <div class="stat-card stat-card--bordered">
        <div class="stat-title">{{ t('Variance') }}</div>
        <div class="stat-period">{{ t('Ledger less Talenta, absolute, by account') }}</div>
        <div class="stat-amount">{{ rupiah(varianceTotal) }}</div>
        <span class="stat-note">{{ v.manual.length }} {{ t(v.manual.length === 1 ? 'manual entry' : 'manual entries') }}</span>
      </div>
      <div class="stat-card">
        <div class="stat-title">{{ t('Independent checks') }}</div>
        <div class="stat-period">{{ t('Off by more than Rp1.000') }}</div>
        <div class="stat-amount" :class="{ 'stat-amount--danger': checksOff }">{{ checksOff }} {{ t('of') }} {{ v.checks.length }}</div>
        <a class="stat-link" @click="section = 'payroll'">{{ t('View checks') }}</a>
      </div>
    </div>

    <MpBanner v-if="v.warning" id="pr-norun" variant="warning">
      <MpBannerIcon id="pr-norun-icon" />
      <MpBannerDescription>{{ v.warning }}</MpBannerDescription>
    </MpBanner>
    <MpBanner v-if="v.status === 'Out of date'" id="pr-ood" variant="danger">
      <MpBannerIcon id="pr-ood-icon" />
      <MpBannerTitle>{{ t('Out of date') }}</MpBannerTitle>
      <MpBannerDescription>{{ t('Something changed after sign-off. The signed snapshot stays readable below. Explain the new rows and sign off again.') }}</MpBannerDescription>
    </MpBanner>

    <template v-if="section === 'payroll'">
      <div v-if="v.reconciling.length || v.oldSync.length" class="pr-card pr-pad">
        <span class="pr-title">{{ t('Reconciling items') }}</span>
        <div v-for="r in v.reconciling" :key="r.label" class="pr-line"><span>{{ r.label }}</span><span class="pr-num">{{ rupiah(r.amount) }}</span></div>
        <div v-for="o in v.oldSync" :key="o.id" class="pr-line pr-warn">
          <span>{{ t('Old Talenta Expense sync') }} {{ dateLabel(o.date) }} ({{ t(o.outcome) }}): {{ o.message }}</span>
          <span class="pr-num">{{ rupiah(o.amount) }}</span>
        </div>
      </div>

      <PayrollReconChecks :month="month" />

      <div class="pr-sub-bar">
        <MpSegmentedControl id="pr-by" v-model="by" name="pr-by" :data="byOptions" />
      </div>
      <template v-if="by === 'account'">
        <PayrollReconTable :title="t('Expense by account and tag')" :first-column="t('Account and tag')" :rows="v.accountRows" :highlight="highlight" @note="openNote" @confirm="confirmNote" />
        <PayrollReconTable :title="t('Payables')" :first-column="t('Payable')" :rows="v.payableRows" :highlight="highlight" @note="openNote" @confirm="confirmNote" />
      </template>
      <PayrollReconTable v-else :title="t('By pay item')" :first-column="t('Pay item')" :rows="v.payItemRows" :highlight="highlight" @note="openNote" @confirm="confirmNote" />

      <div v-if="v.manual.length" class="pr-card">
        <div class="pr-head"><span class="pr-title">{{ t('Manual entries') }}</span></div>
        <table class="pr-table">
          <thead><tr><th>{{ t('Entry') }}</th><th>{{ t('Date') }}</th><th>{{ t('Account') }}</th><th>{{ t('Memo') }}</th><th class="pr-r">{{ t('Debit') }}</th><th class="pr-r">{{ t('Credit') }}</th></tr></thead>
          <tbody>
            <tr v-for="e in v.manual" :key="e.id">
              <td>{{ e.number }}</td><td>{{ dateLabel(e.date) }}</td>
              <td>{{ e.account }}<span v-if="e.tags.Organization || e.tags.Branch" class="pr-sub">{{ [e.tags.Organization, e.tags.Branch].filter(Boolean).join(', ') }}</span></td>
              <td>{{ e.memo }}</td><td class="pr-r">{{ rupiah(e.debit) }}</td><td class="pr-r">{{ rupiah(e.credit) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pr-card pr-pad">
        <span class="pr-title">{{ t('Sign-off') }}</span>
        <template v-if="v.signOff">
          <p class="pr-body">{{ t('Signed off by') }} {{ v.signOff.by }} · {{ wib(v.signOff.at) }} · {{ t('HR confirmation ticked by') }} {{ v.signOff.hrConfirmedBy }}</p>
          <p v-if="v.reSignOff" class="pr-body">{{ t('Signed off again by') }} {{ v.reSignOff.by }} · {{ wib(v.reSignOff.at) }}</p>
          <p v-if="snapshot" class="pr-sub">
            {{ t('Snapshot') }}: {{ (snapshot.versions ?? []).map((x) => `${x.run} v${x.version ?? '-'}`).join('; ') }} · {{ t('journals') }} {{ (snapshot.journals ?? []).join(', ') }}
          </p>
        </template>
        <p v-else-if="v.readyBy" class="pr-body">{{ t('Ready for sign-off, set by') }} {{ v.readyBy }}</p>
        <p v-else class="pr-sub">{{ t('Not ready for sign-off') }}</p>

        <div v-if="can('recon.ready') && !v.signOff && !v.readyBy" class="pr-actions">
          <MpButton is-rounded @click="ready">{{ t('Ready for sign-off') }}</MpButton>
        </div>
        <template v-if="can('recon.signoff') && (v.status === 'Ready for sign-off' || v.status === 'Out of date')">
          <label class="pr-check">
            <MpCheckbox id="pr-hr" :is-checked="hrConfirmed" @change="() => (hrConfirmed = !hrConfirmed)" />
            <span>{{ t('HR confirmed no payroll changes after the last send') }}</span>
          </label>
          <div class="pr-actions"><MpButton is-rounded @click="doSignOff">{{ t('Sign off') }}</MpButton></div>
        </template>
        <p v-if="signError" class="pr-err">{{ signError }}</p>
        <p v-for="w in signWarnings" :key="w" class="pr-warn">{{ t('Still open') }}: {{ w }}</p>
      </div>
    </template>

    <PayrollPph21Panel v-else :month="month" />

    <PayrollPayDrawer v-model:is-open="noteOpen" :title="t('Variance note')">
      <template v-if="noteRow">
        <p class="pr-body">{{ noteRow.label }} · {{ t('variance') }} {{ rupiah(noteRow.variance) }}</p>
        <MpFormControl id="pr-note-reason" is-required>
          <MpFormLabel>{{ t('Reason') }}</MpFormLabel>
          <ErpFilterSelect id="pr-note-reason-select" :model-value="noteReason" :placeholder="t('Select reason')" :options="REASONS.map((r) => ({ value: r, label: t(r) }))" :is-clearable="false" width="100%" @update:model-value="(x: string) => (noteReason = x)" />
        </MpFormControl>
        <MpFormControl id="pr-note-text" is-required :is-invalid="!!noteError">
          <MpFormLabel>{{ t('Note') }}</MpFormLabel>
          <MpTextarea id="pr-note-text-input" v-model="noteText" />
          <MpFormErrorMessage>{{ noteError }}</MpFormErrorMessage>
        </MpFormControl>
      </template>
      <template #footer>
        <MpButton variant="ghost" is-rounded @click="noteOpen = false">{{ t('Cancel') }}</MpButton>
        <MpButton is-rounded @click="saveNote">{{ t('Save note') }}</MpButton>
      </template>
    </PayrollPayDrawer>
    <PayrollReconManualEntry v-model:is-open="manualOpen" :month="month" />
  </div>
</template>

<style scoped>
.pr { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.pr-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.pr-bar-left, .pr-bar-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.pr-sub-bar { display: flex; }

.stats-section { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.stat-card { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding-right: var(--mp-spacing-6); align-self: stretch; }
.stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.stat-title { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); white-space: nowrap; }
.stat-period { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); white-space: nowrap; }
.stat-amount { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl, 32px); white-space: nowrap; }
.stat-amount--danger { color: var(--mp-text-danger); }
.stat-link { display: inline-flex; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); line-height: var(--mp-line-heights-md); cursor: pointer; padding: 0 var(--mp-spacing-0\.5); }
.stat-note { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md); }

.pr-card { border: 1px solid var(--mp-colors-border-default); border-radius: var(--mp-radii-md); overflow: hidden; }
.pr-pad { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); }
.pr-head { padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-colors-border-default); }
.pr-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default); }
.pr-line { display: flex; justify-content: space-between; gap: var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); }
.pr-num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.pr-body { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default); }
.pr-sub { display: block; margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
.pr-warn { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-warning); }
.pr-err { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.pr-actions { display: flex; gap: var(--mp-spacing-2); }
.pr-check { display: flex; align-items: center; font-size: var(--mp-font-sizes-md); cursor: pointer; }
.pr-table { width: 100%; border-collapse: collapse; }
.pr-table th { text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-secondary); background: var(--mp-colors-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-colors-border-default); }
.pr-table td { font-size: var(--mp-font-sizes-md); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-colors-border-default); vertical-align: top; }
.pr-table tr:last-child td { border-bottom: 0; }
.pr-table .pr-r { text-align: right; font-variant-numeric: tabular-nums; }
</style>
