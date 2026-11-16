/**
 * In-progress recalculation job (engineering RFC).
 *
 * A policy change recalculates the affected rows over a short, time-based window that
 * persists across navigation. Broad scopes (company / category / warehouse) hide their
 * rows behind a header banner; a single SKU × warehouse scope only tags its own row.
 */
import { describe, it, expect, afterEach } from 'vitest'
import {
  startRecalc, activeRecalc, clearRecalc, recalcRemainingMs,
  isBroadScope, rowMatchesScope, RECALC_DURATION_MS,
} from '~/data/replenishmentRecalc'

afterEach(() => clearRecalc())

describe('replenishment recalc job', () => {
  it('is active within its window and expires after it', () => {
    const t0 = 1_000_000
    startRecalc({ kind: 'all' })
    const job = activeRecalc()
    expect(job?.scope.kind).toBe('all')
    // Still active just before the window closes, gone just after.
    const started = activeRecalc()!.startedAt
    expect(activeRecalc(started + RECALC_DURATION_MS - 1)).not.toBeNull()
    expect(activeRecalc(started + RECALC_DURATION_MS + 1)).toBeNull()
    void t0
  })

  it('reports remaining time and clears', () => {
    startRecalc({ kind: 'all' })
    expect(recalcRemainingMs()).toBeGreaterThan(0)
    clearRecalc()
    expect(activeRecalc()).toBeNull()
    expect(recalcRemainingMs()).toBe(0)
  })

  it('classifies broad vs single-SKU scopes', () => {
    expect(isBroadScope({ kind: 'all' })).toBe(true)
    expect(isBroadScope({ kind: 'category', categories: ['Green Beans'] })).toBe(true)
    expect(isBroadScope({ kind: 'warehouse', warehouseId: 'wh-001' })).toBe(true)
    expect(isBroadScope({ kind: 'sku', sku: '1001', warehouseId: 'wh-001' })).toBe(false)
  })

  it('matches rows to each scope', () => {
    // all → every row
    expect(rowMatchesScope({ kind: 'all' }, '1001', 'wh-001', 'Green Beans')).toBe(true)
    // category → only that category
    const cat = { kind: 'category', categories: ['Green Beans'] } as const
    expect(rowMatchesScope(cat, '1001', 'wh-001', 'Green Beans')).toBe(true)
    expect(rowMatchesScope(cat, '2201', 'wh-001', 'Equipment')).toBe(false)
    // warehouse → only that warehouse
    const wh = { kind: 'warehouse', warehouseId: 'wh-001' } as const
    expect(rowMatchesScope(wh, '1001', 'wh-001', 'Green Beans')).toBe(true)
    expect(rowMatchesScope(wh, '1001', 'wh-002', 'Green Beans')).toBe(false)
    // sku → only that exact SKU × warehouse
    const sku = { kind: 'sku', sku: '1001', warehouseId: 'wh-001' } as const
    expect(rowMatchesScope(sku, '1001', 'wh-001', 'Green Beans')).toBe(true)
    expect(rowMatchesScope(sku, '1001', 'wh-002', 'Green Beans')).toBe(false)
    expect(rowMatchesScope(sku, '1003', 'wh-001', 'Green Beans')).toBe(false)
  })
})
