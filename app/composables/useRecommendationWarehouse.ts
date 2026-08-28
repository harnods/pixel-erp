import { warehouses } from "~/data/warehouses";
import { getWarehouseConfig } from "~/data/warehouseConfig";

/**
 * useRecommendationWarehouse — the single warehouse the Cycle counts
 * "Recommendations" tab is scoped to.
 *
 * A cycle count task always belongs to one warehouse, so its recommendation list
 * is single-warehouse too (MVP): a mixed list left the user unable to tell which
 * SKU came from where, and a selection spanning warehouses was rejected at create
 * time anyway. A module-level ref makes the choice a shared singleton, so the tab
 * badge counts exactly the rows the table shows.
 */
const selectedId = ref("");

export function useRecommendationWarehouse() {
  const { activeWarehouse } = useWarehouseContext();

  // Only warehouses that actually produce recommendations are selectable.
  const options = computed(() =>
    warehouses.filter(
      (w) => w.status === "active" && !w.isDefault && getWarehouseConfig(w.id).cycleCountRec,
    ),
  );

  // Falls back to the user's own warehouse (WMS Ops) or the first eligible one, and
  // self-corrects when the chosen warehouse stops being eligible (rec turned off).
  const warehouseId = computed(() => {
    const list = options.value;
    if (list.some((w) => w.id === selectedId.value)) return selectedId.value;
    const scoped = activeWarehouse.value?.id;
    if (scoped && list.some((w) => w.id === scoped)) return scoped;
    return list[0]?.id ?? "";
  });

  function setWarehouse(id: string) {
    selectedId.value = id;
  }

  return { options, warehouseId, setWarehouse };
}
