import { reactive } from "vue";
import { operatorForWarehouse } from "./warehouseTeam";
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

const COURIERS = ["JNE", "SiCepat", "J&T Express", "AnterAja", "Internal fleet"];
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
    const status = SEED_STATUSES[idx % SEED_STATUSES.length]!;
    const shipmentStatus = status === "shipped" ? SEED_SHIPMENT_STATUSES[idx % SEED_SHIPMENT_STATUSES.length]! : undefined;
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
      shippedQty: status === "shipped" ? toShipQty : 0,
      status,
      deliveryMethod: method,
      shippedDate: status === "shipped" ? new Date().toISOString() : undefined,
      // online shipping → courier + tracking; self delivery → optional (often blank)
      courier: status !== "canceled" && method === "online" ? COURIERS[idx % 4] : undefined,
      trackingNo: status !== "canceled" && method === "online" ? `SD${String(9000 + thisSeq).padStart(7, "0")}` : undefined,
      // proof of delivery only exists once the shipment doc is actually completed
      proofFile: shipmentStatus === "completed" ? "pickup-proof.jpg" : undefined,
      // seed shipped deliveries as their own single-delivery shipment batch, so the
      // Shipped tab (grouped by shipment) has demo content out of the box.
      shipmentNo: status === "shipped" ? `Shipment #${60000 + thisSeq}` : undefined,
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

/** True if a packing task has already been shipped (its delivery — possibly
 *  merged from several packing tasks in a bulk "Create delivery" — is shipped). */
export function packingTaskHasShipment(packingTaskId: string): boolean {
  return deliveryTasks.some(
    (t) => t.status === "shipped" && packingTaskIdsForDelivery(t).includes(packingTaskId),
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
      (t.packingTaskNo === q || t.packingTaskNos?.includes(q)),
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
    (t) => t.status === "ready to ship" && (t.packingTaskNo === q || t.packingTaskNos?.includes(q)),
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
      t.status = "shipped";
      t.shipmentStatus = "open";
      t.shippedQty = t.toShipQty;
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
    status: first.shipmentStatus ?? "open",
    receivedDate: first.receivedDate,
    receivedBy: first.receivedBy,
    receivedNote: first.receivedNote,
    proofFile: first.proofFile,
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
      status: first.shipmentStatus ?? "open",
      deliveries,
    };
  });
}

/**
 * Mark a shipment doc as completed — the courier/customer has signed for the
 * goods. Applies to every delivery sharing this shipment no. together (they were
 * dispatched as one batch, so they're confirmed received as one batch too).
 */
export function completeShipment(
  shipmentSeq: string,
  opts: { receivedDate: string; receivedBy: string; note?: string; proofFile?: string },
): void {
  for (const t of deliveryTasks) {
    if (t.shipmentNo?.replace(/\D/g, "") !== shipmentSeq) continue;
    t.shipmentStatus = "completed";
    t.receivedDate = opts.receivedDate;
    t.receivedBy = opts.receivedBy;
    t.receivedNote = opts.note;
    if (opts.proofFile) t.proofFile = opts.proofFile;
  }
  persistDelivery();
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

/** Available couriers for the ship form. */
export const DELIVERY_COURIERS = COURIERS;
