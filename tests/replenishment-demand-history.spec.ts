/**
 * Demand history — determinism, honesty, and DENSITY.
 *
 * This is the gate the whole feature rests on. If the ledger is miscalibrated,
 * every downstream number (velocity, days-of-cover, FSN, suggested qty) is
 * decoration. Specifically it proves:
 *
 *  1. Determinism — two calls are deep-equal; nothing derives from Date.now() or
 *     Math.random(), so a refresh never moves a number.
 *  2. Shape — exactly REPL_HISTORY_DAYS ascending days ending at the anchor.
 *  3. Honesty — every cited document resolves to a REAL outgoing order in the
 *     same warehouse, with that SKU on its lines, and never cites more units than
 *     the document actually shipped. This is the "the trust drawer doesn't lie"
 *     test.
 *  4. Density — the seeds alone give ~0.01 units/pair/day, which would classify
 *     everything Non-moving. The ledger must produce a real spread.
 *
 * Pure/read-only — no stock or order is mutated.
 */
import { describe, it, expect } from 'vitest'
import {
  REPL_HISTORY_DAYS, REPL_COLD_START_SKUS,
  demandSeries, demandWindow, realDocsFor, demandCv, demandHistoryStats,
} from '~/data/demandHistory'
import { REPL_ASOF_ISO } from '~/data/replenishmentConfig'
import { outgoingOrders } from '~/data/outgoing'
import { orderSkuLines, warehouseOrderPool, warehouseProducts } from '~/data/inventory'
import { warehouses } from '~/data/warehouses'

const activeWarehouses = warehouses.filter((w) => !w.isDefault && w.status === 'active')

/** Every (sku, warehouseId) pair the worklist can draw from. */
function allPairs(): { sku: string; warehouseId: string }[] {
  const out: { sku: string; warehouseId: string }[] = []
  for (const wh of activeWarehouses) {
    for (const p of warehouseProducts(wh.id)) out.push({ sku: p.sku, warehouseId: wh.id })
  }
  return out
}

describe('demandHistory — determinism', () => {
  it('returns identical series across repeated calls', () => {
    const a = demandSeries('1101', 'wh-001')
    const b = demandSeries('1101', 'wh-001')
    expect(a).toEqual(b)
  })

  it('produces the same totals for every pair on a second pass', () => {
    const first = allPairs().map((p) => demandWindow(p.sku, p.warehouseId, 30).units)
    const second = allPairs().map((p) => demandWindow(p.sku, p.warehouseId, 30).units)
    expect(first).toEqual(second)
  })
})

describe('demandHistory — series shape', () => {
  it('has exactly REPL_HISTORY_DAYS days, ascending, ending at the anchor', () => {
    const series = demandSeries('1001', 'wh-002')
    expect(series.days).toHaveLength(REPL_HISTORY_DAYS)
    expect(series.days[series.days.length - 1]!.date).toBe(REPL_ASOF_ISO)
    for (let i = 1; i < series.days.length; i++) {
      expect(series.days[i]!.date > series.days[i - 1]!.date).toBe(true)
    }
  })

  it('never reports a negative quantity', () => {
    for (const { sku, warehouseId } of allPairs()) {
      for (const day of demandSeries(sku, warehouseId).days) {
        expect(day.qty).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('window aggregates match the underlying days', () => {
    const series = demandSeries('1102', 'wh-003')
    const last30 = series.days.slice(-30)
    const win = demandWindow('1102', 'wh-003', 30)
    expect(win.units).toBe(last30.reduce((s, d) => s + d.qty, 0))
    expect(win.movementDays).toBe(last30.filter((d) => d.qty > 0).length)
  })
})

describe('demandHistory — cited documents are real', () => {
  const byId = new Map(outgoingOrders.map((o) => [o.id, o]))

  it('every citation resolves to a real dispatch in the same warehouse, for that SKU', () => {
    let citations = 0
    for (const { sku, warehouseId } of allPairs()) {
      for (const doc of realDocsFor(sku, warehouseId, REPL_HISTORY_DAYS)) {
        citations++
        const order = byId.get(doc.id)
        expect(order, `cited ${doc.number} does not exist`).toBeTruthy()
        expect(order!.warehouseId).toBe(warehouseId)
        expect(order!.number).toBe(doc.number)
        expect(order!.salesNo).toBe(doc.salesNo)
        expect(order!.shippedDate).toBe(doc.date)
        // The SKU really is on this order's lines...
        const line = orderSkuLines(order!).find((l) => l.sku === sku)
        expect(line, `${doc.number} has no line for SKU ${sku}`).toBeTruthy()
        // ...and we never claim more units than the document moved.
        expect(doc.qty).toBeGreaterThan(0)
        expect(doc.qty).toBeLessThanOrEqual(line!.qty)
      }
    }
    // The whole point of Layer A is that it exists — if this is 0, the ledger is
    // pure fiction and the trust drawer has nothing real to show.
    expect(citations).toBeGreaterThan(0)
  })

  it('a document day carries docs; a modelled day never does', () => {
    for (const { sku, warehouseId } of allPairs().slice(0, 60)) {
      for (const day of demandSeries(sku, warehouseId).days) {
        if (day.source === 'document') expect(day.docs.length).toBeGreaterThan(0)
        else expect(day.docs).toHaveLength(0)
      }
    }
  })

  it('a document day’s qty is the sum of its citations', () => {
    for (const { sku, warehouseId } of allPairs()) {
      for (const day of demandSeries(sku, warehouseId).days) {
        if (day.source !== 'document') continue
        expect(day.qty).toBe(day.docs.reduce((s, d) => s + d.qty, 0))
      }
    }
  })
})

describe('demandHistory — density (the calibration gate)', () => {
  const pairs = allPairs()

  it('covers every SKU-warehouse pair', () => {
    const stats = demandHistoryStats()
    expect(stats.pairs).toBe(pairs.length)
    expect(stats.pairs).toBeGreaterThan(200)
    expect(stats.documentDays + stats.modelledDays).toBe(stats.pairs * REPL_HISTORY_DAYS)
  })

  it('demand follows the warehouse order pool, not the whole assortment', () => {
    // Every warehouse STOCKS the full catalog but its seed orders only draw from a
    // smaller pool (inventory.ts → warehouseOrderPool). SKUs outside that pool are
    // buffer stock: they genuinely do not move, and inventing demand for them would
    // be fabrication. So coverage is asserted separately for each side.
    let inPool = 0, inPoolWithDemand = 0, outPool = 0, outPoolWithDemand = 0
    for (const wh of activeWarehouses) {
      const pool = new Set(warehouseOrderPool(wh.id).map((p) => p.sku))
      for (const p of warehouseProducts(wh.id)) {
        const units = demandWindow(p.sku, wh.id, 30).units
        if (pool.has(p.sku)) { inPool++; if (units > 0) inPoolWithDemand++ }
        else { outPool++; if (units > 0) outPoolWithDemand++ }
      }
    }
    // In-pool: most sell within a month. Not all — a 45-day-lead espresso machine
    // legitimately goes a month without moving, which is what makes it Non-moving.
    expect(inPoolWithDemand / inPool).toBeGreaterThan(0.6)
    // Out-of-pool: quiet, but not hard-zero (the odd incidental sale is realistic).
    expect(outPoolWithDemand / outPool).toBeLessThan(0.15)
  })

  it('fast-moving categories always have monthly demand where they are stocked', () => {
    // Roasted beans are the fastest movers in the catalog. If any in-pool roasted
    // bean shows no 30-day demand, the model is under-generating and days-of-cover
    // would read "—" on a SKU a buyer touches weekly.
    for (const wh of activeWarehouses) {
      for (const p of warehouseOrderPool(wh.id)) {
        if (p.category !== 'Roasted Beans') continue
        expect(
          demandWindow(p.sku, wh.id, 30).units,
          `${p.sku} in ${wh.id} has no 30-day demand`,
        ).toBeGreaterThan(0)
      }
    }
  })

  it('90-day movement spreads across the full FSN range', () => {
    const pcts = pairs.map((p) => {
      const w = demandWindow(p.sku, p.warehouseId, 90)
      return (w.movementDays / w.days) * 100
    })
    const fast = pcts.filter((v) => v >= 60).length
    const slow = pcts.filter((v) => v >= 10 && v < 60).length
    const non = pcts.filter((v) => v < 10).length

    // All three classes must be populated, or the FSN filter is a dead control.
    expect(fast, 'no Fast movers').toBeGreaterThan(0)
    expect(slow, 'no Slow movers').toBeGreaterThan(0)
    expect(non, 'no Non-movers').toBeGreaterThan(0)
  })

  it('flags a genuine minority as volatile, not everybody or nobody', () => {
    const cvs = pairs
      .filter((p) => demandWindow(p.sku, p.warehouseId, 30).units > 0)
      .map((p) => demandCv(p.sku, p.warehouseId, 30))
    const volatile = cvs.filter((cv) => cv > 1.2).length
    expect(volatile).toBeGreaterThan(0)
    expect(volatile).toBeLessThan(cvs.length)
  })
})

describe('demandHistory — cold start', () => {
  it('cold-start SKUs genuinely report short history', () => {
    for (const sku of REPL_COLD_START_SKUS) {
      for (const wh of activeWarehouses) {
        if (!warehouseProducts(wh.id).some((p) => p.sku === sku)) continue
        const series = demandSeries(sku, wh.id)
        expect(series.historyDays).toBeLessThan(14)
        expect(series.historyDays).toBeGreaterThan(0)
      }
    }
  })

  it('non-cold-start pairs have the full window of history', () => {
    const series = demandSeries('1101', 'wh-001')
    expect(series.historyDays).toBe(REPL_HISTORY_DAYS)
  })

  it('a cold-start pair has no movement before its first-seen date', () => {
    const sku = REPL_COLD_START_SKUS[0]!
    const series = demandSeries(sku, 'wh-002')
    for (const day of series.days) {
      if (day.date < series.firstSeen && day.source === 'modelled') expect(day.qty).toBe(0)
    }
  })
})
