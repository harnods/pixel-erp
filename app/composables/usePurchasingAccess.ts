/**
 * usePurchasingAccess — may the signed-in user turn a Purchase Request into a
 * Purchase Order?
 *
 * Replenishment only ever raises PURCHASE REQUESTS; which of them become POs is a
 * purchasing-role decision (PRD D11, US-020 VR-02 / AC-03). So "Create purchase
 * order" is a privilege of whoever holds purchase-order creation access, and a
 * stockist who raised the request cannot convert it themselves.
 *
 * Modelled like useLineManagerAccess: a shared, persisted singleton the account menu
 * writes and features read. The WMS Ops scenarios preview a warehouse operator, who
 * never has it; the back-office account (ERP / WMS Standalone) has it unless the
 * menu's "Purchasing access" is turned off to preview a stockist without it.
 */
// Explicit imports (not auto-imported) so the permission rule can be unit-tested alone.
import { ref, computed } from 'vue'
import { useScenario } from '~/composables/useScenario'

const STORAGE_KEY = 'erp-purchasing-access'

/** On by default: the demo account is the back-office buyer. */
const hasPurchasingAccess = ref(true)
let hydrated = false

export function usePurchasingAccess() {
  if (!hydrated && import.meta.client) {
    hydrated = true
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved !== null) hasPurchasingAccess.value = saved === 'true'
  }

  const { activeScenario } = useScenario()
  const isWarehouseOperator = computed(
    () => activeScenario.value === 'WMS Ops' || activeScenario.value === 'WMS Ops 2',
  )

  /** May this user create a purchase order (and so convert a purchase request)? */
  const canCreatePurchaseOrders = computed(() => !isWarehouseOperator.value && hasPurchasingAccess.value)

  function setPurchasingAccess(on: boolean) {
    hasPurchasingAccess.value = on
    if (import.meta.client) localStorage.setItem(STORAGE_KEY, String(on))
  }

  return { hasPurchasingAccess, setPurchasingAccess, isWarehouseOperator, canCreatePurchaseOrders }
}
