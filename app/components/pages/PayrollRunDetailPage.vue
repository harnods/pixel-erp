<script setup lang="ts">
/**
 * Payroll run record /payroll-runs/<id> (FG-2, FG-3). Header with run key, type
 * and versions; holds with their fixes in check order; the draft review (OD-12);
 * Post with the stale-draft and newer-version blocks and the Finance Manager
 * confirm (TN-24); the versions, posted PAY journals and the "Built with"
 * snapshot. Agent C's revision panel mounts in the marked slot.
 */
import { computed, ref, watch } from 'vue'
import { MpButton, MpTextlink, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem } from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import PayrollHoldsPanel from '~/components/payroll/PayrollHoldsPanel.vue'
import PayrollDraftReview from '~/components/payroll/PayrollDraftReview.vue'
import PayrollRunBuiltWith from '~/components/payroll/PayrollRunBuiltWith.vue'
import PayrollRunJournals from '~/components/payroll/PayrollRunJournals.vue'
// ── Slot for agent C (FG-4 revisions and corrections). Do not edit the panel here. ──
import PayrollRevisionPanel from '~/components/payroll/PayrollRevisionPanel.vue'
import {
  payroll, can, runById, runStatus, runHolds, currentVersionOf, versionLabel, draftOf, liveJournals, journalsOf, postRun,
  confirmPostAsFinanceManager, rebuildDraft, isDraftStale, draftReview, rupiah, wib, periodLabel, monthLabel, dateLabel,
  accountLabel, tagsLabel, isLocked, firstOpenAfter, type Tags,
} from '~/data/payrollStore'
import { statusType, versionFigures, needsFinanceConfirm } from '~/data/payrollUiIntake'
import { successToast, infoToast, errorToast } from '~/utils/toasts'

const props = defineProps<{ orderId?: string }>()
const { t } = useLocale()
const router = useRouter()
const route = useRoute()

const run = computed(() => runById(props.orderId))
const status = computed(() => (run.value ? runStatus(run.value) : null))
const v = computed(() => (run.value ? currentVersionOf(run.value) : undefined))
const draft = computed(() => (run.value ? draftOf(run.value) : null))
const holds = computed(() => (run.value ? runHolds(run.value) : []))
const live = computed(() => (run.value ? liveJournals(run.value.id) : []))
const allJournals = computed(() => (run.value ? journalsOf(run.value.id) : []))
const fig = computed(() => versionFigures(v.value))
const draftTotal = computed(() => (draft.value ? draft.value.lines.reduce((s, l) => s + l.debit, 0) : 0))
const liveTotal = computed(() => live.value.reduce((s, j) => s + j.lines.reduce((x, l) => x + l.debit, 0), 0))
const showRevisionSlot = computed(() => !!run.value && (run.value.versions.length > 1 || run.value.warnings.length > 0 || allJournals.value.length > 0))

type Tab = 'review' | 'versions' | 'journals' | 'built'
const tab = ref<Tab>('review')
const tabs = computed(() => [
  { key: 'review' as Tab, label: live.value.length && !draft.value ? 'Posted lines' : 'Draft review' },
  { key: 'versions' as Tab, label: `Versions (${run.value?.versions.length ?? 0})` },
  { key: 'journals' as Tab, label: `Journals (${allJournals.value.length})` },
  { key: 'built' as Tab, label: 'Built with' },
])
watch(() => props.orderId, () => { tab.value = 'review'; staleChanges.value = []; fmNeeded.value = false })

// ── Post ───────────────────────────────────────────────────────────────────
const canPostNow = computed(() => status.value === 'Ready to post' && !!draft.value && !draft.value.nothingToPost && !live.value.length)
const fmRequired = computed(() => !!run.value && canPostNow.value && needsFinanceConfirm(run.value.id))
const fmConfirmed = computed(() => !!draft.value?.fmConfirmedBy)
const stale = computed(() => !!run.value && isDraftStale(run.value.id))
const unnoted = computed(() => (run.value && draft.value ? draftReview(run.value.id).unnotedLargeChanges : 0))
const postOpen = ref(false)
const fmNeeded = ref(false)
const staleChanges = ref<{ key: string; account: string; tags: Tags; old: number; new: number; diff: number }[]>([])
const postError = ref('')
const postDescription = computed(() => {
  if (!run.value || !draft.value) return ''
  const locked = isLocked(run.value.month)
  const date = locked ? `${firstOpenAfter(run.value.month)}-01` : draft.value.date
  const parts = [
    `${t('Posts one PAY journal of')} ${rupiah(draftTotal.value)} ${t('dated')} ${dateLabel(date)}.`,
    locked ? `${monthLabel(run.value.month)} ${t('is locked, so it posts in the first open period with a run reference.')}` : '',
    unnoted.value ? `${unnoted.value} ${t(unnoted.value === 1 ? 'large change has no note.' : 'large changes have no note.')}` : '',
    t('A posted journal cannot be edited or deleted; the way back is reversal.'),
  ]
  return parts.filter(Boolean).join(' ')
})
function askPost() {
  postError.value = ''
  if (stale.value) { doPost(); return }
  postOpen.value = true
}
function doPost() {
  if (!run.value) return
  const r = postRun(run.value.id, { versionNo: v.value?.no })
  if (r.ok) {
    staleChanges.value = []; fmNeeded.value = false
    successToast(t(`Posted as ${r.number as string}`))
    for (const w of (r.warnings as string[] | undefined) ?? []) infoToast(t(w))
    tab.value = 'review'
    return
  }
  if (r.stale) { staleChanges.value = (r.changed as typeof staleChanges.value) ?? []; infoToast(t('Draft rebuilt on the current settings. Review and post again')); return }
  if (r.needsConfirm) { fmNeeded.value = true; postError.value = r.message ?? ''; return }
  postError.value = r.message ?? ''
  errorToast(t('Not posted'))
}
function fmConfirm() {
  if (!run.value) return
  const r = confirmPostAsFinanceManager(run.value.id)
  if (r.ok) { fmNeeded.value = false; postError.value = ''; successToast(t('Confirmed for posting')) }
  else infoToast(t(r.message ?? ''))
}
function rebuild() {
  if (!run.value) return
  const r = rebuildDraft(run.value.id)
  staleChanges.value = (r.changed as typeof staleChanges.value) ?? []
  successToast(t(staleChanges.value.length ? `Draft rebuilt. ${staleChanges.value.length} lines moved` : 'Draft rebuilt. No line moved'))
}
function notInPrototype() { infoToast(t('Not in this prototype')) }
function back() { router.push('/payroll-inbox') }
const lineLabel = (account: string, tags: Tags) => `${accountLabel(account)}${tagsLabel(tags) ? ` | ${tagsLabel(tags)}` : ''}`

// Deep links from notices: ?tab=compare is the revision panel's; anything else lands on the review.
watch(() => route.query.tab, (q) => { if (q === 'journals' || q === 'versions' || q === 'built') tab.value = q as Tab }, { immediate: true })
</script>

<template>
  <div v-if="run && v" class="prr">
    <header class="prr__bar">
      <div class="prr__barleft">
        <nav class="prr__crumbs">
          <MpTextlink id="prr-crumb" as="a" class="prr__crumb" @click.prevent="back">{{ t('Payroll inbox') }}</MpTextlink>
        </nav>
        <div class="prr__titlerow">
          <h1 class="prr__title">{{ t('Payroll') }} {{ periodLabel(run.start, run.end) }}<template v-if="run.kind !== 'Regular'"> · {{ run.kind }} {{ run.label }}</template></h1>
          <ErpStatusBadge :status="status ?? ''" :label="t(status ?? '')" :type="statusType(status ?? '')" size="md" badge-for="additionalInformation" />
        </div>
        <p class="prr__sub">
          {{ run.key }} · {{ t(run.kind) }} · v{{ v.no }} {{ t('of') }} {{ run.versions.length }} · {{ t('sent') }} {{ wib(v.sentAt) }} · {{ t('tax month') }} {{ monthLabel(run.month) }}
        </p>
        <p v-if="run.dryRun" class="prr__sub">
          {{ t(run.mode) }}<template v-if="run.dryRun.passedBy"> · {{ t('passed by') }} {{ run.dryRun.passedBy }}</template><template v-if="run.dryRun.signedOffBy"> · {{ t('signed off by') }} {{ run.dryRun.signedOffBy }}</template>
        </p>
      </div>
      <div class="prr__baractions">
        <MpButton v-if="can('post.confirm') && fmRequired && !fmConfirmed" variant="secondary" is-rounded @click="fmConfirm">{{ t('Confirm for posting') }}</MpButton>
        <MpPopover id="prr-more" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="secondary" is-rounded right-icon="chevrons-down">{{ t('Actions') }}</MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent class="erp-dropdown-menu">
            <MpPopoverList>
              <MpPopoverListItem v-if="draft && can('post')" @click="rebuild">{{ t('Rebuild draft') }}</MpPopoverListItem>
              <MpPopoverListItem v-if="draft && can('post')" @click="notInPrototype">{{ t('Submit for approval') }}</MpPopoverListItem>
              <MpPopoverListItem @click="notInPrototype">{{ t('Download review') }}</MpPopoverListItem>
              <MpPopoverListItem @click="tab = 'built'">{{ t('View built with') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
        <MpButton v-if="can('post') && canPostNow" is-rounded @click="askPost">{{ t('Post') }}</MpButton>
      </div>
    </header>

    <div class="prr__body">
      <!-- Headline figures: house stats band. -->
      <div class="stats-section" data-tour="payroll-run-stats">
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Take-home pay') }}</div>
          <div class="stat-period">{{ t('Talenta, v') }}{{ v.no }} · {{ fig.staff }} {{ t('staff') }}</div>
          <div class="stat-amount">{{ rupiah(fig.takeHome) }}</div>
        </div>
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Gross pay') }}</div>
          <div class="stat-period">{{ t('Allowances in the send') }}</div>
          <div class="stat-amount">{{ rupiah(fig.gross) }}</div>
        </div>
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Draft journal') }}</div>
          <div class="stat-period">{{ draft ? `${t('Built')} ${wib(draft.builtAt)}` : t('No draft while held') }}</div>
          <div class="stat-amount" :class="{ 'stat-amount--absent': !draft }">{{ draft ? rupiah(draftTotal) : t('Not built') }}</div>
          <a v-if="draft" class="stat-link" @click="tab = 'review'">{{ draft.lines.length }} {{ t('lines') }}</a>
        </div>
        <div class="stat-card">
          <div class="stat-title">{{ t('In the ledger') }}</div>
          <div class="stat-period">{{ live.length ? `${t('Posted')} v${run.ledgerVersion}` : t('Nothing posted') }}</div>
          <div class="stat-amount">{{ rupiah(liveTotal) }}</div>
          <a v-if="live.length" class="stat-link" @click="tab = 'journals'">{{ live.map((j) => j.number).join(', ') }}</a>
        </div>
      </div>

      <!-- Post feedback: blocks and the Finance Manager confirm (TN-24). -->
      <div v-if="postError || (fmRequired && !fmConfirmed && can('post'))" class="prr__notice">
        <div class="prr__noticetitle">{{ fmRequired && !fmConfirmed ? t('Finance Manager confirm needed') : t('Not posted') }}</div>
        <div>{{ postError || t('This draft has a guardrail override or settings changed since the last posted run. A Finance Manager confirms before posting.') }}</div>
      </div>
      <div v-if="fmRequired && fmConfirmed" class="prr__ok" data-tour="payroll-run-confirm">{{ t('Confirmed for posting by') }} {{ draft?.fmConfirmedBy }}</div>
      <div v-if="staleChanges.length" class="prr__card prr__stale">
        <div class="prr__cardhead">
          <div class="prr__cardtitle">{{ t('Lines moved by the rebuild') }}</div>
          <div class="prr__cardsub">{{ t('Settings changed since the draft was built. Review the moved lines and post again.') }}</div>
        </div>
        <table class="prr__table">
          <thead><tr><th class="prr__th">{{ t('Account and tag') }}</th><th class="prr__th prr__num">{{ t('Before') }}</th><th class="prr__th prr__num">{{ t('After') }}</th><th class="prr__th prr__num">{{ t('Difference') }}</th></tr></thead>
          <tbody>
            <tr v-for="c in staleChanges" :key="c.key">
              <td class="prr__td">{{ lineLabel(c.account, c.tags) }}</td>
              <td class="prr__td prr__num">{{ rupiah(c.old) }}</td>
              <td class="prr__td prr__num">{{ rupiah(c.new) }}</td>
              <td class="prr__td prr__num">{{ rupiah(c.diff) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Holds with their fixes, in check order. -->
      <PayrollHoldsPanel v-if="holds.length" :run-id="run.id" />

      <!-- ── Agent C slot: revisions, early warnings, reversal (FG-4). ── -->
      <PayrollRevisionPanel v-if="showRevisionSlot" :run-id="run.id" />

      <div class="prr__tabs" role="tablist">
        <button
          v-for="tb in tabs" :key="tb.key" type="button" class="prr__tab" :class="{ 'prr__tab--on': tab === tb.key }"
          role="tab" :aria-selected="tab === tb.key" @click="tab = tb.key"
        >{{ t(tb.label) }}</button>
      </div>

      <template v-if="tab === 'review'">
        <PayrollDraftReview v-if="draft" :run-id="run.id" />
        <PayrollRunJournals v-else-if="live.length" :run-id="run.id" only-live />
        <div v-else class="prr__card prr__empty">
          {{ holds.length ? t('No draft builds while the run is held. Fix the holds above.') : run.mode !== 'Live' ? t(`${run.mode}: nothing posts from this run.`) : t('No draft.') }}
        </div>
      </template>

      <div v-else-if="tab === 'versions'" class="prr__card">
        <table class="prr__table">
          <thead>
            <tr>
              <th class="prr__th">{{ t('Version') }}</th>
              <th class="prr__th">{{ t('Sent (WIB)') }}</th>
              <th class="prr__th">{{ t('Received (WIB)') }}</th>
              <th class="prr__th prr__num">{{ t('Staff') }}</th>
              <th class="prr__th prr__num">{{ t('Take-home pay') }}</th>
              <th class="prr__th">{{ t('State') }}</th>
              <th class="prr__th">{{ t('Decision') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="x in [...run.versions].reverse()" :key="x.no" :class="{ 'prr__current': x.no === run.currentVersion }">
              <td class="prr__td prr__strong">v{{ x.no }}</td>
              <td class="prr__td">{{ wib(x.sentAt) }}</td>
              <td class="prr__td">{{ wib(x.receivedAt) }}</td>
              <td class="prr__td prr__num">{{ versionFigures(x).staff }}</td>
              <td class="prr__td prr__num">{{ rupiah(versionFigures(x).takeHome) }}</td>
              <td class="prr__td"><ErpStatusBadge :status="versionLabel(run, x)" :label="t(versionLabel(run, x))" :type="statusType(versionLabel(run, x))" /></td>
              <td class="prr__td">
                <template v-if="x.decision">{{ x.decision.kind }}<span class="prr__muted"> · {{ x.decision.by }}<template v-if="x.decision.reason"> · {{ x.decision.reason }}</template></span></template>
                <template v-if="x.gapRelease"><div class="prr__muted">{{ t('Released with gap to') }} {{ accountLabel(x.gapRelease.target) }} · {{ x.gapRelease.by }} · {{ x.gapRelease.reason }}</div></template>
                <template v-if="x.taxRelease"><div class="prr__muted">{{ t('Tax hold released') }} · {{ x.taxRelease.by }} · {{ x.taxRelease.reason }}</div></template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <PayrollRunJournals v-else-if="tab === 'journals'" :run-id="run.id" />

      <PayrollRunBuiltWith v-else :snapshot-id="draft?.snapshotId ?? live[0]?.snapshotId ?? allJournals[allJournals.length - 1]?.snapshotId ?? null" />
    </div>

    <ConfirmModal
      v-model:is-open="postOpen"
      :title="`${t('Post payroll')} ${periodLabel(run.start, run.end)} v${v.no}`"
      :description="postDescription"
      :confirm-label="t('Post')"
      :is-danger="false"
      @confirm="doPost"
    />
  </div>
  <div v-else class="prr">
    <div class="prr__body">
      <div class="prr__card prr__empty">
        {{ t('This payroll run does not exist in this company.') }}
        <MpTextlink id="prr-missing-back" as="a" @click.prevent="back">{{ t('Back to Payroll inbox') }}</MpTextlink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.prr { display: flex; flex-direction: column; height: 100%; overflow: auto; }
.prr__bar {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4);
  flex: none; min-height: 72px; padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default);
}
.prr__barleft { display: flex; flex-direction: column; min-width: 0; }
.prr__crumbs { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.prr__crumb { font-size: var(--mp-font-sizes-sm); }
.prr__titlerow { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.prr__title { font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin: 0; }
.prr__sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: var(--mp-spacing-1) 0 0; overflow-wrap: anywhere; }
.prr__baractions { flex: none; display: flex; gap: var(--mp-spacing-2); align-items: center; }
.prr__body { padding: var(--mp-spacing-6); }

.prr__notice {
  padding: var(--mp-spacing-3) var(--mp-spacing-4); margin-bottom: var(--mp-spacing-5); border-radius: var(--mp-radii-md);
  background: var(--mp-colors-background-warning); color: var(--mp-colors-text-warning); font-size: var(--mp-font-sizes-md);
}
.prr__noticetitle { font-weight: var(--mp-font-weights-semi-bold); margin-bottom: var(--mp-spacing-1); }
.prr__ok {
  padding: var(--mp-spacing-3) var(--mp-spacing-4); margin-bottom: var(--mp-spacing-5); border-radius: var(--mp-radii-md);
  background: var(--mp-colors-background-success); color: var(--mp-colors-text-success); font-size: var(--mp-font-sizes-md);
}
.prr__stale { margin-bottom: var(--mp-spacing-5); }

.prr__tabs { display: flex; gap: var(--mp-spacing-5); border-bottom: 1px solid var(--mp-border-default); margin-bottom: var(--mp-spacing-4); }
.prr__tab {
  border: 0; background: transparent; cursor: pointer; padding: var(--mp-spacing-2) 0; font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary); border-bottom: 2px solid transparent;
}
.prr__tab--on { color: var(--mp-text-selected); font-weight: var(--mp-font-weights-semi-bold); border-bottom-color: var(--mp-text-selected); }

.prr__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; }
.prr__empty { padding: var(--mp-spacing-4); color: var(--mp-text-secondary); display: flex; gap: var(--mp-spacing-2); }
.prr__cardhead { padding: var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.prr__cardtitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.prr__cardsub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.prr__table { width: 100%; border-collapse: collapse; }
.prr__th {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase;
  color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-1) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default);
}
.prr__td { padding: var(--mp-spacing-2\.5) var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); vertical-align: top; }
.prr__num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.prr__strong { font-weight: var(--mp-font-weights-semi-bold); }
.prr__muted { color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-sm); }
.prr__current .prr__td { background: var(--mp-background-neutral-subtle); }

/* House stats band (BillsIndexPage). */
.stats-section {
  display: flex; gap: var(--mp-spacing-6); align-items: flex-start;
  padding-bottom: var(--mp-spacing-5); margin-bottom: var(--mp-spacing-5); border-bottom: 1px solid var(--mp-border-default);
}
.stat-card { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding-right: var(--mp-spacing-6); align-self: stretch; }
.stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.stat-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); }
.stat-period { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stat-amount { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl, 32px); white-space: nowrap; font-variant-numeric: tabular-nums; }
.stat-amount--absent { color: var(--mp-text-secondary); }
.stat-link { display: inline-flex; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); line-height: var(--mp-line-heights-md); cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
