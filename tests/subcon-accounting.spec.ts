/**
 * Subcontracting accounting — the three finance simulations, as tests.
 *
 * The numbers here are NOT illustrative. They are the agreed output of the finance
 * simulations recorded in SUBCONTRACTING-ACCOUNTING-BRIEF.md §5, and they are what
 * `app/data/subconAccounting.ts` has to reproduce exactly.
 *
 * The load-bearing assertion across all of it: all three supply methods converge on
 * the SAME finished-goods value. Basic, Resupply and Dropship differ in how
 * materials reach the vendor, never in what the output costs.
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

// ── Test 1 — full receipt, all three methods ─────────────────────────────────

describe('Test 1 — one full receipt, all three methods', () => {
  const resupply = baseInput({
    method: 'resupply',
    handovers: [{ id: 'h1', date: '2026-09-18', lines: FULL_HANDOVER }],
    invoices: [{ id: 'inv1', date: '2026-09-20', lines: [
      { costLineId: 'svc-sew', amount: 12_500_000 },
      { costLineId: 'svc-handling', amount: 600_000 },
    ] }],
    receipts: [{ id: 'r1', date: '2026-09-25', qty: 500 }],
  })

  const dropship = baseInput({
    method: 'dropship',
    // The 3rd party ships straight to the vendor — ours from that moment.
    componentPurchases: [{ id: 'p1', date: '2026-09-17', lines: FULL_HANDOVER }],
    handovers: [{ id: 'h1', date: '2026-09-18', lines: FULL_HANDOVER }],
    invoices: [{ id: 'inv1', date: '2026-09-20', lines: [
      { costLineId: 'svc-sew', amount: 12_500_000 },
      { costLineId: 'svc-handling', amount: 600_000 },
    ] }],
    receipts: [{ id: 'r1', date: '2026-09-25', qty: 500 }],
  })

  // The vendor's own materials: no inventory, no handover. Its invoice folds the
  // material value into the service cost line.
  const basic = baseInput({
    method: 'basic',
    components: [],
    costLines: [
      { id: 'svc-sew', name: 'Jahit & assembly (incl. materials)', costDriver: 'Unit', amount: 12_500_000 + MATERIALS_TOTAL },
      { id: 'svc-handling', name: 'Subcon handling & freight', costDriver: 'Amount', amount: 600_000 },
    ],
    invoices: [{ id: 'inv1', date: '2026-09-20', lines: [
      { costLineId: 'svc-sew', amount: 12_500_000 + MATERIALS_TOTAL },
      { costLineId: 'svc-handling', amount: 600_000 },
    ] }],
    receipts: [{ id: 'r1', date: '2026-09-25', qty: 500 }],
  })

  const cases = [
    ['Resupply', resupply] as const,
    ['Dropship', dropship] as const,
    ['Basic', basic] as const,
  ]

  it.each(cases)('%s — finished goods = 22,800,000', (_name, input) => {
    const entries = buildSubconJournals(input)
    expect(balanceOf(entries, 'finishedGoods')).toBe(PRODUCTION_COST)
  })

  it.each(cases)('%s — WIP and clearing both end at zero', (_name, input) => {
    const entries = buildSubconJournals(input)
    expect(wipBalanceFrom(entries)).toBe(0)
    expect(balanceOf(entries, 'subconClearing')).toBe(0)
  })

  it.each(cases)('%s — every entry balances', (_name, input) => {
    expect(entriesBalance(buildSubconJournals(input))).toBe(true)
  })

  it('withholding is 262,000 on Resupply and Dropship', () => {
    for (const input of [resupply, dropship]) {
      const entries = buildSubconJournals(input)
      // A liability: credited, so the signed balance is negative.
      expect(-balanceOf(entries, 'withholdingTaxPayable')).toBe(262_000)
    }
  })

  it('withholding is 0 on Basic — a purchase of goods, not jasa maklon', () => {
    const entries = buildSubconJournals(basic)
    expect(balanceOf(entries, 'withholdingTaxPayable')).toBe(0)
  })

  it('Resupply raises no entry for the warehouse transfer itself', () => {
    // Location changes, ownership does not. The first entry is the handover.
    const entries = buildSubconJournals(resupply)
    expect(entries.some(e => e.event === 'componentPurchase')).toBe(false)
    expect(entries[0]!.event).toBe('materialHandover')
  })

  it('Dropship buys the components into inventory, then clears it to WIP', () => {
    const entries = buildSubconJournals(dropship)
    expect(entries[0]!.event).toBe('componentPurchase')
    // Bought in, issued out — material inventory nets to zero.
    expect(balanceOf(entries, 'materialInventory')).toBe(0)
  })

  it('accounts payable = service + VAT − withholding', () => {
    const entries = buildSubconJournals(resupply)
    const vat = Math.round(SUBCON_TOTAL * 0.11)
    expect(-balanceOf(entries, 'accountsPayable')).toBe(SUBCON_TOTAL + vat - 262_000)
  })
})

// ── Test 2 — staged handovers and staged receipts ────────────────────────────

describe('Test 2 — materials 60/40, receipts of 300 then 200', () => {
  const input = baseInput({
    method: 'resupply',
    handovers: [
      { id: 'h1', date: '2026-09-18', lines: shareOfComponents(0.6) },
      { id: 'h2', date: '2026-09-19', lines: shareOfComponents(0.4) },
    ],
    // Two approved purchase orders — the vendor's charge is recognised on
    // approval, so each one posts its own clearing/VAT/withholding entry.
    invoices: [
      { id: 'inv1', date: '2026-09-22', lines: [
        { costLineId: 'svc-sew', amount: 7_500_000 },
        { costLineId: 'svc-handling', amount: 360_000 },
      ] },
      { id: 'inv2', date: '2026-09-28', lines: [
        { costLineId: 'svc-sew', amount: 5_000_000 },
        { costLineId: 'svc-handling', amount: 240_000 },
      ] },
    ],
    receipts: [
      { id: 'r1', date: '2026-09-23', qty: 300 },
      { id: 'r2', date: '2026-09-29', qty: 200 },
    ],
  })

  const entries = buildSubconJournals(input)
  const fgEntries = entries.filter(e => e.event === 'goodsReceived')

  it('receipt 1 (300 pcs) is worth 13,680,000', () => {
    expect(fgEntries[0]!.lines[0]!.debit).toBe(13_680_000)
  })

  it('receipt 2 (200 pcs) is worth 9,120,000', () => {
    expect(fgEntries[1]!.lines[0]!.debit).toBe(9_120_000)
  })

  it('cost per unit stays 45,600 across both receipts', () => {
    expect(fgEntries[0]!.lines[0]!.debit! / 300).toBe(COST_PER_UNIT)
    expect(fgEntries[1]!.lines[0]!.debit! / 200).toBe(COST_PER_UNIT)
  })

  it('subcon cost splits 7,860,000 / 5,240,000 by driver', () => {
    const caps = entries.filter(e => e.event === 'capitalisation')
    expect(caps[0]!.lines[0]!.debit).toBe(7_500_000 + 360_000)
    expect(caps[1]!.lines[0]!.debit).toBe(5_000_000 + 240_000)
  })

  it('WIP walks 5,820,000 → 9,700,000 → 17,560,000 → 3,880,000 → 0', () => {
    // Balance after each entry, in the order the events happened.
    const trail: number[] = []
    for (let i = 1; i <= entries.length; i++) trail.push(wipBalanceFrom(entries.slice(0, i)))
    const wipMoves = trail.filter((v, i) => i === 0 || v !== trail[i - 1])
    expect(wipMoves).toEqual([5_820_000, 9_700_000, 17_560_000, 3_880_000, 9_120_000, 0])
  })

  it('after receipt 1, WIP equals the materials still being worked on — 3,880,000', () => {
    // The explicit assertion the brief calls for: this is the "Components at
    // vendor" figure, not an incidental intermediate.
    const upToReceipt1 = entries.slice(0, entries.indexOf(fgEntries[0]!) + 1)
    expect(wipBalanceFrom(upToReceipt1)).toBe(3_880_000)
  })

  it('two approved orders produce two withholding entries, never one rolled up', () => {
    const withholdingLines = entries
      .filter(e => e.event === 'vendorInvoice')   // the charge-recognised entry
      .flatMap(e => e.lines.filter(l => l.role === 'withholdingTaxPayable'))
    expect(withholdingLines).toHaveLength(2)
    expect(withholdingLines.map(l => l.credit)).toEqual([157_200, 104_800])
    expect(withholdingLines.reduce((s, l) => s + l.credit!, 0)).toBe(262_000)
  })

  it('ends square: finished goods 22,800,000, WIP 0, clearing 0', () => {
    expect(balanceOf(entries, 'finishedGoods')).toBe(PRODUCTION_COST)
    expect(wipBalanceFrom(entries)).toBe(0)
    expect(balanceOf(entries, 'subconClearing')).toBe(0)
    expect(entriesBalance(entries)).toBe(true)
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

  it('decreasing to at-or-above what was sent posts NOTHING', () => {
    // Kancing: planned 2,000 → 1,500, with 1,200 already at the vendor.
    const outcome = evaluateComponentAdjustment({
      method: 'resupply',
      plannedQty: 2_000, newPlannedQty: 1_500, alreadySentQty: 1_200,
      componentName: 'Kancing baju', unit: 'pcs',
    })
    expect(outcome).toEqual({ kind: 'planOnly' })

    // And the accounting agrees: what was handed over is untouched by a plan edit.
    const before = buildSubconJournals(baseInput({
      handovers: [{ id: 'h1', date: '2026-09-18', lines: [{ sku: 'BTN-STD-04', qty: 1_200 }] }],
    }))
    const after = buildSubconJournals(baseInput({
      components: COMPONENTS.map(c => c.sku === 'BTN-STD-04' ? { ...c, plannedQty: 1_500 } : c),
      handovers: [{ id: 'h1', date: '2026-09-18', lines: [{ sku: 'BTN-STD-04', qty: 1_200 }] }],
    }))
    expect(after).toEqual(before)
  })

  it('decreasing BELOW what was sent is rejected, naming the sent quantity', () => {
    const outcome = evaluateComponentAdjustment({
      method: 'resupply',
      plannedQty: 2_000, newPlannedQty: 1_000, alreadySentQty: 1_200,
      componentName: 'Kancing baju', unit: 'pcs',
    })
    expect(outcome.kind).toBe('rejected')
    if (outcome.kind === 'rejected') {
      expect(outcome.alreadySentQty).toBe(1_200)
      expect(outcome.message).toContain('1200')
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

// ── Short completion ─────────────────────────────────────────────────────────

describe('closing short', () => {
  it('writes the remaining WIP off to the waste account', () => {
    const input = baseInput({
      handovers: [{ id: 'h1', date: '2026-09-18', lines: FULL_HANDOVER }],
      invoices: [{ id: 'inv1', date: '2026-09-22', lines: [
        { costLineId: 'svc-sew', amount: 11_250_000 },
        { costLineId: 'svc-handling', amount: 540_000 },
      ] }],
      receipts: [{ id: 'r1', date: '2026-09-25', qty: 450 }],
      closedShort: true,
    })
    const entries = buildSubconJournals(input)
    const writeOff = entries.find(e => e.event === 'shortCompletion')

    expect(writeOff).toBeDefined()
    // 50 of 500 units never produced — their material share stays behind.
    expect(writeOff!.lines[0]!.debit).toBe(970_000)
    expect(wipBalanceFrom(entries)).toBe(0)
    expect(entriesBalance(entries)).toBe(true)
  })
})
