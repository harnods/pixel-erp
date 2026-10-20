/**
 * Cancel work order — on a subcon order, raw material already at the vendor is
 * listed and returned to the warehouses the user picks (one draft transfer per
 * warehouse). Hidden once the subcon PO for the vendor's work is issued.
 */
import { describe, it, expect } from 'vitest'
import { workOrders, type WorkOrder, type RaisedSubconDocument } from '../app/data/workOrders'
import { billOfMaterials, catalogProduct } from '../app/data/billOfMaterials'
import { warehouseTransfers } from '../app/data/warehouseTransfers'
import { canCancelWorkOrder, subconReturnLines, cancelWorkOrder, returnWarehouseOptions } from '../app/data/subconCancel'

const base = workOrders.find(w => w.category === 'Subcontracting' && w.subcon?.method === 'resupply')!
const bom = billOfMaterials.find(b => b.id === base.bomId)!
const skus = bom.rawMaterials.map(r => catalogProduct(r.productId)!.sku)
const VENDOR_WH = base.subcon!.subconWarehouseId
const [WH_A, WH_B] = returnWarehouseOptions().map(w => w.id)

let seq = 0
function order(docs: RaisedSubconDocument[] = [], over: Partial<WorkOrder> = {}): WorkOrder {
  seq += 1
  const wo: WorkOrder = {
    ...base, id: `wo-cancel-${seq}`, number: `WO-CANCEL-${seq}`, status: 'waiting rm procurement', ...over,
    subcon: { ...base.subcon!, raisedDocuments: docs, componentReceipts: {} },
  }
  workOrders.push(wo)
  return wo
}
function transfer(id: string, status: string, qty = 5): RaisedSubconDocument {
  warehouseTransfers.push({
    id, number: id, originId: WH_A, originName: 'A', destinationId: VENDOR_WH, destinationName: 'Vendor',
    status, date: '2026-06-01', tags: [], lines: skus.map(sku => ({ sku, qty })),
  } as never)
  return { kind: 'transfer', id, number: id, route: '/warehouse-transfers' }
}

describe('canCancelWorkOrder', () => {
  it('is offered on a subcon order before the subcon PO', () => {
    expect(canCancelWorkOrder(order())).toBe(true)
  })
  it('is hidden once the subcon PO for the work is issued', () => {
    const po: RaisedSubconDocument = { kind: 'purchaseOrder', id: 'PO-X', number: 'PO-X', route: '/purchase-orders', fromKind: 'subconPr' }
    expect(canCancelWorkOrder(order([po]))).toBe(false)
  })
  it('a component purchase order does not hide it — it buys material, not the work', () => {
    const po: RaisedSubconDocument = { kind: 'purchaseOrder', id: 'PO-C', number: 'PO-C', route: '/purchase-orders', fromKind: 'componentPr' }
    expect(canCancelWorkOrder(order([po]))).toBe(true)
  })
  it('is not offered once production started, completed or canceled', () => {
    expect(canCancelWorkOrder(order([], { status: 'in progress' }))).toBe(false)
    expect(canCancelWorkOrder(order([], { status: 'completed' }))).toBe(false)
    expect(canCancelWorkOrder(order([], { status: 'canceled' }))).toBe(false)
  })
})

describe('subconReturnLines', () => {
  it('is empty when nothing reached the vendor — a draft transfer moved nothing', () => {
    expect(subconReturnLines(order([transfer('wt-c-draft', 'draft')]))).toEqual([])
  })
  it('lists each raw material at the vendor, defaulting to the warehouse it came from', () => {
    const lines = subconReturnLines(order([transfer('wt-c-ok', 'approved', 7)]))
    expect(lines.map(l => l.sku)).toEqual(skus)
    for (const l of lines) {
      expect(l.qty).toBe(7)
      expect(l.defaultWarehouseId).toBe(WH_A)
    }
  })
})

describe('cancelWorkOrder', () => {
  it('cancels, raises one draft return transfer per chosen warehouse, and withdraws pending ones', () => {
    const wo = order([transfer('wt-c-sent', 'approved', 4), transfer('wt-c-pending', 'draft')])
    const lines = subconReturnLines(wo)
    const raised = cancelWorkOrder(wo.id, lines.map((l, i) => ({ sku: l.sku, qty: l.qty, warehouseId: i === 0 ? WH_A! : WH_B! })))

    expect(wo.status).toBe('canceled')
    expect(raised).toHaveLength(Math.min(2, lines.length))
    for (const r of raised) {
      const tr = warehouseTransfers.find(t => t.id === r.id)!
      expect(tr.status).toBe('draft')
      expect(tr.originId).toBe(VENDOR_WH)
      expect([WH_A, WH_B]).toContain(tr.destinationId)
    }
    expect(wo.subcon!.raisedDocuments!.filter(d => d.kind === 'returnTransfer')).toHaveLength(raised.length)
    expect(warehouseTransfers.find(t => t.id === 'wt-c-pending')!.status).toBe('canceled')
  })
  it('with nothing at the vendor just cancels', () => {
    const wo = order()
    expect(cancelWorkOrder(wo.id)).toEqual([])
    expect(wo.status).toBe('canceled')
  })
  it('does nothing once the subcon PO is issued', () => {
    const po: RaisedSubconDocument = { kind: 'purchaseOrder', id: 'PO-Y', number: 'PO-Y', route: '/purchase-orders', fromKind: 'subconPr' }
    const wo = order([po])
    expect(cancelWorkOrder(wo.id)).toEqual([])
    expect(wo.status).toBe('waiting rm procurement')
  })
})
