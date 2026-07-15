/**
 * PM feedback: WMS tasks/records must never be deletable — only cancelable, and
 * only while not yet completed. What already happened (e.g. stock already moved)
 * must never be reverted by canceling.
 *
 * Warehouse transfers: `applyTransfer` (the real stock movement) runs at
 * approveTransfer() time, so a transfer is only ever safe to void while still
 * 'draft'. `deleteTransfers()` (which fully erased the record, even for completed
 * transfers with real stock movement behind them) has been removed and replaced
 * with `cancelTransfer()`, gated to draft-only.
 */
import { describe, it, expect } from 'vitest'
import {
  addTransfer, approveTransfer, cancelTransfer, canCancelTransfer, getTransfer,
  awaitingApprovalCount, type TransferInput,
} from '~/data/warehouseTransfers'
import { warehouses } from '~/data/warehouses'
import '~/data/warehouseDetails'

function makeInput(originId: string, destId: string): TransferInput {
  return {
    date: '2026-07-01',
    originId, originName: warehouses.find(w => w.id === originId)?.name ?? originId,
    destinationId: destId, destinationName: warehouses.find(w => w.id === destId)?.name ?? destId,
    tags: [],
    lines: [{ sku: '1001', qty: 1 }],
  }
}

describe('Warehouse transfer — cancel replaces delete', () => {
  it('a draft transfer can be canceled — terminal, record kept (not erased)', () => {
    const t = addTransfer(makeInput('wh-001', 'wh-006'))
    expect(t.status).toBe('draft')
    expect(canCancelTransfer(t)).toBe(true)
    const beforeAwaiting = awaitingApprovalCount()

    cancelTransfer(t.id, 'Created by mistake')

    const after = getTransfer(t.id)
    expect(after).toBeTruthy() // record still exists — never deleted
    expect(after!.status).toBe('canceled')
    expect(after!.canceledDate).toBeTruthy()
    expect(after!.canceledReason).toBe('Created by mistake')
    // No longer counted as awaiting approval.
    expect(awaitingApprovalCount()).toBe(beforeAwaiting - 1)
  })

  it('an approved transfer cannot be canceled — stock already moved, nothing to void', () => {
    const t = addTransfer(makeInput('wh-001', 'wh-006'))
    approveTransfer(t.id)
    expect(getTransfer(t.id)!.status).toBe('approved')
    expect(canCancelTransfer(getTransfer(t.id)!)).toBe(false)

    cancelTransfer(t.id, 'Trying to cancel anyway')

    // Guard blocks it — status untouched, no canceledDate stamped.
    const after = getTransfer(t.id)
    expect(after!.status).toBe('approved')
    expect(after!.canceledDate).toBeUndefined()
  })

  it('canCancelTransfer is true only for draft — every other status is terminal/immutable', () => {
    const t = addTransfer(makeInput('wh-001', 'wh-006'))
    expect(canCancelTransfer({ ...t, status: 'draft' })).toBe(true)
    expect(canCancelTransfer({ ...t, status: 'approved' })).toBe(false)
    expect(canCancelTransfer({ ...t, status: 'in transit' })).toBe(false)
    expect(canCancelTransfer({ ...t, status: 'completed' })).toBe(false)
    expect(canCancelTransfer({ ...t, status: 'rejected' })).toBe(false)
    expect(canCancelTransfer({ ...t, status: 'canceled' })).toBe(false)
  })

  it('canceling a nonexistent transfer id is a no-op (no throw)', () => {
    expect(() => cancelTransfer('wt-does-not-exist')).not.toThrow()
  })
})
