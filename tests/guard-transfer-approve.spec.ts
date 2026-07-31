/**
 * Integrity guard — warehouse transfer approval.
 *
 * Approving a transfer MOVES stock (applyTransfer), so it must be physically
 * valid first. `canApproveTransfer(id)` returns {ok:false, reason} for:
 *   - NOT_DRAFT           (already approved / not a draft)
 *   - SAME_WAREHOUSE      (origin === destination)
 *   - WAREHOUSE_ARCHIVED  (either side archived)
 *   - INSUFFICIENT_STOCK  (a line exceeds origin availableForSku)
 * `approveTransfer` refuses an invalid draft (returns undefined, status stays
 * 'draft', no stock moved) and, for a valid draft, approves it and moves stock
 * (origin available ↓, destination available ↑).
 */
import { describe, it, expect } from 'vitest'
import {
  addTransfer, approveTransfer, canApproveTransfer, getTransfer, type TransferInput,
} from '~/data/warehouseTransfers'
import { availableForSku, getWarehouseDetail } from '~/data/warehouseDetails'
import { warehouses } from '~/data/warehouses'

const ORIGIN = 'wh-001'
const DEST = 'wh-006'
const ARCHIVED = 'wh-007' // seed archived warehouse

/** A plain (non batch / non serial-tracked) SKU stocked in the origin with room to move. */
function plainSku(): string {
  const item = getWarehouseDetail(ORIGIN)!.stock.find(
    (s) => !s.batches && !s.serials && s.available >= 2,
  )!
  return item.sku
}

function makeInput(originId: string, destId: string, sku: string, qty: number): TransferInput {
  return {
    date: '2026-07-01',
    originId, originName: warehouses.find((w) => w.id === originId)?.name ?? originId,
    destinationId: destId, destinationName: warehouses.find((w) => w.id === destId)?.name ?? destId,
    tags: [],
    lines: [{ sku, qty }],
  }
}

describe('Integrity guard — warehouse transfer approval', () => {
  it('a draft moving more than origin available is refused (INSUFFICIENT_STOCK, no move)', () => {
    const sku = plainSku()
    const available = availableForSku(ORIGIN, sku)
    const t = addTransfer(makeInput(ORIGIN, DEST, sku, available + 50))
    expect(t.status).toBe('draft')

    const check = canApproveTransfer(t.id)
    expect(check.ok).toBe(false)
    expect(check.ok === false && check.reason).toContain('INSUFFICIENT_STOCK')

    const originBefore = availableForSku(ORIGIN, sku)
    const result = approveTransfer(t.id)
    expect(result).toBeUndefined()
    // Status untouched, stock not moved.
    expect(getTransfer(t.id)!.status).toBe('draft')
    expect(availableForSku(ORIGIN, sku)).toBe(originBefore)
  })

  it('a valid draft (qty ≤ available) approves and moves stock', () => {
    const sku = plainSku()
    const originBefore = availableForSku(ORIGIN, sku)
    const destBefore = availableForSku(DEST, sku)
    const qty = 1
    expect(originBefore).toBeGreaterThanOrEqual(qty)

    const t = addTransfer(makeInput(ORIGIN, DEST, sku, qty))
    expect(canApproveTransfer(t.id).ok).toBe(true)

    const result = approveTransfer(t.id)
    expect(result).toBeTruthy()
    expect(getTransfer(t.id)!.status).toBe('approved')

    // Stock physically moved: origin down by qty, destination up by qty.
    expect(availableForSku(ORIGIN, sku)).toBe(originBefore - qty)
    expect(availableForSku(DEST, sku)).toBe(destBefore + qty)
  })

  it('an already-approved transfer is not re-approvable (NOT_DRAFT)', () => {
    const sku = plainSku()
    const t = addTransfer(makeInput(ORIGIN, DEST, sku, 1))
    approveTransfer(t.id)
    expect(getTransfer(t.id)!.status).toBe('approved')

    const check = canApproveTransfer(t.id)
    expect(check.ok).toBe(false)
    expect(check.ok === false && check.reason).toBe('NOT_DRAFT')
  })

  it('a same-warehouse transfer is refused (SAME_WAREHOUSE)', () => {
    const sku = plainSku()
    const t = addTransfer(makeInput(ORIGIN, ORIGIN, sku, 1))
    const check = canApproveTransfer(t.id)
    expect(check.ok).toBe(false)
    expect(check.ok === false && check.reason).toBe('SAME_WAREHOUSE')
    expect(approveTransfer(t.id)).toBeUndefined()
    expect(getTransfer(t.id)!.status).toBe('draft')
  })

  it('a transfer touching an archived warehouse is refused (WAREHOUSE_ARCHIVED)', () => {
    const sku = plainSku()
    const t = addTransfer(makeInput(ORIGIN, ARCHIVED, sku, 1))
    const check = canApproveTransfer(t.id)
    expect(check.ok).toBe(false)
    expect(check.ok === false && check.reason).toBe('WAREHOUSE_ARCHIVED')
    expect(approveTransfer(t.id)).toBeUndefined()
    expect(getTransfer(t.id)!.status).toBe('draft')
  })
})
