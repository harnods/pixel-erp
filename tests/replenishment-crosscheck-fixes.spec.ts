/**
 * Regression guards for the bugs found crosschecking the branch against the
 * "[PRD] Inventory Replenishment" (v10). Each block names the bug it pins down.
 *
 * MUTATES shared stores (overrides, purchase requests), so every test restores
 * what it changed and asserts against deltas, never absolute counts.
 */
import { describe, it, expect, afterEach } from 'vitest'
import {
  replenishmentWorklist, invalidateReplenishmentCaches, daysOfCover, type WorklistRow,
} from '~/data/replenishment'
import { planPurchaseRequests, createPurchaseRequests } from '~/data/replenishmentPurchaseRequest'
import { saveSkuWarehouseOverride, clearSkuWarehouseOverride } from '~/data/replenishmentSettings'
import { purchaseRequests, addPurchaseRequest, deletePurchaseRequests } from '~/data/purchaseRequests'

function dueRowWithQty(): WorklistRow {
  const row = replenishmentWorklist('all').rows.find((r) => r.suggestion.rawQty > 0)
  if (!row) throw new Error('seed has no due row with a quantity')
  return row
}

describe('bug 5 — a manual reorder point never hides the calculated one (D17)', () => {
  let touched: WorklistRow | null = null
  afterEach(() => {
    if (touched) clearSkuWarehouseOverride(touched.sku, touched.warehouseId)
    touched = null
    invalidateReplenishmentCaches()
  })

  it('keeps calculatedReorderPoint = velocity × (lead + safety) while the override is the trigger', () => {
    const row = dueRowWithQty()
    touched = row
    const calc = row.calculatedReorderPoint
    expect(calc).not.toBeNull()
    expect(calc).toBe(Math.ceil(row.velocity.avgDailySales * (row.leadTimeDays + row.safetyDays)))

    saveSkuWarehouseOverride(row.sku, row.warehouseId, { reorderPoint: 1 })
    invalidateReplenishmentCaches()
    const all = replenishmentWorklist('all')
    const after = [...all.rows, ...all.needsSetup, ...all.notTracked]
      .find((r) => r.key === row.key)
    // The override may drop the row off "To order"; look it up wherever it lands.
    if (after) {
      expect(after.reorderPoint).toBe(1)
      expect(after.calculatedReorderPoint).toBe(calc)
    }
  })
})

describe('bug 7 — "stocks out before resupply" uses lead time + safety days (§2.2 #7)', () => {
  it('flags cover below lead + safety, even when it is above lead time alone', () => {
    // 15 days of cover, lead 14, safety 7 → 15 < 21 → will stock out (PRD §2.3).
    expect(daysOfCover(150, 10, 14 + 7).belowLeadTime).toBe(true)
    expect(daysOfCover(250, 10, 14 + 7).belowLeadTime).toBe(false)
  })

  it('the worklist flag matches lead + safety for every row', () => {
    for (const r of replenishmentWorklist('all').rows) {
      if (r.cover.coverDays === null) continue
      expect(r.flags.belowLeadTime).toBe(r.cover.coverDays < r.leadTimeDays + r.safetyDays)
    }
  })

  it('the card counts only worklist rows, so it matches the Signals filter', () => {
    const wl = replenishmentWorklist('all')
    expect(wl.totals.belowLeadTime).toBe(wl.rows.filter((r) => r.flags.belowLeadTime).length)
  })
})

describe('bug 4 — a line the user sets to 0 stays editable, and is never written', () => {
  it('keeps a user-zeroed line in its group instead of moving it to Skipped', () => {
    const row = dueRowWithQty()
    const plan = planPurchaseRequests([row], { [row.key]: 0 })
    const line = plan.groups.flatMap((g) => g.lines).find((l) => l.sku === row.sku)
    expect(line?.finalQty).toBe(0)
    expect(plan.skipped.find((s) => s.sku === row.sku)).toBeUndefined()
  })

  it('never creates a request line with qty 0 — reports it as skipped instead', () => {
    const row = dueRowWithQty()
    const before = purchaseRequests.length
    const result = createPurchaseRequests([row], { [row.key]: 0 })
    expect(result.created).toHaveLength(0)
    expect(purchaseRequests.length).toBe(before)
    expect(result.skipped.find((s) => s.sku === row.sku)?.reason).toBe('zero-qty')
  })
})

describe('bug 13 — purchase request ids never collide after a delete', () => {
  it('issues max id + 1, not length + 1', () => {
    const base = purchaseRequests[0]!
    const { id: _id, number: _n, ...data } = base
    const a = addPurchaseRequest({ ...data })
    const b = addPurchaseRequest({ ...data })
    deletePurchaseRequests([a.id])
    const c = addPurchaseRequest({ ...data })
    expect(c.id).not.toBe(b.id)
    expect(new Set(purchaseRequests.map((p) => p.id)).size).toBe(purchaseRequests.length)
    deletePurchaseRequests([b.id, c.id])
  })
})

describe('decision 3 — ATP and in-transit follow the PRD sources', () => {
  it('reserved = open outbound (unshipped) + approved outbound transfers (US-003)', async () => {
    const { outgoingOrders } = await import('~/data/outgoing')
    const { warehouseTransfers, transferLineItems } = await import('~/data/warehouseTransfers')
    const { orderSkuLines } = await import('~/data/inventory')
    const { atpFor } = await import('~/data/replenishment')
    const row = replenishmentWorklist('all').rows.find((r) => r.atp.reserved > 0)!
    let expected = 0
    for (const o of outgoingOrders) {
      if (o.warehouseId !== row.warehouseId || !['pending', 'in progress', 'partially shipped'].includes(o.status)) continue
      for (const l of orderSkuLines(o)) if (l.sku === row.sku) expected += Math.max(0, l.qty - (o.shippedBySku?.[l.sku] ?? 0))
    }
    for (const t of warehouseTransfers) {
      if (t.originId !== row.warehouseId || t.status !== 'approved') continue
      for (const l of transferLineItems(t)) if (l.sku === row.sku) expected += l.qty
    }
    const atp = atpFor(row.sku, row.warehouseId)
    expect(atp.reserved).toBe(expected)
    expect(atp.available).toBe(atp.onHand - atp.reserved)
    expect(atp.oversold).toBe(atp.available < 0)
  })

  it('an open non-WMS PO counts as in transit; a draft PO never does (US-004 VR-01/VR-02)', async () => {
    const { purchaseOrders } = await import('~/data/purchaseOrders')
    const { setPurchaseOrderDocument } = await import('~/data/purchaseOrderLines')
    const { atpFor } = await import('~/data/replenishment')
    const row = dueRowWithQty()
    const before = atpFor(row.sku, row.warehouseId).onOrder
    const po = {
      ...purchaseOrders[0]!, id: 'PO-TEST-INTRANSIT', number: 'PO-TEST-INTRANSIT', status: 'draft' as const,
    }
    purchaseOrders.push(po)
    setPurchaseOrderDocument({
      poId: po.id, warehouseId: row.warehouseId, warehouse: row.warehouseName, paymentTerms: '', shipDate: '2026-07-01',
      lineItems: [{ product: row.productName, sku: row.sku, description: '', qty: 50, unit: row.unit, unitPrice: 1, discountPct: 0, taxLabel: '', amount: 50 }],
      totals: {} as never,
    })
    invalidateReplenishmentCaches()
    expect(atpFor(row.sku, row.warehouseId).onOrder).toBe(before)

    po.status = 'approved' as never
    invalidateReplenishmentCaches()
    expect(atpFor(row.sku, row.warehouseId).onOrder).toBe(before + 50)

    purchaseOrders.splice(purchaseOrders.indexOf(po), 1)
    invalidateReplenishmentCaches()
  })
})
