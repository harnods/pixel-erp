/**
 * Cowork — Module 07 Workspaces (PRD page 51325010453, Phase 1.5).
 *
 * A workspace is a shared container for a project: human members, a set of agents,
 * many chat threads (each human in their own threads), shared files, tasks and
 * artifacts — with a "Compile" step that rolls decisions across threads into one
 * artifact. Persisted as a localStorage snapshot like the other mock tables.
 *
 * Members are stored denormalised (name + title on the row) so rendering never
 * depends on an employee-table lookup; agents reference the stable coworkAgents ids.
 */
import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { coworkAgents, type CoworkAgent } from './cowork'

export type WorkspaceRole = 'owner' | 'editor' | 'viewer'
export type ThreadVisibility = 'private' | 'workspace'
export type DecisionTag = 'Decision' | 'Action item' | 'Risk' | 'Question'
export type ActivityKind = 'thread' | 'decision' | 'file' | 'artifact' | 'task'

export interface WorkspaceMember {
  /** Mekari SSO user id (EMP-xxxx). Denormalised name/title so the UI never
   *  breaks if the employee row is missing. */
  userId: string
  name: string
  title: string
  role: WorkspaceRole
}

export interface WorkspaceThread {
  id: string
  title: string
  ownerUserId: string
  agentId: string
  visibility: ThreadVisibility
  /** ISO timestamp of last activity. */
  lastActivityAt: string
  messageCount: number
  /** Sensitive threads (payroll / Sensitive-tagged sources) can't be shared (WS-04). */
  sensitive?: boolean
  tagCounts: { decision: number; action: number; risk: number; question: number }
}

export interface WorkspaceDecision {
  id: string
  tag: DecisionTag
  quote: string
  authorUserId: string
  threadId: string
  createdAt: string
  /** The tagged message was edited/regenerated after tagging (WS edge case). */
  editedSince?: boolean
}

export interface WorkspaceFile {
  id: string
  name: string
  kind: 'file' | 'artifact'
  origin: 'uploaded' | 'generated' | 'synced'
  ext: string
  updatedAt: string
  size?: string
  /** For generated artifacts — which thread/task produced it. */
  provenance?: string
}

export interface WorkspaceActivityEvent {
  id: string
  kind: ActivityKind
  text: string
  actorUserId?: string
  at: string
}

export interface CoworkWorkspace {
  id: string
  name: string
  description: string
  ownerUserId: string
  status: 'active' | 'archived'
  defaultThreadVisibility: ThreadVisibility
  members: WorkspaceMember[]
  agentIds: string[]
  threads: WorkspaceThread[]
  decisions: WorkspaceDecision[]
  /** References into coworkTasks (Module 09). */
  taskIds: string[]
  files: WorkspaceFile[]
  activity: WorkspaceActivityEvent[]
  createdAt: string
}

// ── Seed ────────────────────────────────────────────────────────────────────
// Two coherent workspaces. "Q4 production ramp-up" is the PRD §7 expected-result
// scenario (plant manager + sales lead + finance analyst).

const WORKSPACES_SEED: CoworkWorkspace[] = [
  {
    id: 'ws-q4-ramp-up',
    name: 'Q4 production ramp-up',
    description: 'Scale production for the Q4 peak: capacity, stock, hiring and the sales forecast in one place.',
    ownerUserId: 'EMP-0012',
    status: 'active',
    defaultThreadVisibility: 'workspace',
    createdAt: '2026-08-18T09:00:00+07:00',
    members: [
      { userId: 'EMP-0012', name: 'Hendra Gunawan', title: 'Plant Manager', role: 'owner' },
      { userId: 'EMP-0016', name: 'Doni Kurniawan', title: 'Sales Lead', role: 'editor' },
      { userId: 'EMP-0005', name: 'Dewi Lestari', title: 'Finance Analyst', role: 'editor' },
      { userId: 'EMP-0008', name: 'Rio Firmansyah', title: 'Warehouse Admin', role: 'viewer' },
    ],
    agentIds: ['production', 'warehouse', 'sales', 'airene'],
    threads: [
      { id: 'wt-1', title: 'Line capacity vs Q4 forecast', ownerUserId: 'EMP-0012', agentId: 'production', visibility: 'workspace', lastActivityAt: '2026-09-05T16:20:00+07:00', messageCount: 14, tagCounts: { decision: 3, action: 1, risk: 1, question: 0 } },
      { id: 'wt-2', title: 'Raw material buffer for peak weeks', ownerUserId: 'EMP-0008', agentId: 'warehouse', visibility: 'workspace', lastActivityAt: '2026-09-04T11:05:00+07:00', messageCount: 9, tagCounts: { decision: 2, action: 2, risk: 0, question: 1 } },
      { id: 'wt-3', title: 'Q4 sales forecast by region', ownerUserId: 'EMP-0016', agentId: 'sales', visibility: 'workspace', lastActivityAt: '2026-09-03T15:40:00+07:00', messageCount: 11, tagCounts: { decision: 2, action: 1, risk: 1, question: 0 } },
      { id: 'wt-4', title: 'Overtime & temp-hire budget', ownerUserId: 'EMP-0005', agentId: 'airene', visibility: 'private', lastActivityAt: '2026-09-02T10:15:00+07:00', messageCount: 7, sensitive: true, tagCounts: { decision: 1, action: 1, risk: 0, question: 0 } },
      { id: 'wt-5', title: 'My notes — supplier lead times', ownerUserId: 'EMP-0012', agentId: 'warehouse', visibility: 'private', lastActivityAt: '2026-08-29T14:00:00+07:00', messageCount: 5, tagCounts: { decision: 0, action: 0, risk: 1, question: 2 } },
    ],
    decisions: [
      { id: 'wd-1', tag: 'Decision', quote: 'Add a second shift on Line 2 for weeks 45–52; revert in January.', authorUserId: 'EMP-0012', threadId: 'wt-1', createdAt: '2026-09-05T16:10:00+07:00' },
      { id: 'wd-2', tag: 'Risk', quote: 'Resin supplier lead time is 6 weeks — a late PO risks the week-47 ramp.', authorUserId: 'EMP-0008', threadId: 'wt-5', createdAt: '2026-08-29T13:50:00+07:00' },
      { id: 'wd-3', tag: 'Decision', quote: 'Hold 3 weeks of resin buffer instead of the usual 2 through Q4.', authorUserId: 'EMP-0008', threadId: 'wt-2', createdAt: '2026-09-04T11:00:00+07:00' },
      { id: 'wd-4', tag: 'Action item', quote: 'Doni to reconfirm the East-region forecast with the top 5 accounts by Fri.', authorUserId: 'EMP-0016', threadId: 'wt-3', createdAt: '2026-09-03T15:35:00+07:00' },
      { id: 'wd-5', tag: 'Decision', quote: 'Cap temp-hire overtime at 15% of base; Finance to track weekly.', authorUserId: 'EMP-0005', threadId: 'wt-4', createdAt: '2026-09-02T10:05:00+07:00' },
    ],
    taskIds: ['CW-1040'],
    files: [
      { id: 'wf-1', name: 'Q4 capacity model.xlsx', kind: 'file', origin: 'uploaded', ext: 'xlsx', updatedAt: '2026-09-05T16:25:00+07:00', size: '48 KB' },
      { id: 'wf-2', name: 'Peak-week staffing plan.pdf', kind: 'file', origin: 'uploaded', ext: 'pdf', updatedAt: '2026-09-01T09:30:00+07:00', size: '210 KB' },
      { id: 'wf-3', name: 'Ramp-up decisions — week 3.pdf', kind: 'artifact', origin: 'generated', ext: 'pdf', updatedAt: '2026-09-06T08:00:00+07:00', size: '96 KB', provenance: 'Compiled from 4 threads · Production agent' },
    ],
    activity: [
      { id: 'wa-1', kind: 'artifact', text: 'compiled “Ramp-up decisions — week 3” from 4 threads', actorUserId: 'EMP-0012', at: '2026-09-06T08:00:00+07:00' },
      { id: 'wa-2', kind: 'decision', text: 'tagged a Decision in “Line capacity vs Q4 forecast”', actorUserId: 'EMP-0012', at: '2026-09-05T16:10:00+07:00' },
      { id: 'wa-3', kind: 'file', text: 'uploaded “Q4 capacity model.xlsx”', actorUserId: 'EMP-0012', at: '2026-09-05T16:25:00+07:00' },
      { id: 'wa-4', kind: 'thread', text: 'started “Raw material buffer for peak weeks” with Warehouse agent', actorUserId: 'EMP-0008', at: '2026-09-04T10:40:00+07:00' },
      { id: 'wa-5', kind: 'decision', text: 'tagged an Action item in “Q4 sales forecast by region”', actorUserId: 'EMP-0016', at: '2026-09-03T15:35:00+07:00' },
    ],
  },
  {
    id: 'ws-payroll-cutover',
    name: 'Payroll cutover 2027',
    description: 'Move payroll to the new period model with zero missed runs. HR, Finance and Ops aligned.',
    ownerUserId: 'EMP-0005',
    status: 'active',
    defaultThreadVisibility: 'private',
    createdAt: '2026-08-25T13:00:00+07:00',
    members: [
      { userId: 'EMP-0005', name: 'Dewi Lestari', title: 'Finance Analyst', role: 'owner' },
      { userId: 'EMP-0001', name: 'Andi Wijaya', title: 'HR Manager', role: 'editor' },
    ],
    agentIds: ['hr', 'airene'],
    threads: [
      { id: 'wt-p1', title: 'Cutover checklist & timeline', ownerUserId: 'EMP-0005', agentId: 'airene', visibility: 'workspace', lastActivityAt: '2026-09-05T09:10:00+07:00', messageCount: 8, tagCounts: { decision: 1, action: 3, risk: 0, question: 0 } },
      { id: 'wt-p2', title: 'Prorate rules for the transition month', ownerUserId: 'EMP-0001', agentId: 'hr', visibility: 'workspace', lastActivityAt: '2026-09-04T17:20:00+07:00', messageCount: 6, tagCounts: { decision: 1, action: 0, risk: 1, question: 1 } },
    ],
    decisions: [
      { id: 'wd-p1', tag: 'Decision', quote: 'Cutover on the 21 May run; parallel-run April to catch deltas.', authorUserId: 'EMP-0005', threadId: 'wt-p1', createdAt: '2026-09-05T09:05:00+07:00' },
      { id: 'wd-p2', tag: 'Risk', quote: 'Prorating mid-month hires needs a manual check for the first cycle.', authorUserId: 'EMP-0001', threadId: 'wt-p2', createdAt: '2026-09-04T17:15:00+07:00' },
    ],
    taskIds: ['CW-2050'],
    files: [
      { id: 'wf-p1', name: 'Cutover runbook.pdf', kind: 'file', origin: 'uploaded', ext: 'pdf', updatedAt: '2026-09-05T09:15:00+07:00', size: '120 KB' },
    ],
    activity: [
      { id: 'wa-p1', kind: 'decision', text: 'tagged a Decision in “Cutover checklist & timeline”', actorUserId: 'EMP-0005', at: '2026-09-05T09:05:00+07:00' },
      { id: 'wa-p2', kind: 'thread', text: 'started “Prorate rules for the transition month” with HR agent', actorUserId: 'EMP-0001', at: '2026-09-04T16:50:00+07:00' },
    ],
  },
]

// ── Store + persistence ───────────────────────────────────────────────────────
function load(): CoworkWorkspace[] {
  return loadSnapshot<CoworkWorkspace>('cowork-workspaces-v1') ?? WORKSPACES_SEED.map((w) => ({ ...w }))
}
export const coworkWorkspaces = reactive<CoworkWorkspace[]>(load())
function persist() { saveSnapshot('cowork-workspaces-v1', coworkWorkspaces) }

let wsSeq = 1
export function getWorkspace(id: string): CoworkWorkspace | undefined {
  return coworkWorkspaces.find((w) => w.id === id)
}
export function addWorkspace(w: Omit<CoworkWorkspace, 'id'> & { id?: string }): CoworkWorkspace {
  const ws: CoworkWorkspace = { id: w.id ?? `ws-${Date.now()}-${wsSeq++}`, ...w }
  coworkWorkspaces.unshift(ws)
  persist()
  return ws
}
export function updateWorkspace(id: string, patch: Partial<CoworkWorkspace>): void {
  const w = coworkWorkspaces.find((x) => x.id === id)
  if (w) { Object.assign(w, patch); persist() }
}
export function removeWorkspace(id: string): void {
  const i = coworkWorkspaces.findIndex((x) => x.id === id)
  if (i >= 0) { coworkWorkspaces.splice(i, 1); persist() }
}

// ── Resolvers ─────────────────────────────────────────────────────────────────
export function workspaceAgents(w: CoworkWorkspace): CoworkAgent[] {
  return w.agentIds.map((id) => coworkAgents.find((a) => a.id === id)).filter(Boolean) as CoworkAgent[]
}
export function memberInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join('')
}
/** Deterministic avatar colour from a member id (no external assets). */
export function memberColor(userId: string): string {
  const palette = ['#7C3AED', '#0E7090', '#B54708', '#0A6E4E', '#6941C6', '#DD2590', '#155EEF', '#C11574']
  let h = 0
  for (const c of userId) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return palette[h % palette.length]!
}
export function decisionTagCount(w: CoworkWorkspace, tag: DecisionTag): number {
  return w.decisions.filter((d) => d.tag === tag).length
}
export function memberOf(w: CoworkWorkspace, userId: string): WorkspaceMember | undefined {
  return w.members.find((m) => m.userId === userId)
}
