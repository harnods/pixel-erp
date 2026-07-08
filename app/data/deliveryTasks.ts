import { reactive } from "vue";
import { picForWarehouse } from "./warehouses";
import { outgoingOrders, isMarketplaceOrder, type OutgoingOrder } from "./outgoing";
import { packingTasks, pickedLinesForPacking, type PackingTask } from "./packingTasks";
import { loadSnapshot, saveSnapshot } from "./persist";

/**
 * A delivery — created once a packing task is COMPLETED. Like packing, delivery is
 * PER SALES ORDER: each packed order ships as its own delivery. A delivery is open
 * until it's dispatched ("shipped"); it can also be canceled.
 */
export interface DeliveryTask {
  id: string;
  taskNo: string;
  /** the single sales order this delivery is for (delivery is per sales order) */
  salesOrderId: string;
  salesNo: string;
  /** the completed packing task this was created from (primary/first when several) */
  packingTaskId: string;
  packingTaskNo: string;
  /** every completed packing task this delivery covers — set when a delivery is
   *  created from more than one packing task for the same order (bulk "Create
   *  delivery" selecting several partial packing tasks). Absent = just the one
   *  above. */
  packingTaskIds?: string[];
  packingTaskNos?: string[];
  warehouseId: string;
  warehouseName: string;
  assignee: string;
  /** distinct SKUs to ship for this order */
  skuQty: number;
  /** total units originally ordered (sales order qty) */
  orderQty: number;
  /** units to ship = what was packed (≤ orderQty) */
  toShipQty: number;
  /** units actually shipped (0 until handed over, then = toShipQty) */
  shippedQty: number;
  /** ready to ship = created & packed, waiting to leave; shipped = handed over */
  status: "ready to ship" | "shipped" | "canceled";
  /** how it leaves: self delivery (own driver) or online shipping (3rd-party courier) */
  deliveryMethod?: "self" | "online";
  /** ISO date the goods were handed to the courier (shipped only) */
  shippedDate?: string;
  /** carrier handling the shipment (set at create shipping) */
  courier?: string;
  /** tracking / waybill number (set at create shipping) */
  trackingNo?: string;
  /** proof-of-pickup file name (uploaded at handover) */
  proofFile?: string;
  /** the shipment batch this delivery went out under (bulk "Handover to courier"
   *  can cover several deliveries from the same warehouse at once). */
  shipmentNo?: string;
}

const COURIERS = ["JNE", "SiCepat", "J&T Express", "AnterAja", "Internal fleet"];

// A Desty marketplace channel never hands over to the seller's internal fleet.
const MARKETPLACE_COURIERS = COURIERS.filter((c) => c !== "Internal fleet");
function seedNum(id: string): number { return Number(id.replace(/\D/g, "")) || 0; }

/**
 * Courier + tracking no. a Desty marketplace channel pre-assigns to an order — these
 * arrive with the sales order (shown on its detail page) before shipping is processed.
 * Deterministic from the order id so the order detail page and the shipping handover
 * always show the same values. Returns undefined for non-marketplace orders.
 */
export function marketplaceShipping(
  order: OutgoingOrder | undefined | null,
): { courier: string; trackingNo: string } | undefined {
  if (!isMarketplaceOrder(order) || !order) return undefined;
  const s = seedNum(order.id);
  const courier = MARKETPLACE_COURIERS[s % MARKETPLACE_COURIERS.length]!;
  const digits = String(1_000_000_000 + ((s * 2654435761) % 9_000_000_000));
  return { courier, trackingNo: `TRK${digits}` };
}

// Stage status assigned to a seed task — mostly Open, some Shipped, the occasional
// Canceled, so all states are demonstrable (deterministic).
const SEED_STATUSES: DeliveryTask["status"][] = [
  "ready to ship", "shipped", "ready to ship", "shipped", "canceled", "ready to ship",
];

// ── Seed: a delivery for every completed packing task (one per sales order) —
// finishing packing always creates its delivery, so seed data mirrors that. ──
function seedTasks(): DeliveryTask[] {
  const out: DeliveryTask[] = [];
  let seq = 50090;
  let idx = 0;
  for (const pack of packingTasks.filter((t) => t.status === "completed" && !t.id.startsWith("pack-sh-"))) {
    idx++;
    const order = outgoingOrders.find((o) => o.id === pack.salesOrderId);
    const status = SEED_STATUSES[idx % SEED_STATUSES.length]!;
    const toShipQty = pack.toPackQty;
    // marketplace ⇒ always online shipping; others alternate self / online
    const method: "self" | "online" = isMarketplaceOrder(order) ? "online" : (idx % 2 === 0 ? "self" : "online");
    const thisSeq = seq++;
    out.push({
      id: `del-${thisSeq}`,
      taskNo: `Delivery #${thisSeq}`,
      salesOrderId: pack.salesOrderId,
      salesNo: pack.salesNo,
      packingTaskId: pack.id,
      packingTaskNo: pack.taskNo,
      warehouseId: pack.warehouseId,
      warehouseName: pack.warehouseName,
      assignee: picForWarehouse(pack.warehouseId, idx),
      skuQty: pack.skuQty,
      orderQty: order?.orderQty ?? toShipQty,
      toShipQty,
      shippedQty: status === "shipped" ? toShipQty : 0,
      status,
      deliveryMethod: method,
      shippedDate: status === "shipped" ? new Date().toISOString() : undefined,
      // online shipping → courier + tracking; self delivery → optional (often blank)
      courier: status !== "canceled" && method === "online" ? COURIERS[idx % 4] : undefined,
      trackingNo: status !== "canceled" && method === "online" ? `SD${String(9000 + thisSeq).padStart(7, "0")}` : undefined,
      proofFile: status === "shipped" ? "pickup-proof.jpg" : undefined,
      // seed shipped deliveries as their own single-delivery shipment batch, so the
      // Shipped tab (grouped by shipment) has demo content out of the box.
      shipmentNo: status === "shipped" ? `Shipment #${60000 + thisSeq}` : undefined,
    });
    void order;
  }
  out.push(...seedShippedDeliveries(seq));
  return out;
}

// ── Seed: a SHIPPED delivery per pre-shipped order's completed packing — ships
// everything that was packed (full → order completed, short → partially shipped). ──
function seedShippedDeliveries(startSeq: number): DeliveryTask[] {
  const out: DeliveryTask[] = [];
  let seq = startSeq;
  const shippedPacks = packingTasks.filter((t) => t.id.startsWith("pack-sh-"));
  shippedPacks.forEach((pack, k) => {
    const order = outgoingOrders.find((o) => o.id === pack.salesOrderId);
    const toShipQty = pack.toPackQty;
    const thisSeq = seq++;
    out.push({
      id: `del-sh-${String(k + 1).padStart(3, "0")}`,
      taskNo: `Delivery #${thisSeq}`,
      salesOrderId: pack.salesOrderId,
      salesNo: pack.salesNo,
      packingTaskId: pack.id,
      packingTaskNo: pack.taskNo,
      warehouseId: pack.warehouseId,
      warehouseName: pack.warehouseName,
      assignee: picForWarehouse(pack.warehouseId, k),
      skuQty: pack.skuQty,
      orderQty: order?.orderQty ?? toShipQty,
      toShipQty,
      shippedQty: toShipQty,
      status: "shipped",
      shippedDate: new Date().toISOString(),
      courier: COURIERS[k % COURIERS.length],
      trackingNo: `SD${String(9500 + thisSeq).padStart(7, "0")}`,
      proofFile: "pickup-proof.jpg",
      shipmentNo: `Shipment #${60000 + thisSeq}`,
    });
  });
  return out;
}

const snapshot = loadSnapshot<DeliveryTask>("delivery-v2");
export const deliveryTasks = reactive<DeliveryTask[]>(snapshot ?? seedTasks());

function persistDelivery(): void {
  saveSnapshot("delivery-v2", deliveryTasks);
}

let nextSeq = 50090 + deliveryTasks.length;
function freshSeq(): number {
  const used = deliveryTasks.map((t) => Number(t.taskNo.replace(/\D/g, ""))).filter(Number.isFinite);
  nextSeq = Math.max(nextSeq, ...used, 50089) + 1;
  return nextSeq;
}

/**
 * Create a delivery for a single sales order (from a completed packing task).
 * Newly created → "open".
 */
export function addDeliveryTask(opts: {
  salesOrderId: string;
  salesNo: string;
  packingTaskId: string;
  packingTaskNo: string;
  packingTaskIds?: string[];
  packingTaskNos?: string[];
  warehouseId: string;
  warehouseName: string;
  assignee: string;
  deliveryMethod?: "self" | "online";
  courier?: string;
  trackingNo?: string;
  skuQty?: number;
  toShipQty?: number;
}): DeliveryTask {
  const seq = freshSeq();
  const order = outgoingOrders.find((o) => o.id === opts.salesOrderId);
  const task: DeliveryTask = {
    id: `del-new-${seq}`,
    taskNo: `Delivery #${seq}`,
    salesOrderId: opts.salesOrderId,
    salesNo: opts.salesNo,
    packingTaskId: opts.packingTaskId,
    packingTaskNo: opts.packingTaskNo,
    ...(opts.packingTaskIds && opts.packingTaskIds.length > 1 ? { packingTaskIds: opts.packingTaskIds, packingTaskNos: opts.packingTaskNos } : {}),
    warehouseId: opts.warehouseId,
    warehouseName: opts.warehouseName,
    assignee: opts.assignee,
    skuQty: opts.skuQty ?? order?.skuQty ?? 0,
    orderQty: order?.orderQty ?? opts.toShipQty ?? 0,
    toShipQty: opts.toShipQty ?? order?.orderQty ?? 0,
    shippedQty: 0, // created → waiting to leave
    status: "ready to ship",
    deliveryMethod: opts.deliveryMethod ?? "online",
    courier: opts.courier,
    trackingNo: opts.trackingNo,
  };
  deliveryTasks.unshift(task);
  persistDelivery();
  return task;
}

/**
 * Create ONE delivery from several completed packing tasks that all belong to the
 * SAME sales order (bulk "Create delivery" selecting more than one partial packing
 * task) — a delivery is per order, so these must merge into a single task instead
 * of each spawning its own (which would silently drop every packing task after the
 * first, since an order can only have one live delivery).
 */
export function addDeliveryTaskFromPackingTasks(
  tasks: PackingTask[],
  opts: { assignee: string; deliveryMethod?: "self" | "online"; courier?: string; trackingNo?: string },
): DeliveryTask {
  const primary = tasks[0]!;
  // Union of SKU lines across every contributing packing task, summed — a SKU split
  // across two partial packing tasks (e.g. 1 + 3 of an order qty of 4) counts once,
  // for its combined qty.
  const qtyBySku = new Map<string, number>();
  for (const t of tasks) {
    for (const l of pickedLinesForPacking(t)) {
      const qty = t.packedByKey?.[l.key] ?? l.picked;
      if (qty > 0) qtyBySku.set(l.sku, (qtyBySku.get(l.sku) ?? 0) + qty);
    }
  }
  const toShipQty = [...qtyBySku.values()].reduce((a, q) => a + q, 0);
  return addDeliveryTask({
    salesOrderId: primary.salesOrderId,
    salesNo: primary.salesNo,
    packingTaskId: primary.id,
    packingTaskNo: primary.taskNo,
    packingTaskIds: tasks.map((t) => t.id),
    packingTaskNos: tasks.map((t) => t.taskNo),
    warehouseId: primary.warehouseId,
    warehouseName: primary.warehouseName,
    assignee: opts.assignee,
    deliveryMethod: opts.deliveryMethod,
    courier: opts.courier,
    trackingNo: opts.trackingNo,
    skuQty: qtyBySku.size,
    toShipQty,
  });
}

/** Every packing task feeding a delivery (plural when merged from a bulk create). */
export function packingTaskIdsForDelivery(task: DeliveryTask): string[] {
  return task.packingTaskIds?.length ? task.packingTaskIds : [task.packingTaskId];
}

/** Deliveries scoped to warehouses (all when none given). */
export function deliveryTasksFor(warehouseIds?: string[]): DeliveryTask[] {
  return warehouseIds?.length
    ? deliveryTasks.filter((t) => warehouseIds.includes(t.warehouseId))
    : deliveryTasks;
}

/** Badge count for the Delivery stage = deliveries not yet shipped/canceled (scoped). */
export function deliveryOpenCount(warehouseIds?: string[]): number {
  return deliveryTasksFor(warehouseIds).filter(
    (t) => t.status !== "shipped" && t.status !== "canceled",
  ).length;
}

/** Delivery(ies) for a given outbound order. */
export function getDeliveryForOrder(orderId: string): DeliveryTask[] {
  return deliveryTasks.filter((t) => t.salesOrderId === orderId);
}

/** True if an order already has a live (non-canceled) delivery — a canceled one
 *  doesn't block, so the order can be re-delivered. Used to prevent creating a
 *  second delivery for an order that is already being delivered/shipped. */
export function orderHasDelivery(orderId: string): boolean {
  return deliveryTasks.some(
    (t) => t.salesOrderId === orderId && t.status !== "canceled",
  );
}

export function getDeliveryTask(taskId: string): DeliveryTask | undefined {
  return deliveryTasks.find((t) => t.id === taskId);
}

let nextShipmentSeq = 70000;
function freshShipmentSeq(): number {
  const used = deliveryTasks
    .map((t) => Number((t.shipmentNo ?? "").replace(/\D/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  nextShipmentSeq = Math.max(nextShipmentSeq, ...used, 69999) + 1;
  return nextShipmentSeq;
}

/**
 * Hand several ready-to-ship deliveries (same warehouse) over to the courier in one
 * batch — each keeps/gets its own courier + tracking no. (marketplace orders arrive
 * with theirs fixed; non-marketplace ones take whatever the admin entered on the
 * handover page), and all share one shipment doc number, date, and assignee.
 */
export function handoverToCourierBulk(
  taskIds: string[],
  opts: {
    assignee: string;
    transactionDate: string;
    courierByTaskId?: Record<string, string>;
    trackingNoByTaskId?: Record<string, string>;
  },
): { shipmentNo: string; shipmentSeq: string; shippedCount: number } {
  const seq = freshShipmentSeq();
  const shipmentNo = `Shipment #${seq}`;
  let shippedCount = 0;
  for (const id of taskIds) {
    const t = getDeliveryTask(id);
    if (!t || t.status !== "ready to ship") continue;
    t.status = "shipped";
    t.shippedQty = t.toShipQty;
    t.shippedDate = opts.transactionDate;
    t.assignee = opts.assignee;
    t.shipmentNo = shipmentNo;
    const courier = opts.courierByTaskId?.[id];
    const trackingNo = opts.trackingNoByTaskId?.[id];
    if (courier) t.courier = courier;
    if (trackingNo) t.trackingNo = trackingNo;
    shippedCount++;
  }
  persistDelivery();
  return { shipmentNo, shipmentSeq: String(seq), shippedCount };
}

/** Every delivery shipped together under one shipment batch, oldest call wins the
 *  summary fields (assignee/date/warehouse are the same across the batch). */
export interface ShipmentSummary {
  shipmentSeq: string;
  shipmentNo: string;
  assignee: string;
  transactionDate: string;
  warehouseId: string;
  warehouseName: string;
  deliveries: DeliveryTask[];
}
export function getShipment(shipmentSeq: string): ShipmentSummary | undefined {
  const deliveries = deliveryTasks.filter((t) => t.shipmentNo?.replace(/\D/g, "") === shipmentSeq);
  const first = deliveries[0];
  if (!first) return undefined;
  return {
    shipmentSeq,
    shipmentNo: first.shipmentNo!,
    assignee: first.assignee,
    transactionDate: first.shippedDate ?? "",
    warehouseId: first.warehouseId,
    warehouseName: first.warehouseName,
    deliveries,
  };
}

/** Every shipment batch (one row per shipment no.), scoped to warehouses when
 *  given — for the "Shipped" tab, which lists shipments rather than deliveries. */
export function listShipments(warehouseIds?: string[]): ShipmentSummary[] {
  const byNo = new Map<string, DeliveryTask[]>();
  for (const t of deliveryTasks) {
    if (!t.shipmentNo) continue;
    if (warehouseIds?.length && !warehouseIds.includes(t.warehouseId)) continue;
    if (!byNo.has(t.shipmentNo)) byNo.set(t.shipmentNo, []);
    byNo.get(t.shipmentNo)!.push(t);
  }
  return [...byNo.entries()].map(([shipmentNo, deliveries]) => {
    const first = deliveries[0]!;
    return {
      shipmentSeq: shipmentNo.replace(/\D/g, ""),
      shipmentNo,
      assignee: first.assignee,
      transactionDate: first.shippedDate ?? "",
      warehouseId: first.warehouseId,
      warehouseName: first.warehouseName,
      deliveries,
    };
  });
}

/** Available couriers for the ship form. */
export const DELIVERY_COURIERS = COURIERS;
