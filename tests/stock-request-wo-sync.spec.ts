/**
 * The stock request follows its work order: a completed job closes the request, a
 * Return lowers Consumed to the work order\'s net, and a document raised from the
 * request is named on its log. Only requests that are still open feed a purchase
 * request or warehouse transfer.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  stockRequests, stockRequestStatus, requestLineStatus, lowestLineStatus, applyConsumption, applyReturn,
  shortfallLinesForRequest, shortfallLinesForProduct, logRequestDocument, lineCovered,
  type StockRequest, type StockRequestLine,
} from '~/data/stockRequests'
import { workOrders } from '~/data/workOrders'
import { activityLog } from '~/data/reservationActivityLog'

const REQ_ID = 'sr-wo-sync-test'
const wo = workOrders[0]!
const originalStatus = wo.status
// The seed already raised a request for this work order; sideline it so the one
// under test is the one found (requestForWorkOrder takes the first match).
const sidelined = stockRequests.filter(r => r.workOrderId === wo.id)

function line(productId: string, qty: number, o: Partial<StockRequestLine> = {}): StockRequestLine {
  return {
    productId, product: `Component ${productId}`, sku: productId, unit: 'Sack', qty, reserved: 0, consumed: 0,
    requiredDate: '2026-07-01', destAvailable: 0, destinationWarehouse: 'Gudang Jakarta Pusat',
    destinationWarehouseId: 'wh-1', requestor: 'Budi', ...o,
  }
}
function seed(lines: StockRequestLine[]): StockRequest {
  for (const r of sidelined) { const j = stockRequests.indexOf(r); if (j >= 0) stockRequests.splice(j, 1) }
  const i = stockRequests.findIndex(r => r.id === REQ_ID)
  if (i >= 0) stockRequests.splice(i, 1)
  const req = { id: REQ_ID, number: 'SR-2026-9997', workOrderId: wo.id, workOrderNumber: wo.number, requestDate: '2026-06-26', lines } as StockRequest
  stockRequests.push(req)
  return req
}
beforeEach(() => { activityLog.length = 0 })
afterEach(() => {
  wo.status = originalStatus
  const i = stockRequests.findIndex(r => r.id === REQ_ID)
  if (i >= 0) stockRequests.splice(i, 1)
  for (const r of sidelined) if (!stockRequests.includes(r)) stockRequests.push(r)
})

describe('work order completed', () => {
  it('closes the request and settles its lines even if less than planned was consumed', () => {
    const req = seed([line('a', 10, { consumed: 4 }), line('b', 5)])
    wo.status = 'in progress'
    expect(stockRequestStatus(req)).toBe('open')
    wo.status = 'completed'
    expect(stockRequestStatus(req)).toBe('completed')
    expect(req.lines.map(l => requestLineStatus(req, l))).toEqual(['fulfilled', 'fulfilled'])
    expect(lowestLineStatus(req)).toBe('fulfilled')
  })

  it('a completed request feeds no purchase request or transfer', () => {
    const req = seed([line('a', 10)])
    wo.status = 'in progress'
    expect(shortfallLinesForRequest(req.id)).toHaveLength(1)
    expect(shortfallLinesForProduct('a')).toHaveLength(1)
    wo.status = 'completed'
    expect(shortfallLinesForRequest(req.id)).toEqual([])
    expect(shortfallLinesForProduct('a')).toEqual([])
  })
})

describe('Return on the work order', () => {
  it('lowers Consumed to the net and puts the qty back into Available', () => {
    const req = seed([line('a', 10, { reserved: 10 })])
    wo.status = 'in progress'
    applyConsumption(wo.id, 'a', 8)
    const l = req.lines[0]!
    expect([l.reserved, l.consumed]).toEqual([2, 8])
    expect(applyReturn(wo.id, 'a', 3)).toBe(3)
    expect([l.reserved, l.consumed, l.destAvailable]).toEqual([2, 5, 3])
    expect(lineCovered(l)).toBe(7)
  })

  it('never returns more than was consumed, and logs what came back', () => {
    const req = seed([line('a', 10, { consumed: 2 })])
    expect(applyReturn(wo.id, 'a', 9)).toBe(2)
    expect(req.lines[0]!.consumed).toBe(0)
    const e = activityLog.find(x => x.subjectId === REQ_ID && x.activity === 'Returned material')
    expect(e?.details.find(d => d.label === 'Qty returned')?.value).toBe('2')
  })

  it('consuming beyond the reservation still counts on the request', () => {
    const req = seed([line('a', 10, { reserved: 2, destAvailable: 6 })])
    expect(applyConsumption(wo.id, 'a', 5)).toBe(5)
    const l = req.lines[0]!
    expect([l.reserved, l.consumed, l.destAvailable]).toEqual([0, 5, 3])
  })
})

describe('documents raised from a request', () => {
  it('writes the transfer / purchase request number to the request log', () => {
    seed([line('a', 10)])
    logRequestDocument(REQ_ID, 'warehouse-transfer', 'Warehouse Transfer #0091', [{ product: 'Component a', qty: 4, unit: 'Sack' }])
    logRequestDocument(REQ_ID, 'purchase-request', 'Purchase Request #90010', [{ product: 'Component a', qty: 6, unit: 'Sack' }])
    const mine = activityLog.filter(e => e.subjectId === REQ_ID && e.subjectType === 'stock-request')
    expect(mine.map(e => e.activity).sort()).toEqual(['Purchase request created', 'Warehouse transfer created'])
    expect(mine.find(e => e.activity === 'Warehouse transfer created')!.details[0]).toEqual({ label: 'Warehouse transfer', value: 'Warehouse Transfer #0091' })
    expect(mine.find(e => e.activity === 'Purchase request created')!.details[0]).toEqual({ label: 'Purchase request', value: 'Purchase Request #90010' })
  })
})
