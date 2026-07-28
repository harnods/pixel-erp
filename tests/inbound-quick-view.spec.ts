/**
 * Inbound operational quick view (WMS PRD 1.4) — metrics are derived from the
 * shared mini-DB (receipts + receiving + put-away tasks). These lock the metric
 * invariants rather than exact seed magnitudes, so they stay valid as the seed
 * evolves: classifications partition their total, subsets never exceed the total,
 * warehouse scoping only narrows, and an out-of-range date is empty.
 */
import { describe, it, expect } from 'vitest'
import {
  inboundQuickView,
  quickViewWarehouseOptions,
  quickViewOperatorOptions,
  type QuickViewMetrics,
} from '~/data/inboundQuickView'
import { TODAY_ISO } from '~/data/master'
import { warehouses } from '~/data/warehouses'

const allNumbers = (m: QuickViewMetrics): number[] => [
  m.pending.total, m.pending.due, m.pending.overdue,
  m.receiving.total, m.receiving.due, m.receiving.late, m.receiving.early,
  m.putaway.total, m.putaway.due, m.putaway.late, m.putaway.early,
  m.closed.total, m.closed.onTime, m.closed.late, m.closed.early,
  m.idle.none, m.idle.receivingOpen, m.idle.putawayOpen,
]

describe('inboundQuickView — metric invariants', () => {
  it('all card numbers are non-negative integers', () => {
    const m = inboundQuickView({ warehouseId: 'all', date: TODAY_ISO, operator: 'all' })
    for (const n of allNumbers(m)) {
      expect(Number.isInteger(n)).toBe(true)
      expect(n).toBeGreaterThanOrEqual(0)
    }
  })

  it('on-receiving / on-putaway due+late+early exactly partition the total', () => {
    const m = inboundQuickView({ warehouseId: 'all', date: TODAY_ISO, operator: 'all' })
    expect(m.receiving.due + m.receiving.late + m.receiving.early).toBe(m.receiving.total)
    expect(m.putaway.due + m.putaway.late + m.putaway.early).toBe(m.putaway.total)
  })

  it('pending due+overdue never exceeds pending total (some pending may be future-dated)', () => {
    const m = inboundQuickView({ warehouseId: 'all', date: TODAY_ISO, operator: 'all' })
    expect(m.pending.due + m.pending.overdue).toBeLessThanOrEqual(m.pending.total)
  })

  it('scoping to one warehouse never exceeds the all-warehouses totals', () => {
    const all = inboundQuickView({ warehouseId: 'all', date: TODAY_ISO, operator: 'all' })
    const oneId = warehouses.find((w) => !w.isDefault && w.status === 'active')!.id
    const one = inboundQuickView({ warehouseId: oneId, date: TODAY_ISO, operator: 'all' })
    expect(one.pending.total).toBeLessThanOrEqual(all.pending.total)
    expect(one.receiving.total).toBeLessThanOrEqual(all.receiving.total)
    expect(one.closed.total).toBeLessThanOrEqual(all.closed.total)
  })

  it('a date far outside the seed window is a clean empty state (all zeros)', () => {
    const m = inboundQuickView({ warehouseId: 'all', date: '2000-01-01', operator: 'all' })
    // pending/idle are date-agnostic in part, but nothing arrives/closes/starts on 2000-01-01.
    expect(m.receiving.total).toBe(0)
    expect(m.putaway.total).toBe(0)
    expect(m.closed.total).toBe(0)
    expect(m.pending.due).toBe(0)
  })
})

describe('inboundQuickView — filter option sets', () => {
  it('warehouse options lead with "All" and contain only active, non-default warehouses', () => {
    const opts = quickViewWarehouseOptions()
    expect(opts[0]).toEqual({ value: 'all', label: 'All warehouses' })
    for (const o of opts.slice(1)) {
      const w = warehouses.find((x) => x.id === o.value)!
      expect(w.isDefault).not.toBe(true)
      expect(w.status).toBe('active')
    }
  })

  it('operator options always offer All and Not assigned', () => {
    const opts = quickViewOperatorOptions()
    expect(opts.some((o) => o.value === 'all')).toBe(true)
    expect(opts.some((o) => o.value === 'none')).toBe(true)
  })
})
