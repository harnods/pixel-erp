// @vitest-environment happy-dom
/**
 * PRD US-020 AC-03 — converting a replenishment Purchase Request into a Purchase Order
 * is a purchasing-role privilege. Replenishment only raises PRs (D11); a stockist who
 * raised one cannot convert it themselves.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { usePurchasingAccess } from '~/composables/usePurchasingAccess'
import { useScenario } from '~/composables/useScenario'

describe('who may create a purchase order', () => {
  beforeEach(() => {
    useScenario().setScenario('ERP')
    usePurchasingAccess().setPurchasingAccess(true)
  })

  it('the back-office account can (ERP and WMS Standalone)', () => {
    expect(usePurchasingAccess().canCreatePurchaseOrders.value).toBe(true)
    useScenario().setScenario('WMS Standalone')
    expect(usePurchasingAccess().canCreatePurchaseOrders.value).toBe(true)
  })

  it('a stockist without purchasing access cannot', () => {
    const { setPurchasingAccess, canCreatePurchaseOrders } = usePurchasingAccess()
    setPurchasingAccess(false)
    expect(canCreatePurchaseOrders.value).toBe(false)
    setPurchasingAccess(true)
    expect(canCreatePurchaseOrders.value).toBe(true)
  })

  it('a warehouse operator never can, whatever the toggle says', () => {
    const { canCreatePurchaseOrders, setPurchasingAccess } = usePurchasingAccess()
    useScenario().setScenario('WMS Ops')
    expect(canCreatePurchaseOrders.value).toBe(false)
    setPurchasingAccess(true)
    expect(canCreatePurchaseOrders.value).toBe(false)
    useScenario().setScenario('WMS Ops 2')
    expect(canCreatePurchaseOrders.value).toBe(false)
  })
})
