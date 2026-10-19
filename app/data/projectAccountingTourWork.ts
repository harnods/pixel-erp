/**
 * Project accounting: the reset the guided tours start from.
 *
 * This is a demo layer for walkthroughs, not a product requirement; engineers
 * building the product should ignore it. The only coupling to product screens
 * is the data-tour="..." attributes they carry; this file only puts the
 * module's sample data back.
 *
 * projectAccounting.ts keeps its seed private and loads a saved snapshot over
 * it, so a tour cannot ask it for the seed. The sample engagements are restated
 * here instead, and tests/project-tours.spec.ts checks they match the module's
 * own seed line for line, so the two cannot drift apart unnoticed.
 */
import {
  engagements, defaultBudgetLines,
  type Engagement, type CostEntry, type CostDecision, type CostSource,
} from './projectAccounting'

/** The module's snapshot key, with persist.ts's prefix. */
const SNAPSHOT_KEY = 'erp-db:project-accounting-v2'

let n = 0
function cost(
  category: string, description: string, vendor: string, date: string, amount: number,
  src: CostSource = 'Expense', docNo = 'EXP-0000', markupPct = 0, decision: CostDecision = null,
  invoiced = false, hours: number | null = null,
): CostEntry {
  n += 1
  return { id: `tc-${n}`, category, description, vendor, date, amount, markupPct, src, docNo, decision, invoiced, hours }
}

function eng(p: Partial<Engagement> & Pick<Engagement, 'id' | 'name' | 'client' | 'pm' | 'method' | 'stage'>): Engagement {
  const e: Engagement = {
    markupPct: 0, feeEstimate: 0, contractValue: 0, budget: null, budgetLineId: null, budgetLines: null,
    team: [], entries: [], invoices: [],
    milestones: null, billing: null, vos: [], recognizedBase: 0, pctAtVO: 0, weightsNeedConfirm: false,
    closedAt: null, scopePending: null, ...p,
  }
  if (e.budget !== null) e.budgetLines = defaultBudgetLines(e.method === 'tm' ? e.feeEstimate : e.contractValue, e.budget, e.method)
  return e
}

/** The module's sample engagements, as projectAccounting.ts seeds them. */
export function sampleEngagements(): Engagement[] {
  return [
    eng({
      id: 'e1', name: 'Financial Statement Audit 2025', client: 'PT Sinar Abadi Textile', pm: 'Rina Wulandari',
      method: 'tm', markupPct: 20, stage: 'recognition', feeEstimate: 115_200_000, budget: 96_000_000,
      entries: [
        cost('Labor', 'Rina Wulandari — audit fieldwork', 'Internal payroll', '2026-07-05', 5_700_000, 'Expense', 'EXP-1102', 20, null, false, 15),
        cost('Labor', 'Yoga Prasetyo — tax position review', 'Internal payroll', '2026-06-28', 1_500_000, 'Expense', 'EXP-1088', 20, null, false, 6),
        cost('Labor', 'Rina Wulandari — audit fieldwork', 'Internal payroll', '2026-06-15', 3_040_000, 'Expense', 'EXP-1071', 20, null, false, 8),
        cost('Labor', 'Rina Wulandari — opening balance testing', 'Internal payroll', '2026-05-10', 4_560_000, 'Expense', 'EXP-1024', 20, null, false, 12),
        cost('Labor', 'Made Ardika — schedule preparation', 'Internal payroll', '2026-04-20', 2_000_000, 'Expense', 'EXP-0991', 20, null, false, 10),
      ],
    }),
    eng({
      id: 'e2', name: 'Annual Tax Consulting', client: 'CV Makmur Jaya', pm: 'Yoga Prasetyo',
      method: 'tm', markupPct: 20, stage: 'execution', feeEstimate: 33_600_000, budget: 28_000_000,
      entries: [
        cost('Labor', 'Yoga Prasetyo — annual return preparation', 'Internal payroll', '2026-07-22', 2_250_000, 'Expense', 'EXP-1178', 20, null, false, 9),
        cost('Labor', 'Yoga Prasetyo — tax reconciliation', 'Internal payroll', '2026-06-30', 2_750_000, 'Expense', 'EXP-1090', 20, null, false, 11),
        cost('Labor', 'Dewi Kusuma — document collation', 'Internal payroll', '2026-06-10', 1_050_000, 'Expense', 'EXP-1065', 20, null, false, 7),
      ],
    }),
    eng({
      id: 'e3', name: 'Monthly Retainer', client: 'PT Global Teknindo', pm: 'Made Ardika',
      method: 'tm', markupPct: 20, stage: 'billing', feeEstimate: 0, budget: null,
      entries: [
        cost('Labor', 'Made Ardika — monthly bookkeeping', 'Internal payroll', '2026-07-05', 4_000_000, 'Expense', 'EXP-1105', 20, 'bill', true, 20),
        cost('Labor', 'Dewi Kusuma — payroll processing', 'Internal payroll', '2026-07-10', 1_800_000, 'Expense', 'EXP-1112', 20, 'bill', true, 12),
        cost('Labor', 'Made Ardika — monthly bookkeeping', 'Internal payroll', '2026-07-26', 1_200_000, 'Expense', 'EXP-1190', 20, null, false, 6),
        cost('Labor', 'Dewi Kusuma — VAT filing', 'Internal payroll', '2026-07-18', 750_000, 'Expense', 'EXP-1175', 20, null, false, 5),
      ],
      invoices: [{ id: 'INV-2198', label: 'Progress billing', amount: 6_960_000, date: '2026-07-12', status: 'unpaid', paidDate: null }],
    }),
    eng({
      id: 'e5', name: 'Home Terrace Renovation', client: 'Mr. Hendra Wijaya', pm: 'Made Ardika',
      method: 'input', stage: 'execution', contractValue: 45_000_000, budget: 30_000_000,
      entries: [
        cost('Material', 'Floor tiling, 25 m²', 'Jaya Building Supplies', '2026-07-12', 8_500_000, 'Expense', 'EXP-1181'),
        cost('Material', 'Cement & sand', 'Jaya Building Supplies', '2026-07-13', 2_200_000, 'Expense', 'EXP-1184'),
        cost('Subcontractor', 'Builders — 6 days', 'Slamet (foreman)', '2026-07-20', 6_000_000, 'Purchase', 'PO-0442'),
        cost('Material', 'Exterior paint & finishing', 'UD Sejahtera Paints', '2026-07-25', 1_800_000, 'Expense', 'EXP-1192'),
      ],
      invoices: [{ id: 'INV-2190', label: 'Down payment (30%)', amount: 13_500_000, date: '2026-07-06', status: 'paid', paidDate: '2026-07-10' }],
      billing: [
        { id: 'b1', label: 'Down payment (30%)', pct: 30, status: 'paid', invId: 'INV-2190', paidDate: '2026-07-10' },
        { id: 'b2', label: 'Final payment (70%)', pct: 70, status: 'notdue', invId: null, paidDate: null },
      ],
    }),
    eng({
      id: 'e6', name: 'Wedding Organizer — Amanda & Reza', client: 'Susanto Family', pm: 'Dewi Kusuma',
      method: 'output', stage: 'billing', contractValue: 120_000_000, budget: 95_000_000,
      entries: [
        cost('Subcontractor', 'Catering 300 pax', 'Bunda Ratu Catering', '2026-07-15', 45_000_000, 'Purchase', 'PO-0455'),
        cost('Subcontractor', 'Venue & decoration rental', 'Grand Ballroom Hotel', '2026-07-18', 38_000_000, 'Expense', 'EXP-1201'),
        cost('Subcontractor', 'Sound system & MC', 'Harmoni Production', '2026-07-20', 12_000_000, 'Expense', 'EXP-1205'),
        cost('Labor', 'Dewi Kusuma — event coordination', 'Internal payroll', '2026-07-01', 2_400_000, 'Expense', 'EXP-1150', 0, null, false, 16),
      ],
      invoices: [{ id: 'INV-2205', label: 'Down payment', amount: 36_000_000, date: '2026-06-05', status: 'paid', paidDate: '2026-06-08' }],
      milestones: [{ id: 'm1', label: 'Event delivered (single deliverable)', pct: 100, verified: false, invId: null, recognized: 0 }],
    }),
    eng({
      id: 'e7', name: 'Cikarang Warehouse Construction', client: 'PT Anugerah Logistik', pm: 'Rina Wulandari',
      method: 'output', stage: 'recognition', contractValue: 2_400_000_000, budget: 1_850_000_000,
      entries: [
        cost('Material', 'WF 250 structural steel', 'PT Baja Utama', '2026-06-11', 420_000_000, 'Purchase', 'PO-0398'),
        cost('Subcontractor', 'Roof truss fabrication', 'CV Karya Logam', '2026-06-28', 310_000_000, 'Purchase', 'PO-0410'),
        cost('Expense', 'Crane rental, 2 weeks', 'PT Alat Berat Nusantara', '2026-07-09', 85_000_000, 'Expense', 'EXP-1174'),
      ],
      milestones: [
        { id: 'm1', label: 'Fabrication complete', pct: 40, verified: false, invId: null, recognized: 0 },
        { id: 'm2', label: 'Delivery to site', pct: 30, verified: false, invId: null, recognized: 0 },
        { id: 'm3', label: 'Installation & commissioning', pct: 30, verified: false, invId: null, recognized: 0 },
      ],
      vos: [{
        id: 'v-e7-1', date: '2026-08-01', reason: 'Two additional loading dock bays on the east wall',
        oldValue: 2_400_000_000, newValue: 2_520_000_000, status: 'Pending', distinct: true,
        raisedBy: 'Rina Wulandari', approvedBy: null, adjustment: 0, rejectedBy: null, rejectReason: null,
      }],
      approvals: [{
        id: 'apr-e7-1', action: 'addendum', refId: 'v-e7-1', ruleId: 'awf-006', ruleName: 'Addendum Rule 001',
        amount: 120_000_000, submittedBy: 'Rina Wulandari', submittedAt: '2026-08-01', approvers: ['Rizal Candra'],
      }],
    }),
  ]
}

/**
 * Put the sample engagements back in place (same reactive array, so open
 * screens follow) and drop the saved snapshot, so a reload also starts from
 * the sample data.
 */
export function resetProjectAccounting(): void {
  engagements.splice(0, engagements.length, ...sampleEngagements())
  if (typeof localStorage !== 'undefined') {
    try { localStorage.removeItem(SNAPSHOT_KEY) } catch { /* non-fatal */ }
  }
}
