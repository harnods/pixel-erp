import { reactive } from "vue";
import { warehouses } from "./warehouses";
import { operatorForWarehouse } from "./warehouseTeam";
import {
  receivingTaskRefsForWarehouse,
  receivingTasksForReceipt,
  getReceivingTask,
  linkPutAway,
  completeReceivingWithoutPutAway,
} from "./receivingTasks";
import { loadSnapshot, saveSnapshot } from "./persist";

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
  completedItems?: Array<{ skuCode: string; qty: number; binLocation: string }>;
  /** Per-SKU batch destination assignments (batch-tracked SKUs), draft or final. */
  batchAssignments?: Record<string, PutAwayBatchAssignment[]>;
  /** Per-SKU serial destination assignments (serial-tracked SKUs), draft or final. */
  serialAssignments?: Record<string, PutAwaySerialAssignment[]>;
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

// ── Seed: one Open put-away per warehouse for its FIRST pending task ──────────────
// That receiving task becomes Completed (state E); any other pending tasks stay
// pending (state D), so both states are demonstrable.
function seedTasks(): PutAwayTask[] {
  const out: PutAwayTask[] = [];
  let seq = 20090;
  PUTAWAY_WAREHOUSES.forEach((wh, p) => {
    const pending = pendingRefs(wh.id);
    if (!pending.length) return;
    const rtasks = pending.slice(0, 1); // 1:1 for the seed; bundling is allowed in-app
    const zone = ZONES[p % ZONES.length]!;
    out.push({
      id: `pa-${p}`,
      taskNo: `Put-away #${seq++}`,
      receivingTaskIds: rtasks.map((r) => r.id),
      receivingTaskNos: rtasks.map((r) => r.no),
      warehouseId: wh.id,
      warehouseName: wh.name,
      assignee: operatorForWarehouse(wh.id, p),
      itemQty: receivedUnits(rtasks.map((r) => r.id)),
      destination: `${zone}-${String((p % 9) + 1).padStart(2, "0")}-${String((p % 5) + 1).padStart(2, "0")}`,
      status: "open",
    });
  });
  return out;
}

const snapshot = loadSnapshot<PutAwayTask>("putaway");
export const putAwayTasks = reactive<PutAwayTask[]>(snapshot ?? seedTasks());

function persistPutAways(): void {
  saveSnapshot("putaway", putAwayTasks);
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

export function savePutAwayDraft(
  taskId: string,
  items: Array<{ skuCode: string; qty: number; binLocation: string }>,
  assignments?: PutAwayAssignments,
): void {
  const t = getPutAwayTask(taskId);
  if (!t) return;
  if (t.status === 'open') { t.status = 'in progress'; t.startDate = nowIso(); }
  t.completedItems = items.filter((it) => it.qty > 0);
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
  t.completedItems = items.filter((it) => it.qty > 0);
  if (assignments?.batchAssignments) t.batchAssignments = assignments.batchAssignments;
  if (assignments?.serialAssignments) t.serialAssignments = assignments.serialAssignments;
  persistPutAways();
}

export function cancelPutAway(taskId: string, reason?: string): void {
  const t = getPutAwayTask(taskId);
  if (!t) return;
  t.status = 'canceled';
  t.canceledDate = nowIso();
  if (reason) t.canceledReason = reason;
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
export function disablePutAwayForWarehouse(warehouseId: string): {
  canceledPutAways: number;
  autoCompletedReceiving: number;
} {
  let canceledPutAways = 0;
  let autoCompletedReceiving = 0;

  for (const t of putAwayTasksFor([warehouseId])) {
    if (t.status !== 'open' && t.status !== 'in progress') continue;
    cancelPutAway(t.id, 'Put-away was turned off for this warehouse.');
    canceledPutAways++;
    for (const id of t.receivingTaskIds) {
      completeReceivingWithoutPutAway(id);
      autoCompletedReceiving++;
    }
  }

  for (const r of receivingTaskRefsForWarehouse(warehouseId)) {
    if (r.status !== 'pending put-away') continue;
    completeReceivingWithoutPutAway(r.id);
    autoCompletedReceiving++;
  }

  return { canceledPutAways, autoCompletedReceiving };
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
