import { outgoingOrders } from "./outgoing";
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
 *   - has any task underway (picking in progress / picked / packing / pending pickup) → in progress
 *   - only an open picking task, or no task yet → open
 *   - canceled stays canceled
 */
export function syncOutboundOrderStatuses(): void {
  for (const o of outgoingOrders) {
    if (o.status === "canceled") { o.shippedQty = 0; continue; }

    const picks = getPickingForOrder(o.id);
    const packs = getPackingForOrder(o.id);
    const dels = deliveryTasks.filter((d) => d.salesOrderId === o.id);

    const shippedTotal = dels
      .filter((d) => d.status === "shipped")
      .reduce((s, d) => s + d.shippedQty, 0);
    o.shippedQty = shippedTotal;

    if (shippedTotal > 0) {
      o.status = shippedTotal >= o.orderQty ? "completed" : "partially shipped";
    } else if (
      packs.length ||
      dels.length ||
      picks.some((p) => p.status === "in progress" || p.status === "completed")
    ) {
      o.status = "in progress";
    } else {
      o.status = "open"; // open picking task, or nothing started yet
    }
  }
}
