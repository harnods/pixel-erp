/**
 * PM feedback: WMS tasks/records must never be deletable — only cancelable, and
 * only while not yet completed.
 *
 * cancelReceipt() had no status guard at all, and ReceiptIndexPage.vue's "Cancel
 * receipt" (row + bulk) was shown/executable regardless of status — including
 * on an already-completed or already-canceled receipt if the status filter was
 * widened to include those. Added canCancelReceipt(), used both as a defense-in-
 * depth guard inside cancelReceipt() and to gate the UI.
 */
import { describe, it, expect } from 'vitest'
import { receipts, canCancelReceipt, cancelReceipt, closeReceipt } from '~/data/receipts'

function firstWithStatus(status: string) {
  const r = receipts.find((x) => x.status === status && !x.id.startsWith('rcv-new-'))
  if (!r) throw new Error(`no seeded receipt with status "${status}" found`)
  return r
}

describe('Receipt — cancel is guarded to non-terminal statuses', () => {
  it('a "pending" receipt can be canceled', () => {
    const r = firstWithStatus('pending')
    expect(canCancelReceipt(r)).toBe(true)

    cancelReceipt(r.id)

    expect(r.status).toBe('canceled')
    expect(r.canceledDate).toBeTruthy()
  })

  it('a "partial reception" receipt can be canceled', () => {
    const r = firstWithStatus('partial reception')
    expect(canCancelReceipt(r)).toBe(true)

    cancelReceipt(r.id)

    expect(r.status).toBe('canceled')
  })

  it('a "completed" receipt cannot be canceled — it is a permanent record', () => {
    const r = firstWithStatus('completed')
    expect(canCancelReceipt(r)).toBe(false)

    cancelReceipt(r.id)

    expect(r.status).toBe('completed') // untouched
  })

  it('an already-"canceled" receipt cannot be canceled again', () => {
    const r = firstWithStatus('pending')
    cancelReceipt(r.id)
    expect(r.status).toBe('canceled')
    const stampedDate = r.canceledDate

    cancelReceipt(r.id) // no-op — already canceled

    expect(r.canceledDate).toBe(stampedDate)
  })

  it('closeReceipt (partial → completed) makes the receipt no longer cancelable', () => {
    const r = firstWithStatus('partial reception')
    expect(canCancelReceipt(r)).toBe(true)

    closeReceipt(r.id)

    expect(r.status).toBe('completed')
    expect(canCancelReceipt(r)).toBe(false)
  })
})
