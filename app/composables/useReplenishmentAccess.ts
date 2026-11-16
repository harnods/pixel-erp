/**
 * useReplenishmentAccess — may the signed-in user CHANGE replenishment settings?
 *
 * Changing them (a product's reorder point, safety days, tracking or preferred vendor,
 * the category defaults, a bulk import) moves what every warehouse is told to order, so it
 * is an admin / stockist privilege. Everyone else gets a VIEW-ONLY worklist: they see the
 * numbers and why, but the actions that change them are hidden, not disabled (the same
 * decision as the purchasing gate).
 *
 * Modelled like usePurchasingAccess: a shared, persisted singleton the account menu
 * writes and features read. Only the ERP back-office scenario can manage replenishment
 * (the settings page has always said so); there it is on unless the menu's
 * "Replenishment access" is switched off to preview a view-only user.
 */
// Explicit imports (not auto-imported) so the permission rule can be unit-tested alone.
import { ref, computed } from 'vue'
import { useScenario } from '~/composables/useScenario'

const STORAGE_KEY = 'erp-replenishment-access'

/** On by default: the demo account is the back-office admin. */
const hasReplenishmentAccess = ref(true)
let hydrated = false

export function useReplenishmentAccess() {
  if (!hydrated && import.meta.client) {
    hydrated = true
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved !== null) hasReplenishmentAccess.value = saved === 'true'
  }

  const { activeScenario } = useScenario()

  /** May this user change replenishment settings? */
  const canManageReplenishment = computed(() => activeScenario.value === 'ERP' && hasReplenishmentAccess.value)

  function setReplenishmentAccess(on: boolean) {
    hasReplenishmentAccess.value = on
    if (import.meta.client) localStorage.setItem(STORAGE_KEY, String(on))
  }

  return { hasReplenishmentAccess, setReplenishmentAccess, canManageReplenishment }
}
