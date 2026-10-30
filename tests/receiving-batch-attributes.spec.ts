/**
 * WMS receiving writes the batch master (ATINV-9082, spec §5.1/5.2 story 20).
 * 1001 uses Vendor (required), Grade, Expiry; Batch #001 is from V003.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'

async function load() {
  vi.resetModules()
  const rcv = await import('~/data/receivingTasks')
  const receipts = await import('~/data/receipts')
  const lines = await import('~/data/receiptLineItems')
  const details = await import('~/data/productDetails')
  const store = await import('~/data/batchStore')
  return { ...rcv, ...details, batchActivityFor: store.batchActivityFor, receipts: receipts.receipts, DEMO_RECEIPT_ID: lines.DEMO_RECEIPT_ID }
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

describe('filling and repeating', () => {
  it('an empty attribute on an existing batch is filled by a receiving commit', () => {
    const { task } = startTask()
    const made = api.ensureProductBatch(SKU, 'RCV-EMPTY-1', { expiry_date: '2027-01-01' })
    expect(made.attributes.supplier).toBeFalsy()
    api.endReceiving(task.id, { [SKU]: 1 }, { [SKU]: { batchLines: [line('RCV-EMPTY-1', { supplier: 'V002' })] } })
    expect(api.findProductBatch(SKU, 'RCV-EMPTY-1')!.attributes.supplier).toBe('V002')
  })

  it('committing the same lines twice creates no second record and no second activity entry', () => {
    const lines = [{ batchNo: 'RCV-TWICE-1', expiryDate: '2027-01-01', attributes: { supplier: 'V001' } }]
    api.commitDrawerBatches(SKU, lines)
    const first = api.findProductBatch(SKU, 'RCV-TWICE-1')!
    const count = api.getProductBatches(SKU).length
    const entries = api.batchActivityFor(first.id).length
    api.commitDrawerBatches(SKU, lines)
    expect(api.getProductBatches(SKU)).toHaveLength(count)
    expect(api.batchActivityFor(first.id)).toHaveLength(entries)
  })

  it('never throws: an invalid expiry keeps the batch without it, an invalid number is skipped', () => {
    expect(() => api.commitDrawerBatches(SKU, [
      { batchNo: 'RCV-BADDATE-1', expiryDate: '2027-02-31', attributes: { supplier: 'V001' } },
      { batchNo: 'Unassigned' },
      { batchNo: '   ' },
    ])).not.toThrow()
    const b = api.findProductBatch(SKU, 'RCV-BADDATE-1')
    expect(b?.attributes.supplier).toBe('V001')
    expect(b?.attributes.expiry_date).toBeFalsy()
  })
})

describe('vendor mismatch confirm on ReceiveItemsPage', () => {
  it('ConfirmModal closes on confirm, and confirm opens the Finish receiving confirm', () => {
    const modal = readFileSync('app/components/patterns/ConfirmModal.vue', 'utf8')
    expect(modal).toContain("function confirm() { emit('confirm'); close() }")
    expect(modal).toContain("emit('update:isOpen', false)")
    const page = readFileSync('app/components/pages/ReceiveItemsPage.vue', 'utf8')
    expect(page).toContain('mismatchOpen = v')
    expect(page).toContain('@confirm="showConfirm = true"')
  })
})
