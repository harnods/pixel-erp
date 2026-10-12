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
  resetPayroll, setPayrollViewAs, runs, payItemKey, suggestMapping, setPayItemMapping,
  headcountChanges, markHeadcountExpected, runWarnings, acknowledgeWarning, postRun, simulateBankPayment,
  simulateSend, postCorrection, amendmentTasks, setEbupotFiled, pph21Month, closeAmendmentTask,
} from '~/data/payrollStore'
import type { PayrollRole } from '~/data/payrollMaster'
import type { AssetTour, TourStep } from './assetTours'
import type { ViewAsRole } from '~/data/assetStore'

type PayrollStep = Omit<TourStep, 'role'> & { role?: PayrollRole }

/** The September run: Talenta company 1212, 21 Aug to 20 Sep 2026. */
export const SEP_KEY = '1212 / monthly / 2026-08-21 / 2026-09-20'
export const SEP_MONTH = '2026-09'
export const SEP_LABEL = '21 Aug-20 Sep 2026'
export const NEW_ITEM = 'Insentif Penjualan'

/** Every data-tour marker PAY-1 points at. Product screens carry these. */
export const PAYROLL_TOUR_MARKERS = [
  'payroll-inbox-runs',
  'payroll-holds', 'payroll-run-stats', 'payroll-warnings', 'payroll-draft-headcount', 'payroll-draft-lines',
  'payroll-journal', 'payroll-journal-head', 'payroll-run-journals', 'payroll-correction', 'payroll-claims', 'payroll-amendments',
  'payroll-payables', 'payroll-payables-simulate', 'payroll-salary-row', 'payroll-pph21-row', 'payroll-payables-flags',
  'payroll-old-sync',
] as const

/** What the steps hand to each other within one run. */
export const tourCtx = { runId: '' }

export function sepId(): string {
  if (!tourCtx.runId) tourCtx.runId = runs.value.find((r) => r.key === SEP_KEY)?.id ?? ''
  return tourCtx.runId
}
const runRoute = () => `/payroll-runs/${sepId()}`
const PAYABLES = `/payroll-payables?month=${SEP_MONTH}`

// ── Finding what a step points at ───────────────────────────────────────────

function visible(el: Element | null | undefined): el is HTMLElement {
  return !!el && (el as HTMLElement).getClientRects().length > 0
}
function live(marker: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${marker}"]`)).filter(visible).pop() ?? null
}
/** The first visible `marker` element whose text holds every text in `texts`. */
function markerWith(marker: string, ...texts: string[]): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${marker}"]`))
    .find((el) => visible(el) && texts.every((t) => el.innerText.includes(t))) ?? null
}
/** The first visible table row inside `marker` that contains every text in `texts`. */
function rowIn(marker: string, ...texts: string[]): HTMLElement | null {
  const scope = live(marker)
  if (!scope) return null
  return Array.from(scope.querySelectorAll<HTMLElement>('tr'))
    .find((r) => visible(r) && texts.every((t) => r.innerText.includes(t))) ?? null
}
/**
 * A run-page section that may sit behind a tab. When Back left another tab open, open the
 * first tab whose label starts with one of `tabs` and let the runner's poll anchor next tick.
 */
function onTab(marker: string, ...tabs: string[]): () => HTMLElement | null {
  return () => {
    const el = live(marker)
    if (el) return el
    Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]'))
      .find((b) => visible(b) && tabs.some((t) => b.innerText.trim().startsWith(t)))?.click()
    return null
  }
}
/** One posted journal card with its lines open. */
function journalOpen(number: string): HTMLElement | null {
  const card = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="payroll-journal"][data-journal="${number}"]`)).filter(visible).pop()
    ?? markerWith('payroll-journal', number)
  if (!card) { onTab('payroll-run-journals', 'Journals')(); return null }
  if (!card.querySelector('table')) { card.querySelector<HTMLElement>('[data-tour="payroll-journal-head"]')?.click(); return null }
  return card
}

// ── The work each step does ─────────────────────────────────────────────────

function mapNewItem() {
  const s = suggestMapping(NEW_ITEM, 'allowance')!
  setPayItemMapping(payItemKey(NEW_ITEM, 'allowance'), { role: s.role, debit: s.debit, credit: s.credit, party: 'Staff' })
}
/** Every open warning on the run's current version, acknowledged by the Accountant. */
function acknowledgeAll() {
  for (const w of runWarnings(sepId()).filter((x) => !x.acknowledged)) acknowledgeWarning(sepId(), w.key, 'Checked against the Talenta run')
}
/** HR settled the September people changes in Talenta: each group is marked Expected, then the large changes are acknowledged. */
function reviewDraft() {
  for (const g of headcountChanges(sepId()).groups.filter((x) => x.flagged)) markHeadcountExpected(sepId(), g.key, 'Settled by HR in Talenta')
  acknowledgeAll()
}
function post() { postRun(sepId()) }
function bankMatchesSalary() { simulateBankPayment('salary', { runId: sepId(), date: '2026-09-25' }) }
function talentaResends() { simulateSend('revision', { runId: sepId() }) }
/** Acknowledgements belong to a version: v2's warnings are acknowledged before the correction posts. */
function postTheCorrection() {
  acknowledgeAll()
  postCorrection(sepId())
}
function bankMatchesPph21() { simulateBankPayment('pph21', { month: SEP_MONTH, date: '2026-10-05' }) }
/** Tax Staff file September once, on the v2 figures, and type the filed total. */
function taxStaffFile() {
  setEbupotFiled(SEP_MONTH, pph21Month(SEP_MONTH).books)
  const task = amendmentTasks.value.find((t) => t.taxMonth === SEP_MONTH && t.status === 'Open')
  if (task) closeAmendmentTask(task.id, 'Not filed yet')
}
function oldSyncTries() { simulateSend('old-sync') }

// ── Steps ───────────────────────────────────────────────────────────────────

const steps: PayrollStep[] = [
  {
    route: '/payroll-inbox',
    target: 'payroll-inbox-runs',
    find: () => rowIn('payroll-inbox-runs', SEP_LABEL) ?? live('payroll-inbox-runs'),
    role: 'Accountant',
    title: 'September arrives from Talenta and is held.',
    body: 'HR settles payroll in Talenta and sends it to Jurnal, which builds the draft journal right away. A send stops only when Jurnal cannot book it. This month HR added an allowance that has no account yet. July and August are posted and paid.',
    watch: '21 Aug-20 Sep 2026 is Held: 1 pay item has no account: Insentif Penjualan (allowance), Rp10.500.000, 7 employees. Nothing posts while it holds.',
    placement: 'bottom',
  },
  {
    run: mapNewItem,
    route: runRoute,
    target: 'payroll-run-stats',
    title: 'The Accountant maps Insentif Penjualan and the draft builds.',
    body: 'Jurnal suggests the mapping from the name: Earning, debit Salaries, credit Salaries Payable. Saving it checks every held run again. The hold clears on its own and the draft journal builds.',
    watch: 'Ready to post. Take-home pay Rp446.901.849 for 40 staff; draft journal Rp554.203.941 on 26 lines.',
    placement: 'bottom',
  },
  {
    run: reviewDraft,
    route: runRoute,
    target: 'payroll-warnings',
    find: onTab('payroll-warnings', 'Draft'),
    title: 'Warnings point at what changed since August; none of them blocks Post.',
    body: 'Rows that move more than 10% and Rp1.000.000 from August are warned. Headcount compares the staff in this send with August\'s by Talenta user ID. EMP-0038 left Sales, Surabaya; EMP-0041 joined Sales, Bandung; EMP-0035 moved from Sales, Jakarta HQ to Sales, Surabaya. HR settled all three in Talenta, so the Accountant marks them Expected.',
    watch: 'Sales Salaries for Sales, Bandung up Rp14.846.600, Sales, Jakarta HQ down Rp8.373.400 and Sales, Surabaya up Rp3.616.560. PPh 21 payable up Rp1.678.971. All 4 are acknowledged and the 3 headcount changes are Expected, so the Post confirm lists no warnings.',
    placement: 'top',
  },
  {
    run: post,
    route: () => `${runRoute()}?tab=journals`,
    target: 'payroll-journal',
    find: () => journalOpen('PAY-0003'),
    title: 'The Accountant posts one PAY journal.',
    body: 'One balanced journal per run, dated on the period end. Cost lands by account and by organization and branch: Direct Labour for Operations, Bandung, Sales Salaries for Sales, Surabaya. Each party gets one payable line.',
    watch: 'PAY-0003, 20 Sep 2026, Rp554.203.941. Salaries Payable Rp446.901.849 for staff; PPh 21 Rp18.323.082 and PPh 26 Rp21.209.400; BPJS Kesehatan Rp16.097.029, BPJS Ketenagakerjaan Rp38.969.133 and DPLK Rp9.300.000.',
    placement: 'top',
  },
  {
    run: bankMatchesSalary,
    route: PAYABLES,
    target: 'payroll-salary-row',
    find: () => markerWith('payroll-salary-row', SEP_LABEL) ?? live('payroll-salary-row'),
    title: 'Bank reconciliation matches the salary transfer and the payable shows it paid.',
    body: 'Payroll payables is a tracker. Payments come from bank reconciliation, where the statement line is matched to the payable. The match clears Salaries Payable, never an expense, so cost cannot be booked twice.',
    watch: 'Salary 21 Aug-20 Sep 2026: owed Rp446.901.849, paid Rp446.901.849 by BNK-0013 from Bank BCA on 25 Sep 2026, balance Rp0. Paid.',
    placement: 'bottom',
  },
  {
    run: talentaResends,
    route: runRoute,
    target: 'payroll-correction',
    find: () => live('payroll-correction') ?? live('payroll-run-journals'),
    title: 'Talenta sends September again and the latest version wins.',
    body: 'HR corrected Human Capital pay after September posted. v2 becomes the current version on its own. Jurnal builds a correction with the difference only and tells the Accountant what moved. PAY-0003 stays in the ledger until the correction posts.',
    watch: 'Payroll 21 Aug-20 Sep 2026 v2 replaces v1. Take-home pay +Rp1.732.959, PPh 21 +Rp197.041, PPh 26 Rp0, BPJS +Rp244.800. 4 staff changed. Correction ready to post. Amounts changed for EMP-0029 to EMP-0032 in Human Capital: Rp2.199.800 on 7 lines.',
    placement: 'bottom',
  },
  {
    run: postTheCorrection,
    route: () => `${runRoute()}?tab=journals`,
    target: 'payroll-run-journals',
    find: onTab('payroll-run-journals', 'Journals'),
    title: 'The Accountant posts the correction.',
    body: 'A posted journal is never edited. Post correction adds one journal with the difference, and Reverse and repost stays under More. Acknowledgements belong to a version, so v2\'s warnings are acknowledged again first.',
    watch: 'PAY-0004, a Correction of Rp2.199.800, sits beside PAY-0003, and the ledger holds v2. Salaries Payable for September is now Rp448.634.808, Rp1.732.959 more than the bank paid.',
    placement: 'top',
  },
  {
    run: bankMatchesPph21,
    route: runRoute,
    target: 'payroll-amendments',
    find: () => live('payroll-amendments') ?? onTab('payroll-amendments', 'Draft', 'Journals')(),
    role: 'Tax Staff',
    title: 'Tax Staff get a PPh 21 amendment task for September.',
    body: 'A version that changes any employee\'s tax figures opens one amendment task for the tax month. Bank reconciliation has matched the PPh 21 deposit for September, on the v2 figures.',
    watch: 'Amend e-Bupot 21/26 for Sep 2026: 4 staff changed, period total change Rp197.041. PPh 21 paid Rp18.520.123: Deposit matches.',
    placement: 'top',
  },
  {
    run: taxStaffFile,
    route: PAYABLES,
    target: 'payroll-pph21-row',
    find: () => live('payroll-pph21-row') ?? live('payroll-payables'),
    title: 'Tax Staff type the e-Bupot filed total on Payables and it matches the books.',
    body: 'September was not filed before v2 arrived, so Tax Staff file once and close the task as Not filed yet. The PPh 21 row flags a filed total more than Rp1.000 away from the books.',
    watch: 'Tax Payable - PPh 21 Sep 2026: owed Rp18.520.123, paid Rp18.520.123, balance Rp0. The e-Bupot filed total is Rp18.520.123 against books of Rp18.520.123: difference Rp0, no flag.',
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
  name: 'From a held run to a corrected, paid month',
  persona: 'Accountant, Tax Staff',
  role: 'Accountant' as unknown as ViewAsRole,
  blurb: 'September arrives from Talenta with a pay item no one has mapped. The Accountant maps it, reviews the warnings and posts one PAY journal, and bank reconciliation pays the salary. Talenta re-sends September, the correction posts, Tax Staff check PPh 21 against e-Bupot and the old sync is blocked.',
  closing: 'The new pay item held the run until it had an account, the draft built as soon as it was mapped, the large changes and the September staff changes were reviewed without blocking Post, one PAY journal posted cost by dimension and one payable per party, a bank match paid the salary, the re-send became the current version with its correction summary, the correction posted the difference only, Tax Staff saw PPh 21 deposited and filed against the books, and the old sync could not book September twice. To try it yourself, use Reset sample data under View as.',
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
