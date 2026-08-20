/**
 * Cowork mini-DB — the AI co-worker's tasks, schedules and connections.
 * Persisted (localStorage snapshot) like the other mock tables so a demo keeps
 * its state across reloads and can be reset. Coherent with the rest of the ERP:
 * the task catalog spans every module (HR, CRM, WMS, Finance, Production, Sales).
 */
import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'

export type CoworkModule = 'HR' | 'Sales' | 'CRM' | 'WMS' | 'Finance' | 'Production'
export type CoworkTaskStatus = 'running' | 'completed' | 'scheduled' | 'failed'

export interface CoworkTask {
  id: string
  title: string
  /** The instruction actually sent to the model. */
  prompt: string
  module: CoworkModule
  status: CoworkTaskStatus
  createdAt: string
  completedAt?: string
  /** Headline result once finished, e.g. "5 things need your attention". */
  metric?: string
  /** Cached briefing (stringified plan) so a completed task reopens instantly. */
  planJson?: string
  /** True when this run was created from a schedule. */
  scheduled?: boolean
}

export type CoworkCadence = 'Daily' | 'Weekly' | 'Monthly'
export interface CoworkSchedule {
  id: string
  title: string
  prompt: string
  module: CoworkModule
  cadence: CoworkCadence
  time: string          // "08:00"
  nextRun: string       // human label e.g. "Tomorrow, 08:00"
  enabled: boolean
}

export interface CoworkConnection {
  id: string
  name: string
  category: string
  connected: boolean
  detail?: string
  /** 'google' = a real OAuth connection (Google Identity Services); 'fake' = a
   *  demo-only integration that just flips its connected state. */
  provider: 'google' | 'fake'
  /** OAuth scope(s) requested for a real Google connection. */
  scope?: string
}

/** Mekari products are connected by default (Cowork always works over them), so
 *  they are NOT listed on the Connections page — they show as built-in sources. */
export const COWORK_BUILTIN = ['Talenta', 'Qontak', 'Jurnal', 'Mekari WMS']

/** Modules Cowork can act on — used for the catalog and the module filter. */
export const COWORK_MODULES: CoworkModule[] = ['HR', 'Sales', 'CRM', 'WMS', 'Finance', 'Production']

/** A cross-module catalog of things a real ERP co-worker should be able to do.
 *  Each becomes a "suggested task" card and a schedule template. */
export interface CoworkCatalogItem {
  title: string; desc: string; module: CoworkModule; prompt: string
  /** Employee IDs (Talenta HR DB) who have run this predefined task before.
   *  length = how many times it's been used; drives the "Used N times" + avatars. */
  usedBy?: string[]
}
export const COWORK_CATALOG: CoworkCatalogItem[] = [
  // ── HR / People (Talenta) ──
  { title: 'Attendance exceptions review', module: 'HR', desc: 'Late clock-ins, missing check-outs and unapproved absences this period.',
    prompt: 'Review attendance across the workforce this period. List employees with late clock-ins, missing check-outs or unapproved absences, and flag anyone needing a follow-up.', usedBy: ['EMP-0001','EMP-0011'] },
  { title: 'Payroll run pre-check', module: 'HR', desc: 'Verify attendance, changes and approvals are complete before running payroll.',
    prompt: 'Prepare a payroll run pre-check. Confirm attendance is complete, list pending data changes or approvals, and flag anything that would block this month\'s payroll.' },
  { title: 'Contracts expiring soon', module: 'HR', desc: 'Fixed-term contracts and probation periods ending in the next 60 days.',
    prompt: 'Find employees whose contracts or probation periods end within the next 60 days. Recommend renewal, conversion or offboarding for each.' },
  { title: 'Resignation handover plan', module: 'HR', desc: 'Coordinate handovers for employees who are resigning.',
    prompt: 'For every employee currently resigning, build a handover checklist covering responsibilities, access revocation and knowledge transfer.' },

  // ── Sales / CRM (Qontak) ──
  { title: 'Sales pipeline review', module: 'CRM', desc: 'Surface stalled deals and the highest-value opportunities to prioritise.',
    prompt: 'Review the sales pipeline and top customers. Surface the open deals worth prioritising, flag stalled ones, and suggest the next best action for each.', usedBy: ['EMP-0006','EMP-0013'] },
  { title: 'Draft follow-ups for top prospects', module: 'CRM', desc: 'Prepare outreach for the highest-value prospects with no recent activity.',
    prompt: 'Identify the highest-value prospects with no recent activity and draft a short, personalised follow-up message for each.' },
  { title: 'Sales orders needing fulfilment', module: 'Sales', desc: 'Open sales orders ready to pick, pack and ship.',
    prompt: 'List open sales orders that are ready to fulfil, cross-check stock availability in the warehouse, and flag any that are blocked.' },

  // ── WMS / Warehouse ──
  { title: 'Reorder low-stock SKUs', module: 'WMS', desc: 'Compare stock against reorder points and propose a purchase plan.',
    prompt: 'Check warehouse stock against reorder points. List SKUs that are low or out of stock and propose a reorder plan before they block open sales orders.', usedBy: ['EMP-0003','EMP-0010','EMP-0016','EMP-0009'] },
  { title: 'Plan today\'s outbound fulfilment', module: 'WMS', desc: 'Prioritise picking, packing and shipping for open outbound orders.',
    prompt: 'Plan today\'s outbound fulfilment. Prioritise picking, packing and shipping tasks for open outbound orders and flag any at risk of missing their delivery date.' },
  { title: 'Schedule cycle counts', module: 'WMS', desc: 'Recommend which storage locations to count this week.',
    prompt: 'Recommend a cycle-count plan for this week based on stock value and last-counted dates, and assign counters per storage zone.' },

  // ── Production ──
  { title: 'Work orders at risk', module: 'Production', desc: 'Open work orders likely to miss their due date.',
    prompt: 'Review open production work orders. Flag any at risk of missing their due date and identify the material or capacity constraint causing it.' },
  { title: 'BOM vs stock check', module: 'Production', desc: 'Verify component availability for open work orders.',
    prompt: 'For each open work order, check the bill of materials against current component stock and list shortages that must be purchased or produced.' },

  // ── Finance (Jurnal) ──
  { title: 'Chase overdue receivables', module: 'Finance', desc: 'Find overdue invoices and draft reminders for the biggest ones.',
    prompt: 'Review overdue receivables. Identify the largest overdue invoices, draft payment reminders, and tell me who to chase first.', usedBy: ['EMP-0005','EMP-0002','EMP-0008'] },
  { title: 'Bank reconciliation review', module: 'Finance', desc: 'Match statement lines and surface unreconciled items.',
    prompt: 'Review bank reconciliation across cash accounts. Surface unmatched statement lines and suggest the likely matching transaction for each.', usedBy: ['EMP-0005','EMP-0006'] },
  { title: 'Month-end close checklist', module: 'Finance', desc: 'Everything outstanding before books can be closed this month.',
    prompt: 'Build a month-end close checklist. List unreconciled accounts, unpaid bills, overdue invoices and any journals needing review before closing the books.', usedBy: ['EMP-0005'] },
]

// ── Seeds ────────────────────────────────────────────────────────────────────
const TASKS_SEED: CoworkTask[] = [
  { id: 'CW-1042', title: 'Month-end close checklist', module: 'Finance', status: 'completed',
    prompt: COWORK_CATALOG.find((c) => c.title === 'Month-end close checklist')!.prompt,
    createdAt: '2026-08-18T09:12:00', completedAt: '2026-08-18T09:13:20', metric: '6 items to clear before close' },
  { id: 'CW-1041', title: 'Contracts expiring soon', module: 'HR', status: 'completed',
    prompt: COWORK_CATALOG.find((c) => c.title === 'Contracts expiring soon')!.prompt,
    createdAt: '2026-08-17T14:40:00', completedAt: '2026-08-17T14:41:05', metric: '2 contracts expiring in 60 days' },
  { id: 'CW-1040', title: 'Sales pipeline review', module: 'CRM', status: 'completed',
    prompt: COWORK_CATALOG.find((c) => c.title === 'Sales pipeline review')!.prompt,
    createdAt: '2026-08-15T08:05:00', completedAt: '2026-08-15T08:06:12', metric: '4 deals to prioritise this week' },
]

const SCHEDULE_SEED: CoworkSchedule[] = [
  { id: 'CS-01', title: 'Chase overdue receivables', module: 'Finance', cadence: 'Weekly', time: '08:00', nextRun: 'Mon, 25 Aug · 08:00', enabled: true,
    prompt: COWORK_CATALOG.find((c) => c.title === 'Chase overdue receivables')!.prompt },
  { id: 'CS-02', title: 'Reorder low-stock SKUs', module: 'WMS', cadence: 'Daily', time: '07:30', nextRun: 'Tomorrow · 07:30', enabled: true,
    prompt: COWORK_CATALOG.find((c) => c.title === 'Reorder low-stock SKUs')!.prompt },
  { id: 'CS-03', title: 'Attendance exceptions review', module: 'HR', cadence: 'Daily', time: '18:00', nextRun: 'Today · 18:00', enabled: false,
    prompt: COWORK_CATALOG.find((c) => c.title === 'Attendance exceptions review')!.prompt },
]

// Only external connections are listed (Mekari products are built-in). The three
// Google entries are REAL OAuth connections; the rest are demo-only.
const CONNECTION_SEED: CoworkConnection[] = [
  { id: 'gcal',     name: 'Google Calendar', category: 'Productivity', connected: false, provider: 'google',
    detail: 'Meetings, deadlines & reminders', scope: 'https://www.googleapis.com/auth/calendar.readonly' },
  { id: 'gmail',    name: 'Gmail', category: 'Email', connected: false, provider: 'google',
    detail: 'Read inbox to draft follow-ups', scope: 'https://www.googleapis.com/auth/gmail.readonly' },
  { id: 'gcontacts', name: 'Google Contacts', category: 'People', connected: false, provider: 'google',
    detail: 'Match customers & stakeholders', scope: 'https://www.googleapis.com/auth/contacts.readonly' },
  { id: 'sap',      name: 'SAP',    category: 'ERP', connected: false, provider: 'fake', detail: 'Finance & supply chain' },
  { id: 'xero',     name: 'Xero',   category: 'Accounting', connected: false, provider: 'fake', detail: 'Ledgers & invoices' },
  { id: 'notion',   name: 'Notion', category: 'Docs & wiki', connected: false, provider: 'fake', detail: 'Docs, notes & databases' },
  { id: 'hubspot',  name: 'HubSpot', category: 'CRM', connected: false, provider: 'fake', detail: 'Marketing & sales pipeline' },
  { id: 'slack',    name: 'Slack',  category: 'Messaging', connected: false, provider: 'fake', detail: 'Channels & DMs' },
]

function load<T>(key: string, seed: T[]): T[] {
  return loadSnapshot<T>(key) ?? seed
}

export const coworkTasks = reactive<CoworkTask[]>(load('cowork-tasks-v1', TASKS_SEED))
export const coworkSchedules = reactive<CoworkSchedule[]>(load('cowork-schedules-v1', SCHEDULE_SEED))
export const coworkConnections = reactive<CoworkConnection[]>(load('cowork-connections-v1', CONNECTION_SEED))

function persistTasks() { saveSnapshot('cowork-tasks-v1', coworkTasks) }
function persistSchedules() { saveSnapshot('cowork-schedules-v1', coworkSchedules) }
function persistConnections() { saveSnapshot('cowork-connections-v1', coworkConnections) }

let taskSeq = 1043
export function nextTaskId(): string { return `CW-${taskSeq++}` }

export function addTask(t: Omit<CoworkTask, 'id'> & { id?: string }): CoworkTask {
  const task: CoworkTask = { id: t.id ?? nextTaskId(), ...t }
  coworkTasks.unshift(task)
  persistTasks()
  return task
}
export function updateTask(id: string, patch: Partial<CoworkTask>): void {
  const t = coworkTasks.find((x) => x.id === id)
  if (t) { Object.assign(t, patch); persistTasks() }
}
export function deleteTask(id: string): void {
  const i = coworkTasks.findIndex((x) => x.id === id)
  if (i >= 0) { coworkTasks.splice(i, 1); persistTasks() }
}
export function getTask(id: string): CoworkTask | undefined { return coworkTasks.find((x) => x.id === id) }

export function addSchedule(s: Omit<CoworkSchedule, 'id'>): CoworkSchedule {
  const sch: CoworkSchedule = { id: `CS-${String(coworkSchedules.length + 1).padStart(2, '0')}-${Math.floor(taskSeq)}`, ...s }
  coworkSchedules.unshift(sch)
  persistSchedules()
  return sch
}
export function toggleSchedule(id: string, enabled: boolean): void {
  const s = coworkSchedules.find((x) => x.id === id)
  if (s) { s.enabled = enabled; persistSchedules() }
}
export function deleteSchedule(id: string): void {
  const i = coworkSchedules.findIndex((x) => x.id === id)
  if (i >= 0) { coworkSchedules.splice(i, 1); persistSchedules() }
}

export function setConnection(id: string, connected: boolean): void {
  const c = coworkConnections.find((x) => x.id === id)
  if (c) { c.connected = connected; persistConnections() }
}
