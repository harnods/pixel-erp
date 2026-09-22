<script setup lang="ts">
/**
 * Budget setup — the separate budget module (PRD §3, D5, P4; Stories 2, 4).
 *
 *  • All budget creation and revision lives here; the project page is read-only.
 *  • Grid = work package × GL account. Phase Allocated is locked and always
 *    SUM(child work packages); Reserve is the only free-text phase amount;
 *    Total = Allocated + Reserve.
 *  • Work packages that push a phase past its approved total are warned at the
 *    point of entry, with the option to take the excess from Reserve.
 *  • Suggested budget (BOM × planned units) is shown — never auto-applied.
 *  • Every save is a revision with a reason and an audit entry. Finance saves;
 *    a PM submits the same proposal to the Approvals inbox.
 *  • ?returnTo= carries the user back to where they came from (blocked
 *    document, project Budget tab) — the cross-module round trip.
 */
import {
  MpButton, MpIcon, MpInput, MpInputGroup, MpInputLeftAddon, MpTag, MpTextlink, MpFormControl, MpFormLabel, MpFormErrorMessage, MpFormHelpText,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
} from '@mekari/pixel3'
import PmTitleBar from '../PmTitleBar.vue'
import PmActionError from '../PmActionError.vue'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { projects, getProject, projectPhases, phaseWorkPackages, getWorkPackage, type WorkPackage } from '~/data/projects'
import { getBudget, COST_ACCOUNTS, COGM_ACCOUNT, accountName, type BudgetLine } from '~/data/projectBudgets'
import { projectBudgetTotal } from '~/data/projectBudgets'
import { projectActual, projectCommitted } from '~/data/projectTransactions'
import { getCustomBom, currentVersion, bomUnitCost } from '~/data/projectBoms'
import { approvals } from '~/data/projectApprovals'
import { saveBudgetRevision, linkBudgetPlan, requestBudgetRevision } from '~/data/projectActions'
import { rp, rpSigned, parseAmount } from '~/utils/projectFormat'
import { formatDate } from '~/utils/date'
import { badgeProps } from '~/utils/projectStatus'

const props = defineProps<{ projectId?: string }>()
const { t } = useLocale()
const route = useRoute()
const router = useRouter()
const { asActor, isFinance } = useProjectRole()
const action = useProjectAction()

const project = computed(() => (props.projectId ? getProject(props.projectId) : undefined))
const budget = computed(() => (project.value ? getBudget(project.value.id) : undefined))
const returnTo = computed(() => (typeof route.query.returnTo === 'string' ? route.query.returnTo : ''))
const needCtx = computed(() => {
  const need = Number(route.query.need ?? 0)
  const wp = typeof route.query.wp === 'string' ? getWorkPackage(route.query.wp) : undefined
  const doc = typeof route.query.doc === 'string' ? route.query.doc : ''
  return need || wp || doc ? { need, wp, doc } : null
})

// ── Index (ErpTablePage + useTableState — rule/table-use-erptablepage) ──
interface IndexRow { id: string; code: string; name: string; baseline: string; revenue: number; total: number; consumed: number; lastRevision: string; pending: number; planRef: string; hasBudget: boolean }
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })
const baselineFilter = ref('')
const baselineOptions = computed(() => [{ value: 'set', label: t('Approved') }, { value: 'unset', label: t('Not set') }])
const indexRows = computed<IndexRow[]>(() => projects.filter(p => p.status !== 'closed' || getBudget(p.id)).map(p => {
  const b = getBudget(p.id)
  return {
    id: p.id, code: p.code, name: p.name, baseline: b ? 'set' : 'unset', hasBudget: !!b, planRef: b?.planRef ?? '',
    revenue: b?.revenue ?? -1, total: projectBudgetTotal(p.id) ?? -1, consumed: projectActual(p.id) + projectCommitted(p.id),
    lastRevision: b?.revisions[0]?.date ?? '', pending: approvals.filter(a => a.projectId === p.id && a.kind === 'budget_revision' && a.status === 'pending').length,
  }
}))
const {
  search, currentPage, paginated, total: indexTotal, perPage, setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<IndexRow>(indexRows, {
  perPage: 25,
  defaultSort: { key: 'code', dir: 'desc' },
  filterFn: (r, q) => (!q || r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)) && (!baselineFilter.value || r.baseline === baselineFilter.value),
})
watch(baselineFilter, () => setPage(1))
function clearFilters() { baselineFilter.value = ''; search.value = '' }
const indexColumns = computed<TableColumn[]>(() => [
  { key: 'code', label: t('Project'), kind: 'name', sortType: 'text' },
  { key: 'baseline', label: t('Baseline'), kind: 'status', sortType: 'text' },
  { key: 'revenue', label: t('Revenue'), kind: 'amount', align: 'right', sortType: 'number' },
  { key: 'total', label: t('Cost budget'), kind: 'amount', align: 'right', sortType: 'number' },
  { key: 'consumed', label: t('Committed + actual'), kind: 'amount', align: 'right', sortType: 'number' },
  { key: 'lastRevision', label: t('Last revision'), kind: 'date', sortType: 'text' },
])
const asIndexRow = (r: unknown) => r as IndexRow

// ── Editor draft ──
const accounts = computed(() => COST_ACCOUNTS.filter(a => a.code !== '5-50700' && (project.value?.isProduction || a.code !== COGM_ACCOUNT)))
const draftLines = reactive<Record<string, string>>({})
const draftReserves = reactive<Record<string, string>>({})
const draftRevenue = ref('')
const planRef = ref('')
const reason = ref('')
const touched = ref(false)
const k = (wpId: string, acc: string) => `${wpId}|${acc}`
/** Inputs show id-ID thousand separators ("8.500.000"); parseAmount reads them back. */
function fmtIn(v: number | string): string { const n = parseAmount(v); return n ? n.toLocaleString('id-ID') : '' }

function load() {
  for (const key of Object.keys(draftLines)) delete draftLines[key]
  for (const key of Object.keys(draftReserves)) delete draftReserves[key]
  reason.value = ''
  touched.value = false
  const b = budget.value
  if (b) {
    for (const l of b.lines) draftLines[k(l.wpId, l.account)] = fmtIn(l.amount)
    for (const [ph, v] of Object.entries(b.reserves)) draftReserves[ph] = fmtIn(v)
    draftRevenue.value = fmtIn(b.revenue)
    planRef.value = b.planRef
  } else if (project.value) {
    draftRevenue.value = fmtIn(project.value.contractValue)
    planRef.value = ''
  }
}
watch(() => props.projectId, load, { immediate: true })

const lineVal = (wpId: string, acc: string) => parseAmount(draftLines[k(wpId, acc)] ?? '')
const wpTotal = (wpId: string) => accounts.value.reduce((s, a) => s + lineVal(wpId, a.code), 0)
const allocated = (phaseId: string) => phaseWorkPackages(phaseId).reduce((s, w) => s + wpTotal(w.id), 0)
const reserveVal = (phaseId: string) => parseAmount(draftReserves[phaseId] ?? '')
const phaseTotalDraft = (phaseId: string) => allocated(phaseId) + reserveVal(phaseId)
const grandTotal = computed(() => project.value ? projectPhases(project.value.id).reduce((s, ph) => s + phaseTotalDraft(ph.id), 0) : 0)

/** Approved phase total before this edit session (for the excess warning). */
function approvedPhaseTotal(phaseId: string): number | undefined {
  const b = budget.value
  if (!b) return undefined
  const ids = new Set(phaseWorkPackages(phaseId).map(w => w.id))
  return b.lines.filter(l => ids.has(l.wpId)).reduce((s, l) => s + l.amount, 0) + (b.reserves[phaseId] ?? 0)
}
/** How far the work packages push the phase past its approved total (only when allocation grew). */
function phaseExcess(phaseId: string): number {
  const ap = approvedPhaseTotal(phaseId)
  if (ap === undefined || allocated(phaseId) <= allocatedApproved(phaseId)) return 0
  return Math.max(phaseTotalDraft(phaseId) - ap, 0)
}
function allocatedApproved(phaseId: string): number {
  const b = budget.value
  if (!b) return 0
  const ids = new Set(phaseWorkPackages(phaseId).map(w => w.id))
  return b.lines.filter(l => ids.has(l.wpId)).reduce((s, l) => s + l.amount, 0)
}
function takeFromReserve(phaseId: string) {
  const excess = phaseExcess(phaseId)
  const r = reserveVal(phaseId)
  draftReserves[phaseId] = fmtIn(Math.max(r - excess, 0))
}

function suggestion(wp: WorkPackage): number | undefined {
  if (wp.type !== 'production') return undefined
  const b = getCustomBom(wp.customBomId)
  if (!b || !wp.plannedUnits) return undefined
  return Math.round(bomUnitCost(currentVersion(b)) * wp.plannedUnits)
}
function useSuggestion(wp: WorkPackage) {
  const s = suggestion(wp)
  if (s !== undefined) draftLines[k(wp.id, COGM_ACCOUNT)] = fmtIn(s)
}

const draftPayload = computed(() => {
  const lines: BudgetLine[] = []
  if (project.value) {
    for (const ph of projectPhases(project.value.id)) for (const w of phaseWorkPackages(ph.id)) for (const a of accounts.value) {
      const v = lineVal(w.id, a.code)
      if (v) lines.push({ wpId: w.id, account: a.code, amount: v })
    }
    // keep lines on accounts not shown in the grid (e.g. scrap) untouched
    for (const l of budget.value?.lines ?? []) if (!accounts.value.some(a => a.code === l.account)) lines.push({ ...l })
  }
  const reserves: Record<string, number> = {}
  for (const [ph, v] of Object.entries(draftReserves)) { const n = parseAmount(v); if (n) reserves[ph] = n }
  return { lines, reserves, revenue: parseAmount(draftRevenue.value) }
})
const netChange = computed(() => grandTotal.value - (project.value ? (projectBudgetTotal(project.value.id) ?? 0) : 0))
const dirty = computed(() => {
  const b = budget.value
  if (!b) return true
  return netChange.value !== 0 || draftPayload.value.revenue !== b.revenue || JSON.stringify(draftPayload.value.lines.map(l => `${l.wpId}|${l.account}|${l.amount}`).sort()) !== JSON.stringify(b.lines.map(l => `${l.wpId}|${l.account}|${l.amount}`).sort()) || JSON.stringify(draftPayload.value.reserves) !== JSON.stringify(Object.fromEntries(Object.entries(b.reserves).filter(([, v]) => v)))
})

const saved = ref(false)
function discard() { load(); action.clear() }
function save() {
  touched.value = true
  if (!project.value) return
  if (!budget.value) {
    if (!planRef.value.trim()) return
    if (action.run(linkBudgetPlan(project.value.id, { planRef: planRef.value, ...draftPayload.value }, asActor.value))) { saved.value = true; load() }
    return
  }
  if (!dirty.value) { action.fail(t('Nothing has changed yet. Edit a line, reserve or revenue before saving a revision.')); return }
  if (!reason.value.trim()) return
  if (isFinance.value) {
    if (action.run(saveBudgetRevision(project.value.id, draftPayload.value, reason.value, asActor.value))) { saved.value = true; load() }
  } else if (action.run(requestBudgetRevision(project.value.id, { amount: netChange.value, reason: reason.value, refNo: needCtx.value?.doc || undefined, payload: draftPayload.value }, asActor.value))) {
    saved.value = true
  }
}
function goBack() { router.push(returnTo.value || (project.value ? `/projects/${project.value.id}?tab=budget` : '/budget-setup')) }
</script>

<template>
  <!-- ── Index ── -->
  <div v-if="!project" class="pm-page">
    <PmTitleBar :title="t('Budget setup')" />
    <div class="pm-stage">
      <ErpTablePage
        :columns="indexColumns"
        :rows="(paginated as unknown as Record<string, unknown>[])"
        :total="indexTotal"
        :current-page="currentPage"
        :per-page="perPage"
        :sort-key="sortKey"
        :sort-dir="sortDir"
        :loading="loading"
        :has-active-search="!!search"
        :has-active-filter="!!baselineFilter"
        :search="search"
        filter-empty-label="project"
        actions-align-top
        @page-change="setPage"
        @per-page-change="setPerPage"
        @sort="toggleSort"
        @sort-change="setSort"
        @clear-filters="clearFilters"
      >
        <template #filters>
          <div class="filter-left">
            <ErpFilterSelect id="bs-baseline-filter" v-model="baselineFilter" :placeholder="t('Baseline')" :options="baselineOptions" />
          </div>
          <div class="filter-right">
            <div class="filter-search">
              <MpIcon name="search" size="sm" />
              <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search project...')" />
            </div>
          </div>
        </template>
        <template #cell-code="{ row }">
          <div>
            <span class="pm-link" role="link" tabindex="0" @click.stop="router.push(`/budget-setup/${asIndexRow(row).id}`)">{{ asIndexRow(row).code }}</span>
            <span class="pm-cell-sub">{{ asIndexRow(row).name }}</span>
          </div>
        </template>
        <template #cell-baseline="{ row }">
          <div class="pm-row pm-gap-1">
            <ErpStatusBadge v-bind="badgeProps('flag', asIndexRow(row).hasBudget ? 'approved-baseline' : 'not-set', t)" />
            <ErpStatusBadge v-if="asIndexRow(row).pending" v-bind="badgeProps('flag', 'pending', t)" :label="`${asIndexRow(row).pending} ${t('pending')}`" />
          </div>
          <span v-if="asIndexRow(row).planRef" class="pm-cell-sub">{{ asIndexRow(row).planRef }}</span>
        </template>
        <template #cell-revenue="{ row }">{{ asIndexRow(row).revenue >= 0 ? rp(asIndexRow(row).revenue) : '—' }}</template>
        <template #cell-total="{ row }">
          <template v-if="asIndexRow(row).total >= 0">{{ rp(asIndexRow(row).total) }}</template>
          <span v-else class="pm-warn">{{ t('Not set') }}</span>
        </template>
        <template #cell-consumed="{ row }">{{ rp(asIndexRow(row).consumed) }}</template>
        <template #cell-lastRevision="{ row }">{{ asIndexRow(row).lastRevision ? formatDate(asIndexRow(row).lastRevision) : '—' }}</template>
        <template #actions="{ row }">
          <MpButton :id="`bs-open-${asIndexRow(row).id}`" variant="ghost" is-rounded size="sm" @click.stop="router.push(`/budget-setup/${asIndexRow(row).id}`)">{{ asIndexRow(row).hasBudget ? t('Revise') : t('Set up') }}</MpButton>
        </template>
        <template #empty>
          <div class="pm-empty-inline">
            <div class="pm-empty-title">{{ t('No projects') }}</div>
            <div class="pm-empty-desc">{{ t('Projects will appear here.') }}</div>
          </div>
        </template>
      </ErpTablePage>
    </div>
  </div>

  <!-- ── Editor ── -->
  <div v-else class="pm-page">
    <PmTitleBar :title="`${t('Budget')} · ${project.code}`" :breadcrumb="{ label: t('Budget setup'), to: '/budget-setup' }" :meta="project.name">
      <template #badges>
        <ErpStatusBadge v-bind="badgeProps('flag', budget ? 'approved-baseline' : 'not-set', t)" badge-for="additionalInformation" />
      </template>
      <template #actions>
        <MpButton v-if="returnTo" id="bs-return" variant="secondary" is-rounded @click="goBack">{{ t('Return') }}</MpButton>
        <MpButton v-else id="bs-open-project" variant="secondary" is-rounded @click="router.push(`/projects/${project.id}?tab=budget`)">{{ t('Open project') }}</MpButton>
      </template>
    </PmTitleBar>

    <div class="pm-stage">
      <div class="pm-stack pm-gap-4">
        <!-- Round-trip context -->
        <MpBanner v-if="(returnTo || needCtx) && !saved" id="bs-roundtrip" variant="info">
          <MpBannerIcon />
          <MpBannerTitle>{{ t('You came here to add budget') }}</MpBannerTitle>
          <MpBannerDescription>
            <template v-if="needCtx?.doc">{{ needCtx.doc }} {{ t('needs') }} <strong>{{ rp(needCtx.need) }}</strong> {{ t('more') }}<template v-if="needCtx.wp"> {{ t('on') }} {{ needCtx.wp.code }} {{ needCtx.wp.name }}</template>. </template>
            {{ t('Save the revision, then return — your document is waiting where you left it.') }}
          </MpBannerDescription>
        </MpBanner>
        <MpBanner v-if="saved && returnTo" id="bs-saved-return" variant="info">
          <MpBannerIcon />
          <MpBannerDescription>
            {{ isFinance ? t('Revision saved.') : t('Revision sent to Finance for approval.') }}
            <MpTextlink id="bs-return-link" as="a" @click.prevent="goBack">{{ t('Return to where you were') }}</MpTextlink>
          </MpBannerDescription>
        </MpBanner>

        <!-- Plan / revenue -->
        <div class="pm-card">
          <div class="pm-grid-3">
            <MpFormControl id="bs-plan-fc" :is-required="!budget" :is-invalid="touched && !budget && !planRef.trim()">
              <MpFormLabel>{{ t('Approved plan (RAB/RAP)') }}</MpFormLabel>
              <MpInput id="bs-plan" v-model="planRef" :is-read-only="!!budget" />
              <MpFormErrorMessage>{{ t('Enter the plan reference.') }}</MpFormErrorMessage>
              <MpFormHelpText v-if="budget">{{ t('Approved by') }} {{ budget.approvedBy }} {{ t('on') }} {{ formatDate(budget.approvedAt) }}</MpFormHelpText>
              <MpFormHelpText v-else-if="!touched || planRef.trim()">{{ t('No plan document? Enter the baseline manually below — it’s recorded the same way.') }}</MpFormHelpText>
            </MpFormControl>
            <MpFormControl id="bs-rev-fc">
              <MpFormLabel>{{ t('Revenue (RAB)') }}</MpFormLabel>
              <MpInputGroup id="bs-rev-group">
                <MpInputLeftAddon has-background>Rp</MpInputLeftAddon>
                <MpInput id="bs-rev" v-model="draftRevenue" inputmode="numeric" @blur="draftRevenue = fmtIn(draftRevenue)" />
              </MpInputGroup>
              <MpFormHelpText>{{ t('Contract value') }} {{ rp(project.contractValue) }}</MpFormHelpText>
            </MpFormControl>
            <div>
              <div class="pm-stat-label">{{ t('Total cost budget') }}</div>
              <div class="pm-stat-value">{{ rp(grandTotal) }}</div>
              <div class="pm-stat-note" :class="parseAmount(draftRevenue) - grandTotal < 0 ? 'pm-neg' : ''">{{ t('Planned margin') }} {{ rp(parseAmount(draftRevenue) - grandTotal) }}<template v-if="budget"> · {{ t('change') }} {{ rpSigned(netChange) }}</template></div>
            </div>
          </div>
        </div>

        <!-- Grid -->
        <div class="pm-table-wrap">
          <table class="pm-table">
            <thead>
              <tr>
                <th class="pm-th-wide">{{ t('Phase / work package') }}</th>
                <th v-for="a in accounts" :key="a.code" class="pm-num pm-th-mid">{{ t(a.name) }}</th>
                <th class="pm-num pm-th-mid">{{ t('Total') }}</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="ph in projectPhases(project.id)" :key="ph.id">
                <tr v-if="!ph.auto" class="pm-tr-sub">
                  <td>{{ ph.order }}. {{ ph.name }}</td>
                  <td :colspan="accounts.length">
                    <div class="pm-row pm-gap-4">
                      <span class="pm-row pm-gap-2">
                        <span class="pm-muted">{{ t('Allocated') }}</span>
                        <MpTag :id="`bs-alloc-${ph.id}`">{{ rp(allocated(ph.id)) }} · {{ t('locked') }}</MpTag>
                      </span>
                      <span class="pm-row pm-gap-2">
                        <span class="pm-muted">{{ t('Reserve') }}</span>
                        <MpInput :id="`res-${ph.id}`" v-model="draftReserves[ph.id]" class="pm-w-cell" inputmode="numeric" :aria-label="`${t('Reserve')} ${ph.name}`" @blur="draftReserves[ph.id] = fmtIn(draftReserves[ph.id] ?? '')" />
                      </span>
                    </div>
                  </td>
                  <td class="pm-num">{{ rp(phaseTotalDraft(ph.id)) }}</td>
                </tr>
                <tr v-if="!ph.auto && phaseExcess(ph.id) > 0" class="pm-tr-warn">
                  <td :colspan="accounts.length + 2">
                    <div class="pm-row pm-gap-3">
                      <span class="pm-warn">{{ t('Work packages in') }} {{ ph.name }} {{ t('now push the phase past its approved total') }} ({{ rp(approvedPhaseTotal(ph.id)) }}) {{ t('by') }} <strong>{{ rp(phaseExcess(ph.id)) }}</strong>.</span>
                      <MpTextlink v-if="reserveVal(ph.id)" :id="`bs-take-reserve-${ph.id}`" as="a" @click.prevent="takeFromReserve(ph.id)">{{ t('Take it from Reserve') }}</MpTextlink>
                    </div>
                  </td>
                </tr>
                <tr v-for="w in phaseWorkPackages(ph.id)" :key="w.id">
                  <td class="pm-wrap" :class="{ 'pm-pl-6': !ph.auto }">
                    <span class="pm-muted">{{ w.auto ? '' : w.code }}</span> {{ w.name }}
                    <span v-if="suggestion(w) !== undefined" class="pm-cell-sub">
                      {{ t('Suggested') }} {{ rp(suggestion(w)) }} ({{ t('BOM × planned units') }}) ·
                      <MpTextlink :id="`bs-use-${w.id}`" as="a" @click.prevent="useSuggestion(w)">{{ t('Use') }}</MpTextlink>
                    </span>
                    <span v-else-if="w.type === 'production' && !w.customBomId" class="pm-cell-sub">{{ t('No BOM — no suggestion') }}</span>
                  </td>
                  <td v-for="a in accounts" :key="a.code" class="pm-num">
                    <MpInput :id="`bs-${w.id}-${a.code}`" v-model="draftLines[k(w.id, a.code)]" class="pm-w-cell" inputmode="numeric" :aria-label="`${w.name} ${t(a.name)}`" @blur="draftLines[k(w.id, a.code)] = fmtIn(draftLines[k(w.id, a.code)] ?? '')" />
                  </td>
                  <td class="pm-num">{{ rp(wpTotal(w.id)) }}</td>
                </tr>
              </template>
            </tbody>
            <tfoot>
              <tr>
                <td>{{ t('Total') }}</td>
                <td v-for="a in accounts" :key="a.code" class="pm-num">{{ rp(projectPhases(project.id).reduce((s, ph) => s + phaseWorkPackages(ph.id).reduce((x, w) => x + lineVal(w.id, a.code), 0), 0)) }}</td>
                <td class="pm-num">{{ rp(grandTotal) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="pm-caption pm-m-0">{{ t('Cost of production is consumed only by work orders; Direct labour holds non-production labour. The two lines never overlap.') }}</p>

        <!-- Save -->
        <div class="pm-card pm-stack">
          <MpFormControl v-if="budget" id="bs-reason-fc" is-required :is-invalid="touched && dirty && !reason.trim()">
            <MpFormLabel>{{ t('Reason for this revision') }}</MpFormLabel>
            <MpInput id="bs-reason" v-model="reason" />
            <MpFormErrorMessage>{{ t('Enter a reason.') }}</MpFormErrorMessage>
            <MpFormHelpText v-if="!isFinance">{{ t('You’re viewing as a PM — the revision goes to Finance in the Approvals inbox.') }}</MpFormHelpText>
          </MpFormControl>
          <p v-else class="pm-caption pm-m-0">{{ t('Saving sets the frozen baseline. Later changes are revisions with a reason.') }}</p>
          <PmActionError id="bs-error" :error="action.error.value" />
          <div class="pm-row pm-row--end pm-gap-3">
            <span class="pm-spacer" />
            <MpButton id="bs-discard" variant="ghost" is-rounded @click="discard">{{ t('Discard changes') }}</MpButton>
            <MpButton id="bs-save" variant="primary" is-rounded @click="save">{{ !budget ? t('Save baseline') : isFinance ? t('Save revision') : t('Submit revision for approval') }}</MpButton>
          </div>
        </div>

        <!-- Revision log (lives here, not on the project page) -->
        <section v-if="budget" class="pm-section">
          <h2 class="pm-h2 pm-mb-3">{{ t('Revision log') }}</h2>
          <div v-if="!budget.revisions.length" class="pm-muted">{{ t('No revisions — this is the approved baseline.') }}</div>
          <div class="pm-timeline">
            <div v-for="r in budget.revisions" :key="r.id" class="pm-tl-item">
              <div class="pm-tl-date">{{ formatDate(r.date) }}</div>
              <span class="pm-tl-dot" />
              <div>
                <div class="pm-tl-summary"><strong>#{{ r.no }}</strong> — {{ r.reason }}</div>
                <div class="pm-tl-meta"><span>{{ r.by }}</span><MpTag :id="`bs-rev-src-${r.id}`">{{ t(r.source) }}</MpTag><span v-if="r.refNo">{{ r.refNo }}</span></div>
                <div class="pm-tl-reason">
                  <div v-for="(c, i) in r.changes" :key="i">
                    <template v-if="c.field === 'line'">{{ getWorkPackage(c.wpId!)?.code }} {{ getWorkPackage(c.wpId!)?.name }} · {{ t(accountName(c.account!)) }}</template>
                    <template v-else-if="c.field === 'reserve'">{{ t('Reserve') }} · {{ projectPhases(project.id).find(p => p.id === c.phaseId)?.name }}</template>
                    <template v-else>{{ t('Revenue') }}</template>
                    : {{ rp(c.from) }} → {{ rp(c.to) }} <span :class="c.to - c.from >= 0 ? 'pm-warn' : 'pm-pos'">({{ rpSigned(c.to - c.from) }})</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
