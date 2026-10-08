// @vitest-environment happy-dom
/**
 * View-only replenishment: changing settings (reorder point, safety days, tracking,
 * preferred vendor, bulk import) needs replenishment access; everyone else sees the
 * worklist but cannot change it.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useReplenishmentAccess } from '~/composables/useReplenishmentAccess'
import { useScenario } from '~/composables/useScenario'

describe('who may change replenishment settings', () => {
  beforeEach(() => {
    useScenario().setScenario('ERP')
    useReplenishmentAccess().setReplenishmentAccess(true)
  })

  it('the ERP admin can', () => {
    expect(useReplenishmentAccess().canManageReplenishment.value).toBe(true)
  })

  it('an ERP user without replenishment access is view-only', () => {
    const { setReplenishmentAccess, canManageReplenishment } = useReplenishmentAccess()
    setReplenishmentAccess(false)
    expect(canManageReplenishment.value).toBe(false)
    setReplenishmentAccess(true)
    expect(canManageReplenishment.value).toBe(true)
  })

  it('the other scenarios are always view-only, as the settings page has always said', () => {
    const { canManageReplenishment } = useReplenishmentAccess()
    for (const s of ['WMS Standalone', 'WMS Ops', 'WMS Ops 2'] as const) {
      useScenario().setScenario(s)
      expect(canManageReplenishment.value).toBe(false)
    }
  })
})
