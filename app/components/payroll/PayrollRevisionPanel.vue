<script setup lang="ts">
/**
 * Revisions and corrections for one payroll run (PRD FG-4: TS-07, OD-14..OD-17).
 * Mounted in the run record. Shows the Revised notice with "Compare and fix", early warnings,
 * the run's PAY journals with Reverse (whole chain, TN-21), "Reversed, not reposted", the
 * version compare and the PPh 21 amendment tasks. Actions a role may not take are hidden.
 */
import { MpIcon, MpBadge } from '@mekari/pixel3'
import PayrollCompareView from '~/components/payroll/PayrollCompareView.vue'
import PayrollCompareFixDrawer from '~/components/payroll/PayrollCompareFixDrawer.vue'
import PayrollReverseDrawer from '~/components/payroll/PayrollReverseDrawer.vue'
import PayrollWarningList from '~/components/payroll/PayrollWarningList.vue'
import PayrollAmendmentTasks from '~/components/payroll/PayrollAmendmentTasks.vue'
import {
  runById, journalsOf, liveJournals, journalById, journalTotals, versionOf, currentVersionOf, versionLabel, runStatus, postRun, draftOf,
  can, isLocked, firstOpenAfter, monthLabel, dateLabel, periodLabel, rupiah, wib, today, addDays, pph21Monthly, amendmentTasks,
  type Journal,
} from '~/data/payrollStore'
import type { TalentaPayload } from '~/data/payrollMaster'
import { successToast } from '~/utils/toasts'

const props = defineProps<{ runId: string }>()
const { t } = useLocale()

const run = computed(() => runById(props.runId))
const status = computed(() => (run.value ? runStatus(run.value) : null))
const live = computed(() => (run.value ? liveJournals(run.value.id) : []))
const ledgerV = computed(() => (run.value ? versionOf(run.value, run.value.ledgerVersion) : undefined))
const cur = computed(() => (run.value ? currentVersionOf(run.value) : undefined))
const locked = computed(() => !!run.value && isLocked(run.value.month))
const sign = (n: number) => (n >= 0 ? `+${rupiah(n)}` : rupiah(n))

// ── Revised notice (OD-14) ──────────────────────────────────────────────────
const thp = (p: TalentaPayload) => p.employees.reduce((s, e) => s + e.take_home_pay, 0)
const pph = (p: TalentaPayload) => p.employees.reduce((s, e) => s + e['PPh 21 Benefit'] + e['PPh 21 Payment'] - e['Total PPh 21 DTP Received'], 0)
const partial = computed(() => run.value?.versions.find((v) => v.state === 'partial'))
const waiting = computed(() => run.value?.versions.find((v) => v.state === 'waiting-choice'))
const revised = computed(() => {
  const r = run.value, a = ledgerV.value, b = cur.value
  if (!r || !r.revised || !a || !b || a.no === b.no) return null
  return {
    from: a.no, to: b.no, sentAt: wib(b.sentAt),
    thp: Math.round(thp(b.payload) - thp(a.payload)),
    pph: Math.round(pph(b.payload) - pph(a.payload)),
    filed: pph21Monthly(r.month).ebupotFiled != null,
    superseded: r.versions.filter((v) => v.state === 'superseded').map((v) => `v${v.no}`),
  }
})
const partialText = computed(() => {
  const d = partial.value?.holds[0]?.details as { before?: number; after?: number } | undefined
  return partial.value && d ? `v${partial.value.no} holds ${d.after} of ${d.before} staff. Reverse and repost stays off until you pick Replace the full run or Reject.` : ''
})

// ── Reversed, not reposted (TN-20, TN-21) ───────────────────────────────────
function workingDaysSince(iso: string): number {
  let d = new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10)
  const end = today()
  let n = 0
  while (d < end) {
    d = addDays(d, 1)
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay()
    if (wd !== 0 && wd !== 6) n++
  }
  return n
}
const reversedNotReposted = computed(() => {
  const r = run.value
  if (!r || !r.reversedAt || live.value.length) return null
  const d = draftOf(r)
  return { at: wib(r.reversedAt), days: workingDaysSince(r.reversedAt), amount: d ? journalTotals(d).debit : 0 }
})
const repostError = ref('')
function repost() {
  repostError.value = ''
  const r = postRun(props.runId)
  if (!r.ok) { repostError.value = t(r.message ?? 'Nothing was posted.'); return }
  successToast(t(`${r.number} posted`))
}

// ── Journals ────────────────────────────────────────────────────────────────
const journals = computed(() => (run.value ? journalsOf(run.value.id).filter((j) => ['Payroll', 'Difference', 'Reversal'].includes(j.type)) : []))
function journalState(j: Journal): string {
  if (j.reversesId) return `Reverses ${journalById(j.reversesId)?.number ?? ''}`
  if (j.reversedById) return `Reversed by ${journalById(j.reversedById)?.number ?? ''}`
  return 'Live'
}

// ── Panels and drawers ──────────────────────────────────────────────────────
const fixOpen = ref(false)
const reverseOpen = ref(false)
const compareEl = ref<HTMLElement | null>(null)
function showCompare() { compareEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
const hasTasks = computed(() => amendmentTasks.value.some((x) => x.runId === props.runId))
const visible = computed(() => !!run.value && (run.value.versions.length > 1 || run.value.warnings.length > 0 || journals.value.length > 0 || hasTasks.value))
</script>

<template>
  <div v-if="run && visible" class="prp" data-testid="payroll-revision-panel">
    <!-- Revised notice -->
    <section v-if="revised" class="prp__notice prp__notice--warn" data-testid="prp-revised">
      <MpIcon name="warning-circular" size="md" />
      <div class="prp__noticebody">
        <div class="prp__noticetitle">
          {{ t('Revised') }}
          <MpBadge variant="subtle" variant-color="orange">{{ t(`v${revised.to} sent ${revised.sentAt}`) }}</MpBadge>
        </div>
        <div>{{ t(`Take-home pay ${sign(revised.thp)}. PPh 21 ${sign(revised.pph)}.`) }} {{ t(`v${revised.from} is still posted as ${live.map((j) => j.number).join(' and ')}; v${revised.to} can't post as a second full journal.`) }}</div>
        <div v-if="locked" class="prp__noticesub">{{ t(`${monthLabel(run.month)} is locked. The fix posts on ${dateLabel(`${firstOpenAfter(run.month)}-01`)} with a correction memo; the tax period stays ${monthLabel(run.month)}.`) }}</div>
        <div v-if="revised.filed" class="prp__noticesub">{{ t(`PPh 21 for ${monthLabel(run.month)} is filed. This change needs an amendment and can't be muted.`) }}</div>
        <div v-if="revised.superseded.length" class="prp__noticesub">{{ t(`${revised.superseded.join(', ')}: Superseded, not posted.`) }}</div>
        <div v-if="partialText" class="prp__noticesub">{{ t(partialText) }}</div>
      </div>
      <div class="prp__noticeactions">
        <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="showCompare">{{ t('Compare') }}</button>
        <button v-if="can('fix') && !partial" class="btn-enterprise btn-enterprise--primary" type="button" data-testid="prp-fix" @click="fixOpen = true">{{ t('Compare and fix') }}</button>
      </div>
    </section>

    <section v-else-if="waiting" class="prp__notice prp__notice--info" data-testid="prp-waiting">
      <MpIcon name="info" size="md" />
      <div class="prp__noticebody">
        <div class="prp__noticetitle">{{ t(`v${waiting.no} arrived for posted payroll ${periodLabel(run.start, run.end)}`) }}</div>
        <div>{{ t('Pick Revision of the posted run or Separate run under Holds. Compare shows what changed.') }}</div>
      </div>
    </section>

    <section v-else-if="partial && ledgerV" class="prp__notice prp__notice--warn" data-testid="prp-partial">
      <MpIcon name="warning-circular" size="md" />
      <div class="prp__noticebody">
        <div class="prp__noticetitle">{{ t('Looks partial') }}</div>
        <div>{{ t(partialText) }}</div>
      </div>
    </section>

    <!-- Reversed, not reposted -->
    <section v-if="reversedNotReposted" class="prp__notice prp__notice--danger" data-testid="prp-reversed">
      <MpIcon name="error" size="md" />
      <div class="prp__noticebody">
        <div class="prp__noticetitle">{{ t(`Reversed, not reposted: ${rupiah(reversedNotReposted.amount)}`) }}</div>
        <div>{{ t(`Reversed ${reversedNotReposted.at}. ${monthLabel(run.month)} sign-off and PPh 21 reconciliation stay blocked until the run posts again.`) }}</div>
        <div v-if="reversedNotReposted.days >= 2" class="prp__noticesub">{{ t(`${reversedNotReposted.days} working days without a repost. The run shows in the inbox.`) }}</div>
        <div v-if="repostError" class="prp__noticeerror" role="alert">{{ repostError }}</div>
      </div>
      <div v-if="can('post') && cur?.draft && status === 'Reversed'" class="prp__noticeactions">
        <button class="btn-enterprise btn-enterprise--primary" type="button" data-testid="prp-repost" @click="repost">{{ t(`Post v${cur.no}`) }}</button>
      </div>
    </section>

    <PayrollWarningList :run-id="runId" />

    <!-- Ledger journals -->
    <section v-if="journals.length" class="prp__card" data-testid="prp-journals" data-tour="payroll-run-journals">
      <div class="prp__cardhead">
        <div>
          <div class="prp__cardtitle">{{ t('Payroll journals') }}</div>
          <div class="prp__cardsub">
            {{ live.length ? t(`${live.length} live · the ledger reflects v${run.ledgerVersion}`) : t('No live journal') }}
          </div>
        </div>
        <button v-if="can('reverse') && live.length" class="btn-enterprise btn-enterprise--secondary" type="button" data-testid="prp-reverse" @click="reverseOpen = true">
          {{ live.length > 1 ? t(`Reverse all ${live.length}`) : t('Reverse') }}
        </button>
      </div>
      <div class="prp__scroll">
        <table class="prp__table">
          <thead>
            <tr>
              <th class="prp__th">{{ t('Journal') }}</th>
              <th class="prp__th">{{ t('Type') }}</th>
              <th class="prp__th">{{ t('Version') }}</th>
              <th class="prp__th">{{ t('Date') }}</th>
              <th class="prp__th">{{ t('Tax period') }}</th>
              <th class="prp__th">{{ t('Memo') }}</th>
              <th class="prp__th prp__num">{{ t('Total') }}</th>
              <th class="prp__th">{{ t('Status') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="j in journals" :key="j.id" :class="{ 'prp__tr--muted': j.reversedById || j.reversesId }">
              <td class="prp__td prp__nowrap">{{ j.number }}</td>
              <td class="prp__td prp__nowrap">{{ t(j.type) }}</td>
              <td class="prp__td">{{ `v${j.versionNo}` }}</td>
              <td class="prp__td prp__nowrap">{{ dateLabel(j.date) }}</td>
              <td class="prp__td prp__nowrap">{{ monthLabel(j.taxMonth) }}</td>
              <td class="prp__td">
                {{ j.memo }}
                <div v-if="j.correction" class="prp__rownote">{{ t(`Correction · reference ${j.reference}`) }}</div>
              </td>
              <td class="prp__td prp__num">{{ rupiah(journalTotals(j).debit) }}</td>
              <td class="prp__td prp__nowrap">{{ t(journalState(j)) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Version list and compare -->
    <section v-if="run.versions.length > 1" class="prp__card">
      <div class="prp__cardhead">
        <div>
          <div class="prp__cardtitle">{{ t('Versions') }}</div>
          <div class="prp__cardsub">{{ t(`${run.versions.length} sends for ${periodLabel(run.start, run.end)}`) }}</div>
        </div>
      </div>
      <div class="prp__scroll">
        <table class="prp__table">
          <thead>
            <tr>
              <th class="prp__th">{{ t('Version') }}</th>
              <th class="prp__th">{{ t('Sent') }}</th>
              <th class="prp__th">{{ t('Staff') }}</th>
              <th class="prp__th">{{ t('State') }}</th>
              <th class="prp__th">{{ t('Decision') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="v in run.versions" :key="v.no">
              <td class="prp__td">{{ `v${v.no}` }}</td>
              <td class="prp__td prp__nowrap">{{ wib(v.sentAt) }}</td>
              <td class="prp__td">{{ v.payload.employees.length }}</td>
              <td class="prp__td">{{ t(versionLabel(run, v)) }}</td>
              <td class="prp__td">{{ v.decision ? `${t(v.decision.kind)} · ${v.decision.by}` : '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div v-if="run.versions.length > 1" ref="compareEl">
      <PayrollCompareView :run-id="runId" />
    </div>

    <PayrollAmendmentTasks :run-id="runId" />

    <PayrollCompareFixDrawer :is-open="fixOpen" :run-id="runId" @close="fixOpen = false" />
    <PayrollReverseDrawer :is-open="reverseOpen" :run-id="runId" @close="reverseOpen = false" />
  </div>
</template>

<style scoped>
.prp { display: flex; flex-direction: column; gap: var(--mp-spacing-6); }
.prp__notice {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4); border-radius: var(--mp-radii-md); font-size: var(--mp-font-sizes-md);
}
.prp__notice--warn { background: var(--mp-colors-background-warning); color: var(--mp-colors-text-warning); }
.prp__notice--info { background: var(--mp-background-neutral-subtle); color: var(--mp-text-default); }
.prp__notice--danger { background: var(--mp-colors-background-danger); color: var(--mp-text-danger); }
.prp__noticebody { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.prp__noticetitle { display: flex; align-items: center; gap: var(--mp-spacing-2); font-weight: var(--mp-font-weights-semi-bold); }
.prp__noticesub { font-size: var(--mp-font-sizes-sm); }
.prp__noticeerror { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); }
.prp__noticeactions { flex: none; display: flex; gap: var(--mp-spacing-2); }
.prp__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; }
.prp__cardhead {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default);
}
.prp__cardtitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.prp__cardsub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.prp__scroll { overflow-x: auto; }
.prp__table { width: 100%; border-collapse: collapse; }
.prp__th {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; letter-spacing: 0.04em; color: var(--mp-text-secondary);
  background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.prp__td {
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); vertical-align: top;
}
.prp__table tbody tr:last-child .prp__td { border-bottom: 0; }
.prp__tr--muted .prp__td { color: var(--mp-text-secondary); }
.prp__num { text-align: right; white-space: nowrap; }
.prp__nowrap { white-space: nowrap; }
.prp__rownote { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
</style>
