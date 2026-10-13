/**
 * Subcontracting accounting — PRD Rev 5 (R13, R14), as tests.
 *
 * Reference scenario: BOM #10087 Kemeja Formal Pria, 500 pcs, Resupply. The
 * numbers are the Design Brief's fixtures F1, F2, F7 and F8, and the invariants
 * I8 (no tax) and I9 (PO approval posts nothing). Every method must converge on
 * the same finished-goods value once the invoice is in.
 */
import { describe, it, expect } from 'vitest'
import {
  buildSubconJournals,
  balanceOf,
  wipBalanceFrom,
  entriesBalance,
  subconCostSummary,
  plannedMaterialValue,
  plannedSubconCost,
  evaluateComponentAdjustment,
  splitInvoiceStockVsSold,
  subconAccount,
  type SubconAccountingInput,
  type SubconCostLineInput,
  type SubconComponentInput,
} from '../app/data/subconAccounting'

// ── Fixture: BOM "Kemeja Formal Pria" #10087, 500 pcs ────────────────────────

const PLANNED_QTY = 500

const COMPONENTS: SubconComponentInput[] = [
  { sku: 'FAB-KTN-01', name: 'Kain katun premium', plannedQty: 500,   unitCost: 10_000 },
  { sku: 'THR-JHT-02', name: 'Benang jahit',       plannedQty: 20,    unitCost: 160_000 },
  { sku: 'BTN-STD-04', name: 'Kancing baju',       plannedQty: 2_000, unitCost: 750 },
]

const COST_LINES: SubconCostLineInput[] = [
  { id: 'svc-sew',      name: 'Jahit & assembly',          costDriver: 'Unit',   amount: 12_500_000 },
  { id: 'svc-handling', name: 'Subcon handling & freight', costDriver: 'Amount', amount: 600_000 },
]

const MATERIALS_TOTAL = 9_700_000
const SUBCON_TOTAL    = 13_100_000
const PRODUCTION_COST = 22_800_000
const COST_PER_UNIT   = 45_600

/** Every component, in full — the single handover the simple cases use. */
const FULL_HANDOVER = COMPONENTS.map(c => ({ sku: c.sku, qty: c.plannedQty }))

/** A share of every component, for staged handovers. */
function shareOfComponents(fraction: number) {
  return COMPONENTS.map(c => ({ sku: c.sku, qty: c.plannedQty * fraction }))
}

function baseInput(over: Partial<SubconAccountingInput> = {}): SubconAccountingInput {
  return {
    workOrderNumber: 'WO-2026-0029',
    method: 'resupply',
    plannedOutputQty: PLANNED_QTY,
    components: COMPONENTS,
    costLines: COST_LINES,
    ...over,
  }
}

describe('fixture sanity — the brief’s own arithmetic', () => {
  it('materials, subcon and total reconcile to the documented figures', () => {
    const input = baseInput()
    expect(plannedMaterialValue(input)).toBe(MATERIALS_TOTAL)
    expect(plannedSubconCost(input)).toBe(SUBCON_TOTAL)
    expect(MATERIALS_TOTAL + SUBCON_TOTAL).toBe(PRODUCTION_COST)
    expect(PRODUCTION_COST / PLANNED_QTY).toBe(COST_PER_UNIT)
  })
})

const INVOICE_LINES = [
  { costLineId: 'svc-sew', amount: 12_500_000 },
  { costLineId: 'svc-handling', amount: 600_000 },
]
const INVOICE = { id: 'inv1', date: '2026-09-30', lines: INVOICE_LINES }
const isInvoice = (e: { event: string }) => e.event === 'vendorInvoice'

// ── F1 — Partial production ON: two records, then complete ───────────────────

describe('F1 — partial production ON, two records, then completion', () => {
  // Record 1: 300 pcs with 60% of the components issued. Completion issues the rest.
  const input = baseInput({
    handovers: [
      { id: 'h1', date: '2026-09-20', lines: shareOfComponents(0.6) },
      { id: 'h2', date: '2026-09-25', lines: shareOfComponents(0.4) },
    ],
    outputs: [
      { id: 'o1', date: '2026-09-20', qty: 300, cost: 7_860_000 },
      { id: 'o2', date: '2026-09-25', qty: 200, cost: 5_240_000 },
    ],
  })
  const entries = buildSubconJournals(input)

  it('record 1 moves 5,820,000 of materials from WIP to finished goods', () => {
    const e = entries.find(x => x.id === 'o1-output')!
    expect(e.lines).toEqual([
      expect.objectContaining({ role: 'finishedGoods', debit: 5_820_000 }),
      expect.objectContaining({ role: 'wip', credit: 5_820_000 }),
    ])
  })

  it('completion releases the remaining 3,880,000', () => {
    const e = entries.find(x => x.id === 'o2-output')!
    expect(e.lines[0]).toMatchObject({ role: 'finishedGoods', debit: 3_880_000 })
  })

  it('finished goods carry material value only before the invoice', () => {
    expect(balanceOf(entries, 'finishedGoods')).toBe(MATERIALS_TOTAL)
    expect(wipBalanceFrom(entries)).toBe(0)
  })

  it('the invoice takes finished goods to 22,800,000', () => {
    const withInvoice = buildSubconJournals({ ...input, invoices: [INVOICE] })
    expect(balanceOf(withInvoice, 'finishedGoods')).toBe(PRODUCTION_COST)
    expect(balanceOf(withInvoice, 'accountsPayable')).toBe(-SUBCON_TOTAL)
    expect(entriesBalance(withInvoice)).toBe(true)
  })
})

// ── F2 — Partial production OFF ──────────────────────────────────────────────

describe('F2 — partial production OFF: Start issues everything', () => {
  const input = baseInput({
    handovers: [{ id: 'h1', date: '2026-09-18', lines: FULL_HANDOVER }],
    outputs: [{ id: 'o1', date: '2026-09-30', qty: 500, cost: SUBCON_TOTAL }],
    invoices: [INVOICE],
  })
  const entries = buildSubconJournals(input)

  it('Start posts Dr WIP / Cr Material inventory for 9,700,000', () => {
    const e = entries.find(x => x.event === 'materialHandover')!
    expect(e.lines[0]).toMatchObject({ role: 'wip', debit: MATERIALS_TOTAL })
    expect(e.lines.filter(l => l.role === 'materialInventory').reduce((s, l) => s + (l.credit ?? 0), 0))
      .toBe(MATERIALS_TOTAL)
  })

  it('completion produces 500: Dr Finished goods / Cr WIP 9,700,000', () => {
    const e = entries.find(x => x.event === 'goodsProduced')!
    expect(e.lines[0]).toMatchObject({ role: 'finishedGoods', debit: MATERIALS_TOTAL })
  })

  it('the invoice adds 13,100,000 → finished goods 22,800,000', () => {
    expect(balanceOf(entries, 'finishedGoods')).toBe(PRODUCTION_COST)
    expect(entriesBalance(entries)).toBe(true)
  })
})

// ── The three methods converge ───────────────────────────────────────────────

describe('all three methods converge on the same finished-goods value', () => {
  const finishedGoods = (method: 'basic' | 'resupply' | 'dropship') => {
    const own = method === 'basic'
    const entries = buildSubconJournals(baseInput({
      method,
      // Basic: the vendor's own materials, so the invoice carries material AND service.
      costLines: own
        ? [{ id: 'svc-all', name: 'Material + service', costDriver: 'Amount', amount: PRODUCTION_COST }]
        : COST_LINES,
      components: own ? [] : COMPONENTS,
      handovers: own ? [] : [{ id: 'h1', date: '2026-09-18', lines: FULL_HANDOVER }],
      componentPurchases: method === 'dropship'
        ? [{ id: 'p1', date: '2026-09-15', lines: FULL_HANDOVER }] : [],
      outputs: [{ id: 'o1', date: '2026-09-30', qty: 500, cost: SUBCON_TOTAL }],
      invoices: [{
        id: 'inv1', date: '2026-10-01',
        lines: own ? [{ costLineId: 'svc-all', amount: PRODUCTION_COST }] : INVOICE_LINES,
      }],
    }))
    return { entries, fg: balanceOf(entries, 'finishedGoods') }
  }

  it.each(['basic', 'resupply', 'dropship'] as const)('%s ends at 22,800,000', (method) => {
    const { entries, fg } = finishedGoods(method)
    expect(fg).toBe(PRODUCTION_COST)
    expect(entriesBalance(entries)).toBe(true)
  })

  it('Basic records output at zero value; the invoice carries the whole value', () => {
    const { entries } = finishedGoods('basic')
    expect(entries.some(e => e.event === 'goodsProduced')).toBe(false)
    expect(entries.find(isInvoice)!.lines[0]).toMatchObject({ role: 'finishedGoods', debit: PRODUCTION_COST })
  })

  it('Resupply raises no entry for the warehouse transfer itself', () => {
    const { entries } = finishedGoods('resupply')
    expect(entries.map(e => e.event)).toEqual(['materialHandover', 'goodsProduced', 'vendorInvoice'])
  })

  it('Dropship buys the components into inventory, then issues them to WIP', () => {
    const { entries } = finishedGoods('dropship')
    expect(entries[0]!.event).toBe('componentPurchase')
    expect(entries[0]!.lines.at(-1)).toMatchObject({ role: 'accountsPayable', credit: MATERIALS_TOTAL })
  })
})

// ── F7 — Unused components at completion ─────────────────────────────────────

describe('F7 — unused components come back out of WIP', () => {
  // Sent 500 m, used 480 m: completion issues all 500 and returns 20 m.
  const entries = buildSubconJournals(baseInput({
    handovers: [{ id: 'h1', date: '2026-09-18', lines: FULL_HANDOVER }],
    returns: [{ id: 'r1', date: '2026-09-30', lines: [{ sku: 'FAB-KTN-01', qty: 20 }] }],
    outputs: [{ id: 'o1', date: '2026-09-30', qty: 500, cost: SUBCON_TOTAL }],
  }))

  it('the 20 m returns to Material inventory at cost, from WIP', () => {
    const e = entries.find(x => x.event === 'materialReturn')!
    expect(e.lines).toEqual([
      expect.objectContaining({ role: 'materialInventory', debit: 200_000 }),
      expect.objectContaining({ role: 'wip', credit: 200_000 }),
    ])
  })

  it('finished goods take only the 9,500,000 that was really used; WIP ends at zero', () => {
    expect(balanceOf(entries, 'finishedGoods')).toBe(9_500_000)
    expect(wipBalanceFrom(entries)).toBe(0)
    expect(entriesBalance(entries)).toBe(true)
  })
})

// ── R13 — approval posts nothing; the invoice is the only service-cost entry ──

describe('R13 / I9 — purchase order approval posts nothing', () => {
  it('with no invoice, nothing in the journal carries the service cost', () => {
    const entries = buildSubconJournals(baseInput({
      handovers: [{ id: 'h1', date: '2026-09-18', lines: FULL_HANDOVER }],
      outputs: [{ id: 'o1', date: '2026-09-30', qty: 500, cost: SUBCON_TOTAL }],
    }))
    expect(entries.some(isInvoice)).toBe(false)
    expect(balanceOf(entries, 'accountsPayable')).toBe(0)
    expect(balanceOf(entries, 'finishedGoods')).toBe(MATERIALS_TOTAL)
  })
})

describe('R13 — the invoice splits between stock on hand and cost of goods sold', () => {
  const outputs = [
    { id: 'o1', date: '2026-09-20', qty: 300, cost: 7_860_000, soldQty: 300 },
    { id: 'o2', date: '2026-09-25', qty: 200, cost: 5_240_000, soldQty: 0 },
  ]

  it('follows each record’s cost share and how much of it was sold (OPEN — Finance)', () => {
    expect(splitInvoiceStockVsSold(SUBCON_TOTAL, outputs)).toEqual({ stock: 5_240_000, sold: 7_860_000 })
  })

  it('posts both debits against accounts payable, balanced', () => {
    const entries = buildSubconJournals(baseInput({ outputs, invoices: [INVOICE] }))
    const e = entries.find(isInvoice)!
    expect(e.lines).toEqual([
      expect.objectContaining({ role: 'finishedGoods', debit: 5_240_000 }),
      expect.objectContaining({ role: 'costOfGoodsSold', debit: 7_860_000 }),
      expect.objectContaining({ role: 'accountsPayable', credit: SUBCON_TOTAL }),
    ])
    expect(entriesBalance(entries)).toBe(true)
  })

  it('with nothing sold, or nothing produced yet, the whole invoice stays in stock', () => {
    expect(splitInvoiceStockVsSold(SUBCON_TOTAL, [])).toEqual({ stock: SUBCON_TOTAL, sold: 0 })
    expect(splitInvoiceStockVsSold(SUBCON_TOTAL, outputs.map(o => ({ ...o, soldQty: 0 }))))
      .toEqual({ stock: SUBCON_TOTAL, sold: 0 })
  })
})

// ── R14 / I8 — no tax ────────────────────────────────────────────────────────

describe('R14 / I8 — no subcon journal carries PPN or PPh 23', () => {
  it.each(['basic', 'resupply', 'dropship'] as const)('%s invoice is the service value, untaxed', (method) => {
    const entries = buildSubconJournals(baseInput({
      method,
      handovers: [{ id: 'h1', date: '2026-09-18', lines: FULL_HANDOVER }],
      outputs: [{ id: 'o1', date: '2026-09-30', qty: 500, cost: SUBCON_TOTAL }],
      invoices: [INVOICE],
    }))
    const codes = entries.flatMap(e => e.lines.map(l => subconAccount(l.role).code))
    expect(codes).not.toContain('1-40100') // PPN Masukan
    expect(codes).not.toContain('2-20100') // Utang PPh 23
    expect(entries.find(isInvoice)!.lines.find(l => l.role === 'accountsPayable')!.credit).toBe(SUBCON_TOTAL)
  })
})

// ── Test 3 — adjustments ─────────────────────────────────────────────────────

describe('Test 3 — component adjustments and a new cost line', () => {
  /** Kain +50 m, kancing 2,000 → 1,500, plus a new "Finishing & packing" line. */
  const adjusted = baseInput({
    components: [
      { sku: 'FAB-KTN-01', name: 'Kain katun premium', plannedQty: 550,   unitCost: 10_000 },
      { sku: 'THR-JHT-02', name: 'Benang jahit',       plannedQty: 20,    unitCost: 160_000 },
      { sku: 'BTN-STD-04', name: 'Kancing baju',       plannedQty: 1_500, unitCost: 750 },
    ],
    costLines: [
      ...COST_LINES,
      { id: 'svc-finishing', name: 'Finishing & packing', costDriver: 'Amount', amount: 750_000 },
    ],
  })

  it('materials move 9,700,000 → 9,825,000 (+125,000)', () => {
    expect(plannedMaterialValue(adjusted)).toBe(9_825_000)
    expect(plannedMaterialValue(adjusted) - MATERIALS_TOTAL).toBe(125_000)
  })

  it('subcon moves 13,100,000 → 13,850,000 (+750,000)', () => {
    expect(plannedSubconCost(adjusted)).toBe(13_850_000)
  })

  it('total moves 22,800,000 → 23,675,000 and cost per unit 45,600 → 47,350', () => {
    const summary = subconCostSummary(adjusted)
    expect(summary.plannedTotal).toBe(23_675_000)
    expect(summary.plannedPerUnit).toBe(47_350)
  })

  it('increasing past what was already sent requires a NEW shipment', () => {
    // All 500 m already handed over: editing the planned number moves no goods.
    expect(evaluateComponentAdjustment({
      method: 'resupply',
      plannedQty: 500, newPlannedQty: 550, alreadySentQty: 500,
      componentName: 'Kain katun premium', unit: 'm',
    })).toEqual({ kind: 'requiresShipment', extraQty: 50 })
  })

  it('an increase the vendor already holds is plan-only and posts nothing', () => {
    // Planned 400, with 1,200 already at the vendor: raising to 600 needs no shipment.
    expect(evaluateComponentAdjustment({
      method: 'resupply',
      plannedQty: 400, newPlannedQty: 600, alreadySentQty: 1_200,
      componentName: 'Kancing baju', unit: 'pcs',
    })).toEqual({ kind: 'planOnly' })
  })

  it('R7 — a decrease is refused, naming the CURRENT value', () => {
    const outcome = evaluateComponentAdjustment({
      method: 'resupply',
      plannedQty: 2_000, newPlannedQty: 1_500, alreadySentQty: 1_200,
      componentName: 'Kancing baju', unit: 'pcs',
    })
    expect(outcome.kind).toBe('rejected')
    if (outcome.kind === 'rejected') {
      expect(outcome.currentQty).toBe(2_000)
      expect(outcome.message).toContain('2000')
      expect(outcome.message).toContain('Kancing baju')
    }
  })

  it('does not apply to Basic — the materials are the vendor’s', () => {
    expect(evaluateComponentAdjustment({
      method: 'basic',
      plannedQty: 2_000, newPlannedQty: 1_000, alreadySentQty: 0,
      componentName: 'Kancing baju', unit: 'pcs',
    })).toEqual({ kind: 'notApplicable' })
  })

  it('a new cost line raises cost per unit without changing quantity', () => {
    const before = subconCostSummary(baseInput())
    const after = subconCostSummary(adjusted)
    expect(after.plannedPerUnit - before.plannedPerUnit).toBe(1_750)
    expect(after.plannedTotal - before.plannedTotal).toBe(875_000)
  })
})


// ── A partial record’s output and its issue share one date ───────────────────

describe('output dated on the record’s own day releases that record’s materials', () => {
  it('an issue and an output on the same (past) day post together', () => {
    const entries = buildSubconJournals(baseInput({
      handovers: [{ id: 'h1', date: '2026-09-10', lines: shareOfComponents(0.6) }],
      outputs: [{ id: 'o1', date: '2026-09-10', qty: 300, cost: 7_860_000 }],
    }))
    expect(entries.find(e => e.id === 'o1-output')!.lines[0]).toMatchObject({ debit: 5_820_000 })
  })

  it('an output dated BEFORE its issue would carry nothing — which is why the record’s date is passed through', () => {
    const entries = buildSubconJournals(baseInput({
      handovers: [{ id: 'h1', date: '2026-09-12', lines: shareOfComponents(0.6) }],
      outputs: [{ id: 'o1', date: '2026-09-10', qty: 300, cost: 7_860_000 }],
    }))
    expect(entries.some(e => e.id === 'o1-output')).toBe(false)
  })
})
