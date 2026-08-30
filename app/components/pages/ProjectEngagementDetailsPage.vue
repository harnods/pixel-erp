<script setup lang="ts">
/**
 * Engagement detail — the five stages of a project's life, as in-page tabs.
 *
 *   Setup & contract    the frozen contract, the baseline budget plan, and the
 *                       append-only addendum trail (raised by PM, approved by Finance)
 *   Costs               read-only rollup of every transaction line tagged here
 *   Revenue recognition changes shape with the method — this is the whole point
 *   Invoices & payments what was sent to the client, and what was collected
 *   Project health      budget variance, margin, and the closure gate
 *
 * A `detailMatch` route: this page owns its 72px title bar and its own stage
 * padding (DESIGN.md → Layout). In-page detail tabs use MpTabs (docs/patterns/tabs.md).
 */
import {
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel,
  MpCheckbox, MpTextarea, MpIcon, MpInput, MpInputGroup, MpInputLeftAddon, MpInputRightAddon,
  MpFormControl, MpFormLabel, MpBadge, toast, MpTextlink,
} from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpPagination from '~/components/patterns/ErpPagination.vue'
import ProjectStatCards, { type ProjectStat } from '~/components/patterns/ProjectStatCards.vue'
import ApproveAddendumModal from '~/components/patterns/ApproveAddendumModal.vue'
import { formatDate, formatDateLong } from '~/utils/date'
import {
  findEngagement, STAGES, stageIndex, lifecycleLabel, methodLabel, methodFormal,
  revenue, actualCost, pocPct, billed, collected, wipNet, openEntries, readyToInvoice,
  entryAmount, entryFinal, entryLabel, daysAgo, ageBuckets, budgetOf, budgetReport,
  canClose, closeHint, pendingVos, advanceStage,
  decideEntries, addAddendum, approveAddendum, rejectAddendum, confirmWeights,
  addScopeMilestone, verifyMilestone, unverifyMilestone, recordPayment, closeEngagement,
  formatIdr, formatIdrShort, formatIdrSigned,
  type Engagement, type EngagementStage, type CostEntry, type CostDecision, type Addendum,
} from '~/data/projectAccounting'

const props = defineProps<{ orderId: string }>()

const router = useRouter()
const route = useRoute()
const { t } = useLocale()

const engagement = computed<Engagement | undefined>(() => findEngagement(props.orderId))

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

// ── Stats, per tab ────────────────────────────────────────────────────────────
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
      { key: 'budget', label: t('Budgeted cost'), value: budget === null ? t('Not set') : formatIdr(budget), sub: t('Set at Setup'), tone: budget === null ? 'muted' : 'default' },
      { key: 'cost', label: t('Cost incurred'), value: formatIdr(cost), sub: `${e.entries.length} ${t('tagged lines')}`, tone: budget !== null && cost > budget ? 'adverse' : 'default' },
      { key: 'variance', label: t('Budget variance'), value: budget === null ? t('Not set') : formatIdrSigned(budget - cost), sub: t('Budgeted less incurred'), tone: budget === null ? 'muted' : (budget - cost < 0 ? 'adverse' : 'positive') },
    ]
  }

  if (activeStage.value === 'recognition') {
    if (e.method === 'tm') {
      const open = openEntries(e)
      const wip = open.reduce((a, x) => a + entryAmount(x), 0)
      const risk = open.filter(x => daysAgo(x.date) > 60).reduce((a, x) => a + entryAmount(x), 0)
      return [
        { key: 'cost', label: t('Cost incurred'), value: formatIdr(cost), sub: `${e.entries.length} ${t('tagged lines')}` },
        { key: 'wip', label: t('Awaiting review'), value: formatIdr(wip), sub: `${open.length} ${t('lines, not yet revenue')}` },
        { key: 'risk', label: t('Older than 60 days'), value: formatIdr(risk), sub: t('Hard to defend to the client'), tone: risk > 0 ? 'adverse' : 'default' },
        { key: 'rev', label: t('Revenue recognised'), value: formatIdr(revenue(e)) },
      ]
    }
    if (e.method === 'input') {
      return [
        { key: 'cv', label: t('Contract value'), value: formatIdr(e.contractValue) },
        { key: 'budget', label: t('Budgeted cost'), value: budget === null ? t('Not set') : formatIdr(budget), tone: budget === null ? 'muted' : 'default' },
        { key: 'cost', label: t('Cost incurred'), value: formatIdr(cost), tone: budget !== null && cost > budget ? 'adverse' : 'default' },
        { key: 'poc', label: t('Percentage complete'), value: `${pocPct(e).toFixed(0)}%`, sub: t('Cost incurred ÷ cost budgeted'), tone: 'positive' },
      ]
    }
    const verified = (e.milestones ?? []).filter(m => m.verified).length
    return [
      { key: 'cv', label: t('Contract value'), value: formatIdr(e.contractValue) },
      { key: 'ms', label: t('Milestones verified'), value: `${verified} ${t('of')} ${(e.milestones ?? []).length}` },
      { key: 'rev', label: t('Revenue recognised'), value: formatIdr(revenue(e)), sub: t('Verified milestones only'), tone: 'positive' },
      { key: 'cost', label: t('Cost incurred'), value: formatIdr(cost) },
    ]
  }

  if (activeStage.value === 'billing') {
    const net = wipNet(e)
    return [
      { key: 'rev', label: t('Revenue recognised'), value: formatIdr(revenue(e)) },
      { key: 'billed', label: t('Total billed'), value: formatIdr(billed(e)) },
      { key: 'collected', label: t('Collected'), value: formatIdr(collected(e)), tone: 'positive' },
      {
        key: 'net',
        label: net > 0 ? t('Unbilled (asset)') : net < 0 ? t('Overbilled (liability)') : t('Billing in step with recognition'),
        value: formatIdr(Math.abs(net)),
        sub: net > 0 ? t('Recognized but not yet invoiced') : net < 0 ? t('Billed ahead of recognition') : t('Recognition vs. billing'),
        tone: net > 0 ? 'adverse' : net < 0 ? 'adverse' : 'positive',
      },
    ]
  }

  return [
    { key: 'rev', label: t('Revenue recognised'), value: formatIdr(revenue(e)) },
    { key: 'cost', label: t('Cost incurred'), value: formatIdr(cost) },
    { key: 'cash', label: t('Cash collected'), value: formatIdr(collected(e)), tone: 'positive' },
    { key: 'bva', label: t('Budget vs. actual'), value: budget === null ? t('Not set') : formatIdrSigned(budget - cost), tone: budget === null ? 'muted' : 'default' },
  ]
})

// ── Setup & contract ──────────────────────────────────────────────────────────
const contractRows = computed(() => {
  const e = engagement.value
  if (!e) return []
  return [
    { k: t('Revenue recognition'), v: `${methodLabel(e.method)} (${methodFormal(e.method)})` },
    { k: e.method === 'tm' ? t('Fee estimate') : t('Contract value'), v: formatIdr(e.method === 'tm' ? e.feeEstimate : e.contractValue) },
    { k: t('Cost budget'), v: e.budget === null ? t('Not set') : formatIdr(e.budget) },
    { k: t('Client'), v: e.client },
    { k: t('PM / owner'), v: e.pm },
    { k: t('Status'), v: e.stage === 'closed' ? `${t('Closed')} ${formatDateLong(e.closedAt ?? '')}` : lifecycleLabel(e.stage) },
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
const voValue = ref('')
const voReason = ref('')
const voDistinct = ref(false)
const voWarn = ref('')
const voConfirmId = ref<string | null>(null)

function submitAddendum() {
  const e = engagement.value
  if (!e) return
  if (voReason.value.trim().length < 5) { voWarn.value = t('A reason is required (minimum 5 characters).'); return }
  const val = Number(voValue.value)
  if (!val || val <= 0) { voWarn.value = t('Enter the new contract value.'); return }
  addAddendum(e.id, val, voReason.value, voDistinct.value)
  voValue.value = ''; voReason.value = ''; voDistinct.value = false; voWarn.value = ''
  toast.notify({
    variant: 'success',
    title: t('Addendum raised. It now needs a separate approval from Finance before the contract value moves.'),
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
      ? `${t('Distinct added scope: every existing milestone keeps the money it is already worth, and the addition gets its own milestone priced at')} ${formatIdr(vo.newValue - vo.oldValue)}. ${t('Verified milestones are untouched.')}`
      : t('Not distinct: verified milestones stay locked — a physical sign-off is never reopened. Milestone verification is blocked until the unverified weights are reconfirmed against the new value.')
  }
  if (e.method === 'input') {
    return vo.distinct
      ? `${t('Distinct added scope: revenue already recognized')} (${formatIdr(revenue(e))}) ${t('is untouched and the addition is measured prospectively.')}`
      : `${t('Not distinct — the same partially-satisfied obligation. Recognized revenue is recalculated as')} ${pocPct(e).toFixed(0)}% ${t('of the new contract value, a one-time catch-up of')} ${formatIdr(Math.round((pocPct(e) / 100) * vo.newValue - revenue(e)))} ${t('landing in the current period.')}`
  }
  return t('The fee estimate is replaced. Work already reviewed and billed is not restated.')
})

function doApproveVo() {
  const e = engagement.value
  const id = voConfirmId.value
  if (!e || !id) return
  approveAddendum(e.id, id)
  voConfirmId.value = null
  toast.notify({ variant: 'success', title: t('Addendum approved by Finance'), maxWidth: 'max-content' })
}

function doRejectVo(id: string) {
  if (!engagement.value) return
  rejectAddendum(engagement.value.id, id)
  toast.notify({ variant: 'success', title: t('Addendum rejected') })
}

const voRows = computed(() => {
  const e = engagement.value
  if (!e) return []
  const original = e.vos.length ? e.vos[0]!.oldValue : (e.method === 'tm' ? e.feeEstimate : e.contractValue)
  const head = {
    id: '__original',
    date: t('At creation'),
    reason: t('Original contract as entered at Setup'),
    oldValue: '—',
    newValue: formatIdr(original),
    scope: t('Original'),
    trail: t('Locked on creation — never edited in place'),
    adjNote: '',
    status: 'active',
    statusLabel: t('Active'),
    pending: false,
  }
  return [head, ...e.vos.map(v => ({
    id: v.id,
    date: formatDateLong(v.date),
    reason: v.reason,
    oldValue: formatIdr(v.oldValue),
    newValue: formatIdr(v.newValue),
    scope: v.distinct ? t('Distinct scope') : t('Not distinct'),
    trail: v.approvedBy
      ? `${t('Raised by')} ${v.raisedBy} · ${t('approved by')} ${v.approvedBy}`
      : v.status === 'Rejected'
        ? `${t('Raised by')} ${v.raisedBy} · ${t('rejected by Finance')}`
        : `${t('Raised by')} ${v.raisedBy} · ${t('awaiting Finance/Controller')}`,
    adjNote: v.adjustment ? `${t('Cumulative catch-up')} ${formatIdr(v.adjustment)} ${t('recognized in the current period')}` : '',
    status: v.status.toLowerCase(),
    statusLabel: v.status,
    pending: v.status === 'Pending',
  }))]
})

// Distinct scope on an output engagement owes the contract its own milestone.
const scopeLabel = ref('')
const scopeFormOpen = ref(false)
function saveScopeMilestone() {
  const e = engagement.value
  if (!e) return
  if (!scopeLabel.value.trim()) { toast.notify({ variant: 'error', title: t('Name the milestone for the added scope') }); return }
  const added = addScopeMilestone(e.id, scopeLabel.value)
  scopeLabel.value = ''; scopeFormOpen.value = false
  toast.notify({ variant: 'success', title: `${t('Milestone added at')} ${formatIdr(added)}`, maxWidth: 'max-content' })
}

// ── Costs tab: the tagged-transaction rollup ─────────────────────────────────
const rollSearch = ref('')
const rollPage = ref(1)
const rollPerPage = ref(25)
const rollSortKey = ref<'source' | 'date' | 'cost'>('date')
const rollSortDir = ref<'asc' | 'desc'>('desc')

const rollFiltered = computed(() => {
  const e = engagement.value
  if (!e) return []
  const q = rollSearch.value.trim().toLowerCase()
  if (!q) return e.entries
  return e.entries.filter(x => `${entryLabel(x)} ${x.vendor} ${x.docNo} ${x.src}`.toLowerCase().includes(q))
})

const rollSorted = computed(() => [...rollFiltered.value].sort((a, b) => {
  const dir = rollSortDir.value === 'asc' ? 1 : -1
  if (rollSortKey.value === 'cost') return (a.amount - b.amount) * dir
  if (rollSortKey.value === 'source') return a.src.localeCompare(b.src) * dir
  return (new Date(a.date).getTime() - new Date(b.date).getTime()) * dir
}))

const rollTotalPages = computed(() => Math.max(1, Math.ceil(rollSorted.value.length / rollPerPage.value)))
const rollPaged = computed(() => {
  const start = (Math.min(rollPage.value, rollTotalPages.value) - 1) * rollPerPage.value
  return rollSorted.value.slice(start, start + rollPerPage.value)
})
watch([rollSearch, rollPerPage], () => { rollPage.value = 1 })

function sortRoll(key: 'source' | 'date' | 'cost') {
  if (rollSortKey.value === key) rollSortDir.value = rollSortDir.value === 'asc' ? 'desc' : 'asc'
  else { rollSortKey.value = key; rollSortDir.value = 'asc' }
}
function sortMark(key: 'source' | 'date' | 'cost') {
  return rollSortKey.value === key ? (rollSortDir.value === 'asc' ? ' ↑' : ' ↓') : ''
}

const rollFilteredTotal = computed(() => rollFiltered.value.reduce((a, x) => a + x.amount, 0))

/** Pixel has no purple/amber badge pair for sources — map onto the semantic set. */
const SRC_BADGE: Record<string, string> = { Expense: 'information', Purchase: 'warning', Sales: 'completed' }

// Hours are analytical only — they never enter an amount, they only explain one.
const hourLines = computed(() => engagement.value?.entries.filter(x => Number(x.hours) > 0) ?? [])
const totalHours = computed(() => hourLines.value.reduce((a, x) => a + (x.hours ?? 0), 0))
const hourCost = computed(() => hourLines.value.reduce((a, x) => a + x.amount, 0))
const hourStats = computed<ProjectStat[]>(() => {
  const e = engagement.value
  if (!e) return []
  const h = totalHours.value
  return [
    { key: 'h', label: t('Hours logged'), value: `${h} h`, sub: `${hourLines.value.length} ${t('of')} ${e.entries.length} ${t('cost lines carry hours')}` },
    { key: 'cph', label: t('Cost per hour'), value: h ? formatIdr(Math.round(hourCost.value / h)) : '—', sub: t('Actual cost ÷ hours') },
    e.method === 'tm'
      ? { key: 'chg', label: t('Chargeable per hour'), value: h ? formatIdr(Math.round((hourCost.value * (1 + e.markupPct / 100)) / h)) : '—', sub: `${t('At the agreed')} ${e.markupPct}% ${t('margin')}`, tone: 'positive' as const }
      : { key: 'exp', label: t('Cost explained by hours'), value: formatIdr(hourCost.value), sub: `${t('Of')} ${formatIdr(actualCost(e))} ${t('booked')}`, tone: 'positive' as const },
  ]
})
const hourCoverage = computed(() => {
  const e = engagement.value
  if (!e) return ''
  const uncovered = actualCost(e) - hourCost.value
  return uncovered > 0
    ? `${formatIdr(uncovered)} ${t('of cost carries no hours, so it sits outside this rate analysis — material and subcontractor lines usually should.')}`
    : t('Every cost line on this project carries hours.')
})

// ── Revenue recognition: cost-plus review queue ──────────────────────────────
const selected = ref<string[]>([])
const pendingAction = ref<Exclude<CostDecision, null> | null>(null)
const pendingReason = ref('')
const pendingWarn = ref('')

const openLines = computed(() => [...openEntries(engagement.value ?? ({ entries: [] } as unknown as Engagement))]
  .sort((a, b) => daysAgo(b.date) - daysAgo(a.date)))

const allSelected = computed(() => openLines.value.length > 0 && selected.value.length === openLines.value.length)
function toggleAll() { selected.value = allSelected.value ? [] : openLines.value.map(x => x.id) }
function toggleOne(id: string) {
  selected.value = selected.value.includes(id) ? selected.value.filter(x => x !== id) : [...selected.value, id]
}
function inBucket(lo: number, hi: number) { return openLines.value.filter(x => { const d = daysAgo(x.date); return d > lo && d <= hi }) }
const bulkChips = computed(() => [
  { key: 'all', label: `${t('All')} ${openLines.value.length} ${t('open')}`, pick: () => openLines.value },
  { key: '90', label: `${t('90+ days')} (${inBucket(90, 1e9).length})`, pick: () => inBucket(90, 1e9) },
  { key: '6190', label: `${t('61–90 days')} (${inBucket(60, 90).length})`, pick: () => inBucket(60, 90) },
  { key: '60', label: `${t('Over 60 days')} (${inBucket(60, 1e9).length})`, pick: () => inBucket(60, 1e9) },
])
function applyChip(pick: () => CostEntry[]) { selected.value = pick().map(x => x.id) }
function clearSelection() { selected.value = []; pendingAction.value = null }

const selectionTotal = computed(() => (engagement.value?.entries ?? [])
  .filter(x => selected.value.includes(x.id))
  .reduce((a, x) => a + entryAmount(x), 0))

const pendingTitle = computed(() => {
  if (pendingAction.value === 'bill') return t('Confirm charging cost plus the agreed margin')
  if (pendingAction.value === 'atcost') return t('Why is the margin being waived on these lines?')
  return t('Why is the client not being charged for these lines at all?')
})

function startAction(type: Exclude<CostDecision, null>) {
  if (!selected.value.length) return
  pendingAction.value = type
  pendingReason.value = ''
  pendingWarn.value = ''
}

function confirmDecision() {
  const e = engagement.value
  if (!e || !pendingAction.value) return
  if (pendingAction.value !== 'bill' && pendingReason.value.trim().length < 5) {
    pendingWarn.value = t('A reason is required (minimum 5 characters).')
    return
  }
  const count = selected.value.length
  const total = decideEntries(e.id, selected.value, pendingAction.value)
  selected.value = []
  pendingAction.value = null
  pendingReason.value = ''
  toast.notify({
    variant: 'success',
    title: `${count} ${t('item(s)')}, ${formatIdr(total)}, ${t('recorded. Ready to invoice on the Invoices & payments tab.')}`,
    maxWidth: 'max-content',
  })
}

// Cost-plus summary rows.
const tmRows = computed(() => {
  const e = engagement.value
  if (!e) return []
  const gross = e.entries.reduce((a, x) => a + entryAmount(x), 0)
  const rows = [
    { k: t('Cost incurred'), note: t('Every expense, purchase and payroll line tagged to this project'), val: formatIdr(actualCost(e)) },
    { k: t('Agreed margin on cost'), note: t('Set on the contract at Setup, applied to every allowed line'), val: `+${e.markupPct}%` },
    { k: t('Value at cost + margin'), note: t('What the client could be charged if every line is allowed'), val: formatIdr(gross) },
    { k: t('Revenue recognised to date'), note: t('Reviewed lines only — unreviewed cost is not yet revenue'), val: formatIdr(revenue(e)) },
  ]
  if (totalHours.value > 0) {
    rows.splice(1, 0, {
      k: t('Hours behind that cost'),
      note: t('Optional on the expense line — analysis only, never part of the amount'),
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
  return Object.keys(b).map(k => ({ label: k, amount: formatIdr(b[k]!), width: `${((b[k]! / max) * 100).toFixed(0)}%`, tone: tone[k]! }))
})

// ── Output milestones ─────────────────────────────────────────────────────────
const weightSum = computed(() => (engagement.value?.milestones ?? []).reduce((a, m) => a + m.pct, 0))
const weightsOk = computed(() => Math.round(weightSum.value) === 100)

const outputMilestones = computed(() => {
  const e = engagement.value
  if (!e?.milestones) return []
  return e.milestones.map((m) => {
    const awaitingInvoice = m.verified && !m.invId
    return {
      id: m.id,
      label: m.label,
      pct: `${Math.round(m.pct * 100) / 100}%`,
      amount: m.verified ? formatIdr(m.recognized) : formatIdr((e.contractValue * m.pct) / 100),
      statusLabel: m.invId ? t('Verified & invoiced') : m.verified ? t('Verified · awaiting invoice') : t('Not verified'),
      // A real status key, so the badge stays correct even without the type override.
      statusKey: m.invId ? 'invoiced' : m.verified ? 'pending' : 'not started',
      note: awaitingInvoice ? t('Raise its invoice on Invoices & payments') : '',
      canVerify: !m.verified && weightsOk.value && !e.weightsNeedConfirm,
      showUnverify: m.verified,
      locked: !!m.invId,
    }
  })
})

const weightDraft = ref<{ id: string; label: string; pct: string }[]>([])
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
    toast.notify({ variant: 'error', title: `${t('Weights currently sum to')} ${sum}%. ${t('They must sum to 100% of the new contract value.')}`, maxWidth: 'max-content' })
    return
  }
  toast.notify({ variant: 'success', title: t('Milestone weights confirmed against the revised contract value') , maxWidth: 'max-content' })
}

function doVerify(mid: string) {
  const e = engagement.value
  if (!e) return
  if (e.weightsNeedConfirm) {
    toast.notify({ variant: 'error', title: t('Confirm milestone weights before verifying further milestones'), maxWidth: 'max-content' })
    return
  }
  const amount = verifyMilestone(e.id, mid)
  if (amount) {
    toast.notify({ variant: 'success', title: `${formatIdr(amount)} ${t('recognized. The milestone is queued for billing.')}`, maxWidth: 'max-content' })
  }
}

function doUnverify(mid: string) {
  const e = engagement.value
  if (!e) return
  if (!unverifyMilestone(e.id, mid)) {
    toast.notify({ variant: 'error', title: t('This milestone has already been invoiced. Void the invoice before reversing the verification.'), maxWidth: 'max-content' })
    return
  }
  toast.notify({ variant: 'success', title: t('Verification reversed — the recognized revenue has been backed out'), maxWidth: 'max-content' })
}

// ── Invoices & payments ───────────────────────────────────────────────────────
const readyLines = computed(() => readyToInvoice(engagement.value ?? ({ entries: [] } as unknown as Engagement)))
const readyAmount = computed(() => readyLines.value.reduce((a, x) => a + entryFinal(x), 0))

function newInvoice(kind: string, label: string, milestoneId?: string) {
  const e = engagement.value
  if (!e) return
  router.push({ path: '/project-accounting/invoice/new', query: { project: e.id, kind, label, milestone: milestoneId ?? undefined } })
}

const billingRows = computed(() => {
  const e = engagement.value
  if (!e) return []
  if (e.method === 'input') {
    return (e.billing ?? []).map(m => ({
      id: m.id,
      label: m.label,
      amount: formatIdr((e.contractValue * m.pct) / 100),
      statusLabel: m.status === 'paid' ? t('Paid') : m.status === 'invoiced' ? t('Invoiced, unpaid') : t('Not yet invoiced'),
      statusKey: m.status === 'paid' ? 'paid' : m.status === 'invoiced' ? 'unpaid' : 'not started',
      hasAction: m.status !== 'paid',
      actionLabel: m.status === 'notdue' ? t('Invoice now') : t('Record payment'),
      action: m.status === 'notdue'
        ? () => newInvoice('billing', m.label, m.id)
        : () => { if (m.invId) recordPayment(e.id, m.invId) },
    }))
  }
  return (e.milestones ?? []).map((m) => {
    const awaitingInvoice = m.verified && !m.invId
    return {
      id: m.id,
      label: m.label,
      amount: m.verified ? formatIdr(m.recognized) : formatIdr((e.contractValue * m.pct) / 100),
      statusLabel: awaitingInvoice ? t('Verified, not yet invoiced') : m.verified ? t('Verified & invoiced') : t('Awaiting verification'),
      statusKey: awaitingInvoice ? 'pending' : m.verified ? 'invoiced' : 'not started',
      hasAction: awaitingInvoice || (!m.verified && !e.weightsNeedConfirm),
      actionLabel: awaitingInvoice ? t('Create invoice') : t('Mark physically verified'),
      action: awaitingInvoice ? () => newInvoice('output', m.label, m.id) : () => doVerify(m.id),
    }
  })
})

const billingNote = computed(() => {
  const e = engagement.value
  if (!e) return ''
  return e.method === 'input'
    ? t('Independent of recognition above — the difference is reported as unbilled or overbilled revenue.')
    : t('Driven by milestone verification — an invoice appears here the moment a milestone is verified.')
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
  const share = rev > 0 ? `${((margin.value / rev) * 100).toFixed(0)}% ${t('of revenue earned')}` : t('no revenue earned yet')
  return `${t('Margin')} · ${share} · ${methodLabel(e.method)}`
})
const closable = computed(() => (engagement.value ? canClose(engagement.value) : false))

function doClose() {
  const e = engagement.value
  if (!e) return
  if (!closeEngagement(e.id)) {
    toast.notify({ variant: 'error', title: closeHint(e), maxWidth: 'max-content' })
    return
  }
  toast.notify({ variant: 'success', title: t('Engagement closed') })
}

const budgetRows = computed(() => (engagement.value ? budgetReport(engagement.value) : []))
const budgetNote = computed(() => {
  switch (activeStage.value) {
    case 'execution': return t('Cost side is live: every tagged transaction line posts against its account here.')
    case 'recognition': return t('Revenue side is live: actual revenue is what has been recognized so far, not what has been billed.')
    case 'billing': return t('Recognized revenue against plan, with cost to date — the collection position sits in the stats above.')
    default: return t('Final variance. This is the record that feeds estimating for the next similar job.')
  }
})
const showBudgetVariance = computed(() => activeStage.value !== 'setup')
</script>

<template>
  <div v-if="engagement" class="detail-page">
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <MpTextlink id="pa-breadcrumb" as="a" class="detail-breadcrumb" @click.prevent="goList">{{ t('Project accounting') }}</MpTextlink>
        <div class="detail-titlerow">
          <h1 class="detail-title">{{ engagement.name }}</h1>
          <ErpStatusBadge
            :status="engagement.stage === 'closed' ? 'closed' : 'active'"
            badge-for="additionalInformation"
            size="md"
          />
        </div>
        <p class="detail-subtitle">
          {{ engagement.client }} · {{ methodLabel(engagement.method) }} · {{ t('PM') }} {{ engagement.pm }}
        </p>
      </div>

      <div class="detail-bar-actions">
        <button
          v-if="activeStage === 'execution'"
          type="button"
          class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before"
          @click="router.push({ path: '/project-accounting/expense/new', query: { project: engagement.id } })"
        >
          <MpIcon name="add" size="sm" />
          {{ t('New expense') }}
        </button>
        <button
          v-if="activeStage === 'billing'"
          type="button"
          class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before"
          @click="newInvoice('adhoc', t('Invoice'))"
        >
          <MpIcon name="add" size="sm" />
          {{ t('New invoice') }}
        </button>
        <button type="button" class="btn-enterprise btn-enterprise--secondary" @click="goTab('setup')">
          {{ t('Edit contract') }}
        </button>
      </div>
    </header>

    <div class="detail-stage">
      <ProjectStatCards :stats="stats" />

      <MpTabs id="pa-engagement-tabs" v-model="activeIndex" is-manual variant-color="green" class="pa-tabs">
        <MpTabList>
          <MpTab v-for="s in STAGES" :key="s.key" :value="s.key">{{ t(s.label) }}</MpTab>
        </MpTabList>

        <MpTabPanels>
          <!-- ═══ Setup & contract ═══════════════════════════════════════════ -->
          <MpTabPanel value="setup">
            <div class="pa-two-col">
              <section class="pa-card">
                <div class="pa-card-head">
                  <div>
                    <h2 class="pa-card-title">{{ t('Contract') }}</h2>
                    <p class="pa-card-desc">
                      {{ t('Locked when it was created. Every change since is a dated addendum — nothing here is overwritten in place.') }}
                    </p>
                  </div>
                </div>
                <div class="pa-fields">
                  <ContentList v-for="r in contractRows" :key="r.k" :label="r.k" :value="r.v" />
                </div>
              </section>

              <section class="pa-card">
                <h2 class="pa-card-title">{{ t('Budget plan') }}</h2>
                <p class="pa-card-desc">{{ t('The baseline set at Setup. It stays fixed — an addendum never restates it.') }}</p>
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

            <!-- Distinct added scope owes the contract its own milestone. -->
            <section v-if="engagement.scopePending" class="pa-card pa-card--notice">
              <h2 class="pa-card-title">{{ t('Add a milestone for the distinct scope') }}</h2>
              <p class="pa-card-desc">
                {{ t('The approved addendum added') }} {{ formatIdr(engagement.scopePending.added) }}
                {{ t('of separately identifiable work, so it earns its own milestone priced at its own value. The existing milestones keep the amounts they already had — only their weights restate against the larger contract.') }}
              </p>
              <button
                v-if="!scopeFormOpen"
                type="button"
                class="btn-enterprise btn-enterprise--secondary"
                @click="scopeFormOpen = true"
              >{{ t('Add milestone') }}</button>
              <div v-else class="pa-inline-form">
                <MpInput
                  id="pa-scope-label" v-model="scopeLabel" is-full-width
                  :placeholder="t('e.g. Separate guard house handed over')"
                />
                <span class="pa-inline-amount">{{ formatIdr(engagement.scopePending.added) }}</span>
                <button type="button" class="btn-enterprise btn-enterprise--secondary" @click="saveScopeMilestone">{{ t('Save milestone') }}</button>
                <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="scopeFormOpen = false; scopeLabel = ''">{{ t('Cancel') }}</button>
              </div>
            </section>

            <!-- Contract milestones -->
            <section v-if="engagement.milestones?.length" class="pa-card">
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
                  <tr v-for="m in engagement.milestones" :key="m.id">
                    <td class="pa-td">{{ m.label }}</td>
                    <td class="pa-td pa-td--num">{{ Math.round(m.pct * 100) / 100 }}%</td>
                    <td class="pa-td pa-td--num">{{ formatIdr((engagement.contractValue * m.pct) / 100) }}</td>
                    <td class="pa-td">
                      <ErpStatusBadge :status="m.verified ? 'verified' : 'not started'" :label="m.verified ? t('Verified') : t('Not verified')" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <!-- ── Edit contract: append-only addenda ── -->
            <section class="pa-card">
              <h2 class="pa-card-title">{{ t('Edit contract') }}</h2>
              <p class="pa-card-desc">
                {{ t('The contract froze the moment it was created, so there is nothing to correct in place — a revised value is recorded as an addendum instead, dated and attributed. The project manager raises it; a Finance/Controller approval is a separate act before anything moves. A reason of at least 5 characters is required.') }}
              </p>

              <div class="pa-vo-form">
                <MpFormControl id="pa-vo-value" is-required>
                  <MpFormLabel>{{ t('Revised contract value') }}</MpFormLabel>
                  <MpInputGroup id="pa-vo-value-group" is-full-width>
                    <MpInputLeftAddon>Rp</MpInputLeftAddon>
                    <MpInput id="pa-vo-value-input" v-model="voValue" type="number" placeholder="0" is-full-width />
                  </MpInputGroup>
                </MpFormControl>
                <MpFormControl id="pa-vo-reason" is-required>
                  <MpFormLabel>{{ t('Reason') }}</MpFormLabel>
                  <MpInput
                    id="pa-vo-reason-input" v-model="voReason" is-full-width
                    :placeholder="t('e.g. Additional foundation work requested by client')"
                  />
                </MpFormControl>
                <button type="button" class="btn-enterprise btn-enterprise--primary pa-vo-submit" @click="submitAddendum">
                  {{ t('Submit addendum') }}
                </button>
              </div>

              <div class="pa-box">
                <h3 class="pa-box-title">{{ t('Is the added scope distinct?') }}</h3>
                <p class="pa-card-desc">
                  {{ t('Under PSAK 72 this, not how the project earns, decides whether revenue already earned is trued up. The system cannot infer it — someone has to say which it is.') }}
                </p>
                <div class="pa-choices">
                  <button
                    type="button" class="pa-choice" :class="{ 'pa-choice--picked': !voDistinct }"
                    :aria-pressed="!voDistinct" @click="voDistinct = false"
                  >
                    <span class="pa-choice-title">{{ t('Not distinct — same obligation') }}</span>
                    <span class="pa-choice-desc">{{ t('More concrete, an extended foundation, a mezzanine on the same building. One-time cumulative catch-up in the current period. The common case.') }}</span>
                  </button>
                  <button
                    type="button" class="pa-choice" :class="{ 'pa-choice--picked': voDistinct }"
                    :aria-pressed="voDistinct" @click="voDistinct = true"
                  >
                    <span class="pa-choice-title">{{ t('Distinct — separate scope') }}</span>
                    <span class="pa-choice-desc">{{ t('Separately identifiable and priced near its standalone value, e.g. also build a separate structure. Treated prospectively; on milestones it gets its own.') }}</span>
                  </button>
                </div>
              </div>
              <p v-if="voWarn" class="pa-warn">{{ voWarn }}</p>

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
                    <td class="pa-td">
                      {{ v.reason }}
                      <div class="pa-chip-row">
                        <MpBadge for="additionalInformation" type="announcement" size="sm">{{ v.scope }}</MpBadge>
                        <span class="pa-tiny">{{ v.trail }}</span>
                      </div>
                      <div v-if="v.adjNote" class="pa-tiny pa-tiny--positive">{{ v.adjNote }}</div>
                    </td>
                    <td class="pa-td pa-td--num">{{ v.oldValue }}</td>
                    <td class="pa-td pa-td--num">{{ v.newValue }}</td>
                    <td class="pa-td"><ErpStatusBadge :status="v.status" :label="v.statusLabel" /></td>
                    <td class="pa-td pa-td--actions">
                      <template v-if="v.pending">
                        <button type="button" class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" @click="voConfirmId = v.id">
                          {{ t('Approve as Finance') }}
                        </button>
                        <button type="button" class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" @click="doRejectVo(v.id)">
                          {{ t('Reject') }}
                        </button>
                      </template>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p class="pa-note">
                {{ t('Contract history is append-only. Rejected addenda stay on the list on purpose — the fact that a change was asked for and refused is part of the record.') }}
              </p>
            </section>
          </MpTabPanel>

          <!-- ═══ Costs ══════════════════════════════════════════════════════ -->
          <MpTabPanel value="execution">
            <section class="pa-card">
              <div class="pa-card-head">
                <div>
                  <h2 class="pa-card-title">{{ t('Tagged transaction lines') }}</h2>
                  <p class="pa-card-desc">
                    {{ t("Read-only rollup. Material, subcontractor, payroll and expense costs are all entered in the ERP's own Expense, Purchase and Sales forms and tagged to this project per line — there is no cost-entry form here.") }}
                  </p>
                </div>
                <div class="pa-card-actions">
                  <MpInputGroup id="pa-roll-search" class="filter-search">
                    <MpInputLeftAddon><MpIcon name="search" size="md" /></MpInputLeftAddon>
                    <MpInput v-model="rollSearch" type="text" :placeholder="t('Search lines...')" />
                  </MpInputGroup>
                </div>
              </div>

              <table class="pa-table">
                <thead>
                  <tr>
                    <th class="pa-th pa-th--sortable" @click="sortRoll('source')">{{ t('Source') }}{{ sortMark('source') }}</th>
                    <th class="pa-th">{{ t('Document') }}</th>
                    <th class="pa-th">{{ t('Account / description') }}</th>
                    <th class="pa-th pa-th--sortable" @click="sortRoll('date')">{{ t('Date') }}{{ sortMark('date') }}</th>
                    <th class="pa-th pa-th--num pa-th--sortable" @click="sortRoll('cost')">{{ t('Cost') }}{{ sortMark('cost') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="x in rollPaged" :key="x.id">
                    <td class="pa-td">
                      <MpBadge for="additionalInformation" :type="SRC_BADGE[x.src]" size="sm">{{ x.src }}</MpBadge>
                    </td>
                    <td class="pa-td pa-td--muted">{{ x.docNo }}</td>
                    <td class="pa-td">
                      {{ entryLabel(x) }}
                      <div class="pa-tiny">
                        {{ x.vendor }}<template v-if="x.hours"> · {{ x.hours }} h {{ t('at') }} {{ formatIdrShort(Math.round(x.amount / x.hours)) }}/h</template>
                      </div>
                    </td>
                    <td class="pa-td pa-td--muted">{{ formatDate(x.date) }}</td>
                    <td class="pa-td pa-td--num">{{ formatIdr(x.amount) }}</td>
                  </tr>
                  <tr class="pa-tr--total">
                    <td class="pa-td" colspan="4">{{ t('Total cost incurred') }}</td>
                    <td class="pa-td pa-td--num">{{ formatIdr(actualCost(engagement)) }}</td>
                  </tr>
                  <tr v-if="rollSearch.trim()">
                    <td class="pa-td pa-td--muted" colspan="4">{{ t('Matching lines') }}</td>
                    <td class="pa-td pa-td--num pa-td--muted">{{ formatIdr(rollFilteredTotal) }}</td>
                  </tr>
                </tbody>
              </table>
              <p v-if="!rollSorted.length" class="pa-note">
                {{ rollSearch.trim() ? t('No tagged line matches your search.') : t('No transaction lines tagged to this project yet.') }}
              </p>

              <ErpPagination
                :total="rollSorted.length"
                :current-page="rollPage"
                :per-page="rollPerPage"
                @page-change="rollPage = $event"
                @per-page-change="rollPerPage = $event"
              />
              <p class="pa-note">
                {{ t("Read-only. Every cost line originates in a real ERP document — Expense, Purchase or Sales — tagged to this project per line. Staff time is booked the same way, as a payroll expense line.") }}
              </p>
            </section>

            <section v-if="hourLines.length" class="pa-card">
              <h2 class="pa-card-title">{{ t('Hours & rate') }}</h2>
              <p class="pa-card-desc">
                {{ t('Built from the optional hours on the cost lines. Nothing here changes what posted — the amount is still the anchor. This is the analysis the hours make possible.') }}
              </p>
              <ProjectStatCards :stats="hourStats" />
              <p class="pa-note">{{ hourCoverage }}</p>
            </section>

            <div class="pa-actions">
              <button type="button" class="btn-enterprise btn-enterprise--secondary" @click="continueTo('recognition')">
                {{ t('Continue to Revenue recognition') }}
              </button>
            </div>
          </MpTabPanel>

          <!-- ═══ Revenue recognition ════════════════════════════════════════ -->
          <MpTabPanel value="recognition">
            <!-- ── Cost-plus ── -->
            <template v-if="engagement.method === 'tm'">
              <section class="pa-card">
                <h2 class="pa-card-title">{{ t('Input by Simplified Cost — the client reimburses cost and pays a margin on top') }}</h2>
                <p class="pa-card-desc">
                  {{ t('Revenue earned = allowed cost × (1 + agreed margin). There is no percentage of progress here: the client reimburses what the job cost and pays the margin written into the contract.') }}
                </p>
                <div class="pa-progress">
                  <div class="pa-progress-fill" data-tone="ok" :style="{ width: `${tmEarnedPct.toFixed(0)}%` }" />
                </div>
                <div v-for="r in tmRows" :key="r.k" class="pa-kv-row pa-kv-row--wide">
                  <dt class="pa-kv-key">
                    <span class="pa-kv-strong">{{ r.k }}</span>
                    <span class="pa-tiny">{{ r.note }}</span>
                  </dt>
                  <dd class="pa-kv-val pa-num">{{ r.val }}</dd>
                </div>
                <p class="pa-note">
                  {{ tmOpenValue > 0
                    ? `${formatIdr(tmOpenValue)} ${t('of chargeable value is still awaiting a review decision, so it is not recognized yet.')}`
                    : t('Every cost line has been reviewed — recognized revenue equals the full chargeable value of the work.') }}
                </p>
              </section>

              <section class="pa-card">
                <h2 class="pa-card-title">{{ t('Review queue') }}</h2>
                <p class="pa-card-desc">
                  {{ t('Every cost line — labour, material or subcontractor — needs a decision on what the client is charged before it can be invoiced. Until then it is cost incurred but not yet revenue.') }}
                </p>
                <div class="pa-chips">
                  <button
                    v-for="c in bulkChips" :key="c.key" type="button"
                    class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm"
                    @click="applyChip(c.pick)"
                  >{{ c.label }}</button>
                  <button type="button" class="btn-enterprise btn-enterprise--ghost btn-enterprise--sm" @click="clearSelection">{{ t('Clear') }}</button>
                </div>

                <table class="pa-table">
                  <thead>
                    <tr>
                      <th class="pa-th pa-th--check">
                        <MpCheckbox id="pa-review-all" :model-value="allSelected" @update:model-value="toggleAll" />
                      </th>
                      <th class="pa-th">{{ t('Item') }}</th>
                      <th class="pa-th">{{ t('Date') }}</th>
                      <th class="pa-th pa-th--num">{{ t('Amount') }}</th>
                      <th class="pa-th">{{ t('Waiting to bill') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="x in openLines" :key="x.id">
                      <td class="pa-td pa-td--check">
                        <MpCheckbox :id="`pa-review-${x.id}`" :model-value="selected.includes(x.id)" @update:model-value="toggleOne(x.id)" />
                      </td>
                      <td class="pa-td">{{ entryLabel(x) }}</td>
                      <td class="pa-td pa-td--muted">{{ formatDate(x.date) }}</td>
                      <td class="pa-td pa-td--num">{{ formatIdr(entryAmount(x)) }}</td>
                      <td class="pa-td">
                        <span
                          class="pa-age"
                          :data-tone="daysAgo(x.date) <= 30 ? 'ok' : daysAgo(x.date) <= 60 ? 'default' : daysAgo(x.date) <= 90 ? 'near' : 'over'"
                        >{{ daysAgo(x.date) }} {{ daysAgo(x.date) === 1 ? t('day') : t('days') }}</span>
                        <div class="pa-tiny">
                          {{ daysAgo(x.date) <= 30 ? t('Recent — fine to bill')
                            : daysAgo(x.date) <= 60 ? t('Getting old')
                              : daysAgo(x.date) <= 90 ? t('Chase this before the client forgets')
                                : t('The client may refuse to pay this') }}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p v-if="!openLines.length" class="pa-note">{{ t('Nothing open — every cost line has been reviewed.') }}</p>
              </section>

              <section v-if="selected.length && !pendingAction" class="pa-card pa-card--bar">
                <div>
                  <p class="pa-bar-title">{{ selected.length }} {{ t('selected') }} · {{ formatIdr(selectionTotal) }}</p>
                  <p class="pa-card-desc">
                    {{ t('Cost plus means the client reimburses cost and pays the margin — but only on lines you allow. Waiving the margin or absorbing a cost both need a reason.') }}
                  </p>
                </div>
                <div class="pa-bar-actions">
                  <button type="button" class="btn-enterprise btn-enterprise--primary" @click="startAction('bill')">{{ t('Charge cost + margin') }}</button>
                  <button type="button" class="btn-enterprise btn-enterprise--secondary" @click="startAction('atcost')">{{ t('Charge at cost only') }}</button>
                  <button type="button" class="btn-enterprise btn-enterprise--secondary" @click="startAction('absorb')">{{ t('Do not charge the client') }}</button>
                </div>
              </section>

              <section v-if="pendingAction" class="pa-card">
                <h2 class="pa-card-title">{{ pendingTitle }}</h2>
                <MpTextarea
                  id="pa-decision-reason" v-model="pendingReason" is-full-width
                  :placeholder="t('e.g. Scope discount agreed with client')"
                />
                <p v-if="pendingWarn" class="pa-warn">{{ pendingWarn }}</p>
                <div class="pa-actions">
                  <button type="button" class="btn-enterprise btn-enterprise--primary" @click="confirmDecision">{{ t('Confirm') }}</button>
                  <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="pendingAction = null">{{ t('Cancel') }}</button>
                </div>
              </section>
            </template>

            <!-- ── Cost-to-cost ── -->
            <template v-else-if="engagement.method === 'input'">
              <section class="pa-card">
                <h2 class="pa-card-title">{{ t('Input by Cost — the money spent is the measure of progress') }}</h2>
                <p class="pa-card-desc">
                  {{ t('Progress = cost spent ÷ cost planned. Revenue earned = that percentage × the contract value, recalculated live as cost lines post. Billing runs on its own milestone schedule and is reconciled as unbilled or overbilled revenue.') }}
                </p>
                <div class="pa-progress">
                  <div class="pa-progress-fill" data-tone="ok" :style="{ width: `${pocPct(engagement).toFixed(0)}%` }" />
                </div>
                <p class="pa-lead">{{ t('Revenue earned to date') }}: <b>{{ formatIdr(revenue(engagement)) }}</b></p>
                <p class="pa-note">
                  {{ engagement.budget === null
                    ? t('No budget set at Setup — % complete cannot be computed until an estimated cost exists.')
                    : actualCost(engagement) > engagement.budget
                      ? t('Actual cost has exceeded the estimate — revisit the budget or raise an addendum.')
                      : t('Billing runs on its own schedule; the gap is reported as unbilled or overbilled revenue.') }}
                </p>
              </section>

              <section class="pa-card">
                <h2 class="pa-card-title">{{ t('Cost lines feeding this calculation') }}</h2>
                <table class="pa-table">
                  <thead>
                    <tr>
                      <th class="pa-th">{{ t('Item') }}</th>
                      <th class="pa-th">{{ t('Source') }}</th>
                      <th class="pa-th">{{ t('Date') }}</th>
                      <th class="pa-th pa-th--num">{{ t('Cost') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="x in engagement.entries" :key="x.id">
                      <td class="pa-td">{{ entryLabel(x) }}</td>
                      <td class="pa-td pa-td--muted">{{ x.src }}</td>
                      <td class="pa-td pa-td--muted">{{ formatDate(x.date) }}</td>
                      <td class="pa-td pa-td--num">{{ formatIdr(x.amount) }}</td>
                    </tr>
                  </tbody>
                </table>
              </section>
            </template>

            <!-- ── Output by milestone ── -->
            <template v-else>
              <section class="pa-card">
                <h2 class="pa-card-title">{{ t('Output method — verified milestones') }}</h2>
                <p class="pa-card-desc">
                  {{ t('Marking a milestone physically verified recognizes its share of contract value and opens the ERP sales invoice prefilled — one action drives both. Recognition and billing are not on independent clocks here.') }}
                </p>
                <p class="pa-summary" :class="weightsOk ? 'pa-summary--ok' : 'pa-summary--bad'">
                  {{ weightsOk
                    ? t('Milestone weights sum to 100%.')
                    : `${t('Milestone weights sum to')} ${Math.round(weightSum)}% — ${t('verification is blocked until they sum to 100%.')}` }}
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
                      <td class="pa-td">{{ m.label }}</td>
                      <td class="pa-td pa-td--num">{{ m.pct }}</td>
                      <td class="pa-td pa-td--num">{{ m.amount }}</td>
                      <td class="pa-td">
                        <ErpStatusBadge :status="m.statusKey" :label="m.statusLabel" />
                        <div v-if="m.note" class="pa-tiny">{{ m.note }}</div>
                      </td>
                      <td class="pa-td pa-td--actions">
                        <button v-if="m.canVerify" type="button" class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" @click="doVerify(m.id)">
                          {{ t('Mark physically verified') }}
                        </button>
                        <button
                          v-else-if="m.showUnverify" type="button"
                          class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm"
                          :disabled="m.locked" @click="doUnverify(m.id)"
                        >
                          {{ m.locked ? t('Invoiced — locked') : t('Unverify') }}
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section v-if="engagement.weightsNeedConfirm" class="pa-card pa-card--danger">
                <h2 class="pa-card-title">{{ t('Milestone weights need confirming') }}</h2>
                <p class="pa-card-desc">
                  {{ t('An addendum changed the contract value. Confirm or edit the weights so they still sum to 100% of the new value before any further milestone can be verified.') }}
                </p>
                <div v-for="w in weightDraft" :key="w.id" class="pa-weight-row">
                  <span class="pa-weight-label">{{ w.label }}</span>
                  <MpInputGroup :id="`pa-w-group-${w.id}`" class="pa-weight-input">
                    <MpInput :id="`pa-w-${w.id}`" v-model="w.pct" type="number" />
                    <MpInputRightAddon>%</MpInputRightAddon>
                  </MpInputGroup>
                </div>
                <div class="pa-actions">
                  <button type="button" class="btn-enterprise btn-enterprise--primary" @click="doConfirmWeights">{{ t('Confirm weights') }}</button>
                </div>
              </section>
            </template>

            <div class="pa-actions">
              <button type="button" class="btn-enterprise btn-enterprise--secondary" @click="continueTo('billing')">
                {{ t('Continue to Invoices & payments') }}
              </button>
            </div>
          </MpTabPanel>

          <!-- ═══ Invoices & payments ════════════════════════════════════════ -->
          <MpTabPanel value="billing">
            <template v-if="engagement.method === 'tm'">
              <section class="pa-card">
                <h2 class="pa-card-title">{{ t('Create invoice') }}</h2>
                <p class="pa-card-desc">
                  {{ t('Opens the ERP sales invoice form with every reviewed, uninvoiced item prefilled as a line, project tagged.') }}
                </p>
                <p class="pa-lead">
                  {{ readyLines.length
                    ? `${readyLines.length} ${t('reviewed item(s) ready, totalling')} ${formatIdr(readyAmount)}.`
                    : t('Nothing ready — review more cost lines on the Revenue recognition tab.') }}
                </p>
                <button
                  v-if="readyLines.length" type="button" class="btn-enterprise btn-enterprise--primary"
                  @click="newInvoice('tm', t('Progress billing'))"
                >{{ t('Create invoice') }}</button>
              </section>

              <section class="pa-card">
                <h2 class="pa-card-title">{{ t('Unbilled value ageing') }}</h2>
                <p class="pa-card-desc">
                  {{ t('Worked value still awaiting a review decision, by age. The older a line gets, the harder it is to defend to the client — a collection risk, not a recognition question.') }}
                </p>
                <div v-for="b in bucketRows" :key="b.label" class="pa-bucket">
                  <span class="pa-bucket-label">{{ b.label }}</span>
                  <span class="pa-bucket-track">
                    <span class="pa-bucket-fill" :data-tone="b.tone" :style="{ width: b.width }" />
                  </span>
                  <span class="pa-bucket-amount pa-num">{{ b.amount }}</span>
                </div>
              </section>
            </template>

            <section v-else class="pa-card">
              <h2 class="pa-card-title">{{ t('Milestone billing schedule') }}</h2>
              <p class="pa-card-desc">{{ billingNote }}</p>
              <table class="pa-table">
                <thead>
                  <tr>
                    <th class="pa-th">{{ t('Milestone') }}</th>
                    <th class="pa-th pa-th--num">{{ t('Amount') }}</th>
                    <th class="pa-th">{{ t('Status') }}</th>
                    <th class="pa-th" />
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="m in billingRows" :key="m.id">
                    <td class="pa-td">{{ m.label }}</td>
                    <td class="pa-td pa-td--num">{{ m.amount }}</td>
                    <td class="pa-td">
                      <ErpStatusBadge :status="m.statusKey" :label="m.statusLabel" />
                    </td>
                    <td class="pa-td pa-td--actions">
                      <button v-if="m.hasAction" type="button" class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" @click="m.action()">
                        {{ m.actionLabel }}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section class="pa-card">
              <h2 class="pa-card-title">{{ t('Invoices') }}</h2>
              <table class="pa-table">
                <thead>
                  <tr>
                    <th class="pa-th">{{ t('Invoice') }}</th>
                    <th class="pa-th">{{ t('Label') }}</th>
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
                      <button v-if="i.status === 'unpaid'" type="button" class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" @click="doRecordPayment(i.id)">
                        {{ t('Record payment') }}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p v-if="!engagement.invoices.length" class="pa-note">{{ t('No invoices yet.') }}</p>
            </section>

            <p class="pa-note">
              {{ t('Closure lives on the Project health tab, alongside budget variance and margin.') }} {{ closeHint(engagement) }}
            </p>
          </MpTabPanel>

          <!-- ═══ Project health ═════════════════════════════════════════════ -->
          <MpTabPanel value="closed">
            <section class="pa-card">
              <p class="pa-figure-label">{{ t('Margin to date') }}</p>
              <p class="pa-figure" :data-tone="margin < 0 ? 'adverse' : 'default'">{{ formatIdrSigned(margin) }}</p>
              <p class="pa-card-desc">{{ marginSub }}</p>
              <p class="pa-card-desc">
                {{ engagement.stage === 'closed'
                  ? `${t('Engagement closed')} ${formatDateLong(engagement.closedAt ?? '')}`
                  : t('Live figures — the engagement is still open.') }}
              </p>
            </section>

            <p v-if="engagement.stage === 'closed'" class="pa-note">
              {{ t('Closed. The final margin feeds back into estimating for the next similar engagement.') }}
            </p>

            <section v-else class="pa-card pa-card--bar">
              <div>
                <h2 class="pa-card-title">{{ closable ? t('Ready to close') : t('Closure gate') }}</h2>
                <p class="pa-card-desc">{{ closeHint(engagement) }}</p>
              </div>
              <button type="button" class="btn-enterprise btn-enterprise--primary" @click="doClose">{{ t('Close engagement') }}</button>
            </section>
          </MpTabPanel>
        </MpTabPanels>
      </MpTabs>

      <!-- ── Budget variance — shown on every tab except Setup ── -->
      <section v-if="showBudgetVariance" class="pa-card">
        <h2 class="pa-card-title">{{ t('Budget variance') }}</h2>
        <p class="pa-card-desc">
          {{ t('Projected revenue and expense from the project budget, against actuals. Same shape as the Financials budget variance report, scoped to this project.') }}
        </p>
        <p v-if="engagement.budget === null" class="pa-warn">
          {{ t('No budget was set at Setup, so cost variance cannot be computed — actuals still post.') }}
        </p>
        <div class="pa-table-scroll">
          <table class="pa-table">
            <thead>
              <tr>
                <th class="pa-th">{{ t('Account') }}</th>
                <th class="pa-th pa-th--num">{{ t('Budget') }}</th>
                <th class="pa-th pa-th--num">{{ t('Actual') }}</th>
                <th class="pa-th pa-th--num">{{ t('Variance') }}</th>
                <th class="pa-th pa-th--num">{{ t('Variance %') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in budgetRows" :key="`${r.label}-${i}`" :class="{ 'pa-tr--group': r.header, 'pa-tr--total': r.total }">
                <td class="pa-td" :class="{ 'pa-td--strong': r.header || r.total }">{{ r.label }}</td>
                <template v-if="!r.header">
                  <td class="pa-td pa-td--num" :class="{ 'pa-td--strong': r.total }">{{ r.budget === null ? t('Not set') : formatIdrSigned(r.budget) }}</td>
                  <td class="pa-td pa-td--num" :class="{ 'pa-td--strong': r.total }">{{ formatIdrSigned(r.actual) }}</td>
                  <td class="pa-td pa-td--num" :class="{ 'pa-td--strong': r.total, 'pa-td--adverse': r.adverse }">{{ r.variance === null ? '—' : formatIdrSigned(r.variance) }}</td>
                  <td class="pa-td pa-td--num" :class="{ 'pa-td--adverse': r.adverse }">
                    {{ r.pct === null ? '—' : `${r.pct.toFixed(0)}%` }}
                    <div v-if="r.note" class="pa-tiny">{{ r.note }}</div>
                  </td>
                </template>
                <td v-else class="pa-td" colspan="4" />
              </tr>
            </tbody>
          </table>
        </div>
        <p class="pa-note">{{ budgetNote }}</p>
      </section>
    </div>

    <ApproveAddendumModal
      v-if="confirmingVo"
      :is-open="!!confirmingVo"
      :old-value="confirmingVo.oldValue"
      :new-value="confirmingVo.newValue"
      :reason="confirmingVo.reason"
      :effect="voEffect"
      :raised-by="confirmingVo.raisedBy"
      @update:is-open="voConfirmId = null"
      @confirm="doApproveVo"
    />
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
.pa-card--notice { background: var(--mp-background-information-subtle, #eef0fb); border-color: var(--mp-border-information, #c9d1f5); }
.pa-card--danger { background: var(--mp-background-danger-subtle, #fceeed); border-color: var(--mp-border-danger, #a8352d); }
.pa-card--bar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); flex-wrap: wrap; }
.pa-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-5); flex-wrap: wrap; }
.pa-card-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.pa-card-title {
  margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.pa-card-desc { margin: var(--mp-spacing-1) 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); max-width: 860px; }
.pa-lead { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pa-note { margin: var(--mp-spacing-3) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pa-warn { margin: var(--mp-spacing-2) 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #a8352d); }
.pa-tiny { font-size: var(--mp-font-sizes-xs, 12px); color: var(--mp-text-secondary); margin-top: 2px; }
.pa-tiny--positive { color: var(--mp-text-success, #028454); font-weight: var(--mp-font-weights-semi-bold); }
.pa-num { font-variant-numeric: tabular-nums; }
.pa-two-col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--mp-spacing-4); }

/* ── Key/value rows ───────────────────────────────────────────────────────── */
/* Key/value fields use ContentList (docs/patterns/details-page-format.md). */
.pa-fields > * + * { border-top: 1px solid var(--mp-border-subtle); }
.pa-plan-row { display: flex; justify-content: space-between; gap: var(--mp-spacing-4); }
/* The cost-plus build-up keeps its own row: a caption under the key, figure right. */
.pa-kv-row { display: flex; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-2) 0; border-bottom: 1px solid var(--mp-border-subtle); }
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
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default);
}
.pa-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.pa-th--check { width: var(--mp-sizes-11, 44px); }
.pa-th--sortable { cursor: pointer; }
.pa-th--sortable:hover { color: var(--mp-text-default); }
.pa-td {
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-4) var(--mp-spacing-2\.5) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); vertical-align: top;
  border-bottom: 1px solid var(--mp-border-default);
}
.pa-td--num { text-align: right; font-variant-numeric: tabular-nums; padding: var(--mp-spacing-2\.5) var(--mp-spacing-2) var(--mp-spacing-2\.5) var(--mp-spacing-4); }
.pa-td--muted { color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-sm); }
.pa-td--strong { font-weight: var(--mp-font-weights-semi-bold); }
.pa-td--adverse { color: var(--mp-text-danger, #a8352d); }
.pa-td--check { padding: var(--mp-spacing-2); }
.pa-td--actions { text-align: right; white-space: nowrap; }
.pa-td--actions > * + * { margin-left: var(--mp-spacing-2); }
.pa-tr--total > .pa-td { background: var(--mp-background-neutral-subtle); font-weight: var(--mp-font-weights-semi-bold); }
.pa-tr--group > .pa-td { background: var(--mp-background-neutral-subtle); }

/* ── Progress bars ────────────────────────────────────────────────────────── */
.pa-progress { height: 14px; border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral-subtle); overflow: hidden; margin-bottom: var(--mp-spacing-4); }
.pa-progress-fill { height: 100%; border-radius: var(--mp-radii-full, 999px); }
.pa-progress-fill[data-tone='ok'] { background: var(--mp-colors-emerald-700, #029861); }

.pa-bucket { display: flex; align-items: center; gap: var(--mp-spacing-4); padding: var(--mp-spacing-1) 0; }
.pa-bucket-label { width: 90px; flex-shrink: 0; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); }
.pa-bucket-track { flex: 1; height: 10px; border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral-subtle); overflow: hidden; }
.pa-bucket-fill { display: block; height: 100%; border-radius: var(--mp-radii-full, 999px); }
.pa-bucket-fill[data-tone='ok'] { background: var(--mp-colors-emerald-700, #029861); }
.pa-bucket-fill[data-tone='near'] { background: var(--mp-colors-orange-600, #e46910); }
.pa-bucket-fill[data-tone='over'] { background: var(--mp-colors-red-700, #a8352d); }
.pa-bucket-amount { width: 150px; text-align: right; font-size: var(--mp-font-sizes-sm); }

/* ── Ageing / summaries ───────────────────────────────────────────────────── */
.pa-age { font-weight: var(--mp-font-weights-semi-bold); font-size: var(--mp-font-sizes-sm); }
.pa-age[data-tone='ok'] { color: var(--mp-text-success, #028454); }
.pa-age[data-tone='default'] { color: var(--mp-text-default); }
.pa-age[data-tone='near'] { color: var(--mp-text-warning, #e46910); }
.pa-age[data-tone='over'] { color: var(--mp-text-danger, #a8352d); }
.pa-summary { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); }
.pa-summary--ok { color: var(--mp-text-success, #028454); }
.pa-summary--bad { color: var(--mp-text-danger, #a8352d); }

/* ── Addendum form ────────────────────────────────────────────────────────── */
.pa-vo-form { display: grid; grid-template-columns: 1fr 1.6fr auto; gap: var(--mp-spacing-3); align-items: end; margin-bottom: var(--mp-spacing-4); }
.pa-vo-submit { align-self: end; white-space: nowrap; }
.pa-box { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md, 6px); padding: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-3); }
.pa-box-title { margin: 0 0 var(--mp-spacing-1); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pa-choices { display: flex; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.pa-choice {
  flex: 1; min-width: 280px; text-align: left; cursor: pointer;
  display: flex; flex-direction: column; gap: var(--mp-spacing-1);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md, 6px);
  background: var(--mp-background-neutral); padding: var(--mp-spacing-3) var(--mp-spacing-4);
}
.pa-choice:hover { background: var(--mp-background-neutral-hovered); }
.pa-choice--picked { border-color: var(--mp-border-selected, #029861); background: var(--mp-background-selected, #eaf6f0); }
.pa-choice-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pa-choice-desc { font-size: var(--mp-font-sizes-xs, 12px); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md, 20px); }

.pa-inline-form { display: flex; align-items: center; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.pa-inline-amount { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); white-space: nowrap; }

/* ── Weight editor ────────────────────────────────────────────────────────── */
.pa-weight-row { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-2); }
.pa-weight-label { flex: 1; font-size: var(--mp-font-sizes-md); }
.pa-weight-input { width: 140px; flex-shrink: 0; }

/* ── Misc ─────────────────────────────────────────────────────────────────── */
.pa-chips { display: flex; gap: var(--mp-spacing-2); flex-wrap: wrap; margin-bottom: var(--mp-spacing-2); }
.pa-chip-row { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; margin-top: var(--mp-spacing-1); }
.pa-actions { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-top: var(--mp-spacing-4); flex-wrap: wrap; }
.pa-bar-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pa-bar-actions { display: flex; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.pa-figure-label { margin: 0; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase; color: var(--mp-text-secondary); }
.pa-figure {
  margin: var(--mp-spacing-2) 0 var(--mp-spacing-1); font-size: var(--mp-font-sizes-2xl);
  font-weight: var(--mp-font-weights-semi-bold); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  font-variant-numeric: tabular-nums; color: var(--mp-text-default);
}
.pa-figure[data-tone='adverse'] { color: var(--mp-text-danger, #a8352d); }
</style>
