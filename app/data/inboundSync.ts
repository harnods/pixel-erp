import {
  receipts, cancelReceipt, canCancelReceipt, canEditReceipt, updateReceiptLines, appendReceiptEditLog,
} from "./receipts";
import {
  receivingTasksForReceipt, getReceivingTask, cancelReceivingTask, flagTaskCanceledPoAck,
  forceCancelEndedTask, completeReceivingOnPoCancel, lockedReceivingQtyForSku, recomputeReceiptStatus,
  openReceivingLinesForSku, reduceOrderSkuOnReceivingTask, markReceivingNeedsRearrangement,
  type RearrangementChange,
} from "./receivingTasks";
import { getPutAwayTask, flagPutAwayCanceledPoAck, cancelPutAway, removeReceivingTasksFromPutAway } from "./putAwayTasks";
import { lineItemsForReceipt } from "./receiptLineItems";
import { CATALOG } from "./catalog";

export type CancelInboundResult =
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" | "CANNOT_CANCEL" };

export type EditInboundResult =
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" | "NOT_EDITABLE" | "SKU_LOCKED"; productId?: string; sku?: string; locked?: number; removable?: number };

/** Per-task reduction of one SKU (the multi-Open-task allocation step). */
export interface ReceivingTaskReduction { taskId: string; taskNo: string; currentQty: number; reduceBy: number; willCancel: boolean }
/** The default (and, per this feature's MVP, ONLY — no override) proposal for
 *  reducing a SKU spread across Open receiving tasks. Mirrors SkuReductionProposal
 *  in outboundSync.ts. */
export interface ReceivingReductionProposal {
  sku: string; reduction: number; locked: number; removable: number; unassigned: number;
  exceedsRemovable: boolean; taskReductions: ReceivingTaskReduction[];
}

/** Drain the smallest Open task first so the fewest tasks remain — same rule as
 *  outbound D7 AC#3, duplicated locally to keep inbound/outbound decoupled. */
function drainSmallestFirst(open: { taskId: string; taskNo: string; qty: number }[], R: number): ReceivingTaskReduction[] {
  let rem = R;
  return [...open].sort((a, b) => a.qty - b.qty).map((p) => {
    const reduceBy = Math.min(p.qty, Math.max(0, rem));
    rem -= reduceBy;
    return { taskId: p.taskId, taskNo: p.taskNo, currentQty: p.qty, reduceBy, willCancel: reduceBy === p.qty };
  });
}

/** The default proposal for reducing `sku` on `receiptId` by `N` — reduces any
 *  UNASSIGNED (not yet claimed by any task) qty first, then drains Open tasks
 *  smallest first. Reports the removable cap so the caller can reject over-cap. */
export function proposeReceivingReduction(receiptId: string, sku: string, N: number): ReceivingReductionProposal {
  const r = receipts.find((x) => x.id === receiptId);
  const poQty = r ? (lineItemsForReceipt(r).find((l) => l.sku === sku)?.purchaseQty ?? 0) : 0;
  const locked = lockedReceivingQtyForSku(receiptId, sku);
  const open = openReceivingLinesForSku(receiptId, sku);
  const openTotal = open.reduce((s, p) => s + p.qty, 0);
  const removable = poQty - locked;
  const unassigned = Math.max(0, poQty - locked - openTotal);
  const R = Math.max(0, N - Math.min(N, unassigned));
  const taskReductions = drainSmallestFirst(open, R).filter((t) => t.reduceBy > 0);
  for (const tr of taskReductions) {
    tr.willCancel = tr.reduceBy === tr.currentQty && getReceivingTask(tr.taskId)?.items.length === 1;
  }
  return { sku, reduction: N, locked, removable, unassigned, exceedsRemovable: N > removable, taskReductions };
}

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
 *  - dropping below that locked amount rejects the WHOLE edit (SKU_LOCKED),
 *    now carrying `removable` too so the caller can show "X locked in active
 *    receiving, only Y removable" — no partial apply;
 *  - a reduction that fits within the removable cap DOES now touch existing
 *    Open receiving tasks (this used to be a strict no-touch snapshot — see the
 *    "existing tasks are touched" describe block in inbound-edit-order.spec.ts
 *    for the deliberate behavior change): the removed qty drains any unassigned
 *    remainder first, then Open tasks smallest-first (proposeReceivingReduction
 *    above computes the same plan the UI previews before the user acknowledges);
 *    a task emptied to 0 auto-cancels, a task that survives with qty left over
 *    freezes into Needs Re-arrangement (markReceivingNeedsRearrangement, carrying
 *    a per-SKU before/after snapshot) until the operator reviews it on that task's
 *    own page (View changes → Proceed changes) — applies the same way whether this
 *    edit arrived via the WMS surface or a direct/API call, since there's no
 *    separate confirm step possible for that path;
 *  - only the SKU's own Open-task claims are touched — a started/ended task's
 *    items[] is never touched (that portion is locked, per the point above).
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

  // Validate everything up-front (no partial apply) and build each reduction's
  // Open-task drain plan (default/only allocation — no override in this MVP).
  const reductionPlans: { productId: string; sku: string; productName: string; taskReductions: { taskId: string; reduceBy: number; qtyBefore: number }[] }[] = [];
  for (const productId of productIds) {
    const cat = CATALOG.find((c) => c.id === productId);
    const sku = cat?.sku;
    if (!sku) continue;
    const oldQty = oldByProduct.get(productId) ?? 0;
    const newQty = newByProduct.get(productId) ?? 0;
    if (newQty >= oldQty) continue; // add/increase — nothing to allocate
    const N = oldQty - newQty;
    const locked = lockedReceivingQtyForSku(receiptId, sku);
    const removable = oldQty - locked;
    if (N > removable) return { ok: false, reason: "SKU_LOCKED", productId, sku, locked, removable };
    const open = openReceivingLinesForSku(receiptId, sku);
    const openTotal = open.reduce((s, p) => s + p.qty, 0);
    const unassigned = Math.max(0, oldQty - locked - openTotal);
    const R = Math.max(0, N - Math.min(N, unassigned));
    const taskReductions = drainSmallestFirst(open, R).filter((t) => t.reduceBy > 0)
      .map((t) => ({ taskId: t.taskId, reduceBy: t.reduceBy, qtyBefore: t.currentQty }));
    if (taskReductions.length) reductionPlans.push({ productId, sku, productName: cat.name, taskReductions });
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

  // ── Commit ───────────────────────────────────────────────────────────────────
  // Group the before/after snapshot per task (a single edit can touch the same
  // task via more than one SKU) so markReceivingNeedsRearrangement freezes it
  // once with the full "View changes" table, not once per SKU.
  const changesByTask = new Map<string, RearrangementChange[]>();
  for (const plan of reductionPlans) {
    for (const tr of plan.taskReductions) {
      reduceOrderSkuOnReceivingTask(tr.taskId, plan.sku, tr.reduceBy);
      if (getReceivingTask(tr.taskId)?.status === "open") {
        const list = changesByTask.get(tr.taskId) ?? [];
        list.push({ sku: plan.sku, productName: plan.productName, qtyBefore: tr.qtyBefore, qtyAfter: tr.qtyBefore - tr.reduceBy });
        changesByTask.set(tr.taskId, list);
      }
    }
  }
  // A task that survived the reduction (still Open, not auto-cancelled) freezes
  // into Needs Re-arrangement — unconditional here, so it applies the same
  // whether this edit arrived via the WMS surface or the source API.
  for (const [taskId, taskChanges] of changesByTask) markReceivingNeedsRearrangement(taskId, taskChanges);
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
  const myTasks = receivingTasksForReceipt(receiptId);
  // Put-aways referenced by THIS receipt's completed receiving tasks — handled ONCE below
  // (a single put-away can serve several of this receipt's receiving tasks, or be shared
  // with other orders), never once-per-receiving-task.
  const putAwaysToResolve = new Set<string>();

  for (const t of myTasks) {
    if (t.status === "open") { cancelReceivingTask(t.id, cancelReason); continue; }
    if (t.status === "in progress") { flagTaskCanceledPoAck(t.id); continue; }
    if (t.status !== "pending put-away" && t.status !== "completed") continue; // canceled: untouched.

    if (t.status === "completed" && t.putAwayTaskId) {
      const pa = getPutAwayTask(t.putAwayTaskId);
      if (pa && pa.status !== "completed" && pa.status !== "canceled") {
        // A live put-away holds this completed receiving task. Leave the receiving task
        // alone (Completed stays) — the put-away's fate is resolved once, below.
        putAwaysToResolve.add(pa.id);
        continue;
      }
    }
    // Ended task with no live put-away:
    if (t.stockCommitted) {
      flagTaskCanceledPoAck(t.id); // completed WITH committed stock → flag for ack (stock reversal)
    } else if (t.status === "pending put-away") {
      // Received, awaiting put-away, no stock posted → the receiving is DONE; mark it
      // Completed (received work stays, never canceled). No put-away runs (order gone).
      completeReceivingOnPoCancel(t.id);
    } else {
      forceCancelEndedTask(t.id, cancelReason); // legacy "completed" with no put-away link / no stock
    }
  }

  // Resolve each affected put-away exactly once.
  const myTaskIds = new Set(myTasks.map((t) => t.id));
  for (const paId of putAwaysToResolve) {
    const pa = getPutAwayTask(paId);
    if (!pa) continue;
    // SHARED with another still-live order? (a receiving task belonging to a different,
    // not-yet-cancelled receipt). This receipt isn't marked canceled until the end, so
    // "other receipt, not canceled" reliably means a live sibling order.
    const sharedWithLiveOrder = pa.receivingTaskIds.some((rid) => {
      if (myTaskIds.has(rid)) return false;
      const other = getReceivingTask(rid);
      if (!other || other.receiptId === receiptId) return false;
      return receipts.find((r) => r.id === other.receiptId)?.status !== "canceled";
    });
    if (sharedWithLiveOrder) {
      // Drop only THIS order's lines; keep the put-away for the others; flag so the
      // operator acknowledges before Start/Continue (PRD C1 AC#6 shared-task rule).
      removeReceivingTasksFromPutAway(pa.id, pa.receivingTaskIds.filter((rid) => myTaskIds.has(rid)));
      flagPutAwayCanceledPoAck(pa.id);
    } else if (pa.status === "open") {
      // Not shared, not started → auto-cancel outright. Receiving stays completed.
      cancelPutAway(pa.id, cancelReason, { revertReceiving: false });
    } else {
      // Not shared, in progress → flag for ack; ack then cancels it (no live order left).
      flagPutAwayCanceledPoAck(pa.id);
    }
  }

  cancelReceipt(receiptId);
  return { ok: true };
}
