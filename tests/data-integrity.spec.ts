/**
 * Data integrity checks for seed + generated warehouse/order data.
 *
 * Rules validated:
 * 1. Every open/in-progress outbound order has enough AVAILABLE qty per SKU
 *    in its warehouse (available = onHand − reserved at the item level).
 * 2. For batch-tracked SKUs: sum(batch.available) === item.available.
 * 3. For batch-tracked SKUs on active orders: sum(batch.available) ≥ order demand.
 * 4. No warehouse stock item has available < 0.
 * 5. item.available === item.onHand − item.reserved for every stock item.
 */

import { describe, it, expect } from 'vitest'
import { outgoingOrders } from '~/data/outgoing'
import { orderSkuLines } from '~/data/inventory'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { warehouses } from '~/data/warehouses'

// ── helpers ───────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES = new Set(['open', 'in progress'])

function activeOrders() {
  return outgoingOrders.filter(o => ACTIVE_STATUSES.has(o.status))
}

// ── 1. Every active order: available ≥ demand per SKU ─────────────────────────

describe('Active outbound orders — warehouse available ≥ order demand', () => {
  const failures: string[] = []

  for (const order of activeOrders()) {
    const lines = orderSkuLines(order)
    const wh = getWarehouseDetail(order.warehouseId)

    for (const line of lines) {
      const item = wh?.stock.find(s => s.sku === line.sku)
      if (!item) {
        failures.push(`${order.salesNo} (${order.warehouseId}): SKU ${line.sku} NOT FOUND in warehouse stock`)
        continue
      }
      if (item.available < line.qty) {
        failures.push(
          `${order.salesNo} (${order.warehouseName}): SKU ${line.sku} ` +
          `demand=${line.qty} > available=${item.available} (onHand=${item.onHand} reserved=${item.reserved})`
        )
      }
    }
  }

  it('no order demands more than available', () => {
    if (failures.length) {
      console.error('\nFAILING ORDERS:\n' + failures.map(f => '  • ' + f).join('\n'))
    }
    expect(failures).toHaveLength(0)
  })
})

// ── 2 & 3. Batch SKUs: batch totals are consistent and cover demand ────────────

describe('Batch-tracked SKUs — batch totals match item totals and cover demand', () => {
  const batchSumMismatches: string[] = []
  const batchCoverageFailures: string[] = []

  // Collect all warehouse × SKU pairs that have batches
  for (const wh of warehouses) {
    const detail = getWarehouseDetail(wh.id)
    if (!detail) continue

    for (const item of detail.stock) {
      if (!item.batches?.length) continue

      const batchOnHandSum = item.batches.reduce((s, b) => s + b.onHand, 0)
      const batchAvailSum  = item.batches.reduce((s, b) => s + b.available, 0)

      // onHand totals must match
      if (batchOnHandSum !== item.onHand) {
        batchSumMismatches.push(
          `${wh.name} / SKU ${item.sku}: ` +
          `item.onHand=${item.onHand} but sum(batch.onHand)=${batchOnHandSum}`
        )
      }

      // available totals must match (batch.available = batch.onHand - batch.reserved)
      if (batchAvailSum !== item.available) {
        batchSumMismatches.push(
          `${wh.name} / SKU ${item.sku}: ` +
          `item.available=${item.available} but sum(batch.available)=${batchAvailSum}`
        )
      }

      // Individual batch: available must not be negative
      for (const b of item.batches) {
        if (b.available < 0) {
          batchSumMismatches.push(
            `${wh.name} / SKU ${item.sku} / ${b.batchNo}: available=${b.available} (negative!)`
          )
        }
      }
    }
  }

  // Check active order demand against batch available totals
  for (const order of activeOrders()) {
    const lines = orderSkuLines(order)
    const wh = getWarehouseDetail(order.warehouseId)
    if (!wh) continue

    for (const line of lines) {
      const item = wh.stock.find(s => s.sku === line.sku)
      if (!item?.batches?.length) continue

      const batchAvailSum = item.batches.reduce((s, b) => s + b.available, 0)
      if (batchAvailSum < line.qty) {
        batchCoverageFailures.push(
          `${order.salesNo} (${order.warehouseName}): SKU ${line.sku} ` +
          `demand=${line.qty} > sum(batch.available)=${batchAvailSum}`
        )
      }
    }
  }

  it('batch onHand and available sums match item totals', () => {
    if (batchSumMismatches.length) {
      console.error('\nBATCH SUM MISMATCHES:\n' + batchSumMismatches.map(f => '  • ' + f).join('\n'))
    }
    expect(batchSumMismatches).toHaveLength(0)
  })

  it('sum(batch.available) covers active order demand', () => {
    if (batchCoverageFailures.length) {
      console.error('\nBATCH COVERAGE FAILURES:\n' + batchCoverageFailures.map(f => '  • ' + f).join('\n'))
    }
    expect(batchCoverageFailures).toHaveLength(0)
  })
})

// ── 4 & 5. Stock item invariants across all warehouses ────────────────────────

describe('Warehouse stock item invariants', () => {
  const negativeAvail: string[] = []
  const inconsistentCalc: string[] = []

  for (const wh of warehouses) {
    const detail = getWarehouseDetail(wh.id)
    if (!detail) continue

    for (const item of detail.stock) {
      if (item.available < 0) {
        negativeAvail.push(`${wh.name} / SKU ${item.sku}: available=${item.available}`)
      }
      const expected = item.onHand - item.reserved
      if (item.available !== expected) {
        inconsistentCalc.push(
          `${wh.name} / SKU ${item.sku}: ` +
          `onHand(${item.onHand}) - reserved(${item.reserved}) = ${expected} ≠ available(${item.available})`
        )
      }
    }
  }

  it('no stock item has negative available qty', () => {
    if (negativeAvail.length) {
      console.error('\nNEGATIVE AVAILABLE:\n' + negativeAvail.map(f => '  • ' + f).join('\n'))
    }
    expect(negativeAvail).toHaveLength(0)
  })

  it('available === onHand − reserved for every item', () => {
    if (inconsistentCalc.length) {
      console.error('\nINCONSISTENT available:\n' + inconsistentCalc.map(f => '  • ' + f).join('\n'))
    }
    expect(inconsistentCalc).toHaveLength(0)
  })
})
