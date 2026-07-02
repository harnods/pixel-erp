import { getPackingTask, pickedLinesForPacking, packingTasks, type PackingTask } from "./packingTasks";
import { deliveryTasks, type DeliveryTask } from "./deliveryTasks";
import { outgoingOrders, skuLineQty } from "./outgoing";
import { CATALOG } from "./catalog";

/** Enriched packing line for the detail / pack pages. */
export interface PackLineItem {
  key: string;
  productName: string;
  productDesc: string;
  skuCode: string;
  image: string;
  binLocation: string;
  orderQty: number;   // units the customer ordered for this SKU
  pickedQty: number;  // available to pack (what picking delivered)
  packedQty: number;  // matched/packed so far
  unit: string;
}

export function getPackingLineItems(task: PackingTask): PackLineItem[] {
  // Order qty per SKU for this sales order, from the same deterministic breakdown the
  // order was built from (mirrors CreatePackingPage) so Order / Picked / Packed line up.
  const order = outgoingOrders.find((o) => o.id === task.salesOrderId);
  const base = Number(task.salesOrderId.replace(/\D/g, "")) || 0;
  const n = Math.min(order?.skuQty ?? 0, CATALOG.length);
  const orderQtyBySku = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const item = CATALOG[(base * 7 + i * 13) % CATALOG.length]!;
    if (!orderQtyBySku.has(item.sku)) orderQtyBySku.set(item.sku, skuLineQty(base, i));
  }
  return pickedLinesForPacking(task).map((l) => ({
    key: l.key,
    productName: l.product,
    productDesc: l.desc,
    skuCode: l.sku,
    image: l.img,
    binLocation: l.bin,
    orderQty: orderQtyBySku.get(l.sku) ?? l.picked,
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
