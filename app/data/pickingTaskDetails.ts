import { getPickingTask, pickingLinesOf, pickingTasks, type PickingTask } from "./pickingTasks";
import { packingTasks, type PackingTask } from "./packingTasks";
import { binForSku } from "./warehouseDetails";

/** Enriched picking line for the detail / pick pages. */
export interface PickLineItem {
  key: string;
  orderId: string;
  salesNo: string;
  productName: string;
  productDesc: string;
  skuCode: string;
  image: string;
  binLocation: string;
  expectedQty: number; // to-pick (planned)
  pickedQty: number;   // picked so far
  unit: string;
}

export function getPickingLineItems(task: PickingTask): PickLineItem[] {
  return pickingLinesOf(task).map((l) => ({
    key: l.key,
    orderId: l.orderId,
    salesNo: l.salesNo,
    productName: l.product,
    productDesc: l.desc,
    skuCode: l.sku,
    image: l.img,
    binLocation: binForSku(task.warehouseId, l.sku),
    expectedQty: l.qty,
    pickedQty: task.pickedByKey?.[l.key] ?? 0,
    unit: l.unit,
  }));
}

/** Flat list for the jump-to-task switcher. */
export function allPickingTasksFlat(): Array<{ id: string; taskNo: string; salesNos: string }> {
  return pickingTasks.map((t) => ({ id: t.id, taskNo: t.taskNo, salesNos: t.salesNos.join(", ") }));
}

/** Packing tasks created from this picking task. */
export function getPackingForPickingTask(taskId: string): PackingTask[] {
  return packingTasks.filter((p) => p.pickingTaskId === taskId);
}

export { getPickingTask };
