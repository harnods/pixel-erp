import { receipts, cancelReceipt, canCancelReceipt } from "./receipts";
import { receivingTasksForReceipt, cancelReceivingTask, flagTaskCanceledPoAck } from "./receivingTasks";

export type CancelInboundResult =
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" | "CANNOT_CANCEL" };

/**
 * Cancel a PO (receipt) and cascade across its receiving tasks. Unlike Picking
 * (which can bundle several sales orders into one task), a receiving task
 * always belongs to exactly ONE receipt — so canceling a PO invalidates 100%
 * of every task it owns, never just a portion of one:
 *  - open (not started) → canceled outright; nothing to reconcile.
 *  - in progress (started — real receiving work may already exist) → NOT
 *    auto-canceled immediately. Flagged (flagTaskCanceledPoAck) so Continue
 *    receiving is blocked until the operator explicitly acknowledges the PO
 *    is gone — acknowledging (acknowledgeCanceledReceipt in
 *    receivingTasks.ts) then cancels the task too, since there's nothing left
 *    to receive once its one PO is gone; whatever receivedQty already exists
 *    stays on the record for the audit trail.
 *  - pending put-away / completed (already ended) → untouched; those goods
 *    are already real and accounted for, regardless of the PO's fate.
 * Lives above receipts/receivingTasks to avoid a load-time circular import
 * (receivingTasks.ts already imports from receipts.ts) — mirrors
 * cancelOutboundOrder() in outboundSync.ts.
 */
export function cancelInboundReceipt(receiptId: string, reason?: string): CancelInboundResult {
  const r = receipts.find((x) => x.id === receiptId);
  if (!r) return { ok: false, reason: "NOT_FOUND" };
  if (!canCancelReceipt(r)) return { ok: false, reason: "CANNOT_CANCEL" };

  for (const t of receivingTasksForReceipt(receiptId)) {
    if (t.status === "open") {
      cancelReceivingTask(t.id, reason ?? "Purchase order was canceled");
    } else if (t.status === "in progress") {
      flagTaskCanceledPoAck(t.id);
    }
    // pending put-away / completed / canceled: untouched.
  }
  cancelReceipt(receiptId);
  return { ok: true };
}
