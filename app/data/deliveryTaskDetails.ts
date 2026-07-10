import { getDeliveryTask, deliveryTasks, packingTaskIdsForDelivery, type DeliveryTask } from "./deliveryTasks";
import { getPackingTask, pickedLinesForPacking } from "./packingTasks";
import { mergeBatchPicks, dedupeSerialPicks, type PickingBatchPick, type PickingSerialPick } from "./pickingTasks";
import { outgoingOrders } from "./outgoing";
import { orderSkuLines } from "./inventory";
import { binForSku } from "./warehouseDetails";

/** A SKU line being shipped (= what was packed for this order). */
export interface ShipLineItem {
  key: string;
  productName: string;
  productDesc: string;
  skuCode: string;
  image: string;
  binLocation: string;
  orderQty: number; // full order demand for this SKU
  qty: number; // packed = to ship
  unit: string;
  /** Batch-tracked SKUs only — which batch(es) the shipped units came from. */
  batchPicks?: PickingBatchPick[];
  /** Serial-tracked SKUs only — which serial(s) are being shipped. */
  serialPicks?: PickingSerialPick[];
}

/** Combined per-SKU lines across every packing task feeding this delivery — a SKU
 *  partially packed across two tasks (bulk "Create delivery") sums to one line
 *  (batch/serial picks merge the same way, across those same tasks). */
export function getDeliveryLineItems(task: DeliveryTask): ShipLineItem[] {
  const packs = packingTaskIdsForDelivery(task)
    .map((id) => getPackingTask(id))
    .filter((p): p is NonNullable<ReturnType<typeof getPackingTask>> => !!p);
  if (!packs.length) return [];
  const order = outgoingOrders.find((o) => o.id === task.salesOrderId);
  const orderQtyBySku = new Map<string, number>();
  if (order) for (const l of orderSkuLines(order)) orderQtyBySku.set(l.sku, l.qty);
  const bySku = new Map<string, ShipLineItem>();
  const batchesBySku = new Map<string, PickingBatchPick[]>();
  const serialsBySku = new Map<string, PickingSerialPick[]>();
  for (const pack of packs) {
    for (const l of pickedLinesForPacking(pack)) {
      const qty = pack.packedByKey?.[l.key] ?? l.picked;
      if (qty <= 0) continue;
      if (l.batchPicks?.length) batchesBySku.set(l.sku, [...(batchesBySku.get(l.sku) ?? []), ...l.batchPicks]);
      if (l.serialPicks?.length) serialsBySku.set(l.sku, [...(serialsBySku.get(l.sku) ?? []), ...l.serialPicks]);
      const existing = bySku.get(l.sku);
      if (existing) { existing.qty += qty; continue; }
      bySku.set(l.sku, {
        key: l.key,
        productName: l.product,
        productDesc: l.desc,
        skuCode: l.sku,
        image: l.img,
        binLocation: binForSku(task.warehouseId, l.sku),
        orderQty: orderQtyBySku.get(l.sku) ?? qty,
        qty,
        unit: l.unit,
      });
    }
  }
  for (const item of bySku.values()) {
    const batches = batchesBySku.get(item.skuCode);
    if (batches?.length) item.batchPicks = mergeBatchPicks(batches);
    const serials = serialsBySku.get(item.skuCode);
    if (serials?.length) item.serialPicks = dedupeSerialPicks(serials);
  }
  return [...bySku.values()];
}

export function allDeliveryTasksFlat(): Array<{ id: string; taskNo: string; salesNo: string }> {
  return deliveryTasks.map((d) => ({ id: d.id, taskNo: d.taskNo, salesNo: d.salesNo }));
}

export { getDeliveryTask };
