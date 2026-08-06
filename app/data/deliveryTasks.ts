import { reactive } from "vue";
import { operatorForWarehouse } from "./warehouseTeam";
import { outgoingOrders, isMarketplaceOrder, addOutgoing, type OutgoingOrder } from "./outgoing";
import { packingTasks, pickedLinesForPacking, getPackingTask, addPackingTask, startPacking, endPacking, type PackingTask } from "./packingTasks";
import { addPickingTask, startPicking, endPicking } from "./pickingTasks";
import { loadSnapshot, saveSnapshot } from "./persist";
import { applyStockInOut, consumeReservation } from "./warehouseDetails";
import { couriers } from "./couriers";
import { sameCode, includesCode } from "~/utils/scan";

/**
 * A delivery — created once a packing task is COMPLETED. Like packing, delivery is
 * PER SALES ORDER: each packed order ships as its own delivery. Lifecycle:
 *   - ready to ship: packed, waiting for handover.
 *   - out for delivery: handed to the courier (shipment doc "open"), but NOT yet
 *     confirmed received — the goods are still the warehouse's responsibility, on-hand
 *     is untouched, and the order can STILL be cancelled (e.g. the courier was closed
 *     and the assignee brought the parcel back).
 *   - shipped: the shipment doc was COMPLETED (recipient signed / proof filed) — the
 *     stock has truly left: on-hand is deducted, the reservation consumed. Terminal.
 *   - canceled.
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
  /** ready to ship = packed, waiting; out for delivery = handed to courier, not yet
   *  confirmed (reversible); shipped = shipment completed / received (posted, terminal) */
  status: "ready to ship" | "out for delivery" | "shipped" | "canceled";
  /** cancel audit (D2 cascade) — set when the parent outbound is cancelled */
  canceledDate?: string;
  canceledReason?: string;
  /** Who canceled it. */
  canceledBy?: string;
  /** how it leaves: self delivery (own driver) or online shipping (3rd-party courier) */
  deliveryMethod?: "self" | "online";
  /** ISO date the goods were handed to the courier (shipped only) */
  shippedDate?: string;
  /** carrier handling the shipment (set at create shipping) */
  courier?: string;
  /** tracking / waybill number (set at create shipping) */
  trackingNo?: string;
  /** signed proof-of-delivery file name (uploaded when the shipment is completed) */
  proofFile?: string;
  /** the shipment batch this delivery went out under (bulk "Handover to courier"
   *  can cover several deliveries from the same warehouse at once). */
  shipmentNo?: string;
  /** the SHIPMENT doc's own status (shown on the "Shipped" tab, independent of
   *  this delivery's own status above) — "open" once handed to the courier, not
   *  yet confirmed; "completed" once the courier/customer has signed for it
   *  (proof uploaded). Same value across every delivery sharing one shipmentNo. */
  shipmentStatus?: "open" | "completed";
  /** date the goods were confirmed received (ISO), set once completed */
  receivedDate?: string;
  /** name of the person who received/signed for the goods, set once completed */
  receivedBy?: string;
  /** free-text note captured when completing the shipment */
  receivedNote?: string;
}

// Seed couriers for generated deliveries — drawn from the real courier master
// (couriers.ts) so every shipment references a service that actually exists in
// the picker. Self-delivery (own driver) is method-gated separately and carries
// no courier, so this list is 3rd-party services only.
const COURIERS = ["JNE REG", "SiCepat BEST", "AnterAja REG", "JNT Express", "Ninja Xpress"];
const RECEIVER_NAMES = ["Andi Wijaya", "Siti Nurhaliza", "Budi Santoso", "Rina Marlina"];

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

// Shipment-doc status mix for seeded shipped deliveries — mostly Open (dispatched,
// awaiting courier confirmation), some Completed (signed proof already on file).
const SEED_SHIPMENT_STATUSES: NonNullable<DeliveryTask["shipmentStatus"]>[] = ["open", "completed"];

// ── Seed: a delivery for every completed packing task (one per sales order) —
// finishing packing always creates its delivery, so seed data mirrors that. ──
function seedTasks(): DeliveryTask[] {
  const out: DeliveryTask[] = [];
  let seq = 50090;
  let idx = 0;
  for (const pack of packingTasks.filter((t) => t.status === "completed" && !t.id.startsWith("pack-sh-"))) {
    idx++;
    const order = outgoingOrders.find((o) => o.id === pack.salesOrderId);
    // SEED_STATUSES' "shipped" means "in a shipment"; split it by the shipment doc's
    // own status: an OPEN shipment is still "out for delivery" (reversible, not posted),
    // a COMPLETED one is truly "shipped".
    const baseStatus = SEED_STATUSES[idx % SEED_STATUSES.length]!;
    const shipmentStatus = baseStatus === "shipped" ? SEED_SHIPMENT_STATUSES[idx % SEED_SHIPMENT_STATUSES.length]! : undefined;
    const inShipment = baseStatus === "shipped";
    const status: DeliveryTask["status"] = inShipment
      ? (shipmentStatus === "completed" ? "shipped" : "out for delivery")
      : baseStatus;
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
      assignee: operatorForWarehouse(pack.warehouseId, idx),
      skuQty: pack.skuQty,
      orderQty: order?.orderQty ?? toShipQty,
      toShipQty,
      // Posted (on-hand deducted) only once truly shipped; out-for-delivery isn't yet.
      shippedQty: status === "shipped" ? toShipQty : 0,
      status,
      deliveryMethod: method,
      // both out-for-delivery and shipped were dispatched, so both carry a date.
      shippedDate: inShipment ? new Date().toISOString() : undefined,
      // online shipping → courier + tracking; self delivery → optional (often blank)
      courier: baseStatus !== "canceled" && method === "online" ? COURIERS[idx % 4] : undefined,
      trackingNo: baseStatus !== "canceled" && method === "online" ? `SD${String(9000 + thisSeq).padStart(7, "0")}` : undefined,
      // proof of delivery only exists once the shipment doc is actually completed
      proofFile: shipmentStatus === "completed" ? "pickup-proof.jpg" : undefined,
      // both out-for-delivery and shipped deliveries belong to a shipment batch, so the
      // Shipped tab (grouped by shipment) has open + completed demo content out of the box.
      shipmentNo: inShipment ? `Shipment #${60000 + thisSeq}` : undefined,
      shipmentStatus,
      receivedDate: shipmentStatus === "completed" ? new Date().toISOString().slice(0, 10) : undefined,
      receivedBy: shipmentStatus === "completed" ? RECEIVER_NAMES[idx % RECEIVER_NAMES.length] : undefined,
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
      assignee: operatorForWarehouse(pack.warehouseId, k),
      skuQty: pack.skuQty,
      orderQty: order?.orderQty ?? toShipQty,
      toShipQty,
      shippedQty: toShipQty,
      status: "shipped",
      shippedDate: new Date().toISOString(),
      courier: COURIERS[k % COURIERS.length],
      trackingNo: `SD${String(9500 + thisSeq).padStart(7, "0")}`,
      // these are long-since-processed historical shipments — always Completed.
      proofFile: "pickup-proof.jpg",
      shipmentNo: `Shipment #${60000 + thisSeq}`,
      shipmentStatus: "completed",
      receivedDate: new Date().toISOString().slice(0, 10),
      receivedBy: RECEIVER_NAMES[k % RECEIVER_NAMES.length],
    });
  });
  return out;
}

const snapshot = loadSnapshot<DeliveryTask>("delivery-v3");
export const deliveryTasks = reactive<DeliveryTask[]>(snapshot ?? seedTasks());

function persistDelivery(): void {
  saveSnapshot("delivery-v3", deliveryTasks);
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

/** Badge count for the Delivery stage = deliveries still awaiting handover (scoped).
 *  Out-for-delivery has already left the dock (it lives on the Shipped tab under its
 *  open shipment), so it no longer counts as delivery work. */
export function deliveryOpenCount(warehouseIds?: string[]): number {
  return deliveryTasksFor(warehouseIds).filter(
    (t) => t.status === "ready to ship",
  ).length;
}

/** Delivery(ies) for a given outbound order. */
export function getDeliveryForOrder(orderId: string): DeliveryTask[] {
  return deliveryTasks.filter((t) => t.salesOrderId === orderId);
}

/** A delivery is cancellable while it hasn't truly SHIPPED yet — i.e. "ready to ship"
 *  OR "out for delivery" (handed over but the shipment doc isn't completed, so the
 *  parcel can still come back). Only a completed-shipment "shipped" delivery is
 *  terminal and blocks the parent cancel upstream (posting guard). */
export function canCancelDeliveryTask(t: DeliveryTask): boolean {
  return t.status === "ready to ship" || t.status === "out for delivery";
}

/** Cancel a delivery task (ready-to-ship or out-for-delivery) — part of the
 *  outbound-cancel cascade. An out-for-delivery delivery STAYS attached to its
 *  shipment (shipmentNo kept) so the shipment shows it as canceled and prompts the
 *  operator to acknowledge; acknowledging (acknowledgeCanceledShipment) then detaches
 *  it. A ready-to-ship delivery has no shipment, so there's nothing to detach. */
export function cancelDeliveryTask(taskId: string, reason?: string): void {
  const t = deliveryTasks.find((x) => x.id === taskId);
  if (!t || !canCancelDeliveryTask(t)) return;
  t.status = "canceled";
  t.canceledDate = new Date().toISOString();
  if (reason) t.canceledReason = reason;
  t.canceledBy = "Rizal Candra";
  persistDelivery();
}

/** True if an order already has a live (non-canceled) delivery — a canceled one
 *  doesn't block, so the order can be re-delivered. Used to prevent creating a
 *  second delivery for an order that is already being delivered/shipped. */
export function orderHasDelivery(orderId: string): boolean {
  return deliveryTasks.some(
    (t) => t.salesOrderId === orderId && t.status !== "canceled",
  );
}

/** True if a packing task is already in a shipment (out for delivery or shipped) —
 *  so it can't be swept into another. */
export function packingTaskHasShipment(packingTaskId: string): boolean {
  return deliveryTasks.some(
    (t) => (t.status === "shipped" || t.status === "out for delivery") && packingTaskIdsForDelivery(t).includes(packingTaskId),
  );
}

export function getDeliveryTask(taskId: string): DeliveryTask | undefined {
  return deliveryTasks.find((t) => t.id === taskId);
}

/**
 * Ready-to-ship delivery in a warehouse whose packing no. matches a scanned code
 * (New shipment page — stands in for scanning the real shipping label/AWB, which
 * isn't assigned yet at this stage; the packing no. is the document that already
 * exists on the package before a courier/tracking no. is decided).
 */
export function findReadyToShipByPackingNo(warehouseId: string, packingNo: string): DeliveryTask | undefined {
  const q = packingNo.trim();
  if (!q) return undefined;
  return deliveryTasks.find(
    (t) =>
      t.warehouseId === warehouseId &&
      t.status === "ready to ship" &&
      (sameCode(t.packingTaskNo, q) || (t.packingTaskNos && includesCode(t.packingTaskNos, q))),
  );
}

/**
 * Same match, ignoring warehouse — lets a caller tell "this packing no. belongs
 * to a different warehouse" apart from a genuine not-found when a scan misses.
 */
export function findReadyToShipByPackingNoAnyWarehouse(packingNo: string): DeliveryTask | undefined {
  const q = packingNo.trim();
  if (!q) return undefined;
  return deliveryTasks.find(
    (t) => t.status === "ready to ship" && (sameCode(t.packingTaskNo, q) || (t.packingTaskNos && includesCode(t.packingTaskNos, q))),
  );
}

let nextShipmentSeq = 70000;
function freshShipmentSeq(): number {
  const used = deliveryTasks
    .map((t) => Number((t.shipmentNo ?? "").replace(/\D/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  nextShipmentSeq = Math.max(nextShipmentSeq, ...used, 69999) + 1;
  return nextShipmentSeq;
}

// Keeps the operator's picked business date, stamped with the actual time of
// save (nothing meaningful was ever typed for the time — a bare "YYYY-MM-DD"
// fed into a datetime formatter renders a spurious UTC-shifted hour).
function stampSaveTime(dateOnly: string): string {
  const time = new Date();
  const hh = String(time.getHours()).padStart(2, "0");
  const mm = String(time.getMinutes()).padStart(2, "0");
  return `${dateOnly}T${hh}:${mm}:00`;
}

/** One shipment doc created by a handover batch. */
export interface HandoverResult {
  shipmentNo: string;
  shipmentSeq: string;
  courier: string;
  shippedCount: number;
}

/**
 * Hand several ready-to-ship deliveries (same warehouse) over to the courier in one
 * batch — each keeps/gets its own courier + tracking no. (marketplace orders arrive
 * with theirs fixed; non-marketplace ones take whatever the admin entered on the
 * handover page). Deliveries are grouped by their (post-assignment) courier — each
 * distinct courier gets its OWN shipment doc number, since a shipment physically
 * travels with one courier at a time; a batch spanning several couriers produces
 * several shipments. Every shipment doc starts "open" (dispatched, handover not yet
 * confirmed) — it becomes "completed" once the courier/customer signs for the goods.
 */
export function handoverToCourierBulk(
  taskIds: string[],
  opts: {
    assignee: string;
    transactionDate: string;
    courierByTaskId?: Record<string, string>;
    trackingNoByTaskId?: Record<string, string>;
  },
): HandoverResult[] {
  const groups = new Map<string, string[]>();
  for (const id of taskIds) {
    const t = getDeliveryTask(id);
    if (!t || t.status !== "ready to ship") continue;
    const courier = opts.courierByTaskId?.[id]?.trim() || t.courier || "";
    if (!groups.has(courier)) groups.set(courier, []);
    groups.get(courier)!.push(id);
  }

  const results: HandoverResult[] = [];
  for (const [courier, ids] of groups) {
    const seq = freshShipmentSeq();
    const shipmentNo = `Shipment #${seq}`;
    let shippedCount = 0;
    for (const id of ids) {
      const t = getDeliveryTask(id)!;
      // Handover ≠ shipped. The parcel is with the courier but the shipment doc is
      // still "open" (unconfirmed) → "out for delivery": on-hand untouched, still
      // cancellable. It only becomes "shipped" (posted) when the shipment completes.
      t.status = "out for delivery";
      t.shipmentStatus = "open";
      t.shippedQty = 0;
      t.shippedDate = stampSaveTime(opts.transactionDate);
      t.assignee = opts.assignee;
      t.shipmentNo = shipmentNo;
      if (courier) t.courier = courier;
      const trackingNo = opts.trackingNoByTaskId?.[id];
      if (trackingNo) t.trackingNo = trackingNo;
      shippedCount++;
    }
    results.push({ shipmentNo, shipmentSeq: String(seq), courier, shippedCount });
  }
  persistDelivery();
  return results;
}

/** Every delivery shipped together under one shipment batch, oldest call wins the
 *  summary fields (assignee/date/warehouse/status are the same across the batch). */
export interface ShipmentSummary {
  shipmentSeq: string;
  shipmentNo: string;
  assignee: string;
  transactionDate: string;
  warehouseId: string;
  warehouseName: string;
  /** the shipment doc's own status — "open" (dispatched, not yet confirmed) or
   *  "completed" (courier/customer signed for it). */
  status: "open" | "completed";
  /** set once completed — who received/signed for the goods, when, and any note. */
  receivedDate?: string;
  receivedBy?: string;
  receivedNote?: string;
  /** signed proof-of-delivery file name, set once completed. */
  proofFile?: string;
  /** One of the shipment's orders was cancelled (still attached) and the operator
   *  hasn't acknowledged it yet — the shipment shows it as canceled and a banner
   *  prompts an acknowledge, which detaches it (acknowledgeCanceledShipment). */
  needsCancelAck: boolean;
  deliveries: DeliveryTask[];
}
export function getShipment(shipmentSeq: string): ShipmentSummary | undefined {
  // Include canceled deliveries still attached to the shipment (pending acknowledge),
  // so the shipment shows them as canceled before the operator acknowledges.
  const deliveries = deliveryTasks.filter((t) => t.shipmentNo?.replace(/\D/g, "") === shipmentSeq);
  const first = deliveries.find((d) => d.status !== "canceled") ?? deliveries[0];
  if (!first) return undefined;
  return {
    shipmentSeq,
    shipmentNo: first.shipmentNo!,
    assignee: first.assignee,
    transactionDate: first.shippedDate ?? "",
    warehouseId: first.warehouseId,
    warehouseName: first.warehouseName,
    status: first.shipmentStatus ?? "open",
    receivedDate: first.receivedDate,
    receivedBy: first.receivedBy,
    receivedNote: first.receivedNote,
    proofFile: first.proofFile,
    needsCancelAck: deliveries.some((d) => d.status === "canceled"),
    deliveries,
  };
}

/** Every shipment batch (one row per shipment no.), scoped to warehouses when
 *  given — for the "Shipped" tab, which lists shipments rather than deliveries. */
export function listShipments(warehouseIds?: string[]): ShipmentSummary[] {
  const byNo = new Map<string, DeliveryTask[]>();
  for (const t of deliveryTasks) {
    if (!t.shipmentNo) continue; // canceled-but-attached stays listed until acknowledged
    if (warehouseIds?.length && !warehouseIds.includes(t.warehouseId)) continue;
    if (!byNo.has(t.shipmentNo)) byNo.set(t.shipmentNo, []);
    byNo.get(t.shipmentNo)!.push(t);
  }
  return [...byNo.entries()].map(([shipmentNo, deliveries]) => {
    const first = deliveries.find((d) => d.status !== "canceled") ?? deliveries[0]!;
    return {
      shipmentSeq: shipmentNo.replace(/\D/g, ""),
      shipmentNo,
      assignee: first.assignee,
      transactionDate: first.shippedDate ?? "",
      warehouseId: first.warehouseId,
      warehouseName: first.warehouseName,
      status: first.shipmentStatus ?? "open",
      needsCancelAck: deliveries.some((d) => d.status === "canceled"),
      deliveries,
    };
  });
}

/** Operator acknowledges the cancelled order(s) in a multi-order shipment: each
 *  canceled delivery is DETACHED from the shipment (shipmentNo cleared) so the
 *  shipment lists only its live deliveries. The detached delivery still exists
 *  (canceled) and stays visible on its own order's detail page. */
export function acknowledgeCanceledShipment(shipmentSeq: string): void {
  let changed = false;
  for (const t of deliveryTasks) {
    if (t.shipmentNo?.replace(/\D/g, "") !== shipmentSeq) continue;
    if (t.status !== "canceled") continue;
    t.shipmentNo = undefined;
    t.shipmentStatus = undefined;
    t.shippedDate = undefined;
    changed = true;
  }
  if (changed) persistDelivery();
}

/**
 * Mark a shipment doc as completed — the courier/customer has signed for the
 * goods. Applies to every delivery sharing this shipment no. together (they were
 * dispatched as one batch, so they're confirmed received as one batch too).
 */
export function completeShipment(
  shipmentSeq: string,
  opts: { receivedDate: string; receivedBy: string; note?: string; proofFile?: string },
): { ok: boolean; reason?: "not-found" | "needs-cancel-ack" } {
  const related = deliveryTasks.filter((t) => t.shipmentNo?.replace(/\D/g, "") === shipmentSeq);
  if (related.length === 0) return { ok: false, reason: "not-found" };
  // A shipment with a still-attached CANCELED delivery must be acknowledged
  // (detached via acknowledgeCanceledShipment) BEFORE it can be completed —
  // otherwise completion would silently post only the live deliveries and leave
  // the canceled one dangling. Guard here at the data layer so NO caller (index,
  // detail, direct URL) can bypass it, not just the UI.
  if (related.some((t) => t.status === "canceled")) return { ok: false, reason: "needs-cancel-ack" };
  for (const t of related) {
    // THIS is the real posting event — the goods are confirmed gone.
    if (t.status === "out for delivery") {
      t.status = "shipped";
      t.shippedQty = t.toShipQty;
      // Deduct on-hand for exactly what shipped, per SKU, and consume that much of the
      // order's reservation. onHand ↓ and reserved ↓ by the same amount, so Available
      // is unchanged (the units left the building, they weren't returned to stock).
      for (const [sku, qty] of shippedQtyBySku(t)) {
        if (qty <= 0) continue;
        applyStockInOut(t.warehouseId, [{ sku, qty: -qty }]);
        consumeReservation(t.salesOrderId, t.warehouseId, sku, qty);
      }
    }
    t.shipmentStatus = "completed";
    t.receivedDate = opts.receivedDate;
    t.receivedBy = opts.receivedBy;
    t.receivedNote = opts.note;
    if (opts.proofFile) t.proofFile = opts.proofFile;
  }
  persistDelivery();
  return { ok: true };
}

/** Per-SKU quantity actually SHIPPED (completed) for one order, across every one of
 *  its shipped deliveries — lets reserveOrder avoid re-reserving gone stock when a
 *  partially-shipped order is re-evaluated (it's still "pickable"). */
export function shippedQtyBySkuForOrder(orderId: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of deliveryTasks) {
    if (d.salesOrderId !== orderId || d.status !== "shipped") continue;
    for (const [sku, q] of shippedQtyBySku(d)) out[sku] = (out[sku] ?? 0) + q;
  }
  return out;
}

/** Per-SKU quantity a delivery is shipping — summed across the packing task(s) that
 *  feed it (packed qty, falling back to what picking delivered). */
function shippedQtyBySku(t: DeliveryTask): Map<string, number> {
  const bySku = new Map<string, number>();
  for (const pkId of packingTaskIdsForDelivery(t)) {
    const pk = getPackingTask(pkId);
    if (!pk) continue;
    for (const l of pickedLinesForPacking(pk)) {
      const qty = pk.packedByKey?.[l.key] ?? l.picked;
      if (qty > 0) bySku.set(l.sku, (bySku.get(l.sku) ?? 0) + qty);
    }
  }
  return bySku;
}

export function activeDeliveryTasksFor(warehouseId: string, assignee: string): DeliveryTask[] {
  return deliveryTasks.filter(
    (t) => t.warehouseId === warehouseId && t.assignee === assignee && t.status === "ready to ship",
  );
}

export function reassignDeliveryTasks(warehouseId: string, fromName: string, toName: string): void {
  for (const t of activeDeliveryTasksFor(warehouseId, fromName)) t.assignee = toName;
  persistDelivery();
}

/** Available couriers for the ship form — sourced from the courier master
 *  (couriers.ts), so the picker and the CouriersPage manage the same list. */
export const DELIVERY_COURIERS = couriers.map((c) => c.name);

/**
 * Demo seed: 2 ready-to-ship deliveries sharing the SAME warehouse + courier, so the
 * Ready to ship tab's Courier filter and its bulk "Create shipment" action have
 * something to batch out of the box (the naturally-seeded ready-to-ship deliveries
 * above never share a courier). Built through the real order → picking → packing →
 * delivery flow (same recipe as tests/create-shipment-courier-required.spec.ts)
 * rather than hand-rolled records, so every downstream lookup (packing/picking
 * detail links, reservations) stays consistent. Idempotent via a marker salesNo —
 * addOutgoing()/addPickingTask()/etc. each persist immediately, so without this
 * guard a fresh module load after the first would create duplicates.
 */
function seedReadyToShipDemoPair(): void {
  // Client-only — this walks the full order → picking → packing → delivery mutation
  // path (reserveStock etc.), real work that has no business running on every test
  // file's module load (persist.ts's snapshot read/write already no-ops server-side
  // the same way; this just extends that boundary to the seed itself).
  if (!import.meta.client) return;
  const MARKER = "Sales Order #19601";
  if (outgoingOrders.some((o) => o.salesNo === MARKER)) return;
  const WH_ID = "wh-001";
  const WH_NAME = "Gudang Jakarta Pusat";
  const COURIER = "JNE REG";
  [MARKER, "Sales Order #19602"].forEach((salesNo, i) => {
    const order = addOutgoing({
      salesNo,
      source: "Manual",
      warehouseId: WH_ID,
      warehouseName: WH_NAME,
      skuQty: 1,
      orderQty: 2,
      shippedQty: 0,
      status: "open",
      dueDate: new Date().toISOString().slice(0, 10),
      lines: [{ sku: "3004", productName: "Coffee Scale 2kg / 0.1g", desc: "", img: "", unit: "Unit", qty: 2 }],
    });
    const assignee = operatorForWarehouse(WH_ID, i);
    const pick = addPickingTask({
      salesOrderIds: [order.id], salesNos: [order.salesNo],
      warehouseId: WH_ID, warehouseName: WH_NAME, assignee,
    });
    startPicking(pick.id);
    endPicking(pick.id, { [`${order.id}::3004`]: 2 });
    const pack = addPackingTask({
      salesOrderId: order.id, salesNo: order.salesNo,
      pickingTaskId: pick.id, pickingTaskNo: pick.taskNo,
      warehouseId: WH_ID, warehouseName: WH_NAME, assignee,
    });
    startPacking(pack.id);
    endPacking(pack.id, { [`${order.id}::3004`]: 2 });
    addDeliveryTaskFromPackingTasks([getPackingTask(pack.id)!], { assignee, deliveryMethod: "online", courier: COURIER });
  });
}
seedReadyToShipDemoPair();
