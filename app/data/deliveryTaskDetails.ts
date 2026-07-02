import { getDeliveryTask, deliveryTasks, type DeliveryTask } from "./deliveryTasks";
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

export function getDeliveryLineItems(task: DeliveryTask): ShipLineItem[] {
  const pack = getPackingTask(task.packingTaskId);
  if (!pack) return [];
  return pickedLinesForPacking(pack)
    .map((l) => ({
      key: l.key,
      productName: l.product,
      productDesc: l.desc,
      skuCode: l.sku,
      image: l.img,
      binLocation: binForSku(task.warehouseId, l.sku),
      qty: pack.packedByKey?.[l.key] ?? l.picked,
      unit: l.unit,
    }))
    .filter((x) => x.qty > 0);
}

export function allDeliveryTasksFlat(): Array<{ id: string; taskNo: string; salesNo: string }> {
  return deliveryTasks.map((d) => ({ id: d.id, taskNo: d.taskNo, salesNo: d.salesNo }));
}

export { getDeliveryTask };
