<script setup lang="ts">
/**
 * Payroll run page /payroll-runs/<id>. Header with the one primary action: Post journal for the
 * Owner or a user with LM, Save draft for Accountant/Ultimate (who can't post); "To fix before posting";
 * "Talenta sent this period again" with Use vN and repost; warnings; then tabs: Draft review
 * (the exact journal Post writes; every send builds a draft that can be posted),
 * Versions (with the compare), Journals, Mapping used; claims below.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { MpButton, MpTextlink, MpTabs, MpTabList, MpTab, MpButtonGroup, MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription } from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import PayrollHoldsPanel from '~/components/payroll/PayrollHoldsPanel.vue'
import PayrollDraftReview from '~/components/payroll/PayrollDraftReview.vue'
import PayrollRunBuiltWith from '~/components/payroll/PayrollRunBuiltWith.vue'
import PayrollRunJournals from '~/components/payroll/PayrollRunJournals.vue'
import PayrollRunWarnings from '~/components/payroll/PayrollRunWarnings.vue'
import PayrollRunClaims from '~/components/payroll/PayrollRunClaims.vue'
import PayrollRevisionNotice from '~/components/payroll/PayrollRevisionNotice.vue'
import PayrollPostDrawer from '~/components/payroll/PayrollPostDrawer.vue'
import PayrollRevisionPanel from '~/components/payroll/PayrollRevisionPanel.vue'
import PayrollCompareView from '~/components/payroll/PayrollCompareView.vue'
import PayrollReadOnlyNote from '~/components/payroll/PayrollReadOnlyNote.vue'
import {
  can, runById, runStatus, runHolds, currentVersionOf, versionLabel, draftOf, liveJournals, journalsOf,
  saveDraft, draftSavedNote,
  rebuildDraft, isDraftStale, runWarnings, revisionOf, rupiah, wib, periodLabel, monthLabel,
  accountLabel, tagsLabel, type Tags,
} from '~/data/payrollStore'
import { versionFigures } from '~/data/payrollUiIntake'
import { statusLabel, statusType } from '~/data/payrollUiRunCopy'
import { successToast } from '~/utils/toasts'

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
const showRevisionSlot = computed(() => !!run.value)

type Tab = 'review' | 'versions' | 'journals' | 'built'
const TAB_KEYS: Tab[] = ['review', 'versions', 'journals', 'built']
const tab = ref<Tab>('review')
const tabIndex = computed({ get: () => TAB_KEYS.indexOf(tab.value), set: (i: number) => { tab.value = TAB_KEYS[i] ?? 'review' } })
const tabs = computed(() => [
  { key: 'review' as Tab, label: t(live.value.length && !draft.value ? 'Posted journal' : 'Draft review') },
  { key: 'versions' as Tab, label: `${t('Versions')} (${run.value?.versions.length ?? 0})` },
  { key: 'journals' as Tab, label: `${t('Journals')} (${allJournals.value.length})` },
  { key: 'built' as Tab, label: t('Mapping used') },
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
// ── Save draft (Accountant/Ultimate: everything but posting) ────────────────────────
/** Accountant/Ultimate keeps a postable draft (first post or a version sent again) for someone who can post. */
const canSaveDraft = computed(() => !can('post') && (canPostNow.value || status.value === 'Revision ready'))
const savedNote = computed(() => (run.value ? draftSavedNote(run.value) : null))
function doSaveDraft() {
  if (!run.value) return
  const r = saveDraft(run.value.id)
  if (!r.ok) { postError.value = r.message ?? ''; return }
  postError.value = ''
  successToast(t('Draft saved. Waiting for someone who can post.'))
}
function back() { router.push('/payroll-inbox') }
function showCompare() { tab.value = 'versions'; nextTick(() => document.getElementById('prp-compare')?.scrollIntoView({ behavior: 'smooth', block: 'start' })) }
const lineLabel = (account: string, tags: Tags) => `${accountLabel(account)}${tagsLabel(tags) ? ` | ${tagsLabel(tags)}` : ''}`
/** The engine records the choice in its own words; show it in glossary words. */
const decisionLabel = (kind: string) => t(({ 'Revision of the posted run': 'Same run, sent again', 'Replaced the full run': 'Used as the full run', 'Rejected partial send': 'Rejected' } as Record<string, string>)[kind] ?? kind)

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
      </div>
      <MpButtonGroup class="prr__baractions">
        <MpButton v-if="canPostNow && stale" variant="secondary" is-rounded @click="rebuild">{{ t('Rebuild draft') }}</MpButton>
        <MpButton v-if="can('post') && canPostNow" is-rounded data-tour="payroll-post" data-testid="prr-post" @click="askPost">{{ t('Post journal') }}</MpButton>
        <MpButton v-else-if="canSaveDraft" is-rounded data-tour="payroll-save-draft" data-testid="prr-save-draft" @click="doSaveDraft">{{ t('Save draft') }}</MpButton>
      </MpButtonGroup>
    </header>

    <div class="prr__body">
      <!-- Run facts: kept out of the 72px title bar, which holds only the breadcrumb and title. -->
      <p class="prr__sub">
        {{ t(run.kind) }} · v{{ v.no }} {{ t('of') }} {{ run.versions.length }} · {{ t('sent by Talenta') }} {{ wib(v.sentAt) }} · {{ t('tax month') }} {{ monthLabel(run.month) }}
      </p>
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
          <div class="stat-period">{{ draft ? `${t('Built')} ${wib(draft.builtAt)}` : t('Builds once nothing is left to fix') }}</div>
          <div class="stat-amount" :class="{ 'stat-amount--absent': !draft }">{{ draft ? rupiah(draftTotal) : t('Not built') }}</div>
          <a v-if="draft" class="stat-link" @click="tab = 'review'">{{ draft.lines.length }} {{ t('lines') }}</a>
        </div>
        <div class="stat-card">
          <div class="stat-title">{{ t('Posted journal') }}</div>
          <div class="stat-period">{{ live.length ? `${t('Posted')} v${run.ledgerVersion}` : t('Nothing posted yet') }}</div>
          <div class="stat-amount" :class="{ 'stat-amount--absent': !live.length }">{{ rupiah(liveTotal) }}</div>
          <a v-if="live.length" class="stat-link" @click="tab = 'journals'">{{ live.map((j) => j.number).join(', ') }}</a>
        </div>
      </div>

      <!-- Saved by someone who can't post: waits for the Owner or a user with LM. -->
      <MpBanner v-if="savedNote" id="prr-saved-draft" variant="info" data-testid="prr-saved-draft" data-tour="payroll-saved-draft">
        <MpBannerIcon id="prr-saved-draft-icon" />
        <MpBannerDescription>
          <div class="prr__bannerbody">
            <div>{{ t(savedNote) }}</div>
            <PayrollReadOnlyNote v-if="!can('post')" :text="t('Only the Owner or a user with LM can post.')" />
          </div>
        </MpBannerDescription>
      </MpBanner>

      <!-- Post feedback: blocks only (warnings never block). -->
      <MpBanner v-if="postError" id="prr-post-error" variant="danger" role="alert">
        <MpBannerIcon id="prr-post-error-icon" />
        <MpBannerTitle>{{ t('Not posted yet') }}</MpBannerTitle>
        <MpBannerDescription>{{ postError }}</MpBannerDescription>
      </MpBanner>
      <section v-if="staleChanges.length" class="prr__card">
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
      </section>

      <!-- To fix before posting, in check order. -->
      <PayrollHoldsPanel v-if="holds.length" :run-id="run.id" />

      <!-- Talenta sent a posted period again: what changes, then Use vN and repost. -->
      <PayrollRevisionNotice v-if="hasRevision" :run-id="run.id" @compare="showCompare" />

      <!-- Warnings on the current version: never block posting. -->
      <PayrollRunWarnings v-if="showWarnings" :run-id="run.id" />

      <!-- Choice, part-of-run and reversed-not-reposted notices. -->
      <PayrollRevisionPanel v-if="showRevisionSlot" :run-id="run.id" />

      <MpTabs id="prr-tabs" v-model="tabIndex" is-manual variant-color="green" class="prr__tabs">
        <MpTabList>
          <MpTab v-for="tb in tabs" :id="`prr-tab-${tb.key}`" :key="tb.key">{{ tb.label }}</MpTab>
        </MpTabList>
      </MpTabs>

      <template v-if="tab === 'review'">
        <PayrollDraftReview v-if="draft" :run-id="run.id" />
        <PayrollRunJournals v-else-if="live.length" :run-id="run.id" only-live />
        <div v-else class="prr__card prr__empty">
          {{ holds.length ? t('No draft journal yet. Fix the items in To fix before posting and it builds.') : t('No draft journal yet. It builds when Talenta sends this period.') }}
        </div>
      </template>

      <div v-else-if="tab === 'versions'" class="prr__stack" data-tour="payroll-versions">
        <section class="prr__card">
          <div class="prr__cardhead">
            <div class="prr__cardtitle">{{ t('Versions') }}</div>
            <div class="prr__cardsub">{{ t('Each time Talenta sends this period, a new version arrives.') }}</div>
          </div>
          <table class="prr__table">
            <thead>
              <tr>
                <th class="prr__th">{{ t('Version') }}</th>
                <th class="prr__th">{{ t('Sent by Talenta') }}</th>
                <th class="prr__th prr__num">{{ t('Staff') }}</th>
                <th class="prr__th prr__num">{{ t('Take-home pay') }}</th>
                <th class="prr__th">{{ t('Status') }}</th>
                <th class="prr__th">{{ t('Choice') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="x in [...run.versions].reverse()" :key="x.no" :class="{ 'prr__current': x.no === run.currentVersion }">
                <td class="prr__td">v{{ x.no }}</td>
                <td class="prr__td prr__nowrap">{{ wib(x.sentAt) }}</td>
                <td class="prr__td prr__num">{{ versionFigures(x).staff }}</td>
                <td class="prr__td prr__num">{{ rupiah(versionFigures(x).takeHome) }}</td>
                <td class="prr__td"><ErpStatusBadge :status="versionLabel(run, x)" :label="t(statusLabel(versionLabel(run, x)))" :type="statusType(versionLabel(run, x))" /></td>
                <td class="prr__td">
                  <template v-if="x.decision">{{ decisionLabel(x.decision.kind) }}<span class="prr__muted"> · {{ x.decision.by }}<template v-if="x.decision.reason"> · {{ x.decision.reason }}</template></span></template>
                  <span v-else class="prr__muted">-</span>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
        <div v-if="run.versions.length > 1" id="prp-compare">
          <PayrollCompareView :run-id="run.id" />
        </div>
      </div>

      <PayrollRunJournals v-else-if="tab === 'journals'" :run-id="run.id" />

      <PayrollRunBuiltWith v-else :snapshot-id="draft?.snapshotId ?? live[0]?.snapshotId ?? allJournals[allJournals.length - 1]?.snapshotId ?? null" />

      <PayrollRunClaims v-if="showClaims" :run-id="run.id" />
    </div>

    <PayrollPostDrawer mode="post" :is-open="postOpen" :run-id="run.id" @close="postOpen = false" />
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
/* Detail page shell (page-title-bar.md, Variant B): the 72px title bar stays put on the
   neutral surface; the white stage below scrolls, with rounded top corners. */
.prr { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; background: var(--mp-background-neutral-subtle); }
.prr__bar {
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
  flex: none; height: var(--mp-sizes-18, 72px); box-sizing: border-box; padding: 0 var(--mp-spacing-6);
  background: var(--mp-background-neutral-subtle);
}
.prr__barleft { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.prr__crumbs { display: flex; align-items: center; gap: var(--mp-spacing-1); align-self: flex-start; }
.prr__crumb { font-size: var(--mp-font-sizes-sm); line-height: var(--mp-sizes-4); }
.prr__titlerow { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.prr__title { font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-sizes-8); margin: 0; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.prr__sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: 0 0 calc(-1 * var(--mp-spacing-2)); overflow-wrap: anywhere; }
.prr__baractions { flex: none; }
.prr__body {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: var(--mp-spacing-6) var(--mp-spacing-6) var(--mp-spacing-8);
  display: flex; flex-direction: column; gap: var(--mp-spacing-5);
}
/* The stage scrolls, so sections keep their own height instead of shrinking to fit. */
.prr__body > * { flex-shrink: 0; }
.prr__body > .stats-section { margin-bottom: 0; }
.prr__bannerbody { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.prr__stack { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.prr__nowrap { white-space: nowrap; }

.prr__tabs { margin-top: 0; }
.prr__tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: 0 !important; }
.prr__tabs :deep(.mp-tab--isSelected_true),
.prr__tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.prr__tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) { background-color: var(--mp-text-selected) !important; }

.prr__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; }
.prr__empty { padding: var(--mp-spacing-4); color: var(--mp-text-secondary); display: flex; gap: var(--mp-spacing-2); }
.prr__cardhead { padding: var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.prr__cardtitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.prr__cardsub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.prr__table { width: 100%; border-collapse: collapse; }
/* Header row 28px, uppercase 12px semibold (rule/table-header-height, rule/table-header-uppercase). */
.prr__th {
  height: var(--mp-sizes-7); box-sizing: border-box; line-height: 1;
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase;
  color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-1) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.prr__td { padding: var(--mp-spacing-2\.5) var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); vertical-align: top; }
.prr__th.prr__num, .prr__num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.prr__muted { color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-sm); }

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
