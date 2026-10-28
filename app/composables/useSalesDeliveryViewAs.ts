/**
 * useSalesDeliveryViewAs — prototype-only "View as" for the sales delivery screens.
 * Not a Jurnal feature: there is no real sign-in, so this picks who is acting, the
 * way useProjectViewAs does for Project accounting.
 *
 * It exists for one rule in the percentage-based delivery PRD (R-16): releasing a
 * line's Percentage lock is permission-gated. The sales admin who enters deliveries
 * cannot release a lock; the finance manager, who owns the revenue it posts, can.
 */
import { ref, computed } from 'vue'

export type SalesDeliveryViewAs = 'admin' | 'finance'

export interface SalesDeliveryUser { name: string; role: string; canReleaseInputBasis: boolean }

export const SALES_DELIVERY_VIEW_AS_USERS: Record<SalesDeliveryViewAs, SalesDeliveryUser> = {
  admin: { name: 'Dewi Anggraini', role: 'Sales admin', canReleaseInputBasis: false },
  finance: { name: 'Rizal Candra', role: 'Finance manager', canReleaseInputBasis: true },
}

const STORAGE_KEY = 'erp-sales-delivery-view-as'
const viewAs = ref<SalesDeliveryViewAs>('admin')
let hydrated = false

export function useSalesDeliveryViewAs() {
  if (!hydrated && import.meta.client) {
    const saved = localStorage.getItem(STORAGE_KEY) as SalesDeliveryViewAs | null
    if (saved === 'admin' || saved === 'finance') viewAs.value = saved
    hydrated = true
  }
  function setViewAs(next: SalesDeliveryViewAs) {
    viewAs.value = next
    if (import.meta.client) localStorage.setItem(STORAGE_KEY, next)
  }
  const currentUser = computed<SalesDeliveryUser>(() => SALES_DELIVERY_VIEW_AS_USERS[viewAs.value])
  return { viewAs, setViewAs, currentUser }
}
