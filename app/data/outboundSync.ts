import { outgoingOrders, reserveAllPickableOrders } from "./outgoing";
import { getPickingForOrder } from "./pickingTasks";
import { getPackingForOrder } from "./packingTasks";
import { deliveryTasks } from "./deliveryTasks";

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
