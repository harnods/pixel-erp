import { warehouses } from "~/data/warehouses";

/**
 * Warehouse assignment per scenario. A WMS Ops user is scoped to the warehouse(s)
 * they're assigned to:
 *   - WMS Ops   → one warehouse (no switcher needed)
 *   - WMS Ops 2 → two warehouses → a switcher appears next to the header logo
 * Standalone/ERP aren't scoped here (full access), so they get no entry.
 */
const SCENARIO_WAREHOUSES: Record<string, string[]> = {
  // WMS Ops (Ops 1) → Budi Santoso, sole PIC of Jakarta Pusat.
  "WMS Ops": ["wh-001"],
  // WMS Ops 2 → Agus Firmansyah, supervising both Makassar warehouses (same city).
  // Two warehouses → a switcher appears next to the header logo.
  "WMS Ops 2": ["wh-006", "wh-010"],
};

/**
 * Fulfillment flows enabled per warehouse — drives which fulfillment menus show:
 *   "out" → Outbound delivery, "in" → Inbound delivery.
 */
type WarehouseFlow = "out" | "in";
const WAREHOUSE_FLOWS: Record<string, WarehouseFlow[]> = {
  "wh-001": ["out", "in"], // Jakarta Pusat — full fulfillment (in + out)
  "wh-006": ["out", "in"], // Makassar Selatan — full fulfillment (in + out)
  "wh-010": ["out", "in"], // Makassar Utara — full fulfillment (in + out)
};

export interface AssignedWarehouse {
  id: string;
  name: string;
  code: string;
  flows: WarehouseFlow[];
}

// The warehouse the user has switched to (shared singleton).
const activeWarehouseId = ref("");

export function useWarehouseContext() {
  const { activeScenario } = useScenario();

  const assignedWarehouses = computed<AssignedWarehouse[]>(() =>
    (SCENARIO_WAREHOUSES[activeScenario.value] ?? []).map((id) => {
      const w = warehouses.find((wh) => wh.id === id);
      return {
        id,
        name: w?.name ?? id,
        code: w?.code ?? "",
        flows: WAREHOUSE_FLOWS[id] ?? ["out"],
      };
    }),
  );

  // The chosen warehouse if it belongs to the current scenario, otherwise the
  // first assigned one — self-corrects when the scenario changes.
  const activeWarehouse = computed<AssignedWarehouse | null>(() => {
    const list = assignedWarehouses.value;
    return list.find((w) => w.id === activeWarehouseId.value) ?? list[0] ?? null;
  });

  // Show a warehouse label in the header whenever the user is scoped to one (Ops).
  const hasWarehouseContext = computed(() => assignedWarehouses.value.length >= 1);
  // It's switchable only when assigned more than one warehouse (Ops 2).
  const hasWarehouseSwitcher = computed(() => assignedWarehouses.value.length > 1);

  function setActiveWarehouse(id: string) {
    activeWarehouseId.value = id;
  }

  return {
    assignedWarehouses,
    activeWarehouse,
    hasWarehouseContext,
    hasWarehouseSwitcher,
    setActiveWarehouse,
  };
}
