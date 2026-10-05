/**
 * Guided tour for the budget screens: the PRD product narrative, auto-played.
 *
 * This is a demo layer for walkthroughs, not a product requirement; engineers
 * building the product should ignore it. The only coupling to product screens
 * is the data-tour="..." attributes they carry. It reuses the asset tour
 * runner, with its own reset and View as.
 *
 * Every step does its own work on Next (run), then opens the screen that
 * shows the result and points at it. The reader only presses Next.
 * tests/advanced-budgeting-tour.spec.ts runs every step's work after
 * resetBudget() and checks the figures quoted here.
 */
import {
  budget, resetBudget, setBudgetViewAs, findLine, createPR, submitPR, approvePR, raiseFundingRequest,
  submitChange, approveChange, closePOLine, fillSaving, runTieOut,
} from '~/data/budgetStore'
import { addPurchaseRequest } from '~/data/purchaseRequests'
import type { BudgetRole } from '~/data/budgetMaster'
import type { AssetTour, TourStep } from './assetTours'
import type { ViewAsRole } from '~/data/assetStore'

type BudgetStep = Omit<TourStep, 'role'> & { role?: BudgetRole }

/** Ids the steps hand to each other within one run. */
export const tourCtx = { prId: '', recordId: '', frId: '', fillId: '' }

const jt = 1_000_000
const line = (a: string, d: string, p: string | null) => findLine(a, d, p)?.id ?? ''
const ACC = () => line('6-60120', 'NW', 'PA')
const MEALS = () => line('6-60103', 'NW', 'PA')
const CABLE = () => line('1-17010', 'NW', 'PA')

/** The visible table row that contains `text` (steps that point at one row). */
function rowWith(text: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>('tr'))
    .filter((r) => r.innerText.includes(text) && r.getClientRects().length > 0).pop() ?? null
}
function live(marker: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${marker}"]`))
    .filter((el) => el.getClientRects().length > 0).pop() ?? null
}

// ── The work each step does ─────────────────────────────────────────────────

function raiseRequest() {
  const rec = addPurchaseRequest({
    date: '2026-10-05', procurementStaff: 'Andi Saputra', requiredDate: '2026-10-12', status: 'open', totalProducts: 1, urgency: 'high',
    lines: [{ product: 'Hotel, splicing crew October', sku: '', description: 'Bekasi fiber ring, 15 rooms', requestedQty: 1, availableQty: 0, unit: 'Lot', unitCost: 45 * jt, taxLabel: 'PPN 11%' }],
  })
  const pr = createPR({ requester: 'Andi Saputra', date: '2026-10-05', purchaseRequestId: rec.id, number: `#${rec.number}`,
    lines: [{ account: '6-60120', dept: 'NW', project: 'PA', amount: 45 * jt, description: 'Hotel, splicing crew October' }] })
  tourCtx.prId = pr.id
  tourCtx.recordId = rec.id
}
function submitRequest() { submitPR(tourCtx.prId) }
function requestFunds() {
  const fr = raiseFundingRequest(tourCtx.prId)
  fr.donor = { lineId: MEALS(), amount: 15 * jt }
  fr.reasonCode = 'Unplanned site work'
  fr.reason = 'Crew extended in Bekasi for October'
  tourCtx.frId = fr.id
}
function submitFunding() { submitChange(tourCtx.frId) }
function holderApproves() { approveChange(tourCtx.frId, 'Dimas Pratama') }
function lineManagerApproves() { approvePR(tourCtx.prId) }
function finalApproval() { approvePR(tourCtx.prId) }
function closeCablePO() {
  const po = budget.pos.find((p) => p.number === 'PO-2026-0412')
  if (po && !po.lines[0]!.closed) closePOLine(po.id, 0, 'Short delivery')
}
function fillBucket() {
  const c = fillSaving({ fromLineId: CABLE(), amount: 50 * jt, type: 'Completion', sourceDoc: 'PO-2026-0412', reason: 'Cable PO closed short' })
  submitChange(c.id)
  tourCtx.fillId = c.id
}
function cfoApproves() { approveChange(tourCtx.fillId, 'Hendra Gunawan') }
function tieOut() { runTieOut() }

// ── Steps ───────────────────────────────────────────────────────────────────

const steps: BudgetStep[] = [
  {
    route: () => `/budget-lines/${ACC()}`,
    target: 'budget-line-stats',
    role: 'Budget Controller',
    title: 'Start with one budget line.',
    body: 'Networking × Project A × Accommodation is the hotel budget for the Bekasi fiber ring. A line keeps the budget, what approved requests reserve, what open POs commit, and what invoices spent.',
    watch: 'Budget Rp240.000.000, actual Rp165.000.000. Budget minus invoices would say Rp75.000.000 is left, but approved requests and an open PO already hold Rp45.000.000. Only Rp30.000.000 is available.',
    placement: 'bottom',
  },
  {
    run: raiseRequest,
    route: () => `/purchase-requests/${tourCtx.recordId}/edit`,
    target: 'pr-budget-panel',
    role: 'Requester',
    title: 'Andi asks for Rp45.000.000 of hotel rooms.',
    body: 'The tour filled in the request for him. The budget panel on the form reads the line while he types.',
    watch: 'The line would be short after this request. The panel turns red and names the gap: Rp15.000.000.',
    placement: 'top',
  },
  {
    run: submitRequest,
    route: () => `/purchase-requests/${tourCtx.recordId}`,
    target: 'pr-block-banner',
    title: 'He submits, and the request is blocked.',
    body: 'The year check stops it before any money is promised. The request stays a draft, and the way out is on the same screen: Request funds.',
    watch: 'Not enough budget. Short Rp15.000.000.',
    placement: 'bottom',
  },
  {
    run: requestFunds,
    route: () => `/budget-changes/new?edit=${tourCtx.frId}`,
    target: 'funding-donors',
    title: 'Request funds opens a funding request with the gap filled in.',
    body: 'The system suggests donor lines in the same department and class, using money that is free and not planned for later months. The tour picked the first one.',
    watch: 'Meals & Transport on the same project has Rp40.000.000 free. The side panel shows the most it can give.',
    placement: 'top',
  },
  {
    run: submitFunding,
    route: () => `/budget-changes/${tourCtx.frId}`,
    target: 'change-chain',
    title: 'Submitted. A small move needs one approver.',
    body: 'The move stays inside Networking and is under Rp50.000.000 in 30 days, so it skips the full chain. Submitting already set the Rp15.000.000 aside on Meals & Transport, so nobody else can spend it in the meantime.',
    watch: 'One step: Dimas Pratama, Budget holder, Networking.',
    placement: 'top',
  },
  {
    run: holderApproves,
    route: () => `/budget-changes/${tourCtx.frId}`,
    target: 'change-version',
    role: 'Budget holder (Networking)',
    title: 'Dimas approves. The move posts as a new budget version.',
    body: 'A budget never changes in place. Each move is a version with its reason, requester and approver. The approval also sent Andi\'s request back for approval on its own.',
    watch: 'Posted as Version 3.',
    placement: 'bottom',
  },
  {
    run: lineManagerApproves,
    route: () => `/purchase-requests/${tourCtx.recordId}`,
    target: 'pr-budget-card',
    role: 'Line Manager',
    title: 'The line manager approves the request.',
    body: 'A request waiting for approval shows beside the balance but does not reduce it. Money is held only at the final step.',
    watch: 'Budi Hartono approved. It now waits for Dimas Pratama.',
    placement: 'top',
  },
  {
    run: finalApproval,
    route: () => `/purchase-requests/${tourCtx.recordId}`,
    target: 'pr-budget-card',
    role: 'Budget holder (Networking)',
    title: 'Final approval holds the money.',
    body: 'The check runs again at the last step, so two requests racing for the same money cannot both pass.',
    watch: 'Approved. Rp45.000.000 is held by this request, and the line has Rp0 available.',
    placement: 'top',
  },
  {
    run: closeCablePO,
    route: () => `/budget-lines/${CABLE()}`,
    target: 'budget-line-ledger',
    role: 'Procurement Officer',
    title: 'Elsewhere, a cable PO finished short and was closed.',
    body: 'PO-2026-0412 ordered Rp250.000.000 of cable, but only Rp200.000.000 arrived and was invoiced. Closing the line freed the rest instead of leaving it held.',
    watch: 'The cable line\'s ledger shows "Closed: Short delivery", minus Rp50.000.000 committed.',
    placement: 'top',
  },
  {
    run: fillBucket,
    route: () => `/budget-changes/${tourCtx.fillId}`,
    target: 'change-chain',
    role: 'Budget Controller',
    title: 'Rina moves the leftover to the saving bucket.',
    body: 'Savings leave the department and go into one pool that only the CFO can spend, tagged with where they came from.',
    watch: 'A Rp50.000.000 completion saving from the cable line, source PO-2026-0412. It goes to the CFO alone.',
    placement: 'top',
  },
  {
    run: cfoApproves,
    route: '/saving-bucket',
    target: 'saving-slices',
    role: 'CFO',
    title: 'The CFO approves. The bucket shows savings by source.',
    body: 'The bucket is budget, not money: it posts no journal and nothing can be bought on it. Only a draw the CFO approves moves it back to a line.',
    watch: 'Rp50.000.000 completion saving (Capex) plus Rp8.000.000 procurement saving (Opex) from June. Balance Rp58.000.000.',
    placement: 'top',
  },
  {
    route: '/budget-report?period=year',
    target: 'report-table',
    find: () => rowWith('6-60120 · Networking · Project A'),
    role: 'Budget Controller',
    title: 'Month-end: one report, read from the same ledger as the check.',
    body: 'Budget, money moved in and out, reserved, committed, actual, available and saving, for any mix of department, project and account. This view is the full year.',
    watch: 'Accommodation on Project A: budget Rp255.000.000, Rp25.000.000 moved in (a March transfer and today\'s funding request), reserved Rp65.000.000, committed Rp25.000.000, actual Rp165.000.000, available Rp0.',
    placement: 'bottom',
  },
  {
    run: tieOut,
    route: '/budget-report?period=year',
    target: 'report-tieout',
    find: () => live('report-noline') ?? live('report-tieout'),
    title: 'Each night the budget ledger is checked against the general ledger.',
    body: 'The check passes or fails on the total. Spend on a mix with no budget line does not fail it, but it is listed every morning so Finance can add a line or move the cost.',
    watch: 'Tie-out passed with a difference of Rp0. One spend with no budget line: Rp4.000.000 on Operations × Project A × Office Supplies (PI-2026-0790), with Add a line.',
    placement: 'bottom',
  },
]

export const BUDGET_TOUR: AssetTour = {
  id: 'budget-narrative',
  code: 'BUD-1',
  name: 'From a blocked request to a saving',
  persona: 'Requester, approvers, Budget Controller, CFO',
  role: 'Budget Controller' as unknown as ViewAsRole,
  blurb: 'Press Next and the tour does each step for you, then shows the screen with the result. A hotel request is blocked, funded in one step, approved and held; a short PO frees money into the saving bucket; the report ties to the general ledger.',
  closing: 'The check read the real balance, the block opened a funding request, a one-approver move posted a version and sent the request back for approval, final approval held the money, a short PO freed Rp50.000.000 into the saving bucket under the CFO, and the report tied to the general ledger. To try it yourself, use Reset sample data under View as.',
  steps: steps as unknown as TourStep[],
  onReset: () => {
    Object.assign(tourCtx, { prId: '', recordId: '', frId: '', fillId: '' })
    resetBudget()
  },
  applyRole: (role: string) => setBudgetViewAs(role as BudgetRole),
}

/** The work of each step in order, for the spec to replay without a browser. */
export const TOUR_WORK = steps.map((s) => s.run ?? null)
