/**
 * Work order raw materials are the ones it was CREATED with, not its BOM's.
 *
 * The BOM only seeds New work order › Raw materials. Where the BOM allows
 * adjustment the user can add, remove and re-quantify components and pick a
 * warehouse per row — and those rows went to the stock request but were never
 * stored on the work order, so its detail page and the material consume / return
 * form listed the BOM instead.
 *
 * Covers:
 *   • a work order with stored rows lists exactly those rows;
 *   • one that predates storing them (the seed) still falls back to its BOM;
 *   • the live need and reservation come from the stock request, matched per row
 *     by product AND warehouse, with rejected lines left out.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { workOrders, workOrderRawMaterials, workOrderProductionCost, workOrderRouting, type WorkOrder } from '~/data/workOrders'
import { billOfMaterials } from '~/data/billOfMaterials'
import {
  stockRequests, raiseStockRequestForWorkOrder, workOrderMaterials,
  type WorkOrderMaterialLine,
} from '~/data/stockRequests'

const WO_ID = 'wo-raw-as-created-test'

function line(productId: string, qty: number, warehouseId: string): WorkOrderMaterialLine {
  return {
    productId, product: `Component ${productId}`, sku: productId, unit: 'Sack', qty,
    requiredDate: '2026-10-20',
    destinationWarehouse: `Warehouse ${warehouseId}`, destinationWarehouseId: warehouseId,
  }
}

/** A work order built on a real seeded one, so its BOM fallback is real too. */
function makeWorkOrder(rawMaterials?: WorkOrder['rawMaterials']): WorkOrder {
  const base = workOrders[0]!
  return { ...base, id: WO_ID, number: 'WO-TEST-0001', status: 'not started', rawMaterials }
}

function clear() {
  for (let i = stockRequests.length - 1; i >= 0; i--) {
    if (stockRequests[i]!.workOrderId === WO_ID) stockRequests.splice(i, 1)
  }
}
beforeEach(clear)
afterEach(clear)

describe('workOrderRawMaterials — stored rows, with a BOM fallback', () => {
  it('a work order that predates stored rows lists its BOM', () => {
    const wo = makeWorkOrder(undefined)
    const bom = billOfMaterials.find(b => b.id === wo.bomId)!
    expect(workOrderRawMaterials(wo).map(r => [r.productId, r.needed]))
      .toEqual(bom.rawMaterials.map(r => [r.productId, r.needed]))
  })

  it('a created work order lists exactly its own rows — added, removed and re-quantified', () => {
    const bom = billOfMaterials.find(b => b.id === workOrders[0]!.bomId)!
    const kept = bom.rawMaterials[0]!
    const rows = [
      // a BOM component at a different qty, from a chosen warehouse
      { productId: kept.productId, needed: kept.needed + 7, unit: kept.unit, purchaseCost: kept.purchaseCost, warehouseId: 'wh-002' },
      // a component the BOM does not have at all
      { productId: 'p-added-by-user', needed: 3, unit: 'Pcs', purchaseCost: 1000, warehouseId: 'wh-001' },
    ]
    const result = workOrderRawMaterials(makeWorkOrder(rows))

    expect(result).toEqual(rows)
    // every other BOM component was removed in the form, so it must not come back
    for (const removed of bom.rawMaterials.slice(1)) {
      expect(result.some(r => r.productId === removed.productId)).toBe(false)
    }
  })

  it('a work order saved with every row removed has no raw materials, not the BOM', () => {
    expect(workOrderRawMaterials(makeWorkOrder([]))).toEqual([])
  })
})

describe('workOrderMaterials — live need and reservation, per row', () => {
  it('matches each row to its request lines by product AND warehouse', () => {
    // The creation form allows one product from two warehouses: two rows, two lines.
    const wo = makeWorkOrder([
      { productId: 'p-dup', needed: 3, unit: 'Sack', purchaseCost: 0, warehouseId: 'wh-001' },
      { productId: 'p-dup', needed: 5, unit: 'Sack', purchaseCost: 0, warehouseId: 'wh-002' },
    ])
    const { request } = raiseStockRequestForWorkOrder({
      workOrderId: WO_ID, workOrderNumber: wo.number, requestor: 'Test', requestDate: '2026-10-06',
      lines: [line('p-dup', 3, 'wh-001'), line('p-dup', 5, 'wh-002')],
    }, { autoReserve: false })
    request.lines[0]!.reserved = 2 // reserved at wh-001 only

    const [a, b] = workOrderMaterials(wo)
    expect([a!.needed, a!.reserved]).toEqual([3, 2])
    expect([b!.needed, b!.reserved]).toEqual([5, 0])
  })

  it('follows the request when Edit / Adjust has changed the need, and keeps the as-created qty', () => {
    const wo = makeWorkOrder([{ productId: 'p-a', needed: 4, unit: 'Sack', purchaseCost: 0, warehouseId: 'wh-001' }])
    const { request } = raiseStockRequestForWorkOrder({
      workOrderId: WO_ID, workOrderNumber: wo.number, requestor: 'Test', requestDate: '2026-10-06',
      lines: [line('p-a', 4, 'wh-001')],
    }, { autoReserve: false })
    // an Adjust delta lands as its own line on the same request
    request.lines.push({ ...request.lines[0]!, qty: 6, tag: 'adjustment' })

    const [m] = workOrderMaterials(wo)
    expect(m!.needed).toBe(10)
    expect(m!.plannedNeeded).toBe(4)
  })

  it('leaves a rejected line out of the need', () => {
    const wo = makeWorkOrder([{ productId: 'p-r', needed: 4, unit: 'Sack', purchaseCost: 0, warehouseId: 'wh-001' }])
    const { request } = raiseStockRequestForWorkOrder({
      workOrderId: WO_ID, workOrderNumber: wo.number, requestor: 'Test', requestDate: '2026-10-06',
      lines: [line('p-r', 4, 'wh-001')],
    }, { autoReserve: false })
    request.lines.push({ ...request.lines[0]!, qty: 2, tag: 'adjustment', rejected: true })

    expect(workOrderMaterials(wo)[0]!.needed).toBe(4)
  })
})

describe('production cost and routing — stored lines, with a BOM fallback', () => {
  it('a work order that predates stored lines shows its BOM (one unit at multiplier 1)', () => {
    const wo = makeWorkOrder(undefined)
    const bom = billOfMaterials.find(b => b.id === wo.bomId)!
    expect(workOrderProductionCost(wo)).toEqual(bom.productionCost.map(c => ({
      group: c.group, account: c.account, costDriver: c.costDriver, unitCost: c.amount, multiplier: 1,
    })))
    expect(workOrderRouting(wo)).toEqual(bom.routing)
  })

  it('a created work order shows exactly its own lines, including two in the same group', () => {
    const cost: WorkOrder['productionCost'] = [
      { group: 'Labor', account: 'Direct labor', costDriver: 'Labor hour', unitCost: 40_000, multiplier: 3 },
      { group: 'Labor', account: 'Worker', costDriver: 'Person', unitCost: 50_000, multiplier: 1 },
    ]
    const routing: WorkOrder['routing'] = [
      { process: 'Quality control', description: 'Final check', accountMapping: 'Routing cost', amount: 12_000 },
    ]
    const wo = { ...makeWorkOrder(undefined), productionCost: cost, routing }
    expect(workOrderProductionCost(wo)).toEqual(cost)
    expect(workOrderRouting(wo)).toEqual(routing)
  })

  it('a work order saved with every cost line and routing step removed has none, not the BOM\'s', () => {
    const wo = { ...makeWorkOrder(undefined), productionCost: [], routing: [] }
    expect(workOrderProductionCost(wo)).toEqual([])
    expect(workOrderRouting(wo)).toEqual([])
  })
})
