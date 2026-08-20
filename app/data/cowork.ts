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
  /** Recurrence set when the task was created (shown in the Tasks "Schedule"
   *  column, and the Schedule page lists every task that has one); absent = a
   *  one-off run ("No schedule"). */
  schedule?: { cadence: CoworkCadence; time: string; nextRun?: string; enabled?: boolean }
  /** Chosen deliverables / sources / model — kept so "Run task" re-runs identically. */
  outputs?: string[]
  sources?: string[]
  model?: string
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

function receivablesPlan() {
  const rows = receivablesCollections
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
          detail: `${r.invoiceNumber}, ${r.daysOverdue} days overdue. ${r.reason}`,
          priority: r.riskLevel,
        })),
        findings: [
          { title: 'Largest exposure', detail: 'PT Teknologi Nusantara holds Rp52.9M across INV-40023 and INV-40006 — both blocked on one short-shipment dispute. Issue the credit note to unblock both.' },
          { title: 'Quick win', detail: 'PT Kreasindo Media Cipta (Rp11.2M) was only a wrong-email issue; the new PIC confirmed payment for 25 Aug.' },
          { title: 'Escalate', detail: 'CV Mitra Usaha Bersama (Rp9M) is unresponsive after 3 reminders — escalate to a call or hold further orders.' },
        ],
      },
      actionItems: high.map((r) => ({
        title: `Chase ${r.customer}`, detail: `${r.invoiceNumber} (${money(r.amount)}) — ${r.reason}`,
        owner: r.owner, due: r.promiseToPay ?? 'This week', priority: 'High',
      })),
      email: {
        to: top.customer, subject: `Payment reminder — ${top.invoiceNumber} (${money(top.amount)})`,
        body: `Dear ${top.customer} team,\n\nOur records show invoice ${top.invoiceNumber} for ${money(top.amount)}, due ${top.dueDate}, is now ${top.daysOverdue} days overdue.\n\nWe understand a credit note for the short-shipped items is pending — we are processing that now and will send it shortly. Once received, we would appreciate settlement by ${top.promiseToPay}.\n\nPlease let us know if anything else is blocking payment.\n\nBest regards,\nRizal Candra\nFinance, PT Central Perk Indonesia`,
      },
      spreadsheet: {
        title: 'Overdue receivables',
        columns: ['Invoice', 'Customer', 'Amount', 'Days overdue', 'Risk', 'Reason', 'Owner'],
        rows: rows.map((r) => [r.invoiceNumber, r.customer, money(r.amount), String(r.daysOverdue), r.riskLevel, r.reason, r.owner]),
      },
    },
  }
}

function attendancePlan() {
  const ex = attendanceExceptions
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
        findings: [
          { title: 'Needs escalation', detail: 'Indah Permatasari — 2nd unapproved absence in two weeks and still on probation (joined Jun 2026). Raise with her manager today.' },
          { title: 'Not a real issue', detail: 'Budi Santoso\'s missing check-out was a gate turnstile outage confirmed by facilities — exclude from lateness stats.' },
          { title: 'Recurring', detail: 'Agus Pratama has 3 Monday late clock-ins this month, all traffic-related — consider a flexible start.' },
        ],
      },
      actionItems: [
        { title: 'Escalate probation absence', detail: 'Discuss Indah Permatasari\'s repeated unapproved absences before her probation review.', owner: 'HR Business Partner', due: 'Today', priority: 'High' },
        { title: 'Enable check-out reminders', detail: 'Turn on auto-checkout/reminder to fix repeat missing check-outs (Fajar Nugroho).', owner: 'HR Ops', due: 'This week', priority: 'Medium' },
        { title: 'Log gate outage', detail: 'File the turnstile outage so affected staff are not penalised.', owner: 'Facilities', due: 'Today', priority: 'Low' },
      ],
    },
  }
}

/** Build N dated historical runs (most recent first) for a scheduled task. */
function scheduledRuns(taskId: string, plan: any, ranAtList: string[], metrics?: string[]): CoworkRun[] {
  return ranAtList.map((ranAt, i) => ({
    id: `${taskId}-r${ranAtList.length - i}`,
    ranAt, status: 'completed',
    metric: metrics?.[i] ?? plan.metric,
    planJson: JSON.stringify({ ...plan, metric: metrics?.[i] ?? plan.metric }),
  }))
}

const RECEIVABLES_PLAN = receivablesPlan()
const ATTENDANCE_PLAN = attendancePlan()

// ── Seeds ────────────────────────────────────────────────────────────────────
const TASKS_SEED: CoworkTask[] = [
  { id: 'CW-1042', title: 'Month-end close checklist', module: 'Finance', modules: ['Finance', 'Sales', 'WMS'], status: 'completed',
    prompt: COWORK_CATALOG.find((c) => c.title === 'Month-end close checklist')!.prompt,
    createdAt: '2026-08-18T09:12:00', completedAt: '2026-08-18T09:13:20', metric: '6 items to clear before close',
    schedule: { cadence: 'Monthly', time: '09:00', nextRun: '1 Sep · 09:00', enabled: true } },
  { id: 'CW-1041', title: 'Contracts expiring soon', module: 'HR', modules: ['HR'], status: 'completed',
    prompt: COWORK_CATALOG.find((c) => c.title === 'Contracts expiring soon')!.prompt,
    createdAt: '2026-08-17T14:40:00', completedAt: '2026-08-17T14:41:05', metric: '2 contracts expiring in 60 days' },
  { id: 'CW-1040', title: 'Sales pipeline review', module: 'CRM', modules: ['CRM', 'Sales'], status: 'completed',
    prompt: COWORK_CATALOG.find((c) => c.title === 'Sales pipeline review')!.prompt,
    createdAt: '2026-08-15T08:05:00', completedAt: '2026-08-15T08:06:12', metric: '4 deals to prioritise this week',
    schedule: { cadence: 'Weekly', time: '08:00', nextRun: 'Mon, 25 Aug · 08:00', enabled: true } },
  { id: 'CW-1039', title: 'Chase overdue receivables', module: 'Finance', modules: ['Finance', 'CRM'], status: 'completed',
    prompt: COWORK_CATALOG.find((c) => c.title === 'Chase overdue receivables')!.prompt,
    createdAt: '2026-07-28T08:00:00', completedAt: '2026-08-18T08:00:00', metric: RECEIVABLES_PLAN.metric,
    outputs: ['Briefing summary', 'Action items', 'Email draft', 'Spreadsheet'],
    sources: ['Finance', 'CRM'],
    planJson: JSON.stringify(RECEIVABLES_PLAN),
    runs: scheduledRuns('CW-1039', RECEIVABLES_PLAN,
      ['2026-08-18T08:00:00', '2026-08-11T08:00:00', '2026-08-04T08:00:00', '2026-07-28T08:00:00'],
      ['5 invoices overdue · Rp97M', '6 invoices overdue · Rp112M', '4 invoices overdue · Rp71M', '7 invoices overdue · Rp134M']),
    schedule: { cadence: 'Weekly', time: '08:00', nextRun: 'Mon, 25 Aug · 08:00', enabled: true } },
  { id: 'CW-1038', title: 'Reorder low-stock SKUs', module: 'WMS', modules: ['WMS'], status: 'completed',
    prompt: COWORK_CATALOG.find((c) => c.title === 'Reorder low-stock SKUs')!.prompt,
    createdAt: '2026-08-12T07:30:00', completedAt: '2026-08-19T07:30:00', metric: '14 SKUs below reorder point',
    schedule: { cadence: 'Daily', time: '07:30', nextRun: 'Tomorrow · 07:30', enabled: true } },
  { id: 'CW-1037', title: 'Attendance exceptions review', module: 'HR', modules: ['HR'], status: 'completed',
    prompt: COWORK_CATALOG.find((c) => c.title === 'Attendance exceptions review')!.prompt,
    createdAt: '2026-08-13T07:00:00', completedAt: '2026-08-19T07:00:00', metric: ATTENDANCE_PLAN.metric,
    outputs: ['Briefing summary', 'Action items'],
    sources: ['HR'],
    planJson: JSON.stringify(ATTENDANCE_PLAN),
    runs: scheduledRuns('CW-1037', ATTENDANCE_PLAN,
      ['2026-08-19T07:00:00', '2026-08-18T07:00:00', '2026-08-15T07:00:00', '2026-08-14T07:00:00', '2026-08-13T07:00:00'],
      ['6 exceptions today', '4 exceptions today', '3 exceptions today', '5 exceptions today', '2 exceptions today']),
    schedule: { cadence: 'Daily', time: '07:00', nextRun: 'Tomorrow · 07:00', enabled: true } },
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
export const coworkConnections = reactive<CoworkConnection[]>(load('cowork-connections-v1', CONNECTION_SEED))

function persistTasks() { saveSnapshot('cowork-tasks-v1', coworkTasks) }
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
