/**
 * Cowork goals — the outcome layer above tasks.
 *
 * A goal is what you actually want ("Instagram followers +10% by end of month").
 * You state it in chat and assign one or more agents; the lead agent checks
 * whether it is even feasible, writes a plan, and the plan's workstreams become
 * scheduled tasks owned by agents — including agents you never assigned, which
 * the lead recruits itself. Agents then coordinate on the goal's own thread.
 *
 * Tasks stay exactly what they were (see `cowork.ts`): the ad-hoc unit of work.
 * A goal-derived task is just a task carrying `goalId` + `agentId`.
 */
import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from '~/data/persist'
import { addTask, coworkTasks, type CoworkCadence, type CoworkModule, type CoworkTask } from '~/data/cowork'
import { SIM_TODAY } from '~/data/simClock'

/**
 * draft    — stated, plan proposed, not approved yet
 * blocked  — approved but a required tool isn't connected, so it can't run
 * active   — running to plan
 * at-risk  — pace won't hit the target before the deadline
 * achieved — target met
 * archived — dropped
 */
export type GoalStatus = 'draft' | 'blocked' | 'active' | 'at-risk' | 'achieved' | 'archived'

/** What "done" means, in a number — so progress is measured, not asserted. */
export interface GoalMetric {
  name: string            // 'Instagram followers'
  unit?: string           // 'followers' | 'Rp' | '%'
  baseline: number        // where it stood when the goal was set
  target: number          // where it must be by the deadline
  current: number         // where it stands now
  direction: 'up' | 'down'
}

/** One strand of the plan, owned by a single agent, realised as tasks. */
export interface GoalWorkstream {
  id: string
  title: string
  rationale: string
  agentId: string
  taskIds: string[]
}

/** A tool the plan needs. `required` ones block the goal until connected. */
export interface GoalConnectionNeed {
  connectionId: string
  why: string
  required: boolean
}

export interface GoalPlan {
  approach: string          // how the agent intends to get there
  assumptions: string[]     // what it is taking for granted
  measurement: string       // how progress will be read
  workstreams: GoalWorkstream[]
  risks: string[]
}

/**
 * The lead agent's read on whether the goal is worth starting.
 * 'needs-input'  — not measurable yet (no baseline, no deadline, vague)
 * 'unrealistic'  — the maths doesn't work; `counter` holds what it proposes instead
 */
export interface GoalFeasibility {
  verdict: 'ok' | 'needs-input' | 'unrealistic'
  note: string
  questions?: string[]
  counter?: string
}

/** A line in the goal's agent-to-agent thread. `from`/`to` are agent ids; the
 *  user can post here too (`from: 'user'`). */
export interface GoalMessage {
  id: string
  from: string
  to?: string
  text: string
  at: string
  kind?: 'handoff' | 'update' | 'question' | 'answer' | 'result' | 'recruit'
  taskId?: string
}

export interface CoworkGoal {
  id: string
  title: string
  /** The user's own words, kept verbatim. */
  outcome: string
  metric?: GoalMetric
  deadline?: string          // ISO date
  status: GoalStatus
  createdAt: string
  /** The agent that owns the goal and wrote the plan. */
  leadAgentId: string
  /** Everyone on it — the agents you assigned plus the ones the lead recruited. */
  agentIds: string[]
  /** Agents the lead brought in itself (subset of agentIds) — shown as such. */
  recruitedAgentIds: string[]
  plan?: GoalPlan
  feasibility?: GoalFeasibility
  connections: GoalConnectionNeed[]
  taskIds: string[]
  thread: GoalMessage[]
  /** The chat room the goal was set in, so you can go back to that conversation. */
  chatSessionId?: string
  modules?: CoworkModule[]
}

// ── Store ─────────────────────────────────────────────────────────────────────

const KEY = 'cowork-goals-v1'

const GOAL_SEED: CoworkGoal[] = [
  {
    id: 'G-1002',
    title: 'Cut overdue receivables 30% by end of quarter',
    outcome: 'Turunkan piutang jatuh tempo 30% sebelum tutup kuartal',
    metric: { name: 'Overdue receivables', unit: 'Rp', baseline: 1_200_000_000, target: 840_000_000, current: 1_046_000_000, direction: 'down' },
    deadline: '2026-09-30',
    status: 'active',
    createdAt: '2026-08-11T09:00:00.000Z',
    leadAgentId: 'airene',
    agentIds: ['airene', 'sales', 'customer-support'],
    recruitedAgentIds: ['customer-support'],
    modules: ['Finance', 'CRM'],
    plan: {
      approach: 'Work the receivable book by cause, not by age: disputes go back to Sales to resolve, silent accounts get a firmer escalation ladder, and cash-flow cases get payment plans rather than another reminder.',
      assumptions: [
        'Jurnal stays the system of record for invoice status',
        'Sales can resolve a disputed line within 5 working days',
        'No new credit terms are extended to accounts already 90+ days overdue',
      ],
      measurement: 'Total overdue balance in Jurnal, read every Monday 08:00 against the Rp1.2B baseline.',
      workstreams: [
        { id: 'ws-1', title: 'Escalation ladder for silent accounts', rationale: 'The largest block is unresponsive, not unwilling — a scheduled ladder beats ad-hoc chasing.', agentId: 'airene', taskIds: ['CW-1039'] },
        { id: 'ws-2', title: 'Clear disputed invoices at source', rationale: 'Disputes sit behind Rp215M and cannot be collected until Sales issues the credit notes.', agentId: 'sales', taskIds: [] },
        { id: 'ws-3', title: 'Payment plans for cash-flow cases', rationale: 'Accounts that intend to pay but cannot yet convert better with a plan than with pressure.', agentId: 'customer-support', taskIds: [] },
      ],
      risks: ['Quarter-end pressure may push Sales to grant terms that reopen the balance'],
    },
    connections: [
      { connectionId: 'mekari-jurnal', why: 'Invoice status and balances', required: true },
      { connectionId: 'mekari-qontak', why: 'Customer contacts and conversation history', required: true },
      { connectionId: 'whatsapp', why: 'Send reminders on the channel customers actually read', required: false },
    ],
    taskIds: ['CW-1039'],
    thread: [
      { id: 'm1', from: 'airene', to: 'sales', at: '2026-08-11T09:12:00.000Z', kind: 'handoff',
        text: 'Djournal Coffee (Rp215M, 42 days) and Pochi Coffee Roasters (Rp72M, 166 days) are both blocked on disputed line items — short-shipped deliveries. I cannot collect either until a credit note is issued. Taking those two off my ladder and onto yours.' },
      { id: 'm2', from: 'sales', to: 'airene', at: '2026-08-11T09:26:00.000Z', kind: 'answer',
        text: 'Got both. Djournal is a genuine short-ship, credit note goes out this week. Pochi is a pricing query, not a delivery issue — I will need the original quote from CRM before I can close it.' },
      { id: 'm3', from: 'airene', to: 'customer-support', at: '2026-08-12T08:05:00.000Z', kind: 'recruit',
        text: 'Bringing you in: Tanamera (Rp126M, 163 days) says they are waiting on their own client. That is a cash-flow case, not a collections case — a payment plan will land better than a fourth reminder. Can you own the plan conversations?' },
      { id: 'm4', from: 'customer-support', to: 'airene', at: '2026-08-12T08:31:00.000Z', kind: 'answer',
        text: 'Yes. I will offer 3 instalments over 60 days for anything above Rp100M that has responded at least once. Tanamera first.' },
      { id: 'm5', from: 'airene', at: '2026-08-18T08:02:00.000Z', kind: 'update',
        text: 'Week 1: Rp154M cleared (Rp1.2B → Rp1.046B). Ladder is working on the silent accounts; disputes are still the slow half.' },
    ],
  },
  {
    id: 'G-1001',
    title: 'Zero stockouts on top-20 SKUs this month',
    outcome: 'Jangan sampai 20 SKU terlaris kehabisan stok bulan ini',
    metric: { name: 'Stockout incidents', unit: 'incidents', baseline: 9, target: 0, current: 3, direction: 'down' },
    deadline: '2026-08-31',
    status: 'at-risk',
    createdAt: '2026-08-04T07:30:00.000Z',
    leadAgentId: 'warehouse',
    agentIds: ['warehouse', 'fulfillment'],
    recruitedAgentIds: ['fulfillment'],
    modules: ['WMS', 'Sales'],
    plan: {
      approach: 'Move from reactive reordering to a daily reorder-point sweep, and give the fastest movers a safety-stock buffer sized to their actual lead time.',
      assumptions: ['Supplier lead times hold at the last 90-day average', 'Top-20 list is refreshed weekly from sales velocity'],
      measurement: 'Count of SKUs hitting zero on-hand while an open order exists, read daily 07:30.',
      workstreams: [
        { id: 'ws-1', title: 'Daily reorder-point sweep', rationale: 'Catches the drift before it becomes a stockout.', agentId: 'warehouse', taskIds: ['CW-1038'] },
        { id: 'ws-2', title: 'Protect at-risk outbound orders', rationale: 'When a stockout is unavoidable, the customer commitment still needs re-planning.', agentId: 'fulfillment', taskIds: [] },
      ],
      risks: ['Two suppliers have slipped lead time twice this quarter — the buffer may be undersized'],
    },
    connections: [{ connectionId: 'mekari-jurnal', why: 'Purchase orders and supplier terms', required: true }],
    taskIds: ['CW-1038'],
    thread: [
      { id: 'm1', from: 'warehouse', to: 'fulfillment', at: '2026-08-05T07:45:00.000Z', kind: 'recruit',
        text: 'Reordering alone will not hit zero — three of the nine incidents last month were orders we had already promised. I need someone owning the customer side when a stockout is already baked in. Taking you on for that.' },
      { id: 'm2', from: 'fulfillment', to: 'warehouse', at: '2026-08-05T08:10:00.000Z', kind: 'answer',
        text: 'Agreed. I will re-plan at-risk outbound daily and flag anything that needs a split shipment before it slips.' },
      { id: 'm3', from: 'warehouse', at: '2026-08-25T07:35:00.000Z', kind: 'update',
        text: 'Flagging risk: 3 incidents with 6 days left, and the target is zero for the month. Two came from one supplier slipping lead time again. Buffer needs resizing or the target does.' },
    ],
  },
]

export const coworkGoals = reactive<CoworkGoal[]>(loadSnapshot<CoworkGoal>(KEY) ?? GOAL_SEED)

export function persistGoals(): void { saveSnapshot(KEY, coworkGoals) }
if (!loadSnapshot<CoworkGoal>(KEY)) persistGoals()

let goalSeq = 1
function nextGoalId(): string {
  const nums = coworkGoals.map((g) => Number(g.id.replace(/\D/g, ''))).filter((n) => !Number.isNaN(n))
  const max = nums.length ? Math.max(...nums) : 1000
  return `G-${max + goalSeq++}`
}

export function getGoal(id: string): CoworkGoal | undefined { return coworkGoals.find((g) => g.id === id) }

export function addGoal(g: Omit<CoworkGoal, 'id'> & { id?: string }): CoworkGoal {
  const goal: CoworkGoal = { id: g.id ?? nextGoalId(), ...g }
  coworkGoals.unshift(goal)
  persistGoals()
  return goal
}

export function updateGoal(id: string, patch: Partial<CoworkGoal>): void {
  const g = getGoal(id)
  if (g) { Object.assign(g, patch); persistGoals() }
}

export function removeGoal(id: string): void {
  const i = coworkGoals.findIndex((g) => g.id === id)
  if (i >= 0) { coworkGoals.splice(i, 1); persistGoals() }
}

export function addGoalMessage(goalId: string, m: Omit<GoalMessage, 'id' | 'at'> & { at?: string }): void {
  const g = getGoal(goalId)
  if (!g) return
  g.thread.push({ id: `m-${Date.now().toString(36)}-${g.thread.length}`, at: m.at ?? new Date().toISOString(), ...m })
  persistGoals()
}

// ── Derived state ─────────────────────────────────────────────────────────────

/** 0–100. Distance travelled from baseline toward target, either direction. */
export function goalProgress(g: CoworkGoal): number {
  const m = g.metric
  if (!m) return 0
  const span = m.target - m.baseline
  if (span === 0) return m.current === m.target ? 100 : 0
  const done = (m.current - m.baseline) / span
  return Math.max(0, Math.min(100, Math.round(done * 100)))
}

/** Days left until the deadline (negative once it has passed). Measured against
 *  the app's simulated today, like every other date in the ERP. */
export function goalDaysLeft(g: CoworkGoal, today: Date = SIM_TODAY): number | null {
  if (!g.deadline) return null
  const end = new Date(g.deadline).getTime()
  const start = new Date(today.toISOString().slice(0, 10)).getTime()
  return Math.round((end - start) / 86_400_000)
}

/** Required connections the plan needs that are still not connected. */
export function missingConnections(g: CoworkGoal, connected: (id: string) => boolean): GoalConnectionNeed[] {
  return g.connections.filter((c) => c.required && !connected(c.connectionId))
}

/** The tasks belonging to a goal, newest first (the task store owns them). */
export function goalTasks(g: CoworkGoal): CoworkTask[] {
  return coworkTasks.filter((t) => t.goalId === g.id || g.taskIds.includes(t.id))
}

/** A goal is blocked while a required tool is missing; otherwise it runs. Never
 *  overrides a terminal state the user or the metric already settled. */
export function recomputeGoalStatus(g: CoworkGoal, connected: (id: string) => boolean): GoalStatus {
  if (g.status === 'achieved' || g.status === 'archived' || g.status === 'draft') return g.status
  if (missingConnections(g, connected).length) return 'blocked'
  if (g.metric && goalProgress(g) >= 100) return 'achieved'
  const left = goalDaysLeft(g)
  // Behind the pace the remaining time allows → at risk.
  if (left !== null && left >= 0 && g.metric) {
    const total = Math.max(1, Math.round((new Date(g.deadline!).getTime() - new Date(g.createdAt).getTime()) / 86_400_000))
    const elapsed = Math.max(0, total - left)
    const expected = Math.round((elapsed / total) * 100)
    if (goalProgress(g) + 15 < expected) return 'at-risk'
  }
  if (left !== null && left < 0) return 'at-risk'
  return 'active'
}

// ── Turning an approved plan into real, scheduled tasks ───────────────────────

/** One planned task as the model proposes it, before it becomes a CoworkTask. */
export interface PlannedTask {
  title: string
  prompt: string
  agentId: string
  workstreamId?: string
  module?: CoworkModule
  cadence?: CoworkCadence
  time?: string
  outputs?: string[]
}

/**
 * Materialise a plan: every planned task becomes a real scheduled CoworkTask
 * owned by its agent and tagged with the goal, and the workstreams are wired to
 * the ids they produced. This is what "approve the plan" actually does.
 */
export function createTasksForGoal(goal: CoworkGoal, planned: PlannedTask[]): CoworkTask[] {
  const made: CoworkTask[] = []
  for (const p of planned) {
    const task = addTask({
      title: p.title,
      prompt: p.prompt,
      module: p.module ?? goal.modules?.[0] ?? 'Finance',
      modules: goal.modules,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
      goalId: goal.id,
      agentId: p.agentId,
      outputs: p.outputs?.length ? p.outputs : ['Briefing summary'],
      sources: goal.modules,
      saved: true,
      schedule: p.cadence ? { cadence: p.cadence, time: p.time ?? '08:00', enabled: true } : undefined,
    })
    made.push(task)
    goal.taskIds.push(task.id)
    const ws = goal.plan?.workstreams.find((w) => w.id === p.workstreamId)
    if (ws) ws.taskIds.push(task.id)
  }
  persistGoals()
  return made
}

// ── The proposal, before it is a goal ─────────────────────────────────────────

/**
 * A plan exactly as the lead agent proposes it in chat — nothing is written to
 * the store until the user approves it. This is what the plan card renders.
 */
export interface GoalDraft {
  title: string
  metricName?: string
  metricUnit?: string
  baseline?: number
  target?: number
  direction?: 'up' | 'down'
  deadline?: string
  leadAgentId: string
  agentIds?: string[]
  recruitedAgentIds?: string[]
  modules?: CoworkModule[]
  approach?: string
  assumptions?: string[]
  measurement?: string
  risks?: string[]
  workstreams?: { id: string; title: string; rationale: string; agentId: string }[]
  connections?: GoalConnectionNeed[]
  tasks?: PlannedTask[]
}

/**
 * The structured half of an agent's reply in chat. The prose goes in the message
 * itself; anything the user has to act on renders as one of these cards.
 */
export type ChatCard =
  | { kind: 'needs-input'; questions: string[]; connections: GoalConnectionNeed[] }
  | { kind: 'counter'; counter: string; draft?: GoalDraft }
  | { kind: 'plan'; draft: GoalDraft }
  | { kind: 'goal-created'; goalId: string; taskCount: number }

/**
 * Approve a draft: the goal becomes real, its workstreams become scheduled tasks
 * owned by their agents, and its status reflects whether a required tool is still
 * missing. Returns the created goal.
 */
export function commitGoalDraft(
  draft: GoalDraft,
  outcome: string,
  connected: (id: string) => boolean,
  chatSessionId?: string,
): CoworkGoal {
  const lead = draft.leadAgentId
  const agentIds = [...new Set([lead, ...(draft.agentIds ?? [])])]
  const goal = addGoal({
    title: draft.title,
    outcome,
    metric: draft.metricName && draft.baseline != null && draft.target != null
      ? {
          name: draft.metricName,
          unit: draft.metricUnit,
          baseline: draft.baseline,
          target: draft.target,
          current: draft.baseline,
          direction: draft.direction ?? (draft.target >= draft.baseline ? 'up' : 'down'),
        }
      : undefined,
    deadline: draft.deadline,
    status: 'draft',
    createdAt: new Date().toISOString(),
    leadAgentId: lead,
    agentIds,
    recruitedAgentIds: draft.recruitedAgentIds ?? [],
    modules: draft.modules,
    plan: {
      approach: draft.approach ?? '',
      assumptions: draft.assumptions ?? [],
      measurement: draft.measurement ?? '',
      risks: draft.risks ?? [],
      workstreams: (draft.workstreams ?? []).map((w) => ({ ...w, taskIds: [] })),
    },
    connections: draft.connections ?? [],
    taskIds: [],
    thread: [],
    chatSessionId,
  })
  createTasksForGoal(goal, draft.tasks ?? [])
  goal.status = recomputeGoalStatus({ ...goal, status: 'active' }, connected)
  persistGoals()
  return goal
}
