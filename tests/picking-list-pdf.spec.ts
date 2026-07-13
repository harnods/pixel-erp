/**
 * generatePickingListPdf() builds a real, downloadable PDF document (jsPDF +
 * jspdf-autotable) — not a screenshot/copy of the on-screen picking details page.
 * These tests can't practically inspect the rendered PDF's pixel content, so they
 * verify the thing that's actually at risk of breaking: the function runs without
 * throwing across every line-item shape it has to flatten (plain SKU, batch-
 * tracked, serial-tracked, and a task with no lines at all).
 */
import { describe, it, expect } from 'vitest'
import { addOutgoing, type OutgoingOrder } from '~/data/outgoing'
import { addPickingTask, getPickingTask, type PickingTask } from '~/data/pickingTasks'
import { getPickingLineItems } from '~/data/pickingTaskDetails'
import { generatePickingListPdf } from '~/utils/pickingListPdf'

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'

function makeTaskForSku(sku: string, productName: string, unit: string, qty: number): PickingTask {
  const order: OutgoingOrder = addOutgoing({
    salesNo: `Test PDF Order ${sku}`, source: 'Manual',
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: 1, orderQty: qty, shippedQty: 0, status: 'open', dueDate: '2026-08-01',
    lines: [{ sku, productName, desc: '', img: '', unit, qty }],
  })
  return addPickingTask({
    salesOrderIds: [order.id], salesNos: [order.salesNo],
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
  })
}

describe('generatePickingListPdf', () => {
  it('generates a PDF for a plain (non-batch/serial) SKU without throwing', () => {
    const task = makeTaskForSku('3004', 'Coffee Scale 2kg / 0.1g', 'Unit', 2)
    const items = getPickingLineItems(getPickingTask(task.id)!)
    expect(items.some((i) => !i.batchPicks?.length && !i.serialPicks?.length)).toBe(true)
    expect(() => generatePickingListPdf(task, items)).not.toThrow()
  })

  it('generates a PDF for a batch-tracked SKU, flattening one row per batch', () => {
    const task = makeTaskForSku('1001', 'Green Beans Arabica Gayo Grade 1', 'Sack', 3)
    const items = getPickingLineItems(getPickingTask(task.id)!)
    expect(items.some((i) => (i.plannedBatchPicks?.length ?? 0) > 0)).toBe(true)
    expect(() => generatePickingListPdf(task, items)).not.toThrow()
  })

  it('generates a PDF for a serial-tracked SKU, flattening one row per serial', () => {
    const task = makeTaskForSku('2004', 'Espresso Machine Lever Manual 1-Group', 'Unit', 1)
    const items = getPickingLineItems(getPickingTask(task.id)!)
    expect(items.some((i) => (i.plannedSerialPicks?.length ?? 0) > 0)).toBe(true)
    expect(() => generatePickingListPdf(task, items)).not.toThrow()
  })

  it('does not throw for a task with no line items at all', () => {
    const task = makeTaskForSku('3004', 'Coffee Scale 2kg / 0.1g', 'Unit', 1)
    expect(() => generatePickingListPdf(task, [])).not.toThrow()
  })
})
