/**
 * ATP netting, worklist assembly and the badge/page anti-drift invariant.
 *
 *  • ATP keeps faith with the mini-DB's core invariant (available = onHand −
 *    reserved) and never invents on-order: every citation resolves to a real open
 *    receipt in the same warehouse, and a partially-received one contributes only
 *    its remainder (US-006 AC-02).
 *  • The worklist never blends warehouses (US-025), never fabricates a quantity for
 *    a row without a demand basis (US-003 CON-02), and only ever names real
 *    catalogue products.
 *  • `replenishmentDueCount()` equals the table's own row count — the one invariant
 *    that stops a tab badge drifting from the list it labels.
 *  • Reading a worklist must not advance a cycle.
 *
 * Pure/read-only.
 */
import { describe, it, expect } from 'vitest'
import {
  atpFor, onOrderFor, buildRow, replenishmentWorklist, replenishmentDueCount,
  replenishmentSetupCount, replenishmentWarehouses,
} from '~/data/replenishment'
import { getRunState } from '~/data/replenishmentRuns'
import { REPL_ASOF_ISO } from '~/data/replenishmentConfig'
import { PRODUCTS, warehouseProducts } from '~/data/inventory'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { receipts } from '~/data/receipts'
import { lineItemsForReceipt } from '~/data/receiptLineItems'
import { skusWithoutVendor } from '~/data/vendorItems'

const CATALOG_NAMES = new Set(PRODUCTS.map((p) => p.name))
const CATALOG_SKUS = new Set(PRODUCTS.map((p) => p.sku))
const activeWarehouses = replenishmentWarehouses()

describe('atpFor — netting', () => {
  it('never contradicts available = onHand − reserved', () => {
    for (const wh of activeWarehouses) {
      for (const p of warehouseProducts(wh.id)) {
        const atp = atpFor(p.sku, wh.id)
        expect(atp.available).toBe(atp.onHand - atp.reserved)
        expect(atp.netAvailable).toBe(atp.available + atp.onOrder)
      }
    }
  })

  it('never reports negative on-order', () => {
    for (const wh of activeWarehouses) {
      for (const p of warehouseProducts(wh.id)) {
        expect(atpFor(p.sku, wh.id).onOrder).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('flags oversold exactly when available is negative', () => {
    for (const wh of activeWarehouses) {
      for (const p of warehouseProducts(wh.id)) {
        const atp = atpFor(p.sku, wh.id)
        expect(atp.oversold).toBe(atp.available < 0)
      }
    }
  })

  it('every on-order citation is a real open receipt in this warehouse for this SKU', () => {
    const byId = new Map(receipts.map((r) => [r.id, r]))
    let cited = 0
    for (const wh of activeWarehouses) {
      for (const p of warehouseProducts(wh.id)) {
        for (const doc of onOrderFor(p.sku, wh.id)) {
          cited++
          const receipt = byId.get(doc.receiptId)
          expect(receipt).toBeTruthy()
          expect(receipt!.warehouseId).toBe(wh.id)
          expect(receipt!.number).toBe(doc.number)
          // Terminal receipts are not incoming supply.
          expect(['completed', 'canceled']).not.toContain(receipt!.status)
          // The SKU really is on the receipt, and we never claim more than ordered.
          const line = lineItemsForReceipt(receipt!).find((l) => l.sku === p.sku)
          expect(line).toBeTruthy()
          expect(doc.outstanding).toBeGreaterThan(0)
          expect(doc.outstanding).toBeLessThanOrEqual(line!.purchaseQty)
        }
      }
    }
    expect(cited, 'no open receipts contributed on-order at all').toBeGreaterThan(0)
  })

  it('reads real stock rather than the synthetic onTheWay field', () => {
    // onTheWay is (i * 7) % 60 — not derived from any document. If on-order ever
    // equals it across the board, someone wired the wrong field.
    let matches = 0
    let compared = 0
    for (const wh of activeWarehouses) {
      const detail = getWarehouseDetail(wh.id)
      for (const p of warehouseProducts(wh.id)) {
        const stock = detail?.stock.find((s) => s.sku === p.sku)
        if (!stock) continue
        compared++
        if (atpFor(p.sku, wh.id).onOrder === stock.onTheWay) matches++
      }
    }
    expect(compared).toBeGreaterThan(0)
    expect(matches).toBeLessThan(compared)
  })
})

describe('worklist — scope and grain', () => {
  it('every row belongs to an active, non-default warehouse', () => {
    const ids = new Set(activeWarehouses.map((w) => w.id))
    for (const row of replenishmentWorklist('all').rows) {
      expect(ids.has(row.warehouseId)).toBe(true)
    }
  })

  it('a single-warehouse worklist is a strict subset of the all-warehouse one', () => {
    const all = new Set(replenishmentWorklist('all').rows.map((r) => r.key))
    for (const wh of activeWarehouses) {
      for (const row of replenishmentWorklist(wh.id).rows) {
        expect(all.has(row.key)).toBe(true)
        expect(row.warehouseId).toBe(wh.id)
      }
    }
  })

  it('never blends warehouses — one row per SKU-warehouse pair, keys unique', () => {
    const rows = replenishmentWorklist('all').rows
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length)
    for (const row of rows) expect(row.key).toBe(`${row.sku}::${row.warehouseId}`)
  })

  it('only names real catalogue products', () => {
    const list = replenishmentWorklist('all')
    for (const row of [...list.rows, ...list.needsSetup, ...list.notTracked]) {
      expect(CATALOG_SKUS.has(row.sku)).toBe(true)
      expect(CATALOG_NAMES.has(row.productName)).toBe(true)
    }
  })

  it('is anchored to the replenishment as-of date, not the accounting clock', () => {
    expect(replenishmentWorklist('all').asOf).toBe(REPL_ASOF_ISO)
  })
})

describe('worklist — buckets', () => {
  const list = replenishmentWorklist('all')

  it('has something to show (the whole feature would be an empty screen otherwise)', () => {
    expect(list.rows.length).toBeGreaterThan(0)
    expect(list.totals.pairs).toBeGreaterThan(200)
  })

  it('every due row has a demand basis, a reorder point and a positive quantity', () => {
    for (const row of list.rows) {
      expect(row.velocity.avgDailySales).toBeGreaterThan(0)
      expect(row.reorderPointSource).not.toBe('none')
      expect(row.atp.available + row.atp.onOrder).toBeLessThan(row.reorderPoint + 1)
      if (row.vendorItem) expect(row.suggestion.purchaseQty).toBeGreaterThan(0)
    }
  })

  it('needs-setup rows never carry a fabricated quantity (US-003 AC-03)', () => {
    // Under D18 Needs setup is only for a genuinely missing lead time (demand no
    // longer blocks — 0 sales just drops out), so with a global lead-time fallback
    // set it can legitimately be empty. Whatever rows are here must carry no
    // quantity and name what they are missing.
    for (const row of list.needsSetup) {
      expect(row.suggestion.purchaseQty).toBe(0)
      expect(row.suggestion.stockingQty).toBe(0)
      expect(row.missing).toContain('Lead time')
    }
  })

  it('no-vendor rows are due but unorderable, and match the vendor master', () => {
    const vendorless = new Set(skusWithoutVendor())
    expect(vendorless.size).toBeGreaterThan(0)
    for (const row of list.rows) {
      if (row.bucket !== 'no-vendor') continue
      expect(row.vendorItem).toBeNull()
      expect(vendorless.has(row.sku)).toBe(true)
      expect(row.missing).toContain('Vendor')
    }
  })

  it('rows are ordered most urgent first', () => {
    for (let i = 1; i < list.rows.length; i++) {
      expect(list.rows[i - 1]!.urgency).toBeGreaterThanOrEqual(list.rows[i]!.urgency)
    }
  })

  it('days of cover is null exactly when there is no velocity', () => {
    for (const wh of activeWarehouses) {
      for (const p of warehouseProducts(wh.id)) {
        const row = buildRow(p.sku, wh.id)
        if (row.velocity.avgDailySales <= 0) expect(row.cover.coverDays).toBeNull()
        else expect(row.cover.coverDays).not.toBeNull()
      }
    }
  })
})

describe('worklist — counts cannot drift from the table', () => {
  it('replenishmentDueCount equals the row count, per warehouse and overall', () => {
    expect(replenishmentDueCount()).toBe(replenishmentWorklist('all').rows.length)
    for (const wh of activeWarehouses) {
      expect(replenishmentDueCount(wh.id)).toBe(replenishmentWorklist(wh.id).rows.length)
    }
  })

  it('replenishmentSetupCount equals the needs-setup count', () => {
    expect(replenishmentSetupCount()).toBe(replenishmentWorklist('all').needsSetup.length)
  })

  it('per-warehouse due counts sum to the total', () => {
    const summed = activeWarehouses.reduce((s, wh) => s + replenishmentDueCount(wh.id), 0)
    expect(summed).toBe(replenishmentDueCount())
  })
})

describe('worklist — reading never advances a cycle', () => {
  it('leaves the run ledger untouched', () => {
    const before = JSON.stringify(getRunState())
    replenishmentWorklist('all')
    replenishmentDueCount('wh-001')
    buildRow('1101', 'wh-001')
    expect(JSON.stringify(getRunState())).toBe(before)
  })
})
