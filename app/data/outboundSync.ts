import { outgoingOrders, reserveAllPickableOrders, cancelOutgoingOrder, canCancelOutboundOrder, canEditOutboundOrder, updateOutgoingOrderLines } from "./outgoing";
import { getPickingForOrder, cancelPickingTask, markPickingNeedsCancelAck, lockedOutboundQtyForSku, pendingPickingLinesForSku, reduceOrderSkuOnPickingTask, getPickingTask } from "./pickingTasks";
import { getPackingForOrder, cancelPackingTask } from "./packingTasks";
import { deliveryTasks, getDeliveryForOrder, canCancelDeliveryTask, cancelDeliveryTask, shippedQtyBySkuForOrder } from "./deliveryTasks";
import { orderSkuLines } from "./inventory";
import { getWarehouseDetail, consumeReservation } from "./warehouseDetails";

export type CancelOutboundResult =
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" | "OUTBOUND_ALREADY_SHIPPED" | "OUTBOUND_CANNOT_CANCEL_COMPLETED" };

export type EditOutboundResult =
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" | "NOT_EDITABLE" | "SKU_LOCKED" | "NO_ALLOCATABLE_STOCK" | "REDUCTION_EXCEEDS_REMOVABLE" | "INVALID_ALLOCATION"; sku?: string; locked?: number; removable?: number };

/** Per-task reduction of one SKU (D7 allocation step). */
export interface TaskReduction { taskId: string; taskNo: string; currentQty: number; reduceBy: number; willCancel: boolean }
/** The default proposal for reducing a SKU spread across pending picking tasks (AC#3). */
export interface SkuReductionProposal {
  sku: string; reduction: number; locked: number; removable: number; unassigned: number;
  exceedsRemovable: boolean; taskReductions: TaskReduction[];
}

/** D7 AC#3 default proposal — drain the smallest pending task first so the fewest
 *  tasks remain. `R` is the amount to take from pending TASKS (order/unassigned qty
 *  is reduced separately, before this). Callers pass the pending lines + R. */
function drainSmallestFirst(pending: { taskId: string; taskNo: string; qty: number }[], R: number): TaskReduction[] {
  let rem = R;
  return [...pending].sort((a, b) => a.qty - b.qty).map((p) => {
    const reduceBy = Math.min(p.qty, Math.max(0, rem));
    rem -= reduceBy;
    return { taskId: p.taskId, taskNo: p.taskNo, currentQty: p.qty, reduceBy, willCancel: reduceBy === p.qty };
  });
}

/** D7 allocation step — the default proposal for reducing `sku` on `orderId` by `N`.
 *  Reduces any UNASSIGNED (not-on-a-task) qty first, then drains pending tasks smallest
 *  first (AC#3). Reports the removable cap (AC#2) so the caller can reject over-cap. */
export function proposeSkuReduction(orderId: string, sku: string, N: number): SkuReductionProposal {
  const order = outgoingOrders.find((o) => o.id === orderId);
  const orderQty = order ? (orderSkuLines(order).find((l) => l.product.sku === sku)?.qty ?? 0) : 0;
  const locked = lockedOutboundQtyForSku(orderId, sku);
  const pending = pendingPickingLinesForSku(orderId, sku);
  const pendingTotal = pending.reduce((s, p) => s + p.qty, 0);
  const removable = orderQty - locked;
  const unassigned = Math.max(0, orderQty - locked - pendingTotal);
  const R = Math.max(0, N - Math.min(N, unassigned)); // remainder taken from pending tasks
  const taskReductions = drainSmallestFirst(pending, R).filter((t) => t.reduceBy > 0);
  // flag will-cancel accurately: only if the whole task (all lines) empties
  for (const tr of taskReductions) {
    tr.willCancel = tr.reduceBy === tr.currentQty && (getPickingTask(tr.taskId)?.salesOrderIds.length === 1) &&
      (getPickingTask(tr.taskId)?.skuQty === 1);
  }
  return { sku, reduction: N, locked, removable, unassigned, exceedsRemovable: N > removable, taskReductions };
}

/**
 * D7 — Edit an outbound order's SKU lines (+ optional header + optional per-SKU
 * pending-task reduction allocation). Enforces the full D7 rule set:
 *  - AC#4 add/increase: reserve the delta; reject the WHOLE edit if unallocatable
 *    (NO_ALLOCATABLE_STOCK), no partial apply;
 *  - AC#4 lock: a SKU's qty on a STARTED picking task can't be removed/reduced;
 *  - allocation AC#2: a reduction can't exceed the removable (order qty − locked) —
 *    REDUCTION_EXCEEDS_REMOVABLE with {locked, removable};
 *  - allocation AC#3/#4: the reduction drains pending tasks (default smallest-first,
 *    or a caller-supplied override which must sum exactly to the pending remainder and
 *    stay within each task's qty, else INVALID_ALLOCATION);
 *  - allocation AC#5: a pending task emptied by the reduction auto-cancels;
 *  - a reduced/removed line releases its reservation back to Available.
 * Validated fully BEFORE any mutation (no partial apply).
 */
export function editOutboundOrder(
  orderId: string,
  newLines: { sku: string; qty: number }[],
  header?: { customer?: string; dueDate?: string; memo?: string },
  allocations?: Record<string, { taskId: string; reduceBy: number }[]>,
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

  // ── Validate everything up-front (no partial apply) ──────────────────────────
  const wd = getWarehouseDetail(wh);
  const reductionPlans: { sku: string; N: number; taskReductions: { taskId: string; reduceBy: number }[] }[] = [];
  for (const sku of skus) {
    const delta = (newBySku.get(sku) ?? 0) - (oldBySku.get(sku) ?? 0);
    if (delta > 0) {
      // increase → must be reservable now
      if ((wd?.stock.find((s) => s.sku === sku)?.available ?? 0) < delta) return { ok: false, reason: "NO_ALLOCATABLE_STOCK", sku };
      continue;
    }
    if (delta === 0) continue;
    const N = -delta;
    const locked = lockedOutboundQtyForSku(orderId, sku);
    const removable = (oldBySku.get(sku) ?? 0) - locked;
    if (N > removable) return { ok: false, reason: "REDUCTION_EXCEEDS_REMOVABLE", sku, locked, removable };
    const pending = pendingPickingLinesForSku(orderId, sku);
    const pendingTotal = pending.reduce((s, p) => s + p.qty, 0);
    const unassigned = Math.max(0, (oldBySku.get(sku) ?? 0) - locked - pendingTotal);
    const R = Math.max(0, N - Math.min(N, unassigned)); // to drain from pending tasks
    let taskReductions: { taskId: string; reduceBy: number }[];
    const override = allocations?.[sku];
    if (override) {
      // AC#4 — accept any distribution: each ∈ [0, task qty] AND sum === R exactly.
      const byTask = new Map(pending.map((p) => [p.taskId, p.qty]));
      let sum = 0;
      for (const a of override) {
        const cap = byTask.get(a.taskId);
        if (cap === undefined || a.reduceBy < 0 || a.reduceBy > cap) return { ok: false, reason: "INVALID_ALLOCATION", sku };
        sum += a.reduceBy;
      }
      if (sum !== R) return { ok: false, reason: "INVALID_ALLOCATION", sku };
      taskReductions = override.filter((a) => a.reduceBy > 0);
    } else {
      taskReductions = drainSmallestFirst(pending, R).filter((t) => t.reduceBy > 0).map((t) => ({ taskId: t.taskId, reduceBy: t.reduceBy }));
    }
    reductionPlans.push({ sku, N, taskReductions });
  }

  // ── Commit ───────────────────────────────────────────────────────────────────
  for (const plan of reductionPlans) {
    for (const tr of plan.taskReductions) reduceOrderSkuOnPickingTask(tr.taskId, orderId, plan.sku, tr.reduceBy);
    consumeReservation(orderId, wh, plan.sku, plan.N); // release the full reduction back to Available
  }
  updateOutgoingOrderLines(orderId, [...newBySku].map(([sku, qty]) => ({ sku, qty })), header);
  reserveAllPickableOrders(); // reserve any increases (order still pickable)
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
