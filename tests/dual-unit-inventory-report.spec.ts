/**
 * Dual Unit Inventory Report — row-builder rules (PRD "Dual Unit Inventory", Story 14).
 *
 * The report is a stock card in two units at once, so the invariants that matter are
 * arithmetic ones: every batch opens with a beginning balance derived from the filter,
 * running stock accumulates its mutation in BOTH units, and the closing line is the sum
 * of each batch's last running stock, valued at the product's average cost.
 *
 * The steel products are seeded verbatim from the agreed export template, so this spec
 * also pins the web report to that spreadsheet number-for-number.
 *
 * Canonical data: app/data/dualUnitInventory.ts
 */
import { describe, it, expect } from 'vitest'
import { DUI_PRODUCTS, dualUnitReportGroups, type DuiReportGroup } from '~/data/dualUnitInventory'

/** The export template's own window. */
const TEMPLATE_RANGE = { from: '2026-06-01', to: '2026-06-05', warehouseIds: [], search: '' }

function group(groups: DuiReportGroup[], sku: string): DuiReportGroup {
  const g = groups.find((x) => x.sku === sku)
  if (!g) throw new Error(`no group for ${sku}`)
  return g
}

describe('dualUnitReportGroups — structure', () => {
  it('opens every batch with a beginning balance dated at the range start', () => {
    const groups = dualUnitReportGroups(TEMPLATE_RANGE)
    expect(groups.length).toBeGreaterThan(0)
    const offenders: string[] = []
    for (const g of groups) {
      for (const b of g.batches) {
        const first = b.rows[0]
        if (!first) { offenders.push(`${g.sku}/${b.batchNo}: no rows`); continue }
        if (first.transaction !== 'Beginning balance') offenders.push(`${g.sku}/${b.batchNo}: opens with "${first.transaction}"`)
        if (first.date !== TEMPLATE_RANGE.from) offenders.push(`${g.sku}/${b.batchNo}: opening dated ${first.date}`)
        // The beginning-balance line shows the opening stock as both its mutation and its stock.
        if (first.baseDelta !== first.baseStock) offenders.push(`${g.sku}/${b.batchNo}: opening base delta ≠ stock`)
        if (first.secondaryDelta !== first.secondaryStock) offenders.push(`${g.sku}/${b.batchNo}: opening secondary delta ≠ stock`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('accumulates running stock in both units on every row', () => {
    const groups = dualUnitReportGroups({ from: '2026-01-01', to: '2026-06-30', warehouseIds: [], search: '' })
    const offenders: string[] = []
    for (const g of groups) {
      for (const b of g.batches) {
        for (let i = 1; i < b.rows.length; i++) {
          const prev = b.rows[i - 1]!
          const row = b.rows[i]!
          const expectedBase = round2(prev.baseStock + row.baseDelta)
          const expectedSecondary = round2(prev.secondaryStock + row.secondaryDelta)
          if (row.baseStock !== expectedBase) {
            offenders.push(`${g.sku}/${b.batchNo} row ${i}: base ${row.baseStock} ≠ ${expectedBase}`)
          }
          if (row.secondaryStock !== expectedSecondary) {
            offenders.push(`${g.sku}/${b.batchNo} row ${i}: secondary ${row.secondaryStock} ≠ ${expectedSecondary}`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('gives each batch line the stock its last mutation row lands on', () => {
    const groups = dualUnitReportGroups({ from: '2026-01-01', to: '2026-06-30', warehouseIds: [], search: '' })
    const offenders: string[] = []
    for (const g of groups) {
      for (const b of g.batches) {
        const last = b.rows[b.rows.length - 1]!
        if (b.endingBase !== last.baseStock) offenders.push(`${g.sku}/${b.batchNo}: endingBase ${b.endingBase} ≠ ${last.baseStock}`)
        if (b.endingSecondary !== last.secondaryStock) offenders.push(`${g.sku}/${b.batchNo}: endingSecondary ${b.endingSecondary} ≠ ${last.secondaryStock}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('closes each product on the sum of its batches, valued at average cost', () => {
    const groups = dualUnitReportGroups(TEMPLATE_RANGE)
    const offenders: string[] = []
    for (const g of groups) {
      const lastBase = g.batches.reduce((sum, b) => round2(sum + b.endingBase), 0)
      const lastSecondary = g.batches.reduce((sum, b) => round2(sum + b.endingSecondary), 0)
      if (g.endingBase !== lastBase) offenders.push(`${g.sku}: endingBase ${g.endingBase} ≠ ${lastBase}`)
      if (g.endingSecondary !== lastSecondary) offenders.push(`${g.sku}: endingSecondary ${g.endingSecondary} ≠ ${lastSecondary}`)
      if (g.value !== Math.round(g.endingBase * g.averageCost)) offenders.push(`${g.sku}: value ${g.value} off`)
    }
    expect(offenders).toEqual([])
  })
})

describe('dualUnitReportGroups — matches the export template', () => {
  it('reproduces Carbon Steel line for line', () => {
    const g = group(dualUnitReportGroups(TEMPLATE_RANGE), 'CS-1000')
    expect(g.baseUnit).toBe('mm')
    expect(g.secondaryUnit).toBe('slab')
    expect(g.batches.map((b) => b.batchNo)).toEqual(['BATCH_CS_1', 'BATCH_CS_2', 'BATCH_CS_3'])

    const cs1 = g.batches[0]!
    expect(cs1.conversionLabel).toBe('1 slab = 1000 mm')
    expect(cs1.tolerancePct).toBe(10)
    expect(cs1.rows.map((r) => [r.transaction, r.baseDelta, r.baseStock, r.secondaryDelta, r.secondaryStock])).toEqual([
      ['Beginning balance', 10_000, 10_000, 10, 10],
      ['Stock adjustment', -2_000, 8_000, -2, 8],
      ['Stock adjustment', -3_012, 4_988, -3, 5],
      ['Purchase delivery', 5_000, 9_988, 5, 10],
    ])

    const cs2 = g.batches[1]!
    expect(cs2.rows.map((r) => [r.baseDelta, r.baseStock, r.secondaryDelta, r.secondaryStock])).toEqual([
      [1_100, 1_100, 1, 1],
      [2_204, 3_304, 2, 3],
    ])

    // BATCH_CS_3 has stock but no movement in the window — beginning balance only.
    expect(g.batches[2]!.rows).toHaveLength(1)
    expect(g.batches[2]!.rows[0]!.baseStock).toBe(150)
    expect(g.batches[2]!.rows[0]!.secondaryStock).toBe(50)

    expect(g.endingBase).toBe(13_442)
    expect(g.endingSecondary).toBe(63)
    expect(g.averageCost).toBe(250_000)
    expect(g.value).toBe(3_360_500_000)
  })

  it('reproduces Copper totals and valuation', () => {
    const g = group(dualUnitReportGroups(TEMPLATE_RANGE), 'CP-500')
    expect(g.batches.map((b) => b.endingBase)).toEqual([5_995, 465])
    expect(g.batches.map((b) => b.endingSecondary)).toEqual([6, 93])
    expect(g.endingBase).toBe(6_460)
    expect(g.endingSecondary).toBe(99)
    expect(g.averageCost).toBe(271_975)
    expect(g.value).toBe(1_756_958_500)
  })
})

describe('dualUnitReportGroups — filters', () => {
  it('carries stock forward with no mutation rows when the range is after all movement', () => {
    const after = group(dualUnitReportGroups({ from: '2026-07-01', to: '2026-07-31', warehouseIds: [], search: '' }), 'CS-1000')
    const during = group(dualUnitReportGroups(TEMPLATE_RANGE), 'CS-1000')
    // Every batch is opening-balance-only …
    expect(after.batches.every((b) => b.rows.length === 1)).toBe(true)
    // … and the closing line is unchanged, because nothing moved in between.
    expect(after.endingBase).toBe(during.endingBase)
    expect(after.endingSecondary).toBe(during.endingSecondary)
    expect(after.value).toBe(during.value)
  })

  it('scopes whole batches to the selected warehouse', () => {
    const g = group(dualUnitReportGroups({ ...TEMPLATE_RANGE, warehouseIds: ['wh-002'] }), 'CS-1000')
    // Only BATCH_CS_2 lives in wh-002, so the product closes on that batch alone.
    expect(g.batches.map((b) => b.batchNo)).toEqual(['BATCH_CS_2'])
    expect(g.endingBase).toBe(3_304)
    expect(g.endingSecondary).toBe(3)
  })

  it('searches product name, SKU and batch number', () => {
    const byName = dualUnitReportGroups({ ...TEMPLATE_RANGE, search: 'copper' })
    expect(byName.map((g) => g.sku)).toEqual(['CP-500'])

    const bySku = dualUnitReportGroups({ ...TEMPLATE_RANGE, search: 'CS-1000' })
    expect(bySku.map((g) => g.sku)).toEqual(['CS-1000'])

    const byBatch = dualUnitReportGroups({ ...TEMPLATE_RANGE, search: 'BATCH_CP_2' })
    expect(byBatch.map((g) => g.sku)).toEqual(['CP-500'])

    expect(dualUnitReportGroups({ ...TEMPLATE_RANGE, search: 'no-such-product' })).toEqual([])
  })
})

describe('DUI_PRODUCTS seed', () => {
  it('gives every product a secondary unit distinct from its base unit', () => {
    expect(DUI_PRODUCTS.length).toBeGreaterThan(0)
    const offenders = DUI_PRODUCTS
      .filter((p) => !p.secondaryUnit || p.secondaryUnit === p.baseUnit)
      .map((p) => p.sku)
    expect(offenders).toEqual([])
  })

  it('gives every batch a unit conversion label and a warehouse', () => {
    const offenders: string[] = []
    for (const p of DUI_PRODUCTS) {
      for (const b of p.batches) {
        if (!b.conversionLabel) offenders.push(`${p.sku}/${b.batchNo}: no conversion label`)
        if (!b.warehouseId) offenders.push(`${p.sku}/${b.batchNo}: no warehouse`)
      }
    }
    expect(offenders).toEqual([])
  })
})

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
