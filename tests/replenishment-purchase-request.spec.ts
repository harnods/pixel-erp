/**
 * Worklist → Purchase Request (PRD OD-007: US-020, US-021, US-022, US-023).
 *
 * v2 moved the output from a draft PO to a Jurnal Purchase Request (decision
 * D11). US-023 is a NEGATIVE story — "a data glitch can never place a real
 * order" — so this asserts the absence of a path, not just the presence of one:
 * a source scan proves the worklist module cannot reach `addPurchaseOrder`.
 *
 *  • A request, never an order (US-020 VR-01, US-023 AC-01).
 *  • Quantities travel UNROUNDED; MOQ/pack is applied at PO time (D12, VR-02).
 *  • A line with no suggested vendor still forms a valid request (US-022 AC-06).
 *  • Changing vendor recomputes the qty from that vendor's lead time (AC-02) and
 *    never silently overwrites a hand-typed number (VR-03).
 *  • Skipped lines are reported, never dropped (US-021 EH-01).
 *
 * MUTATES `purchaseRequests` (that is the point), so it asserts against the delta
 * it creates rather than absolute counts.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  planPurchaseRequests, createPurchaseRequests, createPurchaseRequestFromGroup,
  recomputeQtyForVendor, requestedQtyFor, prSkipReasonLabel, UNSOURCED,
} from '~/data/replenishmentPurchaseRequest'
import { replenishmentWorklist } from '~/data/replenishment'
import { purchaseRequests } from '~/data/purchaseRequests'
import { purchaseOrders } from '~/data/purchaseOrders'
import { PRODUCTS } from '~/data/inventory'
import { vendors } from '~/data/vendors'
import { vendorItemsForSku } from '~/data/vendorItems'
import { REPL_ASOF_ISO } from '~/data/replenishmentConfig'
import { shiftDays } from '~/data/master'

const CATALOG_SKUS = new Set(PRODUCTS.map((p) => p.sku))
const VENDOR_IDS = new Set(vendors.map((v) => v.id))
const worklist = replenishmentWorklist('all')

describe('planPurchaseRequests — grouping', () => {
  it('groups by suggested vendor AND warehouse, never blending warehouses', () => {
    const plan = planPurchaseRequests(worklist.rows)
    expect(plan.groups.length).toBeGreaterThan(0)
    for (const g of plan.groups) {
      expect(g.key).toBe(`${g.vendorId ?? UNSOURCED}::${g.warehouseId}`)
      if (g.vendorId) expect(VENDOR_IDS.has(g.vendorId)).toBe(true)
      for (const line of g.lines) expect(line.warehouseId).toBe(g.warehouseId)
    }
  })

  it('every requested SKU is a real catalogue SKU', () => {
    for (const g of planPurchaseRequests(worklist.rows).groups) {
      for (const line of g.lines) expect(CATALOG_SKUS.has(line.sku)).toBe(true)
    }
  })

  it('needs-setup rows are skipped and reported, never silently dropped', () => {
    // Under D18 Needs setup can be empty (only a missing lead time lands there),
    // so this guards the contract for whatever rows do exist: a needs-setup row is
    // never planned into a PR, and is reported as skipped with that reason.
    const rows = [...worklist.rows, ...worklist.needsSetup]
    const plan = planPurchaseRequests(rows)
    const planned = new Set(plan.groups.flatMap((g) => g.lines.map((l) => `${l.sku}::${l.warehouseId}`)))
    for (const row of worklist.needsSetup) {
      expect(planned.has(`${row.sku}::${row.warehouseId}`)).toBe(false)
      expect(plan.skipped.some((s) => s.reason === 'needs-setup')).toBe(true)
    }
    expect(prSkipReasonLabel('needs-setup')).toBeTruthy()
  })

  it('counts add up — no line is both planned and skipped', () => {
    const rows = [...worklist.rows, ...worklist.needsSetup]
    const plan = planPurchaseRequests(rows)
    expect(plan.totals.lineCount + plan.totals.skippedCount).toBe(rows.length)
  })
})

describe('a request needs no vendor (US-022 AC-06 / US-021 VR-01)', () => {
  it('an unsourced line forms its own valid request rather than being skipped', () => {
    // Force every selected row to have no suggested vendor.
    const rows = worklist.rows.slice(0, 5)
    const choices = Object.fromEntries(rows.map((r) => [r.key, null]))
    const plan = planPurchaseRequests(rows, {}, choices)

    expect(plan.groups.length).toBeGreaterThan(0)
    for (const g of plan.groups) {
      expect(g.vendorId).toBeNull()
      expect(g.key.startsWith(UNSOURCED)).toBe(true)
    }
    // Crucially NOT skipped — a PO could not exist without a vendor, a PR can.
    expect(plan.skipped.some((s) => s.reason === 'zero-qty')).toBe(false)
    expect(plan.totals.unsourcedCount).toBe(plan.totals.lineCount)
  })
})

describe('quantities are the unrounded NEED (decision D12 / US-022 VR-02)', () => {
  it('carries rawQty, not the MOQ/pack-rounded purchase qty', () => {
    const rows = worklist.rows.filter((r) => r.suggestion.rawQty > 0)
    expect(rows.length).toBeGreaterThan(0)
    for (const g of planPurchaseRequests(rows).groups) {
      for (const line of g.lines) {
        const row = rows.find((r) => r.sku === line.sku && r.warehouseId === line.warehouseId)!
        expect(line.recommendedQty).toBe(row.suggestion.rawQty)
      }
    }
  })

  it('at least one row would have been rounded, proving the distinction is real', () => {
    // If nothing were ever rounded the assertion above would be vacuous.
    const rounded = worklist.rows.filter(
      (r) => r.suggestion.rawQty > 0 && r.suggestion.stockingQty !== r.suggestion.rawQty,
    )
    expect(rounded.length).toBeGreaterThan(0)
  })
})

describe('changing vendor recomputes the quantity (US-022 AC-02 / VR-01)', () => {
  const multi = worklist.rows.find(
    (r) => r.suggestion.rawQty > 0 && vendorItemsForSku(r.sku).length > 1,
  )

  it('a slower vendor needs a bigger order; a faster one needs less', () => {
    expect(multi).toBeTruthy()
    const alternates = vendorItemsForSku(multi!.sku)
    const slowest = [...alternates].sort((a, b) => b.leadTimeDays - a.leadTimeDays)[0]!
    const fastest = [...alternates].sort((a, b) => a.leadTimeDays - b.leadTimeDays)[0]!

    const slowQty = recomputeQtyForVendor(multi!, slowest.vendorId)
    const fastQty = recomputeQtyForVendor(multi!, fastest.vendorId)
    if (slowest.leadTimeDays > fastest.leadTimeDays) {
      expect(slowQty).toBeGreaterThan(fastQty)
    } else {
      expect(slowQty).toBe(fastQty)
    }
  })

  it('only lead time moves — demand, safety and coverage are vendor-independent', () => {
    const row = multi!
    const alt = vendorItemsForSku(row.sku).find((v) => v.vendorId !== row.vendorItem?.vendorId)!
    const expected = Math.max(0, Math.ceil(
      (alt.leadTimeDays + row.safetyDays + row.coverageDays) * row.velocity.avgDailySales
      - (row.atp.available + row.atp.onOrder),
    ))
    expect(recomputeQtyForVendor(row, alt.vendorId)).toBe(expected)
  })

  it('a hand-typed quantity is never overwritten by a vendor change (VR-03)', () => {
    const row = multi!
    const alt = vendorItemsForSku(row.sku).find((v) => v.vendorId !== row.vendorItem?.vendorId)!
    const typed = 4242
    const plan = planPurchaseRequests([row], { [row.key]: typed }, { [row.key]: alt.vendorId })
    const line = plan.groups.flatMap((g) => g.lines).find((l) => l.sku === row.sku)!
    expect(line.finalQty).toBe(typed)
    expect(line.manuallyEdited).toBe(true)
    // The recommendation is still carried, so the UI can offer "apply new?".
    expect(line.recommendedQty).toBe(recomputeQtyForVendor(row, alt.vendorId))
  })
})

describe('createPurchaseRequests — commits requests, never orders', () => {
  it('creates real Purchase Requests and records the deviation (US-020 AC-02)', () => {
    const rows = worklist.rows.slice(0, 4).filter((r) => r.suggestion.rawQty > 0)
    expect(rows.length).toBeGreaterThan(0)

    const before = purchaseRequests.length
    const posBefore = purchaseOrders.length
    const bumped = Object.fromEntries(rows.map((r) => [r.key, r.suggestion.rawQty + 5]))
    const result = createPurchaseRequests(rows, bumped)

    expect(result.created.length).toBeGreaterThan(0)
    expect(purchaseRequests.length).toBe(before + result.created.length)
    // US-023 AC-01 — not one purchase order came out of this.
    expect(purchaseOrders.length).toBe(posBefore)

    for (const created of result.created) {
      const pr = purchaseRequests.find((p) => p.id === created.id)!
      expect(pr.replenishment?.source).toBe('replenishment')
      expect(pr.replenishment?.asOf).toBe(REPL_ASOF_ISO)
      expect(pr.tags).toContain('Replenishment')
      expect(pr.lines.length).toBeGreaterThan(0)
      for (const line of pr.replenishment!.lines) {
        expect(line.deviation).toBe(line.finalQty - line.recommendedQty)
        expect(line.deviation).toBe(5)
      }
    }
  })

  it('the "needed by" date is the run date plus lead time (US-020 AC-01)', () => {
    const rows = worklist.rows.slice(0, 2).filter((r) => r.suggestion.rawQty > 0)
    const plan = planPurchaseRequests(rows)
    for (const g of plan.groups) {
      const pr = createPurchaseRequestFromGroup(g)
      expect(pr.requiredDate).toBe(shiftDays(REPL_ASOF_ISO, g.leadTimeDays))
      expect(pr.date).toBe(REPL_ASOF_ISO)
    }
  })

  it('the suggested vendor rides along as guidance, not a binding (VR-05)', () => {
    const rows = worklist.rows.filter((r) => r.vendorItem && r.suggestion.rawQty > 0).slice(0, 2)
    const plan = planPurchaseRequests(rows)
    for (const g of plan.groups) {
      const pr = createPurchaseRequestFromGroup(g)
      if (g.vendorId) expect(pr.vendor?.id).toBe(g.vendorId)
      // Nothing on the request binds it to that vendor.
      expect(pr.status).toBe('open')
    }
  })
})

describe('US-023 — replenishment never creates a PO (structural)', () => {
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  const prSource = stripComments(readFileSync(
    join(process.cwd(), 'app/data/replenishmentPurchaseRequest.ts'), 'utf8',
  ))

  it('the worklist module cannot reach any PO mutator', () => {
    expect(prSource).not.toMatch(/addPurchaseOrder/)
    expect(prSource).not.toMatch(/nextPurchaseOrderNumber/)
    expect(prSource).not.toMatch(/from '\.\/purchaseOrders'/)
    expect(prSource).not.toMatch(/replenishmentDraftPo/)
  })

  it('it emits no PO status literal at all', () => {
    for (const status of ['sent', 'approved', 'draft', 'partially-processed', 'awaiting invoice']) {
      expect(prSource).not.toMatch(new RegExp(`status:\\s*'${status}'`))
    }
  })

  it('PO creation lives behind a Purchase Request, not behind worklist rows', () => {
    const poSource = stripComments(readFileSync(
      join(process.cwd(), 'app/data/replenishmentDraftPo.ts'), 'utf8',
    ))
    // No entry point takes worklist rows any more — converting is a purchasing act.
    expect(poSource).not.toMatch(/WorklistRow/)
    expect(poSource).toMatch(/createPoFromPurchaseRequest/)
    // And when it does create one, it is still only ever a draft.
    const statuses = [...poSource.matchAll(/status:\s*'([a-z -]+)'/g)].map((m) => m[1])
    expect(new Set(statuses)).toEqual(new Set(['draft']))
  })
})
