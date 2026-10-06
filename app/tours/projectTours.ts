/**
 * Guided tours for the Project accounting screens: PA-1 to PA-3, auto-played.
 *
 * This is a demo layer for walkthroughs, not a product requirement; engineers
 * building the product should ignore it. The only coupling to product screens
 * is the data-tour="..." attributes they carry. It reuses the asset tour
 * runner, with its own reset and no View as (the module has none).
 *
 * Every step does its own work on Next (run), then opens the screen that
 * shows the result and points at it. The reader only presses Next.
 * tests/project-tours.spec.ts runs every step's work after
 * resetProjectAccounting() and checks the figures quoted here.
 */
import {
  findEngagement, verifyMilestone, saveInvoice, recordPayment, decideEntries, readyToInvoice, entryFinal,
  addAddendum, approveAddendum, addScopeMilestone, TODAY,
} from '~/data/projectAccounting'
import { resetProjectAccounting } from '~/data/projectAccountingTourWork'
import type { AssetTour, TourStep } from './assetTours'
import type { ViewAsRole } from '~/data/assetStore'

/** Ids the steps hand to each other within one run. */
export const tourCtx = { invoiceId: '', voId: '' }

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

function verifyFabrication() { verifyMilestone(WAREHOUSE, 'm1') }
function invoiceFabrication() {
  const e = findEngagement(WAREHOUSE)
  const m = e?.milestones?.find((x) => x.id === 'm1')
  if (!e || !m || m.invId) return
  const inv = saveInvoice({ engId: WAREHOUSE, kind: 'output', label: m.label, milestoneId: m.id, entryIds: null, date: TODAY, amount: m.recognized })
  tourCtx.invoiceId = inv?.id ?? ''
}
function collectFabrication() { if (tourCtx.invoiceId) recordPayment(WAREHOUSE, tourCtx.invoiceId) }

const pa1: TourStep[] = [
  {
    route: '/project-accounting',
    target: 'pa-portfolio',
    find: () => rowWith('Cikarang Warehouse Construction'),
    title: 'The project list opens on every engagement and its method.',
    body: 'Every engagement shows how it earns revenue, because the method is part of the contract, not a reporting choice. The warehouse earns by milestone: money spent on it earns nothing until a milestone is signed off.',
    watch: 'Cikarang Warehouse Construction, Output by Milestone: Rp0,00 revenue recognised, although 44% of the budget is spent (Rp815.000.000,00 of Rp1.850.000.000,00).',
    placement: 'bottom',
  },
  {
    route: tab(WAREHOUSE, 'setup'),
    target: 'pa-contract-milestones',
    title: 'The contract fixes what each milestone is worth.',
    body: 'The contract value and the milestone weights are set when the engagement is created and are never edited in place. A change goes through an addendum that Finance approves.',
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
    run: verifyFabrication,
    route: tab(WAREHOUSE, 'recognition'),
    target: 'pa-output-milestones',
    title: 'The site inspector signs off, and fabrication is verified.',
    body: 'Verifying is the act that earns revenue: the milestone decides the amount, nobody estimates it. Nothing is sent to the client yet, and the verification can still be reversed until the invoice is raised.',
    watch: 'Fabrication complete reads Awaiting invoice at Rp960.000.000,00. Milestones verified 1 of 3, revenue recognised Rp960.000.000,00.',
    placement: 'top',
  },
  {
    route: `/project-accounting/invoice/new?project=${WAREHOUSE}&kind=output&label=Fabrication%20complete&milestone=m1`,
    target: 'pa-invoice-context',
    title: 'Create invoice opens the invoice already filled in.',
    body: 'The verified milestone becomes the invoice line, tagged to the project. The strip above shows where the invoice sits against the contract before it is saved.',
    watch: 'Contract value Rp2.400.000.000,00. Revenue recognised Rp960.000.000,00. Billed to date Rp0,00. This invoice Rp960.000.000,00.',
    placement: 'bottom',
  },
  {
    run: invoiceFabrication,
    route: tab(WAREHOUSE, 'billing'),
    target: 'pa-invoices',
    title: 'The invoice is saved against the engagement.',
    body: 'Billing now matches what was earned. Nothing is unbilled, and nothing was billed ahead of the work. The verification is locked now that it is invoiced.',
    watch: 'Fabrication complete, Rp960.000.000,00, Unpaid. Total billed Rp960.000.000,00. Unbilled revenue Rp0,00: billing matches revenue recognised.',
    placement: 'top',
  },
  {
    run: collectFabrication,
    route: tab(WAREHOUSE, 'billing'),
    target: 'pa-invoices',
    title: 'The client pays, and the payment is recorded.',
    body: 'The three figures show where each job stands because collected cash is tracked apart from revenue and billing.',
    watch: 'The invoice reads Paid 03 Aug 2026. Collected Rp960.000.000,00.',
    placement: 'top',
  },
  {
    route: tab(WAREHOUSE, 'closed'),
    target: 'pa-margin',
    title: 'Project health shows the margin so far and what blocks closing.',
    body: 'Margin is revenue recognised less cost incurred. The gate below says what still stands between the job and closing it.',
    watch: 'Margin to date Rp145.000.000,00, 15% of revenue recognised. The gate reads Not ready to close: two of the three milestones are still to be verified.',
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
    body: 'Financial Statement Audit 2025 earns by Input by Simplified Cost: the client pays the cost of the work plus a 20% margin, but only on lines someone has reviewed.',
    watch: 'Cost incurred Rp16.800.000,00 on 5 cost lines. Awaiting review Rp20.160.000,00 at cost plus margin, of which Rp7.872.000,00 is older than 60 days. Revenue recognised Rp0,00.',
    placement: 'bottom',
  },
  {
    run: billRecentLines,
    route: tab(AUDIT, 'recognition'),
    target: 'pa-tm-summary',
    title: 'The three recent lines are charged at cost plus margin.',
    body: 'Charge cost + margin is the normal decision and needs no reason. Each reviewed line becomes revenue at once.',
    watch: 'Revenue recognised to date Rp12.288.000,00. Rp7.872.000,00 is still awaiting review: the two lines older than 60 days.',
    placement: 'bottom',
  },
  {
    run: chargeAtCost,
    route: tab(AUDIT, 'recognition'),
    target: 'pa-review-queue',
    title: 'Opening balance testing, 85 days old, is charged at cost only.',
    body: 'Old work is hard to put in front of a client at full price. Charge at cost only waives the margin and needs a reason.',
    watch: 'The line earns Rp4.560.000,00 instead of Rp5.472.000,00. One line is left in the queue: schedule preparation, 105 days, Rp2.400.000,00.',
    placement: 'top',
  },
  {
    run: dontCharge,
    route: tab(AUDIT, 'recognition'),
    target: 'pa-tm-summary',
    title: 'Schedule preparation is not charged to the client.',
    body: 'Don\'t charge client keeps the cost on the project but earns nothing from it. It needs a reason too, and it never reaches an invoice.',
    watch: 'All cost lines reviewed. Revenue recognised to date Rp16.848.000,00 against Rp20.160.000,00 if every line had been charged in full.',
    placement: 'bottom',
  },
  {
    route: tab(AUDIT, 'billing'),
    target: 'pa-ready-invoice',
    title: 'Reviewed lines wait here to be invoiced.',
    body: 'Only lines charged to the client are ready to invoice. The line that is not charged stays off the invoice.',
    watch: '4 cost lines · Rp16.848.000,00 ready to invoice.',
    placement: 'bottom',
  },
  {
    route: `/project-accounting/invoice/new?project=${AUDIT}&kind=tm&label=Progress%20billing`,
    target: 'pa-invoice-lines',
    title: 'Create invoice fills one line per reviewed cost line.',
    body: 'Each line carries the amount the review decided, tagged to the project. The invoice and the revenue agree line by line.',
    watch: 'Four lines. This invoice Rp16.848.000,00, against a Fee estimate of Rp185.000.000,00.',
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
    title: 'The client pays the invoice.',
    body: 'Revenue, billing and cash now agree for the work done so far.',
    watch: 'Revenue recognised Rp16.848.000,00, total billed Rp16.848.000,00, collected Rp16.848.000,00. Unbilled revenue Rp0,00.',
    placement: 'bottom',
  },
  {
    route: tab(AUDIT, 'closed'),
    target: 'pa-margin',
    title: 'Project health shows what the two old lines cost.',
    body: 'Charged in full, the work would have made a margin of Rp3.360.000,00. Waiving the margin on one old line and not charging the other gave almost all of it away.',
    watch: 'Margin to date Rp48.000,00 on revenue of Rp16.848.000,00. The gate reads Ready to close: every line is reviewed, invoiced and paid.',
    placement: 'bottom',
  },
]

// ── PA-3: an addendum, and whether the added scope is distinct ─────────────

const TERRACE_REASON = 'Terrace enlarged from 25 m² to 35 m²'
const OFFICE_REASON = 'Two-storey office block beside the warehouse'
function raiseTerraceAddendum() { addAddendum(TERRACE, 54_000_000, TERRACE_REASON, false); tourCtx.voId = lastVo(TERRACE) }
function approveTerraceAddendum() { if (tourCtx.voId) approveAddendum(TERRACE, tourCtx.voId) }
function raiseWarehouseAddendum() { addAddendum(WAREHOUSE, 3_000_000_000, OFFICE_REASON, true); tourCtx.voId = lastVo(WAREHOUSE) }
function approveWarehouseAddendum() { if (tourCtx.voId) approveAddendum(WAREHOUSE, tourCtx.voId) }
function addOfficeMilestone() { addScopeMilestone(WAREHOUSE, 'Office block handed over') }

const pa3: TourStep[] = [
  {
    route: tab(TERRACE, 'recognition'),
    target: 'pa-input-progress',
    title: 'The terrace earns as the money is spent.',
    body: 'Home Terrace Renovation earns by Input by Cost: percentage complete is cost incurred over budgeted cost, and revenue is that share of the contract value.',
    watch: 'Rp18.500.000,00 spent of Rp30.000.000,00 budgeted, so 62% complete. Revenue recognised to date Rp27.750.000,00 of a Rp45.000.000,00 contract.',
    placement: 'bottom',
  },
  {
    run: raiseTerraceAddendum,
    route: tab(TERRACE, 'setup'),
    target: 'pa-addenda',
    find: () => rowWith(TERRACE_REASON) ?? live('pa-addenda'),
    title: 'The client enlarges the terrace, and the manager raises an addendum.',
    body: 'The contract is never edited in place. The project manager raises a dated addendum with a reason and answers the one question the system cannot: is the added scope distinct? The added scope is not distinct: a bigger terrace is more of the same job.',
    watch: 'Rp45.000.000,00 to Rp54.000.000,00, Not distinct, Pending: submitted by Made Ardika · Project Manager, awaiting Finance approval. The contract value stays Rp45.000.000,00 until then, and a pending addendum blocks closing.',
    placement: 'top',
  },
  {
    run: approveTerraceAddendum,
    route: tab(TERRACE, 'setup'),
    target: 'pa-addenda',
    find: () => rowWith(TERRACE_REASON) ?? live('pa-addenda'),
    title: 'Finance approves it, and revenue to date catches up at once.',
    body: 'Under PSAK 72, scope that is not distinct is the same obligation, so revenue already recognised is measured again on the new value. The difference is a one-time catch-up in the current period.',
    watch: 'Approved by Anggun Prakoso · Finance Controller. Catch-up adjustment of Rp5.550.000,00 in the current period. The original contract stays on the list.',
    placement: 'top',
  },
  {
    route: tab(TERRACE, 'recognition'),
    target: 'pa-input-progress',
    title: 'Same progress, a larger contract.',
    body: 'Nothing new was spent. The same 62% now applies to the revised contract value.',
    watch: 'Revenue recognised to date Rp33.300.000,00: the Rp27.750.000,00 from before plus the Rp5.550.000,00 catch-up.',
    placement: 'bottom',
  },
  {
    run: raiseWarehouseAddendum,
    route: tab(WAREHOUSE, 'setup'),
    target: 'pa-addenda',
    find: () => rowWith(OFFICE_REASON) ?? live('pa-addenda'),
    title: 'On the warehouse, the client adds an office block.',
    body: 'The office block is a separate structure priced on its own, so this time the added scope is distinct.',
    watch: 'Rp2.400.000.000,00 to Rp3.000.000.000,00, Distinct scope, Pending: submitted by Rina Wulandari · Project Manager.',
    placement: 'top',
  },
  {
    run: approveWarehouseAddendum,
    route: tab(WAREHOUSE, 'setup'),
    target: 'pa-scope-pending',
    // Once the next step adds the milestone the notice is gone; going Back
    // then shows the milestones it produced instead of a waiting panel.
    find: () => live('pa-scope-pending') ?? live('pa-contract-milestones'),
    title: 'Finance approves. Nothing already agreed is restated.',
    body: 'Distinct scope is accounted for from now on. Each existing milestone keeps the money it was worth, so its weight shrinks against the larger contract, and the added scope needs a milestone of its own.',
    watch: 'Add a milestone for the added scope: Rp600.000.000,00 of separate scope. The three milestones now weigh 32%, 24% and 24%, still Rp960.000.000,00, Rp720.000.000,00 and Rp720.000.000,00.',
    placement: 'bottom',
  },
  {
    run: addOfficeMilestone,
    route: tab(WAREHOUSE, 'setup'),
    target: 'pa-contract-milestones',
    title: 'The office block gets its own milestone.',
    body: 'The new milestone takes the weight the restatement left over. The weights add up to the whole contract again.',
    watch: 'Office block handed over: 20%, Rp600.000.000,00, Not verified.',
    placement: 'top',
  },
  {
    route: tab(WAREHOUSE, 'recognition'),
    target: 'pa-output-milestones',
    title: 'Every milestone can be verified again.',
    body: 'The scope question, not the earning method, decided what happened to revenue: the terrace caught up at once, the warehouse kept every agreed amount and added a milestone.',
    watch: 'Milestone weights sum to 100%. Four milestones on a Rp3.000.000.000,00 contract, each with Mark physically verified.',
    placement: 'top',
  },
]

const FINANCE = 'Finance Controller' as unknown as ViewAsRole
const reset = () => {
  Object.assign(tourCtx, { invoiceId: '', voId: '' })
  resetProjectAccounting()
}
/** The module has no View as, so switching roles does nothing here. */
const noRole = () => {}

export const PROJECT_TOURS: AssetTour[] = [
  {
    id: 'pa1',
    code: 'PA-1',
    name: 'Earn a milestone, then bill it',
    persona: 'Project Manager, Finance',
    role: FINANCE,
    blurb: 'A warehouse build earns by milestone. Cost arrives from purchases and expenses but earns nothing; a site sign-off earns 40% of the contract; the invoice is filled from the milestone; payment is recorded; Project health shows the margin.',
    closing: 'Spend alone earned nothing. Verifying fabrication earned Rp960.000.000,00, the invoice was filled from the milestone, the payment was recorded, and the margin to date is Rp145.000.000,00. To try it yourself, start the tour again or use Reset demo data in the user menu.',
    steps: pa1,
    onReset: reset,
    applyRole: noRole,
  },
  {
    id: 'pa2',
    code: 'PA-2',
    name: 'Charge cost plus margin, line by line',
    persona: 'Project Manager, Finance',
    role: FINANCE,
    blurb: 'An audit earns cost plus a 20% margin, but only on reviewed lines. Recent work is charged in full, one old line at cost only, one not at all; the invoice is filled from the review; Project health shows what the old lines cost.',
    closing: 'Each review decision set the revenue: Rp16.848.000,00 instead of Rp20.160.000,00 in full. The invoice took exactly the charged lines, the payment was recorded, and the margin fell to Rp48.000,00. To try it yourself, start the tour again or use Reset demo data in the user menu.',
    steps: pa2,
    onReset: reset,
    applyRole: noRole,
  },
  {
    id: 'pa3',
    code: 'PA-3',
    name: 'Change a contract: distinct scope or not',
    persona: 'Project Manager, Finance Controller',
    role: FINANCE,
    blurb: 'Two addenda, raised by the project manager and approved by Finance. A larger terrace is the same scope, so revenue to date catches up at once. An office block is distinct, so nothing is restated and it gets its own milestone.',
    closing: 'The not-distinct terrace addendum caught revenue up by Rp5.550.000,00 in the current period. The distinct office block kept every agreed milestone amount and added a Rp600.000.000,00 milestone. To try it yourself, start the tour again or use Reset demo data in the user menu.',
    steps: pa3,
    onReset: reset,
    applyRole: noRole,
  },
]

/** The work of each step in order, per tour, for the spec to replay without a browser. */
export const TOUR_WORK: Record<string, ((() => void) | null)[]> = Object.fromEntries(
  PROJECT_TOURS.map((t) => [t.code, t.steps.map((s) => s.run ?? null)]),
)
