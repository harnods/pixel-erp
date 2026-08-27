/**
 * Cowork mini-DB — the AI co-worker's tasks, schedules and connections.
 * Persisted (localStorage snapshot) like the other mock tables so a demo keeps
 * its state across reloads and can be reset. Coherent with the rest of the ERP:
 * the task catalog spans every module (HR, CRM, WMS, Finance, Production, Sales).
 */
import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { salesInvoices } from './salesInvoices'
import { daysSince, simDaysAgo } from './simClock'
// The "Sales pipeline review" briefing reuses the canonical CRM pipeline so the
// co-worker's numbers match the CRM module (data/crm.ts).
import { pipelineStages } from './crm'
// Real-data grounding for the HR / WMS / contract tasks.
import { attendanceExceptionsForDate, attendanceName, LATEST_ATTENDANCE_DATE } from './attendance'
import type { AttendanceException } from './attendance'
import { expiringContracts, type Contract } from './contracts'
import { productIndexRows } from './productsIndex'
import type { KbAttachment } from './coworkKb'

export type CoworkModule = 'HR' | 'Sales' | 'CRM' | 'WMS' | 'Finance' | 'Production'
export type CoworkTaskStatus = 'running' | 'completed' | 'scheduled' | 'failed' | 'draft'

export interface CoworkTask {
  id: string
  title: string
  /** The instruction actually sent to the model. */
  prompt: string
  module: CoworkModule
  /** A task drawing on multiple sources touches multiple modules; when set, this
   *  is shown instead of the single `module`. */
  modules?: CoworkModule[]
  status: CoworkTaskStatus
  createdAt: string
  completedAt?: string
  /** Headline result once finished, e.g. "5 things need your attention". */
  metric?: string
  /** Cached briefing (stringified plan) so a completed task reopens instantly. */
  planJson?: string
  /** True when this run was created from a schedule. */
  scheduled?: boolean
  /** True once a predefined-task draft has been edited & saved — it then appears in
   *  the Tasks index (status 'draft' = saved but not yet run). */
  saved?: boolean
  /** Recurrence set when the task was created (shown in the Tasks "Schedule"
   *  column, and the Schedule page lists every task that has one); absent = a
   *  one-off run ("No schedule"). */
  schedule?: { cadence: CoworkCadence; time: string; nextRun?: string; enabled?: boolean }
  /** Chosen deliverables / sources / model — kept so "Run task" re-runs identically. */
  outputs?: string[]
  sources?: string[]
  model?: string
  /** AI-generated, cached on first open of the task detail: a clear instruction
   *  derived from the user's prompt, and the workflow (steps) Cowork will run. */
  instruction?: string
  workflow?: string[]
  /** Execution history — each manual/scheduled run. The task's status/metric mirror
   *  the latest run. Older tasks may have none (synthesised from the task itself). */
  runs?: CoworkRun[]
}

export interface CoworkRun {
  id: string
  ranAt: string
  status: CoworkTaskStatus
  metric?: string
  /** How long the run took, ms — shown as "Worked for Ns" on the reasoning trace. */
  durationMs?: number
  /** Stringified plan (artifacts) for this run. */
  planJson?: string
}

export type CoworkCadence = 'Daily' | 'Weekly' | 'Monthly'

// Fixed category order for the Connections marketplace grid.
export type CoworkConnectionCategory =
  | 'Featured' | 'Productivity' | 'Business & operations' | 'Data & analytics' | 'Communication' | 'Finance'
export const COWORK_CONNECTION_CATEGORIES: CoworkConnectionCategory[] =
  ['Featured', 'Productivity', 'Business & operations', 'Data & analytics', 'Communication', 'Finance']

export interface CoworkConnection {
  id: string
  name: string
  /** Every category this app appears under (an app can be Featured + Productivity). */
  categories: CoworkConnectionCategory[]
  connected: boolean
  detail?: string
  /** 'google' = a real OAuth connection (Google Identity Services); 'fake' = a
   *  demo-only integration that just flips its connected state. */
  provider: 'google' | 'fake'
  /** OAuth scope(s) requested for a real Google connection. */
  scope?: string
  /** Brand colour for the logo tile (monogram fallback — no external assets). */
  color?: string
  /** Explicit logo path — overrides the /connectors/<id>.png convention (e.g. a
   *  custom MCP server pointing at a known host). */
  logo?: string
}

/** Mekari products are connected by default (Cowork always works over them), so
 *  they are NOT listed on the Connections page — they show as built-in sources. */
export const COWORK_BUILTIN = ['Talenta', 'Qontak', 'Jurnal', 'Mekari WMS']

// ── HR attendance exceptions — now generated deterministically from the REAL
//    employee directory (see data/attendance.ts), so every flagged person matches
//    the directory the co-worker is also given. Re-exported here for existing
//    importers (useCoworkContext). ──
export type { AttendanceExceptionType, AttendanceException } from './attendance'
export { attendanceExceptions } from './attendance'

// ── Receivables collections (Jurnal) — the "who hasn't paid, why, and history"
//    grounding for the finance tasks + chat. Each row references a real overdue
//    sales invoice (see data/salesInvoices.ts) so figures stay coherent. This is
//    what lets the co-worker answer "which customers are overdue and why". ──
export interface ReceivableCollection {
  invoiceId: string
  invoiceNumber: string
  customerId: string
  customer: string
  amount: number
  dueDate: string
  daysOverdue: number
  /** Why it's unpaid — the collections note. */
  reason: string
  riskLevel: 'High' | 'Medium' | 'Low'
  lastContact: { date: string; channel: 'Email' | 'Phone' | 'WhatsApp' | 'Meeting'; outcome: string }
  promiseToPay?: string
  /** How this customer has paid in the past — the payment-behaviour history. */
  history: string
  owner: string
}
// Collection narratives — attached (cycled) to the REAL overdue invoices so the
// chase-receivables task is rich AND grounded in actual AR data.
interface CollectionNarrative {
  reason: string; riskLevel: 'High' | 'Medium' | 'Low'
  channel: 'Email' | 'Phone' | 'WhatsApp' | 'Meeting'; outcome: string
  promiseInDays: number | null; history: string; owner: string
}
const COLLECTION_NARRATIVES: CollectionNarrative[] = [
  { reason: 'Disputed delivery — customer claims line items were short-shipped and is withholding payment until a credit note is issued.', riskLevel: 'High', channel: 'Phone', outcome: 'AP manager agreed to release payment once the credit note is received.', promiseInDays: 7, history: 'Repeat late payer — pays on average 24 days late.', owner: 'Andi Pratama (Finance)' },
  { reason: 'Cash-flow constraint — waiting on a payment from their own client; requested a 30-day extension.', riskLevel: 'Medium', channel: 'WhatsApp', outcome: 'Requested to split into 2 instalments; awaiting our approval.', promiseInDays: 14, history: 'Generally reliable — first time overdue in 12 months.', owner: 'Andi Pratama (Finance)' },
  { reason: 'Invoice never reached AP — sent to the wrong email; the new finance PIC only received it last week.', riskLevel: 'Low', channel: 'Email', outcome: 'New PIC confirmed receipt and scheduled payment in their next run.', promiseInDays: 3, history: 'New customer — first invoice with us, no prior history yet.', owner: 'Dewi Lestari (Finance)' },
  { reason: 'Unresponsive — three reminders sent with no reply; phone on file goes to voicemail.', riskLevel: 'High', channel: 'Email', outcome: 'No response to the 3rd reminder.', promiseInDays: null, history: 'Slow payer — averages 40+ days late; previous invoice needed 4 reminders.', owner: 'Dewi Lestari (Finance)' },
  { reason: 'Approval delay in their finance team over a new vendor form.', riskLevel: 'Medium', channel: 'Phone', outcome: 'Vendor form completed; payment scheduled.', promiseInDays: 5, history: 'Occasional late payer — usually settles within 2 weeks of a reminder.', owner: 'Andi Pratama (Finance)' },
  { reason: 'Partial payment made; remainder held pending a pricing query.', riskLevel: 'Medium', channel: 'Meeting', outcome: 'Pricing clarified; balance release in progress.', promiseInDays: 6, history: 'Large B2B account — pays in tranches, needs occasional nudging.', owner: 'Andi Pratama (Finance)' },
  { reason: 'Awaiting PO-to-invoice match on their side before releasing payment.', riskLevel: 'Low', channel: 'Email', outcome: 'Confirmed match; payment expected shortly.', promiseInDays: 4, history: 'Reliable payer — usually clears within days once matched.', owner: 'Dewi Lestari (Finance)' },
]
// Derived from the real overdue sales invoices (data/salesInvoices.ts), sorted by
// exposure, so figures/customers/dates always match the AR ledger.
export const receivablesCollections: ReceivableCollection[] = [...salesInvoices]
  .filter((inv) => inv.status === 'overdue')
  .sort((a, b) => b.balance - a.balance)
  .map((inv, idx) => {
    const n = COLLECTION_NARRATIVES[idx % COLLECTION_NARRATIVES.length]!
    return {
      invoiceId: inv.id,
      invoiceNumber: `INV-${inv.number}`,
      customerId: inv.customer.id,
      customer: inv.customer.name,
      amount: inv.balance,
      dueDate: inv.dueDate,
      daysOverdue: daysSince(inv.dueDate),
      reason: n.reason,
      riskLevel: n.riskLevel,
      lastContact: { date: simDaysAgo(3 + (idx % 10)), channel: n.channel, outcome: n.outcome },
      ...(n.promiseInDays != null ? { promiseToPay: simDaysAgo(-n.promiseInDays) } : {}),
      history: n.history,
      owner: n.owner,
    }
  })

/** Modules Cowork can act on — used for the catalog and the module filter. */
export const COWORK_MODULES: CoworkModule[] = ['HR', 'Sales', 'CRM', 'WMS', 'Finance', 'Production']

/** A cross-module catalog of things a real ERP co-worker should be able to do.
 *  Each becomes a "suggested task" card and a schedule template. */
export interface CoworkCatalogItem {
  title: string; desc: string; module: CoworkModule; prompt: string
  /** Predefined (hardcoded) task-detail info — shown on the pre-run detail page
   *  without any generation. Custom (prompt) tasks derive these from their run. */
  instruction: string
  workflow: string[]
  outputs: string[]
  /** Employee IDs (Talenta HR DB) who have run this predefined task before.
   *  length = how many times it's been used; drives the "Used N times" + avatars. */
  usedBy?: string[]
}
const OUT_BRIEF = ['Briefing summary']
const OUT_BRIEF_ACTIONS = ['Briefing summary', 'Action items']
export const COWORK_CATALOG: CoworkCatalogItem[] = [
  // ── HR / People (Talenta) ──
  { title: 'Attendance exceptions review', module: 'HR', desc: 'Late clock-ins, missing check-outs and unapproved absences this period.',
    prompt: 'Review attendance across the workforce this period. List employees with late clock-ins, missing check-outs or unapproved absences, and flag anyone needing a follow-up.',
    instruction: "I will scan this period's attendance in Talenta, isolate every late clock-in, missing check-out and unapproved absence, and separate one-offs from recurring patterns so you know exactly who needs a follow-up.",
    workflow: ["Read the latest attendance log from Talenta.", "Isolate late clock-ins, missing check-outs and unapproved absences.", "Match each to the employee profile and add the reason.", "Flag recurring patterns and who to escalate."],
    outputs: OUT_BRIEF_ACTIONS, usedBy: ['EMP-0001','EMP-0011'] },
  { title: 'Payroll run pre-check', module: 'HR', desc: 'Verify attendance, changes and approvals are complete before running payroll.',
    prompt: 'Prepare a payroll run pre-check. Confirm attendance is complete, list pending data changes or approvals, and flag anything that would block this month\'s payroll.',
    instruction: "I will run a pre-payroll check across Talenta — confirming attendance is complete, listing any pending data changes or approvals, and flagging anything that would block this month's payroll run.",
    workflow: ["Confirm attendance and timesheets are finalised.", "List pending data changes and approvals.", "Cross-check contract and salary updates.", "Flag blockers before payroll is run."],
    outputs: OUT_BRIEF_ACTIONS },
  { title: 'Contracts expiring soon', module: 'HR', desc: 'Fixed-term contracts and probation periods ending in the next 60 days.',
    prompt: 'Find employees whose contracts or probation periods end within the next 60 days. Recommend renewal, conversion or offboarding for each.',
    instruction: "I will find every employee whose fixed-term contract or probation ends within the next 60 days and recommend renewal, conversion or offboarding for each, with the reasoning.",
    workflow: ["Pull contract and probation end dates from Talenta.", "Filter to those ending within 60 days.", "Recommend renew / convert / offboard for each.", "Draft a summary for HR to action."],
    outputs: OUT_BRIEF_ACTIONS },
  { title: 'Resignation handover plan', module: 'HR', desc: 'Coordinate handovers for employees who are resigning.',
    prompt: 'For every employee currently resigning, build a handover checklist covering responsibilities, access revocation and knowledge transfer.',
    instruction: "I will build a handover plan for every employee currently resigning — covering their responsibilities, access to revoke, and the knowledge that must be transferred before they leave.",
    workflow: ["List employees currently resigning.", "Map each person's responsibilities and systems.", "Build a handover + access-revocation checklist.", "Assign owners and due dates."],
    outputs: OUT_BRIEF_ACTIONS },

  // ── Sales / CRM (Qontak) ──
  { title: 'Sales pipeline review', module: 'CRM', desc: 'Surface stalled deals and the highest-value opportunities to prioritise.',
    prompt: 'Review the sales pipeline and top customers. Surface the open deals worth prioritising, flag stalled ones, and suggest the next best action for each.',
    instruction: "I will review the open pipeline in Qontak, rank deals by stage and value, flag the ones that have stalled, and recommend the next best action for each priority deal.",
    workflow: ["Pull the open pipeline and top accounts.", "Rank deals by stage and value.", "Flag deals with no recent activity.", "Recommend the next best action for each."],
    outputs: OUT_BRIEF_ACTIONS, usedBy: ['EMP-0006','EMP-0013'] },
  { title: 'Draft follow-ups for top prospects', module: 'CRM', desc: 'Prepare outreach for the highest-value prospects with no recent activity.',
    prompt: 'Identify the highest-value prospects with no recent activity and draft a short, personalised follow-up message for each.',
    instruction: "I will identify the highest-value prospects that have gone quiet and draft a short, personalised follow-up message for each, ready for you to send.",
    workflow: ["Find high-value prospects with no recent activity.", "Review each account's context and last touch.", "Draft a personalised follow-up per prospect.", "Prioritise who to contact first."],
    outputs: ['Briefing summary', 'Email draft'] },
  { title: 'Sales orders needing fulfilment', module: 'Sales', desc: 'Open sales orders ready to pick, pack and ship.',
    prompt: 'List open sales orders that are ready to fulfil, cross-check stock availability in the warehouse, and flag any that are blocked.',
    instruction: "I will list the open sales orders ready to fulfil, cross-check each against warehouse stock, and flag any that are blocked so nothing slips.",
    workflow: ["Pull open sales orders.", "Cross-check stock availability per order.", "Flag orders blocked on stock.", "Prioritise the ready-to-ship queue."],
    outputs: OUT_BRIEF_ACTIONS },

  // ── WMS / Warehouse ──
  { title: 'Reorder low-stock SKUs', module: 'WMS', desc: 'Compare stock against reorder points and propose a purchase plan.',
    prompt: 'Check warehouse stock against reorder points. List SKUs that are low or out of stock and propose a reorder plan before they block open sales orders.',
    instruction: "I will compare warehouse on-hand stock against reorder points, list every SKU that is low or out of stock, and propose a sized reorder plan before it blocks any open orders.",
    workflow: ["Read on-hand stock across warehouses.", "Compare against reorder points.", "Size the reorder for each low SKU.", "Rank by urgency and lead time."],
    outputs: ['Briefing summary', 'Action items', 'Spreadsheet'], usedBy: ['EMP-0003','EMP-0010','EMP-0016','EMP-0009'] },
  { title: 'Plan today\'s outbound fulfilment', module: 'WMS', desc: 'Prioritise picking, packing and shipping for open outbound orders.',
    prompt: 'Plan today\'s outbound fulfilment. Prioritise picking, packing and shipping tasks for open outbound orders and flag any at risk of missing their delivery date.',
    instruction: "I will plan today's outbound fulfilment — prioritising picking, packing and shipping for the open orders and flagging any at risk of missing their delivery date.",
    workflow: ["Pull open outbound orders.", "Prioritise picking, packing and shipping.", "Flag orders at risk of a late delivery.", "Produce today's fulfilment plan."],
    outputs: OUT_BRIEF_ACTIONS },
  { title: 'Schedule cycle counts', module: 'WMS', desc: 'Recommend which storage locations to count this week.',
    prompt: 'Recommend a cycle-count plan for this week based on stock value and last-counted dates, and assign counters per storage zone.',
    instruction: "I will recommend this week's cycle-count plan based on stock value and last-counted dates, and assign counters per storage zone.",
    workflow: ["Review stock value and last-counted dates.", "Select the locations due for a count.", "Assign counters per zone.", "Produce the weekly count schedule."],
    outputs: OUT_BRIEF_ACTIONS },

  // ── Production ──
  { title: 'Work orders at risk', module: 'Production', desc: 'Open work orders likely to miss their due date.',
    prompt: 'Review open production work orders. Flag any at risk of missing their due date and identify the material or capacity constraint causing it.',
    instruction: "I will review open production work orders, flag the ones at risk of missing their due date, and pinpoint the material or capacity constraint behind each.",
    workflow: ["Pull open work orders and due dates.", "Assess progress vs plan.", "Flag at-risk orders and the constraint.", "Recommend how to recover each."],
    outputs: OUT_BRIEF_ACTIONS },
  { title: 'BOM vs stock check', module: 'Production', desc: 'Verify component availability for open work orders.',
    prompt: 'For each open work order, check the bill of materials against current component stock and list shortages that must be purchased or produced.',
    instruction: "I will check each open work order's bill of materials against current component stock and list every shortage that must be purchased or produced first.",
    workflow: ["List open work orders and their BOMs.", "Compare components against on-hand stock.", "List shortages per work order.", "Recommend purchase or produce for each."],
    outputs: ['Briefing summary', 'Action items', 'Spreadsheet'] },

  // ── Finance (Jurnal) ──
  { title: 'Chase overdue receivables', module: 'Finance', desc: 'Find overdue invoices and draft reminders for the biggest ones.',
    prompt: 'Review overdue receivables. Identify the largest overdue invoices, draft payment reminders, and tell me who to chase first.',
    instruction: "I will review overdue receivables in Jurnal, rank the largest overdue invoices by value and risk, draft payment reminders, and tell you exactly who to chase first.",
    workflow: ["Pull overdue invoices and collection notes.", "Rank by value, risk and days overdue.", "Draft a reminder for the top accounts.", "Produce a prioritised chase list."],
    outputs: ['Briefing summary', 'Action items', 'Email draft', 'Spreadsheet'], usedBy: ['EMP-0005','EMP-0002','EMP-0008'] },
  { title: 'Bank reconciliation review', module: 'Finance', desc: 'Match statement lines and surface unreconciled items.',
    prompt: 'Review bank reconciliation across cash accounts. Surface unmatched statement lines and suggest the likely matching transaction for each.',
    instruction: "I will review bank reconciliation across your cash accounts, surface the unmatched statement lines, and suggest the likely matching transaction for each.",
    workflow: ["Pull statement lines and ledger entries.", "Match lines to transactions.", "Surface the unmatched items.", "Suggest the likely match for each."],
    outputs: OUT_BRIEF_ACTIONS, usedBy: ['EMP-0005','EMP-0006'] },
  { title: 'Month-end close checklist', module: 'Finance', desc: 'Everything outstanding before books can be closed this month.',
    prompt: 'Build a month-end close checklist. List unreconciled accounts, unpaid bills, overdue invoices and any journals needing review before closing the books.',
    instruction: "I will build the month-end close checklist — listing unreconciled accounts, unpaid bills, overdue invoices and any journals needing review — so you know exactly what stands between you and a clean close.",
    workflow: ["Scan receivables, payables and bank reconciliation.", "List everything outstanding before close.", "Assign an owner and due date to each item.", "Compile the close checklist."],
    outputs: ['Briefing summary', 'Action items', 'PDF report'], usedBy: ['EMP-0005'] },
]

// ── Grounded run-result builders ──────────────────────────────────────────────
// These synthesise a task's stored run result (planJson) directly from the mock
// tables above, so the run history shown on a scheduled task is REAL and accurate
// to the data — matching what a live Gemini run would produce.
function money(n: number): string {
  if (n >= 1_000_000_000) return `Rp${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `Rp${Math.round(n / 1_000_000)}M`
  return `Rp${n.toLocaleString('id-ID')}`
}

function receivablesPlan(rows: ReceivableCollection[] = receivablesCollections, daysAdj = 0) {
  // As-of adjustment: the same invoice was fewer days overdue in an earlier run.
  const dOver = (r: ReceivableCollection) => Math.max(1, r.daysOverdue + daysAdj)
  const total = rows.reduce((a, r) => a + r.amount, 0)
  const high = rows.filter((r) => r.riskLevel === 'High')
  const top = rows[0]!
  return {
    taskTitle: 'Chase overdue receivables',
    intro: 'Reviewed every overdue invoice in Jurnal, cross-checked the collections notes, and prepared a chase list plus a reminder draft.',
    metric: `${rows.length} invoices overdue · ${money(total)}`,
    sources: [
      { name: 'Jurnal — receivables', detail: `${rows.length} overdue invoices totalling ${money(total)}` },
      { name: 'Collections notes', detail: `${high.length} high-risk accounts` },
      { name: 'Qontak CRM', detail: 'Customer contacts & payment history' },
    ],
    steps: [
      { title: 'Pull overdue invoices', detail: `Found ${rows.length} invoices past due in Jurnal.` },
      { title: 'Match collection notes', detail: 'Attached the reason and last-contact outcome to each.' },
      { title: 'Rank by risk & value', detail: 'Sorted by risk level and balance to decide who to chase first.' },
      { title: 'Draft outputs', detail: 'Produced the chase list, action items and a reminder email.' },
    ],
    artifacts: {
      briefing: {
        summary: rows.map((r) => ({
          title: `${r.customer} — ${money(r.amount)}`,
          detail: `${r.invoiceNumber}, ${dOver(r)} days overdue. ${r.reason}`,
          priority: r.riskLevel,
        })),
        findings: (() => {
          // Derived so each run's findings match the invoices overdue THAT week.
          const byCust: Record<string, number> = {}
          for (const r of rows) byCust[r.customer] = (byCust[r.customer] ?? 0) + r.amount
          const [topCust, topAmt] = Object.entries(byCust).sort((a, b) => b[1] - a[1])[0]!
          const f: { title: string; detail: string }[] = [
            { title: 'Largest exposure', detail: `${topCust} holds ${money(topAmt)} — the biggest single-customer overdue balance this run.` },
          ]
          const unresponsive = rows.find((r) => /unresponsive/i.test(r.reason))
          if (unresponsive) f.push({ title: 'Escalate', detail: `${unresponsive.customer} (${money(unresponsive.amount)}) is unresponsive — escalate to a call or hold further orders.` })
          const quick = rows.find((r) => r.riskLevel === 'Low' && r.promiseToPay)
          if (quick) f.push({ title: 'Quick win', detail: `${quick.customer} (${money(quick.amount)}) promised payment by ${quick.promiseToPay}.` })
          return f
        })(),
      },
      actionItems: high.map((r) => ({
        title: `Chase ${r.customer}`, detail: `${r.invoiceNumber} (${money(r.amount)}) — ${r.reason}`,
        owner: r.owner, due: r.promiseToPay ?? 'This week', priority: 'High',
      })),
      email: {
        to: top.customer, subject: `Payment reminder — ${top.invoiceNumber} (${money(top.amount)})`,
        body: `Dear ${top.customer} team,\n\nOur records show invoice ${top.invoiceNumber} for ${money(top.amount)}, due ${top.dueDate}, is now ${dOver(top)} days overdue.\n\nWe understand a credit note for the short-shipped items is pending — we are processing that now and will send it shortly. Once received, we would appreciate settlement by ${top.promiseToPay}.\n\nPlease let us know if anything else is blocking payment.\n\nBest regards,\nRizal Candra\nFinance, PT Central Perk Indonesia`,
      },
      spreadsheet: {
        title: 'Overdue receivables',
        columns: ['Invoice', 'Customer', 'Amount', 'Days overdue', 'Risk', 'Reason', 'Owner'],
        rows: rows.map((r) => [r.invoiceNumber, r.customer, money(r.amount), String(dOver(r)), r.riskLevel, r.reason, r.owner]),
      },
    },
  }
}

function attendancePlan(ex: AttendanceException[] = attendanceExceptionsForDate(LATEST_ATTENDANCE_DATE)) {
  const name = (id: string) => attendanceName(id)
  const prio = (e: AttendanceException): 'High' | 'Medium' | 'Low' =>
    e.type === 'Unapproved absence' ? 'High' : (e.minutesLate && e.minutesLate > 30 ? 'Medium' : 'Low')
  return {
    taskTitle: 'Attendance exceptions review',
    intro: `Checked this morning's attendance in Talenta, flagged every exception, and added the reason and a read on each pattern.`,
    metric: `${ex.length} exceptions on ${ex[0]!.date}`,
    sources: [
      { name: 'Talenta — attendance', detail: `${ex.length} exceptions on ${ex[0]!.date}` },
      { name: 'Employee directory', detail: 'Profiles, tenure & manager for each person' },
    ],
    steps: [
      { title: 'Pull today\'s log', detail: `Read the ${ex[0]!.date} attendance log from Talenta.` },
      { title: 'Isolate exceptions', detail: `Found ${ex.length} late clock-ins, missing check-outs and unapproved absences.` },
      { title: 'Add context', detail: 'Matched each to the employee profile and the stated reason.' },
      { title: 'Analyse patterns', detail: 'Separated recurring issues from one-offs and system glitches.' },
    ],
    artifacts: {
      briefing: {
        summary: ex.map((e) => ({
          title: `${name(e.employeeId)} — ${e.type}`,
          detail: `${e.clockIn ? `Clocked in ${e.clockIn} (${e.minutesLate}m late). ` : ''}${e.reason} ${e.analysis}`,
          priority: prio(e),
        })),
        findings: (() => {
          // Derived from the exceptions present on THIS day.
          const f: { title: string; detail: string }[] = []
          const absent = ex.find((e) => e.type === 'Unapproved absence')
          if (absent) f.push({ title: 'Needs escalation', detail: `${name(absent.employeeId)} — unapproved absence. ${absent.analysis}` })
          const glitch = ex.find((e) => /outage|glitch|system/i.test(e.reason))
          if (glitch) f.push({ title: 'Not a real issue', detail: `${name(glitch.employeeId)}: ${glitch.reason} Exclude from lateness stats.` })
          const worst = [...ex].filter((e) => e.minutesLate).sort((a, b) => (b.minutesLate ?? 0) - (a.minutesLate ?? 0))[0]
          if (worst) f.push({ title: 'Latest arrival', detail: `${name(worst.employeeId)} clocked in ${worst.clockIn} (${worst.minutesLate}m late). ${worst.analysis}` })
          return f.length ? f : [{ title: 'All clear', detail: 'No exceptions needed escalation today.' }]
        })(),
      },
      actionItems: (() => {
        const items: { title: string; detail: string; owner: string; due: string; priority: 'High' | 'Medium' | 'Low' }[] = []
        const absent = ex.find((e) => e.type === 'Unapproved absence')
        if (absent) items.push({ title: 'Follow up unapproved absence', detail: `Contact ${name(absent.employeeId)} and their manager. ${absent.analysis}`, owner: 'HR Business Partner', due: 'Today', priority: 'High' })
        const miss = ex.find((e) => e.type === 'Missing check-out' && !/outage|glitch|system/i.test(e.reason))
        if (miss) items.push({ title: 'Fix missing check-out', detail: `Remind ${name(miss.employeeId)} to clock out / enable auto-checkout.`, owner: 'HR Ops', due: 'This week', priority: 'Medium' })
        const glitch = ex.find((e) => /outage|glitch|system/i.test(e.reason))
        if (glitch) items.push({ title: 'Log system outage', detail: 'File the attendance-device outage so affected staff are not penalised.', owner: 'Facilities', due: 'Today', priority: 'Low' })
        return items.length ? items : [{ title: 'No action needed', detail: 'Attendance was clean today.', owner: 'HR', due: '—', priority: 'Low' }]
      })(),
    },
  }
}

/** Build dated historical runs (most recent first), each with its OWN plan so the
 *  content genuinely differs run-to-run — not just the title. */
function scheduledRuns(taskId: string, runs: { ranAt: string; plan: any }[]): CoworkRun[] {
  return runs.map((r, i) => ({
    id: `${taskId}-r${runs.length - i}`,
    ranAt: r.ranAt, status: 'completed',
    metric: r.plan.metric,
    planJson: JSON.stringify(r.plan),
  }))
}

// Low-stock SKUs — computed from the REAL warehouse inventory (productIndexRows),
// so the reorder plan matches the stock the co-worker sees on the WMS pages and in
// its own WMS context. `minStock` is the reorder point; `onTheWay` is real
// in-transit qty. No hardcoded stock literals.
interface LowStockRow { sku: string; name: string; onHand: number; available: number; reorder: number; unit: string; onTheWay: number; suggest: number }
function computeLowStock(): LowStockRow[] {
  // Same "low stock" definition the WMS pages + Cowork context use: available
  // (on-hand minus reserved) at or below the reorder point.
  return productIndexRows()
    .filter((r) => r.available <= r.minStock)
    .map((r) => ({
      sku: r.sku, name: r.name, onHand: r.onHand, available: r.available, reorder: r.minStock, unit: r.unit,
      onTheWay: r.onTheWay, suggest: Math.max(r.minStock * 2 - r.available - r.onTheWay, r.minStock),
    }))
    .sort((a, b) => (a.available - a.reorder) - (b.available - b.reorder))   // most-below-line first
}
function reorderPlan(stock: LowStockRow[] = computeLowStock()) {
  const LOW_STOCK = stock
  const out = LOW_STOCK.filter((s) => s.available <= 0)
  const wayNote = (s: LowStockRow) => s.onTheWay > 0 ? ` ${s.onTheWay} ${s.unit.toLowerCase()} already on the way.` : ''
  return {
    taskTitle: 'Reorder low-stock SKUs',
    intro: 'Compared warehouse on-hand stock against reorder points and drafted a purchase plan for everything below the line.',
    metric: `${LOW_STOCK.length} SKUs below reorder point`,
    sources: [
      { name: 'Mekari WMS — stock', detail: `${LOW_STOCK.length} SKUs at/under reorder point` },
      { name: 'Sales orders', detail: 'Cross-checked open orders that need these SKUs' },
      { name: 'In-transit stock', detail: 'Netted off quantities already on the way' },
    ],
    steps: [
      { title: 'Read stock levels', detail: 'Pulled on-hand quantities across active warehouses.' },
      { title: 'Compare reorder points', detail: `Found ${LOW_STOCK.length} SKUs at/below their reorder point (${out.length} out of stock).` },
      { title: 'Size the reorder', detail: 'Proposed quantities to bring each back above the line, net of stock on the way.' },
      { title: 'Draft the plan', detail: 'Produced a reorder list ranked by urgency.' },
    ],
    artifacts: {
      briefing: {
        summary: LOW_STOCK.map((s) => ({
          title: `${s.name} — ${s.available}/${s.reorder} ${s.unit}`,
          detail: `${s.available <= 0 ? 'OUT OF STOCK. ' : ''}Available ${s.available} (on-hand ${s.onHand}) vs reorder point ${s.reorder}.${wayNote(s)} Suggest ordering ${s.suggest} ${s.unit.toLowerCase()}.`,
          priority: s.available <= 0 ? 'High' : (s.available < s.reorder / 2 ? 'Medium' : 'Low'),
        })),
        findings: (() => {
          const f: { title: string; detail: string }[] = []
          const zero = LOW_STOCK.find((s) => s.available <= 0)
          if (zero) f.push({ title: 'Out of stock', detail: `${zero.name} has no available stock — this blocks cafe orders; expedite a reorder today.${wayNote(zero)}` })
          const deepest = [...LOW_STOCK].sort((a, b) => (a.available - a.reorder) - (b.available - b.reorder))[0]
          if (deepest && deepest !== zero) f.push({ title: 'Furthest below the line', detail: `${deepest.name}: only ${deepest.available} available of a ${deepest.reorder} ${deepest.unit.toLowerCase()} reorder point — order ${deepest.suggest} now.` })
          return f.length ? f : [{ title: 'All clear', detail: 'No SKUs are at or below their reorder point.' }]
        })(),
      },
      actionItems: LOW_STOCK.filter((s) => s.available < s.reorder / 2).map((s) => ({
        title: `Raise PR for ${s.name}`, detail: `Order ${s.suggest} ${s.unit.toLowerCase()}.${wayNote(s)}`,
        owner: 'Warehouse — Wulan Santoso', due: s.available <= 0 ? 'Today' : 'This week', priority: s.available <= 0 ? 'High' : 'Medium',
      })),
      spreadsheet: {
        title: 'Low-stock reorder plan',
        columns: ['SKU', 'Product', 'On-hand', 'Available', 'Reorder point', 'On the way', 'Suggested order'],
        rows: LOW_STOCK.map((s) => [s.sku, s.name, `${s.onHand} ${s.unit}`, `${s.available} ${s.unit}`, `${s.reorder} ${s.unit}`, `${s.onTheWay} ${s.unit}`, `${s.suggest} ${s.unit}`]),
      },
    },
  }
}

interface PStage { name: string; count: number; value: number }
function pipelinePlan(stages: PStage[] = pipelineStages) {
  const open = stages.filter((s) => s.name !== 'Won' && s.name !== 'Lost')
  const deals = open.reduce((a, s) => a + s.count, 0)
  const value = open.reduce((a, s) => a + s.value, 0)
  const byName = (n: string) => open.find((s) => s.name === n) ?? { count: 0, value: 0 }
  const won = stages.find((s) => s.name === 'Won')?.value ?? 0
  const lost = stages.find((s) => s.name === 'Lost')?.value ?? 0
  return {
    taskTitle: 'Sales pipeline review',
    intro: 'Reviewed the open pipeline in Qontak, flagged stalled deals and picked the next best action for the top opportunities.',
    metric: `${deals} open deals · ${money(value)}`,
    sources: [
      { name: 'Qontak — pipeline', detail: `${deals} open deals across ${open.length} stages (${money(value)})` },
      { name: 'Customer records', detail: 'Top accounts by lifetime value' },
      { name: 'Activity log', detail: 'Last-touch dates to spot stalled deals' },
    ],
    steps: [
      { title: 'Load pipeline', detail: `Pulled ${deals} open deals worth ${money(value)}.` },
      { title: 'Score by stage & value', detail: 'Ranked by stage and deal size.' },
      { title: 'Flag stalled deals', detail: 'Identified deals with no recent activity.' },
      { title: 'Recommend actions', detail: 'Suggested the next step for each priority deal.' },
    ],
    artifacts: {
      briefing: {
        summary: [
          { title: `Negotiation — ${money(byName('Negotiation').value)} (${byName('Negotiation').count} deals)`, detail: 'Closest to close. Push for signature this week; offer the volume discount already approved.', priority: 'High' },
          { title: `Proposal sent — ${money(byName('Proposal sent').value)} (${byName('Proposal sent').count} deals)`, detail: 'Awaiting customer response. Some have had no reply in 10+ days — follow up directly.', priority: 'High' },
          { title: `Qualified — ${money(byName('Qualified').value)} (${byName('Qualified').count} deals)`, detail: 'Largest open value. Book discovery calls to move them to proposal.', priority: 'Medium' },
          { title: `New — ${money(byName('New').value)} (${byName('New').count} deals)`, detail: 'Fresh inbound. Qualify quickly before they go cold.', priority: 'Low' },
        ],
        findings: [
          { title: 'Stalled', detail: `${Math.max(1, byName('Proposal sent').count - 2)} "Proposal sent" deals have had no activity for 10+ days — highest risk of slipping.` },
          { title: 'Conversion', detail: `Won this period is ${money(won)} vs ${money(lost)} lost — a ${won + lost ? Math.round((won / (won + lost)) * 100) : 0}% win rate to protect.` },
        ],
      },
      actionItems: [
        { title: 'Close the Negotiation deals', detail: `Send final contracts to the ${byName('Negotiation').count} deals in Negotiation.`, owner: 'Sales — Fajar Nugroho', due: 'This week', priority: 'High' },
        { title: 'Chase stalled proposals', detail: `Call the ${Math.max(1, byName('Proposal sent').count - 2)} unresponsive "Proposal sent" accounts.`, owner: 'Sales', due: 'Tomorrow', priority: 'High' },
        { title: 'Qualify new inbound', detail: `Triage the ${byName('New').count} New deals and disqualify the poor fits.`, owner: 'Sales', due: 'This week', priority: 'Medium' },
      ],
    },
  }
}

function monthEndPlan(rows: ReceivableCollection[] = receivablesCollections) {
  const overdueTotal = rows.reduce((a, r) => a + r.amount, 0)
  return {
    taskTitle: 'Month-end close checklist',
    intro: 'Built the month-end close checklist — everything outstanding across finance before the books can close.',
    metric: '6 items to clear before close',
    sources: [
      { name: 'Jurnal — receivables', detail: `${rows.length} overdue invoices (${money(overdueTotal)})` },
      { name: 'Jurnal — payables', detail: 'Unpaid vendor bills' },
      { name: 'Bank accounts', detail: 'Unreconciled statement lines' },
    ],
    steps: [
      { title: 'Scan open items', detail: 'Checked receivables, payables and bank reconciliation.' },
      { title: 'List blockers', detail: 'Found the items that must clear before close.' },
      { title: 'Assign owners', detail: 'Set an owner and due date for each.' },
      { title: 'Compile report', detail: 'Produced the close checklist and a summary.' },
    ],
    artifacts: {
      briefing: {
        summary: [
          { title: `Clear ${rows.length} overdue invoices (${money(overdueTotal)})`, detail: 'Chase or provision the overdue receivables before close.', priority: 'High' },
          { title: 'Reconcile bank accounts', detail: 'Unmatched statement lines remain on 2 cash accounts.', priority: 'High' },
          { title: 'Post unpaid vendor bills', detail: 'Ensure all vendor bills are recorded in the period.', priority: 'Medium' },
          { title: 'Review accruals & prepayments', detail: 'Confirm month-end journals are posted.', priority: 'Medium' },
          { title: 'Depreciation run', detail: 'Run fixed-asset depreciation for the month.', priority: 'Low' },
          { title: 'Lock the period', detail: 'Close and lock once the above are done.', priority: 'Low' },
        ],
        findings: (() => {
          const byCust: Record<string, number> = {}
          for (const r of rows) byCust[r.customer] = (byCust[r.customer] ?? 0) + r.amount
          const [topCust, topAmt] = Object.entries(byCust).sort((a, b) => b[1] - a[1])[0]!
          return [{ title: 'Biggest blocker', detail: `${money(overdueTotal)} in overdue receivables — ${topCust} (${money(topAmt)}) is the largest single account.` }]
        })(),
      },
      actionItems: [
        { title: 'Resolve receivables', detail: `Chase or provision the ${rows.length} overdue invoices.`, owner: 'Finance — Andi Pratama', due: 'Before close', priority: 'High' },
        { title: 'Finish bank rec', detail: 'Match remaining statement lines on both cash accounts.', owner: 'Finance — Maya Kusuma', due: 'Before close', priority: 'High' },
      ],
      pdf: {
        title: 'Month-end close checklist',
        sections: [
          { heading: 'Overview', body: `6 items outstanding before the books can close. ${money(overdueTotal)} in overdue receivables is the main blocker.` },
          { heading: 'Receivables', body: `${rows.length} invoices overdue totalling ${money(overdueTotal)}.` },
          { heading: 'Bank & payables', body: 'Unmatched statement lines on 2 cash accounts; verify all vendor bills are posted in the period.' },
        ],
      },
    },
  }
}

// Contracts expiring soon — reads the real contracts table (data/contracts.ts),
// counterparties are the vendor master. Was previously a metric literal with no
// builder at all.
function contractsPlan(days = 60, rows: Contract[] = expiringContracts(days)) {
  const daysLeft = (iso: string) => Math.max(0, Math.round((new Date(iso + 'T00:00:00').getTime() - new Date('2026-08-22T00:00:00').getTime()) / 86_400_000))
  const totalValue = rows.reduce((a, c) => a + c.annualValue, 0)
  const prio = (c: Contract): 'High' | 'Medium' | 'Low' => daysLeft(c.endDate) <= 14 ? 'High' : (daysLeft(c.endDate) <= 30 ? 'Medium' : 'Low')
  return {
    taskTitle: 'Contracts expiring soon',
    intro: `Scanned every active contract and pulled the ones ending within the next ${days} days, with a renew / renegotiate / offboard call for each.`,
    metric: `${rows.length} contracts expiring in ${days} days`,
    sources: [
      { name: 'Contracts register', detail: `${rows.length} contracts ending within ${days} days (${money(totalValue)}/yr)` },
      { name: 'Vendor master', detail: 'Counterparty details and payables' },
    ],
    steps: [
      { title: 'Load contracts', detail: 'Read the contracts register across vendors, software, lease, utilities and insurance.' },
      { title: 'Filter by end date', detail: `Kept the ${rows.length} contracts ending within ${days} days.` },
      { title: 'Assess each', detail: 'Checked auto-renew, value and the captured note.' },
      { title: 'Recommend action', detail: 'Set renew / renegotiate / offboard with an owner and due date.' },
    ],
    artifacts: {
      briefing: {
        summary: rows.map((c) => ({
          title: `${c.title} — ${c.party} (${daysLeft(c.endDate)} days)`,
          detail: `${c.type} · ${money(c.annualValue)}/yr · ends ${c.endDate}. ${c.autoRenew ? 'Auto-renews — review before the cancel window. ' : 'No auto-renew — action needed to continue. '}${c.note}`,
          priority: prio(c),
        })),
        findings: (() => {
          const f: { title: string; detail: string }[] = []
          const soonest = rows[0]
          if (soonest) f.push({ title: 'Expiring first', detail: `${soonest.title} (${soonest.party}) ends in ${daysLeft(soonest.endDate)} days — decide this week.` })
          const autos = rows.filter((c) => c.autoRenew)
          if (autos.length) f.push({ title: 'Auto-renewing', detail: `${autos.length} contract${autos.length > 1 ? 's' : ''} will auto-renew unless cancelled in time — confirm you still want ${autos.map((c) => c.party).join(', ')}.` })
          return f.length ? f : [{ title: 'Nothing urgent', detail: `No contracts expire within ${days} days.` }]
        })(),
      },
      actionItems: rows.map((c) => ({
        title: `${c.autoRenew ? 'Review before auto-renewal' : 'Renew / renegotiate'}: ${c.title}`,
        detail: `${c.party} — ${money(c.annualValue)}/yr, ends ${c.endDate}. ${c.note}`,
        owner: c.owner, due: daysLeft(c.endDate) <= 14 ? 'This week' : 'This month', priority: prio(c),
      })),
      spreadsheet: {
        title: 'Contracts expiring soon',
        columns: ['Contract', 'Party', 'Type', 'Ends', 'Days left', 'Annual value', 'Auto-renew'],
        rows: rows.map((c) => [c.title, c.party, c.type, c.endDate, String(daysLeft(c.endDate)), money(c.annualValue), c.autoRenew ? 'Yes' : 'No']),
      },
    },
  }
}

// ── Historical "as-of" data so each past run genuinely differs ────────────────
// Receivables that were overdue in earlier weeks but have since been resolved /
// weren't overdue yet — used to compose each weekly run's row set.
const RC_HIST: Record<string, ReceivableCollection> = {
  sukses: { invoiceId: 'SI010', invoiceNumber: 'INV-40010', customerId: 'C002', customer: 'CV Sukses Makmur',
    amount: 7_650_000, dueDate: '2026-05-12', daysOverdue: 21, reason: 'Awaiting PO-to-invoice match on their side.', riskLevel: 'Low',
    lastContact: { date: '2026-08-08', channel: 'Email', outcome: 'Confirmed match; paid shortly after.' }, promiseToPay: '2026-08-12',
    history: 'Reliable payer — this cleared on 12 Aug.', owner: 'Dewi Lestari (Finance)' },
  maju: { invoiceId: 'SI004', invoiceNumber: 'INV-40004', customerId: 'C001', customer: 'PT Maju Bersama Indonesia',
    amount: 15_200_000, dueDate: '2026-05-05', daysOverdue: 34, reason: 'Approval delay in their finance team over a new vendor form.', riskLevel: 'Medium',
    lastContact: { date: '2026-08-02', channel: 'Phone', outcome: 'Vendor form completed; payment scheduled.' }, promiseToPay: '2026-08-09',
    history: 'Occasional late payer — usually settles within 2 weeks of a reminder.', owner: 'Andi Pratama (Finance)' },
  bintang: { invoiceId: 'SI007', invoiceNumber: 'INV-40007', customerId: 'C020', customer: 'PT Bintang Timur Abadi',
    amount: 34_500_000, dueDate: '2026-05-09', daysOverdue: 40, reason: 'Partial payment made; remainder held pending a pricing query.', riskLevel: 'Medium',
    lastContact: { date: '2026-07-30', channel: 'Meeting', outcome: 'Pricing clarified; balance released.' }, promiseToPay: '2026-08-06',
    history: 'Large B2B account — pays in tranches, needs occasional nudging.', owner: 'Andi Pratama (Finance)' },
}
const RC = receivablesCollections
const RC_04 = [RC[0]!, RC[1]!, RC[3]!, RC[4]!]                                  // 4 (SI012 not overdue yet)
const RC_28 = [...RC_04, RC_HIST.sukses!, RC_HIST.maju!, RC_HIST.bintang!]      // 7
const RC_11 = [...RC, RC_HIST.sukses!]                                          // 6

const RECEIVABLES_PLAN = receivablesPlan()
const ATTENDANCE_PLAN = attendancePlan()
const REORDER_PLAN = reorderPlan()
const PIPELINE_PLAN = pipelinePlan()
const MONTHEND_PLAN = monthEndPlan()
const CONTRACTS_PLAN = contractsPlan()

// Per-run plans (most recent first) for each scheduled task — distinct content.
const RECEIVABLES_RUNS = [
  { ranAt: '2026-08-18T08:00:00', plan: RECEIVABLES_PLAN },
  { ranAt: '2026-08-11T08:00:00', plan: receivablesPlan(RC_11, -7) },
  { ranAt: '2026-08-04T08:00:00', plan: receivablesPlan(RC_04, -14) },
  { ranAt: '2026-07-28T08:00:00', plan: receivablesPlan(RC_28, -21) },
]
// Attendance — daily; each past day's exceptions come from the deterministic
// generator keyed to that date (real employees), so each run genuinely differs.
const ATTENDANCE_RUNS = [
  { ranAt: '2026-08-19T07:00:00', plan: ATTENDANCE_PLAN },
  { ranAt: '2026-08-18T07:00:00', plan: attendancePlan(attendanceExceptionsForDate('2026-08-18')) },
  { ranAt: '2026-08-15T07:00:00', plan: attendancePlan(attendanceExceptionsForDate('2026-08-15')) },
  { ranAt: '2026-08-14T07:00:00', plan: attendancePlan(attendanceExceptionsForDate('2026-08-14')) },
  { ranAt: '2026-08-13T07:00:00', plan: attendancePlan(attendanceExceptionsForDate('2026-08-13')) },
]
// Reorder — daily; past runs slice the real low-stock list so each day differs
// without inventing quantities (restocks land / new SKUs dip below the line).
const LOW_NOW = computeLowStock()
const REORDER_RUNS = [
  { ranAt: '2026-08-19T07:30:00', plan: REORDER_PLAN },
  { ranAt: '2026-08-18T07:30:00', plan: reorderPlan(LOW_NOW.slice(1)) },
  { ranAt: '2026-08-17T07:30:00', plan: reorderPlan(LOW_NOW.slice(0, Math.max(1, LOW_NOW.length - 1))) },
]
// Pipeline — weekly snapshots (deals move between stages week to week).
const PIPE_11: PStage[] = [
  { name: 'New', count: 6, value: 150_000_000 }, { name: 'Qualified', count: 6, value: 158_000_000 },
  { name: 'Proposal sent', count: 3, value: 82_000_000 }, { name: 'Negotiation', count: 2, value: 54_000_000 },
  { name: 'Won', count: 4, value: 168_000_000 }, { name: 'Lost', count: 3, value: 44_000_000 },
]
const PIPE_04: PStage[] = [
  { name: 'New', count: 9, value: 205_000_000 }, { name: 'Qualified', count: 4, value: 121_000_000 },
  { name: 'Proposal sent', count: 5, value: 112_000_000 }, { name: 'Negotiation', count: 2, value: 61_000_000 },
  { name: 'Won', count: 5, value: 190_000_000 }, { name: 'Lost', count: 1, value: 18_000_000 },
]
const PIPELINE_RUNS = [
  { ranAt: '2026-08-18T08:00:00', plan: PIPELINE_PLAN },
  { ranAt: '2026-08-11T08:00:00', plan: pipelinePlan(PIPE_11) },
  { ranAt: '2026-08-04T08:00:00', plan: pipelinePlan(PIPE_04) },
]
// Month-end — monthly; this month + last month (last month used more overdue rows).
const MONTHEND_RUNS = [
  { ranAt: '2026-08-18T09:00:00', plan: MONTHEND_PLAN },
  { ranAt: '2026-07-18T09:00:00', plan: monthEndPlan(RC_28) },   // last month: more open items
]
// Contracts — weekly; a wider 90-day horizon last week (more contracts in view).
const CONTRACTS_RUNS = [
  { ranAt: '2026-08-17T14:41:00', plan: CONTRACTS_PLAN },
  { ranAt: '2026-08-10T14:41:00', plan: contractsPlan(90) },
]

// ── Seeds ────────────────────────────────────────────────────────────────────
const TASKS_SEED: CoworkTask[] = [
  { id: 'CW-1042', title: 'Month-end close checklist', module: 'Finance', modules: ['Finance', 'Sales', 'WMS'], status: 'completed',
    prompt: COWORK_CATALOG.find((c) => c.title === 'Month-end close checklist')!.prompt,
    createdAt: '2026-07-18T09:00:00', completedAt: '2026-08-18T09:00:00', metric: MONTHEND_PLAN.metric,
    outputs: ['Briefing summary', 'Action items', 'PDF report'], sources: ['Finance', 'Sales', 'WMS'],
    planJson: JSON.stringify(MONTHEND_PLAN), runs: scheduledRuns('CW-1042', MONTHEND_RUNS),
    schedule: { cadence: 'Monthly', time: '09:00', nextRun: '1 Sep · 09:00', enabled: true } },
  { id: 'CW-1041', title: 'Contracts expiring soon', module: 'HR', modules: ['HR'], status: 'completed',
    prompt: COWORK_CATALOG.find((c) => c.title === 'Contracts expiring soon')!.prompt,
    createdAt: '2026-08-10T14:40:00', completedAt: '2026-08-17T14:41:05', metric: CONTRACTS_PLAN.metric,
    outputs: ['Briefing summary', 'Action items', 'Spreadsheet'], sources: ['Contracts', 'Vendors'],
    planJson: JSON.stringify(CONTRACTS_PLAN), runs: scheduledRuns('CW-1041', CONTRACTS_RUNS),
    schedule: { cadence: 'Weekly', time: '14:40', nextRun: 'Mon, 24 Aug · 14:40', enabled: true } },
  { id: 'CW-1040', title: 'Sales pipeline review', module: 'CRM', modules: ['CRM', 'Sales'], status: 'completed',
    prompt: COWORK_CATALOG.find((c) => c.title === 'Sales pipeline review')!.prompt,
    createdAt: '2026-08-04T08:00:00', completedAt: '2026-08-18T08:00:00', metric: PIPELINE_PLAN.metric,
    outputs: ['Briefing summary', 'Action items'], sources: ['CRM', 'Sales'],
    planJson: JSON.stringify(PIPELINE_PLAN), runs: scheduledRuns('CW-1040', PIPELINE_RUNS),
    schedule: { cadence: 'Weekly', time: '08:00', nextRun: 'Mon, 25 Aug · 08:00', enabled: true } },
  { id: 'CW-1039', title: 'Chase overdue receivables', module: 'Finance', modules: ['Finance', 'CRM'], status: 'completed',
    prompt: COWORK_CATALOG.find((c) => c.title === 'Chase overdue receivables')!.prompt,
    createdAt: '2026-07-28T08:00:00', completedAt: '2026-08-18T08:00:00', metric: RECEIVABLES_PLAN.metric,
    outputs: ['Briefing summary', 'Action items', 'Email draft', 'Spreadsheet'], sources: ['Finance', 'CRM'],
    planJson: JSON.stringify(RECEIVABLES_PLAN), runs: scheduledRuns('CW-1039', RECEIVABLES_RUNS),
    schedule: { cadence: 'Weekly', time: '08:00', nextRun: 'Mon, 25 Aug · 08:00', enabled: true } },
  { id: 'CW-1038', title: 'Reorder low-stock SKUs', module: 'WMS', modules: ['WMS'], status: 'completed',
    prompt: COWORK_CATALOG.find((c) => c.title === 'Reorder low-stock SKUs')!.prompt,
    createdAt: '2026-08-17T07:30:00', completedAt: '2026-08-19T07:30:00', metric: REORDER_PLAN.metric,
    outputs: ['Briefing summary', 'Action items', 'Spreadsheet'], sources: ['WMS'],
    planJson: JSON.stringify(REORDER_PLAN), runs: scheduledRuns('CW-1038', REORDER_RUNS),
    schedule: { cadence: 'Daily', time: '07:30', nextRun: 'Tomorrow · 07:30', enabled: true } },
  { id: 'CW-1037', title: 'Attendance exceptions review', module: 'HR', modules: ['HR'], status: 'completed',
    prompt: COWORK_CATALOG.find((c) => c.title === 'Attendance exceptions review')!.prompt,
    createdAt: '2026-08-13T07:00:00', completedAt: '2026-08-19T07:00:00', metric: ATTENDANCE_PLAN.metric,
    outputs: ['Briefing summary', 'Action items'], sources: ['HR'],
    planJson: JSON.stringify(ATTENDANCE_PLAN), runs: scheduledRuns('CW-1037', ATTENDANCE_RUNS),
    schedule: { cadence: 'Daily', time: '07:00', nextRun: 'Tomorrow · 07:00', enabled: true } },
]

// The connections marketplace. Google entries (Gmail, Calendar, Contacts, Drive)
// are REAL OAuth connections; the rest are demo-only. An app can belong to several
// categories (e.g. Notion is Featured + Productivity) — one record, rendered in
// each of its categories, sharing a single connected state.
const CONNECTION_SEED: CoworkConnection[] = [
  // ── Mekari products (native, connected by default) ──
  { id: 'mekari-talenta', name: 'Mekari Talenta', categories: ['Featured', 'Business & operations'], connected: true, provider: 'fake', detail: 'HR, payroll & attendance', color: '#0A6E4E' },
  { id: 'mekari-jurnal', name: 'Mekari Jurnal', categories: ['Featured', 'Finance'], connected: true, provider: 'fake', detail: 'Accounting & invoicing', color: '#0A6E4E' },
  { id: 'mekari-qontak', name: 'Mekari Qontak', categories: ['Featured', 'Business & operations'], connected: true, provider: 'fake', detail: 'CRM & omnichannel', color: '#0A6E4E' },
  // ── Google (real OAuth) ──
  { id: 'gmail', name: 'Gmail', categories: ['Featured', 'Communication'], connected: false, provider: 'google',
    detail: 'Read inbox to draft follow-ups', scope: 'https://www.googleapis.com/auth/gmail.readonly', color: '#EA4335' },
  { id: 'gdrive', name: 'Google Drive', categories: ['Featured', 'Productivity'], connected: false, provider: 'google',
    detail: 'Files, docs & sheets', scope: 'https://www.googleapis.com/auth/drive.readonly', color: '#1FA463' },
  { id: 'gcal', name: 'Google Calendar', categories: ['Featured', 'Productivity'], connected: false, provider: 'google',
    detail: 'Meetings, deadlines & reminders', scope: 'https://www.googleapis.com/auth/calendar.readonly', color: '#4285F4' },
  { id: 'gcontacts', name: 'Google Contacts', categories: ['Productivity'], connected: false, provider: 'google',
    detail: 'Match customers & stakeholders', scope: 'https://www.googleapis.com/auth/contacts.readonly', color: '#4285F4' },
  // ── Featured / Communication ──
  { id: 'notion', name: 'Notion', categories: ['Featured', 'Productivity'], connected: false, provider: 'fake', detail: 'Docs, notes & databases', color: '#111111' },
  { id: 'slack', name: 'Slack', categories: ['Featured', 'Communication'], connected: false, provider: 'fake', detail: 'Channels & DMs', color: '#611F69' },
  // ── Productivity ──
  { id: 'rovo', name: 'Atlassian Rovo', categories: ['Productivity'], connected: false, provider: 'fake', detail: 'AI across Jira & Confluence', color: '#1868DB' },
  { id: 'outlook-cal', name: 'Outlook Calendar', categories: ['Productivity', 'Communication'], connected: false, provider: 'fake', detail: 'Meetings & availability', color: '#0A64BC' },
  { id: 'fireflies', name: 'Fireflies', categories: ['Productivity'], connected: false, provider: 'fake', detail: 'Meeting notes & transcripts', color: '#1F6FEB' },
  { id: 'airtable', name: 'Airtable', categories: ['Productivity', 'Data & analytics'], connected: false, provider: 'fake', detail: 'Databases & spreadsheets', color: '#FCB400' },
  { id: 'asana', name: 'Asana', categories: ['Productivity'], connected: false, provider: 'fake', detail: 'Projects & tasks', color: '#F06A6A' },
  { id: 'clickup', name: 'ClickUp', categories: ['Productivity'], connected: false, provider: 'fake', detail: 'Tasks, docs & goals', color: '#7B68EE' },
  { id: 'monday', name: 'Monday.com', categories: ['Productivity'], connected: false, provider: 'fake', detail: 'Work management', color: '#FF3D57' },
  { id: 'otter', name: 'Otter.ai', categories: ['Productivity'], connected: false, provider: 'fake', detail: 'Voice notes & transcripts', color: '#00A0DC' },
  { id: 'mekari-sheets', name: 'Mekari Sheets', categories: ['Productivity', 'Data & analytics'], connected: false, provider: 'fake', detail: 'Spreadsheets & reports', color: '#0A6E4E' },
  { id: 'mekari-docs', name: 'Mekari Docs', categories: ['Productivity'], connected: false, provider: 'fake', detail: 'Documents & e-signing', color: '#0A6E4E' },
  // ── Business & operations ──
  { id: 'salesforce', name: 'Salesforce', categories: ['Business & operations'], connected: false, provider: 'fake', detail: 'CRM & sales cloud', color: '#00A1E0' },
  { id: 'hubspot', name: 'HubSpot', categories: ['Business & operations'], connected: false, provider: 'fake', detail: 'Marketing & sales pipeline', color: '#FF7A59' },
  { id: 'sap', name: 'SAP', categories: ['Business & operations'], connected: false, provider: 'fake', detail: 'ERP & supply chain', color: '#0FAAFF' },
  { id: 'shopify', name: 'Shopify', categories: ['Business & operations'], connected: false, provider: 'fake', detail: 'Orders & storefront', color: '#5E8E3E' },
  { id: 'zendesk', name: 'Zendesk', categories: ['Business & operations', 'Communication'], connected: false, provider: 'fake', detail: 'Support tickets', color: '#03363D' },
  { id: 'jira', name: 'Jira', categories: ['Business & operations'], connected: false, provider: 'fake', detail: 'Issues & sprints', color: '#1868DB' },
  { id: 'servicenow', name: 'ServiceNow', categories: ['Business & operations'], connected: false, provider: 'fake', detail: 'IT & service ops', color: '#62D84E' },
  // ── Data & analytics ──
  { id: 'ga4', name: 'Google Analytics', categories: ['Data & analytics'], connected: false, provider: 'fake', detail: 'Traffic & conversions', color: '#E8710A' },
  { id: 'looker', name: 'Looker Studio', categories: ['Data & analytics'], connected: false, provider: 'fake', detail: 'Dashboards & reports', color: '#4285F4' },
  { id: 'tableau', name: 'Tableau', categories: ['Data & analytics'], connected: false, provider: 'fake', detail: 'Visual analytics', color: '#1F457E' },
  { id: 'powerbi', name: 'Power BI', categories: ['Data & analytics'], connected: false, provider: 'fake', detail: 'Business intelligence', color: '#E97627' },
  { id: 'bigquery', name: 'BigQuery', categories: ['Data & analytics'], connected: false, provider: 'fake', detail: 'Data warehouse', color: '#669DF6' },
  { id: 'snowflake', name: 'Snowflake', categories: ['Data & analytics'], connected: false, provider: 'fake', detail: 'Cloud data platform', color: '#29B5E8' },
  { id: 'metabase', name: 'Metabase', categories: ['Data & analytics'], connected: false, provider: 'fake', detail: 'Self-serve analytics', color: '#509EE3' },
  // ── Communication ──
  { id: 'teams', name: 'Microsoft Teams', categories: ['Communication'], connected: false, provider: 'fake', detail: 'Chat & meetings', color: '#5059C9' },
  { id: 'zoom', name: 'Zoom', categories: ['Communication'], connected: false, provider: 'fake', detail: 'Video meetings', color: '#0B5CFF' },
  { id: 'whatsapp', name: 'WhatsApp Business', categories: ['Communication'], connected: false, provider: 'fake', detail: 'Customer messaging', color: '#25D366' },
  { id: 'telegram', name: 'Telegram', categories: ['Communication'], connected: false, provider: 'fake', detail: 'Channels & bots', color: '#2AABEE' },
  // ── Finance ──
  { id: 'xero', name: 'Xero', categories: ['Finance'], connected: false, provider: 'fake', detail: 'Ledgers & invoices', color: '#13B5EA' },
  { id: 'quickbooks', name: 'QuickBooks', categories: ['Finance'], connected: false, provider: 'fake', detail: 'Accounting & books', color: '#2CA01C' },
  { id: 'stripe', name: 'Stripe', categories: ['Finance'], connected: false, provider: 'fake', detail: 'Payments & payouts', color: '#635BFF' },
  { id: 'wise', name: 'Wise', categories: ['Finance'], connected: false, provider: 'fake', detail: 'Cross-border payments', color: '#9FE870' },
  { id: 'paypal', name: 'PayPal', categories: ['Finance'], connected: false, provider: 'fake', detail: 'Online payments', color: '#003087' },
  { id: 'brex', name: 'Brex', categories: ['Finance'], connected: false, provider: 'fake', detail: 'Cards & spend', color: '#111111' },
]

// ── Agents ────────────────────────────────────────────────────────────────────
// An agent is the "brain" behind a set of predefined tasks. It owns a module, a
// persona (fed to the model so it shapes the task result), the tasks it runs, and
// the connections it draws on. Names/descriptions are contextual to those tasks.
export interface CoworkAgent {
  id: string
  name: string            // contextual identity, e.g. "Collections & Close"
  role: string            // short role line, e.g. "Finance agent"
  module: CoworkModule
  description: string     // what it does (derived from its tasks)
  /** Persona / operating instruction — prepended to the run prompt so the agent
   *  actually shapes how the task result comes out. This is the "brain". */
  persona: string
  /** Catalog task titles this agent owns (see COWORK_CATALOG). */
  taskTitles: string[]
  /** Connection ids the agent typically uses (see CONNECTION_SEED). */
  connections?: string[]
  model: string
  avatar: string          // /agents/<id>.png (72×72)
  color: string           // fallback tile / accent colour
  /** true = under "My agents" (already yours); false = under "Browse agents". */
  owned: boolean
  // ── Create/edit form (Persona · Knowledge · Skills · Visibility) ──
  /** Custom behaviour instruction the user writes (the editable "brain"). Falls
   *  back to `persona` for the seeded agents. */
  instruction?: string
  /** Uploaded knowledge files (metadata only in the mock). @deprecated use `knowledge` */
  knowledgeFiles?: { name: string; size: string }[]
  /** Attached Knowledge Base scopes (collections / folders / docs) — live references,
   *  not copies. Resolved + relevance-ranked into grounding at run time. */
  knowledge?: KbAttachment[]
  /** Workspace areas the agent may draw knowledge from. */
  knowledgeAreas?: CoworkModule[]
  /** Pull from ALL workspace content (overrides knowledgeAreas). */
  allWorkspace?: boolean
  /** Enabled skill ids (see COWORK_SKILLS) — the actions this agent can take. */
  skills?: string[]
  /** Visibility: everyone in the company, or a specific set of employees. */
  visibilityEveryone?: boolean
  visibilityEmployees?: string[]   // employee ids
}

// ── Skills (master data) ──────────────────────────────────────────────────────
// A skill is a capability an agent can use; each bundles the concrete ACTIONS the
// agent may perform (which surface as the buttons on a task's action items). The
// agent's persona + enabled skills are what the Gemini brain uses to decide what
// to actually do.
export interface CoworkSkillAction { id: string; label: string }
export interface CoworkSkill {
  id: string
  name: string
  description: string
  module?: CoworkModule
  actions: CoworkSkillAction[]
  /** CDN icon name for the grid tile + accent colour. */
  icon?: string
  color?: string
  /** 'built-in' = shipped; 'custom' = user-created (AI-generated or uploaded .md). */
  source?: 'built-in' | 'custom'
  /** The skill definition as markdown (SKILL.md) — how a skill is authored & stored,
   *  exactly like Claude skills: a folder with SKILL.md + references/ + scripts/. */
  markdown?: string
  references?: { name: string; content?: string }[]
  scripts?: { name: string; content?: string }[]
  /** Attached Knowledge Base scopes — a skill can pull live reference docs from the KB. */
  knowledge?: KbAttachment[]
  createdAt?: string
}
const SKILL_SEED: CoworkSkill[] = [
  { id: 'purchase-request', name: 'Raise purchase requests', module: 'WMS', description: 'Create a purchase request for low-stock or shortages.', actions: [{ id: 'create-pr', label: 'Create purchase request' }], icon: 'box', color: '#0A6E4E', source: 'built-in' },
  { id: 'stock-count', name: 'Schedule stock counts', module: 'WMS', description: 'Create a cycle/stock count task for a location.', actions: [{ id: 'create-count', label: 'Create stock count' }], icon: 'box', color: '#0A6E4E', source: 'built-in' },
  { id: 'work-order', name: 'Create work orders', module: 'Production', description: 'Open a production work order for a BOM.', actions: [{ id: 'create-wo', label: 'Create work order' }], icon: 'settings', color: '#6941C6', source: 'built-in' },
  { id: 'payment-reminder', name: 'Chase payments', module: 'Finance', description: 'Draft and send payment reminders to overdue customers.', actions: [{ id: 'draft-reminder', label: 'Draft reminder' }, { id: 'send-reminder', label: 'Send reminder' }], icon: 'billing', color: '#B54708', source: 'built-in' },
  { id: 'send-invoice', name: 'Send sales invoices', module: 'Sales', description: 'Issue a sales invoice to a customer and email it out.', actions: [{ id: 'draft-invoice', label: 'Draft invoice' }, { id: 'send-invoice', label: 'Send invoice' }], icon: 'billing', color: '#165082', source: 'built-in' },
  { id: 'journal', name: 'Work in finance', module: 'Finance', description: 'Open invoices, bills and journals for review or posting.', actions: [{ id: 'open-finance', label: 'Open in finance' }], icon: 'billing', color: '#B54708', source: 'built-in' },
  { id: 'crm-followup', name: 'Draft CRM follow-ups', module: 'CRM', description: 'Write personalised follow-up messages and open deals in CRM.', actions: [{ id: 'draft-followup', label: 'Draft follow-up' }, { id: 'open-crm', label: 'Open in CRM' }], icon: 'stats', color: '#165082', source: 'built-in' },
  { id: 'hr-reprimand', name: 'Send HR notices', module: 'HR', description: 'Draft a reprimand or note to a chronically-late employee and their manager.', actions: [{ id: 'draft-reprimand', label: 'Draft reprimand' }, { id: 'send-reprimand', label: 'Send reprimand' }], icon: 'profile', color: '#B42318', source: 'built-in' },
  { id: 'contract-review', name: 'Review contracts', module: 'HR', description: 'Flag contracts for renewal, conversion or offboarding.', actions: [{ id: 'review-contract', label: 'Review contract' }], icon: 'profile', color: '#B54708', source: 'built-in' },
  // ── HR ──
  { id: 'payroll-precheck', name: 'Pre-check payroll', module: 'HR', description: 'Verify attendance, changes and approvals are complete before a payroll run.', actions: [{ id: 'build-precheck', label: 'Build pre-check report' }, { id: 'flag-issues', label: 'Flag blockers' }], source: 'built-in' },
  { id: 'resignation-handover', name: 'Plan resignation handovers', module: 'HR', description: 'Build a handover plan for a resigning employee — tasks, owners and knowledge transfer.', actions: [{ id: 'draft-handover', label: 'Draft handover plan' }], source: 'built-in' },
  { id: 'screen-candidates', name: 'Screen candidates', module: 'HR', description: 'Summarise CVs, match against the role, and shortlist the best candidates.', actions: [{ id: 'summarise-cv', label: 'Summarise CV' }, { id: 'shortlist', label: 'Shortlist' }], source: 'built-in' },
  // ── CRM / Sales / Marketing / Support ──
  { id: 'pipeline-review', name: 'Review sales pipeline', module: 'CRM', description: 'Rank open deals by value and momentum and surface the ones that have stalled.', actions: [{ id: 'rank-deals', label: 'Rank deals' }, { id: 'flag-stalled', label: 'Flag stalled deals' }], source: 'built-in' },
  { id: 'campaign-analysis', name: 'Analyse marketing campaigns', module: 'CRM', description: 'Read campaign and audience performance and recommend where to focus spend.', actions: [{ id: 'summarise-campaign', label: 'Summarise performance' }, { id: 'recommend-spend', label: 'Recommend spend' }], source: 'built-in' },
  { id: 'ticket-triage', name: 'Triage support tickets', module: 'CRM', description: 'Categorise incoming tickets, draft replies, and escalate anything risky to a human.', actions: [{ id: 'draft-reply', label: 'Draft reply' }, { id: 'escalate', label: 'Escalate' }], source: 'built-in' },
  // ── Sales / Fulfilment ──
  { id: 'fulfil-orders', name: 'Fulfil sales orders', module: 'Sales', description: 'Find orders ready to pick/pack/ship, cross-check stock, and flag blockers.', actions: [{ id: 'create-picking', label: 'Create picking task' }, { id: 'flag-blockers', label: 'Flag blockers' }], source: 'built-in' },
  // ── WMS ──
  { id: 'outbound-plan', name: 'Plan outbound fulfilment', module: 'WMS', description: "Prioritise today's picking, packing and shipping for open outbound orders.", actions: [{ id: 'prioritise-outbound', label: 'Prioritise picking' }], source: 'built-in' },
  // ── Production ──
  { id: 'work-orders-risk', name: 'Monitor at-risk work orders', module: 'Production', description: 'Flag work orders likely to miss their due date and recommend a recovery.', actions: [{ id: 'flag-risk', label: 'Flag at-risk' }, { id: 'recommend-recovery', label: 'Recommend recovery' }], source: 'built-in' },
  { id: 'bom-check', name: 'Check BOM vs stock', module: 'Production', description: 'Verify component availability for open work orders and flag shortages.', actions: [{ id: 'check-bom', label: 'Check availability' }], source: 'built-in' },
  // ── Finance ──
  { id: 'bank-recon', name: 'Reconcile bank statements', module: 'Finance', description: 'Match statement lines to ledger entries and surface unreconciled items.', actions: [{ id: 'match-lines', label: 'Match lines' }, { id: 'flag-unreconciled', label: 'Flag unreconciled' }], source: 'built-in' },
  { id: 'month-end-close', name: 'Run month-end close', module: 'Finance', description: 'Build the month-end checklist and flag everything outstanding before closing the books.', actions: [{ id: 'build-checklist', label: 'Build checklist' }, { id: 'flag-blockers', label: 'Flag blockers' }], source: 'built-in' },
  // ── IT ──
  { id: 'diagnose-issue', name: 'Diagnose technical issues', module: 'Production', description: 'Diagnose an error from its symptoms, propose a fix, and escalate when needed.', actions: [{ id: 'diagnose', label: 'Diagnose' }, { id: 'escalate', label: 'Escalate' }], source: 'built-in' },
  // ── Cross-cutting ──
  { id: 'create-task', name: 'Create follow-up tasks', description: 'Turn any recommendation into a tracked task with an owner.', actions: [{ id: 'create-task', label: 'Create task' }], source: 'built-in' },
  { id: 'send-email', name: 'Send email', description: 'Compose and send an email on your behalf.', actions: [{ id: 'send-email', label: 'Send email' }], source: 'built-in' },
]
export const COWORK_COMPANY = 'PT Central Perk Indonesia'
export const AGENT_SEED: CoworkAgent[] = [
  // ── My agents: the default assistant ──
  {
    id: 'airene', name: 'Mekari Airene', role: 'Default agent', module: 'Finance', owned: true,
    description: 'Your all-round co-worker across HR, sales, CRM, warehouse, finance and production.',
    persona: 'Mekari Airene, a versatile, reliable co-worker. Ground everything in the ERP data, prioritise what matters, and hand off to a specialist agent when a task is clearly in one domain.',
    taskTitles: ['Chase overdue receivables', 'Bank reconciliation review', 'Month-end close checklist'],
    connections: ['xero', 'stripe'], model: 'gemini-flash-latest', avatar: '/agents/airene.png', color: '#7C3AED',
  },
  // ── Browse agents (10) ──
  {
    id: 'sales', name: 'Sales agent', role: 'Sales', module: 'CRM', owned: false,
    description: 'Reviews the pipeline, prioritises deals, and drafts follow-ups for top prospects.',
    persona: 'a sharp sales strategist. Rank deals by value and momentum, flag stalled ones, and write concise, personalised outreach that moves each deal forward.',
    taskTitles: ['Sales pipeline review', 'Draft follow-ups for top prospects'],
    connections: ['hubspot', 'gmail'], model: 'gemini-flash-latest', avatar: '/agents/sales.png', color: '#6941C6',
  },
  {
    id: 'marketing', name: 'Marketing agent', role: 'Marketing', module: 'CRM', owned: false,
    description: 'Analyses campaigns and audience performance and suggests where to focus spend.',
    persona: 'a data-driven marketer. Read the numbers, surface what is working, and recommend the next campaign move in plain language.',
    taskTitles: [], connections: ['hubspot', 'ga4'], model: 'gemini-flash-latest', avatar: '/agents/marketing.png', color: '#DD2590',
  },
  {
    id: 'customer-support', name: 'Customer support agent', role: 'Support', module: 'CRM', owned: false,
    description: 'Triages customer tickets, drafts replies, and flags issues that need a human.',
    persona: 'an empathetic support specialist. Resolve quickly, keep a warm tone, and escalate anything risky or unhappy to a person.',
    taskTitles: [], connections: ['zendesk', 'gmail'], model: 'gemini-flash-latest', avatar: '/agents/customer-support.png', color: '#155EEF',
  },
  {
    id: 'warehouse', name: 'Warehouse agent', role: 'Warehouse', module: 'WMS', owned: false,
    description: 'Reorders low stock, plans outbound fulfilment, and schedules cycle counts.',
    persona: 'a proactive warehouse planner. Prevent stockouts, size reorders by lead time and open demand, and keep picking, packing and shipping on schedule.',
    taskTitles: ['Reorder low-stock SKUs', "Plan today's outbound fulfilment", 'Schedule cycle counts'],
    connections: ['sap'], model: 'gemini-flash-latest', avatar: '/agents/warehouse.png', color: '#0E7090',
  },
  {
    id: 'hr', name: 'HR agent', role: 'People', module: 'HR', owned: false,
    description: 'Reviews attendance, pre-checks payroll, and tracks contracts and handovers.',
    persona: 'a fair, discreet HR business partner. Separate recurring patterns from one-offs, weigh context, and only escalate what a manager truly needs to see.',
    taskTitles: ['Attendance exceptions review', 'Payroll run pre-check', 'Contracts expiring soon', 'Resignation handover plan'],
    connections: ['gcal', 'gmail'], model: 'gemini-flash-latest', avatar: '/agents/hr.png', color: '#B54708',
  },
  {
    id: 'recruitment', name: 'Recruitment agent', role: 'Talent', module: 'HR', owned: false,
    description: 'Screens candidates, summarises CVs, and keeps the hiring pipeline moving.',
    persona: 'a thorough recruiter. Match candidates to the role objectively, summarise strengths and gaps, and flag the best people to move forward.',
    taskTitles: [], connections: ['gmail'], model: 'gemini-flash-latest', avatar: '/agents/recruitment.png', color: '#7839EE',
  },
  {
    id: 'production', name: 'Production agent', role: 'Production', module: 'Production', owned: false,
    description: 'Flags at-risk work orders and checks BOM component availability.',
    persona: 'a production planner who spots bottlenecks early. Tie every at-risk work order to a specific material or capacity constraint and recommend a concrete recovery.',
    taskTitles: ['Work orders at risk', 'BOM vs stock check'],
    connections: ['sap'], model: 'gemini-flash-latest', avatar: '/agents/production.png', color: '#C11574',
  },
  {
    id: 'fulfillment', name: 'Fulfillment agent', role: 'Fulfilment', module: 'Sales', owned: false,
    description: 'Finds sales orders ready to fulfil and flags anything blocked on stock.',
    persona: 'an order-management specialist. Cross-check every order against warehouse stock, protect delivery dates, and surface blockers before they become late shipments.',
    taskTitles: ['Sales orders needing fulfilment'],
    connections: ['shopify'], model: 'gemini-flash-latest', avatar: '/agents/fulfillment.png', color: '#DC6803',
  },
  {
    id: 'technical-support', name: 'Technical support agent', role: 'IT', module: 'Production', owned: false,
    description: 'Handles technical issues, diagnoses errors, and guides fixes step by step.',
    persona: 'a calm technical engineer. Diagnose from the symptoms, explain the fix clearly, and know when to escalate to a specialist.',
    taskTitles: [], connections: ['servicenow'], model: 'gemini-flash-latest', avatar: '/agents/technical-support.png', color: '#3538CD',
  },
]

// Sensible create-form defaults for the seeded agents (so details/edit reflect them).
const AGENT_DEFAULT_SKILLS: Record<string, string[]> = {
  airene: ['payment-reminder', 'bank-recon', 'month-end-close', 'journal', 'pipeline-review', 'crm-followup', 'create-task', 'send-email'],
  sales: ['pipeline-review', 'crm-followup', 'send-invoice', 'create-task', 'send-email'],
  marketing: ['campaign-analysis', 'crm-followup', 'create-task', 'send-email'],
  'customer-support': ['ticket-triage', 'create-task', 'send-email'],
  warehouse: ['purchase-request', 'outbound-plan', 'stock-count', 'create-task'],
  hr: ['hr-reprimand', 'payroll-precheck', 'contract-review', 'resignation-handover', 'create-task', 'send-email'],
  recruitment: ['screen-candidates', 'create-task', 'send-email'],
  production: ['work-order', 'work-orders-risk', 'bom-check', 'create-task'],
  fulfillment: ['fulfil-orders', 'send-invoice', 'create-task', 'send-email'],
  'technical-support': ['diagnose-issue', 'create-task'],
  default: ['create-task', 'send-email'],
}
for (const a of AGENT_SEED) {
  a.instruction ??= a.persona
  a.skills ??= AGENT_DEFAULT_SKILLS[a.id] ?? ['create-task']
  a.visibilityEveryone ??= true
  a.visibilityEmployees ??= []
  a.knowledgeAreas ??= [a.module]
  a.allWorkspace ??= false
  a.knowledgeFiles ??= []
}

function load<T>(key: string, seed: T[]): T[] {
  return loadSnapshot<T>(key) ?? seed
}

export const coworkTasks = reactive<CoworkTask[]>(load('cowork-tasks-v2', TASKS_SEED))
export const coworkConnections = reactive<CoworkConnection[]>(load('cowork-connections-v3', CONNECTION_SEED))
export const coworkAgents = reactive<CoworkAgent[]>(load('cowork-agents-v3', AGENT_SEED))
// Skills are persisted so custom (AI-generated / uploaded .md) skills survive and
// can be used anywhere (agent skill pickers, task actions).
export const coworkSkills = reactive<CoworkSkill[]>(load('cowork-skills-v1', SKILL_SEED))
// Back-compat: existing agent code imports COWORK_SKILLS — same reactive array.
export const COWORK_SKILLS = coworkSkills

function persistTasks() { saveSnapshot('cowork-tasks-v2', coworkTasks) }
function persistConnections() { saveSnapshot('cowork-connections-v3', coworkConnections) }
function persistAgents() { saveSnapshot('cowork-agents-v3', coworkAgents) }
function persistSkills() { saveSnapshot('cowork-skills-v1', coworkSkills) }
let skillSeq = 1
export function getSkill(id: string): CoworkSkill | undefined { return coworkSkills.find((s) => s.id === id) }
export function addSkill(s: Omit<CoworkSkill, 'id'> & { id?: string }): CoworkSkill {
  const skill: CoworkSkill = { id: s.id ?? `skill-${Date.now().toString(36)}-${skillSeq++}`, ...s }
  coworkSkills.unshift(skill)
  persistSkills()
  return skill
}
export function updateSkill(id: string, patch: Partial<CoworkSkill>): void {
  const s = coworkSkills.find((x) => x.id === id)
  if (s) { Object.assign(s, patch); persistSkills() }
}
export function removeSkill(id: string): void {
  const i = coworkSkills.findIndex((x) => x.id === id)
  if (i >= 0) { coworkSkills.splice(i, 1); persistSkills() }
}
export function getAgent(id: string): CoworkAgent | undefined { return coworkAgents.find((a) => a.id === id) }
let agentSeq = 1
export function addAgent(a: Omit<CoworkAgent, 'id'> & { id?: string }): CoworkAgent {
  const agent: CoworkAgent = { id: a.id ?? `agent-${Date.now().toString(36)}-${agentSeq++}`, ...a }
  coworkAgents.unshift(agent)
  persistAgents()
  return agent
}
export function updateAgent(id: string, patch: Partial<CoworkAgent>): void {
  const a = coworkAgents.find((x) => x.id === id)
  if (a) { Object.assign(a, patch); persistAgents() }
}
export function deleteAgentSafe(id: string): void {
  const i = coworkAgents.findIndex((x) => x.id === id)
  if (i >= 0) { coworkAgents.splice(i, 1); persistAgents() }
}
/** The agent that owns a module (drives a task's result). */
export function agentForModule(m?: CoworkModule): CoworkAgent | undefined {
  return coworkAgents.find((a) => a.module === m)
}
/** The agent that owns a given catalog task title. */
export function agentForTaskTitle(title?: string): CoworkAgent | undefined {
  if (!title) return undefined
  return coworkAgents.find((a) => a.taskTitles.includes(title))
}

let taskSeq = 1043
export function nextTaskId(): string { return `CW-${taskSeq++}` }

export function addTask(t: Omit<CoworkTask, 'id'> & { id?: string }): CoworkTask {
  const task: CoworkTask = { id: t.id ?? nextTaskId(), ...t }
  coworkTasks.unshift(task)
  persistTasks()
  return task
}

/** True once a task has actually been run (has a run or a cached plan). A draft
 *  created by opening a task detail is false until "Run task" is clicked — which
 *  is what keeps drafts out of the Tasks table. */
export function taskHasRun(t: CoworkTask): boolean {
  // Drafts (opened but not run) are status 'scheduled'/'draft' with no runs; anything
  // that has a run, a cached plan, or a run-bearing status has been executed.
  return (t.runs?.length ?? 0) > 0 || !!t.planJson || (t.status !== 'scheduled' && t.status !== 'draft')
}
/** Get (or create) the DRAFT task for a predefined catalog item. The draft carries
 *  the hardcoded instruction/workflow/outputs so the detail never regenerates; it's
 *  persisted (stable id) but filtered out of the Tasks table until it's run. */
export function getOrCreateDraftTask(item: CoworkCatalogItem): CoworkTask {
  const id = 'draft-' + item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const existing = coworkTasks.find((t) => t.id === id)
  if (existing) return existing
  return addTask({
    id,
    title: item.title,
    prompt: item.prompt,
    module: item.module,
    modules: [item.module],
    status: 'scheduled',
    createdAt: new Date().toISOString(),
    outputs: item.outputs,
    sources: [item.module],
    model: 'gemini-flash-latest',
    instruction: item.instruction,
    workflow: item.workflow,
  })
}
export function updateTask(id: string, patch: Partial<CoworkTask>): void {
  const t = coworkTasks.find((x) => x.id === id)
  if (t) { Object.assign(t, patch); persistTasks() }
}
export function deleteTask(id: string): void {
  // A task's schedule lives on the task, so deleting the task removes its schedule
  // from the Schedule page automatically (that view is derived from coworkTasks).
  const i = coworkTasks.findIndex((x) => x.id === id)
  if (i >= 0) { coworkTasks.splice(i, 1); persistTasks() }
}
export function getTask(id: string): CoworkTask | undefined { return coworkTasks.find((x) => x.id === id) }

let runSeq = 1
export function nextRunId(): string { return `RUN-${Date.now().toString(36)}-${runSeq++}` }
/** Append a run to a task and mirror its status/metric onto the task. */
export function addRun(taskId: string, run: CoworkRun): void {
  const t = coworkTasks.find((x) => x.id === taskId)
  if (!t) return
  if (!t.runs) t.runs = []
  t.runs.unshift(run)
  t.status = run.status
  t.metric = run.metric
  t.planJson = run.planJson
  if (run.status === 'completed') t.completedAt = run.ranAt
  persistTasks()
}
export function deleteRun(taskId: string, runId: string): void {
  const t = coworkTasks.find((x) => x.id === taskId)
  if (!t?.runs) return
  const i = t.runs.findIndex((r) => r.id === runId)
  if (i >= 0) { t.runs.splice(i, 1); persistTasks() }
}
/** The run list to show — real runs, or one synthesised from a legacy task. */
export function taskRuns(t: CoworkTask): CoworkRun[] {
  if (t.runs?.length) return t.runs
  return [{ id: `${t.id}-r0`, ranAt: t.completedAt ?? t.createdAt, status: t.status, metric: t.metric, planJson: t.planJson }]
}

/** Toggle a scheduled task's recurrence on/off. */
export function setTaskScheduleEnabled(id: string, enabled: boolean): void {
  const t = coworkTasks.find((x) => x.id === id)
  if (t && t.schedule) { t.schedule = { ...t.schedule, enabled }; persistTasks() }
}
/** Remove a task's schedule (unschedule) without deleting the task. */
export function unscheduleTask(id: string): void {
  const t = coworkTasks.find((x) => x.id === id)
  if (t) { t.schedule = undefined; persistTasks() }
}

export function setConnection(id: string, connected: boolean): void {
  const c = coworkConnections.find((x) => x.id === id)
  if (c) { c.connected = connected; persistConnections() }
}

let connSeq = 1
/** Add a connection (e.g. a custom MCP server the user connected). */
export function addCoworkConnection(c: Omit<CoworkConnection, 'id'> & { id?: string }): CoworkConnection {
  const conn: CoworkConnection = { id: c.id ?? `custom-${connSeq++}`, ...c }
  coworkConnections.unshift(conn)
  persistConnections()
  return conn
}
/** Remove a connection entirely (custom MCP servers can be uninstalled). */
export function removeCoworkConnection(id: string): void {
  const i = coworkConnections.findIndex((x) => x.id === id)
  if (i >= 0) { coworkConnections.splice(i, 1); persistConnections() }
}
