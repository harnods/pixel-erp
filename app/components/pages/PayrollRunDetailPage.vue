<script setup lang="ts">
/**
 * Payroll run record /payroll-runs/<id> (FG-2, FG-3). Header with type and versions;
 * "To fix before posting" in check order; the draft review (OD-12), which is the exact
 * journal Post writes (months before the start month show it labelled "not posted");
 * Post with the stale-draft and newer-version blocks (warnings never block; the unchecked
 * ones are listed in the Post confirm); the versions, posted journals and "Mapping used".
 * Post and Reverse and repost take one journal date (PayrollPostDrawer).
 */
import { computed, ref, watch } from 'vue'
import { MpButton, MpTextlink, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem } from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import RejectTransactionModal from '~/components/patterns/RejectTransactionModal.vue'
import PayrollHoldsPanel from '~/components/payroll/PayrollHoldsPanel.vue'
import PayrollDraftReview from '~/components/payroll/PayrollDraftReview.vue'
import PayrollRunBuiltWith from '~/components/payroll/PayrollRunBuiltWith.vue'
import PayrollRunJournals from '~/components/payroll/PayrollRunJournals.vue'
import PayrollRunWarnings from '~/components/payroll/PayrollRunWarnings.vue'
import PayrollRunClaims from '~/components/payroll/PayrollRunClaims.vue'
import PayrollRevisionNotice from '~/components/payroll/PayrollRevisionNotice.vue'
import PayrollPostDrawer from '~/components/payroll/PayrollPostDrawer.vue'
import PayrollRevisionPanel from '~/components/payroll/PayrollRevisionPanel.vue'
import {
  can, runById, runStatus, runHolds, currentVersionOf, versionLabel, draftOf, liveJournals, journalsOf,
  pendingApproval, canApprove, approvePayroll, rejectPayroll, listLabel,
  rebuildDraft, isDraftStale, runWarnings, revisionOf, rupiah, wib, dateLabel, periodLabel, monthLabel,
  accountLabel, tagsLabel, type Tags,
} from '~/data/payrollStore'
import { statusType, versionFigures } from '~/data/payrollUiIntake'
import { statusLabel, notPostedLabel } from '~/data/payrollUiRunCopy'
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
const warningCount = computed(() => (run.value ? runWarnings(run.value.id).length : 0))
const showWarnings = computed(() => !!run.value && !holds.value.length && ((!!draft.value && !live.value.length) || warningCount.value > 0))
const hasRevision = computed(() => !!run.value && !!revisionOf(run.value.id))
const showClaims = computed(() => !!draft.value || live.value.length > 0)
const showRevisionSlot = computed(() => !!run.value && (run.value.versions.length > 1 || allJournals.value.length > 0))

type Tab = 'review' | 'versions' | 'journals' | 'built'
const tab = ref<Tab>('review')
const tabs = computed(() => [
  { key: 'review' as Tab, label: live.value.length && !draft.value ? 'Posted journal' : 'Draft review' },
  { key: 'versions' as Tab, label: `Versions (${run.value?.versions.length ?? 0})` },
  { key: 'journals' as Tab, label: `Journals (${allJournals.value.length})` },
  { key: 'built' as Tab, label: 'Mapping used' },
])
watch(() => props.orderId, () => { tab.value = 'review'; staleChanges.value = [] })

// ── Post ───────────────────────────────────────────────────────────────────
const canPostNow = computed(() => status.value === 'Ready to post' && !!draft.value && !draft.value.nothingToPost && !live.value.length)
const stale = computed(() => !!run.value && isDraftStale(run.value.id))
const postOpen = ref(false)
const staleChanges = ref<{ key: string; account: string; tags: Tags; old: number; new: number; diff: number }[]>([])
const postError = ref('')
function askPost() {
  postError.value = ''
  if (stale.value) { rebuild(); return }
  postOpen.value = true
}
function rebuild() {
  if (!run.value) return
  const r = rebuildDraft(run.value.id)
  staleChanges.value = (r.changed as typeof staleChanges.value) ?? []
  successToast(t(staleChanges.value.length ? `Draft rebuilt. ${staleChanges.value.length} ${staleChanges.value.length === 1 ? 'line' : 'lines'} changed` : 'Draft rebuilt. No line changed'))
}
function notInPrototype() { infoToast(t('Not in this prototype')) }

// ── Approval (Settings > Approval workflows, Payroll journal) ──────────────
const approval = computed(() => (run.value ? pendingApproval(run.value) : null))
const isApprover = computed(() => !!run.value && !!approval.value && canApprove(run.value.id))
const rejectOpen = ref(false)
function approve() {
  if (!run.value) return
  const r = approvePayroll(run.value.id)
  if (!r.ok) { postError.value = r.message ?? ''; errorToast(t('Not approved. See the message on the page.')); return }
  const nos = (r.journals as string[] | undefined) ?? (r.number ? [r.number as string] : [])
  successToast(t(`Approved and posted as ${nos.join(', ')}`))
  tab.value = 'journals'
}
function reject(reason: string) {
  if (!run.value) return
  const r = rejectPayroll(run.value.id, reason)
  rejectOpen.value = false
  if (!r.ok) { errorToast(t(r.message ?? 'Not rejected')); return }
  successToast(t('Rejected. The journal is back in draft'))
}
function back() { router.push('/payroll-inbox') }
const lineLabel = (account: string, tags: Tags) => `${accountLabel(account)}${tagsLabel(tags) ? ` | ${tagsLabel(tags)}` : ''}`

// Deep links from notices: ?tab=journals|versions|built; anything else lands on the review.
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
          <ErpStatusBadge :status="status ?? ''" :label="t(statusLabel(status ?? ''))" :type="statusType(status ?? '')" size="md" badge-for="additionalInformation" />
        </div>
        <p class="prr__sub">
          {{ t(run.kind) }} · v{{ v.no }} {{ t('of') }} {{ run.versions.length }} · {{ t('sent') }} {{ wib(v.sentAt) }} · {{ t('tax period') }} {{ monthLabel(run.month) }}
        </p>
      </div>
      <div class="prr__baractions">
        <MpPopover id="prr-more" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="secondary" is-rounded right-icon="chevrons-down">{{ t('Actions') }}</MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent class="erp-dropdown-menu">
            <MpPopoverList>
              <MpPopoverListItem v-if="draft && can('post')" @click="rebuild">{{ t('Rebuild draft') }}</MpPopoverListItem>
              <MpPopoverListItem v-if="draft && can('post')" @click="notInPrototype">{{ t('Send for approval') }}</MpPopoverListItem>
              <MpPopoverListItem @click="notInPrototype">{{ t('Download review') }}</MpPopoverListItem>
              <MpPopoverListItem @click="tab = 'built'">{{ t('View mapping used') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
        <template v-if="approval && isApprover">
          <MpButton variant="secondary" is-rounded data-testid="prr-reject" @click="rejectOpen = true">{{ t('Reject') }}</MpButton>
          <MpButton is-rounded data-testid="prr-approve" @click="approve">{{ t('Approve and post') }}</MpButton>
        </template>
        <MpButton v-else-if="can('post') && canPostNow" is-rounded @click="askPost">{{ t('Post journal') }}</MpButton>
      </div>
    </header>

    <div class="prr__body">
      <!-- Headline figures: house stats band. -->
      <div class="stats-section" data-tour="payroll-run-stats">
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Take-home pay') }}</div>
          <div class="stat-period">{{ t('From Talenta') }} v{{ v.no }} · {{ fig.staff }} {{ t('staff') }}</div>
          <div class="stat-amount">{{ rupiah(fig.takeHome) }}</div>
        </div>
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Gross pay') }}</div>
          <div class="stat-period">{{ t('Salary and allowances') }}</div>
          <div class="stat-amount">{{ rupiah(fig.gross) }}</div>
        </div>
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Draft journal') }}</div>
          <div class="stat-period">{{ draft ? `${t('Built')} ${wib(draft.builtAt)}` : t('Fix the items below first') }}</div>
          <div class="stat-amount" :class="{ 'stat-amount--absent': !draft }">{{ draft ? rupiah(draftTotal) : t('Not built') }}</div>
          <a v-if="draft" class="stat-link" @click="tab = 'review'">{{ draft.lines.length }} {{ t('lines') }}</a>
        </div>
        <div class="stat-card">
          <div class="stat-title">{{ t('Posted journal') }}</div>
          <div class="stat-period">{{ live.length ? `${t('Posted')} v${run.ledgerVersion}` : t('Nothing posted') }}</div>
          <div class="stat-amount">{{ rupiah(liveTotal) }}</div>
          <a v-if="live.length" class="stat-link" @click="tab = 'journals'">{{ live.map((j) => j.number).join(', ') }}</a>
        </div>
      </div>

      <!-- Approval: Post matched a Payroll journal rule in Settings > Approval workflows. -->
      <div v-if="approval" class="prr__notice" data-testid="prr-approval">
        <div class="prr__noticetitle">{{ t('Awaiting approval') }} · {{ approval.ruleName }}</div>
        <div>{{ t(approval.kind === 'post' ? 'Payroll journal' : 'Reverse and repost') }} v{{ approval.versionNo }} {{ rupiah(approval.amount) }} · {{ t('journal date') }} {{ dateLabel(approval.date) }} · {{ t('sent by') }} {{ approval.requestedBy }} {{ wib(approval.requestedAt) }} · {{ t('approver') }} {{ listLabel(approval.approvers) }}</div>
      </div>
      <div v-else-if="run.rejection && !live.length" class="prr__notice" data-testid="prr-rejected">
        <div class="prr__noticetitle">{{ t('Rejected by') }} {{ run.rejection.by }} · {{ wib(run.rejection.at) }}</div>
        <div>{{ run.rejection.reason }}</div>
      </div>

      <!-- Post feedback: blocks only (warnings never block). -->
      <div v-if="postError" class="prr__notice">
        <div class="prr__noticetitle">{{ t('Not posted yet') }}</div>
        <div>{{ postError }}</div>
      </div>
      <div v-if="staleChanges.length" class="prr__card">
        <div class="prr__cardhead">
          <div class="prr__cardtitle">{{ t('Lines changed by the rebuild') }}</div>
          <div class="prr__cardsub">{{ t('Settings changed after the draft was built. Check these lines, then post.') }}</div>
        </div>
        <table class="prr__table">
          <thead><tr><th class="prr__th">{{ t('Account and dimension') }}</th><th class="prr__th prr__num">{{ t('Before') }}</th><th class="prr__th prr__num">{{ t('After') }}</th><th class="prr__th prr__num">{{ t('Difference') }}</th></tr></thead>
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

      <!-- To fix before posting, in check order. -->
      <PayrollHoldsPanel v-if="holds.length" :run-id="run.id" />

      <!-- A newer version on a posted run: what changes, then Reverse and repost. -->
      <PayrollRevisionNotice v-if="hasRevision" :run-id="run.id" />

      <!-- Warnings on the current version: never block Post. -->
      <PayrollRunWarnings v-if="showWarnings" :run-id="run.id" />

      <!-- Revisions, reversal, compare, amendment tasks (FG-4). -->
      <PayrollRevisionPanel v-if="showRevisionSlot" :run-id="run.id" />

      <div class="prr__tabs" role="tablist">
        <button
          v-for="tb in tabs" :key="tb.key" type="button" class="prr__tab" :class="{ 'prr__tab--on': tab === tb.key }"
          role="tab" :aria-selected="tab === tb.key" @click="tab = tb.key"
        >{{ t(tb.label) }}</button>
      </div>

      <template v-if="tab === 'review'">
        <div v-if="draft && run.mode !== 'Live'" class="prr__notice" data-testid="prr-before-start">{{ t(notPostedLabel(run.mode)) }}</div>
        <PayrollDraftReview v-if="draft" :run-id="run.id" />
        <PayrollRunJournals v-else-if="live.length" :run-id="run.id" only-live />
        <div v-else class="prr__card prr__empty">
          {{ holds.length ? t('The draft journal builds once the items above are fixed.') : run.mode !== 'Live' ? t(notPostedLabel(run.mode)) : t('No draft journal yet. It builds when Talenta sends this period.') }}
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
              <th class="prr__th">{{ t('Status') }}</th>
              <th class="prr__th">{{ t('Choice') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="x in [...run.versions].reverse()" :key="x.no" :class="{ 'prr__current': x.no === run.currentVersion }">
              <td class="prr__td prr__strong">v{{ x.no }}</td>
              <td class="prr__td">{{ wib(x.sentAt) }}</td>
              <td class="prr__td">{{ wib(x.receivedAt) }}</td>
              <td class="prr__td prr__num">{{ versionFigures(x).staff }}</td>
              <td class="prr__td prr__num">{{ rupiah(versionFigures(x).takeHome) }}</td>
              <td class="prr__td"><ErpStatusBadge :status="versionLabel(run, x)" :label="t(statusLabel(versionLabel(run, x)))" :type="statusType(versionLabel(run, x))" /></td>
              <td class="prr__td">
                <template v-if="x.decision">{{ x.decision.kind }}<span class="prr__muted"> · {{ x.decision.by }}<template v-if="x.decision.reason"> · {{ x.decision.reason }}</template></span></template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <PayrollRunJournals v-else-if="tab === 'journals'" :run-id="run.id" />

      <PayrollRunBuiltWith v-else :snapshot-id="draft?.snapshotId ?? live[0]?.snapshotId ?? allJournals[allJournals.length - 1]?.snapshotId ?? null" />

      <PayrollRunClaims v-if="showClaims" :run-id="run.id" />
    </div>

    <PayrollPostDrawer mode="post" :is-open="postOpen" :run-id="run.id" @close="postOpen = false" />
    <RejectTransactionModal :is-open="rejectOpen" doc-type="Payroll journal" @close="rejectOpen = false" @reject="reject" />
  </div>
  <div v-else class="prr">
    <div class="prr__body">
      <div class="prr__card prr__empty">
        {{ t('This payroll run isn\'t in this company.') }}
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
.prr__body { padding: var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.prr__body > .stats-section { margin-bottom: 0; }


.prr__notice {
  padding: var(--mp-spacing-3) var(--mp-spacing-4); border-radius: var(--mp-radii-md);
  background: var(--mp-colors-background-warning); color: var(--mp-colors-text-warning); font-size: var(--mp-font-sizes-md);
}
.prr__noticetitle { font-weight: var(--mp-font-weights-semi-bold); margin-bottom: var(--mp-spacing-1); }

.prr__tabs { display: flex; gap: var(--mp-spacing-5); border-bottom: 1px solid var(--mp-border-default); }
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
