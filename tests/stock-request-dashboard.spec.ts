/**
 * Stock requests dashboard — PRD v0.5 UC-11 (W-1 … W-8).
 *
 * The rules under test are the ones a stockist reads numbers off:
 *   • W-2 — Remaining = Required − Reserved − Consumed, and availability is shown
 *     PER destination warehouse and never summed across them (which is why a
 *     product row is split per warehouse).
 *   • W-3 — a product row takes the lowest status among the lines behind it.
 *   • W-4 — the Requested tab holds rows that are not fully reserved; free stock
 *     at the destination does not settle a row.
 *   • W-7 — overdue is derived per line, and a rejected line is settled, so it is
 *     never overdue and never counts as demand.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  stockRequests, skuDemandGroups, isAwaitingTab, isTerminalRequest, stockRequestOpenCount,
  stockRequestStatusOptions,
  isOverdue, isLineOverdue, canRejectLine, rejectRequestLine,
  type StockRequest, type StockRequestLine,
} from '~/data/stockRequests'
import { workOrders } from '~/data/workOrders'

const TODAY = '2026-06-26'

function line(productId: string, qty: number, opts: Partial<StockRequestLine> = {}): StockRequestLine {
  return {
    productId,
    product: `Component ${productId}`,
    sku: productId,
    unit: 'Sack',
    qty,
    reserved: 0,
    consumed: 0,
    requiredDate: '2026-07-10',
    destAvailable: 0,
    destinationWarehouse: 'Gudang Jakarta Pusat',
    destinationWarehouseId: 'wh-1',
    requestor: 'Bima',
    ...opts,
  }
}

/** Requests used by these tests, kept apart from the seed by their work order id. */
const TEST_IDS = ['wo-dash-a', 'wo-dash-b']

function seed(workOrderId: string, lines: StockRequestLine[]): StockRequest {
  const req: StockRequest = {
    id: `sr-${workOrderId}`,
    number: `SR-2026-${workOrderId.slice(-1)}000`,
    workOrderId,
    workOrderNumber: `WO-${workOrderId}`,
    requestDate: '2026-06-20',
    lines,
  }
  stockRequests.push(req)
  return req
}

/** Only the requests these tests created — the seed is left out of assertions. */
const mine = () => stockRequests.filter(r => TEST_IDS.includes(r.workOrderId))

beforeEach(() => {
  for (let i = stockRequests.length - 1; i >= 0; i--) {
    if (TEST_IDS.includes(stockRequests[i]!.workOrderId)) stockRequests.splice(i, 1)
  }
})

describe('W-2 — the product rollup', () => {
  it('aggregates the same component across transactions into one row', () => {
    seed('wo-dash-a', [line('mdf', 20)])
    seed('wo-dash-b', [line('mdf', 12)])
    const [group] = skuDemandGroups(mine())
    expect(group!.required).toBe(32)
    expect(group!.openWorkOrders).toBe(2)
    expect(group!.entries).toHaveLength(2)
  })

  it('computes Remaining as Required − Reserved − Consumed', () => {
    seed('wo-dash-a', [line('mdf', 20, { reserved: 6, consumed: 4 })])
    const [group] = skuDemandGroups(mine())
    expect(group!.reserved).toBe(6)
    expect(group!.consumed).toBe(4)
    expect(group!.remaining).toBe(10)
  })

  it('shows nothing remaining once reserved and consumed cover the demand', () => {
    seed('wo-dash-a', [line('mdf', 20, { reserved: 5, consumed: 15 })])
    expect(skuDemandGroups(mine())[0]!.remaining).toBe(0)
  })

  it('splits a component into one row PER destination warehouse, never summing availability', () => {
    seed('wo-dash-a', [
      line('mdf', 20, { destAvailable: 8 }),
      line('mdf', 10, {
        destinationWarehouse: 'Gudang Surabaya Timur',
        destinationWarehouseId: 'wh-2',
        destAvailable: 5,
      }),
    ])
    const groups = skuDemandGroups(mine())
    expect(groups).toHaveLength(2)
    expect(groups.map(g => g.available).sort((a, b) => a - b)).toEqual([5, 8])
    // The two rows must not be read as one pool of 13.
    expect(groups.some(g => g.available === 13)).toBe(false)
  })

  it('takes the lowest status among the lines behind the row (W-3)', () => {
    seed('wo-dash-a', [line('mdf', 20, { reserved: 20 })])
    seed('wo-dash-b', [line('mdf', 10, { reserved: 0 })])
    expect(skuDemandGroups(mine())[0]!.status).toBe('requested')
  })
})

describe('W-7 — overdue and rejection', () => {
  it('marks a line overdue when its required date has passed and it is not covered', () => {
    const l = line('mdf', 20, { requiredDate: '2026-06-01' })
    expect(isLineOverdue(l, TODAY)).toBe(true)
  })

  it('never calls a fully covered line overdue', () => {
    const l = line('mdf', 20, { requiredDate: '2026-06-01', reserved: 20 })
    expect(isLineOverdue(l, TODAY)).toBe(false)
  })

  it('carries overdue onto the product row, so the by-product view can show it', () => {
    seed('wo-dash-a', [line('mdf', 20, { requiredDate: '2026-06-01' })])
    expect(skuDemandGroups(mine())[0]!.overdue).toBe(true)
  })

  it('never calls a rejected line overdue — a declined line is settled', () => {
    const l = line('mdf', 20, { requiredDate: '2026-06-01', tag: 'adjustment', rejected: true })
    expect(isLineOverdue(l, TODAY)).toBe(false)
  })

  it('lets the stockist decline a tagged line only', () => {
    const req = seed('wo-dash-a', [
      line('mdf', 20),
      line('kaki', 5, { tag: 'additional' }),
    ])
    expect(canRejectLine(req.lines[0]!)).toBe(false)
    expect(canRejectLine(req.lines[1]!)).toBe(true)
    expect(rejectRequestLine(req.id, req.lines[0]!)).toBe(false)
    expect(rejectRequestLine(req.id, req.lines[1]!)).toBe(true)
  })

  it('drops a rejected line out of the rollup — its demand no longer stands', () => {
    seed('wo-dash-a', [
      line('mdf', 20),
      line('mdf', 8, { tag: 'adjustment', rejected: true }),
    ])
    expect(skuDemandGroups(mine())[0]!.required).toBe(20)
  })

  it('reports a request overdue when any of its lines is', () => {
    const req = seed('wo-dash-a', [
      line('mdf', 20, { reserved: 20 }),
      line('kaki', 5, { requiredDate: '2026-06-01' }),
    ])
    expect(isOverdue(req, TODAY)).toBe(true)
  })
})

describe('W-4 — the Awaiting tab', () => {
  /** The tab also asks whether the work order is still actionable, so use a real one. */
  const activeWorkOrderId = workOrders.find(w => w.status === 'not started')!.id

  beforeEach(() => {
    for (let i = stockRequests.length - 1; i >= 0; i--) {
      if (stockRequests[i]!.id === 'sr-tab-test') stockRequests.splice(i, 1)
    }
  })

  function seedForWorkOrder(lines: StockRequestLine[]): StockRequest {
    const req: StockRequest = {
      id: 'sr-tab-test',
      number: 'SR-2026-7000',
      workOrderId: activeWorkOrderId,
      workOrderNumber: 'WO-TAB',
      requestDate: '2026-06-20',
      lines,
    }
    stockRequests.push(req)
    return req
  }

  it('keeps a row that is not fully reserved', () => {
    const req = seedForWorkOrder([line('mdf', 20, { reserved: 5 })])
    expect(isAwaitingTab(req)).toBe(true)
  })

  it('drops a row once reserved + consumed reaches required', () => {
    const req = seedForWorkOrder([line('mdf', 20, { reserved: 12, consumed: 8 })])
    expect(isAwaitingTab(req)).toBe(false)
  })

  it('does NOT let free stock at the destination settle a row', () => {
    // Plenty available, nothing reserved: still the warehouse's to act on.
    const req = seedForWorkOrder([line('mdf', 20, { destAvailable: 500 })])
    expect(isAwaitingTab(req)).toBe(true)
  })

  it('keeps a request whose extra line was rejected but whose own demand still stands', () => {
    const req = seedForWorkOrder([
      line('mdf', 20, { reserved: 5 }),
      line('kaki', 4, { tag: 'adjustment', rejected: true }),
    ])
    expect(isAwaitingTab(req)).toBe(true)
    expect(isTerminalRequest(req)).toBe(false)
  })

  it('counts the same rows for the open-count badge', () => {
    const before = stockRequestOpenCount()
    seedForWorkOrder([line('mdf', 20)])
    expect(stockRequestOpenCount()).toBe(before + 1)
  })
})

/**
 * The Rejected / canceled tab — the two terminal statuses (W-3). They are not
 * work, so they sit apart from the tab the stockist works down, and they are no
 * longer offered in the Status filter either.
 */
describe('The Rejected / canceled tab', () => {
  const canceledWorkOrderId = workOrders.find(w => w.status === 'canceled')?.id
  const activeWorkOrderId = workOrders.find(w => w.status === 'not started')!.id

  beforeEach(() => {
    for (let i = stockRequests.length - 1; i >= 0; i--) {
      if (stockRequests[i]!.id === 'sr-terminal-test') stockRequests.splice(i, 1)
    }
  })

  function seedFor(workOrderId: string, lines: StockRequestLine[]): StockRequest {
    const req: StockRequest = {
      id: 'sr-terminal-test',
      number: 'SR-2026-7001',
      workOrderId,
      workOrderNumber: 'WO-TERMINAL',
      requestDate: '2026-06-20',
      lines,
    }
    stockRequests.push(req)
    return req
  }

  it('holds a request whose every line the stockist declined', () => {
    const req = seedFor(activeWorkOrderId, [line('mdf', 20, { tag: 'adjustment', rejected: true })])
    expect(isTerminalRequest(req)).toBe(true)
    expect(isAwaitingTab(req)).toBe(false)
  })

  it.runIf(!!canceledWorkOrderId)('holds a canceled work order\'s request', () => {
    const req = seedFor(canceledWorkOrderId!, [line('mdf', 20, { reserved: 5 })])
    expect(isTerminalRequest(req)).toBe(true)
    expect(isAwaitingTab(req)).toBe(false)
  })

  it('does not hold a request that is simply unfulfilled', () => {
    const req = seedFor(activeWorkOrderId, [line('mdf', 20)])
    expect(isTerminalRequest(req)).toBe(false)
  })

  it('no longer offers the two terminal statuses in the Status filter', () => {
    const values = stockRequestStatusOptions.map(o => o.value)
    expect(values).not.toContain('rejected')
    expect(values).not.toContain('canceled')
    expect(values).toEqual(['requested', 'partially reserved', 'reserved', 'issued / picked'])
  })
})
