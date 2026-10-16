/**
 * Production settings › Allow subcontracting. On by default, so subcon keeps
 * working for anyone who never opens the settings page; a snapshot saved before
 * the toggle existed must not switch it off. persist.ts is a no-op outside the
 * browser, so it is mocked to stand in for the stored snapshot.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

let stored: unknown[] | null = null
const saveSnapshot = vi.fn((_key: string, items: unknown[]) => { stored = items })

async function loadSettings() {
  vi.resetModules()
  vi.doMock('../app/data/persist', () => ({
    loadSnapshot: () => stored,
    saveSnapshot,
  }))
  return import('../app/data/productionSettings')
}

describe('Production settings — Allow subcontracting', () => {
  beforeEach(() => { stored = null; saveSnapshot.mockClear() })

  it('is on by default', async () => {
    const { productionSettings } = await loadSettings()
    expect(productionSettings.subcontracting).toBe(true)
  })

  it('stays on when an older snapshot predates the toggle', async () => {
    stored = [{ partialProduction: false }]
    const { productionSettings } = await loadSettings()
    expect(productionSettings.partialProduction).toBe(false)
    expect(productionSettings.subcontracting).toBe(true)
  })

  it('saves off and reads back off', async () => {
    const first = await loadSettings()
    first.saveProductionSettings({ ...first.productionSettings, subcontracting: false })
    expect(saveSnapshot).toHaveBeenCalledOnce()
    const again = await loadSettings()
    expect(again.productionSettings.subcontracting).toBe(false)
  })
})
