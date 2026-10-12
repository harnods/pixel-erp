/**
 * Guided tours for the payroll screens (Payroll to Ledger, Jurnal x Talenta), auto-played:
 * PAY-1 Set up payroll, PAY-2 Monthly payroll run, PAY-3 When Talenta sends again.
 *
 * This is a demo layer for walkthroughs, not a product requirement; engineers
 * building the product should ignore it. The only coupling to product screens
 * is the data-tour="..." attributes they carry. It reuses the asset tour
 * runner, with its own reset and View as.
 *
 * Every step does its own work on Next (run), then opens the screen that
 * shows the result and points at it. The reader only presses Next.
 * tests/payroll-tour.spec.ts replays every step's work after the tour's reset,
 * checks every figure quoted here, and checks that every payroll feature is
 * touched by at least one step (PAYROLL_FEATURES).
 */
import {
  payroll, resetPayroll, setPayrollViewAs, runs, payItemKey, setPayItemAccount, setPayItemGroupsCanChange,
  setGroupBy, setGroupAccount, setGroupDimension, saveGroup, linkDimension, createPayrollTag, groupRows,
  runWarnings, acknowledgeWarning, postRun, approvePayroll, reverseAndRepost, simulateSend,
  simulateBankPayment, simulateManualJournal,
} from '~/data/payrollStore'
import { ACC, type PayrollRole } from '~/data/payrollMaster'
import type { AssetTour, TourStep } from './assetTours'
import type { ViewAsRole } from '~/data/assetStore'

type PayrollStep = Omit<TourStep, 'role'> & { role?: PayrollRole }

/** The September run: Talenta company 1212, 21 Aug to 20 Sep 2026. */
export const SEP_KEY = '1212 / monthly / 2026-08-21 / 2026-09-20'
export const SEP_MONTH = '2026-09'
export const SEP_LABEL = '21 Aug-20 Sep 2026'
export const NEW_ITEM = 'Insentif Penjualan'
export const NEW_GROUP = 'Operations, Medan'

/**
 * Every data-tour marker the payroll tours may point at: the list agreed with the screens
 * (each product screen carries these). A step targets nothing else.
 */
export const PAYROLL_TOUR_MARKERS = [
  'payroll-connection', 'payroll-how-to-send', 'payroll-payable-accounts', 'payroll-payitems', 'payroll-type-tip',
  'payroll-groups-can-change', 'payroll-groupby', 'payroll-group-dims', 'payroll-groups-table', 'payroll-viewas',
  'payroll-inbox-runs', 'payroll-synclog', 'payroll-month-headcount', 'payroll-simulate-send', 'payroll-holds',
  'payroll-warnings', 'payroll-draft-lines', 'payroll-post', 'payroll-approve', 'payroll-journal-date',
  'payroll-revision', 'payroll-repost', 'payroll-versions', 'payroll-run-journals', 'payroll-mapping-used',
  'payroll-claims', 'payroll-payables', 'payroll-payables-simulate', 'payroll-salary-row', 'payroll-payables-flags',
] as const

/** What the steps hand to each other within one run of a tour. */
export const tourCtx = { runId: '', octId: '' }

export function sepId(): string {
  if (!tourCtx.runId) tourCtx.runId = runs.value.find((r) => r.key === SEP_KEY)?.id ?? ''
  return tourCtx.runId
}
const runRoute = (tab?: string) => () => `/payroll-runs/${sepId()}${tab ? `?tab=${tab}` : ''}`
const PAYABLES = `/payroll-payables?month=${SEP_MONTH}`
const SETTINGS = (section: 'connection' | 'pay-items' | 'groups') => `/payroll-settings?section=${section}`

// ── Finding what a step points at ───────────────────────────────────────────

function visible(el: Element | null | undefined): el is HTMLElement {
  return !!el && (el as HTMLElement).getClientRects().length > 0
}
function live(marker: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${marker}"]`))
    .filter((el) => visible(el) && !el.closest('[class*="leave-active"]')).pop() ?? null
}
/** The first visible table row inside `marker` that contains every text in `texts`, else the marker. */
function rowIn(marker: string, ...texts: string[]): () => HTMLElement | null {
  return () => {
    const scope = live(marker)
    if (!scope) return null
    return Array.from(scope.querySelectorAll<HTMLElement>('tr'))
      .find((r) => visible(r) && texts.every((t) => r.innerText.includes(t))) ?? scope
  }
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
/** The journal date field in the Post journal drawer, opening the drawer from the Post button once. */
function journalDateField(): HTMLElement | null {
  const el = live('payroll-journal-date')
  if (el) return el
  const post = live('payroll-post')
  if (post && !post.dataset.tourOpened) {
    post.dataset.tourOpened = '1'
    ;(post.matches('button') ? post : post.querySelector<HTMLElement>('button') ?? post).click()
  }
  return null
}

// ── The work each step does ─────────────────────────────────────────────────

/** Run `fn` as another View as role, then hand the screen back to the step's role. */
function as<T>(role: PayrollRole, fn: () => T): T {
  const prev = payroll.viewAs
  setPayrollViewAs(role)
  try { return fn() } finally { setPayrollViewAs(prev) }
}
const insentif = () => payItemKey(NEW_ITEM, 'allowance')
const groupKey = (label: string) => groupRows().find((g) => g.label === label)?.key ?? ''
/** Every open warning on the run's current version, marked as checked. */
function markAllChecked(runId: string) {
  for (const w of runWarnings(runId).filter((x) => !x.acknowledged)) acknowledgeWarning(runId, w.key, 'Checked against the Talenta run')
}
/** PAY-2 and PAY-3 start where Set up payroll leaves the groups: staff grouped by Organization and Branch. */
function groupedByOrganizationAndBranch() {
  as('Owner', () => setGroupBy(['organization_name', 'branch']))
}

// PAY-1
function mapNewItem() {
  setPayItemGroupsCanChange(insentif(), true)
  setPayItemAccount(insentif(), ACC.salaries)
}
function groupByOrganizationAndBranch() { setGroupBy(['organization_name', 'branch']) }
function linkBranch() { linkDimension('branch', 'Branch') }
function setUpTwoGroups() {
  setGroupAccount(groupKey('Operations, Jakarta HQ'), ACC.directLabour)
  setGroupDimension(groupKey('Human Capital, Surabaya'), 'Branch', 'Jakarta HQ')
}

// PAY-2
function mapFromTheHold() { setPayItemAccount(insentif(), ACC.salesSalaries) }
function talentaSendsANewGroup() { simulateSend('new-group', { runId: sepId() }) }
/**
 * Set up group on the Groups tab: the expense account, the Branch value Medan, then Set up group.
 * The account goes first: the run stays held until the Branch value exists, so the draft that
 * builds when it clears already carries Direct Labour.
 */
function setUpNewGroup() {
  const key = groupKey(NEW_GROUP)
  setGroupAccount(key, ACC.directLabour)
  createPayrollTag('Branch', 'Medan')
  setGroupDimension(key, 'Branch', 'Medan')
  saveGroup(key)
}
function markChecked() { markAllChecked(sepId()) }
function sendForApproval() { postRun(sepId()) }
function ownerApproves() { approvePayroll(sepId()) }
function bankPaysSalary() { simulateBankPayment('salary', { runId: sepId(), date: '2026-09-25' }) }
function bankPaysTooMuch() { simulateBankPayment('overpaid', { runId: sepId(), date: '2026-09-26' }) }
function manualJournal() { simulateManualJournal() }

// PAY-3
/** September as the monthly run leaves it: mapped, checked, posted after approval, salary paid. */
function septemberPostedAndPaid() {
  setPayItemAccount(insentif(), ACC.salesSalaries)
  markAllChecked(sepId())
  postRun(sepId())
  as('Owner', () => approvePayroll(sepId()))
  simulateBankPayment('salary', { runId: sepId(), date: '2026-09-25' })
}
function talentaSendsSeptemberAgain() { simulateSend('revision', { runId: sepId() }) }
function repostV2() { as('Accountant + LM', () => reverseAndRepost(sepId())) }
function octoberWithoutMealAllowance() {
  const r = simulateSend('regular', { omit: ['Uang Makan'], newAllowance: { name: NEW_ITEM, organization: 'Sales', amount: 1_500_000 } })
  tourCtx.octId = r.runId ?? ''
}
function oldSyncTries() { simulateSend('old-sync') }

// ── PAY-1 Set up payroll ────────────────────────────────────────────────────

const setupSteps: PayrollStep[] = [
  {
    route: SETTINGS('connection'),
    target: 'payroll-connection',
    role: 'Owner',
    title: 'Jurnal is connected to Talenta company 1212.',
    body: 'The Owner connects once. From then on HR settles payroll in Talenta and Jurnal books what Talenta sends. Connecting also blocks the old Talenta to Expense sync, so a month is never booked twice.',
    watch: 'Connected to company 1212. Talenta has sent payroll 4 times; the last send arrived on 21 Sep 2026.',
    placement: 'bottom',
  },
  {
    route: SETTINGS('connection'),
    target: 'payroll-how-to-send',
    title: 'HR sends payroll from Talenta, not from Jurnal.',
    body: 'How to send from Talenta holds the steps for HR. Jurnal never pulls payroll; each send is one pay period, and a second send of the same period becomes a new version.',
    placement: 'bottom',
  },
  {
    route: SETTINGS('pay-items'),
    target: 'payroll-payable-accounts',
    title: 'Each party is owed on its own payable account.',
    body: 'Staff, the tax office, BPJS Kesehatan, BPJS Ketenagakerjaan and DPLK each get one payable. BPJS is the state health and employment insurance; DPLK is the pension fund.',
    watch: 'Staff are owed on 2-20201 Salaries Payable, PPh 21 on 2-20501 Tax Payable - PPh 21 and DPLK on 2-20512 DPLK Payable.',
    placement: 'bottom',
  },
  {
    route: SETTINGS('pay-items'),
    target: 'payroll-type-tip',
    title: 'The type of each pay item comes from Talenta.',
    body: 'Talenta sends every pay item under a payslip section: allowance, deduction or benefit. Jurnal reads the type from there and shows it read-only; the header tip says so.',
    watch: '20 pay items are listed. Insentif Penjualan arrived with the September send and has no account yet.',
    placement: 'bottom',
  },
  {
    run: mapNewItem,
    route: SETTINGS('pay-items'),
    target: 'payroll-payitems',
    find: rowIn('payroll-payitems', NEW_ITEM),
    title: 'The Owner maps Insentif Penjualan to an expense account.',
    body: 'Any expense or cost of goods sold account can take a cost item. The other side follows the type: an allowance is owed to staff, so it credits Salaries Payable.',
    watch: 'Insentif Penjualan debits 6-60101 Salaries and credits 2-20201 Salaries Payable. The September run is ready to post: Rp554.203.941 on 26 lines.',
    placement: 'top',
  },
  {
    route: SETTINGS('pay-items'),
    target: 'payroll-groups-can-change',
    title: 'Use group account lets a group post the cost to its own account.',
    body: 'On: the item uses the staff member\'s group account, where the group has one. Off (Use default account): the item posts to this account for every group.',
    watch: 'Insentif Penjualan is paid to 7 Sales staff, so it lands on 6-60004 Sales Salaries, the Sales groups\' account, not on Salaries.',
    placement: 'top',
  },
  {
    run: groupByOrganizationAndBranch,
    route: SETTINGS('groups'),
    target: 'payroll-groupby',
    title: 'Staff are grouped by Organization and Branch.',
    body: 'Group by takes any fields Talenta sends. Each combination Talenta has sent becomes a group row with a staff count, never names.',
    watch: '9 groups from the last send. Operations, Jakarta HQ has 10 staff.',
    placement: 'bottom',
  },
  {
    run: linkBranch,
    route: SETTINGS('groups'),
    target: 'payroll-group-dims',
    title: 'Each Group by field fills a Jurnal dimension.',
    body: 'A dimension is how Jurnal reports cost by department or place. Organization fills the Organization dimension and Branch fills Branch, so cost lines carry both.',
    placement: 'bottom',
  },
  {
    run: setUpTwoGroups,
    route: SETTINGS('groups'),
    target: 'payroll-groups-table',
    find: rowIn('payroll-groups-table', 'Operations, Jakarta HQ'),
    title: 'A group picks its expense account and its dimension values.',
    body: '9 of the 10 Operations staff at Jakarta HQ work in the Kemang store, so the group posts to Direct Labour. The one Human Capital person in Surabaya is charged to Jakarta HQ.',
    watch: 'Operations, Jakarta HQ posts to 5-50101 Direct Labour. Human Capital, Surabaya carries Branch Jakarta HQ.',
    placement: 'top',
  },
  {
    route: runRoute(),
    target: 'payroll-post',
    title: 'Large payroll journals go to the Owner for approval.',
    body: 'Settings, Approval workflows holds the rule Payroll journal above Rp500.000.000. A journal above it waits in Inbox, Awaiting approval, and posts when the Owner approves.',
    watch: 'September\'s draft is Rp554.203.941, above the limit, so Post journal sends it for approval.',
    placement: 'bottom',
  },
  {
    route: SETTINGS('pay-items'),
    target: 'payroll-viewas',
    role: 'View only',
    title: 'View only sees payroll and changes nothing.',
    body: 'An Ultimate or Accountant user with every payroll action off can read every screen. Buttons and settings that change something are not there.',
    placement: 'bottom',
  },
  {
    route: SETTINGS('groups'),
    target: 'payroll-groups-table',
    role: 'Accountant',
    title: 'An Accountant posts payroll but needs LM to change settings.',
    body: 'Accountant can review, mark warnings as checked and post. Changing pay items and groups needs the LM authority, which the Owner, Ultimate + LM and Accountant + LM have.',
    placement: 'top',
  },
]

// ── PAY-2 Monthly payroll run ───────────────────────────────────────────────

const runSteps: PayrollStep[] = [
  {
    route: '/payroll-inbox',
    target: 'payroll-inbox-runs',
    find: rowIn('payroll-inbox-runs', SEP_LABEL),
    title: 'September arrives from Talenta and Jurnal builds it at once.',
    body: 'HR settles payroll in Talenta and sends it. A send stops only when Jurnal cannot book it; July and August are posted and paid.',
    watch: '21 Aug-20 Sep 2026: 40 staff, take-home pay Rp446.901.849.',
    placement: 'bottom',
  },
  {
    route: '/payroll-inbox?view=log',
    target: 'payroll-synclog',
    title: 'The sync log lists every send Talenta made.',
    body: 'One row per send: when it arrived, the period, the version, staff and pay items, and what Jurnal did with it.',
    watch: 'The September send is v1 with 40 staff and 23 pay items.',
    placement: 'bottom',
  },
  {
    route: runRoute(),
    target: 'payroll-holds',
    title: 'One pay item has no account, so the run is held.',
    body: 'To fix before posting lists what stops the journal. HR added a sales incentive this month that no one has mapped yet.',
    watch: 'Insentif Penjualan: Rp10.500.000 for 7 staff, no account.',
    placement: 'bottom',
  },
  {
    run: mapFromTheHold,
    route: runRoute(),
    target: 'payroll-draft-lines',
    find: onTab('payroll-draft-lines', 'Draft'),
    title: 'Bayu maps it and the draft journal builds.',
    body: 'Mapping the item from the hold saves it in Pay items and checks the run again. The hold clears on its own.',
    watch: 'Ready to post: Rp554.203.941 on 25 lines.',
    placement: 'top',
  },
  {
    run: talentaSendsANewGroup,
    route: runRoute(),
    target: 'payroll-holds',
    title: 'Talenta sends September again with a new group.',
    body: 'HR moved 2 operations staff to a new Medan branch and sent the period again. v2 becomes the current version, and a group no one has set up holds the run.',
    watch: 'v2 is held: Operations, Medan with 2 staff is a New group.',
    placement: 'bottom',
  },
  {
    run: setUpNewGroup,
    route: SETTINGS('groups'),
    target: 'payroll-groups-table',
    find: rowIn('payroll-groups-table', NEW_GROUP),
    title: 'Bayu sets up Operations, Medan.',
    body: 'Medan becomes a Branch value, the group posts to Direct Labour like the other stores, and Set up group saves it. Saving checks the held run again.',
    watch: 'Operations, Medan: 2 staff, 5-50101 Direct Labour, Branch Medan. September v2 is ready to post.',
    placement: 'top',
  },
  {
    route: runRoute(),
    target: 'payroll-draft-lines',
    find: onTab('payroll-draft-lines', 'Draft'),
    title: 'The draft review shows the exact journal, line by line.',
    body: 'Cost lands by account and by Organization and Branch; each party gets one payable line. Nothing posts until someone posts it.',
    watch: 'Rp554.203.941 on 26 lines. Direct Labour for Operations, Medan is Rp36.204.342.',
    placement: 'top',
  },
  {
    run: markChecked,
    route: runRoute(),
    target: 'payroll-warnings',
    find: onTab('payroll-warnings', 'Draft'),
    title: 'Warnings point at what changed since August.',
    body: 'Lines that move more than 10% and Rp1.000.000 are warned, and so are staff who joined, left or moved. Warnings never stop Post; Bayu checks each one and uses Mark as checked.',
    watch: '9 warnings, all marked as checked: 8 lines that moved and 1 headcount check.',
    placement: 'top',
  },
  {
    route: '/payroll-inbox?view=month',
    target: 'payroll-month-headcount',
    role: 'Owner',
    title: 'The Owner sees the month headcount.',
    body: 'Month headcount compares this month\'s staff with the last posted month, by group, in counts only. Only the Owner and Ultimate + LM see it.',
    watch: '40 staff in September: 1 joined, 1 left and 3 moved between groups.',
    placement: 'bottom',
  },
  {
    route: runRoute(),
    target: 'payroll-journal-date',
    find: journalDateField,
    role: 'Accountant + LM',
    title: 'Post journal asks for one journal date.',
    body: 'Journal date defaults to the last day of the pay period. A date in a locked period is refused: July is locked.',
    watch: 'Journal date 20 Sep 2026. The journal is above Rp500.000.000, so it goes for approval.',
    placement: 'left',
  },
  {
    run: sendForApproval,
    route: '/payroll-inbox',
    target: 'payroll-inbox-runs',
    find: rowIn('payroll-inbox-runs', SEP_LABEL),
    title: 'Bayu sends the journal for approval.',
    body: 'The rule in Approval workflows matched, so nothing posts yet. The request waits in Inbox, Awaiting approval, with the journal date Bayu chose.',
    watch: 'September is awaiting approval from Rizal Candra: Rp554.203.941 dated 20 Sep 2026.',
    placement: 'bottom',
  },
  {
    route: runRoute(),
    target: 'payroll-approve',
    role: 'Owner',
    title: 'The Owner opens the run from the Inbox.',
    body: 'Approve and post books the journal on the requested date. Reject sends it back to draft with a reason.',
    placement: 'bottom',
  },
  {
    run: ownerApproves,
    route: runRoute('journals'),
    target: 'payroll-run-journals',
    find: onTab('payroll-run-journals', 'Journals'),
    title: 'Rizal approves and the PAY journal posts.',
    body: 'One balanced journal per run. A posted journal is never edited; a later send reverses it and posts again.',
    watch: 'PAY-0003, 20 Sep 2026, Rp554.203.941.',
    placement: 'top',
  },
  {
    route: runRoute('built'),
    target: 'payroll-mapping-used',
    find: onTab('payroll-mapping-used', 'Mapping used'),
    title: 'Mapping used keeps the settings the journal was built from.',
    body: 'Later changes to pay items or groups never change a posted journal. This tab shows which account each pay item went to and which fields filled which dimension.',
    watch: 'Insentif Penjualan went to 6-60004 Sales Salaries.',
    placement: 'top',
  },
  {
    route: runRoute(),
    target: 'payroll-claims',
    role: 'Accountant + LM',
    title: 'Claims paid through payroll show apart.',
    body: 'Reimbursements Talenta pays with the salary are listed by account and dimension, so claims are not mistaken for salary cost.',
    watch: 'Reimbursement Medical: Rp3.000.000 for 6 staff on 6-60106 Medical Expense.',
    placement: 'top',
  },
  {
    run: bankPaysSalary,
    route: PAYABLES,
    target: 'payroll-salary-row',
    title: 'Bank reconciliation matches the salary transfer.',
    body: 'Payroll payables tracks what each party is still owed. A payment arrives when a bank statement line is matched to the payable; it clears Salaries Payable, never an expense.',
    watch: 'Salary 21 Aug-20 Sep 2026: owed Rp446.901.849, paid by BNK-0013 on 25 Sep 2026, balance Rp0.',
    placement: 'bottom',
  },
  {
    run: bankPaysTooMuch,
    route: PAYABLES,
    target: 'payroll-payables-simulate',
    title: 'This menu stands in for a bank statement line.',
    body: 'In Jurnal the line comes from bank reconciliation. Here a second transfer for the September salary arrives and is matched.',
    watch: 'BNK-0014 pays Rp250.000 more on 26 Sep 2026.',
    placement: 'bottom',
  },
  {
    route: PAYABLES,
    target: 'payroll-payables-flags',
    title: 'The row flags a bank amount that differs from the run.',
    body: 'When the bank paid more or less than the posted run, the payable says so on its row.',
    watch: 'Bank paid Rp447.151.849 against Rp446.901.849: Rp250.000 over.',
    placement: 'bottom',
  },
  {
    run: manualJournal,
    route: runRoute(),
    target: 'payroll-warnings',
    find: onTab('payroll-warnings', 'Draft', 'Posted'),
    title: 'A manual journal on Salaries Payable is warned.',
    body: 'Someone posts a journal by hand on a payroll account. The run and the Salaries Payable row both warn, because cost booked outside Talenta can count twice.',
    watch: 'JV-0001 posts Rp1.500.000 to Salaries and Salaries Payable on 20 Sep 2026.',
    placement: 'top',
  },
]

// ── PAY-3 When Talenta sends again ──────────────────────────────────────────

const resendSteps: PayrollStep[] = [
  {
    run: septemberPostedAndPaid,
    route: runRoute('journals'),
    target: 'payroll-run-journals',
    find: onTab('payroll-run-journals', 'Journals'),
    title: 'September is posted and the salary is paid.',
    body: 'This is where the monthly run ends: the Owner approved PAY-0003 and bank reconciliation matched the salary transfer.',
    watch: 'PAY-0003, 20 Sep 2026, Rp554.203.941. Salary paid by BNK-0013.',
    placement: 'top',
  },
  {
    run: talentaSendsSeptemberAgain,
    route: '/payroll-inbox',
    target: 'payroll-simulate-send',
    title: 'HR corrects Human Capital pay and sends September again.',
    body: 'This menu stands in for a send from Talenta. A send for a period that is already posted becomes the next version of the same run.',
    watch: '21 Aug-20 Sep 2026 v2 arrives with 40 staff.',
    placement: 'bottom',
  },
  {
    route: runRoute(),
    target: 'payroll-revision',
    title: 'Talenta sent this period again.',
    body: 'v2 becomes the current version. The run shows what it changes before anything posts; PAY-0003 stays in the ledger until the repost.',
    watch: 'Take-home pay +Rp1.732.959, PPh 21 +Rp197.041, BPJS +Rp244.800. 4 staff changed.',
    placement: 'bottom',
  },
  {
    route: runRoute('versions'),
    target: 'payroll-versions',
    find: onTab('payroll-versions', 'Versions'),
    title: 'Versions show which accounts and dimensions move.',
    body: 'v1 is in the ledger and v2 is the latest. Only the lines that change are listed.',
    watch: 'Salaries for Human Capital, Jakarta HQ +Rp1.648.600 and Human Capital, Surabaya +Rp551.200.',
    placement: 'top',
  },
  {
    route: runRoute(),
    target: 'payroll-repost',
    role: 'Accountant + LM',
    title: 'Use v2 and repost replaces the posted journal in full.',
    body: 'Jurnal reverses PAY-0003 in full and posts v2 in full, both on one journal date. The latest version is picked; an older one can be chosen instead.',
    watch: 'Journal date 20 Sep 2026 for both journals. v2 is Rp556.403.741, above Rp500.000.000, so it goes for approval.',
    placement: 'bottom',
  },
  {
    run: repostV2,
    route: runRoute(),
    target: 'payroll-approve',
    role: 'Owner',
    title: 'Bayu sends the repost; the Owner approves it.',
    body: 'The repost waits in Inbox, Awaiting approval, like a first post. Approve and post books the reversal and the new journal together.',
    placement: 'bottom',
  },
  {
    run: ownerApproves,
    route: runRoute('journals'),
    target: 'payroll-run-journals',
    find: onTab('payroll-run-journals', 'Journals'),
    title: 'The old journal is reversed and the new one posted.',
    body: 'Nothing is edited in place. The ledger now holds v2, and the reversal keeps the trail.',
    watch: 'PAY-0004 reverses Rp554.203.941 and PAY-0005 posts Rp556.403.741, both on 20 Sep 2026.',
    placement: 'top',
  },
  {
    route: PAYABLES,
    target: 'payroll-salary-row',
    role: 'Accountant + LM',
    title: 'Payables follow the new journal.',
    body: 'Staff are now owed the v2 take-home pay. The bank paid the v1 amount, so the rest is still open and the row flags the gap.',
    watch: 'Owed Rp448.634.808, paid Rp446.901.849, balance Rp1.732.959.',
    placement: 'bottom',
  },
  {
    run: octoberWithoutMealAllowance,
    route: () => (tourCtx.octId ? `/payroll-runs/${tourCtx.octId}` : '/payroll-inbox'),
    target: 'payroll-warnings',
    find: onTab('payroll-warnings', 'Draft'),
    title: 'October arrives without the meal allowance.',
    body: 'A pay item that was in the last send and is missing now does not hold the run. Jurnal books what arrived and warns, so HR can send again if it was a mistake.',
    watch: 'Uang Makan was Rp18.375.000 in September and is missing. The draft is ready to post at Rp535.367.866.',
    placement: 'top',
  },
  {
    run: oldSyncTries,
    route: SETTINGS('connection'),
    target: 'payroll-connection',
    title: 'The old Talenta to Expense sync tries to book September.',
    body: 'Before the connection, Talenta booked payroll as an Expense. Two routes for one month is a double booking, so the old sync is blocked.',
    watch: 'An Expense of Rp480.000.000 dated 20 Sep 2026 is blocked; September is already in Jurnal.',
    placement: 'bottom',
  },
]

// ── Tours ───────────────────────────────────────────────────────────────────

const applyRole = (role: string) => setPayrollViewAs(role as PayrollRole)
function reset(prepare?: () => void) {
  return () => {
    Object.assign(tourCtx, { runId: '', octId: '' })
    resetPayroll()
    prepare?.()
  }
}

export const PAYROLL_SETUP_TOUR: AssetTour = {
  id: 'payroll-setup',
  code: 'PAY-1',
  name: 'Set up payroll',
  persona: 'Owner',
  role: 'Owner' as unknown as ViewAsRole,
  blurb: 'The Owner checks the Talenta connection, the payable account of each party, the pay items and the groups that decide where cost lands. Then the approval rule for large journals, and what View only and an Accountant without LM can do.',
  closing: 'The connection showed where payroll comes from and that the old sync is blocked, each party had its payable account, the new pay item got an account with Use group account on, staff were grouped by Organization and Branch with a dimension for each, two groups got their own account and dimension value, and large journals go to the Owner for approval. View only reads everything and an Accountant needs LM to change settings. To try it yourself, use Reset sample data under View as.',
  steps: setupSteps as unknown as TourStep[],
  onReset: reset(),
  applyRole,
}

export const PAYROLL_RUN_TOUR: AssetTour = {
  id: 'payroll-run',
  code: 'PAY-2',
  name: 'Monthly payroll run',
  persona: 'Accountant + LM, Owner',
  role: 'Accountant + LM' as unknown as ViewAsRole,
  blurb: 'September arrives from Talenta with a pay item no one has mapped, then again with a new group. Bayu, an Accountant with LM, fixes both, checks the warnings and sends the journal for approval; Rizal, the Owner, approves and posts it. Bank reconciliation pays the salary. Staff are grouped by Organization and Branch, as in Set up payroll.',
  closing: 'The new pay item and the new group held the run until they were set up, the draft review showed the exact journal by account and dimension, every warning was marked as checked, the journal went for approval with its journal date and posted when the Owner approved it, Mapping used and claims explained the journal, and Payroll payables showed the bank match, an overpayment and a manual journal. To try it yourself, use Reset sample data under View as.',
  steps: runSteps as unknown as TourStep[],
  onReset: reset(groupedByOrganizationAndBranch),
  applyRole,
}

export const PAYROLL_RESEND_TOUR: AssetTour = {
  id: 'payroll-resend',
  code: 'PAY-3',
  name: 'When Talenta sends again',
  persona: 'Accountant + LM, Owner',
  role: 'Accountant + LM' as unknown as ViewAsRole,
  blurb: 'September is posted and paid when Talenta sends it again. Bayu, an Accountant with LM, sees what changed and uses v2 to repost on one journal date; Rizal, the Owner, approves. Then a send with a missing pay item, and the old Expense sync trying to book the same month.',
  closing: 'The second send showed what it changes before anything posted, Use v2 and repost reversed the old journal in full and posted the new one on one date after approval, payables followed the new amount, a missing pay item booked what arrived and warned, and the old sync could not book September twice. To try it yourself, use Reset sample data under View as.',
  steps: resendSteps as unknown as TourStep[],
  onReset: reset(groupedByOrganizationAndBranch),
  applyRole,
}

export const PAYROLL_TOURS: AssetTour[] = [PAYROLL_SETUP_TOUR, PAYROLL_RUN_TOUR, PAYROLL_RESEND_TOUR]

/** The work of each step in order, per tour code, for the spec to replay without a browser. */
export const TOUR_WORK: Record<string, ((() => void) | null)[]> = Object.fromEntries(
  PAYROLL_TOURS.map((t) => [t.code, t.steps.map((s) => s.run ?? null)]),
)

/**
 * Every payroll feature the tours must touch, and the step that touches it (tour code and
 * 1-based step number). tests/payroll-tour.spec.ts fails when a feature names no step, or a
 * step that does not exist.
 */
export const PAYROLL_FEATURES: { feature: string; tour: 'PAY-1' | 'PAY-2' | 'PAY-3'; step: number }[] = [
  { feature: 'Connection status and Talenta company', tour: 'PAY-1', step: 1 },
  { feature: 'How to send from Talenta', tour: 'PAY-1', step: 2 },
  { feature: 'Payable accounts per party', tour: 'PAY-1', step: 3 },
  { feature: 'Pay item type from Talenta, with the header tip', tour: 'PAY-1', step: 4 },
  { feature: 'Map a pay item to any expense account', tour: 'PAY-1', step: 5 },
  { feature: 'Use group account', tour: 'PAY-1', step: 6 },
  { feature: 'Group by Talenta fields', tour: 'PAY-1', step: 7 },
  { feature: 'Talenta field to dimension links', tour: 'PAY-1', step: 8 },
  { feature: 'Group expense account and dimension value', tour: 'PAY-1', step: 9 },
  { feature: 'Approval workflows rule Payroll journal', tour: 'PAY-1', step: 10 },
  { feature: 'View as: View only has no actions', tour: 'PAY-1', step: 11 },
  { feature: 'View as: Accountant needs LM for settings', tour: 'PAY-1', step: 12 },
  { feature: 'Inbox runs', tour: 'PAY-2', step: 1 },
  { feature: 'Sync log', tour: 'PAY-2', step: 2 },
  { feature: 'To fix before posting: unmapped pay item', tour: 'PAY-2', step: 3 },
  { feature: 'Map from the hold; the hold clears', tour: 'PAY-2', step: 4 },
  { feature: 'To fix before posting: New group', tour: 'PAY-2', step: 5 },
  { feature: 'Set up group clears the New group hold', tour: 'PAY-2', step: 6 },
  { feature: 'Draft review lines by account and dimension', tour: 'PAY-2', step: 7 },
  { feature: 'Warnings and Mark as checked', tour: 'PAY-2', step: 8 },
  { feature: 'Month headcount (Owner)', tour: 'PAY-2', step: 9 },
  { feature: 'Journal date: default and locked period', tour: 'PAY-2', step: 10 },
  { feature: 'Send for approval to Inbox, Awaiting approval', tour: 'PAY-2', step: 11 },
  { feature: 'Approve and post', tour: 'PAY-2', step: 12 },
  { feature: 'Journals tab', tour: 'PAY-2', step: 13 },
  { feature: 'Mapping used tab', tour: 'PAY-2', step: 14 },
  { feature: 'Claims', tour: 'PAY-2', step: 15 },
  { feature: 'Payables: bank match pays salary', tour: 'PAY-2', step: 16 },
  { feature: 'Payables: bank payment menu', tour: 'PAY-2', step: 17 },
  { feature: 'Payables: bank differs flag', tour: 'PAY-2', step: 18 },
  { feature: 'Manual journal on Salaries Payable warning', tour: 'PAY-2', step: 19 },
  { feature: 'Simulate Talenta send (inbox menu)', tour: 'PAY-3', step: 2 },
  { feature: 'Talenta sent this period again', tour: 'PAY-3', step: 3 },
  { feature: 'Versions: what changed', tour: 'PAY-3', step: 4 },
  { feature: 'Use v2 and repost on one journal date', tour: 'PAY-3', step: 5 },
  { feature: 'Repost approval', tour: 'PAY-3', step: 6 },
  { feature: 'Old journal reversed, new one posted', tour: 'PAY-3', step: 7 },
  { feature: 'Payables follow the repost', tour: 'PAY-3', step: 8 },
  { feature: 'Missing pay item books and warns', tour: 'PAY-3', step: 9 },
  { feature: 'Old Talenta to Expense sync blocked', tour: 'PAY-3', step: 10 },
]
