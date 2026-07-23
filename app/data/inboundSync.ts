import { receipts, cancelReceipt, canCancelReceipt } from "./receipts";
import {
  receivingTasksForReceipt, cancelReceivingTask, flagTaskCanceledPoAck, forceCancelEndedTask,
} from "./receivingTasks";
import { getPutAwayTask, flagPutAwayCanceledPoAck } from "./putAwayTasks";

export type CancelInboundResult =
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" | "CANNOT_CANCEL" };

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
      if (pa && pa.status !== "completed" && pa.status !== "canceled") {
        flagPutAwayCanceledPoAck(pa.id); // put-away not finished — flag IT, leave the receiving task alone
        continue;
      }
    }
    if (t.stockCommitted) flagTaskCanceledPoAck(t.id);
    else forceCancelEndedTask(t.id, cancelReason);
  }
  cancelReceipt(receiptId);
  return { ok: true };
}
