/**
 * Barcode scan threshold — a per-warehouse rule (already had its data model +
 * Configure warehouse settings UI before this feature; this is the actual
 * enforcement): a SKU line's qty AT OR BELOW scanThresholdValue must be reached
 * by scanning one unit at a time — manual qty entry is disabled for it. Above
 * the threshold, manual entry is unrestricted. Off entirely when the toggle is off.
 */
import { describe, it, expect } from 'vitest'
import { scanRequiredForQty, type WarehouseConfig } from '~/data/warehouseConfig'

function config(overrides: Partial<WarehouseConfig> = {}): WarehouseConfig {
  return {
    pickingEnabled: true, putAwayEnabled: true, allowPartialPicking: true,
    requireSourceLabel: true, preventDuplicateLabel: false, locationPriority: [],
    scanThreshold: true, scanThresholdValue: 50,
    cycleCountRec: false, cycleCountAutoTask: false,
    cycleCountRuleNeg: true, cycleCountRuleVar: true, cycleCountRuleMin: true,
    cycleCountRuleOrder: ['neg', 'var', 'min'],
    ...overrides,
  }
}

describe('scanRequiredForQty', () => {
  it('requires scanning when qty is below the threshold', () => {
    expect(scanRequiredForQty(config(), 5)).toBe(true)
  })

  it('requires scanning when qty is exactly AT the threshold (inclusive boundary)', () => {
    expect(scanRequiredForQty(config(), 50)).toBe(true)
  })

  it('does not require scanning when qty is above the threshold', () => {
    expect(scanRequiredForQty(config(), 51)).toBe(false)
  })

  it('never requires scanning when the toggle itself is off, regardless of qty', () => {
    expect(scanRequiredForQty(config({ scanThreshold: false }), 1)).toBe(false)
    expect(scanRequiredForQty(config({ scanThreshold: false }), 100)).toBe(false)
  })

  it('respects a custom threshold value', () => {
    const c = config({ scanThresholdValue: 10 })
    expect(scanRequiredForQty(c, 10)).toBe(true)
    expect(scanRequiredForQty(c, 11)).toBe(false)
  })
})
