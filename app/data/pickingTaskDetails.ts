import {
  getPickingTask, pickingLinesOf, pickingTasks, type PickingTask,
  type PickingBatchPick, type PickingSerialPick,
} from "./pickingTasks";
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
  /** Batch-tracked SKUs only — undefined if the SKU isn't batch-tracked. */
  batchPicks?: PickingBatchPick[];
  /** Serial-tracked SKUs only — undefined if the SKU isn't serial-tracked. */
  serialPicks?: PickingSerialPick[];
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
    batchPicks: task.batchPicks?.[l.key],
    serialPicks: task.serialPicks?.[l.key],
  }));
}

/** Flat list for the jump-to-task switcher. */
export function allPickingTasksFlat(): Array<{ id: string; taskNo: string; salesNos: string }> {
  return pickingTasks.map((t) => ({ id: t.id, taskNo: t.taskNo, salesNos: t.salesNos.join(", ") }));
}

/** Packing tasks created from this picking task. */
export function getPackingForPickingTask(taskId: string): PackingTask[] {
  // Match any packing task this picking list contributed to (an order split across
  // several lists records them all in pickingTaskIds).
  return packingTasks.filter(
    (p) => p.pickingTaskId === taskId || (p.pickingTaskIds?.includes(taskId) ?? false),
  );
}

export { getPickingTask };
