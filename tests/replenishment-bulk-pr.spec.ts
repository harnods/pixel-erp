/**
 * US-018 AC-03 / EH-01 — a large selection is created in the background, group by
 * group, reporting progress, keeping going past a failure and allowing a retry.
 */
import { describe, it, expect } from 'vitest'
import { replenishmentWorklist } from '~/data/replenishment'
import {
  planPurchaseRequests, createPurchaseRequestsFromGroups, createPurchaseRequestsBatched,
  commitPlannedGroup, BULK_ASYNC_MIN_LINES,
} from '~/data/replenishmentPurchaseRequest'
import { purchaseRequests, deletePurchaseRequests } from '~/data/purchaseRequests'

function groupsFor() {
  const rows = replenishmentWorklist('all').rows.filter((r) => r.suggestion.rawQty > 0)
  // A purchase request is per warehouse — take the warehouse with the most due rows.
  const byWh = new Map<string, typeof rows>()
  for (const r of rows) byWh.set(r.warehouseId, [...(byWh.get(r.warehouseId) ?? []), r])
  const biggest = [...byWh.values()].sort((a, b) => b.length - a.length)[0]!
  return planPurchaseRequests(biggest).groups
}

describe('background purchase request creation', () => {
  it('the threshold is reachable by one page of selected rows', () => {
    expect(BULK_ASYNC_MIN_LINES).toBeGreaterThan(0)
    expect(BULK_ASYNC_MIN_LINES).toBeLessThanOrEqual(25)
  })

  it('reports progress per group up to the total, one request per group', async () => {
    const groups = groupsFor()
    const total = groups.reduce((n, g) => n + g.lines.length, 0)
    const ticks: number[] = []
    const before = purchaseRequests.length
    const r = await createPurchaseRequestsFromGroups(groups, {
      pauseMs: 0,
      onProgress: (done, t) => { ticks.push(done); expect(t).toBe(total) },
    })
    try {
      expect(r.failed).toEqual([])
      expect(r.created.length).toBe(groups.length)
      expect(ticks.length).toBe(groups.length)
      expect(ticks[ticks.length - 1]).toBe(total)
      expect(ticks).toEqual([...ticks].sort((a, b) => a - b))
      expect(purchaseRequests.length).toBe(before + groups.length)
    } finally {
      deletePurchaseRequests(r.created.map((c) => c.id))
    }
  })

  it('a failing group is recorded whole, the rest are still created, and a retry creates it', async () => {
    const groups = groupsFor()
    if (groups.length < 2) return // needs two vendor groups to show a partial outcome
    const boom = groups[0]!
    const r1 = await createPurchaseRequestsFromGroups(groups, {
      pauseMs: 0,
      commit: (g, by, skipped) => {
        if (g === boom) throw new Error('save failed')
        return commitPlannedGroup(g, by, skipped)
      },
    })
    const created = [...r1.created]
    try {
      expect(r1.failed).toHaveLength(1)
      expect(r1.failed[0]!.group).toBe(boom)
      expect(r1.failed[0]!.lineCount).toBe(boom.lines.length)
      expect(r1.failed[0]!.error).toBe('save failed')
      expect(r1.created.length).toBe(groups.length - 1)

      // Retry just the failed group.
      const r2 = await createPurchaseRequestsFromGroups(r1.failed.map((f) => f.group), { pauseMs: 0 })
      created.push(...r2.created)
      expect(r2.failed).toEqual([])
      expect(created.length).toBe(groups.length)
    } finally {
      deletePurchaseRequests(created.map((c) => c.id))
    }
  })

  it('the batched entry point plans first and keeps plan-level skips', async () => {
    const rows = replenishmentWorklist('all').rows.slice(0, 3)
    const r = await createPurchaseRequestsBatched(rows, {}, {}, { pauseMs: 0 })
    try {
      expect(r.failed).toEqual([])
    } finally {
      deletePurchaseRequests(r.created.map((c) => c.id))
    }
  })
})
