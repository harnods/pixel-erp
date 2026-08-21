/**
 * Cowork mini-DB — the AI co-worker's tasks, schedules and connections.
 * Persisted (localStorage snapshot) like the other mock tables so a demo keeps
 * its state across reloads and can be reset. Coherent with the rest of the ERP:
 * the task catalog spans every module (HR, CRM, WMS, Finance, Production, Sales).
 */
import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
// The "Sales pipeline review" briefing reuses the canonical CRM pipeline so the
// co-worker's numbers match the CRM module (data/crm.ts).
import { pipelineStages } from './crm'

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

// ── HR attendance exceptions (Talenta) — grounding data for the attendance /
//    payroll pre-check tasks. Employee IDs reference the Talenta employees table. ──
export type AttendanceExceptionType = 'Late clock-in' | 'Missing check-out' | 'Unapproved absence'
export interface AttendanceException {
  employeeId: string
  date: string
  type: AttendanceExceptionType
  /** Clock-in time (for late arrivals) vs the 09:00 shift start. */
  clockIn?: string
  /** Minutes late (late clock-ins only). */
  minutesLate?: number
  /** The stated / inferred reason for this exception. */
  reason: string
  /** Co-worker's read on the pattern — the "why" analysis the user asks for. */
  analysis: string
}
// Latest working day = 2026-08-19 (the daily attendance task runs each morning).
export const attendanceExceptions: AttendanceException[] = [
  { employeeId: 'EMP-0006', date: '2026-08-19', type: 'Late clock-in', clockIn: '09:47', minutesLate: 47,
    reason: 'Commute delay — reported heavy traffic on the toll road.',
    analysis: '3rd late clock-in this month, all on Mondays and all traffic-related. Pattern suggests a recurring Monday commute issue, not occasional — worth a flexible-start conversation.' },
  { employeeId: 'EMP-0016', date: '2026-08-19', type: 'Late clock-in', clockIn: '09:22', minutesLate: 22,
    reason: 'Dropped child at school; no prior notice filed.',
    analysis: 'First lateness in 60 days. Isolated, low concern — a one-off family obligation.' },
  { employeeId: 'EMP-0010', date: '2026-08-19', type: 'Missing check-out',
    reason: 'Forgot to clock out — last badge activity 18:30, likely left without tapping.',
    analysis: 'Recurring: 4th missing check-out this month. Not an attendance risk but will distort overtime calc — needs a reminder or auto-checkout rule.' },
  { employeeId: 'EMP-0011', date: '2026-08-19', type: 'Unapproved absence',
    reason: 'No clock-in and no leave request filed; unreachable at 10:00 check.',
    analysis: '2nd unapproved absence in two weeks — and still on probation (joined Jun 2026). Escalating pattern; raise with their manager today before it affects the probation review.' },
  { employeeId: 'EMP-0009', date: '2026-08-19', type: 'Late clock-in', clockIn: '09:15', minutesLate: 15,
    reason: 'Stayed late on the month-end close the night before and started later by agreement.',
    analysis: 'Finance is mid-close; the lateness offsets overtime worked the previous evening. Not a concern — expected during close week.' },
  { employeeId: 'EMP-0003', date: '2026-08-19', type: 'Missing check-out',
    reason: 'System glitch at the Jakarta gate turnstile reported by facilities.',
    analysis: 'Facilities confirmed a reader outage 18:00–19:00; affects several staff, not an individual issue. Exclude from lateness stats.' },
]

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
export const receivablesCollections: ReceivableCollection[] = [
  { invoiceId: 'SI023', invoiceNumber: 'INV-40023', customerId: 'C003', customer: 'PT Teknologi Nusantara',
    amount: 44_000_000, dueDate: '2026-05-05', daysOverdue: 107, reason: 'Disputed delivery — customer claims 2 line items on the DO were short-shipped and is withholding payment until a credit note is issued.',
    riskLevel: 'High', lastContact: { date: '2026-08-14', channel: 'Phone', outcome: 'AP manager Ibu Sari agreed to release payment once the credit note for the short-shipment is received.' },
    promiseToPay: '2026-08-29', history: 'Repeat late payer — pays on average 24 days late; also holds INV-40006 (Rp8.9M). Lifetime spend Rp96M across 6 invoices, 2 currently overdue.', owner: 'Andi Pratama (Finance)' },
  { invoiceId: 'SI003', invoiceNumber: 'INV-40003', customerId: 'C005', customer: 'PT Cahaya Abadi Sentosa',
    amount: 23_750_000, dueDate: '2026-05-05', daysOverdue: 107, reason: 'Cash-flow constraint — customer is waiting on a payment from their own client and requested a 30-day extension.',
    riskLevel: 'Medium', lastContact: { date: '2026-08-11', channel: 'WhatsApp', outcome: 'Requested to split into 2 instalments; awaiting our approval.' },
    promiseToPay: '2026-09-05', history: 'Generally reliable — settled INV-40019 (Rp78.5M) on time in May. First time overdue in 12 months.', owner: 'Andi Pratama (Finance)' },
  { invoiceId: 'SI012', invoiceNumber: 'INV-40012', customerId: 'C018', customer: 'PT Kreasindo Media Cipta',
    amount: 11_200_000, dueDate: '2026-05-05', daysOverdue: 107, reason: 'Invoice never reached AP — sent to the wrong email; PIC changed and the new finance contact only received it last week.',
    riskLevel: 'Low', lastContact: { date: '2026-08-18', channel: 'Email', outcome: 'New PIC Bp. Rangga confirmed receipt and scheduled payment in their next run.' },
    promiseToPay: '2026-08-25', history: 'New customer — this is their first invoice with us. No prior payment history yet.', owner: 'Dewi Lestari (Finance)' },
  { invoiceId: 'SI018', invoiceNumber: 'INV-40018', customerId: 'C019', customer: 'CV Mitra Usaha Bersama',
    amount: 9_000_000, dueDate: '2026-05-05', daysOverdue: 107, reason: 'Unresponsive — three reminders sent with no reply; phone number on file goes to voicemail.',
    riskLevel: 'High', lastContact: { date: '2026-08-05', channel: 'Email', outcome: 'No response to the 3rd reminder.' },
    history: 'Slow payer — averages 40+ days late; previous invoice also required 4 reminders before payment.', owner: 'Dewi Lestari (Finance)' },
  { invoiceId: 'SI006', invoiceNumber: 'INV-40006', customerId: 'C003', customer: 'PT Teknologi Nusantara',
    amount: 8_900_000, dueDate: '2026-05-05', daysOverdue: 107, reason: 'Rolled into the same dispute as INV-40023 — customer is holding all payments pending the credit note.',
    riskLevel: 'Medium', lastContact: { date: '2026-08-14', channel: 'Phone', outcome: 'Bundled with INV-40023; release expected together.' },
    promiseToPay: '2026-08-29', history: 'Same account as INV-40023 (Rp44M). Combined exposure Rp52.9M — the largest single-customer overdue balance.', owner: 'Andi Pratama (Finance)' },
]

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
const EMP_NAMES: Record<string, string> = {
  'EMP-0006': 'Agus Pratama', 'EMP-0016': 'Doni Kurniawan', 'EMP-0010': 'Fajar Nugroho',
  'EMP-0011': 'Indah Permatasari', 'EMP-0009': 'Maya Kusuma', 'EMP-0003': 'Budi Santoso',
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

function attendancePlan(ex: AttendanceException[] = attendanceExceptions) {
  const name = (id: string) => EMP_NAMES[id] ?? id
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

// Low-stock SKUs — real coffee catalog names with coherent on-hand vs reorder point.
const LOW_STOCK = [
  { sku: 'GB-ARB-GAYO-G1', name: 'Green Beans Arabica Gayo Grade 1', onHand: 6, reorder: 20, unit: 'Sack', lead: '10 days' },
  { sku: 'GB-ROB-LAMP', name: 'Green Beans Robusta Lampung', onHand: 9, reorder: 25, unit: 'Sack', lead: '7 days' },
  { sku: 'RB-HOUSE-MED', name: 'Roasted Beans House Blend Medium', onHand: 14, reorder: 40, unit: 'Bag', lead: '3 days' },
  { sku: 'RB-ESP-DARK', name: 'Roasted Beans Espresso Blend Dark', onHand: 0, reorder: 30, unit: 'Bag', lead: '3 days' },
  { sku: 'GB-ARB-TORAJA', name: 'Green Beans Arabica Toraja Sapan', onHand: 4, reorder: 15, unit: 'Sack', lead: '12 days' },
]
type LowStock = typeof LOW_STOCK
function reorderPlan(stock: LowStock = LOW_STOCK) {
  const LOW_STOCK = stock
  const out = LOW_STOCK.filter((s) => s.onHand === 0)
  return {
    taskTitle: 'Reorder low-stock SKUs',
    intro: 'Compared warehouse on-hand stock against reorder points and drafted a purchase plan for everything below the line.',
    metric: `${LOW_STOCK.length} SKUs below reorder point`,
    sources: [
      { name: 'Mekari WMS — stock', detail: `${LOW_STOCK.length} SKUs at/under reorder point` },
      { name: 'Sales orders', detail: 'Cross-checked open orders that need these SKUs' },
      { name: 'Vendor lead times', detail: 'Used to prioritise the reorder' },
    ],
    steps: [
      { title: 'Read stock levels', detail: 'Pulled on-hand quantities across active warehouses.' },
      { title: 'Compare reorder points', detail: `Found ${LOW_STOCK.length} SKUs below their reorder point (${out.length} out of stock).` },
      { title: 'Size the reorder', detail: 'Proposed quantities to bring each back above the line.' },
      { title: 'Draft the plan', detail: 'Produced a reorder list ranked by urgency.' },
    ],
    artifacts: {
      briefing: {
        summary: LOW_STOCK.map((s) => ({
          title: `${s.name} — ${s.onHand}/${s.reorder} ${s.unit}`,
          detail: `${s.onHand === 0 ? 'OUT OF STOCK. ' : ''}On-hand ${s.onHand} vs reorder point ${s.reorder}. Vendor lead time ${s.lead}. Suggest ordering ${Math.max(s.reorder * 2 - s.onHand, s.reorder)} ${s.unit.toLowerCase()}.`,
          priority: s.onHand === 0 ? 'High' : (s.onHand < s.reorder / 2 ? 'Medium' : 'Low'),
        })),
        findings: (() => {
          const f: { title: string; detail: string }[] = []
          const zero = LOW_STOCK.find((s) => s.onHand === 0)
          if (zero) f.push({ title: 'Out of stock', detail: `${zero.name} is at zero — this blocks cafe orders; expedite the ${zero.lead} reorder today.` })
          const longLead = [...LOW_STOCK].sort((a, b) => parseInt(b.lead) - parseInt(a.lead))[0]
          if (longLead) f.push({ title: 'Long lead time', detail: `${longLead.name} has a ${longLead.lead} lead time and only ${longLead.onHand} ${longLead.unit.toLowerCase()} left — order now to avoid a stockout.` })
          return f
        })(),
      },
      actionItems: LOW_STOCK.filter((s) => s.onHand < s.reorder / 2).map((s) => ({
        title: `Raise PR for ${s.name}`, detail: `Order ${Math.max(s.reorder * 2 - s.onHand, s.reorder)} ${s.unit.toLowerCase()} (lead ${s.lead}).`,
        owner: 'Warehouse — Budi Santoso', due: s.onHand === 0 ? 'Today' : 'This week', priority: s.onHand === 0 ? 'High' : 'Medium',
      })),
      spreadsheet: {
        title: 'Low-stock reorder plan',
        columns: ['SKU', 'Product', 'On-hand', 'Reorder point', 'Suggested order', 'Lead time'],
        rows: LOW_STOCK.map((s) => [s.sku, s.name, `${s.onHand} ${s.unit}`, `${s.reorder} ${s.unit}`, `${Math.max(s.reorder * 2 - s.onHand, s.reorder)} ${s.unit}`, s.lead]),
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

// Attendance exception sets per past day (the latest = attendanceExceptions).
const ATT = (employeeId: string, type: AttendanceExceptionType, extra: Partial<AttendanceException> & { reason: string; analysis: string }): AttendanceException =>
  ({ employeeId, date: extra.date ?? '', type, ...extra })
const ATT_18: AttendanceException[] = [
  ATT('EMP-0006', 'Late clock-in', { date: '2026-08-18', clockIn: '09:31', minutesLate: 31, reason: 'Traffic on the toll road.', analysis: 'Monday lateness again — fits the recurring commute pattern.' }),
  ATT('EMP-0009', 'Missing check-out', { date: '2026-08-18', reason: 'Stayed late on the month-end close and forgot to tap out.', analysis: 'Close-week overtime; adjust the timesheet manually.' }),
  ATT('EMP-0010', 'Late clock-in', { date: '2026-08-18', clockIn: '09:14', minutesLate: 14, reason: 'Client meeting ran over.', analysis: 'Work-related, minor.' }),
  ATT('EMP-0011', 'Unapproved absence', { date: '2026-08-18', reason: 'No clock-in, no leave filed.', analysis: 'First of the two probation absences this fortnight — watch closely.' }),
]
const ATT_15: AttendanceException[] = [
  ATT('EMP-0016', 'Late clock-in', { date: '2026-08-15', clockIn: '09:18', minutesLate: 18, reason: 'School run.', analysis: 'One-off, low concern.' }),
  ATT('EMP-0010', 'Missing check-out', { date: '2026-08-15', reason: 'Left from a client site without tapping.', analysis: 'Field visit — expected; log as remote.' }),
  ATT('EMP-0006', 'Late clock-in', { date: '2026-08-15', clockIn: '09:22', minutesLate: 22, reason: 'Traffic.', analysis: 'Consistent commute delay.' }),
]
const ATT_14: AttendanceException[] = [
  ATT('EMP-0006', 'Late clock-in', { date: '2026-08-14', clockIn: '09:12', minutesLate: 12, reason: 'Traffic.', analysis: 'Minor.' }),
  ATT('EMP-0016', 'Late clock-in', { date: '2026-08-14', clockIn: '09:27', minutesLate: 27, reason: 'Overslept after late deployment the night before.', analysis: 'IT ran a late release; acceptable.' }),
  ATT('EMP-0009', 'Late clock-in', { date: '2026-08-14', clockIn: '09:10', minutesLate: 10, reason: 'Early bank run before office.', analysis: 'Work-related.' }),
  ATT('EMP-0003', 'Missing check-out', { date: '2026-08-14', reason: 'Forgot to tap out after a late inbound receiving.', analysis: 'Recurring for warehouse late shifts — enable auto-checkout.' }),
  ATT('EMP-0011', 'Late clock-in', { date: '2026-08-14', clockIn: '09:35', minutesLate: 35, reason: 'Transport issue.', analysis: 'On probation — note but not yet escalate.' }),
]
const ATT_13: AttendanceException[] = [
  ATT('EMP-0006', 'Late clock-in', { date: '2026-08-13', clockIn: '09:20', minutesLate: 20, reason: 'Traffic.', analysis: 'Start of the recurring pattern.' }),
  ATT('EMP-0010', 'Late clock-in', { date: '2026-08-13', clockIn: '09:08', minutesLate: 8, reason: 'Client call.', analysis: 'Negligible.' }),
]

const RECEIVABLES_PLAN = receivablesPlan()
const ATTENDANCE_PLAN = attendancePlan()
const REORDER_PLAN = reorderPlan()
const PIPELINE_PLAN = pipelinePlan()
const MONTHEND_PLAN = monthEndPlan()

// Per-run plans (most recent first) for each scheduled task — distinct content.
const RECEIVABLES_RUNS = [
  { ranAt: '2026-08-18T08:00:00', plan: RECEIVABLES_PLAN },
  { ranAt: '2026-08-11T08:00:00', plan: receivablesPlan(RC_11, -7) },
  { ranAt: '2026-08-04T08:00:00', plan: receivablesPlan(RC_04, -14) },
  { ranAt: '2026-07-28T08:00:00', plan: receivablesPlan(RC_28, -21) },
]
const ATTENDANCE_RUNS = [
  { ranAt: '2026-08-19T07:00:00', plan: ATTENDANCE_PLAN },
  { ranAt: '2026-08-18T07:00:00', plan: attendancePlan(ATT_18) },
  { ranAt: '2026-08-15T07:00:00', plan: attendancePlan(ATT_15) },
  { ranAt: '2026-08-14T07:00:00', plan: attendancePlan(ATT_14) },
  { ranAt: '2026-08-13T07:00:00', plan: attendancePlan(ATT_13) },
]
// Reorder — daily; each day a different low-stock set (restocks land, new ones dip).
const LS_18 = [LOW_STOCK[3]!, LOW_STOCK[2]!, LOW_STOCK[4]!]   // Espresso Dark, House Blend, Toraja
const LS_17 = [LOW_STOCK[1]!, LOW_STOCK[2]!, LOW_STOCK[3]!, LOW_STOCK[4]!]
const REORDER_RUNS = [
  { ranAt: '2026-08-19T07:30:00', plan: REORDER_PLAN },
  { ranAt: '2026-08-18T07:30:00', plan: reorderPlan(LS_18) },
  { ranAt: '2026-08-17T07:30:00', plan: reorderPlan(LS_17) },
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
    createdAt: '2026-08-17T14:40:00', completedAt: '2026-08-17T14:41:05', metric: '2 contracts expiring in 60 days' },
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

function load<T>(key: string, seed: T[]): T[] {
  return loadSnapshot<T>(key) ?? seed
}

export const coworkTasks = reactive<CoworkTask[]>(load('cowork-tasks-v2', TASKS_SEED))
export const coworkConnections = reactive<CoworkConnection[]>(load('cowork-connections-v3', CONNECTION_SEED))

function persistTasks() { saveSnapshot('cowork-tasks-v2', coworkTasks) }
function persistConnections() { saveSnapshot('cowork-connections-v3', coworkConnections) }

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
