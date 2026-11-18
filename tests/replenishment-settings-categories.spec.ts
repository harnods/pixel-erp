/**
 * Settings → Product categories (US-001 / D21).
 *
 * A category the buyer lists must survive Save even when it carries no per-category
 * value yet — otherwise it vanishes from every per-category table (Safety days,
 * Order coverage, Default lead time, Ignore gaps over) on the next load. The listed
 * set is persisted explicitly; map keys alone cannot record an all-inherit category.
 */
import { describe, it, expect, afterEach } from 'vitest'
import {
  getReplenishmentConfig, saveReplenishmentConfig, resetReplenishmentConfig, REPL_DEFAULTS,
} from '~/data/replenishmentConfig'

afterEach(() => resetReplenishmentConfig())

describe('replenishment settings — listed categories persist', () => {
  it('defaults list the six seeded categories', () => {
    const cfg = getReplenishmentConfig()
    expect(cfg.listedCategories).toEqual(
      ['Accessory', 'Equipment', 'Espresso Machine', 'Green Beans', 'Grinder', 'Roasted Beans'],
    )
  })

  it('a newly listed category with NO per-category value survives save + reload', () => {
    const cfg = getReplenishmentConfig()
    expect(cfg.listedCategories).not.toContain('Packaging')

    // What the Settings page does on Save: it writes the resolved listed set, but the
    // numeric maps drop empty entries — so an all-inherit category exists ONLY in the list.
    saveReplenishmentConfig({ ...cfg, listedCategories: [...cfg.listedCategories, 'Packaging'].sort() })

    const reloaded = getReplenishmentConfig()
    expect(reloaded.listedCategories).toContain('Packaging')
    // It inherits "Other categories" — no value in any per-category map.
    expect(reloaded.safetyDaysByCategory.Packaging).toBeUndefined()
    expect(reloaded.coverageDaysByCategory.Packaging).toBeUndefined()
    expect(reloaded.leadTimeByCategory.Packaging).toBeUndefined()
    expect(reloaded.leadTimeOutlierCapByCategory.Packaging).toBeUndefined()
  })

  it('an added category removed from the list no longer shows after reload', () => {
    const trimmed = (m: Record<string, number>) => {
      const { Packaging: _omit, ...rest } = m
      return rest
    }
    // List Packaging (with a value), then remove it from the list AND every map
    // (what removeCategory does). A non-default category has no default to merge back.
    const base = getReplenishmentConfig()
    saveReplenishmentConfig({
      ...base,
      listedCategories: [...base.listedCategories, 'Packaging'].sort(),
      safetyDaysByCategory: { ...base.safetyDaysByCategory, Packaging: 3 },
    })
    expect(getReplenishmentConfig().listedCategories).toContain('Packaging')

    const cur = getReplenishmentConfig()
    saveReplenishmentConfig({
      ...cur,
      listedCategories: cur.listedCategories.filter((c) => c !== 'Packaging'),
      safetyDaysByCategory: trimmed(cur.safetyDaysByCategory),
      coverageDaysByCategory: trimmed(cur.coverageDaysByCategory),
      leadTimeByCategory: trimmed(cur.leadTimeByCategory),
      leadTimeOutlierCapByCategory: trimmed(cur.leadTimeOutlierCapByCategory),
    })

    expect(getReplenishmentConfig().listedCategories).not.toContain('Packaging')
  })

  it('back-compat: a config saved without a list still lists any category that carries a value', () => {
    // Simulate an older stored config (no listedCategories) that has a value for a
    // category not in the seed defaults.
    const cfg = getReplenishmentConfig()
    const legacy = { ...cfg, safetyDaysByCategory: { ...cfg.safetyDaysByCategory, Packaging: 3 } }
    delete (legacy as { listedCategories?: string[] }).listedCategories
    saveReplenishmentConfig(legacy as typeof cfg)

    expect(getReplenishmentConfig().listedCategories).toContain('Packaging')
  })

  it('REPL_DEFAULTS declares a listedCategories array', () => {
    expect(Array.isArray(REPL_DEFAULTS.listedCategories)).toBe(true)
  })
})
