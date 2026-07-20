/**
 * generatePackingListPdf() builds a real jsPDF document (+ jspdf-autotable) and
 * returns it for the caller to preview/save (it doesn't save it itself — that's
 * the Print-preview modal's job) — the sorting reference for "Match order" (one
 * document per packing task = one order), not a screenshot/copy of the on-screen
 * packing details page. These tests can't practically inspect the rendered PDF's
 * pixel content, so they verify the thing actually at risk of breaking: the
 * function runs without throwing across every line-item shape it has to flatten.
 */
import { describe, it, expect } from 'vitest'
import { addOutgoing, type OutgoingOrder } from '~/data/outgoing'
import { addPickingTask, startPicking, endPicking } from '~/data/pickingTasks'
import { addPackingTask, getPackingTask, type PackingTask } from '~/data/packingTasks'
import { getPackingLineItems } from '~/data/packingTaskDetails'
import { generatePackingListPdf } from '~/utils/packingListPdf'

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'

function makePackingTaskForSku(sku: string, productName: string, unit: string, qty: number): { task: PackingTask; order: OutgoingOrder } {
  const order = addOutgoing({
    salesNo: `Test Packing PDF Order ${sku}`, source: 'Manual',
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: 1, orderQty: qty, shippedQty: 0, status: 'open', dueDate: '2026-08-01',
    customer: 'Test Customer',
    lines: [{ sku, productName, desc: '', img: '', unit, qty }],
  })
  const pick = addPickingTask({
    salesOrderIds: [order.id], salesNos: [order.salesNo],
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
  })
  startPicking(pick.id)
  const lineKey = `${order.id}::${sku}`
  endPicking(pick.id, { [lineKey]: qty })
  const pack = addPackingTask({
    salesOrderId: order.id, salesNo: order.salesNo,
    pickingTaskId: pick.id, pickingTaskNo: pick.taskNo,
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
  })
  return { task: pack, order }
}

describe('generatePackingListPdf', () => {
  it('generates a PDF for a plain (non-batch/serial) SKU without throwing', async () => {
    const { task, order } = makePackingTaskForSku('3004', 'Coffee Scale 2kg / 0.1g', 'Unit', 2)
    const items = getPackingLineItems(getPackingTask(task.id)!)
    expect(items.some((i) => !i.batchPicks?.length && !i.serialPicks?.length)).toBe(true)
    const doc = await generatePackingListPdf(task, items, order)
    expect(typeof doc.output).toBe('function')
  })

  it('generates a PDF for a batch-tracked SKU, flattening one row per batch', async () => {
    const { task, order } = makePackingTaskForSku('1001', 'Green Beans Arabica Gayo Grade 1', 'Sack', 3)
    const items = getPackingLineItems(getPackingTask(task.id)!)
    expect(items.some((i) => (i.batchPicks?.length ?? 0) > 0)).toBe(true)
    const doc = await generatePackingListPdf(task, items, order)
    expect(typeof doc.output).toBe('function')
  })

  it('generates a PDF for a serial-tracked SKU, flattening one row per serial', async () => {
    const { task, order } = makePackingTaskForSku('2004', 'Espresso Machine Lever Manual 1-Group', 'Unit', 1)
    const items = getPackingLineItems(getPackingTask(task.id)!)
    expect(items.some((i) => (i.serialPicks?.length ?? 0) > 0)).toBe(true)
    const doc = await generatePackingListPdf(task, items, order)
    expect(typeof doc.output).toBe('function')
  })

  it('does not throw for a task with no line items, or when order info is omitted', async () => {
    const { task } = makePackingTaskForSku('3004', 'Coffee Scale 2kg / 0.1g', 'Unit', 1)
    const doc = await generatePackingListPdf(task, [])
    expect(typeof doc.output).toBe('function')
  })

  it('does not throw when courier and tracking no. are provided', async () => {
    const { task, order } = makePackingTaskForSku('3004', 'Coffee Scale 2kg / 0.1g', 'Unit', 1)
    const doc = await generatePackingListPdf(task, [], { ...order, courier: 'JNE', trackingNo: 'TRK1234567890' })
    expect(typeof doc.output).toBe('function')
  })

  it('draws the canceled ribbon without throwing when the task is canceled', async () => {
    const { task, order } = makePackingTaskForSku('3004', 'Coffee Scale 2kg / 0.1g', 'Unit', 1)
    const items = getPackingLineItems(getPackingTask(task.id)!)
    const doc = await generatePackingListPdf({ ...task, status: 'canceled' }, items, order)
    expect(typeof doc.output).toBe('function')
  })
})
