import { reactive } from "vue";
import { warehouses } from "./warehouses";
import { operatorForWarehouse } from "./warehouseTeam";
import { receipts } from "./receipts";
import {
  receivingTaskRefsForWarehouse,
  receivingTasksForReceipt,
  getReceivingTask,
  linkPutAway,
  revertPutAwayLink,
  completeReceivingWithoutPutAway,
} from "./receivingTasks";
import { loadSnapshot, saveSnapshot } from "./persist";
import { getWarehouseDetail, registerNewBatch, receiveNewSerials, applyStockInOut } from "./warehouseDetails";
import { markStockCommitted } from "./receivingTasks";

/**
 * A put-away task — once goods are received they must be moved from the receiving
 * dock into storage (bin) locations. One task can bundle one or more receiving
 * tasks whose status is "pending put-away"; creating it marks those receiving
 * tasks "completed". Operator Start/End put-away is out of scope for now, so a
 * created put-away stays "open". See docs/scenarios/inbound-complete-scenario.md.
 */
/** One batch's destination bin split, as assigned via Manage batch during put-away. */
export interface PutAwayBatchAssignment {
  batchNo: string;
  expiryDate: string;
  desc: string;
  qty: number;
  unit: string;
  destLocations?: Array<{ locationId: string; qty: number }>;
}

/** One serial's destination bin, as assigned via Manage serial number during put-away. */
export interface PutAwaySerialAssignment {
  serial: string;
  destLocationId?: string;
}

export interface PutAwayTask {
  id: string;
  taskNo: string;
  receivingTaskIds: string[];
  receivingTaskNos: string[];
  warehouseId: string;
  warehouseName: string;
  assignee: string;
  itemQty: number;
  destination: string;
  status: "open" | "in progress" | "completed" | "canceled";
  startDate?: string;
  endDate?: string;
  /** ISO timestamp — set when auto-canceled by disabling Put-away for the warehouse. */
  canceledDate?: string;
  /** Why this task was canceled — shown on the task detail page. */
  canceledReason?: string;
  /** Who canceled it. */
  canceledBy?: string;
  /** A SKU shared by 2+ bundled receiving tasks is ONE merged entry (qty
   *  summed) — put-away doesn't track which specific receiving task a unit
   *  came from, only which bin it ends up in. */
  completedItems?: Array<{ skuCode: string; qty: number; binLocation: string }>;
  /** Per-SKU batch destination assignments (batch-tracked SKUs), draft or final. */
  batchAssignments?: Record<string, PutAwayBatchAssignment[]>;
  /** Per-SKU serial destination assignments (serial-tracked SKUs), draft or final. */
  serialAssignments?: Record<string, PutAwaySerialAssignment[]>;
  /** This task's source receiving task's OWN PO was canceled while this
   *  put-away was still open/in progress — endPutAway (the only thing that
   *  commits real stock) never ran, so nothing needs reversing. Blocks
   *  Start/Continue put-away until the operator explicitly acknowledges (see
   *  acknowledgeCanceledPutAway below), which cancels this task AND its
   *  linked receiving task(s) too — nothing left to put away once the PO is
   *  gone. Never set once this task is already "completed" (see
   *  cancelInboundReceipt in inboundSync.ts — a completed put-away's
   *  receiving task gets flagged directly instead, since real stock exists). */
  needsCancelAck?: boolean;
}

const ZONES = ["A", "B", "C", "D"];

const PUTAWAY_WAREHOUSES = warehouses.filter(
  (w) => !w.isDefault && w.status === "active",
);

/** Pending-put-away receiving tasks for a warehouse (eligible to be put away). */
function pendingRefs(warehouseId: string): Array<{ id: string; no: string }> {
  return receivingTaskRefsForWarehouse(warehouseId)
    .filter((t) => t.status === "pending put-away")
    .map((t) => ({ id: t.id, no: t.no }));
}

function receivedUnits(taskIds: string[]): number {
  return taskIds.reduce((sum, id) => sum + (getReceivingTask(id)?.receivedQty ?? 0), 0);
}

// Put-away timestamps: it happens shortly after receiving finished and takes
// 20 min–3 h. Derived from the receiving task's endDate so put-away durations are
// real (and spread across the same window), giving the Overview a real average.
function putAwayDates(recvEndIso: string, h: number): { start: string; end: string } {
  const p2 = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:00`;
  const start = new Date(recvEndIso);
  start.setHours(start.getHours() + 1 + (h % 5)); // 1–5 h after receiving finished
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + 20 + ((h * 7) % 160)); // 20–180 min to put away
  return { start: fmt(start), end: fmt(end) };
}
function hashStr(s: string): number {
  return s.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
}

// ── Seed: a put-away per received task. Most are Completed (with real start/end
// timestamps); the first per warehouse stays Open so both states are demonstrable.
function seedTasks(): PutAwayTask[] {
  const out: PutAwayTask[] = [];
  let seq = 20090;
  PUTAWAY_WAREHOUSES.forEach((wh, p) => {
    const pending = pendingRefs(wh.id);
    if (!pending.length) return;
    const zone = ZONES[p % ZONES.length]!;
    pending.forEach((ref, idx) => {
      const h = hashStr(ref.id) + idx;
      const recvEnd = getReceivingTask(ref.id)?.endDate;
      // Keep the first task per warehouse Open (demo); complete the rest.
      const done = idx > 0 && !!recvEnd;
      const dates = done ? putAwayDates(recvEnd!, h) : undefined;
      out.push({
        id: `pa-${p}-${idx}`,
        taskNo: `Put-away #${seq++}`,
        receivingTaskIds: [ref.id],
        receivingTaskNos: [ref.no],
        warehouseId: wh.id,
        warehouseName: wh.name,
        assignee: operatorForWarehouse(wh.id, p + idx),
        itemQty: receivedUnits([ref.id]),
        destination: `${zone}-${String(((p + idx) % 9) + 1).padStart(2, "0")}-${String(((p + idx) % 5) + 1).padStart(2, "0")}`,
        status: done ? "completed" : "open",
        startDate: dates?.start,
        endDate: dates?.end,
      });
    });
  });
  return out;
}

const snapshot = loadSnapshot<PutAwayTask>("putaway-v4");
export const putAwayTasks = reactive<PutAwayTask[]>(snapshot ?? seedTasks());

function persistPutAways(): void {
  saveSnapshot("putaway-v4", putAwayTasks);
}

// On first load, mark each seed put-away's receiving task(s) Completed.
if (!snapshot) {
  for (const pa of putAwayTasks) for (const id of pa.receivingTaskIds) linkPutAway(id, pa.id);
  persistPutAways();
}

let nextSeq = 20090 + putAwayTasks.length;
function freshSeq(): number {
  const used = putAwayTasks.map((t) => Number(t.taskNo.replace(/\D/g, ""))).filter(Number.isFinite);
  nextSeq = Math.max(nextSeq, ...used, 20089) + 1;
  return nextSeq;
}

/**
 * Create a put-away task from one or more pending-put-away receiving tasks.
 * Newly created → "open"; each source receiving task becomes "completed".
 */
export function addPutAwayTask(opts: {
  receivingTaskIds: string[];
  receivingTaskNos: string[];
  warehouseId: string;
  warehouseName: string;
  assignee: string;
  itemQty?: number;
}): PutAwayTask {
  const seq = freshSeq();
  const task: PutAwayTask = {
    id: `pa-new-${seq}`,
    taskNo: `Put-away #${seq}`,
    receivingTaskIds: opts.receivingTaskIds,
    receivingTaskNos: opts.receivingTaskNos,
    warehouseId: opts.warehouseId,
    warehouseName: opts.warehouseName,
    assignee: opts.assignee,
    itemQty: opts.itemQty ?? receivedUnits(opts.receivingTaskIds),
    destination: "Unassigned",
    status: "open",
  };
  putAwayTasks.unshift(task);
  // Write-back: the source receiving tasks are now consumed → Completed.
  for (const id of opts.receivingTaskIds) linkPutAway(id, task.id);
  persistPutAways();
  return task;
}

/** Put-away tasks scoped to warehouses (all when none given). */
export function putAwayTasksFor(warehouseIds?: string[]): PutAwayTask[] {
  return warehouseIds?.length
    ? putAwayTasks.filter((t) => warehouseIds.includes(t.warehouseId))
    : putAwayTasks;
}

/** Badge count for the Put-away stage = unfinished put-away tasks (scoped). */
export function putAwayOpenCount(warehouseIds?: string[]): number {
  return putAwayTasksFor(warehouseIds).filter(
    (t) => t.status !== "completed" && t.status !== "canceled",
  ).length;
}

/** Put-away task(s) for a receipt — only those consuming THIS receipt's receiving tasks. */
export function getPutAwayForReceipt(orderId: string): PutAwayTask[] {
  const taskIds = new Set(receivingTasksForReceipt(orderId).map((t) => t.id));
  if (!taskIds.size) return [];
  return putAwayTasks.filter((pa) => pa.receivingTaskIds.some((id) => taskIds.has(id)));
}

export function getPutAwayTask(taskId: string): PutAwayTask | undefined {
  return putAwayTasks.find((t) => t.id === taskId);
}

function nowIso(): string { return new Date().toISOString(); }

/** Hand this task to someone else — the escape hatch for a task still held by
 *  someone who has lost access to the company. Only while the task is Open or
 *  In Progress: past that the assignee is a record of who did the work, not who
 *  owes it. Access is gated in the UI (useLineManagerAccess); this only refuses
 *  states where a handover would be meaningless. */
export function reassignPutAwayTask(taskId: string, assignee: string): boolean {
  const t = getPutAwayTask(taskId);
  if (!t || (t.status !== "open" && t.status !== "in progress")) return false;
  if (!assignee.trim() || assignee === t.assignee) return false;
  t.assignee = assignee;
  persistPutAways();
  return true;
}

export function startPutAway(taskId: string): void {
  const t = getPutAwayTask(taskId);
  if (!t || t.status !== 'open') return;
  t.status = 'in progress';
  t.startDate = nowIso();
  persistPutAways();
}

export interface PutAwayAssignments {
  batchAssignments?: Record<string, PutAwayBatchAssignment[]>;
  serialAssignments?: Record<string, PutAwaySerialAssignment[]>;
}

/** completedItems must keep at least one row per SKU, even at qty=0 — a
 *  genuinely untouched SKU (nothing entered yet) still has to exist, not
 *  vanish from the task entirely. A blanket `qty > 0` filter here was meant to
 *  drop an ABANDONED extra "Split storage location" row (the operator split a
 *  plain SKU's row then never filled the new one in), but it applied just as
 *  well to a row that was never touched in the first place — only drop a
 *  qty=0 row when a sibling for the SAME SKU already carries the real qty,
 *  proving this specific row really is the abandoned extra one. */
function dropAbandonedZeroRows<T extends { skuCode: string; qty: number }>(items: T[]): T[] {
  const hasPositive = new Set<string>();
  for (const it of items) {
    if (it.qty > 0) hasPositive.add(it.skuCode);
  }
  return items.filter((it) => it.qty > 0 || !hasPositive.has(it.skuCode));
}

export function savePutAwayDraft(
  taskId: string,
  items: Array<{ skuCode: string; qty: number; binLocation: string }>,
  assignments?: PutAwayAssignments,
): void {
  const t = getPutAwayTask(taskId);
  if (!t) return;
  if (t.status === 'open') { t.status = 'in progress'; t.startDate = nowIso(); }
  t.completedItems = dropAbandonedZeroRows(items);
  if (assignments?.batchAssignments) t.batchAssignments = assignments.batchAssignments;
  if (assignments?.serialAssignments) t.serialAssignments = assignments.serialAssignments;
  persistPutAways();
}

export function endPutAway(
  taskId: string,
  items: Array<{ skuCode: string; qty: number; binLocation: string }>,
  assignments?: PutAwayAssignments,
): void {
  const t = getPutAwayTask(taskId);
  if (!t) return;
  t.status = 'completed';
  t.endDate = nowIso();
  t.completedItems = dropAbandonedZeroRows(items);
  if (assignments?.batchAssignments) t.batchAssignments = assignments.batchAssignments;
  if (assignments?.serialAssignments) t.serialAssignments = assignments.serialAssignments;

  // Commit the received stock into the warehouse — same "apply on End, not on
  // Save draft" convention endPicking() uses for reservations/new batches.
  const wh = getWarehouseDetail(t.warehouseId);
  for (const it of t.completedItems) {
    const batchLines = assignments?.batchAssignments?.[it.skuCode];
    const serialLines = assignments?.serialAssignments?.[it.skuCode];
    if (batchLines?.length) {
      const known = new Set(wh?.stock.find((s) => s.sku === it.skuCode)?.batches?.map((b) => b.batchNo));
      for (const b of batchLines) {
        if (known.has(b.batchNo)) continue; // already-registered batch — no re-add
        const dest = b.destLocations ?? [];
        const qty = dest.length ? dest.reduce((s, d) => s + d.qty, 0) : b.qty;
        const location = dest[0]?.locationId ?? it.binLocation;
        registerNewBatch(t.warehouseId, it.skuCode, { batchNo: b.batchNo, expiryDate: b.expiryDate, onHand: qty, location });
        known.add(b.batchNo);
      }
    } else if (serialLines?.length) {
      receiveNewSerials(t.warehouseId, it.skuCode, serialLines.map((s) => s.serial));
    } else {
      applyStockInOut(t.warehouseId, [{ sku: it.skuCode, qty: it.qty }]);
    }
  }
  persistPutAways();
  markStockCommitted(t.receivingTaskIds);
}

/** A put-away task can only be canceled while not yet completed — endPutAway()
 *  is what actually commits stock to its final bin/batch/serial location, so a
 *  completed task has already taken real effect and must stay a permanent record. */
export function canCancelPutAway(t: PutAwayTask): boolean {
  return t.status === 'open' || t.status === 'in progress';
}

/** Whether the receipt (Inbound parent) behind a receiving task has been cancelled. */
function receiptIsCanceled(receiptId: string | undefined): boolean {
  return !!receiptId && receipts.find((r) => r.id === receiptId)?.status === "canceled";
}

/** Does this put-away still serve at least one LIVE (non-cancelled) order? */
function putAwayHasLiveOrder(t: PutAwayTask): boolean {
  return t.receivingTaskIds.some((rid) => {
    const rt = getReceivingTask(rid);
    return rt && !receiptIsCanceled(rt.receiptId);
  });
}

/**
 * A SHARED put-away just had one of its Inbounds cancelled — drop that Inbound's receiving
 * task(s) so the task proceeds with the remaining orders' lines (WMS PRD 1.1 C1 AC#6:
 * "the other Inbounds sharing the putaway task are never affected"). Recomputes itemQty.
 */
export function removeReceivingTasksFromPutAway(putAwayId: string, taskIds: string[]): void {
  const t = getPutAwayTask(putAwayId);
  if (!t) return;
  const drop = new Set(taskIds);
  const pairs = t.receivingTaskIds.map((id, i) => ({ id, no: t.receivingTaskNos[i]! }));
  const kept = pairs.filter((p) => !drop.has(p.id));
  if (kept.length === t.receivingTaskIds.length) return; // nothing to remove
  t.receivingTaskIds = kept.map((p) => p.id);
  t.receivingTaskNos = kept.map((p) => p.no);
  t.itemQty = receivedUnits(t.receivingTaskIds);
  persistPutAways();
}

export function cancelPutAway(
  taskId: string,
  reason?: string,
  opts?: { revertReceiving?: boolean },
): void {
  const t = getPutAwayTask(taskId);
  if (!t || !canCancelPutAway(t)) return;
  t.status = 'canceled';
  t.canceledDate = nowIso();
  t.canceledBy = "Rizal Candra";
  if (reason) t.canceledReason = reason;
  // Manual cancel (PO still live): send each source receiving task back to "pending
  // put-away" so the operator can create a fresh put-away. PO-cancel cascade passes
  // revertReceiving:false — the order is gone, so a completed receiving stays completed.
  if (opts?.revertReceiving !== false) {
    for (const rid of t.receivingTaskIds) revertPutAwayLink(rid, t.id);
  }
  persistPutAways();
}

/**
 * This task's source receiving task's own PO was just canceled while the
 * put-away was still open/in progress — called only from cancelInboundReceipt
 * (inboundSync.ts). Since endPutAway (the only thing that commits real stock)
 * never ran, there's nothing to reconcile — but real work (Start/Continue put-
 * away) may already be underway, so it isn't silently auto-canceled. Blocks
 * Start/Continue put-away until the operator explicitly acknowledges.
 */
export function flagPutAwayCanceledPoAck(taskId: string): void {
  const t = getPutAwayTask(taskId);
  if (!t) return;
  t.needsCancelAck = true;
  persistPutAways();
}

/**
 * Operator acknowledges that this put-away's source PO was canceled. Cancels ONLY the
 * put-away itself. Its linked receiving task(s) already reached "completed" (real
 * receiving work happened) — a done task is a permanent record and MUST stay completed,
 * never flip to canceled just because the PO was voided. No stock reversal needed:
 * endPutAway never ran for this task, so nothing was ever committed. No-op if unflagged.
 */
export function acknowledgeCanceledPutAway(taskId: string): void {
  const t = getPutAwayTask(taskId);
  if (!t || !t.needsCancelAck) return;
  t.needsCancelAck = false;
  // SHARED put-away: the cancelled order's receiving lines were already dropped at cancel
  // time, and other live orders remain → keep the task running (do NOT cancel it). The
  // operator can Start/Continue put-away for the surviving orders (PRD C1 AC#6).
  if (putAwayHasLiveOrder(t)) {
    persistPutAways();
    return;
  }
  // No live order left → cancel the whole put-away. Its source receiving task(s) stay
  // "completed" (done work is never reverted); the canceled put-away remains in their
  // linked transactions as an audit record.
  t.status = 'canceled';
  t.canceledDate = nowIso();
  t.canceledBy = "Rizal Candra";
  t.canceledReason = 'Purchase order was canceled';
  persistPutAways();
}

/**
 * Put-away just got disabled for this warehouse (see ConfigureWarehousePage.vue):
 * - open/in-progress put-away tasks are voided — canceled, and their source
 *   receiving task(s) are finished directly (the goods were received; there's just
 *   no put-away step anymore). Already-`completed` put-away tasks are untouched.
 * - receiving tasks already sitting in "pending put-away" with no put-away task at
 *   all yet are also finished directly.
 * Returns counts so the caller can summarize the effect before committing.
 */
export function disablePutAwayForWarehouse(_warehouseId: string): {
  canceledPutAways: number;
  autoCompletedReceiving: number;
} {
  // Existing in-progress and pending put-away tasks are left untouched —
  // users must be able to finish work already underway. Only new receiving
  // tasks created after this config change will skip the put-away step.
  return { canceledPutAways: 0, autoCompletedReceiving: 0 };
}

const PUTAWAY_ACTIVE: PutAwayTask["status"][] = ["open", "in progress"];

export function activePutAwayTasksFor(warehouseId: string, assignee: string): PutAwayTask[] {
  return putAwayTasks.filter(
    (t) => t.warehouseId === warehouseId && t.assignee === assignee && (PUTAWAY_ACTIVE as string[]).includes(t.status),
  );
}

export function reassignPutAwayTasks(warehouseId: string, fromName: string, toName: string): void {
  for (const t of activePutAwayTasksFor(warehouseId, fromName)) t.assignee = toName;
  persistPutAways();
}

/** Read-only preview of disablePutAwayForWarehouse's effect, for the confirmation dialog. */
export function previewDisablePutAway(warehouseId: string): {
  openPutAways: number;
  pendingReceiving: number;
} {
  const openPutAways = putAwayTasksFor([warehouseId]).filter(
    (t) => t.status === 'open' || t.status === 'in progress',
  ).length;
  const pendingReceiving = receivingTaskRefsForWarehouse(warehouseId).filter(
    (r) => r.status === 'pending put-away',
  ).length;
  return { openPutAways, pendingReceiving };
}
