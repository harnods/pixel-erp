import { getDeliveryTask, deliveryTasks, packingTaskIdsForDelivery, type DeliveryTask } from "./deliveryTasks";
import { getPackingTask, pickedLinesForPacking } from "./packingTasks";
import { binForSku } from "./warehouseDetails";

/** A SKU line being shipped (= what was packed for this order). */
export interface ShipLineItem {
  key: string;
  productName: string;
  productDesc: string;
  skuCode: string;
  image: string;
  binLocation: string;
  qty: number; // packed = to ship
  unit: string;
}

/** Combined per-SKU lines across every packing task feeding this delivery — a SKU
 *  partially packed across two tasks (bulk "Create delivery") sums to one line. */
export function getDeliveryLineItems(task: DeliveryTask): ShipLineItem[] {
  const packs = packingTaskIdsForDelivery(task)
    .map((id) => getPackingTask(id))
    .filter((p): p is NonNullable<ReturnType<typeof getPackingTask>> => !!p);
  if (!packs.length) return [];
  const bySku = new Map<string, ShipLineItem>();
  for (const pack of packs) {
    for (const l of pickedLinesForPacking(pack)) {
      const qty = pack.packedByKey?.[l.key] ?? l.picked;
      if (qty <= 0) continue;
      const existing = bySku.get(l.sku);
      if (existing) { existing.qty += qty; continue; }
      bySku.set(l.sku, {
        key: l.key,
        productName: l.product,
        productDesc: l.desc,
        skuCode: l.sku,
        image: l.img,
        binLocation: binForSku(task.warehouseId, l.sku),
        qty,
        unit: l.unit,
      });
    }
  }
  return [...bySku.values()];
}

export function allDeliveryTasksFlat(): Array<{ id: string; taskNo: string; salesNo: string }> {
  return deliveryTasks.map((d) => ({ id: d.id, taskNo: d.taskNo, salesNo: d.salesNo }));
}

export { getDeliveryTask };
