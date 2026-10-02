/**
 * Release of reservation — PRD v0.5 UC-15.
 *
 * Release is the Reserved → Available transition. Three events produce it and
 * only three: work order completion with leftover reserve, cancellation or
 * deletion, and manual unreserve (R-1). They share one function on purpose: a
 * release logged differently depending on how it happened is a release nobody can
 * reconcile against the stock ledger (R-7).
 *
 * The invariants under test:
 *   • On Hand = Available + Reserved holds across a release (it moves quantity
 *     between buckets and never moves stock physically).
 *   • Unreserve releases a component's FULL remaining reserved qty, never part of
 *     it (R-8 / L-8) — components are selected individually, quantities are not.
 *   • Consumed qty is never released: it has left the rack (R-5).
 *   • "Production defect" does not return stock to the warehouse — it is charged
 *     to production cost.
 *   • Every release writes ONE activity entry naming its trigger.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  stockRequests, releaseReservation, releaseOnCompletion, releaseForCanceledWorkOrder,
  unreserveWorkOrderProducts, reservedProductIds,
  type StockRequest, type StockRequestLine,
} from '~/data/stockRequests'
import { activityLog } from '~/data/activityLog'

const WO_ID = 'wo-release-test'
const REQ_ID = `sr-wo-${WO_ID}`

function line(productId: string, qty: number, reserved: number, opts: {
  consumed?: number
  destAvailable?: number
} = {}): StockRequestLine {
  return {
    productId,
    product: `Component ${productId}`,
    sku: productId,
    unit: 'Sack',
    qty,
    reserved,
    consumed: opts.consumed ?? 0,
    requiredDate: '2026-07-01',
    destAvailable: opts.destAvailable ?? 0,
    destinationWarehouse: 'Gudang Jakarta Pusat',
    destinationWarehouseId: 'wh-1',
    requestor: 'Budi Santoso',
  }
}

function seedRequest(lines: StockRequestLine[]): StockRequest {
  const existing = stockRequests.findIndex(r => r.workOrderId === WO_ID)
  if (existing >= 0) stockRequests.splice(existing, 1)
  const req: StockRequest = {
    id: REQ_ID,
    number: 'SR-2026-9998',
    workOrderId: WO_ID,
    workOrderNumber: 'WO-2026-9998',
    requestDate: '2026-06-26',
    lines,
  }
  stockRequests.push(req)
  return req
}

/** Release entries written for this request, newest last. */
function releaseEntries() {
  return activityLog.filter(e =>
    e.subjectId === REQ_ID && e.activity === 'Released reservation')
}
const detail = (entry: { details: { label: string; value: string }[] }, label: string) =>
  entry.details.find(d => d.label === label)?.value

beforeEach(() => {
  activityLog.length = 0
  seedRequest([line('p1', 10, 6, { destAvailable: 4 }), line('p2', 5, 5, { destAvailable: 0 })])
})

describe('UC-15 — the transition itself', () => {
  it('moves qty from reserved to available, leaving on-hand unchanged', () => {
    const req = stockRequests.find(r => r.id === REQ_ID)!
    const l = req.lines[0]!
    const onHandBefore = l.reserved + l.destAvailable

    releaseReservation(REQ_ID, ['p1'])

    expect(l.reserved).toBe(0)
    expect(l.destAvailable).toBe(onHandBefore)
    expect(l.reserved + l.destAvailable).toBe(onHandBefore)
  })

  it('releases only the components named', () => {
    releaseReservation(REQ_ID, ['p1'])
    const req = stockRequests.find(r => r.id === REQ_ID)!
    expect(req.lines[1]!.reserved).toBe(5)
  })

  it('reports what it released, per component', () => {
    const result = releaseReservation(REQ_ID, ['p1', 'p2'])
    expect(result.qty).toBe(11)
    expect(result.products.map(p => p.productId).sort()).toEqual(['p1', 'p2'])
  })

  it('does nothing — and logs nothing — when there is no reservation to release', () => {
    seedRequest([line('p1', 10, 0)])
    const result = releaseReservation(REQ_ID, ['p1'])
    expect(result.qty).toBe(0)
    expect(releaseEntries()).toHaveLength(0)
  })
})

describe('UC-15 R-8 / L-8 — no partial release', () => {
  it('releases a component\'s FULL remaining reserved qty', () => {
    seedRequest([line('p1', 10, 7, { destAvailable: 1 })])
    const result = releaseReservation(REQ_ID, ['p1'])
    expect(result.qty).toBe(7)
    expect(stockRequests.find(r => r.id === REQ_ID)!.lines[0]!.reserved).toBe(0)
  })

  it('leaves consumed qty alone — issued material comes back through a return, not a release', () => {
    seedRequest([line('p1', 10, 3, { consumed: 5, destAvailable: 0 })])
    const result = releaseReservation(REQ_ID, ['p1'])
    const l = stockRequests.find(r => r.id === REQ_ID)!.lines[0]!
    expect(result.qty).toBe(3)
    expect(l.consumed).toBe(5)
    expect(l.destAvailable).toBe(3)
  })
})

describe('UC-03 — disposition', () => {
  it('return-to-warehouse puts the qty back into available stock', () => {
    unreserveWorkOrderProducts(WO_ID, ['p2'], 'return-to-warehouse')
    expect(stockRequests.find(r => r.id === REQ_ID)!.lines[1]!.destAvailable).toBe(5)
  })

  it('production-defect does NOT: it is charged to production cost', () => {
    unreserveWorkOrderProducts(WO_ID, ['p2'], 'production-defect')
    const l = stockRequests.find(r => r.id === REQ_ID)!.lines[1]!
    expect(l.reserved).toBe(0)
    expect(l.destAvailable).toBe(0)
  })
})

describe('UC-15 R-1 / R-7 — all three triggers, one entry shape', () => {
  it('completion releases what is left over and names its trigger', () => {
    const result = releaseOnCompletion(WO_ID)
    expect(result.qty).toBe(11)
    const entry = releaseEntries().at(-1)!
    expect(detail(entry, 'Trigger')).toBe('Work order completion')
  })

  it('cancellation releases everything and names its trigger', () => {
    const result = releaseForCanceledWorkOrder(WO_ID)
    expect(result.qty).toBe(11)
    expect(detail(releaseEntries().at(-1)!, 'Trigger')).toBe('Work order cancellation')
  })

  it('manual unreserve names its trigger, disposition and reason', () => {
    unreserveWorkOrderProducts(WO_ID, ['p1'], 'production-defect', {
      user: 'Citra', source: 'work-order', reason: 'Panel damaged in handling',
    })
    const entry = releaseEntries().at(-1)!
    expect(detail(entry, 'Trigger')).toBe('Manual unreserve')
    expect(detail(entry, 'Disposition')).toBe('Charged to production cost')
    expect(detail(entry, 'Reason')).toBe('Panel damaged in handling')
    expect(entry.user).toBe('Citra')
  })

  it('writes exactly one entry per release, against BOTH the work order and its request', () => {
    releaseReservation(REQ_ID, ['p1'], 'return-to-warehouse', 'cancellation')
    const entries = activityLog.filter(e => e.activity === 'Released reservation')
    expect(entries).toHaveLength(2)
    expect(entries.map(e => e.subjectType).sort()).toEqual(['stock-request', 'work-order'])
  })

  it('records the surface a release came from, so a PPIC release is distinguishable', () => {
    unreserveWorkOrderProducts(WO_ID, ['p1'], 'return-to-warehouse', { source: 'stock-request' })
    expect(detail(releaseEntries().at(-1)!, 'Source')).toBe('Stock request (PPIC / stockist)')
  })
})

describe('reservedProductIds — what the automatic triggers act on', () => {
  it('lists every component still holding a reservation, once each', () => {
    seedRequest([line('p1', 10, 2), line('p1', 4, 1), line('p2', 5, 0)])
    expect(reservedProductIds(stockRequests.find(r => r.id === REQ_ID)!)).toEqual(['p1'])
  })
})
