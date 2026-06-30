import { getPackingTask, pickedLinesForPacking, packingTasks, type PackingTask } from "./packingTasks";
import { deliveryTasks, type DeliveryTask } from "./deliveryTasks";

/** Enriched packing line for the detail / pack pages. */
export interface PackLineItem {
  key: string;
  productName: string;
  productDesc: string;
  skuCode: string;
  image: string;
  binLocation: string;
  pickedQty: number;  // available to pack (what picking delivered)
  packedQty: number;  // matched/packed so far
  unit: string;
}

export function getPackingLineItems(task: PackingTask): PackLineItem[] {
  return pickedLinesForPacking(task).map((l) => ({
    key: l.key,
    productName: l.product,
    productDesc: l.desc,
    skuCode: l.sku,
    image: l.img,
    binLocation: l.bin,
    pickedQty: l.picked,
    packedQty: task.packedByKey?.[l.key] ?? 0,
    unit: l.unit,
  }));
}

/** Flat list for the jump-to-task switcher. */
export function allPackingTasksFlat(): Array<{ id: string; taskNo: string; salesNo: string }> {
  return packingTasks.map((t) => ({ id: t.id, taskNo: t.taskNo, salesNo: t.salesNo }));
}

/** Delivery(ies) created from this packing task. */
export function getDeliveryForPackingTask(taskId: string): DeliveryTask[] {
  return deliveryTasks.filter((d) => d.packingTaskId === taskId);
}

export { getPackingTask };
