import { outgoingOrders, reserveAllPickableOrders, cancelOutgoingOrder, canCancelOutboundOrder, canEditOutboundOrder, updateOutgoingOrderLines } from "./outgoing";
import { getPickingForOrder, cancelPickingTask, markPickingNeedsCancelAck, lockedOutboundQtyForSku } from "./pickingTasks";
import { getPackingForOrder, cancelPackingTask } from "./packingTasks";
import { deliveryTasks, getDeliveryForOrder, canCancelDeliveryTask, cancelDeliveryTask, shippedQtyBySkuForOrder } from "./deliveryTasks";
import { orderSkuLines } from "./inventory";
import { getWarehouseDetail, consumeReservation } from "./warehouseDetails";

export type CancelOutboundResult =
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" | "OUTBOUND_ALREADY_SHIPPED" | "OUTBOUND_CANNOT_CANCEL_COMPLETED" };

export type EditOutboundResult =
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" | "NOT_EDITABLE" | "SKU_LOCKED" | "NO_ALLOCATABLE_STOCK"; sku?: string };

/**
 * D7 — Edit an outbound order's SKU lines (+ optional header). Enforces AC#4:
 *  - a SKU already LOCKED into a started picking task (in progress / partially picked /
 *    completed) can't be removed or reduced below its locked qty (SKU_LOCKED);
 *  - an added / increased qty must be reservable now, else NO_ALLOCATABLE_STOCK (nothing
 *    is committed — the whole edit is rejected, no partial apply);
 *  - a removed / reduced line releases its reservation back to Available;
 *  - reservation stays granular (reserveAllPickableOrders re-reserves the increase at
 *    batch/serial/storage-location detail, same path a fresh order uses).
 * Lives here (above picking) so it can read picking state without a load-time cycle.
 */
export function editOutboundOrder(
  orderId: string,
  newLines: { sku: string; qty: number }[],
  header?: { customer?: string; dueDate?: string; memo?: string },
): EditOutboundResult {
  const order = outgoingOrders.find((o) => o.id === orderId);
  if (!order) return { ok: false, reason: "NOT_FOUND" };
  if (!canEditOutboundOrder(order)) return { ok: false, reason: "NOT_EDITABLE" };
  const wh = order.warehouseId;

  const oldBySku = new Map<string, number>();
  for (const l of orderSkuLines(order)) oldBySku.set(l.product.sku, l.qty);
  const newBySku = new Map<string, number>();
  for (const l of newLines) if (l.qty > 0) newBySku.set(l.sku, (newBySku.get(l.sku) ?? 0) + l.qty);
  const skus = new Set<string>([...oldBySku.keys(), ...newBySku.keys()]);

  // 1) Lock check — can't drop below what's already committed to a started picking task.
  for (const sku of skus) {
    if ((newBySku.get(sku) ?? 0) < lockedOutboundQtyForSku(orderId, sku)) return { ok: false, reason: "SKU_LOCKED", sku };
  }
  // 2) Allocatable pre-check for every increase — reject the WHOLE edit if any can't reserve.
  const wd = getWarehouseDetail(wh);
  for (const sku of skus) {
    const delta = (newBySku.get(sku) ?? 0) - (oldBySku.get(sku) ?? 0);
    if (delta > 0 && (wd?.stock.find((s) => s.sku === sku)?.available ?? 0) < delta) return { ok: false, reason: "NO_ALLOCATABLE_STOCK", sku };
  }
  // 3) Release reductions/removals back to Available (before rewriting the lines).
  for (const sku of skus) {
    const delta = (newBySku.get(sku) ?? 0) - (oldBySku.get(sku) ?? 0);
    if (delta < 0) consumeReservation(orderId, wh, sku, -delta);
  }
  // 4) Commit the new lines + header.
  updateOutgoingOrderLines(orderId, [...newBySku].map(([sku, qty]) => ({ sku, qty })), header);
  // 5) Reserve the increases (order is still pickable → reserveOrder reserves the delta).
  reserveAllPickableOrders();
  return { ok: true };
}

/** D2 AC#5/AC#6 — cancel an outbound order (terminal, kept & auditable) and cascade
 *  across its tasks. Cancel is allowed only while NOTHING has shipped (posting guard):
 *  a partially-shipped/completed order is rejected. On success:
 *   - a picking task serving ONLY this order → CANCELLED whatever its status
 *     (open / in progress / partially picked / completed) — there's no live order
 *     left for it to serve; it's stamped with a "sales order was cancelled" reason;
 *   - a picking task SHARED with other still-live orders → NOT cancelled: this
 *     order's lines are dropped (or, if the task is already completed, kept as an
 *     audit record — packableOrderIds() excludes the cancelled order either way);
 *   - a packing task (always 1 order) → CANCELLED whatever its status, with reason;
 *   - delivery/shipping task → cancelled if still ready-to-ship;
 *   - the reservation is KEPT (order-owned) and returned via the manual Release Reserved (D6).
 *  Lives in outboundSync (above picking/packing) to avoid a load-time circular import. */
export function cancelOutboundOrder(orderId: string, reason?: string): CancelOutboundResult {
  const order = outgoingOrders.find((o) => o.id === orderId);
  if (!order) return { ok: false, reason: "NOT_FOUND" };
  // Posting guard: once anything shipped, cancel is rejected.
  if (!canCancelOutboundOrder(order)) {
    return { ok: false, reason: order.status === "completed" ? "OUTBOUND_CANNOT_CANCEL_COMPLETED" : "OUTBOUND_ALREADY_SHIPPED" };
  }
  // Auto reason stamped on every cascaded task so its detail page explains WHY it
  // was cancelled (the operator never cancelled the task directly).
  const taskReason = `Sales order ${order.salesNo} was cancelled${reason ? ` — ${reason}` : ""}`;
  // Mark the order canceled FIRST, so the cascade below sees it as canceled (the
  // needs-ack flag on a shared picking task keys off the order's cancelled status).
  cancelOutgoingOrder(orderId, reason);
  const isCanceled = (id: string) => outgoingOrders.find((o) => o.id === id)?.status === "canceled";
  // Picking cascade.
  for (const t of getPickingForOrder(orderId)) {
    if (t.status === "canceled") continue;
    const hasOtherLiveOrder = t.salesOrderIds.some((id) => id !== orderId && !isCanceled(id));
    if (t.salesOrderIds.length > 1 && hasOtherLiveOrder) {
      // Shared task still serving another live order — keep it running AND keep the
      // cancelled order linked (so it stays visible under Linked transactions on both
      // detail pages). It can't be packed (packableOrderIds excludes cancelled). The
      // pick WORK isn't touched automatically: flag the task so the operator explicitly
      // ACKNOWLEDGES the cancellation, which then drops its lines from the pick list.
      markPickingNeedsCancelAck(t.id);
    } else {
      // This cancelled order is the task's only (remaining) live order → void it,
      // regardless of how far picking got.
      cancelPickingTask(t.id, taskReason, true);
    }
  }
  // Packing (1 per order) → always void; delivery/shipping (ready-to-ship only) cancel.
  for (const t of getPackingForOrder(orderId)) cancelPackingTask(t.id, taskReason, true);
  for (const d of getDeliveryForOrder(orderId)) if (canCancelDeliveryTask(d)) cancelDeliveryTask(d.id, taskReason);
  return { ok: true };
}

/**
 * Make each outbound order's status + shippedQty AGREE with its actual tasks.
 *
 * The picking → packing → delivery chain is generated consistently (packing only
 * from completed picking, delivery only from completed packing), but each order's
 * top-level status was seeded independently. This derives it from the real task
 * state so the Outgoing list and a row's linked transactions never contradict:
 *
 *   - shipped (delivery handed over): fully → completed, short → partially shipped
 *   - has any task STARTED or beyond (picking in progress/picked/completed, packing
 *     in progress/completed, or a delivery task at all — delivery only ever exists
 *     once packing has ended) → in progress
 *   - task(s) exist (picking or, when picking is skipped, packing) but NONE started → open
 *   - no task at all → pending
 *   - canceled stays canceled
 *
 * Once an order has ANY ended task (packing/delivery reached, or picking finished),
 * it never falls back to pending/open/in progress from a later still-active task —
 * e.g. a second picking list for the remainder after a short pick doesn't revert a
 * "partially shipped" order. Canceled picking/packing tasks don't count as "existing"
 * for the open/pending distinction — their order's coverage was released back to
 * uncovered, so it's exactly as if that task never happened.
 */
export function syncOutboundOrderStatuses(): void {
  for (const o of outgoingOrders) {
    if (o.status === "canceled") { o.shippedQty = 0; continue; }

    const picks = getPickingForOrder(o.id).filter((p) => p.status !== "canceled");
    const packs = getPackingForOrder(o.id).filter((p) => p.status !== "canceled");
    const dels = deliveryTasks.filter((d) => d.salesOrderId === o.id);

    const shippedTotal = dels
      .filter((d) => d.status === "shipped")
      .reduce((s, d) => s + d.shippedQty, 0);
    o.shippedQty = shippedTotal;
    // Per-SKU shipped, so reserveAllPickableOrders (called at the end of this pass)
    // doesn't re-reserve stock that already left on a partially-shipped order.
    o.shippedBySku = shippedQtyBySkuForOrder(o.id);

    if (shippedTotal > 0) {
      o.status = shippedTotal >= o.orderQty ? "completed" : "partially shipped";
    } else if (
      dels.length ||
      packs.some((p) => p.status === "in progress" || p.status === "completed") ||
      picks.some((p) => p.status === "in progress" || p.status === "partially picked" || p.status === "completed")
    ) {
      o.status = "in progress";
    } else if (picks.length || packs.length) {
      o.status = "open"; // task(s) exist, none started yet
    } else {
      o.status = "pending"; // no task at all
    }
  }
  // A seed order's status isn't settled until the loop above runs — a "completed"
  // seed label with no real task chain (only the curated demo set has one) just
  // got flipped back to "pending"/"open" here. Re-run the reservation pass so any
  // order that just became pickable gets caught up immediately, instead of only
  // ever being evaluated against whatever status it had at the very first module load.
  reserveAllPickableOrders();
}
