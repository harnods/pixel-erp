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
import PmTitleBar from '../PmTitleBar.vue'
import { projects, getProject, projectPhases, phaseWorkPackages, getWorkPackage, type WorkPackage } from '~/data/projects'
import { getBudget, COST_ACCOUNTS, COGM_ACCOUNT, accountName, type BudgetLine } from '~/data/projectBudgets'
import { projectBudgetTotal } from '~/data/projectBudgets'
import { projectActual, projectCommitted } from '~/data/projectTransactions'
import { getCustomBom, currentVersion, bomUnitCost } from '~/data/projectBoms'
import { approvals } from '~/data/projectApprovals'
import { saveBudgetRevision, linkBudgetPlan, requestBudgetRevision } from '~/data/projectActions'
import { rp, rpSigned, parseAmount } from '~/utils/projectFormat'
import { formatDate } from '~/utils/date'
import { notifyResult } from '~/utils/projectToast'

const props = defineProps<{ projectId?: string }>()
const { t } = useLocale()
const route = useRoute()
const router = useRouter()
const { asActor, isFinance } = useProjectRole()

const project = computed(() => (props.projectId ? getProject(props.projectId) : undefined))
const budget = computed(() => (project.value ? getBudget(project.value.id) : undefined))
const returnTo = computed(() => (typeof route.query.returnTo === 'string' ? route.query.returnTo : ''))
const needCtx = computed(() => {
  const need = Number(route.query.need ?? 0)
  const wp = typeof route.query.wp === 'string' ? getWorkPackage(route.query.wp) : undefined
  const doc = typeof route.query.doc === 'string' ? route.query.doc : ''
  return need || wp || doc ? { need, wp, doc } : null
})

// ── Index ──
const indexRows = computed(() => projects.filter(p => p.status !== 'closed' || getBudget(p.id)).map(p => ({
  p, b: getBudget(p.id), total: projectBudgetTotal(p.id), consumed: projectActual(p.id) + projectCommitted(p.id),
  pending: approvals.filter(a => a.projectId === p.id && a.kind === 'budget_revision' && a.status === 'pending').length,
})))

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
function save() {
  touched.value = true
  if (!project.value) return
  if (!budget.value) {
    if (!planRef.value.trim()) return
    if (notifyResult(linkBudgetPlan(project.value.id, { planRef: planRef.value, ...draftPayload.value }, asActor.value))) { saved.value = true; load() }
    return
  }
  if (!reason.value.trim()) return
  if (isFinance.value) {
    if (notifyResult(saveBudgetRevision(project.value.id, draftPayload.value, reason.value, asActor.value))) { saved.value = true; load() }
  } else if (notifyResult(requestBudgetRevision(project.value.id, { amount: netChange.value, reason: reason.value, refNo: needCtx.value?.doc || undefined, payload: draftPayload.value }, asActor.value))) {
    saved.value = true
  }
}
function goBack() { router.push(returnTo.value || (project.value ? `/projects/${project.value.id}?tab=budget` : '/budget-setup')) }
</script>

<template>
  <!-- ── Index ── -->
  <div v-if="!project" class="pm-page">
    <PmTitleBar :title="t('Budget setup')" :subtitle="t('Budget baselines for every project. The project page shows budget read-only; creation and revision happen here.')" />
    <div class="pm-stage">
      <div class="pm-table-wrap">
        <table class="pm-table">
          <thead>
            <tr>
              <th>{{ t('Project') }}</th><th>{{ t('Baseline') }}</th><th class="pm-num">{{ t('Revenue') }}</th><th class="pm-num">{{ t('Cost budget') }}</th>
              <th class="pm-num">{{ t('Committed + actual') }}</th><th>{{ t('Last revision') }}</th><th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in indexRows" :key="r.p.id" class="pm-tr-click" @click="router.push(`/budget-setup/${r.p.id}`)">
              <td class="pm-wrap"><span class="pm-strong">{{ r.p.code }}</span><span class="pm-cell-sub" style="color: var(--mp-text-default)">{{ r.p.name }}</span></td>
              <td>
                <span v-if="r.b" class="pm-pill pm-pill--green">{{ t('Approved') }}</span>
                <span v-else class="pm-pill pm-pill--yellow">{{ t('Not set') }}</span>
                <span v-if="r.pending" class="pm-pill pm-pill--blue" style="margin-left: 4px">{{ r.pending }} {{ t('pending') }}</span>
                <span v-if="r.b" class="pm-cell-sub">{{ r.b.planRef }}</span>
              </td>
              <td class="pm-num">{{ r.b ? rp(r.b.revenue) : '—' }}</td>
              <td class="pm-num">{{ r.total !== undefined ? rp(r.total) : t('Not set') }}</td>
              <td class="pm-num">{{ rp(r.consumed) }}</td>
              <td>{{ r.b?.revisions[0] ? `#${r.b.revisions[0].no} · ${formatDate(r.b.revisions[0].date)}` : '—' }}</td>
              <td><button class="pm-link" type="button" @click.stop="router.push(`/budget-setup/${r.p.id}`)">{{ r.b ? t('Revise') : t('Set up') }}</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- ── Editor ── -->
  <div v-else class="pm-page">
    <PmTitleBar :title="`${t('Budget')} · ${project.code}`" :breadcrumb="{ label: t('Budget setup'), to: '/budget-setup' }" :subtitle="project.name">
      <template #badges>
        <span v-if="budget" class="pm-pill pm-pill--green pm-pill--lg">{{ t('Approved baseline') }}</span>
        <span v-else class="pm-pill pm-pill--yellow pm-pill--lg">{{ t('Not set') }}</span>
      </template>
      <template #actions>
        <button v-if="returnTo" class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" type="button" @click="goBack">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
          {{ t('Return') }}
        </button>
        <button v-else class="btn-enterprise btn-enterprise--secondary" type="button" @click="router.push(`/projects/${project.id}?tab=budget`)">{{ t('Open project') }}</button>
      </template>
    </PmTitleBar>

    <div class="pm-stage">
      <div class="pm-stack" style="gap: 16px">
        <!-- Round-trip context -->
        <div v-if="returnTo || needCtx" class="pm-banner pm-banner--info">
          <div class="pm-banner-body">
            <div class="pm-banner-title">{{ t('You came here to add budget') }}</div>
            <template v-if="needCtx?.doc">{{ needCtx.doc }} {{ t('needs') }} <strong>{{ rp(needCtx.need) }}</strong> {{ t('more') }}<template v-if="needCtx.wp"> {{ t('on') }} {{ needCtx.wp.code }} {{ needCtx.wp.name }}</template>. </template>
            {{ t('Save the revision, then return — your document is waiting where you left it.') }}
          </div>
        </div>
        <div v-if="saved && returnTo" class="pm-banner pm-banner--success">
          <div class="pm-banner-body">{{ isFinance ? t('Revision saved.') : t('Revision sent to Finance for approval.') }}</div>
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--sm" type="button" @click="goBack">{{ t('Return to where you were') }}</button>
        </div>

        <!-- Plan / revenue -->
        <div class="pm-card">
          <div class="pm-grid-3">
            <div class="pm-field">
              <label class="pm-label" :class="{ 'pm-label-req': !budget }" for="bs-plan">{{ t('Approved plan (RAB/RAP)') }}</label>
              <input id="bs-plan" v-model="planRef" class="pm-input" :disabled="!!budget" :aria-invalid="touched && !budget && !planRef.trim()" :placeholder="t('e.g. RAB_Project.pdf · RAP_Project.pdf')" />
              <span v-if="touched && !budget && !planRef.trim()" class="pm-error">{{ t('Enter the plan reference.') }}</span>
              <span v-else-if="budget" class="pm-help">{{ t('Approved by') }} {{ budget.approvedBy }} {{ t('on') }} {{ formatDate(budget.approvedAt) }}</span>
              <span v-else class="pm-help">{{ t('No plan document? Enter the baseline manually below — it’s recorded the same way.') }}</span>
            </div>
            <div class="pm-field">
              <label class="pm-label" for="bs-rev">{{ t('Revenue (RAB)') }}</label>
              <div class="pm-input-group"><span class="pm-addon">Rp</span><input id="bs-rev" v-model="draftRevenue" @blur="draftRevenue = fmtIn(draftRevenue)" class="pm-input pm-input--num" inputmode="numeric" /></div>
              <span class="pm-help">{{ t('Contract value') }} {{ rp(project.contractValue) }}</span>
            </div>
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
                <th style="min-width: 240px">{{ t('Phase / work package') }}</th>
                <th v-for="a in accounts" :key="a.code" class="pm-num" style="min-width: 150px">{{ t(a.name) }}</th>
                <th class="pm-num" style="min-width: 150px">{{ t('Total') }}</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="ph in projectPhases(project.id)" :key="ph.id">
                <tr v-if="!ph.auto" class="pm-tr-sub">
                  <td>{{ ph.order }}. {{ ph.name }}</td>
                  <td :colspan="accounts.length" class="pm-num" style="font-weight: 400">
                    <div class="pm-row" style="justify-content: flex-start; gap: 16px">
                      <span class="pm-muted">{{ t('Allocated') }} <span class="pm-pill pm-pill--gray" :title="t('Locked — always the sum of its work packages')">🔒 {{ rp(allocated(ph.id)) }}</span></span>
                      <span class="pm-row" style="gap: 6px">
                        <label class="pm-muted" :for="`res-${ph.id}`">{{ t('Reserve') }}</label>
                        <input :id="`res-${ph.id}`" v-model="draftReserves[ph.id]" @blur="draftReserves[ph.id] = fmtIn(draftReserves[ph.id] ?? '')" class="pm-input pm-input--sm pm-input--num" style="width: 140px" inputmode="numeric" placeholder="0" />
                      </span>
                    </div>
                  </td>
                  <td class="pm-num">{{ rp(phaseTotalDraft(ph.id)) }}</td>
                </tr>
                <tr v-if="!ph.auto && phaseExcess(ph.id) > 0" class="pm-tr-warn">
                  <td :colspan="accounts.length + 2">
                    <div class="pm-row" style="gap: 10px">
                      <span class="pm-warn">⚠ {{ t('Work packages in') }} {{ ph.name }} {{ t('now push the phase past its approved total') }} ({{ rp(approvedPhaseTotal(ph.id)) }}) {{ t('by') }} <strong>{{ rp(phaseExcess(ph.id)) }}</strong>.</span>
                      <button v-if="reserveVal(ph.id)" class="btn-enterprise btn-enterprise--secondary btn-enterprise--xs" type="button" @click="takeFromReserve(ph.id)">{{ t('Take it from Reserve') }}</button>
                    </div>
                  </td>
                </tr>
                <tr v-for="w in phaseWorkPackages(ph.id)" :key="w.id">
                  <td class="pm-wrap" :style="{ paddingLeft: ph.auto ? '8px' : '24px' }">
                    <span class="pm-muted">{{ w.auto ? '' : w.code }}</span> {{ w.name }}
                    <span v-if="suggestion(w) !== undefined" class="pm-cell-sub">
                      {{ t('Suggested') }} {{ rp(suggestion(w)) }} ({{ t('BOM × planned units') }}) ·
                      <button class="pm-link pm-small" type="button" @click="useSuggestion(w)">{{ t('Use') }}</button>
                    </span>
                    <span v-else-if="w.type === 'production' && !w.customBomId" class="pm-cell-sub">{{ t('No BOM — no suggestion') }}</span>
                  </td>
                  <td v-for="a in accounts" :key="a.code" class="pm-num">
                    <input v-model="draftLines[k(w.id, a.code)]" @blur="draftLines[k(w.id, a.code)] = fmtIn(draftLines[k(w.id, a.code)] ?? '')" class="pm-input pm-input--sm pm-input--num" style="width: 140px" inputmode="numeric" :aria-label="`${w.name} ${a.name}`" placeholder="—" />
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
        <p class="pm-help">{{ t('Cost of production is consumed only by work orders; Direct labour holds non-production labour. The two lines never overlap.') }}</p>

        <!-- Save -->
        <div class="pm-card">
          <div class="pm-row" style="align-items: flex-end; gap: 12px">
            <div v-if="budget" class="pm-field" style="flex: 1; min-width: 260px">
              <label class="pm-label pm-label-req" for="bs-reason">{{ t('Reason for this revision') }}</label>
              <input id="bs-reason" v-model="reason" class="pm-input" :aria-invalid="touched && !reason.trim()" />
              <span v-if="touched && !reason.trim()" class="pm-error">{{ t('Enter a reason.') }}</span>
            </div>
            <div v-else class="pm-field" style="flex: 1"><span class="pm-help">{{ t('Saving sets the frozen baseline. Later changes are revisions with a reason.') }}</span></div>
            <button class="btn-enterprise btn-enterprise--ghost" type="button" :disabled="!dirty" @click="load">{{ t('Discard changes') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" :disabled="!!budget && !dirty" @click="save">
              {{ !budget ? t('Save baseline') : isFinance ? t('Save revision') : t('Submit revision for approval') }}
            </button>
          </div>
          <p v-if="budget && !isFinance" class="pm-help" style="margin-top: 8px">{{ t('You’re viewing as a PM — the revision goes to Finance in the Approvals inbox.') }}</p>
        </div>

        <!-- Revision log (lives here, not on the project page) -->
        <section v-if="budget" class="pm-section">
          <h2 class="pm-h2" style="margin-bottom: 12px">{{ t('Revision log') }}</h2>
          <div v-if="!budget.revisions.length" class="pm-muted">{{ t('No revisions — this is the approved baseline.') }}</div>
          <div class="pm-timeline">
            <div v-for="r in budget.revisions" :key="r.id" class="pm-tl-item" style="grid-template-columns: 110px 16px minmax(0,1fr)">
              <div class="pm-tl-date">{{ formatDate(r.date) }}</div>
              <span class="pm-tl-dot" />
              <div>
                <div class="pm-tl-summary"><strong>#{{ r.no }}</strong> — {{ r.reason }}</div>
                <div class="pm-tl-meta"><span>{{ r.by }}</span><span class="pm-pill pm-pill--gray">{{ t(r.source) }}</span><span v-if="r.refNo">{{ r.refNo }}</span></div>
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
