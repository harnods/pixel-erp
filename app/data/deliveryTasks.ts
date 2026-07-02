import { reactive } from "vue";
import { picForWarehouse } from "./warehouses";
import { outgoingOrders, isMarketplaceOrder, type OutgoingOrder } from "./outgoing";
import { packingTasks } from "./packingTasks";
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
  /** the completed packing task this was created from */
  packingTaskId: string;
  packingTaskNo: string;
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

// ── Seed: a delivery for SOME completed packing tasks (one per sales order). The
// rest are left without a delivery so "Create shipping" is demonstrable on seed. ──
function seedTasks(): DeliveryTask[] {
  const out: DeliveryTask[] = [];
  let seq = 50090;
  let idx = 0;
  for (const pack of packingTasks.filter((t) => t.status === "completed" && !t.id.startsWith("pack-sh-"))) {
    // ~1/3 of completed packing tasks stay un-shipped (no delivery yet).
    if (idx++ % 3 === 0) continue;
    const order = outgoingOrders.find((o) => o.id === pack.salesOrderId);
    const status = SEED_STATUSES[idx % SEED_STATUSES.length]!;
    const toShipQty = pack.toPackQty;
    // marketplace ⇒ always online shipping; others alternate self / online
    const method: "self" | "online" = isMarketplaceOrder(order) ? "online" : (idx % 2 === 0 ? "self" : "online");
    out.push({
      id: `del-${seq}`,
      taskNo: `Delivery #${seq++}`,
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
      trackingNo: status !== "canceled" && method === "online" ? `SD${String(9000 + seq).padStart(7, "0")}` : undefined,
      proofFile: status === "shipped" ? "pickup-proof.jpg" : undefined,
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
    out.push({
      id: `del-sh-${String(k + 1).padStart(3, "0")}`,
      taskNo: `Delivery #${seq++}`,
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
      trackingNo: `SD${String(9500 + seq).padStart(7, "0")}`,
      proofFile: "pickup-proof.jpg",
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

export function getDeliveryTask(taskId: string): DeliveryTask | undefined {
  return deliveryTasks.find((t) => t.id === taskId);
}

/** Hand the package over to the courier → shipped, records courier/tracking/proof + timestamp. */
export function handoverToCourier(taskId: string, opts?: { courier?: string; trackingNo?: string; proofFile?: string }): void {
  const t = getDeliveryTask(taskId);
  if (!t || t.status !== "ready to ship") return;
  t.status = "shipped";
  t.shippedQty = t.toShipQty;
  t.shippedDate = nowIso();
  if (opts?.courier) t.courier = opts.courier;
  if (opts?.trackingNo) t.trackingNo = opts.trackingNo;
  if (opts?.proofFile) t.proofFile = opts.proofFile;
  persistDelivery();
}

function nowIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Available couriers for the ship form. */
export const DELIVERY_COURIERS = COURIERS;
