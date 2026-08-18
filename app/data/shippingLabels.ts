/**
 * Shipping-label printing — the "Print Shipping Label" action shared by the
 * Picking and Packing flows (PRD Outbound D3 / D4 / D9).
 *
 * WHICH label prints (per order source):
 *   - Marketplace order → the SOURCE (marketplace) shipping label carried on the
 *     order (`order.shippingLabel`). If it hasn't arrived yet, the label is
 *     UNAVAILABLE and the print action is disabled ("waiting for marketplace
 *     shipping label").
 *   - ERP Sales Order / Manual order → the WMS-generated shipping label
 *     (`SL-<order number>`), always available.
 *
 * D9 — Prevent Duplicate Shipping Label: keyed by the label CODE, so a reprint is
 * caught no matter whether the first print happened at the picking task or the
 * packing task. Enforced only when the order's warehouse has
 * `preventDuplicateLabel` = true (Disallow); otherwise reprints are allowed.
 */
import { reactive } from "vue";
import { outgoingOrders, isMarketplaceOrder, type OutgoingOrder } from "./outgoing";
import { getWarehouseConfig } from "./warehouseConfig";
import { loadSnapshot, saveSnapshot } from "./persist";
import { normalizeCode } from "~/utils/scan";

export type ShipLabelKind = "source" | "wms";

export interface ShipLabelInfo {
  /** the label code — the marketplace resi/AWB, or the WMS-generated code */
  code: string;
  kind: ShipLabelKind;
  /** false only for a marketplace order whose source label hasn't arrived yet */
  available: boolean;
}

/** Resolve the shipping label that applies to one order. */
export function shippingLabelInfo(order: OutgoingOrder): ShipLabelInfo {
  if (isMarketplaceOrder(order)) {
    const code = (order.shippingLabel ?? "").trim();
    return { code, kind: "source", available: !!code };
  }
  // ERP Sales Order / Manual → WMS-generated shipping label, always available.
  return { code: `SL-${order.number}`, kind: "wms", available: true };
}

// ── D9: printed-label registry (persisted) ────────────────────────────────────
// code (normalized) → ISO timestamp it was printed. Shared across picking & packing.
const printed = reactive<Record<string, string>>(
  loadSnapshot<Record<string, string>>("printed-ship-labels-v1") ?? {},
);
function persist(): void {
  saveSnapshot("printed-ship-labels-v1", printed);
}

export function isLabelPrinted(code: string): boolean {
  return !!code && !!printed[normalizeCode(code)];
}
export function markLabelPrinted(code: string): void {
  if (code) {
    printed[normalizeCode(code)] = new Date().toISOString();
    persist();
  }
}
/** Test/reset helper — clears the printed-label registry. */
export function resetPrintedLabels(): void {
  for (const k of Object.keys(printed)) delete printed[k];
  persist();
}

// ── Print resolution (does NOT render the PDF or mark printed) ─────────────────
export type ShipLabelPrintStatus = "ok" | "unavailable" | "duplicate" | "missing-courier";
export interface ShipLabelPrintResult {
  order: OutgoingOrder;
  info: ShipLabelInfo;
  /** ok = printable now · unavailable = marketplace label not arrived ·
   *  duplicate = already printed and the warehouse forbids reprints (D9) ·
   *  missing-courier = non-marketplace order with no courier yet (only when the
   *  caller requires one — the packing print gate). */
  status: ShipLabelPrintStatus;
}

/**
 * Work out, for a set of orders, which labels can print now — honoring each
 * order's warehouse Prevent-Duplicate setting (D9). The caller renders the PDF
 * for the `ok` results, then calls {@link commitShippingLabelsPrinted}; the
 * `unavailable` / `duplicate` results drive the warning toasts.
 *
 * `preventDuplicate` resolves the per-warehouse D9 setting; it defaults to the
 * real warehouse config and is injectable for tests.
 */
export function resolveShippingLabelPrint(
  orders: OutgoingOrder[],
  preventDuplicate: (warehouseId: string) => boolean = (wid) => getWarehouseConfig(wid).preventDuplicateLabel,
): ShipLabelPrintResult[] {
  return orders.map((order) => {
    const info = shippingLabelInfo(order);
    if (!info.available) return { order, info, status: "unavailable" as const };
    const status: ShipLabelPrintStatus =
      preventDuplicate(order.warehouseId) && isLabelPrinted(info.code) ? "duplicate" : "ok";
    return { order, info, status };
  });
}

/** Mark every successfully-printed label as printed (feeds the D9 duplicate guard). */
export function commitShippingLabelsPrinted(results: ShipLabelPrintResult[]): void {
  for (const r of results) if (r.status === "ok") markLabelPrinted(r.info.code);
}

// ── Order lookup helpers for the picking/packing callers ──────────────────────
export function orderById(id: string | undefined): OutgoingOrder | undefined {
  return id ? outgoingOrders.find((o) => o.id === id) : undefined;
}
/** Distinct orders behind a set of order ids (a picking task may span several). */
export function ordersByIds(ids: readonly string[]): OutgoingOrder[] {
  const seen = new Set<string>();
  const out: OutgoingOrder[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const o = orderById(id);
    if (o) { seen.add(id); out.push(o); }
  }
  return out;
}
/** Can Print Shipping Label be enabled for these orders? True if ≥1 has an
 *  available label (marketplace-waiting orders don't count). */
export function anyLabelAvailable(orders: OutgoingOrder[]): boolean {
  return orders.some((o) => shippingLabelInfo(o).available);
}

/**
 * D4 AC#8 — Source-label-gated packing start. True when the order's warehouse
 * requires the order-source (marketplace) shipping label before packing can
 * begin (`requireSourceLabel`, Configure warehouse) and that label hasn't
 * arrived yet — Start Packing / Match Order must stay blocked ("waiting for
 * marketplace shipping label") and the task stays Pending. The gate releases
 * automatically the instant the label lands (via the A7 update write-back) —
 * no manual un-gate. Non-marketplace orders are never gated; they have no
 * source label to wait for and use the WMS-generated label instead.
 */
export function packingBlockedOnSourceLabel(order: OutgoingOrder | undefined): boolean {
  if (!order || !isMarketplaceOrder(order)) return false;
  if (!getWarehouseConfig(order.warehouseId).requireSourceLabel) return false;
  return !shippingLabelInfo(order).available;
}
