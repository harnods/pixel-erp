/**
 * Draft PO creation from the worklist (PRD OD-007, OD-012, US-023).
 *
 *  • Always DRAFT. US-023 is a hard rule, so this asserts there is no path to any
 *    other status — including a source scan proving the module contains no other
 *    status literal.
 *  • One PO per (vendor, warehouse); never blended.
 *  • Real catalogue SKUs and a real warehouse FK reach the existing PO detail page,
 *    while the 60 seed orders keep rendering exactly what they rendered before.
 *  • Skipped lines are reported, never silently dropped (US-021 EH-01).
 *  • The recommendation-vs-final deviation is recorded (US-020 AC-02).
 *
 * MUTATES `purchaseOrders` (that is the point), so it asserts against the delta it
 * creates rather than absolute counts.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { planDraftPos, createDraftPos, skipReasonLabel } from '~/data/replenishmentDraftPo'
import { replenishmentWorklist } from '~/data/replenishment'
import { purchaseOrders } from '~/data/purchaseOrders'
import { getPurchaseOrderDetail } from '~/data/purchaseOrderDetails'
import { PRODUCTS } from '~/data/inventory'
import { warehouses } from '~/data/warehouses'
import { vendors } from '~/data/vendors'
import { REPL_ASOF_ISO } from '~/data/replenishmentConfig'

const CATALOG_SKUS = new Set(PRODUCTS.map((p) => p.sku))
const WAREHOUSE_NAMES = new Set(warehouses.map((w) => w.name))
const VENDOR_IDS = new Set(vendors.map((v) => v.id))

const worklist = replenishmentWorklist('all')

describe('planDraftPos — grouping', () => {
  it('groups by vendor AND warehouse, never blending warehouses', () => {
    const plan = planDraftPos(worklist.rows)
    expect(plan.groups.length).toBeGreaterThan(0)
    for (const group of plan.groups) {
      expect(group.key).toBe(`${group.vendorId}::${group.warehouseId}`)
      expect(VENDOR_IDS.has(group.vendorId)).toBe(true)
      for (const line of group.lines) {
        expect(line.warehouseId).toBe(group.warehouseId)
        expect(line.vendorId).toBe(group.vendorId)
      }
    }
    // Group keys are unique — no vendor/warehouse pair split across two POs.
    expect(new Set(plan.groups.map((g) => g.key)).size).toBe(plan.groups.length)
  })

  it('every planned line has a positive quantity and a real SKU', () => {
    for (const group of planDraftPos(worklist.rows).groups) {
      for (const line of group.lines) {
        expect(line.finalQty).toBeGreaterThan(0)
        expect(CATALOG_SKUS.has(line.sku)).toBe(true)
      }
    }
  })

  it('reports no-vendor lines as skipped rather than dropping them', () => {
    const plan = planDraftPos(worklist.rows)
    const noVendorRows = worklist.rows.filter((r) => r.bucket === 'no-vendor')
    expect(noVendorRows.length).toBeGreaterThan(0)

    const skippedSkus = new Set(plan.skipped.map((s) => `${s.sku}::${s.warehouseId}`))
    for (const row of noVendorRows) expect(skippedSkus.has(row.key)).toBe(true)

    // Nothing skipped may also appear on a PO.
    const planned = new Set(plan.groups.flatMap((g) => g.lines.map((l) => `${l.sku}::${l.warehouseId}`)))
    for (const key of skippedSkus) expect(planned.has(key)).toBe(false)
  })

  it('accounts for every input row exactly once', () => {
    const plan = planDraftPos(worklist.rows)
    const planned = plan.groups.reduce((s, g) => s + g.lines.length, 0)
    expect(planned + plan.skipped.length).toBe(worklist.rows.length)
  })

  it('honours a quantity override and an alternate vendor choice', () => {
    const row = worklist.rows.find((r) => r.vendorItem && r.alternates.length > 0)
    expect(row, 'no multi-vendor row available to test with').toBeTruthy()
    const alternate = row!.alternates[0]!

    const plan = planDraftPos([row!], { [row!.key]: 99 }, { [row!.key]: alternate.vendorId })
    expect(plan.groups).toHaveLength(1)
    expect(plan.groups[0]!.vendorId).toBe(alternate.vendorId)
    expect(plan.groups[0]!.lines[0]!.finalQty).toBe(99)
    // The recommendation is preserved alongside the override.
    expect(plan.groups[0]!.lines[0]!.recommendedQty).toBe(row!.suggestion.purchaseQty)
  })

  it('totals are internally consistent', () => {
    for (const group of planDraftPos(worklist.rows).groups) {
      const subtotal = group.lines.reduce((s, l) => s + Math.round(l.finalQty * l.unitCost), 0)
      expect(group.subtotal).toBe(subtotal)
      expect(group.total).toBe(group.subtotal + group.taxAmount)
      expect(group.leadTimeDays).toBeGreaterThan(0)
    }
  })

  it('every skip reason has a human label', () => {
    for (const skipped of planDraftPos(worklist.rows).skipped) {
      expect(skipReasonLabel(skipped.reason)).toBeTruthy()
    }
  })
})

describe('createDraftPos — always draft, always real', () => {
  // Take a small, deterministic slice so the delta is easy to reason about.
  const selection = worklist.rows.filter((r) => r.vendorItem).slice(0, 12)
  const before = purchaseOrders.length
  const result = createDraftPos(selection)

  it('creates one order per planned group', () => {
    const plan = planDraftPos(selection)
    expect(result.created).toHaveLength(plan.groups.length)
    expect(purchaseOrders.length).toBe(before + plan.groups.length)
  })

  it('every created order is DRAFT and never sent', () => {
    for (const created of result.created) {
      const order = purchaseOrders.find((o) => o.id === created.id)!
      expect(order.status).toBe('draft')
      expect(order.sentToFulfillment).toBeUndefined()
      expect(order.rejection).toBeUndefined()
      expect(order.tags).toContain('Replenishment')
    }
  })

  it('records provenance including the recommendation deviation', () => {
    for (const created of result.created) {
      const order = purchaseOrders.find((o) => o.id === created.id)!
      const origin = order.replenishment
      expect(origin).toBeTruthy()
      expect(origin!.source).toBe('replenishment')
      expect(origin!.asOf).toBe(REPL_ASOF_ISO)
      expect(origin!.warehouseId).toBe(created.warehouseId)
      expect(origin!.lines).toHaveLength(created.lineCount)
      for (const line of origin!.lines) {
        expect(line.deviation).toBe(line.finalQty - line.recommendedQty)
        expect(CATALOG_SKUS.has(line.sku)).toBe(true)
      }
    }
  })

  it('the PO detail page shows real coffee SKUs and a real warehouse', () => {
    for (const created of result.created) {
      const detail = getPurchaseOrderDetail(created.id)
      expect(detail.lineItems.length).toBe(created.lineCount)
      for (const line of detail.lineItems) {
        expect(CATALOG_SKUS.has(line.sku), `${line.sku} is not a catalogue SKU`).toBe(true)
      }
      // A real warehouse name, not one of purchaseOrderDetails' four free-text strings.
      expect(WAREHOUSE_NAMES.has(detail.warehouse)).toBe(true)
    }
  })

  it('keeps the index/detail total invariant', () => {
    for (const created of result.created) {
      const order = purchaseOrders.find((o) => o.id === created.id)!
      const detail = getPurchaseOrderDetail(created.id)
      expect(detail.totals.total).toBe(order.total)
      expect(order.itemCount).toBe(detail.lineItems.length)
    }
  })

  it('assigns unique ids and document numbers', () => {
    const ids = purchaseOrders.map((o) => o.id)
    const numbers = purchaseOrders.map((o) => o.number)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(numbers).size).toBe(numbers.length)
  })

  it('leaves the seed orders rendering exactly what they always did', () => {
    // po-001 must still get the generated industrial-parts lines and its
    // free-text warehouse — proof the new branch did not leak into the seed.
    const detail = getPurchaseOrderDetail('po-001')
    expect(detail.lineItems.length).toBeGreaterThan(0)
    for (const line of detail.lineItems) {
      expect(CATALOG_SKUS.has(line.sku)).toBe(false)
    }
    expect(WAREHOUSE_NAMES.has(detail.warehouse)).toBe(false)
  })
})

describe('US-023 — no auto-submit path exists', () => {
  it('the draft-PO module contains no status literal other than draft', () => {
    const source = readFileSync(join(process.cwd(), 'app/data/replenishmentDraftPo.ts'), 'utf8')
    const statuses = ['open', 'approved', 'closed', 'partially-processed', 'rejected', 'awaiting invoice', 'voided']
    for (const status of statuses) {
      expect(
        source.includes(`status: '${status}'`),
        `replenishmentDraftPo.ts must never set status '${status}'`,
      ).toBe(false)
    }
    expect(source.includes("status: 'draft'")).toBe(true)
  })
})
