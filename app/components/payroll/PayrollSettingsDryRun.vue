<script setup lang="ts">
/**
 * Dry run (OD-10): pick a past period Talenta has sent and see the journal it
 * would post on the current settings, the totals against Talenta's own run
 * totals, the groups, the issues that would hold it and the account-class split
 * against the old route. Posts nothing. Results stay listed with the settings
 * version that built them, so a re-run after a fix shows what moved.
 */
import { computed, ref, watch } from 'vue'
import { MpButton } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { successToast, infoToast } from '~/utils/toasts'
import { loadSnapshot, saveSnapshot } from '~/data/persist'
import {
  payroll, runs, runById, can, previewDryRun, markDryRunPassed, signOffDryRun, currentSnapshotId, snapshotById,
  accountLabel, tagsLabel, rupiah, wib, periodLabel, dateLabel,
} from '~/data/payrollStore'
import { dryRunReport, resultChanges, runOptionLabel, nextPayNumberPreview, sendOf, type DryRunResult } from '~/data/payrollUiSettings'

const emit = defineEmits<{ (e: 'go', key: 'pay-items' | 'groups' | 'accounts' | 'cut-over'): void }>()
const { t } = useLocale()

// Results survive a reload. Reset sample data rewinds the clock and the settings history, so a
// result built after the current clock or on a settings version that no longer exists drops out.
const KEY = 'payroll:settings-dryruns-v1'
const live = (r: DryRunResult) => !!runById(r.runId) && r.at <= payroll.clock && !!snapshotById(r.snapshotId)
const results = ref<DryRunResult[]>((loadSnapshot<DryRunResult>(KEY) ?? []).filter(live))
watch(results, (v) => saveSnapshot(KEY, v), { deep: true })
watch(() => [payroll.runs.length, payroll.snapshots.length, payroll.clock], () => { results.value = results.value.filter(live) })

const runOptions = computed(() => runs.value.filter((r) => !!sendOf(r)).map((r) => ({ value: r.id, label: runOptionLabel(r) })))
const defaultRun = computed(() => runs.value.find((r) => r.mode !== 'Live' && sendOf(r)) ?? runs.value.find((r) => r.ledgerVersion != null) ?? runs.value[0])
const runId = ref<string>(defaultRun.value?.id ?? '')
const run = computed(() => runById(runId.value))
const history = computed(() => results.value.filter((r) => r.runId === runId.value).slice().reverse())
const current = computed(() => history.value[0] ?? null)
const previous = computed(() => history.value[1] ?? null)
const report = computed(() => (run.value && current.value ? dryRunReport(run.value, current.value) : null))
const settingsChanged = computed(() => !!current.value && current.value.snapshotId !== currentSnapshotId())
const moved = computed(() => (current.value && previous.value ? resultChanges(previous.value.draft?.lines ?? [], current.value.draft?.lines ?? []) : []))

function onRun() {
  if (!runId.value) { infoToast(t('Pick a period first')); return }
  const r = previewDryRun(runId.value)
  if (!r.ok) return
  results.value.push({ runId: runId.value, versionNo: r.versionNo, at: r.at, snapshotId: r.snapshotId, holds: r.holds.map((h) => ({ code: h.code, message: h.message })), draft: r.draft })
  successToast(t(r.holds.length ? `Dry run built. Would hold: ${r.holds.length} issue${r.holds.length > 1 ? 's' : ''}.` : 'Dry run built. Nothing would hold it.'))
}

/** Where each hold is fixed. */
const FIX: Record<string, { tab: 'pay-items' | 'groups' | 'accounts' | 'cut-over'; label: string }> = {
  'unmapped-item': { tab: 'pay-items', label: 'Map pay items' },
  'unmapped-group': { tab: 'groups', label: 'Map groups' },
  'new-field-value': { tab: 'groups', label: 'Review rule values' },
  'empty-field': { tab: 'groups', label: 'Empty-field policy' },
  'hutang-gaji': { tab: 'pay-items', label: 'Check pay items' },
  'two-parties': { tab: 'accounts', label: 'Check party labels' },
  'archived-account': { tab: 'accounts', label: 'Check accounts' },
  'tax-rule': { tab: 'accounts', label: 'Check tax presets' },
}

// Passed and sign-off are recorded on runs Talenta sent before a first live period.
const dr = computed(() => run.value?.dryRun ?? null)
const actError = ref('')
function onPassed() {
  const r = markDryRunPassed(runId.value)
  actError.value = r.ok ? '' : t(r.message ?? '')
  if (r.ok) successToast(t('Dry run marked Passed. A Finance Manager signs off.'))
}
function onSignOff() {
  const r = signOffDryRun(runId.value)
  actError.value = r.ok ? '' : t(r.message ?? '')
  if (r.ok) successToast(t('Setup signed off'))
}
// Cut-over decisions are not setup changes; only mapping, account, group and rule saves count.
const changedSinceSignOff = computed(() => !!dr.value?.signedOffAt && payroll.snapshots.some((s) => s.at > dr.value!.signedOffAt! && !/^(First live period|Old sync control)/.test(s.note)))

const hrText = computed(() => run.value ? `In Talenta, open the salary detail page for ${periodLabel(run.value.start, run.value.end)} and click Send to Jurnal. Jurnal receives it as a dry run and posts nothing.` : '')
function copyHrText() {
  void navigator.clipboard?.writeText(hrText.value).catch(() => undefined)
  successToast(t('Copied'))
}
const varianceClass = (n: number) => (n ? 'pset-danger' : 'pset-ok')
</script>

<template>
  <div class="pset-stack">
    <div class="pset-bar">
      <div class="pset-bar__left">
        <ErpFilterSelect id="pset-dr-run" v-model="runId" :placeholder="t('Pick a period')" :options="runOptions" width="360px" :is-clearable="false" @update:model-value="actError = ''" />
        <MpButton is-rounded @click="onRun">{{ t(current ? 'Re-run with current settings' : 'Run dry run') }}</MpButton>
      </div>
      <div class="pset-bar__right">
        <span class="pset-muted">{{ t('Posts nothing') }}</span>
      </div>
    </div>

    <div v-if="run" class="pset-note">
      <span>{{ t(hrText) }}</span>
      <MpButton size="sm" variant="secondary" is-rounded @click="copyHrText">{{ t('Copy for HR') }}</MpButton>
    </div>

    <!-- Passed and sign-off (runs received before a first live period) -->
    <div v-if="run && dr" class="pset-card">
      <div class="pset-card__head">
        <div>
          <div class="pset-card__title">{{ t('Dry run sign-off') }}</div>
          <div class="pset-card__sub">{{ periodLabel(run.start, run.end) }} · {{ t(run.mode) }}</div>
        </div>
        <div class="pset-card__actions">
          <MpButton v-if="can('dryrun.pass') && !dr.passedBy" variant="secondary" is-rounded @click="onPassed">{{ t('Mark Passed') }}</MpButton>
          <MpButton v-if="can('dryrun.signoff') && dr.passedBy && !dr.signedOffBy" is-rounded @click="onSignOff">{{ t('Sign off') }}</MpButton>
        </div>
      </div>
      <div class="pset-card__body">
        <div class="pset-kv">
          <span class="pset-kv__k">{{ t('Passed') }}</span>
          <span class="pset-kv__v">{{ dr.passedBy ? `${dr.passedBy} · ${wib(dr.passedAt!)}` : t('Not yet') }}</span>
          <span class="pset-kv__k">{{ t('Signed off') }}</span>
          <span class="pset-kv__v">{{ dr.signedOffBy ? `${dr.signedOffBy} · ${wib(dr.signedOffAt!)}` : t('Not yet') }}</span>
        </div>
        <div v-if="changedSinceSignOff" class="pset-note pset-note--warn">{{ t('Settings changed since sign-off. Run a new dry run before go-live.') }}</div>
        <p v-if="actError" class="pset-error">{{ actError }}</p>
      </div>
    </div>
    <p v-else-if="actError" class="pset-error">{{ actError }}</p>

    <div v-if="!current" class="pset-card">
      <div class="pset-card__body"><p class="pset-hint">{{ t('Pick a period Talenta has sent and run a dry run to see the journal it would post on the current settings.') }}</p></div>
    </div>

    <template v-if="current && report && run">
      <div class="stats-section">
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Would hold') }}</div>
          <div class="stat-period">{{ t('Checks a live run must pass') }}</div>
          <div class="stat-amount" :class="current.holds.length ? 'pset-danger' : ''">{{ current.holds.length }} {{ t(current.holds.length === 1 ? 'issue' : 'issues') }}</div>
        </div>
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Journal total') }}</div>
          <div class="stat-period">{{ t(`Dated ${dateLabel(run.end)} · ${nextPayNumberPreview()} if posted`) }}</div>
          <div class="stat-amount">{{ rupiah(report.debit) }}</div>
        </div>
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Staff in the journal') }}</div>
          <div class="stat-period">{{ t(`Version ${current.versionNo} sent ${wib(report.send.sentAt)}`) }}</div>
          <div class="stat-amount">{{ report.staff }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-title">{{ t('Built with') }}</div>
          <div class="stat-period">{{ wib(current.at) }}</div>
          <div class="stat-amount">{{ t(`Settings ${current.snapshotId}`) }}</div>
          <span v-if="settingsChanged" class="stat-link" @click="onRun">{{ t('Settings changed. Re-run with latest settings') }}</span>
        </div>
      </div>

      <!-- Issues -->
      <div class="pset-card">
        <div class="pset-card__head"><div class="pset-card__title">{{ t(current.holds.length ? `Would hold: ${current.holds.length} issue${current.holds.length > 1 ? 's' : ''}` : 'Nothing would hold this run') }}</div></div>
        <table v-if="current.holds.length" class="pset-table">
          <tbody>
            <tr v-for="(h, i) in current.holds" :key="i">
              <td class="pset-td">{{ t(h.message) }}</td>
              <td class="pset-td pset-td--act">
                <span v-if="FIX[h.code]" class="pset-link" @click="emit('go', FIX[h.code]!.tab)">{{ t(FIX[h.code]!.label) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Totals against Talenta -->
      <div class="pset-card">
        <div class="pset-card__head">
          <div>
            <div class="pset-card__title">{{ t("Totals against Talenta's run totals") }}</div>
            <div class="pset-card__sub">
              {{ report.basis.includesEmployer === null
                ? t(`total_deductions ${rupiah(report.basis.talenta)} matches neither basis: ${rupiah(report.basis.withEmployer)} with employer contributions, ${rupiah(report.basis.withoutEmployer)} without.`)
                : t(`total_deductions ${report.basis.includesEmployer ? 'includes' : 'leaves out'} employer contributions (${rupiah(report.basis.talenta)}). The total check uses the ${payroll.settings.deductionsBasis === 'with-employer' ? 'with' : 'without'}-employer basis.`) }}
            </div>
          </div>
        </div>
        <table class="pset-table">
          <thead>
            <tr>
              <th class="pset-th">{{ t('Total') }}</th>
              <th class="pset-th pset-th--num">{{ t('Jurnal lines') }}</th>
              <th class="pset-th pset-th--num">{{ t('Talenta') }}</th>
              <th class="pset-th pset-th--num">{{ t('Variance') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in report.totals" :key="r.label">
              <td class="pset-td">{{ t(r.label) }}</td>
              <td class="pset-td pset-td--num">{{ rupiah(r.lines) }}</td>
              <td class="pset-td pset-td--num">{{ rupiah(r.talenta) }}</td>
              <td class="pset-td pset-td--num" :class="varianceClass(r.variance)">{{ rupiah(r.variance) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Would-be journal -->
      <div class="pset-card">
        <div class="pset-card__head">
          <div>
            <div class="pset-card__title">{{ t('Journal it would post') }}</div>
            <div class="pset-card__sub">{{ current.draft?.memo ?? t('No journal: the issues above stop the build.') }}</div>
          </div>
          <ErpStatusBadge v-if="current.draft" :status="report.balanced ? 'completed' : 'error'" :label="t(report.balanced ? 'Balanced' : `Not balanced by ${rupiah(Math.abs(report.debit - report.credit))}`)" />
        </div>
        <table v-if="current.draft" class="pset-table">
          <thead>
            <tr>
              <th class="pset-th">{{ t('Account') }}</th>
              <th class="pset-th">{{ t('Tags') }}</th>
              <th class="pset-th pset-th--num">{{ t('Debit') }}</th>
              <th class="pset-th pset-th--num">{{ t('Credit') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(l, i) in current.draft.lines" :key="i">
              <td class="pset-td">{{ accountLabel(l.account) }}<span class="pset-line">{{ l.why[0] }}</span></td>
              <td class="pset-td">{{ tagsLabel(l.tags) }}</td>
              <td class="pset-td pset-td--num">{{ l.debit ? rupiah(l.debit) : '' }}</td>
              <td class="pset-td pset-td--num">{{ l.credit ? rupiah(l.credit) : '' }}</td>
            </tr>
            <tr class="pset-tr--total">
              <td class="pset-td" colspan="2">{{ t('Total') }}</td>
              <td class="pset-td pset-td--num">{{ rupiah(report.debit) }}</td>
              <td class="pset-td pset-td--num">{{ rupiah(report.credit) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Changes since the last result -->
      <div v-if="previous" class="pset-card">
        <div class="pset-card__head">
          <div>
            <div class="pset-card__title">{{ t('Changes since last result') }}</div>
            <div class="pset-card__sub">{{ t(`Settings ${previous.snapshotId} at ${wib(previous.at)} against settings ${current.snapshotId}`) }}</div>
          </div>
        </div>
        <table class="pset-table">
          <thead>
            <tr>
              <th class="pset-th">{{ t('Account') }}</th>
              <th class="pset-th">{{ t('Tags') }}</th>
              <th class="pset-th pset-th--num">{{ t('Before') }}</th>
              <th class="pset-th pset-th--num">{{ t('Now') }}</th>
              <th class="pset-th pset-th--num">{{ t('Moved') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!moved.length"><td class="pset-td pset-muted" colspan="5">{{ t('No line moved.') }}</td></tr>
            <tr v-for="m in moved" :key="`${m.account}|${m.tags}`">
              <td class="pset-td">{{ accountLabel(m.account) }}</td>
              <td class="pset-td">{{ m.tags }}</td>
              <td class="pset-td pset-td--num">{{ rupiah(m.old) }}</td>
              <td class="pset-td pset-td--num">{{ rupiah(m.now) }}</td>
              <td class="pset-td pset-td--num">{{ rupiah(m.diff) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Groups -->
      <div class="pset-card">
        <div class="pset-card__head"><div class="pset-card__title">{{ t('Groups: headcount and cost by account and tag') }}</div></div>
        <table class="pset-table">
          <thead>
            <tr>
              <th class="pset-th">{{ t('Account') }}</th>
              <th class="pset-th">{{ t('Tags') }}</th>
              <th class="pset-th pset-th--num">{{ t('Staff') }}</th>
              <th class="pset-th pset-th--num">{{ t('Cost') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!report.groups.length"><td class="pset-td pset-muted" colspan="4">{{ t('No expense lines.') }}</td></tr>
            <tr v-for="g in report.groups" :key="`${g.account}|${g.tags}`">
              <td class="pset-td">{{ accountLabel(g.account) }}</td>
              <td class="pset-td">{{ g.tags }}</td>
              <td class="pset-td pset-td--num">{{ g.staff }}</td>
              <td class="pset-td pset-td--num">{{ rupiah(g.amount) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Old route comparison -->
      <div class="pset-card">
        <div class="pset-card__head">
          <div>
            <div class="pset-card__title">{{ t('Against the old route') }}</div>
            <div class="pset-card__sub">{{ t('The old sync books each run as one Expense. This setup splits cost by account.') }}</div>
          </div>
        </div>
        <table class="pset-table">
          <thead>
            <tr>
              <th class="pset-th">{{ t('Account class') }}</th>
              <th class="pset-th pset-th--num">{{ t('Old route') }}</th>
              <th class="pset-th pset-th--num">{{ t('This setup') }}</th>
              <th class="pset-th pset-th--num">{{ t('Change') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in report.classes" :key="c.label">
              <td class="pset-td">{{ t(c.label) }}</td>
              <td class="pset-td pset-td--num">{{ rupiah(c.oldRoute) }}</td>
              <td class="pset-td pset-td--num">{{ rupiah(c.setup) }}</td>
              <td class="pset-td pset-td--num">{{ t(`${c.label} ${c.change > 0 ? 'up' : c.change < 0 ? 'down' : 'unchanged'}`) }}<template v-if="c.change"> {{ rupiah(Math.abs(c.change)) }}</template></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- History -->
      <div class="pset-card">
        <div class="pset-card__head"><div class="pset-card__title">{{ t('Results for this period') }}</div></div>
        <table class="pset-table">
          <thead>
            <tr>
              <th class="pset-th">{{ t('Built') }}</th>
              <th class="pset-th">{{ t('Settings') }}</th>
              <th class="pset-th pset-th--num">{{ t('Would hold') }}</th>
              <th class="pset-th pset-th--num">{{ t('Journal total') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(h, i) in history" :key="i">
              <td class="pset-td">{{ wib(h.at) }}</td>
              <td class="pset-td">{{ h.snapshotId }}<span v-if="i === 0" class="pset-line">{{ t('Shown above') }}</span></td>
              <td class="pset-td pset-td--num">{{ h.holds.length }}</td>
              <td class="pset-td pset-td--num">{{ rupiah((h.draft?.lines ?? []).reduce((s, l) => s + l.debit, 0)) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
