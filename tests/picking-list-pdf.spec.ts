/**
 * generatePickingListPdf() builds a real jsPDF document (+ jspdf-autotable) and
 * returns it for the caller to preview/save (it doesn't save it itself — that's
 * the Print-preview modal's job). These tests can't practically inspect the
 * rendered PDF's pixel content, so they verify the thing that's actually at risk
 * of breaking: the function runs without throwing across every line-item shape
 * it has to flatten (plain SKU, batch-tracked, serial-tracked, no lines at all),
 * and returns a real document each time.
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
  it('generates a PDF for a plain (non-batch/serial) SKU without throwing', async () => {
    const task = makeTaskForSku('3004', 'Coffee Scale 2kg / 0.1g', 'Unit', 2)
    const items = getPickingLineItems(getPickingTask(task.id)!)
    expect(items.some((i) => !i.batchPicks?.length && !i.serialPicks?.length)).toBe(true)
    const doc = await generatePickingListPdf(task, items)
    expect(typeof doc.output).toBe('function')
  })

  it('generates a PDF for a batch-tracked SKU, flattening one row per batch', async () => {
    const task = makeTaskForSku('1001', 'Green Beans Arabica Gayo Grade 1', 'Sack', 3)
    const items = getPickingLineItems(getPickingTask(task.id)!)
    expect(items.some((i) => (i.plannedBatchPicks?.length ?? 0) > 0)).toBe(true)
    const doc = await generatePickingListPdf(task, items)
    expect(typeof doc.output).toBe('function')
  })

  it('generates a PDF for a serial-tracked SKU, flattening one row per serial', async () => {
    const task = makeTaskForSku('2004', 'Espresso Machine Lever Manual 1-Group', 'Unit', 1)
    const items = getPickingLineItems(getPickingTask(task.id)!)
    expect(items.some((i) => (i.plannedSerialPicks?.length ?? 0) > 0)).toBe(true)
    const doc = await generatePickingListPdf(task, items)
    expect(typeof doc.output).toBe('function')
  })

  it('does not throw for a task with no line items at all', async () => {
    const task = makeTaskForSku('3004', 'Coffee Scale 2kg / 0.1g', 'Unit', 1)
    const doc = await generatePickingListPdf(task, [])
    expect(typeof doc.output).toBe('function')
  })
})
