// Explicit vue imports: `selectedId` is created at MODULE scope, which runs
// before any auto-import layer (or a spec's stubs) is in place.
import { ref, computed } from 'vue'
import { warehouses } from '~/data/warehouses'
import { getWarehouseConfig } from '~/data/warehouseConfig'

/**
 * useReplenishmentWarehouse — the warehouse scope the Replenishment worklist is
 * looking at.
 *
 * A module-level singleton, so the page's table and the tab-count badges in
 * `[...slug].vue` read the SAME value and can never disagree about what is on
 * screen. Mirrors `useRecommendationWarehouse` (the Cycle-count Recommendations
 * selector) almost exactly, gated on `replenishmentEnabled` instead of
 * `cycleCountRec`.
 *
 * Unlike that one this DOES offer "All warehouses", because US-025 AC-02 requires
 * the cross-warehouse view. It stays honest by listing rows per SKU-warehouse and
 * never blending them into a total; the bulk draft-PO action separately refuses a
 * selection spanning warehouses, since a PO has one ship-to.
 *
 * The option list is the visible surface of warehouse access control (US-026): a
 * WMS Ops operator scoped to one warehouse simply has one option and no "all".
 */
export const ALL_WAREHOUSES = 'all'

const selectedId = ref<string>(ALL_WAREHOUSES)

export function useReplenishmentWarehouse() {
  const { activeWarehouse, assignedWarehouses } = useWarehouseContext()

  /** Warehouses that actually produce a worklist, intersected with the user's scope. */
  const options = computed(() => {
    const scoped = assignedWarehouses.value
    const scopedIds = scoped.length ? new Set(scoped.map((w) => w.id)) : null
    return warehouses.filter(
      (w) =>
        w.status === 'active'
        && !w.isDefault
        && getWarehouseConfig(w.id).replenishmentEnabled
        && (!scopedIds || scopedIds.has(w.id)),
    )
  })

  /** Only offer "All warehouses" when the user can actually see more than one. */
  const canSelectAll = computed(() => options.value.length > 1)

  /**
   * Self-correcting: falls back to the operator's own warehouse, then to "all",
   * then to the first eligible one — and re-resolves if the chosen warehouse stops
   * being eligible (e.g. an admin turns replenishment off for it).
   */
  const warehouseId = computed(() => {
    const list = options.value
    if (selectedId.value === ALL_WAREHOUSES && canSelectAll.value) return ALL_WAREHOUSES
    if (list.some((w) => w.id === selectedId.value)) return selectedId.value
    const own = activeWarehouse.value?.id
    if (own && list.some((w) => w.id === own)) return own
    if (canSelectAll.value) return ALL_WAREHOUSES
    return list[0]?.id ?? ''
  })

  /** True when the current scope spans more than one warehouse. */
  const isAllWarehouses = computed(() => warehouseId.value === ALL_WAREHOUSES)

  function setWarehouse(id: string) {
    selectedId.value = id
  }

  return { options, canSelectAll, warehouseId, isAllWarehouses, setWarehouse }
}
