// @vitest-environment happy-dom
/**
 * Safety guards that must not be quietly lost.
 *
 *  • US-014 — muting a SKU removes routine worklist noise but NEVER suppresses a
 *    genuine stockout risk. A muted SKU that drops to/below its reorder point still
 *    surfaces on the "muted but active" review list.
 *  • US-013 — muting keeps the SKU in the system: its settings survive, and
 *    un-muting restores it. Bulk mute reports how many actually changed.
 *  • US-011 / US-024 — override precedence really is SKU-warehouse > SKU >
 *    category > global.
 *
 * Runs in happy-dom because the settings store is localStorage-backed. WRITES to
 * that store, so each test resets it first.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  effectiveSettings, saveSkuOverride, saveSkuWarehouseOverride, setTracked,
  setTrackedBulk, clearReorderPointOverride, resetReplenishmentSettings, overrideCount,
} from '~/data/replenishmentSettings'
import { buildRow, replenishmentWorklist } from '~/data/replenishment'
import { REPL_DEFAULTS } from '~/data/replenishmentConfig'
import { REPL_COLD_START_SKUS } from '~/data/demandHistory'

const SKU = '1101'          // Roasted Beans House Blend Medium — a reliable fast mover
const WH = 'wh-001'

beforeEach(() => {
  resetReplenishmentSettings()
})

describe('US-013 — track / don’t-track toggle', () => {
  it('muting removes the row from the active worklist', () => {
    const before = replenishmentWorklist(WH).rows.some((r) => r.sku === SKU)
    expect(before, `${SKU} must be due in ${WH} for this test to mean anything`).toBe(true)

    setTracked(SKU, WH, false)
    expect(replenishmentWorklist(WH).rows.some((r) => r.sku === SKU)).toBe(false)
  })

  it('muting moves the row to Not tracked rather than deleting it', () => {
    setTracked(SKU, WH, false)
    const list = replenishmentWorklist(WH)
    expect(list.notTracked.some((r) => r.sku === SKU)).toBe(true)
  })

  it('un-muting restores the row, settings intact', () => {
    saveSkuWarehouseOverride(SKU, WH, { reorderPoint: 123, safetyDays: 9 })
    setTracked(SKU, WH, false)
    setTracked(SKU, WH, true)

    const settings = effectiveSettings(SKU, WH)
    expect(settings.tracked).toBe(true)
    expect(settings.reorderPointOverride).toBe(123)
    expect(settings.safetyDays).toBe(9)
    expect(replenishmentWorklist(WH).rows.some((r) => r.sku === SKU)).toBe(true)
  })

  it('bulk mute reports how many pairs actually changed', () => {
    const pairs = [{ sku: SKU, warehouseId: WH }, { sku: '1102', warehouseId: WH }]
    expect(setTrackedBulk(pairs, false)).toBe(2)
    // Already muted — nothing changes, and the count says so rather than lying.
    expect(setTrackedBulk(pairs, false)).toBe(0)
    expect(setTrackedBulk(pairs, true)).toBe(2)
  })

  it('a muted pair really persists as muted', () => {
    setTracked(SKU, WH, false)
    expect(effectiveSettings(SKU, WH).tracked).toBe(false)
    expect(buildRow(SKU, WH).bucket).toBe('not-tracked')
  })
})

describe('US-014 — a muted SKU still fires a stockout alert', () => {
  it('surfaces a muted, at-risk SKU on the muted-but-active list', () => {
    const row = buildRow(SKU, WH)
    expect(row.flags.dueForReorder, `${SKU} must be due for this test to mean anything`).toBe(true)

    setTracked(SKU, WH, false)

    const list = replenishmentWorklist(WH)
    // Gone from the routine worklist...
    expect(list.rows.some((r) => r.sku === SKU)).toBe(false)
    // ...but the risk is NOT suppressed.
    expect(list.mutedButActive.some((r) => r.sku === SKU)).toBe(true)
    expect(buildRow(SKU, WH).flags.mutedButActive).toBe(true)
  })

  it('does not flag a muted SKU that is comfortably stocked', () => {
    // A huge manual reorder point of 0 means nothing is at risk; use an override
    // that puts the SKU well above its trigger instead.
    saveSkuWarehouseOverride(SKU, WH, { reorderPoint: 0 })
    setTracked(SKU, WH, false)
    expect(buildRow(SKU, WH).flags.mutedButActive).toBe(false)
  })

  it('muting never suppresses the alert for any pair in the catalogue', () => {
    // Mute everything, then assert that every pair which WAS due still shows up as
    // muted-but-active. This is the invariant that stops muting becoming a blind spot.
    const dueBefore = replenishmentWorklist('all').rows.map((r) => r.key)
    expect(dueBefore.length).toBeGreaterThan(0)

    const pairs = dueBefore.map((key) => {
      const [sku, warehouseId] = key.split('::') as [string, string]
      return { sku, warehouseId }
    })
    setTrackedBulk(pairs, false)

    const after = replenishmentWorklist('all')
    expect(after.rows.length).toBe(0)
    const alerted = new Set(after.mutedButActive.map((r) => r.key))
    for (const key of dueBefore) expect(alerted.has(key)).toBe(true)
  })
})

describe('override precedence (US-011, US-024)', () => {
  it('safety days resolve SKU-warehouse > SKU > category > global', () => {
    // Category default for Roasted Beans, since nothing is overridden.
    const category = REPL_DEFAULTS.safetyDaysByCategory['Roasted Beans']!
    expect(effectiveSettings(SKU, WH).safetyDays).toBe(category)
    expect(effectiveSettings(SKU, WH).safetyDaysSource).toBe('category')

    saveSkuOverride(SKU, { safetyDays: 21 })
    expect(effectiveSettings(SKU, WH).safetyDays).toBe(21)
    expect(effectiveSettings(SKU, WH).safetyDaysSource).toBe('sku')

    saveSkuWarehouseOverride(SKU, WH, { safetyDays: 3 })
    expect(effectiveSettings(SKU, WH).safetyDays).toBe(3)
    expect(effectiveSettings(SKU, WH).safetyDaysSource).toBe('sku-warehouse')

    // A different warehouse still inherits the SKU-level value.
    expect(effectiveSettings(SKU, 'wh-002').safetyDays).toBe(21)
  })

  it('a category with no configured value falls back to global', () => {
    // Equipment has a category entry; a nonexistent category must fall through.
    const row = effectiveSettings('9999', WH)
    expect(row.safetyDays).toBe(REPL_DEFAULTS.safetyDaysGlobal)
    expect(row.safetyDaysSource).toBe('global')
  })

  it('the reorder point is per warehouse, and clearing restores the calculated value', () => {
    saveSkuWarehouseOverride(SKU, WH, { reorderPoint: 500 })
    expect(buildRow(SKU, WH).reorderPoint).toBe(500)
    expect(buildRow(SKU, WH).reorderPointSource).toBe('sku-warehouse')
    // Another warehouse is unaffected — settings are per SKU-warehouse (US-024 AC-01).
    expect(buildRow(SKU, 'wh-002').reorderPointSource).toBe('calculated')

    clearReorderPointOverride(SKU, WH)
    expect(buildRow(SKU, WH).reorderPointSource).toBe('calculated')
  })

  it('counts only real overrides', () => {
    expect(overrideCount()).toBe(0)
    saveSkuWarehouseOverride(SKU, WH, { safetyDays: 4 })
    expect(overrideCount()).toBe(1)
    // Clearing the only key removes the record rather than leaving an empty shell.
    saveSkuWarehouseOverride(SKU, WH, { safetyDays: undefined })
    expect(overrideCount()).toBe(0)
  })

  it('missing demand never routes to Needs setup (D18) — only missing lead time does', () => {
    // A 0-sales SKU resolves to demand 0 → reorder point 0 → it drops out of the
    // worklist entirely; it is never forced into Needs setup for demand, and any
    // Needs-setup rows that do exist are there for a missing lead time.
    const list = replenishmentWorklist('all')
    for (const row of list.needsSetup) {
      expect(row.missing).not.toContain('Sales history')
      expect(row.missing).toContain('Lead time')
    }
  })

  it('a provisional (launch-window) SKU tops up only to its reorder point (D18 / §2.7)', () => {
    // A SKU with sales but still inside its cold-start window is "provisional":
    // coverage is forced to 0, so the order-up-to target collapses onto the
    // reorder point rather than a full coverage horizon.
    const provisional = REPL_COLD_START_SKUS
      .flatMap((sku) => ['wh-001', 'wh-002', 'wh-003'].map((wh) => buildRow(sku, wh)))
      .find((r) => r.flags.provisional)

    expect(provisional, 'no provisional row found in the seed').toBeTruthy()
    const r = provisional!
    expect(r.velocity.source).toBe('computed')
    expect(r.velocity.avgDailySales).toBeGreaterThan(0)
    // Coverage 0 ⇒ order-up-to target = velocity × (lead + safety) = the reorder point.
    expect(Math.round(r.suggestion.targetQty)).toBe(r.reorderPoint)
  })
})
