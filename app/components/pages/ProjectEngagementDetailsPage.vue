<script setup lang="ts">
/**
 * Project detail — the five stages of a project's life, as in-page tabs.
 *
 *   Setup & contract    the frozen contract, the baseline budget plan, and the
 *                       append-only addendum trail (submitted, then decided by an approver)
 *   Costs               every transaction line tagged here, plus budget variance to date
 *   Revenue recognition changes shape with the method
 *   Invoices & payments what was sent to the customer, and what was collected
 *   Project health      margin, projected margin, the close gate and reopen
 *
 * Approvals are simulated: a matching Settings › Approval workflows rule sends the
 * action to Pending approval, and the approver decides it here. Who "you" are comes
 * from the prototype-only View as control (useProjectViewAs).
 *
 * A `detailMatch` route: this page owns its 72px title bar and its own stage
 * padding (DESIGN.md → Layout). In-page detail tabs use MpTabs (docs/patterns/tabs.md).
 */
import {
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, MpButton, MpRadio,
  MpTextarea, MpIcon, MpInput, MpInputGroup, MpInputLeftAddon, MpInputRightAddon,
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpBadge, toast, MpTextlink,
} from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ProjectStatCards, { type ProjectStat } from '~/components/patterns/ProjectStatCards.vue'
import ApproveAddendumModal from '~/components/patterns/ApproveAddendumModal.vue'
import CloseProjectModal from '~/components/patterns/CloseProjectModal.vue'
import ReopenProjectModal from '~/components/patterns/ReopenProjectModal.vue'
import VerifyMilestoneModal from '~/components/patterns/VerifyMilestoneModal.vue'
import RejectRequestModal from '~/components/patterns/RejectRequestModal.vue'
import ScenarioFab from '~/components/patterns/ScenarioFab.vue'
import DetailJumpTo, { type JumpItem } from '~/components/patterns/DetailJumpTo.vue'
import ActivityLogModal, { type ActivityEntry } from '~/components/patterns/ActivityLogModal.vue'
import { useTableState } from '~/composables/useTableState'
import { useProjectViewAs, type ProjectViewAs } from '~/composables/useProjectViewAs'
import { formatDate, formatDateLong } from '~/utils/date'
import { check_approval_required } from '~/data/approvalWorkflows'
import { getUserById } from '~/data/users'
import {
  engagements, findEngagement, STAGES, stageIndex, methodLabel, TODAY,
  revenue, actualCost, pocPct, billed, collected, wipNet, openEntries, readyToInvoice,
  entryAmount, entryFinal, entryLabel, daysAgo, ageBuckets, budgetOf, budgetReport,
  canClose, closeHint, advanceStage,
  decideEntries, addAddendum, approveAddendum, rejectAddendum, confirmWeights,
  addScopeMilestone, unverifyMilestone, recordPayment, closeEngagement,
  projectStatusKey, projectStatusLabel, approvalFor, canDecide, submitMilestoneVerification,
  approveRequest, rejectRequest, closeSummary, reopenEngagement, projectedMargin, billingStatusOf,
  formatIdr, formatIdrShort, formatIdrSigned,
  type Engagement, type EngagementStage, type CostEntry, type CostDecision, type Addendum,
  type PendingApproval, type MilestoneVerificationInput, type BudgetReportRow, type BillingStatus,
} from '~/data/projectAccounting'

// The engine adds these optional trailing params in the same round (COMMON.md shared
// contract). Typed here with them so the calls compile on either side of the merge.
const addAddendumAs = addAddendum as (id: string, newValue: number, reason: string, distinct: boolean, submittedBy?: string) => void
const approveAddendumAs = approveAddendum as (id: string, voId: string, approver?: string) => void
const rejectAddendumAs = rejectAddendum as (id: string, voId: string, approver?: string, reason?: string) => void
const closeEngagementAs = closeEngagement as (id: string, by?: string) => boolean

const props = defineProps<{ orderId: string }>()

const router = useRouter()
const route = useRoute()
const { t } = useLocale()

const engagement = computed<Engagement | undefined>(() => findEngagement(props.orderId))

// ── View as (prototype-only) ──────────────────────────────────────────────────
const { viewAs, setViewAs, currentUser } = useProjectViewAs()
const viewAsModel = computed<string>({
  get: () => viewAs.value,
  set: (v: string) => { if (v === 'pm' || v === 'approver') setViewAs(v as ProjectViewAs) },
})
const viewAsScenarios = computed(() => [
  { label: `${t('View as Project manager')} (Rina Wulandari)`, value: 'pm' },
  { label: `${t('View as Approver')} (Rizal Candra, Owner)`, value: 'approver' },
])

// ── Tabs ──────────────────────────────────────────────────────────────────────
// The URL is the durable source of truth (?tab=), so a refresh keeps the stage.
const tabKeys = STAGES.map(s => s.key)
const activeIndex = ref(0)

function syncFromRoute() {
  const e = engagement.value
  const q = String(route.query.tab ?? '')
  const i = tabKeys.indexOf(q as EngagementStage)
  activeIndex.value = i !== -1 ? i : (e ? Math.max(0, stageIndex(e.stage)) : 0)
}
syncFromRoute()
watch(() => [route.query.tab, props.orderId], syncFromRoute)
watch(activeIndex, (i) => {
  const key = tabKeys[i]
  if (key && route.query.tab !== key) router.replace({ query: { ...route.query, tab: key } })
})

const activeStage = computed<EngagementStage>(() => tabKeys[activeIndex.value] ?? 'setup')
function goTab(key: EngagementStage) { activeIndex.value = tabKeys.indexOf(key) }

/** Move the record forward AND switch the tab — the "Continue to …" buttons. */
function continueTo(key: EngagementStage) {
  if (engagement.value) advanceStage(engagement.value.id, key)
  goTab(key)
}

function goList() { router.push('/project-accounting') }

const isClosed = computed(() => engagement.value ? projectStatusKey(engagement.value) === 'closed' : false)

// ── Title bar: status, jump-to, approval line ────────────────────────────────
const statusBadgeKey = computed(() => {
  const e = engagement.value
  if (!e) return 'in progress'
  const k = projectStatusKey(e)
  return k === 'pending approval' ? 'pending' : k
})

const jumpItems = computed<JumpItem[]>(() => engagements.map(e => ({ id: e.id, primary: e.name, secondary: e.client })))
function jumpTo(id: string) { router.push(`/project-accounting/${id}`) }

const creationApproval = computed(() => engagement.value ? approvalFor(engagement.value, 'project-creation', null) : undefined)

function waitingFor(a: PendingApproval): string {
  const names = a.approvers.filter(n => n !== a.submittedBy)
  return names.length ? `${t('Waiting for')} ${names.join(', ')}` : t('Waiting for an approver')
}
/** Decision check: the engine's rule, from the current View as user's seat. */
function decision(a: PendingApproval | undefined) {
  if (!a) return { ok: false, reason: '' }
  const d = canDecide(a, currentUser.value.name)
  // A non-approver just sees who it is waiting on; the submitter sees why they can't decide.
  if (!d.ok) return { ok: false, reason: a.submittedBy === currentUser.value.name ? `${waitingFor(a)} · ${t('You submitted this request')}` : waitingFor(a) }
  return d
}

// ── Stats, per tab ────────────────────────────────────────────────────────────
function costLinesLabel(n: number) { return `${n} ${n === 1 ? t('cost line') : t('cost lines')}` }

const stats = computed<ProjectStat[]>(() => {
  const e = engagement.value
  if (!e) return []
  const cost = actualCost(e)
  const budget = e.budget
  const valueLabel = e.method === 'tm' ? t('Fee estimate') : t('Contract value')
  const valueAmt = e.method === 'tm' ? e.feeEstimate : e.contractValue

  if (activeStage.value === 'setup' || activeStage.value === 'execution') {
    return [
      { key: 'value', label: valueLabel, value: formatIdr(valueAmt), sub: e.vos.some(v => v.status === 'Approved') ? t('Revised by addendum') : '' },
      { key: 'budget', label: t('Budgeted cost'), value: budget === null ? t('No budget') : formatIdr(budget), sub: t('From the budget plan'), tone: budget === null ? 'muted' : 'default' },
      { key: 'cost', label: t('Cost incurred'), value: formatIdr(cost), sub: costLinesLabel(e.entries.length), tone: budget !== null && cost > budget ? 'adverse' : 'default' },
      { key: 'variance', label: t('Remaining budget'), value: budget === null ? t('No budget') : formatIdrSigned(budget - cost), sub: budget === null ? '' : t('Lifetime budget less cost incurred'), tone: budget === null ? 'muted' : (budget - cost < 0 ? 'adverse' : 'default') },
    ]
  }

  if (activeStage.value === 'recognition') {
    if (e.method === 'tm') {
      const open = openEntries(e)
      const wip = open.reduce((a, x) => a + entryAmount(x), 0)
      const risk = open.filter(x => daysAgo(x.date) > 60).reduce((a, x) => a + entryAmount(x), 0)
      return [
        { key: 'cost', label: t('Cost incurred'), value: formatIdr(cost), sub: costLinesLabel(e.entries.length) },
        { key: 'wip', label: t('Awaiting review'), value: formatIdr(wip), sub: `${costLinesLabel(open.length)} ${t('not yet recognized')}` },
        { key: 'risk', label: t('Over 60 days'), value: formatIdr(risk), sub: t('Awaiting review, by line date'), tone: risk > 0 ? 'adverse' : 'default' },
        { key: 'rev', label: t('Revenue recognized'), value: formatIdr(revenue(e)) },
      ]
    }
    if (e.method === 'input') {
      return [
        { key: 'cv', label: t('Contract value'), value: formatIdr(e.contractValue) },
        { key: 'budget', label: t('Budgeted cost'), value: budget === null ? t('No budget') : formatIdr(budget), tone: budget === null ? 'muted' : 'default' },
        { key: 'cost', label: t('Cost incurred'), value: formatIdr(cost), tone: budget !== null && cost > budget ? 'adverse' : 'default' },
        { key: 'poc', label: t('Percentage complete'), value: `${pocPct(e).toFixed(0)}%`, sub: t('Based on cost incurred') },
      ]
    }
    const verified = (e.milestones ?? []).filter(m => m.verified).length
    return [
      { key: 'cv', label: t('Contract value'), value: formatIdr(e.contractValue) },
      { key: 'ms', label: t('Milestones verified'), value: `${verified} ${t('of')} ${(e.milestones ?? []).length}` },
      { key: 'rev', label: t('Revenue recognized'), value: formatIdr(revenue(e)), sub: t('Verified milestones only') },
      { key: 'cost', label: t('Cost incurred'), value: formatIdr(cost) },
    ]
  }

  if (activeStage.value === 'billing') {
    const net = wipNet(e)
    return [
      { key: 'rev', label: t('Revenue recognized'), value: formatIdr(revenue(e)) },
      { key: 'billed', label: t('Billed to date'), value: formatIdr(billed(e)) },
      { key: 'collected', label: t('Cash collected'), value: formatIdr(collected(e)) },
      {
        key: 'net',
        label: net < 0 ? t('Billed in advance') : net > 0 ? t('Unbilled') : t('Up to date'),
        value: formatIdr(Math.abs(net)),
        sub: net > 0 ? t('Recognized, not yet invoiced') : net < 0 ? t('Invoiced ahead of revenue') : t('Billing matches revenue'),
        tone: 'default',
      },
    ]
  }

  return [
    { key: 'rev', label: t('Revenue recognized'), value: formatIdr(revenue(e)) },
    { key: 'cost', label: t('Cost incurred'), value: formatIdr(cost) },
    { key: 'cash', label: t('Cash collected'), value: formatIdr(collected(e)) },
    { key: 'bva', label: t('Remaining budget'), value: budget === null ? t('No budget') : formatIdrSigned(budget - cost), tone: budget === null ? 'muted' : (budget - cost < 0 ? 'adverse' : 'default') },
  ]
})

// ── Setup & contract ──────────────────────────────────────────────────────────
const contractRows = computed(() => {
  const e = engagement.value
  if (!e) return []
  return [
    { k: t('Method'), v: methodLabel(e.method) },
    { k: e.method === 'tm' ? t('Fee estimate') : t('Contract value'), v: formatIdr(e.method === 'tm' ? e.feeEstimate : e.contractValue) },
    { k: t('Budgeted cost'), v: e.budget === null ? t('No budget') : formatIdr(e.budget) },
    { k: t('Customer'), v: e.client },
    { k: t('Project manager'), v: e.pm },
    { k: t('Status'), v: projectStatusLabel(e) },
  ]
})

const planRows = computed(() => {
  const e = engagement.value
  if (!e) return []
  const plan = budgetOf(e)
  return [
    ...plan.revenue.map(l => ({ label: l.account, kind: t('Projected revenue'), amount: formatIdr(l.amount) })),
    ...plan.cost.map(l => ({ label: l.account, kind: t('Projected expense'), amount: formatIdr(l.amount) })),
  ]
})

// ── Addenda ───────────────────────────────────────────────────────────────────
const voFormOpen = ref(false)
const voValue = ref('')
const voReason = ref('')
/** No preselection: whether the change is separate work is a judgment the submitter must make. */
const voDistinct = ref<boolean | null>(null)
const voErrors = reactive({ value: '', reason: '', distinct: '' })
const voConfirmId = ref<string | null>(null)
const addendaCard = ref<HTMLElement | null>(null)

/** Title-bar "Submit addendum": go to Setup, open the form, bring it into view. */
function openAddendumForm() {
  goTab('setup')
  voFormOpen.value = true
  nextTick(() => {
    setTimeout(() => addendaCard.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  })
}

function resetVoForm() {
  voValue.value = ''; voReason.value = ''; voDistinct.value = null
  voErrors.value = ''; voErrors.reason = ''; voErrors.distinct = ''
}

function submitAddendum() {
  const e = engagement.value
  if (!e) return
  const val = Number(voValue.value)
  voErrors.value = !val || val <= 0 ? t('You must fill in the revised contract value') : ''
  voErrors.reason = voReason.value.trim().length < 5 ? t('Enter a reason of at least 5 characters') : ''
  voErrors.distinct = voDistinct.value === null ? t('Choose whether this is new, separately priced work') : ''
  if (voErrors.value || voErrors.reason || voErrors.distinct) return
  const before = e.vos.length
  addAddendumAs(e.id, val, voReason.value, voDistinct.value === true, currentUser.value.name)
  const added = e.vos[before]
  const gate = added ? approvalFor(e, 'addendum', added.id) : undefined
  resetVoForm()
  voFormOpen.value = false
  toast.notify({
    variant: 'success',
    title: gate ? `${t('Addendum submitted.')} ${waitingFor(gate)}.` : t('Addendum submitted.'),
    maxWidth: 'max-content',
  })
}

const confirmingVo = computed<Addendum | null>(() => engagement.value?.vos.find(v => v.id === voConfirmId.value) ?? null)

/** Plain-language statement of what approving does to revenue already recognized. */
const voEffect = computed(() => {
  const e = engagement.value
  const vo = confirmingVo.value
  if (!e || !vo) return ''
  if (e.method === 'output') {
    return vo.distinct
      ? `${t('Existing milestones keep their amounts. The added work gets its own milestone of')} ${formatIdr(vo.newValue - vo.oldValue)}.`
      : t('Verified milestones stay locked. Confirm the remaining milestone weights against the new value before verifying more.')
  }
  if (e.method === 'input') {
    return vo.distinct
      ? `${t('Revenue recognized to date')} (${formatIdr(revenue(e))}) ${t('stays as is. The added work is recognized from this period on.')}`
      : `${t('Revenue is recalculated at')} ${pocPct(e).toFixed(0)}% ${t('of the new contract value. A one-time catch-up adjustment of')} ${formatIdr(Math.round((pocPct(e) / 100) * vo.newValue - revenue(e)))} ${t('posts in the current period.')}`
  }
  return t('The fee estimate is replaced. Reviewed and billed work is not restated.')
})

/** Who may decide a pending addendum: the engine's approval record when a rule matched,
 *  otherwise anyone but the person who submitted it. */
function addendumDecision(v: Addendum) {
  const e = engagement.value
  if (!e) return { ok: false, reason: '' }
  const a = approvalFor(e, 'addendum', v.id)
  if (a) return decision(a)
  if (v.raisedBy.startsWith(currentUser.value.name)) return { ok: false, reason: t('You submitted this addendum, so another person must decide it') }
  return { ok: true, reason: '' }
}

function doApproveVo() {
  const e = engagement.value
  const id = voConfirmId.value
  if (!e || !id) return
  const a = approvalFor(e, 'addendum', id)
  const ok = a ? approveRequest(e.id, a.id, currentUser.value.name) : (approveAddendumAs(e.id, id, currentUser.value.name), true)
  voConfirmId.value = null
  toast.notify(ok
    ? { variant: 'success', title: t('Addendum approved'), maxWidth: 'max-content' }
    : { variant: 'error', title: t('Unable to approve this addendum'), maxWidth: 'max-content' })
}

// ── Reject (addendum, milestone verification, project creation) ──────────────
type RejectTarget = { kind: 'addendum'; voId: string; label: string } | { kind: 'approval'; approval: PendingApproval; label: string }
const rejectTarget = ref<RejectTarget | null>(null)
const rejectTitle = computed(() => {
  const r = rejectTarget.value
  if (!r) return ''
  if (r.kind === 'addendum') return t('Reject addendum')
  return r.approval.action === 'project-creation' ? t('Reject project') : t('Reject milestone verification')
})

function startRejectVo(v: Addendum) {
  const e = engagement.value
  if (!e) return
  const a = approvalFor(e, 'addendum', v.id)
  rejectTarget.value = a
    ? { kind: 'approval', approval: a, label: v.reason }
    : { kind: 'addendum', voId: v.id, label: v.reason }
}

function confirmReject(reason: string) {
  const e = engagement.value
  const r = rejectTarget.value
  if (!e || !r) return
  let ok = true
  if (r.kind === 'addendum') rejectAddendumAs(e.id, r.voId, currentUser.value.name, reason)
  else ok = rejectRequest(e.id, r.approval.id, currentUser.value.name, reason)
  const what = r.kind === 'approval' && r.approval.action !== 'addendum'
    ? (r.approval.action === 'project-creation' ? t('Project rejected') : t('Verification rejected'))
    : t('Addendum rejected')
  rejectTarget.value = null
  toast.notify(ok
    ? { variant: 'success', title: what, maxWidth: 'max-content' }
    : { variant: 'error', title: t('Unable to reject this request'), maxWidth: 'max-content' })
}

/** Approve a non-addendum request (milestone verification, project creation). */
function approvePending(a: PendingApproval) {
  const e = engagement.value
  if (!e) return
  const ok = approveRequest(e.id, a.id, currentUser.value.name)
  const title = a.action === 'project-creation' ? t('Project approved') : t('Milestone verification approved')
  toast.notify(ok
    ? { variant: 'success', title, maxWidth: 'max-content' }
    : { variant: 'error', title: t('Unable to approve this request'), maxWidth: 'max-content' })
}

const voRows = computed(() => {
  const e = engagement.value
  if (!e) return []
  const original = e.vos.length ? e.vos[0]!.oldValue : (e.method === 'tm' ? e.feeEstimate : e.contractValue)
  const head = {
    id: '__original',
    date: t('At creation'),
    reason: t('Original contract'),
    oldValue: '—',
    newValue: formatIdr(original),
    scope: '',
    trail: t('Locked at creation'),
    rejectNote: '',
    adjNote: '',
    status: 'completed',
    statusLabel: t('Original'),
    vo: null as Addendum | null,
    pendingChip: '',
  }
  return [head, ...e.vos.map((v) => {
    const a = approvalFor(e, 'addendum', v.id)
    return {
      id: v.id,
      date: formatDateLong(v.date),
      reason: v.reason,
      oldValue: formatIdr(v.oldValue),
      newValue: formatIdr(v.newValue),
      scope: v.distinct ? t('Separate new work') : t('Extends existing work'),
      trail: v.approvedBy
        ? `${t('Submitted by')} ${v.raisedBy} · ${t('approved by')} ${v.approvedBy}`
        : v.status === 'Rejected'
          ? `${t('Submitted by')} ${v.raisedBy}${v.rejectedBy ? ` · ${t('rejected by')} ${v.rejectedBy}` : ''}`
          : `${t('Submitted by')} ${v.raisedBy}`,
      rejectNote: v.status === 'Rejected' && v.rejectReason ? `${t('Reason')}: ${v.rejectReason}` : '',
      adjNote: v.adjustment ? `${t('Catch-up adjustment of')} ${formatIdr(v.adjustment)} ${t('in the current period')}` : '',
      status: v.status === 'Pending' ? 'pending' : v.status.toLowerCase(),
      statusLabel: v.status === 'Pending' ? t('Pending approval') : t(v.status),
      vo: v.status === 'Pending' ? v : null,
      pendingChip: a ? a.ruleName : '',
    }
  })]
})

// Separate new work on a milestones project owes the contract its own milestone.
const scopeLabel = ref('')
const scopeError = ref('')
const scopeFormOpen = ref(false)
function saveScopeMilestone() {
  const e = engagement.value
  if (!e) return
  if (!scopeLabel.value.trim()) { scopeError.value = t('You must fill in milestone name'); return }
  const added = addScopeMilestone(e.id, scopeLabel.value)
  scopeLabel.value = ''; scopeError.value = ''; scopeFormOpen.value = false
  toast.notify({ variant: 'success', title: `${t('Milestone added')} · ${formatIdr(added)}`, maxWidth: 'max-content' })
}

// ── Costs tab: the tagged-transaction rollup (ErpTablePage + useTableState) ──
/** Pixel has no purple/amber badge pair for sources — map onto the semantic set. */
const SRC_BADGE: Record<string, string> = { Expense: 'information', Purchase: 'warning', Sales: 'completed' }

const costRowsAll = computed(() => (engagement.value?.entries ?? []).map(x => ({
  id: x.id,
  src: x.src,
  docNo: x.docNo,
  description: entryLabel(x),
  vendor: x.vendor,
  hoursNote: x.hours ? `${x.hours} h ${t('at')} ${formatIdrShort(Math.round(x.amount / x.hours))}/h` : '',
  date: x.date,
  cost: x.amount,
})))
const costTable = useTableState(costRowsAll, {
  perPage: 25,
  defaultSort: { key: 'date', dir: 'desc' },
  filterFn: (r, s) => !s || `${r.description} ${r.vendor} ${r.docNo} ${r.src}`.toLowerCase().includes(s),
})
const { search: rollSearch } = costTable
const rollFilteredTotal = computed(() => costRowsAll.value
  .filter(r => !rollSearch.value.trim() || `${r.description} ${r.vendor} ${r.docNo} ${r.src}`.toLowerCase().includes(rollSearch.value.trim().toLowerCase()))
  .reduce((a, r) => a + r.cost, 0))

const costColumns: TableColumn[] = [
  { key: 'src', label: 'Source', kind: 'status', sortType: 'text' },
  { key: 'docNo', label: 'Document', kind: 'number' },
  { key: 'description', label: 'Description', kind: 'name' },
  { key: 'date', label: 'Date', kind: 'date', sortType: 'date' },
  { key: 'cost', label: 'Cost', kind: 'amount', align: 'right', sortType: 'number' },
]

// Hours are analytical only — they never enter an amount, they only explain one.
const hourLines = computed(() => engagement.value?.entries.filter(x => Number(x.hours) > 0) ?? [])
const totalHours = computed(() => hourLines.value.reduce((a, x) => a + (x.hours ?? 0), 0))
const hourCost = computed(() => hourLines.value.reduce((a, x) => a + x.amount, 0))
const hourStats = computed<ProjectStat[]>(() => {
  const e = engagement.value
  if (!e) return []
  const h = totalHours.value
  return [
    { key: 'h', label: t('Hours logged'), value: `${h} h`, sub: `${hourLines.value.length} ${t('of')} ${costLinesLabel(e.entries.length)} ${hourLines.value.length === 1 ? t('has hours') : t('have hours')}` },
    { key: 'cph', label: t('Cost per hour'), value: h ? formatIdr(Math.round(hourCost.value / h)) : '—', sub: `${t('Across')} ${h} ${t('logged hours')}` },
    e.method === 'tm'
      ? { key: 'chg', label: t('Billable per hour'), value: h ? formatIdr(Math.round((hourCost.value * (1 + e.markupPct / 100)) / h)) : '—', sub: `${t('Includes')} ${e.markupPct}% ${t('margin')}` }
      : { key: 'exp', label: t('Cost with hours'), value: formatIdr(hourCost.value), sub: `${t('Of')} ${formatIdr(actualCost(e))} ${t('cost incurred')}` },
  ]
})
const hourCoverage = computed(() => {
  const e = engagement.value
  if (!e) return ''
  const uncovered = actualCost(e) - hourCost.value
  return uncovered > 0
    ? `${formatIdr(uncovered)} ${t('of cost has no hours and is excluded from these rates.')}`
    : ''
})

// ── Budget variance (Costs tab only, to date) ────────────────────────────────
type VarianceRow = BudgetReportRow & { lifetimeBudget?: number | null }
const budgetRows = computed<VarianceRow[]>(() => (engagement.value ? budgetReport(engagement.value) : []))
const varianceOpen = ref(true)
/** Colour comes only from the engine's tone: red is reserved for a real overrun. */
function toneOf(r: VarianceRow) { return r.tone === 'adverse' ? 'adverse' : r.tone === 'positive' ? 'positive' : 'default' }

// ── Revenue recognition: cost-plus review queue ──────────────────────────────
const selected = ref<string[]>([])
const pendingAction = ref<Exclude<CostDecision, null> | null>(null)
const pendingReason = ref('')
const pendingWarn = ref('')
const reviewChip = ref<'all' | '30' | '60' | '90' | '90p'>('all')

const openLines = computed(() => [...openEntries(engagement.value ?? ({ entries: [] } as unknown as Engagement))]
  .sort((a, b) => daysAgo(b.date) - daysAgo(a.date)))

function inBucket(lo: number, hi: number) { return openLines.value.filter(x => { const d = daysAgo(x.date); return d > lo && d <= hi }) }
/** Disjoint age buckets, the same four the "Awaiting review, by age" card uses. */
const BUCKETS: Record<'30' | '60' | '90' | '90p', [number, number]> = { 30: [-1, 30], 60: [30, 60], 90: [60, 90], '90p': [90, 1e9] }
const bulkChips = computed(() => [
  { key: 'all' as const, label: `${t('All open')} (${openLines.value.length})` },
  { key: '30' as const, label: `${t('0–30 days')} (${inBucket(-1, 30).length})` },
  { key: '60' as const, label: `${t('31–60 days')} (${inBucket(30, 60).length})` },
  { key: '90' as const, label: `${t('61–90 days')} (${inBucket(60, 90).length})` },
  { key: '90p' as const, label: `${t('90+ days')} (${inBucket(90, 1e9).length})` },
])
const reviewLines = computed(() => reviewChip.value === 'all' ? openLines.value : inBucket(...BUCKETS[reviewChip.value]))

function ageTone(x: CostEntry) { const d = daysAgo(x.date); return d <= 30 ? 'ok' : d <= 60 ? 'default' : d <= 90 ? 'near' : 'over' }
const reviewRowsAll = computed(() => reviewLines.value.map(x => ({
  id: x.id, item: entryLabel(x), date: x.date, amount: entryAmount(x), age: daysAgo(x.date), tone: ageTone(x),
})))
const reviewTable = useTableState(reviewRowsAll, { perPage: 25, defaultSort: { key: 'age', dir: 'desc' } })
const reviewColumns: TableColumn[] = [
  { key: 'item', label: 'Item', kind: 'name' },
  { key: 'date', label: 'Date', kind: 'date' },
  { key: 'amount', label: 'Amount', kind: 'amount', align: 'right' },
  { key: 'age', label: 'Age', kind: 'default' },
]
/** ErpTablePage reports selection by row index on the current page. */
function pickSelection(rowsSet: Set<number>) {
  selected.value = [...rowsSet].map(i => reviewTable.paginated.value[i]?.id).filter((x): x is string => !!x)
}

const selectionTotal = computed(() => (engagement.value?.entries ?? [])
  .filter(x => selected.value.includes(x.id))
  .reduce((a, x) => a + entryAmount(x), 0))

const pendingTitle = computed(() => {
  if (pendingAction.value === 'bill') return t('Charge cost + margin?')
  if (pendingAction.value === 'atcost') return t('Reason for charging at cost only')
  return t('Reason for waiving the charge')
})

const pendingConfirmLabel = computed(() => {
  if (pendingAction.value === 'bill') return t('Charge cost + margin')
  if (pendingAction.value === 'atcost') return t('Charge at cost only')
  return t('Waive charge')
})

function startAction(type: Exclude<CostDecision, null>, rowsSet: Set<number>) {
  pickSelection(rowsSet)
  if (!selected.value.length) return
  pendingAction.value = type
  pendingReason.value = ''
  pendingWarn.value = ''
}

function confirmDecision() {
  const e = engagement.value
  if (!e || !pendingAction.value) return
  if (pendingAction.value !== 'bill' && pendingReason.value.trim().length < 5) {
    pendingWarn.value = t('Enter a reason of at least 5 characters')
    return
  }
  const count = selected.value.length
  const total = decideEntries(e.id, selected.value, pendingAction.value)
  selected.value = []
  pendingAction.value = null
  pendingReason.value = ''
  pendingWarn.value = ''
  toast.notify({
    variant: 'success',
    title: `${costLinesLabel(count)} ${t('reviewed')} · ${formatIdr(total)}. ${t('Ready to invoice')}`,
    maxWidth: 'max-content',
  })
}

// Cost-plus summary rows.
const tmRows = computed(() => {
  const e = engagement.value
  if (!e) return []
  const gross = e.entries.reduce((a, x) => a + entryAmount(x), 0)
  const rows = [
    { k: t('Cost incurred'), note: t('Cost lines tagged to this project'), val: formatIdr(actualCost(e)) },
    { k: t('Agreed margin on cost'), note: t('From the contract'), val: `+${e.markupPct}%` },
    { k: t('Value at cost + margin'), note: t('If every line is charged in full'), val: formatIdr(gross) },
    { k: t('Revenue recognized to date'), note: t('Reviewed lines only'), val: formatIdr(revenue(e)) },
  ]
  if (totalHours.value > 0) {
    rows.splice(1, 0, {
      k: t('Hours logged'),
      note: '',
      val: `${totalHours.value} h ${t('at')} ${formatIdrShort(Math.round(hourCost.value / totalHours.value))}/h`,
    })
  }
  return rows
})

const tmEarnedPct = computed(() => {
  const e = engagement.value
  if (!e) return 0
  const gross = e.entries.reduce((a, x) => a + entryAmount(x), 0)
  return gross ? (revenue(e) / gross) * 100 : 0
})
const tmOpenValue = computed(() => openLines.value.reduce((a, x) => a + entryAmount(x), 0))

const bucketRows = computed(() => {
  const e = engagement.value
  if (!e) return []
  const b = ageBuckets(e)
  const max = Math.max(1, ...Object.values(b))
  const tone: Record<string, string> = { '0–30 days': 'ok', '31–60 days': 'near', '61–90 days': 'near', '90+ days': 'over' }
  return Object.keys(b).map(k => ({ label: k, amount: formatIdr(b[k]!), width: `${((b[k]! / max) * 100).toFixed(0)}%`, tone: tone[k] ?? 'ok' }))
})

// ── Percentage of completion: cost lines (paginated) ──────────────────────────
const inputRowsAll = computed(() => (engagement.value?.entries ?? []).map(x => ({
  id: x.id, item: entryLabel(x), src: x.src, date: x.date, cost: x.amount,
})))
const inputTable = useTableState(inputRowsAll, { perPage: 25, defaultSort: { key: 'date', dir: 'desc' } })
const inputColumns: TableColumn[] = [
  { key: 'item', label: 'Item', kind: 'name' },
  { key: 'src', label: 'Source', kind: 'default' },
  { key: 'date', label: 'Date', kind: 'date', sortType: 'date' },
  { key: 'cost', label: 'Cost', kind: 'amount', align: 'right', sortType: 'number' },
]

// ── Milestones ────────────────────────────────────────────────────────────────
const weightSum = computed(() => (engagement.value?.milestones ?? []).reduce((a, m) => a + m.pct, 0))
const weightsOk = computed(() => Math.round(weightSum.value) === 100)

/** "12 Aug 2026 · Verified by Andi · BAST-014.pdf" — the audit line on a verified milestone. */
function verifiedLine(m: { verifiedAt?: string | null; verifiedBy?: string | null; document?: string | null }) {
  const parts = [
    m.verifiedAt ? formatDateLong(m.verifiedAt) : '',
    m.verifiedBy ? `${t('Verified by')} ${m.verifiedBy}` : '',
    m.document ?? '',
  ].filter(Boolean)
  return parts.join(' · ')
}

const outputMilestones = computed(() => {
  const e = engagement.value
  if (!e?.milestones) return []
  return e.milestones.map((m) => {
    const awaitingInvoice = m.verified && !m.invId
    const approval = approvalFor(e, 'milestone-verification', m.id)
    return {
      id: m.id,
      label: m.label,
      pct: `${Math.round(m.pct * 100) / 100}%`,
      amountNum: m.verified ? m.recognized : Math.round((e.contractValue * m.pct) / 100),
      amount: m.verified ? formatIdr(m.recognized) : formatIdr((e.contractValue * m.pct) / 100),
      statusLabel: approval ? t('Pending approval') : m.invId ? t('Invoiced') : m.verified ? t('Awaiting invoice') : t('Not verified'),
      // A real status key, so the badge stays correct even without the type override.
      statusKey: approval ? 'pending' : m.invId ? 'invoiced' : m.verified ? 'verified' : 'not started',
      note: approval ? '' : awaitingInvoice ? t('Create the invoice in Invoices & payments') : '',
      verifiedLine: m.verified ? verifiedLine(m) : '',
      approval,
      canVerify: !approval && !m.verified && weightsOk.value && !e.weightsNeedConfirm && !isClosed.value,
      showUnverify: m.verified && !isClosed.value,
      locked: !!m.invId,
    }
  })
})

const weightDraft = ref<{ id: string; label: string; pct: string }[]>([])
const weightError = ref('')
watch(() => engagement.value?.weightsNeedConfirm, (needs) => {
  if (needs && engagement.value?.milestones) {
    weightDraft.value = engagement.value.milestones.map(m => ({ id: m.id, label: m.label, pct: String(Math.round(m.pct * 100) / 100) }))
  }
}, { immediate: true })

function doConfirmWeights() {
  const e = engagement.value
  if (!e) return
  const ok = confirmWeights(e.id, weightDraft.value)
  if (!ok) {
    const sum = weightDraft.value.reduce((a, w) => a + (Number(w.pct) || 0), 0)
    weightError.value = `${t('Weights total')} ${sum}%. ${t('Adjust them to total 100%')}`
    return
  }
  weightError.value = ''
  toast.notify({ variant: 'success', title: t('Milestone weights confirmed'), maxWidth: 'max-content' })
}

// Verify milestone → VerifyMilestoneModal → submitMilestoneVerification
const verifyMid = ref<string | null>(null)
const verifyingMilestone = computed(() => outputMilestones.value.find(m => m.id === verifyMid.value) ?? null)
const verifyGate = computed(() => {
  const e = engagement.value
  const m = verifyingMilestone.value
  if (!e || !m) return { needsApproval: false, approverNames: [] as string[] }
  const res = check_approval_required('project.milestone_verification', m.amountNum, e.id)
  const names = res.approval_levels.flatMap(l => l.approver_ids)
    .map(id => getUserById(id)?.name ?? '')
    .filter(Boolean)
  return { needsApproval: res.approval_required, approverNames: [...new Set(names)] }
})

function doVerify(info: MilestoneVerificationInput) {
  const e = engagement.value
  const mid = verifyMid.value
  if (!e || !mid) return
  verifyMid.value = null
  const res = submitMilestoneVerification(e.id, mid, info, currentUser.value.name)
  if (res.status === 'verified') {
    toast.notify({ variant: 'success', title: `${t('Milestone verified')}. ${formatIdr(res.amount)} ${t('recognized')}`, maxWidth: 'max-content' })
  } else if (res.status === 'pending') {
    toast.notify({ variant: 'success', title: `${t('Sent for approval.')} ${waitingFor(res.approval)}.`, maxWidth: 'max-content' })
  } else {
    toast.notify({ variant: 'error', title: t('Unable to verify this milestone'), maxWidth: 'max-content' })
  }
}

function doUnverify(mid: string) {
  const e = engagement.value
  if (!e) return
  if (!unverifyMilestone(e.id, mid)) {
    toast.notify({ variant: 'error', title: t('Milestone already invoiced. Void the invoice first'), maxWidth: 'max-content' })
    return
  }
  toast.notify({ variant: 'success', title: t('Verification reversed'), maxWidth: 'max-content' })
}

// ── Invoices & payments ───────────────────────────────────────────────────────
const readyLines = computed(() => readyToInvoice(engagement.value ?? ({ entries: [] } as unknown as Engagement)))
const readyAmount = computed(() => readyLines.value.reduce((a, x) => a + entryFinal(x), 0))

function newInvoice(kind: string, label: string, milestoneId?: string) {
  const e = engagement.value
  if (!e) return
  router.push({ path: '/project-accounting/invoice/new', query: { project: e.id, kind, label, milestone: milestoneId ?? undefined } })
}

const STATUS_LABEL: Record<BillingStatus, string> = { paid: 'Paid', invoiced: 'Unpaid', notdue: 'Not invoiced' }
const STATUS_KEY: Record<BillingStatus, string> = { paid: 'paid', invoiced: 'unpaid', notdue: 'not started' }

const billingRows = computed(() => {
  const e = engagement.value
  if (!e) return []
  if (e.method === 'input') {
    return (e.billing ?? []).map((m) => {
      // Status comes only from the linked invoice — a row is never "Paid" without one.
      const st = billingStatusOf(e, m)
      return {
        id: m.id,
        label: m.label,
        sub: '',
        invoice: st === 'notdue' ? '' : (m.invId ?? ''),
        amount: formatIdr((e.contractValue * m.pct) / 100),
        statusLabel: t(STATUS_LABEL[st]),
        statusKey: STATUS_KEY[st],
        hasAction: st !== 'paid' && !isClosed.value,
        actionLabel: st === 'notdue' ? t('Create invoice') : t('Record payment'),
        action: st === 'notdue'
          ? () => newInvoice('billing', m.label, m.id)
          : () => { if (m.invId) doRecordPayment(m.invId) },
      }
    })
  }
  return (e.milestones ?? []).map((m) => {
    const inv = m.invId ? e.invoices.find(i => i.id === m.invId) : undefined
    const approval = approvalFor(e, 'milestone-verification', m.id)
    const awaitingInvoice = m.verified && !m.invId
    const st: BillingStatus = inv ? (inv.status === 'paid' ? 'paid' : 'invoiced') : 'notdue'
    return {
      id: m.id,
      label: m.label,
      sub: m.verified ? verifiedLine(m) : '',
      invoice: inv?.id ?? '',
      amount: m.verified ? formatIdr(m.recognized) : formatIdr((e.contractValue * m.pct) / 100),
      statusLabel: approval ? t('Pending approval') : inv ? t(STATUS_LABEL[st]) : awaitingInvoice ? t('Awaiting invoice') : t('Not verified'),
      statusKey: approval ? 'pending' : inv ? STATUS_KEY[st] : awaitingInvoice ? 'pending' : 'not started',
      hasAction: !isClosed.value && !approval && (awaitingInvoice || (!m.verified && !e.weightsNeedConfirm && weightsOk.value) || st === 'invoiced'),
      actionLabel: awaitingInvoice ? t('Create invoice') : st === 'invoiced' ? t('Record payment') : t('Verify milestone'),
      action: awaitingInvoice
        ? () => newInvoice('output', m.label, m.id)
        : st === 'invoiced'
          ? () => { if (inv) doRecordPayment(inv.id) }
          : () => { verifyMid.value = m.id },
    }
  })
})

function doRecordPayment(invId: string) {
  const e = engagement.value
  if (!e) return
  recordPayment(e.id, invId)
  toast.notify({ variant: 'success', title: `${t('Payment recorded for')} ${invId}` })
}

// ── Project health ────────────────────────────────────────────────────────────
const margin = computed(() => {
  const e = engagement.value
  if (!e) return 0
  return revenue(e) - actualCost(e)
})
const marginSub = computed(() => {
  const e = engagement.value
  if (!e) return ''
  const rev = revenue(e)
  return rev > 0 ? `${((margin.value / rev) * 100).toFixed(0)}% ${t('of revenue recognized')}` : t('No revenue recognized yet')
})
const projected = computed(() => engagement.value ? projectedMargin(engagement.value) : { value: null, pct: null })

/** A real overrun gets one plain status line on Project health. */
const overBudgetLine = computed(() => {
  const e = engagement.value
  if (!e || e.budget === null || e.budget <= 0) return ''
  const cost = actualCost(e)
  if (cost <= e.budget) return ''
  return `${t('Cost')} ${Math.round((cost / e.budget) * 100)}% ${t('of budget')} · ${formatIdr(cost - e.budget)} ${t('over')}`
})

const closable = computed(() => (engagement.value ? canClose(engagement.value) : false))
const closeOpen = ref(false)
const reopenOpen = ref(false)
const closeSum = computed(() => engagement.value ? closeSummary(engagement.value) : { revenue: 0, cost: 0, margin: 0, marginPct: null })

function doClose() {
  const e = engagement.value
  if (!e) return
  if (!closeEngagementAs(e.id, currentUser.value.name)) {
    toast.notify({ variant: 'error', title: t('Unable to close this project'), maxWidth: 'max-content' })
    return
  }
  toast.notify({ variant: 'success', title: t('Project closed') })
}

function doReopen(reason: string) {
  const e = engagement.value
  if (!e) return
  if (!reopenEngagement(e.id, currentUser.value.name, reason)) {
    toast.notify({ variant: 'error', title: t('Unable to reopen this project'), maxWidth: 'max-content' })
    return
  }
  toast.notify({ variant: 'success', title: t('Project reopened') })
}

const closedLine = computed(() => {
  const e = engagement.value
  if (!e?.closedAt) return ''
  return `${t('Closed on')} ${formatDateLong(e.closedAt)}${e.closedBy ? ` ${t('by')} ${e.closedBy}` : ''}`
})

// ── Activity log (built from the record) ─────────────────────────────────────
const activityOpen = ref(false)
const activityEntries = computed<ActivityEntry[]>(() => {
  const e = engagement.value
  if (!e) return []
  const out: ActivityEntry[] = []
  const dates = [...e.entries.map(x => x.date), ...e.invoices.map(i => i.date), ...e.vos.map(v => v.date)].sort()
  out.push({ date: dates[0] ?? TODAY, user: e.pm, activity: t('Created project'), details: [{ label: t('Method'), value: methodLabel(e.method) }, { label: t('Customer'), value: e.client }] })
  e.vos.forEach((v) => {
    out.push({ date: v.date, user: v.raisedBy, activity: t('Submitted addendum'), details: [{ label: t('New value'), value: formatIdr(v.newValue) }, { label: t('Reason'), value: v.reason }] })
    if (v.status === 'Approved') out.push({ date: v.date, user: v.approvedBy ?? '', activity: t('Approved addendum'), details: [{ label: t('New value'), value: formatIdr(v.newValue) }] })
    if (v.status === 'Rejected') out.push({ date: v.date, user: v.rejectedBy ?? '', activity: t('Rejected addendum'), details: v.rejectReason ? [{ label: t('Reason'), value: v.rejectReason }] : [] })
  })
  ;(e.milestones ?? []).filter(m => m.verified).forEach((m) => {
    out.push({ date: m.verifiedAt ?? TODAY, user: m.verifiedBy ?? '', activity: t('Verified milestone'), details: [{ label: t('Milestone'), value: m.label }, { label: t('Revenue recognized'), value: formatIdr(m.recognized) }, ...(m.document ? [{ label: t('Document'), value: m.document }] : [])] })
  })
  ;(e.approvals ?? []).forEach((a) => {
    out.push({ date: a.submittedAt, user: a.submittedBy, activity: t('Sent for approval'), details: [{ label: t('Rule'), value: a.ruleName }, { label: t('Approvers'), value: a.approvers.join(', ') }] })
  })
  e.invoices.forEach((i) => {
    out.push({ date: i.date, user: e.pm, activity: t('Created invoice'), details: [{ label: t('Invoice'), value: i.id }, { label: t('Amount'), value: formatIdr(i.amount) }] })
    if (i.status === 'paid') out.push({ date: i.paidDate ?? i.date, user: e.pm, activity: t('Recorded payment'), details: [{ label: t('Invoice'), value: i.id }, { label: t('Amount'), value: formatIdr(i.amount) }] })
  })
  ;(e.reopenLog ?? []).forEach((r) => {
    out.push({ date: r.date, user: r.by, activity: t('Reopened project'), details: [{ label: t('Reason'), value: r.reason }] })
  })
  if (e.closedAt) out.push({ date: e.closedAt, user: e.closedBy ?? '', activity: t('Closed project'), details: [] })
  return out.sort((a, b) => b.date.localeCompare(a.date))
})
const lastActivity = computed(() => activityEntries.value[0])

// Top-level refs so the template unwraps them.
const { paginated: costPaged, total: costTotal, currentPage: costPage, perPage: costPerPage, sortKey: costSortKey, sortDir: costSortDir, setPage: setCostPage, setPerPage: setCostPerPage, toggleSort: toggleCostSort, setSort: setCostSort } = costTable
const { paginated: reviewPaged, total: reviewTotal, currentPage: reviewPage, perPage: reviewPerPage, setPage: setReviewPage, setPerPage: setReviewPerPage } = reviewTable
const { paginated: inputPaged, total: inputTotal, currentPage: inputPage, perPage: inputPerPage, sortKey: inputSortKey, sortDir: inputSortDir, setPage: setInputPage, setPerPage: setInputPerPage, toggleSort: toggleInputSort, setSort: setInputSort } = inputTable
watch(reviewChip, () => { setReviewPage(1) })
</script>

<template>
  <div v-if="engagement" class="detail-page">
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <MpTextlink id="pa-breadcrumb" as="a" class="detail-breadcrumb" @click.prevent="goList">{{ t('Project accounting') }}</MpTextlink>
        <div class="detail-titlerow">
          <h1 class="detail-title">{{ engagement.name }}</h1>
          <ErpStatusBadge :status="statusBadgeKey" :label="t(projectStatusLabel(engagement))" badge-for="additionalInformation" />
          <DetailJumpTo id="pa-jump" :items="jumpItems" :aria-label="t('Switch project')" :empty-text="t('No projects found')" @select="jumpTo" />
        </div>
        <p class="detail-subtitle">
          {{ engagement.client }} · {{ methodLabel(engagement.method) }} · {{ t('Managed by') }} {{ engagement.pm }}
        </p>
      </div>

      <div class="detail-bar-actions">
        <MpButton is-rounded
          v-if="activeStage === 'execution' && !isClosed"
          variant="secondary" left-icon="add"
          @click="router.push({ path: '/project-accounting/expense/new', query: { project: engagement.id } })"
        >
          {{ t('New expense') }}
        </MpButton>
        <MpButton is-rounded v-if="activeStage === 'billing' && !isClosed" variant="secondary" left-icon="add" @click="newInvoice('adhoc', t('Invoice'))">
          {{ t('New invoice') }}
        </MpButton>
        <MpButton is-rounded v-if="!isClosed" id="pa-submit-addendum" variant="secondary" @click="openAddendumForm">
          {{ t('Submit addendum') }}
        </MpButton>
      </div>
    </header>

    <div class="detail-stage">
      <!-- Project creation awaiting approval: a status line, not a banner. -->
      <div v-if="creationApproval" class="pa-statusline" data-tour="pa-creation-approval">
        <ErpStatusBadge status="pending" :label="t('Pending approval')" />
        <span class="pa-statusline-text">{{ creationApproval.ruleName }} · {{ t('Submitted by') }} {{ creationApproval.submittedBy }} {{ t('on') }} {{ formatDateLong(creationApproval.submittedAt) }}</span>
        <template v-if="decision(creationApproval).ok">
          <MpButton is-rounded variant="secondary" size="sm" @click="approvePending(creationApproval)">{{ t('Approve') }}</MpButton>
          <MpButton is-rounded variant="secondary" size="sm" @click="rejectTarget = { kind: 'approval', approval: creationApproval, label: engagement.name }">{{ t('Reject') }}</MpButton>
        </template>
        <span v-else class="pa-statusline-text">{{ decision(creationApproval).reason }}</span>
      </div>

      <ProjectStatCards :stats="stats" data-tour="pa-stats" />

      <a v-if="lastActivity" class="detail-updated" @click.prevent="activityOpen = true">
        {{ t('Last updated by') }} {{ lastActivity.user || engagement.pm }} {{ t('on') }} {{ formatDateLong(lastActivity.date) }}
      </a>

      <MpTabs id="pa-engagement-tabs" v-model="activeIndex" is-manual variant-color="green" class="pa-tabs">
        <MpTabList>
          <MpTab v-for="s in STAGES" :key="s.key" :value="s.key">{{ t(s.label) }}</MpTab>
        </MpTabList>

        <MpTabPanels>
          <!-- ═══ Setup & contract ═══════════════════════════════════════════ -->
          <MpTabPanel value="setup">
            <div class="pa-two-col">
              <section class="pa-card">
                <h2 class="pa-card-title pa-card-title--spaced">{{ t('Contract') }}</h2>
                <div class="pa-fields">
                  <ContentList v-for="r in contractRows" :key="r.k" :label="r.k" :value="r.v" />
                </div>
              </section>

              <section class="pa-card">
                <h2 class="pa-card-title pa-card-title--spaced">{{ t('Budget plan') }}</h2>
                <div class="pa-fields">
                  <ContentList v-for="(p, i) in planRows" :key="`${p.label}-${i}`" :label="p.kind">
                    <span class="pa-plan-row">
                      <span>{{ p.label }}</span>
                      <span class="pa-num">{{ p.amount }}</span>
                    </span>
                  </ContentList>
                </div>
              </section>
            </div>

            <!-- Separate new work owes the contract its own milestone. -->
            <section v-if="engagement.scopePending" class="pa-card pa-card--notice" data-tour="pa-scope-pending">
              <h2 class="pa-card-title">{{ t('Add a milestone for the added work') }}</h2>
              <p class="pa-card-desc">
                {{ t('The approved addendum added') }} {{ formatIdr(engagement.scopePending.added) }} {{ t('of separate work. Existing milestones keep their amounts.') }}
              </p>
              <MpButton is-rounded v-if="!scopeFormOpen" variant="secondary" @click="scopeFormOpen = true">{{ t('Add milestone') }}</MpButton>
              <div v-else class="pa-inline-form">
                <MpFormControl id="pa-scope-label" is-required :is-invalid="!!scopeError" class="pa-inline-field">
                  <MpFormLabel>{{ t('Milestone name') }}</MpFormLabel>
                  <MpInput id="pa-scope-label-input" v-model="scopeLabel" is-full-width />
                  <MpFormErrorMessage>{{ scopeError }}</MpFormErrorMessage>
                </MpFormControl>
                <span class="pa-inline-amount">{{ formatIdr(engagement.scopePending.added) }}</span>
                <MpButton is-rounded variant="secondary" @click="saveScopeMilestone">{{ t('Save milestone') }}</MpButton>
                <MpButton is-rounded variant="ghost" @click="scopeFormOpen = false; scopeLabel = ''; scopeError = ''">{{ t('Cancel') }}</MpButton>
              </div>
            </section>

            <!-- Contract milestones -->
            <section v-if="engagement.milestones?.length" class="pa-card" data-tour="pa-contract-milestones">
              <h2 class="pa-card-title">{{ t('Contract milestones') }}</h2>
              <table class="pa-table">
                <thead>
                  <tr>
                    <th class="pa-th">{{ t('Milestone') }}</th>
                    <th class="pa-th pa-th--num">{{ t('Weight') }}</th>
                    <th class="pa-th pa-th--num">{{ t('Amount') }}</th>
                    <th class="pa-th">{{ t('Status') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="m in outputMilestones" :key="m.id">
                    <td class="pa-td">
                      {{ m.label }}
                      <div v-if="m.verifiedLine" class="pa-tiny">{{ m.verifiedLine }}</div>
                    </td>
                    <td class="pa-td pa-td--num">{{ m.pct }}</td>
                    <td class="pa-td pa-td--num">{{ m.amount }}</td>
                    <td class="pa-td">
                      <ErpStatusBadge :status="m.statusKey" :label="m.statusLabel" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <!-- ── Contract addenda: append-only; the form opens from "Submit addendum" ── -->
            <section ref="addendaCard" class="pa-card" data-tour="pa-addenda">
              <div class="pa-card-head">
                <h2 class="pa-card-title">{{ t('Contract addenda') }}</h2>
                <MpButton is-rounded v-if="!voFormOpen && !isClosed" variant="secondary" @click="voFormOpen = true">{{ t('Submit addendum') }}</MpButton>
              </div>

              <div v-if="voFormOpen" class="pa-vo">
                <div class="pa-vo-form">
                  <MpFormControl id="pa-vo-value" is-required :is-invalid="!!voErrors.value">
                    <MpFormLabel>{{ t('Revised contract value') }}</MpFormLabel>
                    <MpInputGroup id="pa-vo-value-group" is-full-width>
                      <MpInputLeftAddon>Rp</MpInputLeftAddon>
                      <MpInput id="pa-vo-value-input" v-model="voValue" type="number" is-full-width />
                    </MpInputGroup>
                    <MpFormErrorMessage>{{ voErrors.value }}</MpFormErrorMessage>
                  </MpFormControl>
                  <MpFormControl id="pa-vo-reason" is-required :is-invalid="!!voErrors.reason">
                    <MpFormLabel>{{ t('Reason') }}</MpFormLabel>
                    <MpInput id="pa-vo-reason-input" v-model="voReason" is-full-width />
                    <MpFormErrorMessage>{{ voErrors.reason }}</MpFormErrorMessage>
                  </MpFormControl>
                </div>

                <MpFormControl id="pa-vo-distinct" is-required :is-invalid="!!voErrors.distinct" class="pa-box">
                  <MpFormLabel>{{ t('Is this new, separately priced work?') }}</MpFormLabel>
                  <div class="pa-choices" role="radiogroup">
                    <label class="pa-choice" :class="{ 'pa-choice--picked': voDistinct === false }">
                      <MpRadio id="pa-vo-distinct-no" name="pa-vo-distinct" value="extends" :is-checked="voDistinct === false" @change="voDistinct = false; voErrors.distinct = ''" />
                      <span class="pa-choice-body">
                        <span class="pa-choice-title">{{ t('Extends existing work') }}</span>
                        <span class="pa-choice-desc">{{ t('For example, a larger foundation. Revenue to date is adjusted in the current period.') }}</span>
                      </span>
                    </label>
                    <label class="pa-choice" :class="{ 'pa-choice--picked': voDistinct === true }">
                      <MpRadio id="pa-vo-distinct-yes" name="pa-vo-distinct" value="separate" :is-checked="voDistinct === true" @change="voDistinct = true; voErrors.distinct = ''" />
                      <span class="pa-choice-body">
                        <span class="pa-choice-title">{{ t('Separate new work') }}</span>
                        <span class="pa-choice-desc">{{ t('For example, a separate structure. Recognized from this period on, with its own milestone.') }}</span>
                      </span>
                    </label>
                  </div>
                  <MpFormErrorMessage>{{ voErrors.distinct }}</MpFormErrorMessage>
                </MpFormControl>

                <div class="pa-actions pa-actions--tight">
                  <MpButton variant="primary" is-rounded @click="submitAddendum">{{ t('Submit addendum') }}</MpButton>
                  <MpButton is-rounded variant="ghost" @click="voFormOpen = false; resetVoForm()">{{ t('Cancel') }}</MpButton>
                </div>
              </div>

              <table class="pa-table">
                <thead>
                  <tr>
                    <th class="pa-th">{{ t('Date') }}</th>
                    <th class="pa-th">{{ t('Change') }}</th>
                    <th class="pa-th pa-th--num">{{ t('Old value') }}</th>
                    <th class="pa-th pa-th--num">{{ t('New value') }}</th>
                    <th class="pa-th">{{ t('Status') }}</th>
                    <th class="pa-th" />
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="v in voRows" :key="v.id">
                    <td class="pa-td pa-td--muted">{{ v.date }}</td>
                    <td class="pa-td pa-td--wrap">
                      {{ v.reason }}
                      <div class="pa-chip-row">
                        <MpBadge v-if="v.scope" for="tableStatus" type="announcement">{{ v.scope }}</MpBadge>
                        <span class="pa-tiny">{{ v.trail }}</span>
                      </div>
                      <div v-if="v.rejectNote" class="pa-tiny">{{ v.rejectNote }}</div>
                      <div v-if="v.adjNote" class="pa-tiny pa-tiny--strong">{{ v.adjNote }}</div>
                    </td>
                    <td class="pa-td pa-td--num">{{ v.oldValue }}</td>
                    <td class="pa-td pa-td--num">{{ v.newValue }}</td>
                    <td class="pa-td">
                      <ErpStatusBadge :status="v.status" :label="v.statusLabel" />
                      <div v-if="v.pendingChip" class="pa-tiny">{{ v.pendingChip }}</div>
                    </td>
                    <td class="pa-td pa-td--actions">
                      <template v-if="v.vo">
                        <template v-if="addendumDecision(v.vo).ok">
                          <MpButton is-rounded variant="secondary" size="sm" @click="voConfirmId = v.id">{{ t('Approve') }}</MpButton>
                          <MpButton is-rounded variant="secondary" size="sm" @click="startRejectVo(v.vo)">{{ t('Reject') }}</MpButton>
                        </template>
                        <span v-else class="pa-tiny">{{ addendumDecision(v.vo).reason }}</span>
                      </template>
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>
          </MpTabPanel>

          <!-- ═══ Costs ══════════════════════════════════════════════════════ -->
          <MpTabPanel value="execution">
            <section class="pa-card" data-tour="pa-cost-lines">
              <h2 class="pa-card-title">{{ t('Cost lines') }}</h2>
              <ErpTablePage
                class="pa-erp-table"
                :columns="costColumns"
                :rows="costPaged"
                :total="costTotal"
                :current-page="costPage"
                :per-page="costPerPage"
                :sort-key="costSortKey"
                :sort-dir="costSortDir"
                :has-active-search="!!rollSearch.trim()"
                :search="rollSearch"
                filter-empty-label="cost line"
                no-row-hover
                @sort="toggleCostSort"
                @sort-change="setCostSort"
                @page-change="setCostPage"
                @per-page-change="setCostPerPage"
                @clear-search="rollSearch = ''"
                @clear-all="rollSearch = ''"
              >
                <template #filters>
                  <div class="filter-left">
                    <span class="pa-filter-note">
                      {{ rollSearch.trim() ? `${t('Matching lines')}: ${formatIdr(rollFilteredTotal)} ${t('of')} ${formatIdr(actualCost(engagement))}` : `${t('Total cost incurred')}: ${formatIdr(actualCost(engagement))}` }}
                    </span>
                  </div>
                  <div class="filter-right">
                    <div class="filter-search">
                      <MpIcon name="search" size="sm" />
                      <input v-model="rollSearch" class="filter-search-input" type="text" :placeholder="t('Search...')">
                      <button v-if="rollSearch" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="rollSearch = ''">
                        <MpIcon name="close" size="sm" />
                      </button>
                    </div>
                  </div>
                </template>
                <template #cell-src="{ row }">
                  <MpBadge for="tableStatus" :type="SRC_BADGE[String(row.src)]">{{ row.src }}</MpBadge>
                </template>
                <template #cell-description="{ row }">
                  <div class="pa-cellstack">
                    <span class="pa-ellipsis">{{ row.description }}</span>
                    <span class="pa-tiny pa-ellipsis">{{ row.vendor }}<template v-if="row.hoursNote"> · {{ row.hoursNote }}</template></span>
                  </div>
                </template>
                <template #cell-date="{ value }">{{ formatDate(String(value)) }}</template>
                <template #cell-cost="{ value }">{{ formatIdr(Number(value)) }}</template>
                <template #empty>
                  <p class="pa-note">{{ t('No cost lines yet. Cost lines tagged to this project appear here.') }}</p>
                </template>
              </ErpTablePage>
            </section>

            <section v-if="hourLines.length" class="pa-card">
              <h2 class="pa-card-title pa-card-title--spaced">{{ t('Hours and rates') }}</h2>
              <ProjectStatCards :stats="hourStats" />
              <p v-if="hourCoverage" class="pa-note">{{ hourCoverage }}</p>
            </section>

            <!-- ── Budget variance: once, here, to date. Red only for a real overrun. ── -->
            <section class="pa-card" data-tour="pa-budget-variance">
              <div class="pa-card-head">
                <h2 class="pa-card-title">{{ t('Budget variance') }}</h2>
                <MpButton is-rounded variant="ghost" :right-icon="varianceOpen ? 'chevrons-up' : 'chevrons-down'" @click="varianceOpen = !varianceOpen">
                  {{ varianceOpen ? t('Hide') : t('Show') }}
                </MpButton>
              </div>
              <template v-if="varianceOpen">
                <p v-if="engagement.budget === null" class="pa-note">
                  {{ t('No budget, so cost variance is not calculated.') }}
                  <MpTextlink id="pa-set-budget" as="a" @click.prevent="goTab('setup')">{{ t('Set budget') }}</MpTextlink>
                </p>
                <table class="pa-table">
                  <thead>
                    <tr>
                      <th class="pa-th">{{ t('Account') }}</th>
                      <th class="pa-th pa-th--num">{{ t('Budget to date') }}</th>
                      <th class="pa-th pa-th--num">{{ t('Actual') }}</th>
                      <th class="pa-th pa-th--num">{{ t('Variance') }}</th>
                      <th class="pa-th pa-th--num">{{ t('Variance %') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(r, i) in budgetRows" :key="`${r.label}-${i}`" :class="{ 'pa-tr--group': r.header, 'pa-tr--total': r.total }">
                      <td class="pa-td" :class="{ 'pa-td--strong': r.header || r.total }">{{ r.label }}</td>
                      <template v-if="!r.header">
                        <td class="pa-td pa-td--num" :class="{ 'pa-td--strong': r.total }">
                          {{ r.budget === null ? t('No budget') : formatIdrSigned(r.budget) }}
                          <div v-if="r.lifetimeBudget != null && r.lifetimeBudget !== r.budget" class="pa-tiny">{{ t('Lifetime') }} {{ formatIdr(r.lifetimeBudget) }}</div>
                        </td>
                        <td class="pa-td pa-td--num" :class="{ 'pa-td--strong': r.total }">{{ formatIdrSigned(r.actual) }}</td>
                        <td class="pa-td pa-td--num" :class="{ 'pa-td--strong': r.total }" :data-tone="toneOf(r)">{{ r.variance === null ? '—' : formatIdrSigned(r.variance) }}</td>
                        <td class="pa-td pa-td--num" :data-tone="toneOf(r)">
                          {{ r.pct === null ? '—' : `${r.pct.toFixed(0)}%` }}
                          <div v-if="r.tone === 'adverse' && r.note" class="pa-tiny">{{ r.note }}</div>
                        </td>
                      </template>
                      <td v-else class="pa-td" colspan="4" />
                    </tr>
                  </tbody>
                </table>
              </template>
            </section>

            <div class="pa-actions">
              <MpButton is-rounded variant="secondary" @click="continueTo('recognition')">{{ t('Continue to Revenue recognition') }}</MpButton>
            </div>
          </MpTabPanel>

          <!-- ═══ Revenue recognition ════════════════════════════════════════ -->
          <MpTabPanel value="recognition">
            <!-- ── Cost plus margin ── -->
            <template v-if="engagement.method === 'tm'">
              <section class="pa-card" data-tour="pa-tm-summary">
                <h2 class="pa-card-title pa-card-title--spaced">{{ methodLabel('tm') }}</h2>
                <div class="pa-progress">
                  <div class="pa-progress-fill" data-tone="ok" :style="{ width: `${tmEarnedPct.toFixed(0)}%` }" />
                </div>
                <div v-for="r in tmRows" :key="r.k" class="pa-kv-row pa-kv-row--wide">
                  <dt class="pa-kv-key">
                    <span class="pa-kv-strong">{{ r.k }}</span>
                    <span v-if="r.note" class="pa-tiny">{{ r.note }}</span>
                  </dt>
                  <dd class="pa-kv-val pa-num">{{ r.val }}</dd>
                </div>
                <p class="pa-note">
                  {{ tmOpenValue > 0
                    ? `${formatIdr(tmOpenValue)} ${t('awaiting review, not yet recognized.')}`
                    : t('All cost lines reviewed.') }}
                </p>
              </section>

              <section class="pa-card" data-tour="pa-review-queue">
                <h2 class="pa-card-title">{{ t('Review queue') }}</h2>
                <div class="pa-chips">
                  <MpButton is-rounded
                    v-for="c in bulkChips" :key="c.key"
                    variant="secondary" size="sm" :class="{ 'pa-chip--active': reviewChip === c.key }" :aria-pressed="reviewChip === c.key"
                    @click="reviewChip = c.key"
                  >{{ c.label }}</MpButton>
                </div>

                <ErpTablePage
                  class="pa-erp-table"
                  :columns="reviewColumns"
                  :rows="reviewPaged"
                  :total="reviewTotal"
                  :current-page="reviewPage"
                  :per-page="reviewPerPage"
                  has-checkbox
                  bulk-label="cost line"
                  no-row-hover
                  @page-change="setReviewPage"
                  @per-page-change="setReviewPerPage"
                >
                  <template #bulk-actions="{ selectedRows }">
                    <MpButton is-rounded variant="secondary" size="sm" @click="startAction('bill', selectedRows)">{{ t('Charge cost + margin') }}</MpButton>
                    <MpButton is-rounded variant="secondary" size="sm" @click="startAction('atcost', selectedRows)">{{ t('Charge at cost only') }}</MpButton>
                    <MpButton is-rounded variant="secondary" size="sm" @click="startAction('absorb', selectedRows)">{{ t('Waive charge') }}</MpButton>
                  </template>
                  <template #cell-date="{ value }">{{ formatDate(String(value)) }}</template>
                  <template #cell-amount="{ value }">{{ formatIdr(Number(value)) }}</template>
                  <template #cell-age="{ row }">
                    <span class="pa-age" :data-tone="row.tone">{{ row.age }} {{ row.age === 1 ? t('day') : t('days') }}</span>
                  </template>
                  <template #empty>
                    <p class="pa-note">{{ t('No lines to review. New cost lines tagged to this project appear here.') }}</p>
                  </template>
                </ErpTablePage>
              </section>

              <section v-if="pendingAction" class="pa-card">
                <h2 class="pa-card-title pa-card-title--spaced">{{ pendingTitle }}</h2>
                <p class="pa-card-desc">{{ selected.length }} {{ t('selected') }} · {{ formatIdr(selectionTotal) }}</p>
                <MpFormControl id="pa-decision-reason" :is-required="pendingAction !== 'bill'" :is-invalid="!!pendingWarn">
                  <MpFormLabel>{{ pendingAction === 'bill' ? t('Note (optional)') : t('Reason') }}</MpFormLabel>
                  <MpTextarea id="pa-decision-reason-input" v-model="pendingReason" is-full-width />
                  <MpFormErrorMessage>{{ pendingWarn }}</MpFormErrorMessage>
                </MpFormControl>
                <div class="pa-actions">
                  <MpButton variant="primary" is-rounded @click="confirmDecision">{{ pendingConfirmLabel }}</MpButton>
                  <MpButton is-rounded variant="ghost" @click="pendingAction = null; pendingWarn = ''">{{ t('Cancel') }}</MpButton>
                </div>
              </section>
            </template>

            <!-- ── Percentage of completion ── -->
            <template v-else-if="engagement.method === 'input'">
              <section class="pa-card" data-tour="pa-input-progress">
                <h2 class="pa-card-title pa-card-title--spaced">{{ methodLabel('input') }}</h2>
                <div class="pa-progress">
                  <div class="pa-progress-fill" data-tone="ok" :style="{ width: `${Math.min(100, pocPct(engagement)).toFixed(0)}%` }" />
                </div>
                <p class="pa-lead">{{ t('Revenue recognized to date') }}: <b>{{ formatIdr(revenue(engagement)) }}</b></p>
                <p v-if="engagement.budget === null" class="pa-note">
                  {{ t('No budget, so percentage complete is not calculated.') }}
                  <MpTextlink id="pa-set-budget-poc" as="a" @click.prevent="goTab('setup')">{{ t('Set budget') }}</MpTextlink>
                </p>
                <p v-else-if="actualCost(engagement) > engagement.budget" class="pa-note">
                  {{ t('Cost incurred exceeds the budgeted cost. Review the budget or submit an addendum.') }}
                </p>
              </section>

              <section class="pa-card">
                <h2 class="pa-card-title">{{ t('Cost lines') }}</h2>
                <ErpTablePage
                  class="pa-erp-table"
                  :columns="inputColumns"
                  :rows="inputPaged"
                  :total="inputTotal"
                  :current-page="inputPage"
                  :per-page="inputPerPage"
                  :sort-key="inputSortKey"
                  :sort-dir="inputSortDir"
                  no-row-hover
                  @sort="toggleInputSort"
                  @sort-change="setInputSort"
                  @page-change="setInputPage"
                  @per-page-change="setInputPerPage"
                >
                  <template #cell-date="{ value }">{{ formatDate(String(value)) }}</template>
                  <template #cell-cost="{ value }">{{ formatIdr(Number(value)) }}</template>
                  <template #empty>
                    <p class="pa-note">{{ t('No cost lines yet. Cost lines tagged to this project appear here.') }}</p>
                  </template>
                </ErpTablePage>
              </section>
            </template>

            <!-- ── Milestones ── -->
            <template v-else>
              <section class="pa-card" data-tour="pa-output-milestones">
                <h2 class="pa-card-title">{{ methodLabel('output') }}</h2>
                <p v-if="!weightsOk" class="pa-summary pa-summary--bad">
                  {{ `${t('Milestone weights total')} ${Math.round(weightSum)}%. ${t('Adjust them to 100% to verify milestones.')}` }}
                </p>

                <table class="pa-table">
                  <thead>
                    <tr>
                      <th class="pa-th">{{ t('Milestone') }}</th>
                      <th class="pa-th pa-th--num">{{ t('Weight') }}</th>
                      <th class="pa-th pa-th--num">{{ t('Amount') }}</th>
                      <th class="pa-th">{{ t('Status') }}</th>
                      <th class="pa-th" />
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="m in outputMilestones" :key="m.id">
                      <td class="pa-td pa-td--wrap">
                        {{ m.label }}
                        <div v-if="m.verifiedLine" class="pa-tiny">{{ m.verifiedLine }}</div>
                      </td>
                      <td class="pa-td pa-td--num">{{ m.pct }}</td>
                      <td class="pa-td pa-td--num">{{ m.amount }}</td>
                      <td class="pa-td">
                        <ErpStatusBadge :status="m.statusKey" :label="m.statusLabel" />
                        <div v-if="m.approval" class="pa-tiny">{{ m.approval.ruleName }} · {{ t('Submitted by') }} {{ m.approval.submittedBy }}</div>
                        <div v-if="m.note" class="pa-tiny">{{ m.note }}</div>
                      </td>
                      <td class="pa-td pa-td--actions">
                        <template v-if="m.approval">
                          <template v-if="decision(m.approval).ok">
                            <MpButton is-rounded variant="secondary" size="sm" @click="approvePending(m.approval)">{{ t('Approve') }}</MpButton>
                            <MpButton is-rounded variant="secondary" size="sm" @click="rejectTarget = { kind: 'approval', approval: m.approval, label: m.label }">{{ t('Reject') }}</MpButton>
                          </template>
                          <span v-else class="pa-tiny">{{ decision(m.approval).reason }}</span>
                        </template>
                        <MpButton is-rounded v-else-if="m.canVerify" variant="secondary" size="sm" @click="verifyMid = m.id">
                          {{ t('Verify milestone') }}
                        </MpButton>
                        <MpButton is-rounded
                          v-else-if="m.showUnverify" variant="secondary" size="sm"
                          :is-disabled="m.locked" @click="doUnverify(m.id)"
                        >
                          {{ m.locked ? t('Invoiced') : t('Reverse verification') }}
                        </MpButton>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section v-if="engagement.weightsNeedConfirm" class="pa-card pa-card--danger" data-tour="pa-weights-confirm">
                <h2 class="pa-card-title">{{ t('Milestone weights need confirming') }}</h2>
                <p class="pa-card-desc">
                  {{ t('An addendum changed the contract value. Weights must total 100% before more milestones can be verified.') }}
                </p>
                <div v-for="w in weightDraft" :key="w.id" class="pa-weight-row">
                  <span class="pa-weight-label">{{ w.label }}</span>
                  <MpInputGroup :id="`pa-w-group-${w.id}`" class="pa-weight-input">
                    <MpInput :id="`pa-w-${w.id}`" v-model="w.pct" type="number" :is-invalid="!!weightError" />
                    <MpInputRightAddon>%</MpInputRightAddon>
                  </MpInputGroup>
                </div>
                <p v-if="weightError" class="pa-warn">{{ weightError }}</p>
                <div class="pa-actions">
                  <MpButton variant="primary" is-rounded @click="doConfirmWeights">{{ t('Confirm weights') }}</MpButton>
                </div>
              </section>
            </template>

            <div class="pa-actions">
              <MpButton is-rounded variant="secondary" @click="continueTo('billing')">{{ t('Continue to Invoices & payments') }}</MpButton>
            </div>
          </MpTabPanel>

          <!-- ═══ Invoices & payments ════════════════════════════════════════ -->
          <MpTabPanel value="billing">
            <template v-if="engagement.method === 'tm'">
              <section class="pa-card" data-tour="pa-ready-invoice">
                <h2 class="pa-card-title pa-card-title--spaced">{{ t('Ready to invoice') }}</h2>
                <p class="pa-lead">
                  {{ readyLines.length
                    ? `${costLinesLabel(readyLines.length)} · ${formatIdr(readyAmount)}`
                    : t('No reviewed lines to invoice. Review cost lines in Revenue recognition.') }}
                </p>
                <MpButton v-if="readyLines.length && !isClosed" variant="primary" is-rounded @click="newInvoice('tm', t('Progress billing'))">
                  {{ t('Create invoice') }}
                </MpButton>
              </section>

              <section class="pa-card">
                <h2 class="pa-card-title pa-card-title--spaced">{{ t('Awaiting review, by age') }}</h2>
                <div v-for="b in bucketRows" :key="b.label" class="pa-bucket">
                  <span class="pa-bucket-label">{{ t(b.label) }}</span>
                  <span class="pa-bucket-track">
                    <span class="pa-bucket-fill" :data-tone="b.tone" :style="{ width: b.width }" />
                  </span>
                  <span class="pa-bucket-amount pa-num">{{ b.amount }}</span>
                </div>
              </section>
            </template>

            <section v-else class="pa-card" data-tour="pa-billing-schedule">
              <h2 class="pa-card-title">{{ t('Billing schedule') }}</h2>
              <table class="pa-table">
                <thead>
                  <tr>
                    <th class="pa-th">{{ t('Milestone') }}</th>
                    <th class="pa-th">{{ t('Invoice') }}</th>
                    <th class="pa-th pa-th--num">{{ t('Amount') }}</th>
                    <th class="pa-th">{{ t('Status') }}</th>
                    <th class="pa-th" />
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="m in billingRows" :key="m.id">
                    <td class="pa-td pa-td--wrap">
                      {{ m.label }}
                      <div v-if="m.sub" class="pa-tiny">{{ m.sub }}</div>
                    </td>
                    <td class="pa-td pa-td--muted">{{ m.invoice || '—' }}</td>
                    <td class="pa-td pa-td--num">{{ m.amount }}</td>
                    <td class="pa-td">
                      <ErpStatusBadge :status="m.statusKey" :label="m.statusLabel" />
                    </td>
                    <td class="pa-td pa-td--actions">
                      <MpButton is-rounded v-if="m.hasAction" variant="secondary" size="sm" @click="m.action()">{{ m.actionLabel }}</MpButton>
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section class="pa-card" data-tour="pa-invoices">
              <h2 class="pa-card-title">{{ t('Invoices') }}</h2>
              <table class="pa-table">
                <thead>
                  <tr>
                    <th class="pa-th">{{ t('Invoice number') }}</th>
                    <th class="pa-th">{{ t('Description') }}</th>
                    <th class="pa-th">{{ t('Date') }}</th>
                    <th class="pa-th pa-th--num">{{ t('Amount') }}</th>
                    <th class="pa-th">{{ t('Status') }}</th>
                    <th class="pa-th" />
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="i in engagement.invoices" :key="i.id">
                    <td class="pa-td pa-td--muted">{{ i.id }}</td>
                    <td class="pa-td">{{ i.label }}</td>
                    <td class="pa-td pa-td--muted">{{ formatDate(i.date) }}</td>
                    <td class="pa-td pa-td--num">{{ formatIdr(i.amount) }}</td>
                    <td class="pa-td">
                      <ErpStatusBadge
                        :status="i.status"
                        :label="i.status === 'paid' ? `${t('Paid')} ${formatDateLong(i.paidDate ?? '')}` : t('Unpaid')"
                      />
                    </td>
                    <td class="pa-td pa-td--actions">
                      <MpButton is-rounded v-if="i.status === 'unpaid' && !isClosed" variant="secondary" size="sm" @click="doRecordPayment(i.id)">
                        {{ t('Record payment') }}
                      </MpButton>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p v-if="!engagement.invoices.length" class="pa-note">{{ t('No invoices yet. Create one with New invoice.') }}</p>
            </section>
          </MpTabPanel>

          <!-- ═══ Project health ═════════════════════════════════════════════ -->
          <MpTabPanel value="closed">
            <section class="pa-card" data-tour="pa-margin">
              <div class="stats-section pa-health-stats">
                <div class="stat-card stat-card--bordered">
                  <p class="stat-title">{{ t('Margin to date') }}</p>
                  <p class="stat-period">{{ marginSub }}</p>
                  <p class="stat-amount pa-num">{{ formatIdrSigned(margin) }}</p>
                </div>
                <div class="stat-card">
                  <p class="stat-title">{{ t('Projected margin at completion') }}</p>
                  <p class="stat-period">
                    {{ projected.value === null ? t('No budget to project from') : projected.pct === null ? t('Contract value less expected cost') : `${projected.pct.toFixed(0)}% ${t('of contract value')}` }}
                  </p>
                  <p class="stat-amount pa-num">{{ projected.value === null ? '—' : formatIdrSigned(projected.value) }}</p>
                </div>
              </div>
              <p v-if="overBudgetLine" class="pa-statusline pa-statusline--plain" data-tour="pa-over-budget">
                <ErpStatusBadge status="overdue" :label="t('Over budget')" />
                <span class="pa-statusline-text">{{ overBudgetLine }}</span>
              </p>
            </section>

            <!-- Closed: who closed it, and the way back. -->
            <section v-if="isClosed" class="pa-card pa-card--bar" data-tour="pa-closed">
              <div>
                <h2 class="pa-card-title">{{ t('Project closed') }}</h2>
                <p class="pa-card-desc">{{ closedLine }}</p>
              </div>
              <MpButton is-rounded variant="secondary" @click="reopenOpen = true">{{ t('Reopen project') }}</MpButton>
            </section>

            <section v-else class="pa-card" data-tour="pa-close-gate">
              <div class="pa-card-head">
                <div>
                  <h2 class="pa-card-title">{{ closable ? t('Ready to close') : t('Not ready to close') }}</h2>
                  <p class="pa-card-desc">{{ closeHint(engagement) }}</p>
                </div>
                <MpButton is-rounded :variant="closable ? 'primary' : 'secondary'" @click="closable ? (closeOpen = true) : undefined">
                  {{ t('Close project') }}
                </MpButton>
              </div>
              <p v-if="(engagement.reopenLog ?? []).length" class="pa-note">
                {{ t('Reopened on') }} {{ formatDateLong(engagement.reopenLog![engagement.reopenLog!.length - 1]!.date) }} {{ t('by') }} {{ engagement.reopenLog![engagement.reopenLog!.length - 1]!.by }} · {{ engagement.reopenLog![engagement.reopenLog!.length - 1]!.reason }}
              </p>
            </section>
          </MpTabPanel>
        </MpTabPanels>
      </MpTabs>
    </div>

    <ApproveAddendumModal
      v-if="confirmingVo"
      :is-open="!!confirmingVo"
      :old-value="confirmingVo.oldValue"
      :new-value="confirmingVo.newValue"
      :reason="confirmingVo.reason"
      :effect="voEffect"
      :raised-by="confirmingVo.raisedBy"
      :approver-name="currentUser.name"
      :approver-role="currentUser.role"
      @update:is-open="voConfirmId = null"
      @confirm="doApproveVo"
    />
    <RejectRequestModal
      v-if="rejectTarget"
      :is-open="!!rejectTarget"
      :title="rejectTitle"
      :subject="rejectTarget.label"
      @update:is-open="rejectTarget = null"
      @confirm="confirmReject"
    />
    <VerifyMilestoneModal
      v-if="verifyingMilestone"
      :is-open="!!verifyingMilestone"
      :milestone-label="verifyingMilestone.label"
      :amount="verifyingMilestone.amountNum"
      :default-verifier="currentUser.name"
      :today="TODAY"
      :needs-approval="verifyGate.needsApproval"
      :approver-names="verifyGate.approverNames"
      @update:is-open="verifyMid = null"
      @confirm="doVerify"
    />
    <CloseProjectModal
      v-if="closeOpen"
      :is-open="closeOpen"
      :project-name="engagement.name"
      :summary="closeSum"
      @update:is-open="closeOpen = $event"
      @confirm="doClose"
    />
    <ReopenProjectModal
      v-if="reopenOpen"
      :is-open="reopenOpen"
      :project-name="engagement.name"
      @update:is-open="reopenOpen = $event"
      @confirm="doReopen"
    />
    <ActivityLogModal
      :is-open="activityOpen"
      :subject="engagement.name"
      :updated-by="lastActivity?.user || engagement.pm"
      :updated-at="lastActivity?.date ?? ''"
      :entries="activityEntries"
      @close="activityOpen = false"
    />

    <!-- Prototype-only: who you are for submit/approve. Simulated for this prototype. -->
    <ScenarioFab v-model="viewAsModel" :scenarios="viewAsScenarios" :aria-label="t('View as (simulated for this prototype)')" />
  </div>

  <!-- Not found -->
  <div v-else class="pa-not-found">
    <p class="pa-card-title">{{ t('Project not found') }}</p>
    <MpTextlink id="pa-not-found-back" as="a" class="detail-breadcrumb" @click.prevent="goList">{{ t('Back to Project accounting') }}</MpTextlink>
  </div>
</template>

<style scoped>
/* ── Page shell (shared detail-page pattern) ─────────────────────────────── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; min-height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-3) var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}
.detail-subtitle { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-bar-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-shrink: 0; }
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-8);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column; gap: var(--mp-spacing-8);
}

.pa-tabs { display: block; }

/* ── Cards — a 1px border, never a drop-shadow (DESIGN.md) ────────────────── */
.pa-card {
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 8px);
  background: var(--mp-background-neutral); padding: var(--mp-spacing-5) var(--mp-spacing-6);
  margin-top: var(--mp-spacing-8);
}
.pa-card--notice { background: var(--mp-colors-background-information); border-color: var(--mp-colors-border-information); }
.pa-card--danger { background: var(--mp-colors-background-danger); border-color: var(--mp-colors-border-danger); }
.pa-card--bar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); flex-wrap: wrap; }
.pa-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-5); flex-wrap: wrap; }
.pa-card-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.pa-card-title {
  margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.pa-card-title--spaced { margin-bottom: var(--mp-spacing-4); }
.pa-card-desc { margin: var(--mp-spacing-1) 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); max-width: 860px; }
.pa-lead { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pa-note { margin: var(--mp-spacing-3) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pa-warn { margin: var(--mp-spacing-2) 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.pa-tiny { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-0\.5); white-space: normal; }
.pa-tiny--strong { color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold); }
.pa-num { font-variant-numeric: tabular-nums; }
.pa-two-col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--mp-spacing-4); }

/* ── Key/value rows ───────────────────────────────────────────────────────── */
/* Key/value fields use ContentList (docs/patterns/details-page-format.md). */
.pa-fields > * + * { border-top: 1px solid var(--mp-border-default); }
.pa-plan-row { display: flex; justify-content: space-between; gap: var(--mp-spacing-4); }
/* The cost-plus build-up keeps its own row: a caption under the key, figure right. */
.pa-kv-row { display: flex; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-2) 0; border-bottom: 1px solid var(--mp-border-default); }
.pa-kv-row--wide { align-items: baseline; }
.pa-kv-key { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); display: flex; flex-direction: column; }
.pa-kv-strong { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pa-kv-val { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); text-align: right; white-space: nowrap; }

/* ── Tables (detail-page read-only style) ─────────────────────────────────── */
.pa-table-scroll { overflow-x: auto; }
.pa-table { width: 100%; border-collapse: collapse; margin-top: var(--mp-spacing-3); }
.pa-th {
  height: var(--mp-sizes-7, 28px); text-align: left; white-space: nowrap;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); text-transform: uppercase; vertical-align: middle;
  border-bottom: 1px solid var(--mp-border-default);
}
.pa-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.pa-td {
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-4) var(--mp-spacing-2\.5) var(--mp-spacing-2);
  height: var(--mp-sizes-10); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); vertical-align: top;
  border-bottom: 1px solid var(--mp-border-default);
}
.pa-td--num { text-align: right; font-variant-numeric: tabular-nums; padding: var(--mp-spacing-2\.5) var(--mp-spacing-2) var(--mp-spacing-2\.5) var(--mp-spacing-4); }
.pa-td--muted { color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-sm); }
.pa-td--strong { font-weight: var(--mp-font-weights-semi-bold); }
.pa-td[data-tone='adverse'] { color: var(--mp-text-danger); }
.pa-td--wrap { white-space: normal; }
.pa-td--actions { text-align: right; white-space: nowrap; }
.pa-td--actions > * + * { margin-left: var(--mp-spacing-2); }
.pa-tr--total > .pa-td { background: var(--mp-background-neutral-subtle); font-weight: var(--mp-font-weights-semi-bold); }
.pa-tr--group > .pa-td { background: var(--mp-background-neutral-subtle); }

/* ── Progress bars ────────────────────────────────────────────────────────── */
.pa-progress { height: var(--mp-sizes-3); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral-subtle); overflow: hidden; margin-bottom: var(--mp-spacing-4); }
.pa-progress-fill { height: 100%; border-radius: var(--mp-radii-full, 999px); }
.pa-progress-fill[data-tone='ok'] { background: var(--mp-colors-emerald-700, #029861); }

.pa-bucket { display: flex; align-items: center; gap: var(--mp-spacing-4); padding: var(--mp-spacing-1) 0; }
.pa-bucket-label { width: calc(var(--mp-sizes-12) * 2); flex-shrink: 0; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); }
.pa-bucket-track { flex: 1; height: var(--mp-sizes-2); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral-subtle); overflow: hidden; }
.pa-bucket-fill { display: block; height: 100%; border-radius: var(--mp-radii-full, 999px); }
.pa-bucket-fill[data-tone='ok'] { background: var(--mp-colors-emerald-700, #029861); }
.pa-bucket-fill[data-tone='near'] { background: var(--mp-colors-orange-600, #e46910); }
.pa-bucket-fill[data-tone='over'] { background: var(--mp-colors-red-700, #a8352d); }
.pa-bucket-amount { width: calc(var(--mp-sizes-20) * 2); text-align: right; font-size: var(--mp-font-sizes-sm); }

/* ── Ageing / summaries ───────────────────────────────────────────────────── */
.pa-age { font-weight: var(--mp-font-weights-semi-bold); font-size: var(--mp-font-sizes-sm); }
.pa-age[data-tone='ok'] { color: var(--mp-colors-text-success); }
.pa-age[data-tone='default'] { color: var(--mp-text-default); }
.pa-age[data-tone='near'] { color: var(--mp-colors-text-warning); }
.pa-age[data-tone='over'] { color: var(--mp-text-danger); }
.pa-summary { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); }
.pa-summary--bad { color: var(--mp-text-danger); }

/* ── Addendum form ────────────────────────────────────────────────────────── */
.pa-vo { margin-top: var(--mp-spacing-4); }
.pa-vo-form { display: grid; grid-template-columns: 1fr 1.6fr; gap: var(--mp-spacing-3); align-items: end; margin-bottom: var(--mp-spacing-4); }
.pa-box { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md, 6px); padding: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-3); }
.pa-box-title { margin: 0 0 var(--mp-spacing-1); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pa-choices { display: flex; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.pa-choice {
  flex: 1; min-width: calc(var(--mp-sizes-16) * 4); text-align: left; cursor: pointer;
  display: flex; align-items: flex-start; gap: var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md, 6px);
  background: var(--mp-background-neutral); padding: var(--mp-spacing-3) var(--mp-spacing-4);
}
.pa-choice:hover { background: var(--mp-background-neutral-hovered); }
.pa-choice--picked { border-color: var(--mp-colors-border-selected); background: var(--mp-colors-background-success); }
.pa-choice-body { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.pa-choice-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pa-choice-desc { font-size: var(--mp-font-sizes-xs, 12px); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md, 20px); }

.pa-inline-form { display: flex; align-items: center; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.pa-inline-amount { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); white-space: nowrap; }

/* ── Weight editor ────────────────────────────────────────────────────────── */
.pa-weight-row { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-2); }
.pa-weight-label { flex: 1; font-size: var(--mp-font-sizes-md); }
.pa-weight-input { width: calc(var(--mp-sizes-12) * 3); flex-shrink: 0; }

/* ── Misc ─────────────────────────────────────────────────────────────────── */
.pa-chips { display: flex; gap: var(--mp-spacing-2); flex-wrap: wrap; margin-bottom: var(--mp-spacing-2); }
.pa-chip--active { border-color: var(--mp-colors-border-selected) !important; background: var(--mp-colors-background-success) !important; }
.pa-chip-row { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; margin-top: var(--mp-spacing-1); }
.pa-actions { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-top: var(--mp-spacing-4); flex-wrap: wrap; }
.pa-bar-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pa-bar-actions { display: flex; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.pa-actions--tight { margin-top: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-2); }

/* ── Approval / status lines (no banners) ─────────────────────────────────── */
.pa-statusline { display: flex; align-items: center; gap: var(--mp-spacing-3); flex-wrap: wrap; margin: 0; }
.pa-statusline--plain { margin-top: var(--mp-spacing-4); }
.pa-statusline-text { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* Health figures use the shared stats band (caption above the figure) — same rules as BillsIndexPage. */
.stats-section { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.stat-card { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding-right: var(--mp-spacing-6); align-self: stretch; }
.stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.stat-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); white-space: nowrap; }
.stat-period { margin: 0; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); white-space: nowrap; }
.stat-amount { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl, 32px); white-space: nowrap; }
.pa-health-stats { margin: 0; }

/* ErpTablePage inside a card: no extra outer chrome. */
.pa-erp-table { margin-top: var(--mp-spacing-3); }
.filter-left, .filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: var(--mp-sizes-4\.5, 18px); height: var(--mp-sizes-4\.5, 18px); padding: 0;
  border: none; background: none; cursor: pointer; color: var(--mp-text-secondary);
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }
.pa-filter-note { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pa-cellstack { display: flex; flex-direction: column; min-width: 0; }
.pa-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.detail-updated {
  margin: calc(-1 * var(--mp-spacing-4)) 0 0; align-self: flex-start;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); cursor: pointer;
}
.detail-updated:hover { text-decoration: underline; text-underline-offset: 2px; }
.pa-inline-field { flex: 1; min-width: calc(var(--mp-sizes-16) * 4); }

.pa-not-found { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-2); height: 100%; }
</style>
