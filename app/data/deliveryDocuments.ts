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
import { purchaseDeliveries } from "./purchaseDeliveries";
import { wmsStockAdjustments } from "./wmsStockAdjustments";
import { stockAdjustments } from "./stockAdjustments";
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

/** The inbound mirror: an ERP purchase order posts a Purchase Delivery, anything
 *  else (direct receipt / external API) posts a Stock In/Out — and the WMS package
 *  posts a Stock In/Out either way, for the same no-costing reason as outbound. */
export function inboundPosterKindFor(hasPurchaseOrder: boolean): DeliveryDocumentRef["kind"] {
  if (isWmsOnlyPackage()) return "stock-in-out";
  return hasPurchaseOrder ? "purchase-delivery" : "stock-in-out";
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

/** Same binding, addressed by any record id — inbound tasks and cycle counts have
 *  no OutgoingOrder to key off. */
export function bindSeededDocumentById(
  recordId: string,
  kind: DeliveryDocumentRef["kind"],
): DeliveryDocumentRef | undefined {
  if (kind === "purchase-delivery") {
    if (!purchaseDeliveries.length) return undefined;
    const pd = purchaseDeliveries[hashOf(recordId) % purchaseDeliveries.length]!;
    return { kind, id: pd.id, number: `Purchase Delivery #${pd.number}` };
  }
  if (kind === "sales-delivery") {
    if (!salesDeliveries.length) return undefined;
    const sd = salesDeliveries[hashOf(recordId) % salesDeliveries.length]!;
    return { kind, id: sd.id, number: `Sales Delivery #${sd.number}` };
  }
  const inOut = wmsStockAdjustments.filter((a) => a.kind === "in-out");
  if (!inOut.length) return undefined;
  const adj = inOut[hashOf(recordId) % inOut.length]!;
  return { kind: "stock-in-out", id: adj.id, number: adj.number };
}

/**
 * The document a CYCLE COUNT posted — and unlike everything else here this one is
 * a genuine link, not a binding: approving a WMS cycle count creates an ERP Stock
 * Count that carries `linkedCycleCountId` back to it. Undefined until that exists,
 * which is the honest answer for a count that hasn't been approved yet.
 */
export function cycleCountDocumentFor(cycleCountId: string): DeliveryDocumentRef | undefined {
  const posted = stockAdjustments.find((a) => a.linkedCycleCountId === cycleCountId);
  if (!posted) return undefined;
  return { kind: "stock-count", id: posted.id, number: posted.number };
}
