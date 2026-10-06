/**
 * Guided tour for the payroll screens (Payroll to Ledger, Jurnal x Talenta):
 * the PRD product narrative, auto-played.
 *
 * This is a demo layer for walkthroughs, not a product requirement; engineers
 * building the product should ignore it. The only coupling to product screens
 * is the data-tour="..." attributes they carry. It reuses the asset tour
 * runner, with its own reset and View as.
 *
 * Every step does its own work on Next (run), then opens the screen that
 * shows the result and points at it. The reader only presses Next.
 * tests/payroll-tour.spec.ts runs every step's work after resetPayroll() and
 * checks the figures quoted here.
 */
import {
  payroll, resetPayroll, setPayrollViewAs, runs, payItemKey, suggestMapping, setPayItemMapping,
  confirmPostAsFinanceManager, postRun, recordSalaryPayment, simulateSend, chooseRevision, postDifference,
  payStatutory, setEbupotTotal, markPph21Reconciled, pph21Monthly,
  bpjsPayroll, saveBpjsInvoice, markBpjsReviewed, markReadyForSignOff, signOffMonth,
  type BpjsBody, type BpjsProgramme,
} from '~/data/payrollStore'
import { ACC, type PayrollRole } from '~/data/payrollMaster'
import type { AssetTour, TourStep } from './assetTours'
import type { ViewAsRole } from '~/data/assetStore'

type PayrollStep = Omit<TourStep, 'role'> & { role?: PayrollRole }

/** The September run: Talenta company 1212, 21 Aug to 20 Sep 2026. */
export const SEP_KEY = '1212 / monthly / 2026-08-21 / 2026-09-20'
export const SEP_MONTH = '2026-09'
export const NEW_ITEM = 'Insentif Penjualan'
export const BILLING_CODE = '412011100202609'
export const NTPN = '0A1B2C3D4E5F0926'

/** What the steps hand to each other within one run. */
export const tourCtx = { runId: '' }

export function sepId(): string {
  if (!tourCtx.runId) tourCtx.runId = runs.value.find((r) => r.key === SEP_KEY)?.id ?? ''
  return tourCtx.runId
}
const runRoute = () => `/payroll-runs/${sepId()}`

/** Act as another role for one call, then return to the step's role. */
function as<T>(role: PayrollRole, fn: () => T): T {
  const prev = payroll.viewAs
  setPayrollViewAs(role)
  try { return fn() } finally { setPayrollViewAs(prev) }
}

// ── Finding what a step points at ───────────────────────────────────────────

function visible(el: Element | null | undefined): el is HTMLElement {
  return !!el && (el as HTMLElement).getClientRects().length > 0
}
function live(marker: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${marker}"]`)).filter(visible).pop() ?? null
}
/** The first visible table row inside `marker` that contains every text in `texts`. */
function rowIn(marker: string, ...texts: string[]): HTMLElement | null {
  const scope = Array.from(document.querySelectorAll(`[data-tour="${marker}"]`)).filter(visible).pop()
  if (!scope) return null
  return Array.from(scope.querySelectorAll<HTMLElement>('tr'))
    .find((r) => visible(r) && texts.every((t) => r.innerText.includes(t))) ?? null
}
/** The Sales Salaries line for Sales, Bandung in the journal preview, with Why this line open. */
function whySalesBandung(): HTMLElement | null {
  const row = rowIn('payroll-draft-lines', '6-60004 Sales Salaries', 'Sales, Bandung')
  if (!row) {
    // Back from a later step can leave another tab open on the run record.
    Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]')).find((b) => visible(b) && b.innerText.trim() === 'Draft review')?.click()
    return null
  }
  // The line itself comes first; the open explanation is the row after it.
  const link = Array.from(row.querySelectorAll<HTMLElement>('span')).find((s) => s.innerText.trim() === 'Why this line')
  if (link) { link.click(); return null }
  const why = row.nextElementSibling
  return visible(why) && why.innerText.includes(NEW_ITEM) ? why : null
}
/** One posted journal card with its lines open. */
function journalOpen(number: string): HTMLElement | null {
  const card = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="payroll-journal"][data-journal="${number}"]`)).filter(visible).pop()
  if (!card) return null
  if (!card.querySelector('table')) { card.querySelector<HTMLElement>('[data-tour="payroll-journal-head"]')?.click(); return null }
  return card
}

// ── The work each step does ─────────────────────────────────────────────────

function mapNewItem() {
  const s = suggestMapping(NEW_ITEM, 'allowance')!
  setPayItemMapping(payItemKey(NEW_ITEM, 'allowance'), { role: s.role, debit: s.debit, credit: s.credit, party: 'Staff' })
}
function financeConfirms() { confirmPostAsFinanceManager(sepId()) }
function post() { postRun(sepId()) }
function paySalary() { recordSalaryPayment(sepId(), { bank: ACC.bca, date: '2026-09-25' }) }
function resend() { simulateSend('revision', { runId: sepId() }) }
function reviseAndPostDifference() {
  chooseRevision(sepId(), 2)
  postDifference(sepId())
}
function taxStaffFiles() {
  payStatutory({ party: 'DJP PPh 21', bank: ACC.bca, date: '2026-10-05', periods: [{ month: SEP_MONTH, billingCode: BILLING_CODE, ntpn: NTPN }] })
  setEbupotTotal(SEP_MONTH, pph21Monthly(SEP_MONTH).rows[0]!.ledger)
  markPph21Reconciled(SEP_MONTH)
}
function closeMonth() {
  as('Accountant', () => {
    // v2 raised take-home pay after payday: the rest goes out from the bank.
    recordSalaryPayment(sepId(), { bank: ACC.bca, date: '2026-10-05' })
    for (const body of ['BPJS Kesehatan', 'BPJS Ketenagakerjaan'] as BpjsBody[]) {
      const lines = bpjsPayroll(SEP_MONTH, body).filter((x) => x.programme !== 'Unassigned')
        .map((x) => ({ programme: x.programme as BpjsProgramme, amount: x.amount, headcount: 40 }))
      saveBpjsInvoice(SEP_MONTH, body, lines)
      markBpjsReviewed(SEP_MONTH, body)
    }
    markReadyForSignOff(SEP_MONTH)
  })
  signOffMonth(SEP_MONTH, { hrConfirmed: true })
}
function oldSyncTries() { simulateSend('old-sync') }

// ── Steps ───────────────────────────────────────────────────────────────────

const steps: PayrollStep[] = [
  {
    route: '/payroll-inbox',
    target: 'payroll-inbox-runs',
    find: () => rowIn('payroll-inbox-runs', '21 Aug-20 Sep 2026'),
    role: 'Accountant',
    title: 'September arrives from Talenta and is held.',
    body: 'Talenta sends the facts; Jurnal decides the accounting. HR added a new allowance this month and no account is set for it. The run waits in the payroll inbox; a wrong journal never posts. July and August are already posted and signed off.',
    watch: '21 Aug-20 Sep 2026 is Held: 1 pay item has no account: Insentif Penjualan (allowance), Rp10.500.000, 7 employees. Nothing posts while it holds.',
    placement: 'bottom',
  },
  {
    run: mapNewItem,
    route: runRoute,
    target: 'payroll-run-stats',
    title: 'The Accountant maps Insentif Penjualan from the hold.',
    body: 'The fix sits on the hold itself. Jurnal suggests the role and accounts from the name: Earning, debit Salaries, credit Salaries Payable. Saving the mapping checks every held run again. The hold clears and the draft journal builds with no second step.',
    watch: 'Ready to post. Take-home pay Rp446.901.857 for 40 staff; draft journal Rp554.203.937 on 26 lines.',
    placement: 'bottom',
  },
  {
    route: runRoute,
    target: 'payroll-draft-lines',
    find: whySalesBandung,
    title: 'The draft is checked against Talenta before anyone posts.',
    body: 'Allowances Rp505.668.948 and benefits Rp9.300.000 tie to Talenta\'s totals; deductions are Rp1 apart, inside the Rp1.000 rounding limit. Rows that move more than 10% and Rp1.000.000 from August are flagged for a note. Why this line lists the pay items, staff count and rule behind any line.',
    watch: '3 rows are flagged. Sales Salaries for Sales, Bandung is up Rp14.846.600 to Rp36.115.400; Why this line shows Insentif Penjualan Rp4.500.000 for 3 staff, moved there by the rule "Sales team to sales salaries".',
    placement: 'top',
  },
  {
    run: financeConfirms,
    route: runRoute,
    target: 'payroll-run-confirm',
    // Once posted, the confirm notice gives way to the posted figures (Back from a later step).
    find: () => live('payroll-run-confirm') ?? live('payroll-run-stats'),
    role: 'Finance Manager',
    title: 'The Finance Manager confirms, because the settings changed.',
    body: 'Mapping the new pay item changed the payroll settings since August posted. A draft built on changed settings, or with a guardrail override, needs a Finance Manager to confirm before the Accountant can post it. Each journal keeps a copy of the settings that built it.',
    watch: 'Confirmed for posting by Bambang Sutrisno. Without it, Post is refused.',
    placement: 'bottom',
  },
  {
    run: post,
    route: () => `${runRoute()}?tab=journals`,
    target: 'payroll-journal',
    find: () => journalOpen('PAY-0003'),
    role: 'Accountant',
    title: 'The Accountant posts one PAY journal.',
    body: 'One balanced journal per run, dated on the period end. Cost lands by account and dimension: Direct Labour for store staff, Sales Salaries for the sales team, Salaries for the rest. Each party gets one payable line. Tax and BPJS are then paid and checked on their own.',
    watch: 'PAY-0003, 20 Sep 2026, Rp554.203.937. One payable each: Salaries Payable Rp446.901.857 for staff; PPh 21 Rp18.323.082 and PPh 26 Rp21.209.400; BPJS Kesehatan Rp16.097.025 and BPJS Ketenagakerjaan Rp38.969.125.',
    placement: 'top',
  },
  {
    run: paySalary,
    route: '/payroll-payables?month=2026-09',
    target: 'payroll-payables',
    find: () => rowIn('payroll-payables', 'Salary 21 Aug-20 Sep 2026'),
    title: 'On payday the salary is paid from Salaries Payable.',
    body: 'The payment clears the run\'s Salaries Payable, never an expense. Cost cannot be booked twice. Payroll payables shows what each party is owed, what is paid and when the rest is due.',
    watch: 'Salary 21 Aug-20 Sep 2026: owed Rp446.901.857, paid Rp446.901.857 from Bank BCA on 25 Sep 2026, balance Rp0. PPh 21 Rp18.323.082 is due 15 Oct 2026.',
    placement: 'bottom',
  },
  {
    run: resend,
    route: runRoute,
    target: 'payroll-holds',
    // Once the choice is made the hold is gone (Back from a later step): show the run's journals.
    find: () => live('payroll-holds') ?? live('payroll-run-journals'),
    title: 'Talenta sends September again.',
    body: 'HR corrected Human Capital pay after September posted. A different send for a posted period never posts on its own: Jurnal asks whether it revises the posted run or is a separate run, such as THR or a bonus.',
    watch: 'v2 waits for your choice: Revision of the posted run, or Separate run. 100% of the posted run\'s staff are in this send.',
    placement: 'bottom',
  },
  {
    run: reviseAndPostDifference,
    route: runRoute,
    target: 'payroll-run-journals',
    title: 'It is a revision. Jurnal compares v1 with v2 and posts the difference.',
    body: 'A posted journal is never edited. Because v2 raises Basic Salary by Rp2.000.000 for Human Capital, the difference journal carries only that change: Salaries Payable up Rp1.732.959 and PPh 21 up Rp197.041. Reverse and repost is the other way out.',
    watch: 'PAY-0004, a Difference journal of Rp2.199.800, sits beside PAY-0003. 2 live, and the ledger reflects v2.',
    placement: 'top',
  },
  {
    run: taxStaffFiles,
    route: runRoute,
    target: 'payroll-amendments',
    role: 'Tax Staff',
    title: 'Tax Staff get the PPh 21 task, then pay and file it.',
    body: 'A change to any employee\'s tax figures opens one amendment task for the tax month. September is not filed yet, so Tax Staff pay PPh 21 with its billing code 412011100202609 and NTPN 0A1B2C3D4E5F0926, then type the e-Bupot filed total, Rp18.520.123, which matches the ledger.',
    watch: 'Amend e-Bupot 21/26 for Sep 2026: 4 staff changed, period total change Rp197.041. Deposit matches.',
    placement: 'top',
  },
  {
    run: closeMonth,
    route: '/payroll-reconciliation?month=2026-09',
    target: 'payroll-recon-checks',
    role: 'Finance Manager',
    title: 'Five independent checks match and the Finance Manager signs off.',
    body: 'The checks skip the mapping and compare the ledger with outside sources: Talenta, the bank and the BPJS invoices. The Accountant paid the Rp1.732.959 that v2 added to take-home pay, entered both BPJS invoices and set the month ready. HR confirmed no later change.',
    watch: 'Take-home pay Rp448.634.816 against Salaries Payable, PPh 21 Rp18.520.123, bank Rp448.634.816 and expense Rp555.050.289: difference Rp0. BPJS payables Rp55.310.950 are Rp1 under the invoices, which round each programme, inside the Rp1.000 limit. Signed off by Bambang Sutrisno.',
    placement: 'bottom',
  },
  {
    run: oldSyncTries,
    route: '/payroll-settings?section=cut-over',
    target: 'payroll-old-sync',
    role: 'Accountant',
    title: 'The old Talenta Expense sync tries to post September and is blocked.',
    body: 'From the first live period, Jul 2026, payroll comes from Talenta runs. Two routes for one month is the likeliest double booking, so a payroll Expense for a month already in Jurnal is blocked in every mode. Claims still pass.',
    watch: 'Payroll Expense of Rp480.000.000 dated 20 Sep 2026: Blocked. Payroll for Sep 2026 is already in Jurnal.',
    placement: 'top',
  },
]

export const PAYROLL_TOUR: AssetTour = {
  id: 'payroll-narrative',
  code: 'PAY-1',
  name: 'From a held run to a signed-off month',
  persona: 'Accountant, Finance Manager, Tax Staff',
  role: 'Accountant' as unknown as ViewAsRole,
  blurb: 'September arrives from Talenta with a pay item no one has mapped. The Accountant maps it, the Finance Manager confirms, one PAY journal posts and the salary is paid. A revision posts as a difference, Tax Staff pay and file PPh 21, the month signs off and the old sync is blocked.',
  closing: 'The new pay item held the run until it had an account, the draft tied to Talenta, the Finance Manager confirmed the changed settings, one PAY journal posted cost by dimension and one payable per party, the revision posted only its difference, PPh 21 was paid and filed against the ledger, five independent checks matched at sign-off, and the old sync could not book September twice. To try it yourself, use Reset sample data under View as.',
  steps: steps as unknown as TourStep[],
  onReset: () => {
    Object.assign(tourCtx, { runId: '' })
    resetPayroll()
  },
  applyRole: (role: string) => setPayrollViewAs(role as PayrollRole),
}

export const PAYROLL_TOURS: AssetTour[] = [PAYROLL_TOUR]

/** The work of each step in order, for the spec to replay without a browser. */
export const TOUR_WORK = steps.map((s) => s.run ?? null)
