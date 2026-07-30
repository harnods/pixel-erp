// @vitest-environment happy-dom
/**
 * WMS Analytics operational quick-view derivations (WMS PRD 1.4, US2/US3) — the
 * counts shown on the WMS Overview page, computed from the mock data. Guards the
 * shape/invariants: totals are non-negative and each date bucket sums to <= total
 * (a row can lack a comparable date), and the warehouse filter never widens results.
 */
import { describe, it, expect } from 'vitest'
import { inboundQuickview, outboundQuickview, operatorNames } from '~/data/wmsAnalytics'
import { TODAY } from '~/data/master'
import { warehouses } from '~/data/warehouses'

const D = TODAY.toISOString().slice(0, 10)

describe('WMS analytics quick-view derivations', () => {
  it('inbound: buckets never exceed their card total, totals non-negative', () => {
    const i = inboundQuickview(D)
    for (const b of [i.pending, i.receiving, i.putaway, i.closed]) {
      expect(b.total).toBeGreaterThanOrEqual(0)
    }
    expect(i.pending.onDate + i.pending.before).toBeLessThanOrEqual(i.pending.total)
    for (const b of [i.receiving, i.putaway, i.closed]) {
      expect(b.onDate + b.before + b.after).toBe(b.total)
    }
  })

  it('outbound: bucket3 cards sum exactly to their total', () => {
    const o = outboundQuickview(D)
    expect(o.pending.onDate + o.pending.before).toBeLessThanOrEqual(o.pending.total)
    for (const b of [o.picking, o.packing, o.shipping]) {
      expect(b.onDate + b.before + b.after).toBe(b.total)
    }
  })

  it('warehouse filter narrows (never widens) the all-warehouses totals', () => {
    const wh = warehouses.find(w => w.status === 'active' && !w.isDefault)!
    const allIn = inboundQuickview(D)
    const oneIn = inboundQuickview(D, [wh.id])
    expect(oneIn.pending.total).toBeLessThanOrEqual(allIn.pending.total)
    expect(oneIn.receiving.total).toBeLessThanOrEqual(allIn.receiving.total)

    const allOut = outboundQuickview(D)
    const oneOut = outboundQuickview(D, [wh.id])
    expect(oneOut.pending.total).toBeLessThanOrEqual(allOut.pending.total)
    expect(oneOut.picking.total).toBeLessThanOrEqual(allOut.picking.total)
  })

  it('operator filter (not-assigned / a real name) never widens the "all" active-task totals', () => {
    const all = inboundQuickview(D, undefined, 'all')
    const notAssigned = inboundQuickview(D, undefined, 'not-assigned')
    expect(notAssigned.receiving.total).toBeLessThanOrEqual(all.receiving.total)
    const names = operatorNames()
    if (names.length) {
      const one = inboundQuickview(D, undefined, names[0]!)
      expect(one.receiving.total).toBeLessThanOrEqual(all.receiving.total)
    }
    // Pending/closed ignore the operator filter → identical regardless of value.
    expect(notAssigned.pending.total).toBe(all.pending.total)
    expect(notAssigned.closed.total).toBe(all.closed.total)
  })
})
