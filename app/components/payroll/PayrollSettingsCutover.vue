<script setup lang="ts">
/**
 * Cut-over (OD-11, LR-14): the Accountant proposes the first live period, the
 * Finance Manager confirms it and picks Block or Flag for old-sync payroll
 * Expense calls. Runs before the first live period hold as Before go-live; a
 * month with a payroll journal blocks old-sync payroll in every mode.
 */
import { computed, ref } from 'vue'
import { MpButton, MpSegmentedControl } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { successToast, infoToast } from '~/utils/toasts'
import {
  payroll, can, proposeCutover, confirmCutover, setCutoverMode, monthLabel, rupiah, wib, dateLabel, today,
} from '~/data/payrollStore'
import { cutoverMonths, cutoverTimeline } from '~/data/payrollUiSettings'

const emit = defineEmits<{ (e: 'go', key: 'dry-run'): void }>()
const { t } = useLocale()
const router = useRouter()

const c = computed(() => payroll.settings.cutover)
const state = computed(() => !c.value.firstLive ? 'Not set' : c.value.confirmedBy ? 'Confirmed' : 'Waiting for the Finance Manager')

// Old sync history: the last month it booked payroll.
const passedPayroll = computed(() => payroll.oldSync.filter((o) => o.pattern === 'Payroll' && o.outcome !== 'Blocked'))
const lastOldMonth = computed(() => passedPayroll.value.map((o) => o.date.slice(0, 7)).sort().pop() ?? null)
const signedOffDryRun = computed(() => payroll.runs.find((r) => r.dryRun?.signedOffBy) ?? null)

const monthOptions = computed(() => cutoverMonths().map((m) => ({ value: m, label: monthLabel(m) })))
const pick = ref<string>(c.value.firstLive ?? today().slice(0, 7))
const proposeError = ref('')
/** VR-01 double booking and VR-02 gap, before the proposal goes out. */
const pickWarnings = computed(() => {
  const out: string[] = []
  const later = passedPayroll.value.filter((o) => o.date.slice(0, 7) >= pick.value)
  if (later.length) out.push(`The old sync already booked payroll dated ${monthLabel(pick.value)} or later: ${later.length} Expense${later.length > 1 ? 's' : ''}, ${rupiah(later.reduce((s, o) => s + o.amount, 0))}. Both routes would book those months.`)
  if (lastOldMonth.value) {
    let m = lastOldMonth.value, gap = 0
    while (gap < 24) { const [y, mm] = m.split('-').map(Number) as [number, number]; m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`; if (m >= pick.value) break; gap++ }
    if (gap > 0) out.push(`The old sync last booked ${monthLabel(lastOldMonth.value)}. ${gap} month${gap > 1 ? 's' : ''} before ${monthLabel(pick.value)} would have payroll from neither route.`)
  }
  if (c.value.confirmedBy && c.value.firstLive && pick.value !== c.value.firstLive) out.push(`Moving the first live period from ${monthLabel(c.value.firstLive)} needs the Finance Manager to confirm again.`)
  return out
})
function onPropose() {
  // OD11-US05 AC-01: the first live period cannot move past a posted PAY journal until it is reversed.
  const from = c.value.confirmedBy ? c.value.firstLive : null
  const past = from && pick.value > from ? payroll.journals.filter((j) => j.type === 'Payroll' && !j.reversedById && j.taxMonth >= from && j.taxMonth < pick.value) : []
  if (past.length) { proposeError.value = t(`${past.map((j) => j.number).join(', ')} ${past.length > 1 ? 'are' : 'is'} posted before ${monthLabel(pick.value)}. Reverse ${past.length > 1 ? 'them' : 'it'} first.`); return }
  const r = proposeCutover(pick.value)
  proposeError.value = r.ok ? '' : t(r.message ?? '')
  if (r.ok) successToast(t(`${monthLabel(pick.value)} sent to the Finance Manager for confirmation`))
}
const confirmError = ref('')
function onConfirm() {
  const r = confirmCutover()
  confirmError.value = r.ok ? '' : t(r.message ?? '')
  if (r.ok) successToast(t(`First live period ${monthLabel(c.value.firstLive!)} confirmed`))
}

const modeOptions = [{ id: 'pset-mode-block', label: 'Block', value: 'Block' }, { id: 'pset-mode-flag', label: 'Flag', value: 'Flag' }]
const mode = computed({
  get: () => c.value.mode,
  set: (v: 'Block' | 'Flag') => {
    if (v === c.value.mode) return
    const r = setCutoverMode(v)
    if (r.ok) successToast(t(v === 'Flag' ? 'Flag mode on for one period. Old-sync payroll posts and is flagged for review.' : 'Block mode on. Old-sync payroll is rejected.'))
    else infoToast(t(r.message ?? ''))
  },
})

const calls = computed(() => [...payroll.oldSync].reverse())
const blocked = computed(() => payroll.oldSync.filter((o) => o.outcome === 'Blocked'))
const timeline = computed(() => cutoverTimeline())
const outcomeType = (o: string) => (o === 'Blocked' ? 'critical' : o === 'Flagged' ? 'warning' : 'completed')
</script>

<template>
  <div class="pset-stack">
    <div class="stats-section">
      <div class="stat-card stat-card--bordered">
        <div class="stat-title">{{ t('First live period') }}</div>
        <div class="stat-period">{{ t(state) }}</div>
        <div class="stat-amount">{{ c.firstLive ? monthLabel(c.firstLive) : t('Not set') }}</div>
      </div>
      <div class="stat-card stat-card--bordered">
        <div class="stat-title">{{ t('Old-sync control') }}</div>
        <div class="stat-period">{{ t(c.mode === 'Flag' ? 'Lasts one period, then returns to Block' : 'Old-sync payroll Expense is rejected') }}</div>
        <div class="stat-amount">{{ t(c.mode) }}</div>
      </div>
      <div class="stat-card stat-card--bordered">
        <div class="stat-title">{{ t('Old-sync calls blocked') }}</div>
        <div class="stat-period">{{ c.firstLive ? t(`Since ${monthLabel(c.firstLive)}`) : t('No first live period') }}</div>
        <div class="stat-amount">{{ blocked.length }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">{{ t('Last month booked by the old sync') }}</div>
        <div class="stat-period">{{ t('Payroll Expense calls Jurnal let through') }}</div>
        <div class="stat-amount">{{ lastOldMonth ? monthLabel(lastOldMonth) : t('No old sync found') }}</div>
      </div>
    </div>

    <div class="pset-card">
      <div class="pset-card__head">
        <div>
          <div class="pset-card__title">{{ t('Go-live') }}</div>
          <div class="pset-card__sub">{{ t('A run belongs to the month of its end date. Runs before the first live period hold as Before go-live.') }}</div>
        </div>
        <ErpStatusBadge :status="state" :label="t(state)" :type="state === 'Confirmed' ? 'completed' : state === 'Not set' ? 'announcement' : 'warning'" />
      </div>
      <div class="pset-card__body">
        <div class="pset-kv">
          <span class="pset-kv__k">{{ t('Proposed by') }}</span>
          <span class="pset-kv__v">{{ c.proposedBy ?? t('Not yet') }}</span>
          <span class="pset-kv__k">{{ t('Confirmed by') }}</span>
          <span class="pset-kv__v">{{ c.confirmedBy ?? t('Not yet') }}</span>
          <span class="pset-kv__k">{{ t('Dry run signed off') }}</span>
          <span class="pset-kv__v">
            <template v-if="signedOffDryRun">{{ dateLabel(signedOffDryRun.end) }} {{ t('run') }} · {{ signedOffDryRun.dryRun!.signedOffBy }} · {{ wib(signedOffDryRun.dryRun!.signedOffAt!) }}</template>
            <span v-else class="pset-link" @click="emit('go', 'dry-run')">{{ t('No dry run signed off. Open Dry run') }}</span>
          </span>
        </div>

        <div v-if="can('cutover.propose')" class="pset-row">
          <div class="pset-field">
            <span class="pset-label">{{ t('First live period') }}</span>
            <ErpFilterSelect id="pset-co-month" v-model="pick" :placeholder="t('Month')" :options="monthOptions" width="100%" :is-clearable="false" @update:model-value="proposeError = ''" />
          </div>
          <MpButton is-rounded @click="onPropose">{{ t('Send for confirmation') }}</MpButton>
        </div>
        <div v-for="w in (can('cutover.propose') ? pickWarnings : [])" :key="w" class="pset-note pset-note--warn">{{ t(w) }}</div>
        <p v-if="proposeError" class="pset-error">{{ proposeError }}</p>

        <div v-if="can('cutover.confirm') && c.firstLive && !c.confirmedBy" class="pset-bar">
          <span class="pset-hint">{{ t(`${c.proposedBy} proposed ${monthLabel(c.firstLive)}. From 1 ${monthLabel(c.firstLive)} the payroll page posts and old-sync payroll is controlled.`) }}</span>
          <MpButton is-rounded @click="onConfirm">{{ t('Confirm') }}</MpButton>
        </div>
        <p v-if="confirmError" class="pset-error">{{ confirmError }}</p>

        <div v-if="can('cutover.confirm')" class="pset-field">
          <span class="pset-label">{{ t('Old-sync payroll Expense from the first live period') }}</span>
          <div><MpSegmentedControl id="pset-co-mode" v-model="mode" name="pset-co-mode" :data="modeOptions" /></div>
          <span class="pset-muted">{{ t('Claims stay on the old route in both modes. Payroll for a month already in Jurnal is blocked in both modes.') }}</span>
        </div>
      </div>
    </div>

    <!-- Timeline -->
    <div class="pset-card">
      <div class="pset-card__head"><div class="pset-card__title">{{ t('Months by route') }}</div></div>
      <table class="pset-table">
        <thead>
          <tr>
            <th class="pset-th">{{ t('Month') }}</th>
            <th class="pset-th">{{ t('Route') }}</th>
            <th class="pset-th">{{ t('Talenta runs') }}</th>
            <th class="pset-th">{{ t('Old-sync payroll calls') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!timeline.length"><td class="pset-td pset-muted" colspan="4">{{ t('No sends yet.') }}</td></tr>
          <tr v-for="m in timeline" :key="m.month">
            <td class="pset-td pset-td--strong">{{ m.label }}<span v-if="m.warning" class="pset-line pset-warn">{{ t(m.warning) }}</span></td>
            <td class="pset-td">{{ t(m.route) }}</td>
            <td class="pset-td">
              <template v-if="m.runs.length">
                <span v-for="r in m.runs" :key="r.id" class="pset-runline"><span class="pset-link" @click="router.push(`/payroll-runs/${r.id}`)">{{ r.label }}</span> · {{ t(r.status) }}<template v-if="r.journal"> · {{ r.journal }}</template></span>
              </template>
              <span v-else class="pset-muted">{{ t('None') }}</span>
            </td>
            <td class="pset-td">
              <span v-if="!m.oldSync.passed && !m.oldSync.blocked && !m.oldSync.flagged" class="pset-muted">{{ t('None') }}</span>
              <template v-else>{{ [m.oldSync.passed ? `${m.oldSync.passed} passed` : '', m.oldSync.flagged ? `${m.oldSync.flagged} flagged` : '', m.oldSync.blocked ? `${m.oldSync.blocked} blocked` : ''].filter(Boolean).join(', ') }}</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Old-sync calls -->
    <div class="pset-card">
      <div class="pset-card__head">
        <div>
          <div class="pset-card__title">{{ t('Old-sync Expense calls') }}</div>
          <div class="pset-card__sub">{{ t('Expense API calls from the Talenta integration client and Talenta API tokens, checked against the cut-over.') }}</div>
        </div>
      </div>
      <table class="pset-table">
        <thead>
          <tr>
            <th class="pset-th">{{ t('Received') }}</th>
            <th class="pset-th">{{ t('Dated') }}</th>
            <th class="pset-th">{{ t('Type') }}</th>
            <th class="pset-th pset-th--num">{{ t('Amount') }}</th>
            <th class="pset-th">{{ t('Outcome') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!calls.length"><td class="pset-td pset-muted" colspan="5">{{ t('No old-sync calls received.') }}</td></tr>
          <tr v-for="o in calls" :key="o.id">
            <td class="pset-td">{{ wib(o.at) }}</td>
            <td class="pset-td">{{ dateLabel(o.date) }}</td>
            <td class="pset-td">{{ t(o.pattern) }}</td>
            <td class="pset-td pset-td--num">{{ rupiah(o.amount) }}</td>
            <td class="pset-td">
              <ErpStatusBadge :status="o.outcome" :label="t(o.outcome)" :type="outcomeType(o.outcome)" />
              <span class="pset-line">{{ t(o.message) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.pset-runline { display: block; }
</style>
