import {
  receipts, cancelReceipt, canCancelReceipt, canEditReceipt, updateReceiptLines, appendReceiptEditLog,
} from "./receipts";
import {
  receivingTasksForReceipt, cancelReceivingTask, flagTaskCanceledPoAck, forceCancelEndedTask,
  lockedReceivingQtyForSku, recomputeReceiptStatus,
} from "./receivingTasks";
import { getPutAwayTask, flagPutAwayCanceledPoAck, cancelPutAway } from "./putAwayTasks";
import { lineItemsForReceipt } from "./receiptLineItems";
import { CATALOG } from "./catalog";

export type CancelInboundResult =
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" | "CANNOT_CANCEL" };

export type EditInboundResult =
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" | "NOT_EDITABLE" | "SKU_LOCKED"; productId?: string; sku?: string; locked?: number };

/**
 * Edit a PO's line items (+ optional header fields) — PRD C2 AC#4, adapted to
 * this app's receiving-task model. Unlike Outbound's D7 (which juggles stock
 * reservations across pending picking tasks), Inbound receiving never reserves
 * stock — receiving just tracks expected vs received qty — so there's no
 * allocatable-stock check here, only the receiving-state lock:
 *  - a SKU can be added, removed, or have its qty changed freely as long as
 *    the new qty doesn't drop below what's already been physically received
 *    for it (lockedReceivingQtyForSku — an "open"/not-yet-started task
 *    contributes nothing, so its SKUs stay freely editable);
 *  - dropping below that locked amount rejects the WHOLE edit (SKU_LOCKED) —
 *    no partial apply;
 *  - existing receiving tasks are NEVER touched by this edit (their own
 *    items[].expectedQty stays a snapshot from whenever they were created,
 *    same as this app already behaves elsewhere) — only the PO's own line
 *    items change, which is what uncoveredLineItems() reads when a NEW
 *    receiving task gets created afterward.
 * Lives here (not receipts.ts) to read receiving-task state without a
 * load-time circular import, mirroring editOutboundOrder in outboundSync.ts.
 */
export function editInboundReceipt(
  receiptId: string,
  newLines: { productId: string; qty: number }[],
  header?: { vendor?: string; estimatedArrival?: string; memo?: string; trackingNos?: string[] },
): EditInboundResult {
  const r = receipts.find((x) => x.id === receiptId);
  if (!r) return { ok: false, reason: "NOT_FOUND" };
  if (!canEditReceipt(r)) return { ok: false, reason: "NOT_EDITABLE" };

  const oldByProduct = new Map(lineItemsForReceipt(r).map((l) => [l.productId, l.purchaseQty]));
  const newByProduct = new Map<string, number>();
  for (const l of newLines) if (l.qty > 0) newByProduct.set(l.productId, (newByProduct.get(l.productId) ?? 0) + l.qty);
  const productIds = new Set<string>([...oldByProduct.keys(), ...newByProduct.keys()]);

  // Validate everything up-front (no partial apply).
  for (const productId of productIds) {
    const sku = CATALOG.find((c) => c.id === productId)?.sku;
    if (!sku) continue;
    const newQty = newByProduct.get(productId) ?? 0;
    const locked = lockedReceivingQtyForSku(receiptId, sku);
    if (newQty < locked) return { ok: false, reason: "SKU_LOCKED", productId, sku, locked };
  }

  // Build the "what changed" diff for the activity log — computed here, while
  // both the old and new line items are in scope, before anything is written.
  const changes: { label: string; value: string }[] = [];
  for (const productId of productIds) {
    const cat = CATALOG.find((c) => c.id === productId);
    const name = cat ? `${cat.name} (${cat.sku})` : productId;
    const oldQty = oldByProduct.get(productId) ?? 0;
    const newQty = newByProduct.get(productId) ?? 0;
    if (oldQty === newQty) continue;
    if (oldQty === 0) changes.push({ label: name, value: `Added — qty ${newQty}` });
    else if (newQty === 0) changes.push({ label: name, value: `Removed (was qty ${oldQty})` });
    else changes.push({ label: `${name} qty`, value: `${oldQty} → ${newQty}` });
  }
  if (header) {
    if (header.vendor !== undefined && header.vendor !== r.vendor) {
      changes.push({ label: "Vendor", value: `${r.vendor ?? "—"} → ${header.vendor}` });
    }
    if (header.estimatedArrival !== undefined && header.estimatedArrival !== r.estimatedArrival) {
      changes.push({ label: "Estimated arrival date", value: `${r.estimatedArrival} → ${header.estimatedArrival}` });
    }
    if (header.memo !== undefined && header.memo !== (r.memo ?? "")) {
      changes.push({ label: "Memo", value: `${r.memo || "—"} → ${header.memo || "—"}` });
    }
    if (header.trackingNos !== undefined && JSON.stringify(header.trackingNos) !== JSON.stringify(r.trackingNos)) {
      changes.push({ label: "Tracking no.", value: `${r.trackingNos.join(", ") || "—"} → ${header.trackingNos.join(", ") || "—"}` });
    }
  }

  updateReceiptLines(receiptId, [...newByProduct].map(([productId, qty]) => ({ productId, qty })), header);
  appendReceiptEditLog(receiptId, changes);
  recomputeReceiptStatus(receiptId);
  return { ok: true };
}

/**
 * Cancel a PO (receipt) and cascade across its receiving tasks (and, once one
 * exists, the put-away task consuming them). Unlike Picking (which can bundle
 * several sales orders into one task), a receiving task always belongs to
 * exactly ONE receipt — so canceling a PO invalidates 100% of every task it
 * owns, never just a portion of one:
 *  - open (not started) → canceled outright; nothing to reconcile.
 *  - in progress (started — real receiving work may already exist) → NOT
 *    auto-canceled immediately. Flagged (flagTaskCanceledPoAck) so Continue
 *    receiving is blocked until the operator explicitly acknowledges the PO
 *    is gone — acknowledging (acknowledgeCanceledReceipt in
 *    receivingTasks.ts) then cancels the task too, since there's nothing left
 *    to receive once its one PO is gone; whatever receivedQty already exists
 *    stays on the record for the audit trail.
 *  - pending put-away (no put-away task created yet) → auto-canceled outright
 *    — stockCommitted can never be true here, nothing real exists yet.
 *  - completed WITH an unfinished put-away (open/in progress — the common
 *    case, since creating a put-away task alone flips receiving to
 *    "completed" long before endPutAway ever runs) → the PUT-AWAY task is
 *    flagged instead (flagPutAwayCanceledPoAck) — Start/Continue put-away is
 *    blocked until the operator acknowledges; acknowledging then cancels the
 *    put-away AND its linked receiving task(s) (see acknowledgeCanceledPutAway
 *    in putAwayTasks.ts). The receiving task itself is left untouched here —
 *    its fate follows the put-away's.
 *  - completed with NO put-away link, or with a put-away that's ALREADY
 *    completed (real stock genuinely committed — stockCommitted true) → same
 *    as before: flagged for acknowledgment (reversing that stock) if
 *    stockCommitted, else auto-canceled outright (nothing real to reconcile —
 *    e.g. legacy/seed data).
 * Lives above receipts/receivingTasks/putAwayTasks to avoid a load-time
 * circular import (receivingTasks.ts already imports from receipts.ts,
 * putAwayTasks.ts already imports from receivingTasks.ts) — mirrors
 * cancelOutboundOrder() in outboundSync.ts.
 */
export function cancelInboundReceipt(receiptId: string, reason?: string): CancelInboundResult {
  const r = receipts.find((x) => x.id === receiptId);
  if (!r) return { ok: false, reason: "NOT_FOUND" };
  if (!canCancelReceipt(r)) return { ok: false, reason: "CANNOT_CANCEL" };

  const cancelReason = reason ?? "Purchase order was canceled";
  for (const t of receivingTasksForReceipt(receiptId)) {
    if (t.status === "open") {
      cancelReceivingTask(t.id, cancelReason);
      continue;
    }
    if (t.status === "in progress") {
      flagTaskCanceledPoAck(t.id);
      continue;
    }
    if (t.status !== "pending put-away" && t.status !== "completed") continue; // canceled: untouched.

    if (t.status === "completed" && t.putAwayTaskId) {
      const pa = getPutAwayTask(t.putAwayTaskId);
      if (pa && pa.status === "open") {
        // Put-away not started yet → auto-cancel outright, no ack needed. The receiving
        // task already finished, so it STAYS completed (revertReceiving:false).
        cancelPutAway(pa.id, cancelReason, { revertReceiving: false });
        continue;
      }
      if (pa && pa.status === "in progress") {
        // Real put-away work underway → flag it so the operator acknowledges before it's
        // canceled; the receiving task is left alone (stays completed) either way.
        flagPutAwayCanceledPoAck(pa.id);
        continue;
      }
    }
    if (t.stockCommitted) flagTaskCanceledPoAck(t.id);
    else forceCancelEndedTask(t.id, cancelReason);
  }
  cancelReceipt(receiptId);
  return { ok: true };
}
