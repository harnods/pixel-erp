/**
 * WMS receiving writes the batch master (ATINV-9082, spec §5.1/5.2 story 20).
 * 1001 uses Vendor (required), Grade, Expiry; Batch #001 is from V003.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

async function load() {
  vi.resetModules()
  const rcv = await import('~/data/receivingTasks')
  const receipts = await import('~/data/receipts')
  const lines = await import('~/data/receiptLineItems')
  const details = await import('~/data/productDetails')
  return { ...rcv, ...details, receipts: receipts.receipts, DEMO_RECEIPT_ID: lines.DEMO_RECEIPT_ID }
}
let api: Awaited<ReturnType<typeof load>>
beforeEach(async () => { api = await load() })

const SKU = '1001'
function startTask() {
  const receipt = api.receipts.find((r) => r.id === api.DEMO_RECEIPT_ID)!
  const task = api.createReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: [SKU] })!
  api.startReceiving(task.id)
  return { receipt, task }
}
const line = (batchNo: string, attributes: Record<string, string>) =>
  ({ batchNo, expiryDate: '2027-01-01', desc: '', qty: 1, unit: 'Sack', attributes })

describe('receivingTaskVendorId', () => {
  it('finds the vendor of the task\'s PO by its name, undefined when none matches', () => {
    const { receipt, task } = startTask()
    receipt.vendor = 'Klasik Beans Cooperative'
    expect(api.receivingTaskVendorId(task.id)).toBe('V001')
    receipt.vendor = 'Nobody Ltd'
    expect(api.receivingTaskVendorId(task.id)).toBeUndefined()
    expect(api.receivingTaskVendorId('nope')).toBeUndefined()
  })
})

describe('ending receiving', () => {
  it('a received new batch becomes a product batch with its attributes', () => {
    const { task } = startTask()
    expect(api.findProductBatch(SKU, 'RCV-NEW-1')).toBeUndefined()
    api.endReceiving(task.id, { [SKU]: 1 }, { [SKU]: { batchLines: [line('RCV-NEW-1', { supplier: 'V001' })] } })
    expect(api.findProductBatch(SKU, 'RCV-NEW-1')?.attributes.supplier).toBe('V001')
  })

  it('receiving into an existing batch only fills empty attributes', () => {
    const { task } = startTask()
    const before = api.findProductBatch(SKU, 'Batch #001')!
    expect(before.attributes.supplier).toBe('V003')
    api.endReceiving(task.id, { [SKU]: 1 }, { [SKU]: { batchLines: [line('Batch #001', { supplier: 'V001' })] } })
    expect(api.findProductBatch(SKU, 'Batch #001')!.attributes.supplier).toBe('V003')
  })
})
