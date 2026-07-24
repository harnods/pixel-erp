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
  /** Units of this SKU already shipped by an earlier, independent picking→
   *  packing→shipment cycle for the same order (partially shipped, then picked/
   *  packed/shipped again for the remainder) — 0 for a normal, single-cycle order. */
  shippedElsewhere: number;
}

/** Units of (this delivery's order, sku) already shipped by OTHER (status
 *  "shipped") delivery tasks for the same order, excluding this task itself —
 *  i.e. what a prior, independent cycle already shipped. A delivery task has no
 *  per-SKU shipped figure of its own, so this reads it back off each contributing
 *  packing task's packedByKey (packed = shipped, 1:1, once a delivery ships). */
function shippedElsewhereBySku(task: DeliveryTask): Map<string, number> {
  const result = new Map<string, number>();
  const prefix = `${task.salesOrderId}::`;
  for (const d of deliveryTasks) {
    if (d.salesOrderId !== task.salesOrderId || d.id === task.id || d.status !== "shipped") continue;
    for (const packId of packingTaskIdsForDelivery(d)) {
      const pack = getPackingTask(packId);
      if (!pack) continue;
      for (const [key, qty] of Object.entries(pack.packedByKey ?? {})) {
        if (!qty || !key.startsWith(prefix)) continue;
        const sku = key.slice(prefix.length);
        result.set(sku, (result.get(sku) ?? 0) + qty);
      }
    }
  }
  return result;
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
  const shippedBySku = shippedElsewhereBySku(task);
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
        shippedElsewhere: shippedBySku.get(l.sku) ?? 0,
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
