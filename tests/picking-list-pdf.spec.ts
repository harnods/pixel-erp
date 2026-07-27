/**
 * generatePickingListPdf() builds a real jsPDF document (+ jspdf-autotable) and
 * returns it for the caller to preview/save (it doesn't save it itself — that's
 * the Print-preview modal's job). Beyond "runs without throwing", buildRows() is
 * exported specifically so row-count/merge behavior can be asserted directly —
 * a batch/serial-tracked SKU must still print as ONE row per SKU (matching
 * "Total SKU"), with every batch/serial it carries listed as multiple lines
 * WITHIN that row's own Batch/Serial no. and Bin location cells, not as
 * separate rows.
 */
import { describe, it, expect } from 'vitest'
import { addOutgoing, type OutgoingOrder } from '~/data/outgoing'
import { addPickingTask, getPickingTask, type PickingTask } from '~/data/pickingTasks'
import { getPickingLineItems } from '~/data/pickingTaskDetails'
import { generatePickingListPdf, buildRows } from '~/utils/pickingListPdf'

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

  it('generates a PDF for a batch-tracked SKU: still ONE row, every batch listed within it', async () => {
    const task = makeTaskForSku('1001', 'Green Beans Arabica Gayo Grade 1', 'Sack', 3)
    const items = getPickingLineItems(getPickingTask(task.id)!)
    const batches = items[0]!.plannedBatchPicks ?? []
    expect(batches.length).toBeGreaterThan(0)
    const rows = buildRows(items)
    expect(rows).toHaveLength(1) // one row for the whole SKU, not one per batch
    expect(rows[0]!.qty).toBe(3) // combined qty across every batch
    expect(rows[0]!.batchOrSerial.split('\n')).toHaveLength(batches.length)
    const doc = await generatePickingListPdf(task, items)
    expect(typeof doc.output).toBe('function')
  })

  it('generates a PDF for a serial-tracked SKU: still ONE row even with 2+ serials assigned', async () => {
    // qty=2 forces 2 distinct serials to be reserved for this line — the exact
    // scenario that used to print as 2 separate rows for the same SKU.
    const task = makeTaskForSku('2004', 'Espresso Machine Lever Manual 1-Group', 'Unit', 2)
    const items = getPickingLineItems(getPickingTask(task.id)!)
    const serials = items[0]!.plannedSerialPicks ?? []
    expect(serials.length).toBe(2)
    const rows = buildRows(items)
    expect(rows).toHaveLength(1) // one row for the whole SKU, not one per serial
    expect(rows[0]!.qty).toBe(2)
    expect(rows[0]!.batchOrSerial.split('\n')).toHaveLength(2)
    const doc = await generatePickingListPdf(task, items)
    expect(typeof doc.output).toBe('function')
  })

  it('does not throw for a task with no line items at all', async () => {
    const task = makeTaskForSku('3004', 'Coffee Scale 2kg / 0.1g', 'Unit', 1)
    const doc = await generatePickingListPdf(task, [])
    expect(typeof doc.output).toBe('function')
  })

  it('draws the canceled ribbon without throwing when the task is canceled', async () => {
    const task = makeTaskForSku('3004', 'Coffee Scale 2kg / 0.1g', 'Unit', 1)
    const items = getPickingLineItems(getPickingTask(task.id)!)
    const doc = await generatePickingListPdf({ ...task, status: 'canceled' }, items)
    expect(typeof doc.output).toBe('function')
  })
})
