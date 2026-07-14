import {
  getPickingTask, pickingLinesOf, pickingTasks, mergeBatchPicks, dedupeSerialPicks, type PickingTask,
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
  /** The ORIGINAL per-batch reservation plan, frozen at task creation — never
   *  affected by later real-pick overwrites of batchPicks above. */
  plannedBatchPicks?: PickingBatchPick[];
  /** Same idea as plannedBatchPicks, for serial-tracked SKUs. */
  plannedSerialPicks?: PickingSerialPick[];
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
    batchPicks: task.batchPicks?.[l.key] ? mergeBatchPicks(task.batchPicks[l.key]) : undefined,
    serialPicks: task.serialPicks?.[l.key] ? dedupeSerialPicks(task.serialPicks[l.key]) : undefined,
    plannedBatchPicks: task.plannedBatchPicks?.[l.key] ? mergeBatchPicks(task.plannedBatchPicks[l.key]) : undefined,
    plannedSerialPicks: task.plannedSerialPicks?.[l.key] ? dedupeSerialPicks(task.plannedSerialPicks[l.key]) : undefined,
  }));
}

/** One SKU's picking row, merged across every order that contributed it — the
 *  picker just needs "take 10 of SKU A", not "5 for order 1, 5 for order 2".
 *  `memberKeys` keeps the underlying per-order PickLineItem keys, in the order
 *  they should be filled (order 1 first, then order 2, ...), so qty entry,
 *  scanning, and batch/serial assignment can still attribute picks back to the
 *  right order for packing. */
export interface PickGroupItem {
  key: string; // = skuCode — unique per merged row
  skuCode: string;
  productName: string;
  productDesc: string;
  image: string;
  binLocation: string;
  unit: string;
  expectedQty: number;
  pickedQty: number;
  memberKeys: string[];
  /** Combined across every member line (merged by batchNo, same rule as a single
   *  line's own repeat picks) — undefined if the SKU isn't batch-tracked. */
  batchPicks?: PickingBatchPick[];
  /** Combined across every member line (deduped by serial) — undefined if the
   *  SKU isn't serial-tracked. */
  serialPicks?: PickingSerialPick[];
  plannedBatchPicks?: PickingBatchPick[];
  plannedSerialPicks?: PickingSerialPick[];
}

export function getPickingGroupedItems(task: PickingTask): PickGroupItem[] {
  const map = new Map<string, PickGroupItem>();
  for (const it of getPickingLineItems(task)) {
    let g = map.get(it.skuCode);
    if (!g) {
      g = {
        key: it.skuCode, skuCode: it.skuCode, productName: it.productName, productDesc: it.productDesc,
        image: it.image, binLocation: it.binLocation, unit: it.unit,
        expectedQty: 0, pickedQty: 0, memberKeys: [],
      };
      map.set(it.skuCode, g);
    }
    g.expectedQty += it.expectedQty;
    g.pickedQty += it.pickedQty;
    g.memberKeys.push(it.key);
    if (it.batchPicks?.length) g.batchPicks = mergeBatchPicks([...(g.batchPicks ?? []), ...it.batchPicks]);
    if (it.serialPicks?.length) g.serialPicks = dedupeSerialPicks([...(g.serialPicks ?? []), ...it.serialPicks]);
    if (it.plannedBatchPicks?.length) g.plannedBatchPicks = mergeBatchPicks([...(g.plannedBatchPicks ?? []), ...it.plannedBatchPicks]);
    if (it.plannedSerialPicks?.length) g.plannedSerialPicks = dedupeSerialPicks([...(g.plannedSerialPicks ?? []), ...it.plannedSerialPicks]);
  }
  return [...map.values()];
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
