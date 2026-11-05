/**
 * A stock request's "Available qty" follows the warehouse it is read from.
 *
 * A line used to carry a stored snapshot that only Reserve / Unreserve moved, so a
 * stock adjustment or a warehouse transfer left an out-of-stock line out of stock.
 * Every route that changes on-hand (applyStockInOut, applyStockCount, applyTransfer)
 * now reaches the lines drawing on that warehouse and SKU.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  stockRequests, raiseStockRequestForWorkOrder, reserveRequestProducts, unreserveRequestProducts,
  type WorkOrderMaterialLine,
} from '~/data/stockRequests'
import { applyStockInOut, applyStockCount, applyTransfer, onHandForSku } from '~/data/warehouseDetails'

const WO_ID = 'wo-stock-link-test'
const SKU = '1001'
const PRODUCT = 'p01'

const material = (warehouseId: string): WorkOrderMaterialLine => ({
  productId: PRODUCT, product: 'Component', sku: SKU, unit: 'Sack', qty: 10,
  requiredDate: '2026-07-08', destinationWarehouse: warehouseId, destinationWarehouseId: warehouseId,
})

function raise(warehouseId: string, available: number) {
  const { request } = raiseStockRequestForWorkOrder({
    workOrderId: WO_ID, workOrderNumber: 'WO-2026-0099', requestor: 'Bima',
    requestDate: '2026-10-01', lines: [material(warehouseId)],
  }, { autoReserve: false })
  request.lines[0]!.destAvailable = available
  return request
}
const line = () => stockRequests.find(r => r.workOrderId === WO_ID)!.lines[0]!

beforeEach(() => {
  const i = stockRequests.findIndex(r => r.workOrderId === WO_ID)
  if (i >= 0) stockRequests.splice(i, 1)
})

describe('stock request availability follows warehouse stock', () => {
  it('a stock-in on an out-of-stock line makes it reservable', () => {
    const req = raise('wh-1', 0)
    applyStockInOut('wh-1', [{ sku: SKU, qty: 6 }])
    expect(line().destAvailable).toBe(6)
    reserveRequestProducts(req.id, [PRODUCT], { source: 'manual' })
    expect(line().reserved).toBe(6)
  })

  it('a stock-out lowers it and never goes below zero', () => {
    raise('wh-1', 4)
    applyStockInOut('wh-1', [{ sku: SKU, qty: -3 }])
    expect(line().destAvailable).toBe(1)
    applyStockInOut('wh-1', [{ sku: SKU, qty: -500 }])
    expect(line().destAvailable).toBe(0)
  })

  it('a stock count moves it by the difference from what was on hand', () => {
    raise('wh-1', 2)
    const before = onHandForSku('wh-1', SKU)
    applyStockCount('wh-1', [{ sku: SKU, qty: before + 5 }])
    expect(line().destAvailable).toBe(7)
  })

  it('a warehouse transfer adds at the destination and removes at the origin', () => {
    raise('wh-2', 0)
    applyStockInOut('wh-1', [{ sku: SKU, qty: 20 }])
    applyTransfer('wh-1', 'wh-2', [{ sku: SKU, qty: 8 }])
    expect(line().destAvailable).toBe(8)
    applyTransfer('wh-2', 'wh-1', [{ sku: SKU, qty: 3 }])
    expect(line().destAvailable).toBe(5)
  })

  it('ignores stock moving at other warehouses or other SKUs', () => {
    raise('wh-1', 4)
    applyStockInOut('wh-2', [{ sku: SKU, qty: 9 }])
    applyStockInOut('wh-1', [{ sku: '1002', qty: 9 }])
    expect(line().destAvailable).toBe(4)
  })

  it('reserve then unreserve still round-trips alongside stock changes', () => {
    const req = raise('wh-1', 5)
    reserveRequestProducts(req.id, [PRODUCT], { source: 'manual' })
    expect(line().destAvailable).toBe(0)
    applyStockInOut('wh-1', [{ sku: SKU, qty: 4 }])
    expect(line().destAvailable).toBe(4)
    unreserveRequestProducts(req.id, [PRODUCT])
    expect(line().destAvailable).toBe(9)
  })
})
