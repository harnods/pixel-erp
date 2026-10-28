/**
 * Guided tours for the Project accounting screens: PA-1 to PA-3, auto-played.
 *
 * This is a demo layer for walkthroughs, not a product requirement; engineers
 * building the product should ignore it. The only coupling to product screens
 * is the data-tour="..." attributes they carry. It reuses the asset tour
 * runner, with its own reset. Approvals follow Settings › Approval workflows:
 * the steps submit as the project manager and decide as the approver (Rizal
 * Candra) by name, so they never depend on the header's View as.
 *
 * Every step does its own work on Next (run), then opens the screen that
 * shows the result and points at it. The reader only presses Next.
 * tests/project-tours.spec.ts runs every step's work after
 * resetProjectAccounting() and checks the figures quoted here.
 */
import {
  findEngagement, saveInvoice, recordPayment, decideEntries, readyToInvoice, entryFinal,
  addAddendum, addScopeMilestone, submitMilestoneVerification, approveRequest, approvalFor, TODAY,
} from '~/data/projectAccounting'
import { resetProjectAccounting } from '~/data/projectAccountingTourWork'
import type { AssetTour, TourStep } from './assetTours'
import type { ViewAsRole } from '~/data/assetStore'

/** Ids the steps hand to each other within one run. */
export const tourCtx = { invoiceId: '', voId: '', approvalId: '' }

/** Who submits and who decides, as in the sample data and Settings › Approval workflows. */
const PM = 'Rina Wulandari'
const APPROVER = 'Rizal Candra'

const WAREHOUSE = 'e7'
const AUDIT = 'e1'
const TERRACE = 'e5'

const tab = (id: string, key: string) => `/project-accounting/${id}?tab=${key}`

/** The visible table row that contains `text` (steps that point at one row). */
function rowWith(text: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>('tr'))
    .filter((r) => r.innerText.includes(text) && r.getClientRects().length > 0).pop() ?? null
}

/** Audit cost lines picked by what the work was, not by position. */
function auditLines(match: (description: string) => boolean): string[] {
  return (findEngagement(AUDIT)?.entries ?? []).filter((x) => !x.decision && match(x.description)).map((x) => x.id)
}
const isOpeningBalance = (d: string) => d.includes('opening balance testing')
const isSchedulePrep = (d: string) => d.includes('schedule preparation')

/** The live element for a marker, skipping copies that are not laid out. */
function live(marker: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${marker}"]`))
    .filter((el) => el.getClientRects().length > 0).pop() ?? null
}

function lastVo(id: string): string {
  const e = findEngagement(id)
  return e?.vos[e.vos.length - 1]?.id ?? ''
}

// ── PA-1: earn by milestone, then bill it ───────────────────────────────────

function submitFabrication() {
  const res = submitMilestoneVerification(WAREHOUSE, 'm1', { date: TODAY, verifiedBy: 'Site inspector', document: 'BAST-014.pdf' }, PM)
  tourCtx.approvalId = res.status === 'pending' ? res.approval.id : ''
}
function approveFabrication() { if (tourCtx.approvalId) approveRequest(WAREHOUSE, tourCtx.approvalId, APPROVER) }
function invoiceFabrication() {
  const e = findEngagement(WAREHOUSE)
  const m = e?.milestones?.find((x) => x.id === 'm1')
  if (!e || !m || !m.verified || m.invId) return
  const inv = saveInvoice({ engId: WAREHOUSE, kind: 'output', label: m.label, milestoneId: m.id, entryIds: null, date: TODAY, amount: m.recognized })
  tourCtx.invoiceId = inv?.id ?? ''
}
function collectFabrication() { if (tourCtx.invoiceId) recordPayment(WAREHOUSE, tourCtx.invoiceId) }

const pa1: TourStep[] = [
  {
    route: '/project-accounting',
    target: 'pa-portfolio',
    find: () => rowWith('Cikarang Warehouse Construction'),
    title: 'The project list opens on every project and its method.',
    body: 'Every project shows how it earns revenue, because the method is part of the contract, not a reporting choice. The warehouse earns by milestones: money spent on it earns nothing until a milestone is signed off.',
    watch: 'Cikarang Warehouse Construction, Milestones: Rp0,00 revenue recognized, although 44% of the budget is spent (Rp815.000.000,00 of Rp1.850.000.000,00).',
    placement: 'bottom',
  },
  {
    route: tab(WAREHOUSE, 'setup'),
    target: 'pa-contract-milestones',
    title: 'The contract fixes what each milestone is worth.',
    body: 'The contract value and the milestone weights are set when the project is created and are never edited in place. A change goes through an addendum that an approver decides.',
    watch: 'Contract value Rp2.400.000.000,00 split 40%, 30% and 30%: Fabrication complete Rp960.000.000,00, Delivery to site Rp720.000.000,00, Installation & commissioning Rp720.000.000,00. None verified yet.',
    placement: 'top',
  },
  {
    route: tab(WAREHOUSE, 'execution'),
    target: 'pa-cost-lines',
    title: 'Costs arrive from the purchase and expense documents.',
    body: 'Nobody types cost into the project. Any purchase or expense line tagged to it appears here, and the budget variance follows.',
    watch: 'Structural steel Rp420.000.000,00 (PO-0398), roof truss fabrication Rp310.000.000,00 (PO-0410) and crane rental Rp85.000.000,00 (EXP-1174). Total cost incurred Rp815.000.000,00. Budget variance Rp1.035.000.000,00 under the Rp1.850.000.000,00 budgeted cost.',
    placement: 'top',
  },
  {
    run: submitFabrication,
    route: tab(WAREHOUSE, 'recognition'),
    target: 'pa-output-milestones',
    title: 'The site inspector signs off, and Rina submits the verification.',
    body: 'On this warehouse a Settings rule sends every milestone verification to an approver first. Until Rizal Candra decides it, nothing is recognized and the milestone cannot be invoiced.',
    watch: 'Fabrication complete reads Pending approval, Milestone Verification Rule 001, submitted by Rina Wulandari. Revenue recognized is still Rp0,00.',
    placement: 'top',
  },
  {
    run: approveFabrication,
    route: tab(WAREHOUSE, 'recognition'),
    target: 'pa-output-milestones',
    title: 'Rizal Candra approves, and fabrication is verified.',
    body: 'Approving is the act that earns revenue: the milestone decides the amount, nobody estimates it. Nothing is sent to the customer yet, and the verification can still be reversed until the invoice is raised.',
    watch: 'Fabrication complete reads Awaiting invoice at Rp960.000.000,00. Milestones verified 1 of 3, revenue recognized Rp960.000.000,00.',
    placement: 'top',
  },
  {
    route: `/project-accounting/invoice/new?project=${WAREHOUSE}&kind=output&label=Fabrication%20complete&milestone=m1`,
    target: 'pa-invoice-context',
    title: 'Create invoice opens the invoice already filled in.',
    body: 'The verified milestone becomes the invoice line, tagged to the project. The strip above shows where the invoice sits against the contract before it is saved.',
    watch: 'Contract value Rp2.400.000.000,00. Revenue recognized Rp960.000.000,00. Billed to date Rp0,00. This invoice Rp960.000.000,00.',
    placement: 'bottom',
  },
  {
    run: invoiceFabrication,
    route: tab(WAREHOUSE, 'billing'),
    target: 'pa-invoices',
    title: 'The invoice is saved against the project.',
    body: 'Billing now matches what was earned. Nothing is unbilled, and nothing was billed ahead of the work. The verification is locked now that it is invoiced.',
    watch: 'Fabrication complete, Rp960.000.000,00, Unpaid. Billed to date Rp960.000.000,00. Up to date: billing matches revenue.',
    placement: 'top',
  },
  {
    run: collectFabrication,
    route: tab(WAREHOUSE, 'billing'),
    target: 'pa-invoices',
    title: 'The customer pays, and the payment is recorded.',
    body: 'The three figures show where each job stands because collected cash is tracked apart from revenue and billing.',
    watch: 'The invoice reads Paid 03 Aug 2026. Cash collected Rp960.000.000,00.',
    placement: 'top',
  },
  {
    route: tab(WAREHOUSE, 'closed'),
    target: 'pa-margin',
    title: 'Project health shows the margin so far and what blocks closing.',
    body: 'Margin is revenue recognized less cost incurred. The gate below says what still stands between the job and closing it.',
    watch: 'Margin to date Rp145.000.000,00, 15,1% of revenue recognized. The gate reads Not ready to close: Approve or reject every pending addendum before closing.',
    placement: 'bottom',
  },
]

// ── PA-2: cost plus margin, one review decision at a time ──────────────────

function billRecentLines() { decideEntries(AUDIT, auditLines((d) => !isOpeningBalance(d) && !isSchedulePrep(d)), 'bill') }
function chargeAtCost() { decideEntries(AUDIT, auditLines(isOpeningBalance), 'atcost') }
function dontCharge() { decideEntries(AUDIT, auditLines(isSchedulePrep), 'absorb') }
function invoiceReviewed() {
  const e = findEngagement(AUDIT)
  if (!e) return
  const lines = readyToInvoice(e)
  if (!lines.length) return
  const inv = saveInvoice({ engId: AUDIT, kind: 'tm', label: 'Progress billing', milestoneId: null, entryIds: lines.map((x) => x.id), date: TODAY, amount: lines.reduce((a, x) => a + entryFinal(x), 0) })
  tourCtx.invoiceId = inv?.id ?? ''
}
function collectAudit() { if (tourCtx.invoiceId) recordPayment(AUDIT, tourCtx.invoiceId) }

const pa2: TourStep[] = [
  {
    route: tab(AUDIT, 'recognition'),
    target: 'pa-stats',
    title: 'On the audit, cost is not revenue until someone reviews it.',
    body: 'Financial Statement Audit 2025 earns by Cost plus margin: the customer pays the cost of the work plus a 20% margin, but only on lines someone has reviewed.',
    watch: 'Cost incurred Rp16.800.000,00 on 5 cost lines. Awaiting review Rp20.160.000,00 at cost plus margin, of which Rp7.872.000,00 is older than 60 days. Revenue recognized Rp0,00.',
    placement: 'bottom',
  },
  {
    run: billRecentLines,
    route: tab(AUDIT, 'recognition'),
    target: 'pa-tm-summary',
    title: 'The three recent lines are charged at cost plus margin.',
    body: 'Charge cost + margin is the normal decision and needs no reason. Each reviewed line becomes revenue at once.',
    watch: 'Revenue recognized to date Rp12.288.000,00. Rp7.872.000,00 is still awaiting review: the two lines older than 60 days.',
    placement: 'bottom',
  },
  {
    run: chargeAtCost,
    route: tab(AUDIT, 'recognition'),
    target: 'pa-review-queue',
    title: 'Opening balance testing, 85 days old, is charged at cost only.',
    body: 'Old work is hard to put in front of a customer at full price. Charge at cost only waives the margin and needs a reason.',
    watch: 'The line earns Rp4.560.000,00 instead of Rp5.472.000,00. One line is left in the queue: schedule preparation, 105 days, Rp2.400.000,00.',
    placement: 'top',
  },
  {
    run: dontCharge,
    route: tab(AUDIT, 'recognition'),
    target: 'pa-tm-summary',
    title: 'Schedule preparation is not charged to the customer.',
    body: 'Waive charge keeps the cost on the project but earns nothing from it. It needs a reason too, and it never reaches an invoice.',
    watch: 'All cost lines reviewed. Revenue recognized to date Rp16.848.000,00 against Rp20.160.000,00 if every line had been charged in full.',
    placement: 'bottom',
  },
  {
    route: tab(AUDIT, 'billing'),
    target: 'pa-ready-invoice',
    title: 'Reviewed lines wait here to be invoiced.',
    body: 'Only lines charged to the customer are ready to invoice. The line that is not charged stays off the invoice.',
    watch: '4 cost lines · Rp16.848.000,00 ready to invoice.',
    placement: 'bottom',
  },
  {
    route: `/project-accounting/invoice/new?project=${AUDIT}&kind=tm&label=Progress%20billing`,
    target: 'pa-invoice-lines',
    title: 'Create invoice fills one line per reviewed cost line.',
    body: 'Each line carries the amount the review decided, tagged to the project. The invoice and the revenue agree line by line.',
    watch: 'Four lines. This invoice Rp16.848.000,00, against a Fee estimate of Rp115.200.000,00: the Rp96.000.000,00 budgeted cost plus the 20% margin.',
    placement: 'top',
  },
  {
    run: invoiceReviewed,
    route: tab(AUDIT, 'billing'),
    target: 'pa-invoices',
    title: 'The progress invoice is saved.',
    body: 'Invoiced lines leave the ready-to-invoice list. The same work cannot be billed twice.',
    watch: 'Progress billing, Rp16.848.000,00, Unpaid. Ready to invoice now reads No reviewed lines to invoice.',
    placement: 'top',
  },
  {
    run: collectAudit,
    route: tab(AUDIT, 'billing'),
    target: 'pa-stats',
    title: 'The customer pays the invoice.',
    body: 'Revenue, billing and cash now agree for the work done so far.',
    watch: 'Revenue recognized Rp16.848.000,00, billed to date Rp16.848.000,00, cash collected Rp16.848.000,00. Up to date: billing matches revenue.',
    placement: 'bottom',
  },
  {
    route: tab(AUDIT, 'closed'),
    target: 'pa-margin',
    title: 'Project health shows what the two old lines cost.',
    body: 'Charged in full, the work would have made a margin of Rp3.360.000,00. Waiving the margin on one old line and not charging the other gave almost all of it away.',
    watch: 'Margin to date Rp48.000,00 on revenue of Rp16.848.000,00. The gate reads Ready to close: Revenue is final, every invoice is paid and no addendum is pending.',
    placement: 'bottom',
  },
]

// ── PA-3: an addendum, and whether the added work is separate ──────────────

const TERRACE_REASON = 'Terrace enlarged from 25 m² to 35 m²'
const DOCK_REASON = 'Two additional loading dock bays on the east wall'
/** Rp9.000.000 is under the Addendum rule's Rp25.000.000, so it applies at once. */
function raiseTerraceAddendum() { addAddendum(TERRACE, 54_000_000, TERRACE_REASON, false, 'Made Ardika'); tourCtx.voId = lastVo(TERRACE) }
/** The sample data already holds Rina's pending loading dock addendum on the warehouse. */
function approveDockAddendum() {
  const e = findEngagement(WAREHOUSE)
  const vo = e?.vos.find((v) => v.reason === DOCK_REASON && v.status === 'Pending')
  const a = e && vo ? approvalFor(e, 'addendum', vo.id) : undefined
  if (a) approveRequest(WAREHOUSE, a.id, APPROVER)
}
function addDockMilestone() { addScopeMilestone(WAREHOUSE, 'Loading dock bays handed over') }

const pa3: TourStep[] = [
  {
    route: tab(TERRACE, 'recognition'),
    target: 'pa-input-progress',
    title: 'The terrace earns as the money is spent.',
    body: 'Home Terrace Renovation earns by Percentage of completion: percentage complete is cost incurred over budgeted cost, and revenue is that share of the contract value.',
    watch: 'Rp18.500.000,00 spent of Rp30.000.000,00 budgeted, so 62% complete. Revenue recognized to date Rp27.750.000,00 of a Rp45.000.000,00 contract.',
    placement: 'bottom',
  },
  {
    run: raiseTerraceAddendum,
    route: tab(TERRACE, 'setup'),
    target: 'pa-addenda',
    find: () => rowWith(TERRACE_REASON) ?? live('pa-addenda'),
    title: 'The customer enlarges the terrace, and the manager submits an addendum.',
    body: 'The contract is never edited in place. The project manager submits a dated addendum with a reason and answers the one question the system cannot: is this new, separately priced work? A bigger terrace is not: it extends existing work. The change is under the Addendum rule, so it applies at once.',
    watch: 'Rp45.000.000,00 to Rp54.000.000,00, Extends existing work, Approved: a Rp9.000.000,00 change, under the Rp25.000.000,00 that needs approval. Catch-up adjustment of Rp5.550.000,00 in the current period. The original contract stays on the list.',
    placement: 'top',
  },
  {
    route: tab(TERRACE, 'recognition'),
    target: 'pa-input-progress',
    title: 'Same progress, a larger contract.',
    body: 'Work that extends the same job is the same obligation under PSAK 72, so revenue already recognized is measured again on the new value. Nothing new was spent: the same 62% now applies to the revised contract value.',
    watch: 'Revenue recognized to date Rp33.300.000,00: the Rp27.750.000,00 from before plus the Rp5.550.000,00 catch-up.',
    placement: 'bottom',
  },
  {
    route: tab(WAREHOUSE, 'setup'),
    target: 'pa-addenda',
    find: () => rowWith(DOCK_REASON) ?? live('pa-addenda'),
    title: 'On the warehouse, an addendum is waiting for approval.',
    body: 'Two loading dock bays are a separate structure priced on their own, so this addendum is separate new work. The change is above Rp25.000.000,00, so the Addendum rule sends it to an approver, and the contract value does not move until the approver decides.',
    watch: 'Rp2.400.000.000,00 to Rp2.520.000.000,00, Separate new work, Pending approval: Addendum Rule 001, submitted by Rina Wulandari, waiting for Rizal Candra. A pending addendum blocks closing.',
    placement: 'top',
  },
  {
    run: approveDockAddendum,
    route: tab(WAREHOUSE, 'setup'),
    target: 'pa-scope-pending',
    // Once the next step adds the milestone the notice is gone; going Back
    // then shows the milestones it produced instead of a waiting panel.
    find: () => live('pa-scope-pending') ?? live('pa-contract-milestones'),
    title: 'Rizal Candra approves. Nothing already agreed is restated.',
    body: 'Separate new work is accounted for from now on. Each existing milestone keeps the money it was worth, so its weight shrinks against the larger contract, and the added work needs a milestone of its own.',
    watch: 'Add a milestone for the added work: Rp120.000.000,00 of separate work. The three milestones now weigh 38,10%, 28,57% and 28,57%, still Rp960.000.000,00, Rp720.000.000,00 and Rp720.000.000,00.',
    placement: 'bottom',
  },
  {
    run: addDockMilestone,
    route: tab(WAREHOUSE, 'setup'),
    target: 'pa-contract-milestones',
    title: 'The loading dock bays get their own milestone.',
    body: 'The new milestone takes the weight the restatement left over. The weights add up to the whole contract again.',
    watch: 'Loading dock bays handed over: 4,76%, Rp120.000.000,00, Not verified.',
    placement: 'top',
  },
  {
    route: tab(WAREHOUSE, 'recognition'),
    target: 'pa-output-milestones',
    title: 'Every milestone can be verified again.',
    body: 'Whether the work was separate, not the earning method, decided what happened to revenue: the terrace caught up at once, the warehouse kept every agreed amount and added a milestone.',
    watch: 'Four milestones on a Rp2.520.000.000,00 contract, weights totalling 100%, each with Verify milestone.',
    placement: 'top',
  },
]

const FINANCE = 'Finance Controller' as unknown as ViewAsRole
const reset = () => {
  Object.assign(tourCtx, { invoiceId: '', voId: '', approvalId: '' })
  resetProjectAccounting()
}
/** Steps name the submitter and approver themselves, so the runner switches no role. */
const noRole = () => {}

export const PROJECT_TOURS: AssetTour[] = [
  {
    id: 'pa1',
    code: 'PA-1',
    name: 'Earn a milestone, then bill it',
    persona: 'Project manager, Approver',
    role: FINANCE,
    blurb: 'A warehouse build earns by milestones. Cost arrives from purchases and expenses but earns nothing; a site sign-off, once approved, earns 40% of the contract; the invoice is filled from the milestone; payment is recorded; Project health shows the margin.',
    closing: 'Spend alone earned nothing. The approved fabrication verification earned Rp960.000.000,00, the invoice was filled from the milestone, the payment was recorded, and the margin to date is Rp145.000.000,00. To try it yourself, start the tour again or use Reset demo data in the user menu.',
    steps: pa1,
    onReset: reset,
    applyRole: noRole,
    keepsViewAs: true,
  },
  {
    id: 'pa2',
    code: 'PA-2',
    name: 'Charge cost plus margin, line by line',
    persona: 'Project manager, Finance',
    role: FINANCE,
    blurb: 'An audit earns cost plus a 20% margin, but only on reviewed lines. Recent work is charged in full, one old line at cost only, one not at all; the invoice is filled from the review; Project health shows what the old lines cost.',
    closing: 'Each review decision set the revenue: Rp16.848.000,00 instead of Rp20.160.000,00 in full. The invoice took exactly the charged lines, the payment was recorded, and the margin fell to Rp48.000,00. To try it yourself, start the tour again or use Reset demo data in the user menu.',
    steps: pa2,
    onReset: reset,
    applyRole: noRole,
    keepsViewAs: true,
  },
  {
    id: 'pa3',
    code: 'PA-3',
    name: 'Change a contract: separate new work or not',
    persona: 'Project manager, Approver',
    role: FINANCE,
    blurb: 'Two addenda. A larger terrace extends existing work and is small enough to apply at once, so revenue to date catches up. Two loading dock bays are separate new work above the approval threshold: once the approver agrees, nothing is restated and they get their own milestone.',
    closing: 'The terrace addendum caught revenue up by Rp5.550.000,00 in the current period. The approved loading dock addendum kept every agreed milestone amount and added a Rp120.000.000,00 milestone. To try it yourself, start the tour again or use Reset demo data in the user menu.',
    steps: pa3,
    onReset: reset,
    applyRole: noRole,
    keepsViewAs: true,
  },
]

/** The work of each step in order, per tour, for the spec to replay without a browser. */
export const TOUR_WORK: Record<string, ((() => void) | null)[]> = Object.fromEntries(
  PROJECT_TOURS.map((t) => [t.code, t.steps.map((s) => s.run ?? null)]),
)
