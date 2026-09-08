/**
 * Which document posted an outbound's stock movement out — and where it lives.
 *
 * D5's source-conditional poster, with the billing package on top of it:
 *
 *   - WMS package only  → ALWAYS Stock In/Out. The WMS package has no costing and
 *     no journal entry, so a Sales Delivery (an accounting document) can't be the
 *     poster there whatever the order's source is.
 *   - ERP full          → Sales Delivery when the source is an ERP Sales Order
 *     (mirrors Inbound's PO → Purchase Delivery); Stock In/Out for every other
 *     source (External API / Direct Outbound).
 *
 * The package is read from the active scenario, the same way every other
 * WMS-vs-ERP difference in this prototype is.
 *
 * Prototype note: a newly posted outbound gets a REAL Stock In/Out created for it.
 * Orders that shipped in the seed have no such record, and this prototype has no
 * Sales-Delivery creation pipeline at all — so for those the document is BOUND
 * deterministically to an existing seeded record (same device as the demo outbounds
 * that claim a free seeded sales order). Either way the number and the link are
 * real: clicking through lands on a document that exists.
 */
import { salesDeliveries } from "./salesDeliveries";
import { wmsStockAdjustments } from "./wmsStockAdjustments";
import { useScenario } from "~/composables/useScenario";
import type { DeliveryDocumentRef, OutgoingOrder } from "./outgoing";

/** WMS-package-only — no costing, no JE, so no Sales Delivery as the poster. */
export function isWmsOnlyPackage(): boolean {
  const { activeScenario } = useScenario();
  return activeScenario.value.startsWith("WMS");
}

/** Which document type posts this outbound, given the package and the order's source. */
export function posterKindFor(order: OutgoingOrder): DeliveryDocumentRef["kind"] {
  if (isWmsOnlyPackage()) return "stock-in-out";
  return order.source === "Sales Order" ? "sales-delivery" : "stock-in-out";
}

/** Stable index into a seeded list from an order id, so the same order always binds
 *  to the same document instead of shuffling between renders. */
function hashOf(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** Bind an outbound to an existing seeded document of the given kind (see the
 *  prototype note above). Undefined when the seed holds none of that kind. */
export function bindSeededDocument(
  order: OutgoingOrder,
  kind: DeliveryDocumentRef["kind"],
): DeliveryDocumentRef | undefined {
  if (kind === "sales-delivery") {
    if (!salesDeliveries.length) return undefined;
    const sd = salesDeliveries[hashOf(order.id) % salesDeliveries.length]!;
    return { kind, id: sd.id, number: `Sales Delivery #${sd.number}` };
  }
  const inOut = wmsStockAdjustments.filter((a) => a.kind === "in-out");
  if (!inOut.length) return undefined;
  const adj = inOut[hashOf(order.id) % inOut.length]!;
  return { kind, id: adj.id, number: adj.number };
}
