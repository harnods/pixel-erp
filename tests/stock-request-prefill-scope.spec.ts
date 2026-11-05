/**
 * Create purchase request / warehouse transfer from a stock request warehouse group
 * carries only THAT group's short lines, at the qty still missing.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { stockRequests, shortfallLinesForRequest, lineToTransfer, type StockRequest } from '~/data/stockRequests'

const REQ_ID = 'sr-prefill-scope-test'

function seed(): StockRequest {
  const line = (productId: string, warehouseId: string, qty: number, destAvailable: number) => ({
    productId, product: `Product ${productId}`, sku: productId, unit: 'Sack', qty,
    requiredDate: '2026-07-08', destinationWarehouse: warehouseId, destinationWarehouseId: warehouseId,
    reserved: 0, consumed: 0, destAvailable, requestor: 'Bima',
  })
  const request = {
    id: REQ_ID, number: 'SR-2026-9999', workOrderId: 'wo-x', workOrderNumber: 'WO-2026-0099', requestDate: '2026-10-01',
    lines: [line('a', 'wh-1', 10, 4), line('b', 'wh-1', 5, 5), line('c', 'wh-2', 8, 0)],
  } as unknown as StockRequest
  stockRequests.push(request)
  return request
}

beforeEach(() => {
  const i = stockRequests.findIndex(r => r.id === REQ_ID)
  if (i >= 0) stockRequests.splice(i, 1)
  seed()
})

describe('shortfall prefill scope', () => {
  it('whole request: every short line, at the missing qty', () => {
    const lines = shortfallLinesForRequest(REQ_ID)
    expect(lines.map(l => [l.sku, l.qty])).toEqual([['a', 6], ['c', 8]])
  })

  it('one warehouse group: only that group\'s short lines', () => {
    expect(shortfallLinesForRequest(REQ_ID, 'wh-1').map(l => [l.sku, l.qty, l.destinationWarehouseId])).toEqual([['a', 6, 'wh-1']])
    expect(shortfallLinesForRequest(REQ_ID, 'wh-2').map(l => [l.sku, l.qty])).toEqual([['c', 8]])
  })

  it('a group with no shortfall prefills nothing', () => {
    const req = stockRequests.find(r => r.id === REQ_ID)!
    req.lines.filter(l => l.destinationWarehouseId === 'wh-1').forEach(l => { l.destAvailable = l.qty })
    expect(shortfallLinesForRequest(REQ_ID, 'wh-1')).toEqual([])
    expect(req.lines.filter(l => l.destinationWarehouseId === 'wh-1').every(l => lineToTransfer(l) === 0)).toBe(true)
  })
})
