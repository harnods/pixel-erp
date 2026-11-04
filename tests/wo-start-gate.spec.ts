/**
 * The work order START gate — UC-04 / D-8, PRD revision of 12 Oct.
 *
 * S-4 "start with limited stock" is not a separate toggle; the partial mode (S-3)
 * decides the gate. What a component must "hold" depends on the setting the work
 * order was created under (S-0, v0.6):
 *
 *   | partial mode | start permitted when      |
 *   | ------------ | ------------------------- |
 *   | consume      | at least ONE holds > 0    |
 *   | completion   | EVERY component holds > 0 |
 *   | none         | every component in FULL   |
 *
 *   • reservation on  — "holds" is RESERVATION, never availability: stock sitting
 *     free in the warehouse does not open the gate, because nobody has allocated
 *     it to this job.
 *   • reservation off — "holds" is stock ON HAND at the component's warehouse.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  stockRequests, startGate, onHandAt, type StockRequest, type StockRequestLine,
} from '~/data/stockRequests'
import { workOrders, type WorkOrder } from '~/data/workOrders'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { CATALOG } from '~/data/catalog'

const WO_ID = 'wo-gate-test'

/** A line with explicit reserved/consumed/available, so each case is readable. */
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
    // Deliberately generous: availability must never open the gate on its own.
    destAvailable: opts.destAvailable ?? 999,
    destinationWarehouse: 'Gudang Jakarta Pusat',
    destinationWarehouseId: 'wh-1',
    requestor: 'Budi Santoso',
  }
}

function seedRequest(lines: StockRequestLine[]): void {
  const existing = stockRequests.findIndex(r => r.workOrderId === WO_ID)
  if (existing >= 0) stockRequests.splice(existing, 1)
  const req: StockRequest = {
    id: `sr-wo-${WO_ID}`,
    number: 'SR-2026-9999',
    workOrderId: WO_ID,
    workOrderNumber: 'WO-2026-9999',
    requestDate: '2026-06-26',
    lines,
  }
  stockRequests.push(req)
}

const ON = { reservationOn: true }

beforeEach(() => {
  seedRequest([line('p1', 10, 0), line('p2', 5, 0)])
})

describe('UC-04 — neither partial mode: full reservation', () => {
  it('blocks when nothing is reserved', () => {
    const gate = startGate(WO_ID, { partialMode: 'none', ...ON })
    expect(gate.allowed).toBe(false)
    expect(gate.reason).toBe('not-fully-reserved')
  })

  it('blocks when only some of a component is reserved', () => {
    seedRequest([line('p1', 10, 9), line('p2', 5, 5)])
    expect(startGate(WO_ID, { partialMode: 'none', ...ON }).allowed).toBe(false)
  })

  it('allows when every component is fully reserved', () => {
    seedRequest([line('p1', 10, 10), line('p2', 5, 5)])
    expect(startGate(WO_ID, { partialMode: 'none', ...ON }).allowed).toBe(true)
  })
})

describe('UC-04 — partial consume: one secured component is enough (no S-4 needed)', () => {
  it('allows once ANY component holds a reservation', () => {
    seedRequest([line('p1', 10, 3), line('p2', 5, 0)])
    expect(startGate(WO_ID, { partialMode: 'consume', ...ON }).allowed).toBe(true)
  })

  it('blocks while nothing at all is reserved', () => {
    const gate = startGate(WO_ID, { partialMode: 'consume', ...ON })
    expect(gate.allowed).toBe(false)
    expect(gate.reason).toBe('none-reserved')
  })
})

describe('UC-04 — partial completion: every component must hold something', () => {
  it('allows when every component is at least partially reserved', () => {
    seedRequest([line('p1', 10, 1), line('p2', 5, 1)])
    expect(startGate(WO_ID, { partialMode: 'completion', ...ON }).allowed).toBe(true)
  })

  it('blocks when one component holds nothing — a finished unit needs a complete set', () => {
    seedRequest([line('p1', 10, 10), line('p2', 5, 0)])
    const gate = startGate(WO_ID, { partialMode: 'completion', ...ON })
    expect(gate.allowed).toBe(false)
    expect(gate.reason).toBe('some-unreserved')
  })
})

describe('S-0 off — the same table, counting stock on hand (v0.6 UC-04)', () => {
  const OFF_ID = 'wo-gate-off-test'
  // Two real components with stock on hand at Gudang Jakarta Pusat.
  const stocked = (getWarehouseDetail('wh-001')?.stock ?? [])
    .filter(row => row.onHand >= 2)
    .map(row => CATALOG.find(p => p.sku === row.sku))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .slice(0, 2)
  const [a, b] = stocked

  function workOrderNeeding(needA: number, needB: number) {
    const i = workOrders.findIndex(w => w.id === OFF_ID)
    if (i >= 0) workOrders.splice(i, 1)
    workOrders.push({
      id: OFF_ID, number: 'WO-GATE-OFF', bomId: '', bomName: '', category: 'Standard', type: 'Assembly',
      trackRouting: false, status: 'not started', producedQty: 0, plannedQty: 1,
      planStartDate: '2026-11-01', planEndDate: '2026-11-30',
      reservation: { on: false, method: 'one-step' },
      rawMaterials: [
        { productId: a!.id, needed: needA, unit: 'Unit', purchaseCost: 0, warehouseId: 'wh-001' },
        { productId: b!.id, needed: needB, unit: 'Unit', purchaseCost: 0, warehouseId: 'wh-001' },
      ],
    } as WorkOrder)
  }
  const gate = (partialMode: 'none' | 'consume' | 'completion') =>
    startGate(OFF_ID, { reservationOn: false, partialMode })

  it('has two stocked components to test with', () => {
    expect(stocked).toHaveLength(2)
  })

  it('none — every component must be fully on hand', () => {
    workOrderNeeding(onHandAt(a!.id, 'wh-001'), onHandAt(b!.id, 'wh-001'))
    expect(gate('none').allowed).toBe(true)
    workOrderNeeding(onHandAt(a!.id, 'wh-001') + 1, 1)
    expect(gate('none')).toEqual({ allowed: false, reason: 'not-fully-reserved' })
  })

  it('consume / completion — partly on hand is enough, as the table says', () => {
    // Both short, but both have something on hand.
    workOrderNeeding(onHandAt(a!.id, 'wh-001') + 5, onHandAt(b!.id, 'wh-001') + 5)
    expect(gate('consume').allowed).toBe(true)
    expect(gate('completion').allowed).toBe(true)
  })

  it('ignores reservation — nothing is requested, nothing reserved', () => {
    workOrderNeeding(1, 1)
    expect(stockRequests.some(r => r.workOrderId === OFF_ID)).toBe(false)
    expect(gate('none').allowed).toBe(true)
  })
})

describe('UC-04 — what the gate counts', () => {
  it('ignores available stock: free stock at the destination does not open the gate', () => {
    seedRequest([line('p1', 10, 0, { destAvailable: 500 })])
    expect(startGate(WO_ID, { partialMode: 'none', ...ON }).allowed).toBe(false)
    expect(startGate(WO_ID, { partialMode: 'consume', ...ON }).allowed).toBe(false)
  })

  it('counts consumed qty as covered — a partly issued line is not under-reserved', () => {
    // 10 needed, 4 still reserved, 6 already issued to the floor = fully covered.
    seedRequest([line('p1', 10, 4, { consumed: 6 })])
    expect(startGate(WO_ID, { partialMode: 'none', ...ON }).allowed).toBe(true)
  })

  it('lets a work order with no request through — nothing was ever allocated', () => {
    const i = stockRequests.findIndex(r => r.workOrderId === WO_ID)
    if (i >= 0) stockRequests.splice(i, 1)
    expect(startGate(WO_ID, { partialMode: 'none', ...ON }).allowed).toBe(true)
  })
})
