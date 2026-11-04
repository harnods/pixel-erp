/**
 * The work order START gate — UC-04 / D-8, PRD revision of 12 Oct.
 *
 * S-4 "start with limited stock" is no longer a separate toggle; the partial mode
 * (S-3) decides the gate alone, and switching reservation off lifts it:
 *
 *   | reservation | partial mode | start permitted when      |
 *   | ----------- | ------------ | ------------------------- |
 *   | on          | consume      | at least ONE reserved > 0 |
 *   | on          | completion   | EVERY component > 0       |
 *   | on          | none         | every component FULL      |
 *   | off         | any          | always                    |
 *
 * The rule under test, in one sentence: the gate counts RESERVATION, never
 * availability — stock sitting free in the warehouse does not open it, because
 * nobody has allocated it to this job.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  stockRequests, startGate, type StockRequest, type StockRequestLine,
} from '~/data/stockRequests'

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

describe('UC-00 — reservation switched off lifts the gate', () => {
  it('allows a work order with nothing reserved, whatever the partial mode', () => {
    for (const partialMode of ['none', 'consume', 'completion'] as const) {
      expect(startGate(WO_ID, { partialMode, reservationOn: false }).allowed).toBe(true)
    }
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
