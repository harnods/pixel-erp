/**
 * PRD v0.6 — the stock effects of Cancel, Delete and Return.
 *
 *   • UC-09 — Cancel and Delete have the SAME effect on stock: the remaining
 *     reservation is released and consumption is reversed by deleting the work
 *     order's stock adjustments (its consume / return records). The stock request
 *     stays, as Canceled. A cancelled work order can be deleted, and that moves
 *     no stock.
 *   • R-6 — the figures the confirmation names are what actually moves.
 *   • UC-08 — a Return does not go back to this work order's reservation: the qty
 *     goes to available stock. The request's Consumed follows the work order's
 *     net (PRD OPEN-33 first froze it, which left the two pages disagreeing).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { workOrders, type WorkOrder } from '~/data/workOrders'
import {
  stockRequests, raiseStockRequestForWorkOrder, requestForWorkOrder, stockRequestStatus,
  type WorkOrderMaterialLine,
} from '~/data/stockRequests'
import {
  addMaterialConsumeReturnRecord, recordsForWorkOrder, materialConsumeReturnRecords,
} from '~/data/materialConsumeReturn'
import { cancelWorkOrder, deleteWorkOrder, previewStockReversal } from '~/data/woApproval'

const WO_ID = 'wo-v06-test'

function material(productId: string, qty: number): WorkOrderMaterialLine {
  return {
    productId, product: `Component ${productId}`, sku: productId, unit: 'Unit', qty,
    requiredDate: '2026-11-10', destinationWarehouse: 'Gudang Jakarta Pusat', destinationWarehouseId: 'wh-001',
  }
}

/** A running work order: MDF 20 (12 reserved, then 5 consumed) and Baut 10 (10 reserved). */
function runningWorkOrder(): WorkOrder {
  for (let i = workOrders.length - 1; i >= 0; i--) if (workOrders[i]!.id === WO_ID) workOrders.splice(i, 1)
  for (let i = stockRequests.length - 1; i >= 0; i--) if (stockRequests[i]!.workOrderId === WO_ID) stockRequests.splice(i, 1)
  for (let i = materialConsumeReturnRecords.length - 1; i >= 0; i--) {
    if (materialConsumeReturnRecords[i]!.workOrderId === WO_ID) materialConsumeReturnRecords.splice(i, 1)
  }
  const wo = {
    id: WO_ID, number: 'WO-V06', bomId: '', bomName: '', category: 'Standard', type: 'Assembly',
    trackRouting: false, status: 'in progress', producedQty: 0, plannedQty: 1,
    planStartDate: '2026-11-01', planEndDate: '2026-11-30',
    reservation: { on: true, method: 'one-step' },
  } as WorkOrder
  workOrders.push(wo)
  const { request } = raiseStockRequestForWorkOrder({
    workOrderId: WO_ID, workOrderNumber: wo.number, requestor: 'Bima', requestDate: '2026-11-01',
    lines: [material('mdf', 20), material('baut', 10)],
  }, { autoReserve: false })
  request.lines[0]!.reserved = 12
  request.lines[1]!.reserved = 10
  addMaterialConsumeReturnRecord({
    workOrderId: WO_ID, type: 'Consume', productId: 'mdf', date: '2026-11-02', qty: 5,
    unit: 'Unit', warehouseId: 'wh-001', memo: '', recordedBy: 'Test',
  })
  return wo
}

const line = (productId: string) => requestForWorkOrder(WO_ID)!.lines.find(l => l.productId === productId)!

beforeEach(() => { runningWorkOrder() })

describe('UC-05 — consuming draws the reservation down', () => {
  it('moves the consumed qty from Reserved to issued on the request line', () => {
    expect(line('mdf')).toMatchObject({ reserved: 7, consumed: 5 })
  })
})

describe('UC-08 — a Return lowers Consumed and goes to Available, not back to the reservation', () => {
  it('leaves reserved as it was, lowers consumed to the net, and adds the qty to available', () => {
    const availableBefore = line('mdf').destAvailable
    addMaterialConsumeReturnRecord({
      workOrderId: WO_ID, type: 'Return', productId: 'mdf', date: '2026-11-03', qty: -2,
      unit: 'Unit', warehouseId: 'wh-001', memo: '', recordedBy: 'Test',
    })
    expect(line('mdf')).toMatchObject({ reserved: 7, consumed: 3, destAvailable: availableBefore + 2 })
  })
})

describe('UC-09 — Cancel and Delete reverse reservation and consumption', () => {
  it('the confirmation preview names what will move (R-6)', () => {
    const wo = workOrders.find(w => w.id === WO_ID)!
    expect(previewStockReversal(wo)).toEqual({ releasedQty: 7 + 10, restoredQty: 5 })
  })

  it('Cancel releases the reservation, deletes the stock adjustments, and leaves the request Canceled', () => {
    const wo = workOrders.find(w => w.id === WO_ID)!
    const r = cancelWorkOrder(wo, { user: 'Test' })
    expect(r).toEqual({ releasedQty: 17, restoredQty: 5 })
    expect(wo.status).toBe('canceled')
    expect(recordsForWorkOrder(WO_ID)).toHaveLength(0)
    expect(line('mdf')).toMatchObject({ reserved: 0, consumed: 0 })
    expect(line('baut').reserved).toBe(0)
    expect(stockRequestStatus(requestForWorkOrder(WO_ID)!)).toBe('canceled')
  })

  it('a cancelled work order can be deleted, and that moves no stock', () => {
    const wo = workOrders.find(w => w.id === WO_ID)!
    cancelWorkOrder(wo, { user: 'Test' })
    expect(previewStockReversal(wo)).toEqual({ releasedQty: 0, restoredQty: 0 })
    expect(deleteWorkOrder(wo, { user: 'Test' })).toEqual({ releasedQty: 0, restoredQty: 0 })
    expect(workOrders.some(w => w.id === WO_ID)).toBe(false)
    expect(stockRequestStatus(requestForWorkOrder(WO_ID)!)).toBe('canceled')
  })

  it('Delete has the same effect on stock as Cancel, then removes the work order', () => {
    const wo = workOrders.find(w => w.id === WO_ID)!
    wo.status = 'completed'
    const r = deleteWorkOrder(wo, { user: 'Test' })
    expect(r).toEqual({ releasedQty: 17, restoredQty: 5 })
    expect(workOrders.some(w => w.id === WO_ID)).toBe(false)
    expect(recordsForWorkOrder(WO_ID)).toHaveLength(0)
    // The request stays listed, as Canceled (W-3).
    const req = requestForWorkOrder(WO_ID)!
    expect(req.workOrderDeleted).toBe(true)
    expect(stockRequestStatus(req)).toBe('canceled')
  })
})
