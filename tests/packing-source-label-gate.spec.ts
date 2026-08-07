/**
 * D4 AC#8 — Source-label-gated packing start (`requireSourceLabel`, Configure
 * warehouse). A packing task for a marketplace order cannot move Open → In
 * Progress (Start Packing / Match Order) while the warehouse requires the
 * order-source shipping label and it hasn't arrived yet; the gate releases
 * automatically the moment the label lands, and non-marketplace orders are
 * never gated.
 */
import { describe, it, expect } from 'vitest'
import type { OutgoingOrder } from '~/data/outgoing'
import { outgoingOrders } from '~/data/outgoing'
import { addPackingTaskFromOrder, startPacking, getPackingTask } from '~/data/packingTasks'
import { packingBlockedOnSourceLabel } from '~/data/shippingLabels'

const WH = 'wh-006', WH_NAME = 'Gudang Makassar Selatan'
let seq = 0

function pushOrder(source: string, shippingLabel?: string): OutgoingOrder {
  seq++
  const o = {
    id: `out-gate-${seq}`, number: `OUT-GATE-${String(seq).padStart(4, '0')}`,
    salesNo: source === 'Sales Order' ? `Sales Order #${6000 + seq}` : `#SO${800 + seq}`,
    source, shippingLabel, warehouseId: WH, warehouseName: WH_NAME,
    skuQty: 1, orderQty: 1, shippedQty: 0, status: 'open', dueDate: '2026-08-01',
  } as OutgoingOrder
  outgoingOrders.push(o)
  return o
}
const mkt = (withLabel: boolean) => pushOrder('Shopee: Central Perk', withLabel ? `SPXID${2000 + seq}` : undefined)
const erp = () => pushOrder('Sales Order')

describe('packingBlockedOnSourceLabel — D4 AC#8', () => {
  it('marketplace order WITHOUT source label → blocked (warehouse defaults to Require ON)', () => {
    const o = mkt(false)
    expect(packingBlockedOnSourceLabel(o)).toBe(true)
  })

  it('marketplace order WITH source label → not blocked', () => {
    const o = mkt(true)
    expect(packingBlockedOnSourceLabel(o)).toBe(false)
  })

  it('non-marketplace (ERP/manual) order → never blocked, even with no shippingLabel field', () => {
    const o = erp()
    expect(packingBlockedOnSourceLabel(o)).toBe(false)
  })

  it('undefined order → not blocked (nothing to gate)', () => {
    expect(packingBlockedOnSourceLabel(undefined)).toBe(false)
  })
})

describe('startPacking() — refuses to start while D4 AC#8 gates the task', () => {
  it('marketplace order waiting for its source label: task stays Open', () => {
    const o = mkt(false)
    const task = addPackingTaskFromOrder({
      salesOrderId: o.id, salesNo: o.salesNo, warehouseId: o.warehouseId,
      warehouseName: o.warehouseName, assignee: 'Test operator',
    })
    expect(task.status).toBe('open')
    startPacking(task.id)
    expect(getPackingTask(task.id)?.status).toBe('open')
    expect(getPackingTask(task.id)?.startDate).toBeUndefined()
  })

  it('gate releases the moment the source label lands', () => {
    const o = mkt(false)
    const task = addPackingTaskFromOrder({
      salesOrderId: o.id, salesNo: o.salesNo, warehouseId: o.warehouseId,
      warehouseName: o.warehouseName, assignee: 'Test operator',
    })
    startPacking(task.id)
    expect(getPackingTask(task.id)?.status).toBe('open') // still gated

    o.shippingLabel = 'SPXID99999999' // A7 write-back lands
    startPacking(task.id)
    expect(getPackingTask(task.id)?.status).toBe('in progress')
  })

  it('marketplace order WITH its label already: starts normally', () => {
    const o = mkt(true)
    const task = addPackingTaskFromOrder({
      salesOrderId: o.id, salesNo: o.salesNo, warehouseId: o.warehouseId,
      warehouseName: o.warehouseName, assignee: 'Test operator',
    })
    startPacking(task.id)
    expect(getPackingTask(task.id)?.status).toBe('in progress')
  })

  it('non-marketplace order: never gated, starts normally', () => {
    const o = erp()
    const task = addPackingTaskFromOrder({
      salesOrderId: o.id, salesNo: o.salesNo, warehouseId: o.warehouseId,
      warehouseName: o.warehouseName, assignee: 'Test operator',
    })
    startPacking(task.id)
    expect(getPackingTask(task.id)?.status).toBe('in progress')
  })
})
