// Explicit vue imports: `selectedId` is created at MODULE scope, which runs
// before any auto-import layer (or a spec's stubs) is in place.
import { ref, computed } from 'vue'
import { warehouses } from '~/data/warehouses'
import { getWarehouseConfig } from '~/data/warehouseConfig'
import { readStore, writeStore } from '~/data/replenishmentStore'

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

/** The scope is remembered per user (US-014 CON-02 "filter state per user"). */
const STORAGE_KEY = 'erp-db:replenishment-warehouse-scope'
const selectedId = ref<string>(readStore<string>(STORAGE_KEY, ALL_WAREHOUSES) || ALL_WAREHOUSES)

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

  /**
   * US-014 EH-01: the remembered warehouse is no longer available (removed,
   * deactivated, or replenishment turned off for it), so the scope was reset. The
   * page says so once in a toast, then stores the corrected scope. `null` = nothing
   * was reset; otherwise the warehouse's name, or '' when it is gone entirely.
   */
  const resetFrom = computed<string | null>(() => {
    const saved = selectedId.value
    if (saved === ALL_WAREHOUSES || !saved) return null
    if (options.value.some((w) => w.id === saved)) return null
    // '' when the warehouse is gone entirely: an internal id is never shown to the user.
    return warehouses.find((w) => w.id === saved)?.name ?? ''
  })

  /** True when the current scope spans more than one warehouse. */
  const isAllWarehouses = computed(() => warehouseId.value === ALL_WAREHOUSES)

  /**
   * Ignores an empty id rather than storing it.
   *
   * `warehouseId` would self-correct anyway, but silently: the stored value and
   * the value on screen would then disagree, and a control that reports a scope
   * the table is not using is worse than one that refuses the input.
   */
  function setWarehouse(id: string) {
    if (!id) return
    selectedId.value = id
    writeStore(STORAGE_KEY, id)
  }

  return { options, canSelectAll, warehouseId, isAllWarehouses, setWarehouse, resetFrom }
}
