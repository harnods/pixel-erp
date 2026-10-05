/**
 * Guided tour for the budget screens: the PRD product narrative, one tour.
 *
 * This is a demo layer for walkthroughs, not a product requirement; engineers
 * building the product should ignore it. The only coupling to product screens
 * is the data-tour="..." attributes they carry. It reuses the asset tour
 * runner, with its own reset and View as.
 *
 * Every figure quoted here is pinned by tests/advanced-budgeting-tour.spec.ts,
 * which replays the same steps through the store after resetBudget().
 */
import { resetBudget, setBudgetViewAs } from '~/data/budgetStore'
import type { BudgetRole } from '~/data/budgetMaster'
import type { AssetTour, TourStep } from './assetTours'
import type { ViewAsRole } from '~/data/assetStore'

type BudgetStep = Omit<TourStep, 'role'> & { role?: BudgetRole }

/** After resetBudget(), the cable line (Networking × Project A × Fiber Optic Cable) is bl4. */
export const CABLE_LINE_ID = 'bl4'

const steps: BudgetStep[] = [
  {
    route: '/purchase-requests/new',
    target: 'pr-budget-panel',
    role: 'Requester',
    title: 'Raise a hotel request for the splicing crew.',
    body: 'The budget panel reads the line as you type: budget, what approved requests reserve, what POs commit, what invoices spent, and what is left.',
    action: 'Fill Procurement staff with Andi Saputra. Add any product, quantity 1, unit cost 45.000.000. Set Department Networking, Project Project A, Budget account 6-60120 Accommodation.',
    watch: 'Available for the year is Rp30.000.000. Budget minus invoices would say Rp75.000.000, but two approved requests and an open PO already hold Rp45.000.000. The panel turns red: short Rp15.000.000.',
    placement: 'top',
  },
  {
    target: 'pr-block-banner',
    title: 'Submit, and the request stops before any money is promised.',
    body: 'The year check blocks; the request stays a draft. The way out is on the same screen.',
    action: 'Select Submit for approval. Then select Request funds.',
    ifMissing: 'Select Submit for approval to see the block.',
    watch: 'Not enough budget. Short Rp15.000.000.',
    placement: 'bottom',
  },
  {
    target: 'funding-donors',
    title: 'The funding request fills in the gap and suggests donors.',
    body: 'Suggestions come from the same department and class, using money that is free and not planned for later months.',
    action: 'Pick Networking × Project A × Meals & Transport. Keep the amount at 15.000.000, pick reason code Unplanned site work, type a reason, then select Submit.',
    watch: 'Meals & Transport shows Rp40.000.000 free. The side panel shows the most it can give and the chain: one approver, the Networking budget holder.',
    ifMissing: 'Select Request funds on the blocked request to open the funding request.',
    placement: 'top',
  },
  {
    target: 'change-chain',
    title: 'A small move inside one department needs one approver.',
    body: 'Under Rp50.000.000 in 30 days and inside Networking, so the full chain is skipped. Submitting already held the Rp15.000.000 on Meals & Transport.',
    watch: 'Dimas Pratama, Budget holder, Networking, is the only step.',
    placement: 'top',
  },
  {
    target: 'change-approve',
    role: 'Budget holder (Networking)',
    title: 'The budget holder approves.',
    body: 'Approval posts a new budget version and re-submits the blocked request by itself.',
    action: 'Select Approve.',
    ifMissing: 'Open the funding request from Budget changes, then select Approve.',
    placement: 'bottom',
  },
  {
    target: 'change-version',
    title: 'The move posts as a version.',
    body: 'Budget changes never overwrite a figure. Each one is a version with a reason, a requester and an approver.',
    watch: 'Posted as Version 3.',
    placement: 'bottom',
  },
  {
    route: '/purchase-requests?tab=Awaiting+approval',
    target: 'pr-approve',
    role: 'Line Manager',
    title: 'The request is back in the approval queue.',
    body: 'Pending requests show beside the balance but do not reduce it. Money is held at final approval.',
    action: 'Select Approve on the hotel request at the top of the queue.',
    placement: 'bottom',
  },
  {
    target: 'pr-approve',
    role: 'Budget holder (Networking)',
    title: 'Final approval holds the money.',
    body: 'The check runs again at the last step, so two requests racing for the same rupiah cannot both pass.',
    action: 'Select Approve on the same request, still at the top.',
    watch: 'The request leaves the queue. Rp45.000.000 is now reserved, and the line has Rp0 available.',
    ifMissing: 'The request has already been approved. Select Next.',
    placement: 'bottom',
  },
  {
    route: '/commitments',
    target: 'po-close-line',
    role: 'Procurement Officer',
    title: 'The cable PO finished short.',
    body: 'PO-2026-0412 ordered Rp250.000.000 of cable; Rp200.000.000 arrived and was invoiced. The rest still holds budget nobody will spend.',
    action: 'Open the menu on PO-2026-0412 and select Close line, reason Short delivery.',
    watch: 'Rp50.000.000 frees to the cable line.',
    placement: 'bottom',
  },
  {
    route: `/budget-changes/new?kind=Saving%20fill&from=${CABLE_LINE_ID}`,
    target: 'change-submit',
    role: 'Budget Controller',
    title: 'Move the leftover to the saving bucket.',
    body: 'Savings leave the department and go into a pool only the CFO can spend, tagged by where they came from.',
    action: 'Amount 50.000.000, type Completion, source document PO-2026-0412, a reason, then Submit.',
    watch: 'The tag reads Networking · Project A · Capex. The chain is the CFO alone.',
    placement: 'top',
  },
  {
    target: 'change-approve',
    role: 'CFO',
    title: 'The CFO approves the fill.',
    action: 'Select Approve.',
    body: 'Every fill names its source, and the same PO cannot fill the bucket twice.',
    ifMissing: 'Open the saving fill from Budget changes, then select Approve.',
    placement: 'bottom',
  },
  {
    route: '/saving-bucket',
    target: 'saving-slices',
    title: 'The bucket shows savings by source.',
    body: 'The bucket is budget, not money: it posts no journal and nothing can be bought on it. Only a draw approved by the CFO moves it back to a line.',
    watch: 'Two slices: Rp8.000.000 procurement saving (Opex) and Rp50.000.000 completion saving (Capex). Balance Rp58.000.000.',
    placement: 'top',
  },
  {
    route: '/budget-report?period=year',
    target: 'report-table',
    role: 'Budget Controller',
    title: 'One report, the same ledger as the check.',
    body: 'Budget, money moved in and out, reserved, committed, actual, available and saving, for any mix of department, project and account. This view is the full year.',
    watch: 'Networking × Project A × Accommodation: budget Rp255.000.000, Rp25.000.000 moved in (March transfer and the funding request), reserved Rp65.000.000, committed Rp25.000.000, actual Rp165.000.000, available Rp0.',
    placement: 'top',
  },
  {
    target: 'report-tieout',
    title: 'Each night the ledger ties to the general ledger.',
    body: 'Spend with no budget line and reclass journals show on their own rows, so the total still ties.',
    action: 'Select Run tie-out now.',
    watch: 'Tie-out passed: the budget ledger matches the general ledger.',
    placement: 'bottom',
  },
]

export const BUDGET_TOUR: AssetTour = {
  id: 'budget-narrative',
  code: 'BUD-1',
  name: 'From a blocked request to a saving',
  persona: 'Requester, approvers, Budget Controller, CFO',
  role: 'Requester' as unknown as ViewAsRole,
  blurb: 'A hotel request is blocked, funded from a line with free money in one step, approved and held; a short PO frees money into the saving bucket; the report ties.',
  closing: 'The check read the real balance, the block opened a funding request, a one-approver move posted a version and re-submitted the request, final approval held the money, a short PO freed Rp50.000.000 into the saving bucket under the CFO, and the report tied to the general ledger.',
  steps: steps as unknown as TourStep[],
  onReset: resetBudget,
  applyRole: (role: string) => setBudgetViewAs(role as BudgetRole),
}
