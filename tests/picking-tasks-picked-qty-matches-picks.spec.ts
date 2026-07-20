// @vitest-environment happy-dom
/**
 * Bug: a picking task's "Picked qty" stat (pickedByKey[key]) could disagree
 * with how many serials/batch qty its real serialPicks/batchPicks actually
 * listed — e.g. "Picked qty 4" while the serial number detail table showed 5
 * rows, all "Picked". Root cause: seedTasks()'s demo generator populated the
 * REAL serialPicks/batchPicks via assignmentsFromReservations(), which caps
 * each line at its FULL qty (the reservation plan) — but for "in progress"/
 * "partially picked" demo tasks, pickedByKey only holds a FRACTION of that.
 * trimPicksToPickedQty() now trims the real picks to match. This test asserts
 * the invariant holds across every seeded picking task, not just the one
 * reported.
 */
import { describe, it, expect } from 'vitest'
import { pickingTasks } from '~/data/pickingTasks'

describe('Picking tasks — pickedByKey always agrees with serialPicks/batchPicks', () => {
  it('every line with real serial picks has exactly pickedByKey[key] serials, never more or fewer', () => {
    const mismatches: string[] = []
    for (const t of pickingTasks) {
      if (!t.pickedByKey || !t.serialPicks) continue
      for (const [key, picks] of Object.entries(t.serialPicks)) {
        const expected = t.pickedByKey[key] ?? 0
        if (picks.length !== expected) {
          mismatches.push(`${t.id} / ${key}: pickedByKey=${expected}, serialPicks.length=${picks.length}`)
        }
      }
    }
    expect(mismatches).toEqual([])
  })

  it('every line with real batch picks sums to exactly pickedByKey[key], never more or fewer', () => {
    const mismatches: string[] = []
    for (const t of pickingTasks) {
      if (!t.pickedByKey || !t.batchPicks) continue
      for (const [key, picks] of Object.entries(t.batchPicks)) {
        const expected = t.pickedByKey[key] ?? 0
        const actual = picks.reduce((s, b) => s + b.qty, 0)
        if (actual !== expected) {
          mismatches.push(`${t.id} / ${key}: pickedByKey=${expected}, batchPicks sum=${actual}`)
        }
      }
    }
    expect(mismatches).toEqual([])
  })

  it('sanity: at least one seeded task is genuinely partial (pickedByKey < line qty) with real serial or batch picks, so the above assertions are not vacuous', () => {
    const hasPartialWithPicks = pickingTasks.some((t) => {
      if (!t.pickedByKey) return false
      return t.lines.some((l) => {
        const picked = t.pickedByKey![l.key] ?? 0
        if (picked >= l.qty || picked <= 0) return false
        return !!(t.serialPicks?.[l.key]?.length || t.batchPicks?.[l.key]?.length)
      })
    })
    expect(hasPartialWithPicks).toBe(true)
  })

  it('plannedSerialPicks/plannedBatchPicks still reflect the FULL reservation plan, unaffected by the trim', () => {
    const t = pickingTasks.find((task) =>
      task.pickedByKey && task.lines.some((l) => {
        const picked = task.pickedByKey![l.key] ?? 0
        return picked > 0 && picked < l.qty && !!task.plannedSerialPicks?.[l.key]?.length
      }),
    )
    expect(t).toBeTruthy()
    const line = t!.lines.find((l) => {
      const picked = t!.pickedByKey![l.key] ?? 0
      return picked > 0 && picked < l.qty && !!t!.plannedSerialPicks?.[l.key]?.length
    })!
    const picked = t!.pickedByKey![line.key]!
    // The plan still covers the line's full qty (or the order's full reservation,
    // whichever is smaller) — it must NOT have been trimmed down to the partial
    // picked amount, only the real serialPicks field was.
    expect(t!.plannedSerialPicks![line.key]!.length).toBeGreaterThan(picked)
  })
})
