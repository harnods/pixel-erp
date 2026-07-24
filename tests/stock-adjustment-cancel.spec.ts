/**
 * PM feedback: WMS tasks/records must never be deletable — only cancelable, and
 * only while not yet completed. What already happened (e.g. stock already moved)
 * must never be reverted by canceling.
 *
 * ERP stock adjustments: applyStockCount/applyStockInOut (the real stock effect)
 * run at approveAdjustment() time, so only 'draft' is safe to cancel.
 *
 * WMS stock adjustments: a Stock In/Out record is completed the instant it's
 * created (stock applies immediately, no draft window) — never cancelable. A
 * Cycle Count task is cancelable only while not_started/in_progress; once
 * finished, applyStockCount has already run.
 *
 * `deleteAdjustments()`/`deleteWmsAdjustments()` (which fully erased the record,
 * even for completed ones with real stock changes behind them) have been removed
 * and replaced with cancelAdjustment()/cancelWmsAdjustment(), properly gated.
 */
import { describe, it, expect } from 'vitest'
import {
  addAdjustment, approveAdjustment, cancelAdjustment, canCancelAdjustment, getAdjustment,
  awaitingAdjustmentCount, type AdjustmentInput,
} from '~/data/stockAdjustments'
import {
  addWmsAdjustment, cancelWmsAdjustment, canCancelWmsAdjustment, getWmsAdjustment,
  startWmsCount, finishWmsCount,
} from '~/data/wmsStockAdjustments'
import { warehouses } from '~/data/warehouses'
import '~/data/warehouseDetails'

function erpInput(kind: 'count' | 'in-out'): AdjustmentInput {
  const wh = warehouses.find(w => !w.isDefault && w.status === 'active')!
  return {
    kind, date: '2026-07-01', warehouseId: wh.id, warehouseName: wh.name,
    category: kind === 'count' ? 'Stock count' : 'General',
    tags: [], lines: [{ sku: '1001', qty: kind === 'count' ? 5 : 1 }],
  }
}

describe('ERP stock adjustment — cancel replaces delete', () => {
  it('a draft adjustment can be canceled — terminal, record kept (not erased)', () => {
    const a = addAdjustment(erpInput('in-out'))
    expect(a.status).toBe('draft')
    expect(canCancelAdjustment(a)).toBe(true)
    const beforeAwaiting = awaitingAdjustmentCount()

    cancelAdjustment(a.id, 'Created by mistake')

    const after = getAdjustment(a.id)
    expect(after).toBeTruthy()
    expect(after!.status).toBe('canceled')
    expect(after!.canceledDate).toBeTruthy()
    expect(after!.canceledReason).toBe('Created by mistake')
    expect(awaitingAdjustmentCount()).toBe(beforeAwaiting - 1)
  })

  it('a completed (approved) adjustment cannot be canceled — stock already applied', () => {
    const a = addAdjustment(erpInput('count'))
    approveAdjustment(a.id)
    expect(getAdjustment(a.id)!.status).toBe('completed')
    expect(canCancelAdjustment(getAdjustment(a.id)!)).toBe(false)

    cancelAdjustment(a.id, 'Trying anyway')

    const after = getAdjustment(a.id)
    expect(after!.status).toBe('completed')
    expect(after!.canceledDate).toBeUndefined()
  })
})

describe('WMS stock adjustment — cancel replaces delete', () => {
  it('a WMS Stock In/Out is completed the instant it is created — never cancelable', () => {
    const a = addWmsAdjustment(erpInput('in-out'))
    expect(a.status).toBe('completed')
    expect(canCancelWmsAdjustment(a)).toBe(false)

    cancelWmsAdjustment(a.id)

    expect(getWmsAdjustment(a.id)!.status).toBe('completed')
  })

  it('a cycle count is cancelable while not_started or in_progress, not once finished', () => {
    const a = addWmsAdjustment(erpInput('count'))
    expect(a.status).toBe('not_started')
    expect(canCancelWmsAdjustment(a)).toBe(true)

    startWmsCount(a.id)
    expect(getWmsAdjustment(a.id)!.status).toBe('in_progress')
    expect(canCancelWmsAdjustment(getWmsAdjustment(a.id)!)).toBe(true)

    // Finishing a count now sends it for manager approval → "counted" (approval then
    // makes it "completed"). Either way it's FINISHED and no longer cancelable.
    finishWmsCount(a.id, [{ sku: '1001', qty: 5 }])
    expect(getWmsAdjustment(a.id)!.status).toBe('counted')
    expect(canCancelWmsAdjustment(getWmsAdjustment(a.id)!)).toBe(false)

    cancelWmsAdjustment(a.id) // no-op — already finished (counted, awaiting approval)
    expect(getWmsAdjustment(a.id)!.status).toBe('counted')
  })

  it('canceling a not-yet-finished cycle count keeps the record (not deleted)', () => {
    const a = addWmsAdjustment(erpInput('count'))
    startWmsCount(a.id)

    cancelWmsAdjustment(a.id, 'Warehouse closed early')

    const after = getWmsAdjustment(a.id)
    expect(after).toBeTruthy()
    expect(after!.status).toBe('canceled')
    expect(after!.canceledReason).toBe('Warehouse closed early')
  })
})
