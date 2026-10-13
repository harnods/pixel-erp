/**
 * Guided tours for the payroll screens (Payroll to Ledger, Jurnal x Talenta), auto-played:
 * PAY-1 Set up payroll, PAY-2 Monthly payroll run, PAY-3 When Talenta sends again.
 *
 * This is a demo layer for walkthroughs, not a product requirement; engineers
 * building the product should ignore it. The only coupling to product screens
 * is the data-tour="..." attributes they carry. It reuses the asset tour
 * runner, with its own reset and View as (two access types: Owner or LM posts, Other user
 * does everything else and saves the draft).
 *
 * Every step does its own work on Next (run), then opens the screen that
 * shows the result and points at it. The reader only presses Next.
 * tests/payroll-tour.spec.ts replays every step's work after the tour's reset,
 * checks every figure quoted here, and checks that every payroll feature is
 * touched by at least one step (PAYROLL_FEATURES).
 */
import {
  payroll, resetPayroll, setPayrollViewAs, runs, payItemKey, setPayItemAccount,
  setGroupBy, setGroupAccount, setGroupDimension, saveGroup, addGroupDimension, groupDimensions, createPayrollTag, groupRows,
  runWarnings, acknowledgeWarning, postRun, saveDraft, reverseAndRepost, simulateSend,
  simulateBankPayment, simulateManualJournal, payablesTracker, payablePrefill, recordPayablePayment, payrollAccount,
  useChartAccount,
} from '~/data/payrollStore'
import { cashAccounts } from '~/data/cashAccounts'
import { cashTransactions, addCashTx } from '~/data/bankTransactions'
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
/** August's BPJS Kesehatan, left unpaid in the sample data: the payable PAY-2 pays with Pay. */
export const AUG_MONTH = '2026-08'
export const AUG_BPJS_KES = 'BPJS Kesehatan Payable Aug 2026'
/** The cash account Pay picks first on New spend money. */
export const PAY_FROM = 'Bank BCA'
/**
 * New spend money is a Cash management screen, not a payroll one, so it carries no payroll
 * marker: the step opened from Pay points at the form's payable banner by its test id.
 */
export const CASH_FORM_TARGET = 'ctf-payable'

/**
 * Every data-tour marker the payroll tours may point at: the list agreed with the screens
 * (each product screen carries these). A step targets nothing else.
 */
export const PAYROLL_TOUR_MARKERS = [
  'payroll-connection', 'payroll-how-to-send', 'payroll-payable-accounts', 'payroll-payitems', 'payroll-type-tip',
  'payroll-groups-can-change', 'payroll-groupby', 'payroll-group-dims', 'payroll-groups-table', 'payroll-viewas',
  'payroll-inbox-runs', 'payroll-synclog', 'payroll-month-headcount', 'payroll-simulate-send', 'payroll-holds',
  'payroll-warnings', 'payroll-draft-lines', 'payroll-post', 'payroll-save-draft', 'payroll-saved-draft', 'payroll-journal-date', 'payroll-pay-now',
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
const AUG_PAYABLES = `/payroll-payables?month=${AUG_MONTH}`
/** The open August BPJS Kesehatan payable's key ('' once it is gone from the tracker). */
export function augBpjsKey(): string {
  return payablesTracker(AUG_MONTH).find((r) => r.party === 'BPJS Kesehatan')?.key ?? ''
}

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
/**
 * The Account cell of the Insentif Penjualan row (a cost item: "Group's expense account" or a pinned
 * account), else the first cost item's Account cell on the page.
 */
function insentifCostAccount(): HTMLElement | null {
  const row = Array.from(document.querySelectorAll<HTMLElement>('[data-tour="payroll-payitems"] tr'))
    .find((r) => visible(r) && r.innerText.includes(NEW_ITEM))
  const cell = row?.querySelector<HTMLElement>('[data-cost-account]')
  return visible(cell) ? cell : live('payroll-groups-can-change')
}
/**
 * Payroll payables keeps its view (Payables or Payments) and its month filter while the tour only
 * changes the query, so a target can be on the other view or filtered out. Open the view the step
 * needs, else clear the filters, and let the runner's poll anchor next tick.
 */
function onPayables(view: 'Payables' | 'Payments', pick: () => HTMLElement | null | undefined): () => HTMLElement | null {
  return () => {
    const el = pick()
    if (visible(el)) return el
    const seg = Array.from(document.querySelectorAll<HTMLElement>('#pp-view label, #pp-view button, #pp-view [role="radio"], #pp-view span'))
      .find((b) => visible(b) && b.innerText.trim() === view)
    const onView = view === 'Payables' ? !!live('payroll-payables') : !live('payroll-payables') && !!document.querySelector('.pp')
    if (!onView) seg?.click()
    else Array.from(document.querySelectorAll<HTMLElement>('.pp button')).find((b) => visible(b) && b.innerText.trim() === 'Clear filters')?.click()
    return null
  }
}
const payablesMarker = (marker: string) => onPayables('Payables', () => live(marker))
/** The September salary row (the marker sits on the latest salary row the filters leave showing). */
const sepSalaryRow = onPayables('Payables', () => { const el = live('payroll-salary-row'); return el?.innerText.includes(SEP_LABEL) ? el : null })
const payableRow = (label: string) => onPayables('Payables', () =>
  Array.from(live('payroll-payables')?.querySelectorAll<HTMLElement>('tr') ?? []).find((r) => visible(r) && r.innerText.includes(label)))
/** The Spend money payment of August BPJS Kesehatan on the Payments view. */
const spendMoneyPayment = onPayables('Payments', () =>
  Array.from(document.querySelectorAll<HTMLElement>('.pp tr')).find((r) => visible(r) && r.innerText.includes('Spend money') && r.innerText.includes(AUG_BPJS_KES)))
/**
 * The payable banner on Cash management > New spend money. Once the payable is paid (Back from a
 * later step) the form opens blank, so the step points at the form's title instead.
 */
function payableBanner(): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(`[data-testid="${CASH_FORM_TARGET}"]`)
  if (visible(el)) return el
  const title = document.querySelector<HTMLElement>('.detail-title')
  return visible(title) && title.innerText.trim() === 'New spend money' && augBpjsPaid() ? title : null
}
const augBpjsPaid = () => (payablesTracker(AUG_MONTH).find((r) => r.party === 'BPJS Kesehatan')?.balance ?? 1) <= 0

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
  setGroupBy(['organization_name', 'branch'])
}

// PAY-1
/** The new cost item keeps "Group's expense account" (null = follow groups): one save maps it. */
function mapNewItem() { setPayItemAccount(insentif(), null) }
function groupByOrganizationAndBranch() { setGroupBy(['organization_name', 'branch']) }
/** Add dimension: Branch as a Groups column (the sample already has Organization and Branch, so a replay changes nothing). */
function addBranch() { if (!groupDimensions().includes('Branch')) addGroupDimension('Branch') }
function setUpTwoGroups() {
  setGroupAccount(groupKey('Operations, Jakarta HQ'), ACC.directLabour)
  setGroupDimension(groupKey('Human Capital, Surabaya'), 'Branch', 'Jakarta HQ')
}

// PAY-2
/** The hold's account pick preselects "Group's expense account" for a cost item, so one Save clears it. */
function mapFromTheHold() { setPayItemAccount(insentif(), null) }
function talentaSendsANewGroup() { simulateSend('new-group', { runId: sepId() }) }
/**
 * Set up group on the Groups tab: the expense account, then the Branch value Medan, then Set up group.
 * Nothing holds on the way: until Medan exists the draft warns 'no-dimension-value' and posts Branch
 * blank; creating the value fills the group's Branch by name (no explicit pick) and rebuilds the draft.
 */
function setUpNewGroup() {
  const key = groupKey(NEW_GROUP)
  setGroupAccount(key, ACC.directLabour)
  createPayrollTag('Branch', 'Medan')
  saveGroup(key)
}
function markChecked() { markAllChecked(sepId()) }
/** Other user can't post: Save draft keeps September ready for someone who can. */
function otherUserSavesDraft() { saveDraft(sepId()) }
function ownerOrLmPosts() { as('Owner or LM', () => postRun(sepId())) }
function bankPaysSalary() { simulateBankPayment('salary', { runId: sepId(), date: '2026-09-25' }) }
function bankPaysTooMuch() { simulateBankPayment('overpaid', { runId: sepId(), date: '2026-09-26' }) }
function manualJournal() { simulateManualJournal() }
/**
 * Pay on the August BPJS Kesehatan row, then Save on New spend money, as the form does it: a
 * spend money from Bank BCA with one line on the payable account for the open amount, recorded
 * against the payable. A replay reuses the spend money an earlier play saved, so Cash
 * management does not fill up with copies.
 */
function payBpjsFromSpendMoney() {
  const key = augBpjsKey()
  const p = key ? payablePrefill(key) : null
  const cash = cashAccounts.find((a) => a.name === PAY_FROM && !a.isArchived)
  if (!p || !cash) return
  const tx = cashTransactions.find((x) => x.kind === 'withdrawal' && x.memo === p.memo && x.transactionDate === p.date)
    ?? addCashTx('withdrawal', {
      cashAccountId: cash.id, contact: p.payee, transactionDate: p.date, tags: [], priceIncludesTax: false,
      lines: [{ accountCode: p.account, description: p.label, taxId: '', amount: p.amount }], memo: p.memo,
    })
  if (!payrollAccount(cash.code)) useChartAccount({ code: cash.code, name: cash.name, type: 'cash' })
  recordPayablePayment(key, { cashTxId: tx.id, number: `Spend money #${tx.number}`, bank: cash.code, date: p.date, amount: p.amount })
}

// PAY-3
/** September as the monthly run leaves it: mapped, checked, posted, salary paid. */
function septemberPostedAndPaid() {
  setPayItemAccount(insentif(), ACC.salesSalaries)
  markAllChecked(sepId())
  as('Owner or LM', () => postRun(sepId()))
  simulateBankPayment('salary', { runId: sepId(), date: '2026-09-25' })
}
function talentaSendsSeptemberAgain() { simulateSend('revision', { runId: sepId() }) }
function repostV2() { as('Owner or LM', () => reverseAndRepost(sepId())) }
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
    role: 'Owner or LM',
    title: 'Jurnal is connected to Talenta company 1212.',
    body: 'The Owner or a user with LM connects once. From then on HR settles payroll in Talenta and Jurnal books what Talenta sends. Connecting also blocks the old Talenta to Expense sync, so a month is never booked twice.',
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
    title: 'Insentif Penjualan gets its account in one save.',
    body: 'A cost item starts on Group\'s expense account, so saving it is enough. The other side follows the type: an allowance is owed to staff, so it credits Salaries Payable.',
    watch: 'Insentif Penjualan uses the group account and credits 2-20201 Salaries Payable. The September run is ready to post: Rp554.203.941 on 26 lines.',
    placement: 'top',
  },
  {
    route: SETTINGS('pay-items'),
    target: 'payroll-groups-can-change',
    find: insentifCostAccount,
    title: 'Use group account sends a cost item to each group\'s expense account.',
    body: 'On, staff post to their group\'s account, and staff in no group or in a group with no account post to Everyone else, 6-60101 Salaries here. Off, Use default account sends the item to its own account for all staff, as Reimbursement Medical does with 6-60106 Medical Expense. Deductions and tax keep their payable.',
    watch: 'Insentif Penjualan is paid to 7 Sales staff, so it lands on 6-60004 Sales Salaries, the Sales groups\' account, not on Salaries.',
    placement: 'top',
  },
  {
    run: groupByOrganizationAndBranch,
    route: SETTINGS('groups'),
    target: 'payroll-groupby',
    title: 'The Groups tab groups staff by Organization and Branch.',
    body: 'Settings has three tabs: Connection, Pay items and Groups. On Groups, staff are grouped by Talenta fields such as Organization and Branch, never by job position or level, and each combination Talenta has sent becomes a group row with a staff count, never names.',
    watch: '9 groups from the last send. Operations, Jakarta HQ has 10 staff.',
    placement: 'bottom',
  },
  {
    run: addBranch,
    route: SETTINGS('groups'),
    target: 'payroll-group-dims',
    title: 'Add the dimensions you report on.',
    body: 'A dimension is how Jurnal reports cost by department or place. Add dimension puts any Jurnal dimension in the table as a column, and each group picks its value there. A value with the same name as the group\'s Talenta value fills in by itself.',
    watch: 'Organization and Branch are added. Sales, Bandung gets Branch Bandung by name.',
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
    route: SETTINGS('groups'),
    target: 'payroll-viewas',
    role: 'Other user',
    title: 'Payroll has two access types: Owner or LM, and Other user.',
    body: 'The Owner and users with LM post. Anyone else with Payroll is Other user and does everything except posting: map pay items, set up groups, mark warnings as checked and pay payables.',
    watch: 'As Other user, Groups can still be changed.',
    placement: 'bottom',
  },
  {
    run: otherUserSavesDraft,
    route: runRoute(),
    target: 'payroll-saved-draft',
    role: 'Other user',
    title: 'Other user saves the draft for someone who can post.',
    body: 'Save draft takes the place of Post journal. The draft stays Ready to post and the run says who saved it; the Owner and users with LM are told it waits for them.',
    watch: 'Saved by Other user on 5 Oct 2026. Waiting for someone who can post. The draft is Rp554.203.941.',
    placement: 'bottom',
  },
  {
    route: runRoute(),
    target: 'payroll-post',
    role: 'Owner or LM',
    title: 'The Owner or a user with LM posts with Post journal.',
    body: 'There is no approval step: Post journal posts at once on the journal date picked. Other user sees "Only the Owner or a user with LM can post." where the button would be.',
    placement: 'bottom',
  },
]

// ── PAY-2 Monthly payroll run ───────────────────────────────────────────────

const runSteps: PayrollStep[] = [
  {
    route: '/payroll-inbox',
    target: 'payroll-inbox-runs',
    find: rowIn('payroll-inbox-runs', SEP_LABEL),
    title: 'September arrives from Talenta and Jurnal builds it at once.',
    body: 'HR settles payroll in Talenta and sends it. A send stops only when Jurnal cannot book it. July and August are posted; only August\'s BPJS Kesehatan is still unpaid.',
    watch: '21 Aug-20 Sep 2026: 40 staff, take-home pay Rp446.901.849.',
    placement: 'bottom',
  },
  {
    route: '/payroll-inbox?view=log',
    target: 'payroll-synclog',
    title: 'The sync log lists every send Talenta made.',
    body: 'One row per send: when it was received, the period, the version, staff and pay items, and what Jurnal did with it.',
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
    title: 'Other user maps it and the draft journal builds.',
    body: 'The fix starts on Group\'s expense account, so one save maps the item in Pay items and checks the run again. The hold clears on its own.',
    watch: 'Ready to post: Rp554.203.941 on 25 lines.',
    placement: 'top',
  },
  {
    run: talentaSendsANewGroup,
    route: runRoute(),
    target: 'payroll-warnings',
    find: onTab('payroll-warnings', 'Draft'),
    title: 'Talenta sends September again with a new group.',
    body: 'HR moved 2 operations staff to a new Medan branch and sent the period again. v2 becomes the current version. Nothing stops: their cost posts to the Everyone else account until someone sets the group up, and the run warns.',
    watch: 'No group: Operations, Medan with 2 staff.',
    placement: 'bottom',
  },
  {
    run: setUpNewGroup,
    route: SETTINGS('groups'),
    target: 'payroll-groups-table',
    find: rowIn('payroll-groups-table', NEW_GROUP),
    title: 'Other user sets up Operations, Medan.',
    body: 'The group posts to Direct Labour like the other stores. Medan becomes a Branch value, so the group\'s Branch fills in by name, and Set up group saves it. Saving rebuilds the draft and clears the warning.',
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
    body: 'Lines that move more than 10% and Rp1.000.000 are warned. Staff joining, leaving or moving groups warn too. Warnings never stop Post; Other user checks each one and uses Mark as checked.',
    watch: '9 warnings, all marked as checked: 8 lines that moved and a headcount change.',
    placement: 'top',
  },
  {
    route: '/payroll-inbox?view=month',
    target: 'payroll-month-headcount',
    title: 'Month headcount shows who joined, left or moved.',
    body: 'Month headcount compares this month\'s staff with the last posted month, by group, in counts only. Everyone with Payroll sees it.',
    watch: '40 staff in September: 1 joined, 1 left and 3 moved between groups.',
    placement: 'bottom',
  },
  {
    run: otherUserSavesDraft,
    route: runRoute(),
    target: 'payroll-saved-draft',
    title: 'Other user saves the draft instead of posting.',
    body: 'Only the Owner or a user with LM can post. Save draft keeps the journal Ready to post, notes who saved it and tells the Owner and users with LM it waits for them.',
    watch: 'Saved by Other user on 5 Oct 2026. Waiting for someone who can post.',
    placement: 'bottom',
  },
  {
    route: runRoute(),
    target: 'payroll-journal-date',
    find: journalDateField,
    role: 'Owner or LM',
    title: 'Post journal asks for one journal date.',
    body: 'Journal date defaults to the last day of the pay period. A date in a locked period is refused: July is locked.',
    watch: 'Journal date 20 Sep 2026.',
    placement: 'left',
  },
  {
    route: runRoute(),
    target: 'payroll-pay-now',
    find: () => live('payroll-pay-now') ?? journalDateField(),
    role: 'Owner or LM',
    title: 'For each party, record a payable or pay it now.',
    body: 'What this journal owes lists Staff, the tax office, BPJS and DPLK. Record as payable is the default. Paid now picks a bank account and adds a Spend money on the journal date, so that payable shows Paid at once.',
    watch: 'Here every party stays Record as payable; salaries are paid later from the bank.',
    placement: 'left',
  },
  {
    run: ownerOrLmPosts,
    route: runRoute('journals'),
    target: 'payroll-run-journals',
    find: onTab('payroll-run-journals', 'Journals'),
    title: 'The Owner posts and the PAY journal is in the ledger.',
    body: 'Post journal posts at once; there is no approval step. One balanced journal per run. A posted journal is never edited; a later send reverses it and posts again.',
    watch: 'PAY-0003, 20 Sep 2026, Rp554.203.941.',
    placement: 'top',
  },
  {
    route: runRoute('built'),
    target: 'payroll-mapping-used',
    find: onTab('payroll-mapping-used', 'Mapping used'),
    title: 'Mapping used keeps the settings the journal was built from.',
    body: 'Later changes to pay items or groups never change a posted journal. This tab shows which account each pay item went to and which dimension values each group posted.',
    watch: 'Insentif Penjualan uses the group account; its 7 Sales staff went to 6-60004 Sales Salaries.',
    placement: 'top',
  },
  {
    route: runRoute(),
    target: 'payroll-claims',
    role: 'Other user',
    title: 'Claims paid through payroll show apart.',
    body: 'Reimbursements Talenta pays with the salary are listed by account and dimension, so claims are not mistaken for salary cost.',
    watch: 'Reimbursement Medical: Rp3.000.000 for 6 staff on 6-60106 Medical Expense.',
    placement: 'top',
  },
  {
    run: bankPaysSalary,
    route: PAYABLES,
    target: 'payroll-salary-row',
    find: sepSalaryRow,
    title: 'Bank reconciliation matches the salary transfer.',
    body: 'Payroll payables tracks what each party is still owed. A payment arrives when a bank statement line is matched to the payable; it clears Salaries Payable, never an expense.',
    watch: 'Salary 21 Aug-20 Sep 2026: owed Rp446.901.849, paid by BNK-0012 on 25 Sep 2026, balance Rp0.',
    placement: 'bottom',
  },
  {
    run: bankPaysTooMuch,
    route: PAYABLES,
    target: 'payroll-payables-simulate',
    title: 'This menu stands in for a bank statement line.',
    body: 'In Jurnal the line comes from bank reconciliation. Here a second transfer for the September salary arrives and is matched.',
    watch: 'BNK-0013 pays Rp250.000 more on 26 Sep 2026.',
    placement: 'bottom',
  },
  {
    route: PAYABLES,
    target: 'payroll-payables-flags',
    find: payablesMarker('payroll-payables-flags'),
    title: 'The row flags a bank amount that differs from the run.',
    body: 'When the bank paid more or less than the posted run, the payable says so on its row.',
    watch: 'Bank paid Rp447.151.849 against Rp446.901.849: Rp250.000 over.',
    placement: 'bottom',
  },
  {
    route: AUG_PAYABLES,
    target: 'payroll-payables',
    find: payableRow(AUG_BPJS_KES),
    title: 'August BPJS Kesehatan is still owed and past its due date.',
    body: 'Each row shows what a party is owed, its due date and its status. BPJS Kesehatan is due on the 10th of the next month, and no payment has reached the August amount.',
    watch: 'BPJS Kesehatan Payable Aug 2026: Rp16.102.029 still owed, due 10 Sep 2026, Overdue 25 days.',
    placement: 'bottom',
  },
  {
    route: () => `/bank-withdrawals/new?payable=${encodeURIComponent(augBpjsKey())}`,
    target: CASH_FORM_TARGET,
    find: payableBanner,
    title: 'Pay opens Cash management > New spend money, filled in.',
    body: 'Pay is on the row menu of every payable with a balance, and on its details, for both access types. The form arrives with the payee, the payable account and the open amount; nothing is paid until it is saved.',
    watch: 'Pay from Bank BCA to BPJS Kesehatan: one line on 2-20508 BPJS Kesehatan Payable for Rp16.102.029.',
    placement: 'bottom',
  },
  {
    run: payBpjsFromSpendMoney,
    route: AUG_PAYABLES,
    target: 'payroll-payables',
    find: payableRow(AUG_BPJS_KES),
    title: 'Saving the spend money pays the payable.',
    body: 'The spend money debits BPJS Kesehatan Payable and credits the bank, and Payroll payables counts it against the August row.',
    watch: 'BPJS Kesehatan Payable Aug 2026: paid Rp16.102.029, balance Rp0, Paid late, 25 days.',
    placement: 'bottom',
  },
  {
    route: '/payroll-payables?tab=payments',
    target: 'payroll-payables',
    find: spendMoneyPayment,
    title: 'Payments shows where each payment came from.',
    body: 'Source reads Spend money for a payment made with Pay, and Bank reconciliation for a bank line matched to a payable.',
    watch: 'Spend money paid BPJS Kesehatan Payable Aug 2026 Rp16.102.029. BNK-0012 and BNK-0013 came from Bank reconciliation.',
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
    body: 'This is where the monthly run ends: the Owner posted PAY-0003 and bank reconciliation matched the salary transfer.',
    watch: 'PAY-0003, 20 Sep 2026, Rp554.203.941. Salary paid by BNK-0012.',
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
    run: otherUserSavesDraft,
    route: runRoute(),
    target: 'payroll-saved-draft',
    role: 'Other user',
    title: 'Other user saves v2 for someone who can post.',
    body: 'Reposting is posting, so Other user sees Save draft in place of Use v2 and repost. PAY-0003 stays in the ledger until the Owner or a user with LM reposts.',
    watch: 'Saved by Other user on 5 Oct 2026. Waiting for someone who can post.',
    placement: 'bottom',
  },
  {
    route: runRoute(),
    target: 'payroll-repost',
    role: 'Owner or LM',
    title: 'Use v2 and repost replaces the posted journal in full.',
    body: 'Jurnal reverses PAY-0003 in full and posts v2 in full, both on one journal date. The latest version is picked; an older one can be chosen instead.',
    watch: 'Journal date 20 Sep 2026 for both journals. v2 is Rp556.403.741.',
    placement: 'bottom',
  },
  {
    run: repostV2,
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
    find: sepSalaryRow,
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
  persona: 'Owner or LM, Other user',
  role: 'Owner or LM' as unknown as ViewAsRole,
  blurb: 'The Owner checks the Talenta connection, the payable account of each party, the pay items and the groups that decide where cost lands. Then the two access types: Owner or LM posts, Other user does the rest and saves the draft.',
  closing: 'The connection showed where payroll comes from and that the old sync is blocked, each party had its payable account, the new pay item followed the group\'s expense account, staff were grouped by Organization and Branch with Organization and Branch added as dimensions, and two groups got their own account and dimension value. Other user changed settings and saved the draft; only the Owner or a user with LM posts. To try it yourself, use Reset sample data under View as.',
  steps: setupSteps as unknown as TourStep[],
  onReset: reset(),
  applyRole,
}

export const PAYROLL_RUN_TOUR: AssetTour = {
  id: 'payroll-run',
  code: 'PAY-2',
  name: 'Monthly payroll run',
  persona: 'Other user, Owner or LM',
  role: 'Other user' as unknown as ViewAsRole,
  blurb: 'September arrives from Talenta with a pay item no one has mapped, then again with a new group. Other user fixes both, checks the warnings and saves the draft; the Owner posts it on one journal date. Bank reconciliation pays the salary, and Pay settles the overdue August BPJS Kesehatan from Cash management. Staff are grouped by Organization and Branch, as in Set up payroll.',
  closing: 'The new pay item held the run until it was mapped, the new group warned until it was set up, the draft review showed the exact journal by account and dimension, every warning was marked as checked, Other user saved the draft and the Owner posted it with its journal date, Mapping used and claims explained the journal, Payroll payables showed the bank match and an overpayment, Pay settled the overdue August BPJS Kesehatan through New spend money, Payments named each payment\'s source, and a manual journal was warned. To try it yourself, use Reset sample data under View as.',
  steps: runSteps as unknown as TourStep[],
  onReset: reset(groupedByOrganizationAndBranch),
  applyRole,
}

export const PAYROLL_RESEND_TOUR: AssetTour = {
  id: 'payroll-resend',
  code: 'PAY-3',
  name: 'When Talenta sends again',
  persona: 'Owner or LM, Other user',
  role: 'Owner or LM' as unknown as ViewAsRole,
  blurb: 'September is posted and paid when Talenta sends it again. Other user sees what changed and saves v2; the Owner uses v2 to repost on one journal date. Then a send with a missing pay item, and the old Expense sync trying to book the same month.',
  closing: 'The second send showed what it changes before anything posted, Other user saved v2, Use v2 and repost reversed the old journal in full and posted the new one on one date, payables followed the new amount, a missing pay item booked what arrived and warned, and the old sync could not book September twice. To try it yourself, use Reset sample data under View as.',
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
  { feature: "Use group account / Use default account toggle", tour: 'PAY-1', step: 6 },
  { feature: 'Settings > Groups tab', tour: 'PAY-1', step: 7 },
  { feature: 'Group by Talenta fields', tour: 'PAY-1', step: 7 },
  { feature: 'Add dimension to groups, values prefilled by name', tour: 'PAY-1', step: 8 },
  { feature: 'Group expense account and dimension value', tour: 'PAY-1', step: 9 },
  { feature: 'View as: Owner or LM and Other user', tour: 'PAY-1', step: 10 },
  { feature: 'Save draft: Other user keeps the draft for someone who can post', tour: 'PAY-1', step: 11 },
  { feature: 'Post journal: Owner or LM only, no approval', tour: 'PAY-1', step: 12 },
  { feature: 'Inbox runs', tour: 'PAY-2', step: 1 },
  { feature: 'Sync log', tour: 'PAY-2', step: 2 },
  { feature: 'To fix before posting: unmapped pay item', tour: 'PAY-2', step: 3 },
  { feature: 'Map from the hold; the hold clears', tour: 'PAY-2', step: 4 },
  { feature: 'No group warning: new group posts to Everyone else', tour: 'PAY-2', step: 5 },
  { feature: 'Set up group clears the No group warning', tour: 'PAY-2', step: 6 },
  { feature: 'Draft review lines by account and dimension', tour: 'PAY-2', step: 7 },
  { feature: 'Warnings and Mark as checked', tour: 'PAY-2', step: 8 },
  { feature: 'Month headcount', tour: 'PAY-2', step: 9 },
  { feature: 'Saved by note on the run', tour: 'PAY-2', step: 10 },
  { feature: 'Journal date: default and locked period', tour: 'PAY-2', step: 11 },
  { feature: 'Pay now or record as payable, per party', tour: 'PAY-2', step: 12 },
  { feature: 'Post journal posts at once', tour: 'PAY-2', step: 13 },
  { feature: 'Journals tab', tour: 'PAY-2', step: 13 },
  { feature: 'Mapping used tab', tour: 'PAY-2', step: 14 },
  { feature: 'Claims', tour: 'PAY-2', step: 15 },
  { feature: 'Payables: bank match pays salary', tour: 'PAY-2', step: 16 },
  { feature: 'Payables: bank payment menu', tour: 'PAY-2', step: 17 },
  { feature: 'Payables: bank differs flag', tour: 'PAY-2', step: 18 },
  { feature: 'Payables: overdue statutory payable', tour: 'PAY-2', step: 19 },
  { feature: 'Pay opens New spend money prefilled', tour: 'PAY-2', step: 20 },
  { feature: 'Saving the spend money pays the payable', tour: 'PAY-2', step: 21 },
  { feature: 'Payments: Source column', tour: 'PAY-2', step: 22 },
  { feature: 'Manual journal on Salaries Payable warning', tour: 'PAY-2', step: 23 },
  { feature: 'Simulate Talenta send (inbox menu)', tour: 'PAY-3', step: 2 },
  { feature: 'Talenta sent this period again', tour: 'PAY-3', step: 3 },
  { feature: 'Versions: what changed', tour: 'PAY-3', step: 4 },
  { feature: 'Save draft of a new version', tour: 'PAY-3', step: 5 },
  { feature: 'Use v2 and repost on one journal date', tour: 'PAY-3', step: 6 },
  { feature: 'Old journal reversed, new one posted', tour: 'PAY-3', step: 7 },
  { feature: 'Payables follow the repost', tour: 'PAY-3', step: 8 },
  { feature: 'Missing pay item books and warns', tour: 'PAY-3', step: 9 },
  { feature: 'Old Talenta to Expense sync blocked', tour: 'PAY-3', step: 10 },
]
