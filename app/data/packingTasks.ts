import { reactive } from "vue";
import { operatorForWarehouse } from "./warehouseTeam";
import { outgoingOrders, type OutgoingOrder } from "./outgoing";
import {
  pickingTasks, pickingLinesOf, getPickingTask,
  pickedQtyForPickingTasks, batchPicksForPickingTasks, serialPicksForPickingTasks,
  type PickingTask, type PickingBatchPick, type PickingSerialPick,
} from "./pickingTasks";
import { orderSkuLines, type OrderSkuLine } from "./inventory";
import { binForSku } from "./warehouseDetails";
import { TODAY } from "./master";
import { loadSnapshot, saveSnapshot } from "./persist";
import { getWarehouseConfig } from "./warehouseConfig";

/**
 * A packing task — created once a picking task is COMPLETED. Picking can bundle
 * several sales orders (and the same SKU across orders), so packing is the SORT /
 * MATCH step: the picked goods are matched back to a single sales order and boxed.
 * One packing task = one sales order. (open → in progress → completed, timestamps.)
 */
export interface PackingTask {
  id: string;
  taskNo: string;
  /** the single sales order this packing task is for */
  salesOrderId: string;
  salesNo: string;
  /** the primary picking task this was created from (first contributing list) —
   *  absent when created directly from the order (Picking disabled for the warehouse). */
  pickingTaskId?: string;
  pickingTaskNo?: string;
  /** ALL picking lists that picked this order (an order can be split over several) */
  pickingTaskIds?: string[];
  pickingTaskNos?: string[];
  warehouseId: string;
  warehouseName: string;
  assignee: string;
  /** distinct SKU lines to pack for this order */
  skuQty: number;
  /** units available to pack = what was picked for this order */
  toPackQty: number;
  /** units actually packed so far (0 ≤ packedQty ≤ toPackQty) */
  packedQty: number;
  status: "open" | "in progress" | "completed" | "canceled";
  startDate?: string;
  endDate?: string;
  /** ISO timestamp — set when the task is canceled. */
  canceledDate?: string;
  /** Why this task was canceled — shown on the task detail page. */
  canceledReason?: string;
  /** Who canceled it. */
  canceledBy?: string;
  /** packed qty per line key (set as the operator matches/sorts) */
  packedByKey?: Record<string, number>;
  /** Direct-mode only (no pickingTaskId) — the specific SKU+qty this task covers,
   *  fixed at creation. SKUs excluded here stay eligible for a follow-up packing
   *  task on the same order (see remainingSkusForOrder / canCreatePackingDirectlyForOrder). */
  directLines?: Array<{ sku: string; qty: number }>;
}

/** A SKU line for packing, sourced from what was picked for this order. */
export interface PackedSourceLine {
  key: string;
  sku: string;
  product: string;
  desc: string;
  img: string;
  unit: string;
  bin: string;
  picked: number; // available to pack (what picking delivered for this order)
  /** Batch-tracked SKUs only — which batch(es) the picked units came from. */
  batchPicks?: PickingBatchPick[];
  /** Serial-tracked SKUs only — which serial(s) were picked. */
  serialPicks?: PickingSerialPick[];
}

/**
 * The picked lines belonging to a packing task's sales order. When the task has
 * no picking task at all (Picking disabled for its warehouse — see
 * addPackingTaskFromOrder), there's nothing "picked" to read — pack this task's
 * own chosen SKU+qty (directLines) instead, falling back to the order's full SKU
 * demand for older direct-mode tasks created before directLines existed.
 */
export function pickedLinesForPacking(task: PackingTask): PackedSourceLine[] {
  const order = outgoingOrders.find((o) => o.id === task.salesOrderId);
  if (!order) return [];
  const skippedPicking = !task.pickingTaskId;
  const directQtyBySku = skippedPicking && task.directLines
    ? new Map(task.directLines.map((l) => [l.sku, l.qty]))
    : null;
  // Scoped to THIS task's own linked picking list(s) only — never every picking
  // task the order has ever had. An order can go through more than one independent
  // picking→packing→shipment cycle (partially shipped, then picked again for the
  // remainder); reading order-wide would double-count an earlier, unrelated
  // cycle's already-packed-and-shipped units into this task's own figures.
  const pickingIds = task.pickingTaskIds ?? (task.pickingTaskId ? [task.pickingTaskId] : []);
  const lines: PackedSourceLine[] = [];
  for (const l of orderSkuLines(order)) {
    let picked: number;
    if (directQtyBySku) {
      if (!directQtyBySku.has(l.sku)) continue; // excluded from this task — available for a follow-up
      picked = directQtyBySku.get(l.sku)!;
    } else {
      // Read the TOTAL picked across every picking list LINKED TO THIS TASK (an
      // order split over 2 lists that both feed this same packing task still packs
      // as one), not just the primary one — so match-order shows the full qty.
      picked = skippedPicking ? l.qty : pickedQtyForPickingTasks(pickingIds, task.salesOrderId, l.sku);
    }
    if (picked <= 0) continue; // only what's actually available to pack
    const batchPicks = skippedPicking ? [] : batchPicksForPickingTasks(pickingIds, task.salesOrderId, l.sku);
    const serialPicks = skippedPicking ? [] : serialPicksForPickingTasks(pickingIds, task.salesOrderId, l.sku);
    lines.push({
      key: `${task.salesOrderId}::${l.sku}`,
      sku: l.sku, product: l.product.name, desc: l.product.desc, img: l.product.img,
      unit: l.product.unit, bin: binForSku(order.warehouseId, l.sku), picked,
      ...(batchPicks.length ? { batchPicks } : {}),
      ...(serialPicks.length ? { serialPicks } : {}),
    });
  }
  return lines;
}

// Stage status assigned to a seed task — mostly Open, some In progress / Completed,
// the occasional Canceled, so all states are demonstrable (deterministic).
const SEED_STATUSES: PackingTask["status"][] = [
  "open", "in progress", "open", "completed", "in progress", "completed", "canceled", "open",
];
const PACK_FRACTIONS = [0.4, 0.6, 0.3, 0.7, 0.5];

function isoAt(dayOffset: number, hour: number, minute: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + dayOffset);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(hour)}:${p(minute)}:00`;
}

// ── Seed: one packing task per sales order in every COMPLETED picking task ────────
function seedTasks(): PackingTask[] {
  const out: PackingTask[] = [];
  let seq = 40090;
  let idx = 0;
  // Curated demo picking lists (pick-demo-*) AND anything the operator creates live
  // (pick-new-*) are left UN-packed on purpose so the "Create packing" flow is
  // demoable and its business rules (e.g. marketplace must be fully picked across
  // ALL its lists) stay in charge — this naive per-task seed doesn't know about
  // them. Only the pre-shipped chain seeds packing here.
  for (const pick of pickingTasks.filter((t) => t.status === "completed" && !t.id.startsWith("pick-sh-") && !t.id.startsWith("pick-demo-") && !t.id.startsWith("pick-new-"))) {
    pick.salesOrderIds.forEach((orderId, j) => {
      const order = outgoingOrders.find((o) => o.id === orderId);
      if (!order) return;
      // Lines + picked qty for THIS order (only the picked goods flow into packing).
      const lines = pickingLinesOf(pick).filter((l) => l.orderId === orderId)
        .map((l) => ({ key: l.key, picked: pick.pickedByKey?.[l.key] ?? 0 }));
      const toPackQty = lines.reduce((s, l) => s + l.picked, 0);
      if (toPackQty <= 0) return; // nothing picked for this order → no packing
      const status = SEED_STATUSES[idx % SEED_STATUSES.length]!;
      const frac = status === "completed" ? 1 : status === "in progress" ? PACK_FRACTIONS[idx % PACK_FRACTIONS.length]! : 0;
      let packedByKey: Record<string, number> | undefined;
      let packedQty = 0;
      if (status === "in progress" || status === "completed") {
        packedByKey = {};
        for (const l of lines) {
          const q = Math.min(l.picked, Math.max(0, Math.round(l.picked * frac)));
          packedByKey[l.key] = q;
          packedQty += q;
        }
      }
      const dayOffset = -(((idx) * 2) % 10);
      out.push({
        id: `pack-${seq}`,
        taskNo: `Packing #${seq++}`,
        salesOrderId: orderId,
        salesNo: pick.salesNos[j] ?? order.salesNo,
        pickingTaskId: pick.id,
        pickingTaskNo: pick.taskNo,
        warehouseId: pick.warehouseId,
        warehouseName: pick.warehouseName,
        assignee: operatorForWarehouse(pick.warehouseId, idx),
        skuQty: lines.length,
        toPackQty,
        packedQty,
        status,
        startDate: status === "open" || status === "canceled" ? undefined : isoAt(dayOffset, 9, 0),
        endDate: status === "completed" ? isoAt(dayOffset, 10, 30) : undefined,
        packedByKey,
      });
      idx++;
    });
  }
  out.push(...seedShippedPacks(seq));
  return out;
}

// ── Seed: a COMPLETED packing task per pre-shipped order's completed picking. Packs
// everything that was picked (full for completed orders, short for partial ones). ──
function seedShippedPacks(startSeq: number): PackingTask[] {
  const out: PackingTask[] = [];
  let seq = startSeq;
  const shippedPicks = pickingTasks.filter((t) => t.id.startsWith("pick-sh-"));
  shippedPicks.forEach((pick, k) => {
    const orderId = pick.salesOrderIds[0]!;
    const order = outgoingOrders.find((o) => o.id === orderId);
    if (!order) return;
    const lines = pickingLinesOf(pick).filter((l) => l.orderId === orderId)
      .map((l) => ({ key: l.key, picked: pick.pickedByKey?.[l.key] ?? 0 }));
    const toPackQty = lines.reduce((s, l) => s + l.picked, 0);
    if (toPackQty <= 0) return;
    const packedByKey: Record<string, number> = {};
    for (const l of lines) packedByKey[l.key] = l.picked; // pack all that was picked
    const dayOffset = -((k % 12) + 1);
    out.push({
      id: `pack-sh-${String(k + 1).padStart(3, "0")}`,
      taskNo: `Packing #${seq++}`,
      salesOrderId: orderId,
      salesNo: order.salesNo,
      pickingTaskId: pick.id,
      pickingTaskNo: pick.taskNo,
      warehouseId: pick.warehouseId,
      warehouseName: pick.warehouseName,
      assignee: operatorForWarehouse(pick.warehouseId, k),
      skuQty: lines.length,
      toPackQty,
      packedQty: toPackQty,
      status: "completed",
      startDate: isoAt(dayOffset, 9, 0),
      endDate: isoAt(dayOffset, 10, 30),
      packedByKey,
    });
  });
  return out;
}

const snapshot = loadSnapshot<PackingTask>("packing");
export const packingTasks = reactive<PackingTask[]>(snapshot ?? seedTasks());

function persistPacking(): void {
  saveSnapshot("packing", packingTasks);
}

// Freeze the freshly-generated seed on first client load — the packing seed derives
// from the (mutable) completed picking tasks, so a reload with no snapshot yet could
// re-derive it against a changed picking set. Persisting immediately keeps it stable.
if (!snapshot) persistPacking();

let nextSeq = 40090 + packingTasks.length;
function freshSeq(): number {
  const used = packingTasks.map((t) => Number(t.taskNo.replace(/\D/g, ""))).filter(Number.isFinite);
  nextSeq = Math.max(nextSeq, ...used, 40089) + 1;
  return nextSeq;
}

/**
 * Create a packing task for a single sales order (from a completed picking task).
 * toPackQty defaults to what was picked for that order. Newly created → "open".
 */
export function addPackingTask(opts: {
  salesOrderId: string;
  salesNo: string;
  pickingTaskId: string;
  pickingTaskNo: string;
  /** all picking lists that picked this order (defaults to just the primary one) */
  pickingTaskIds?: string[];
  pickingTaskNos?: string[];
  warehouseId: string;
  warehouseName: string;
  assignee: string;
  skuQty?: number;
  toPackQty?: number;
}): PackingTask {
  const seq = freshSeq();
  const pick = getPickingTask(opts.pickingTaskId);
  const lines = pick
    ? pickingLinesOf(pick).filter((l) => l.orderId === opts.salesOrderId)
    : [];
  const pickedTotal = lines.reduce((s, l) => s + (pick?.pickedByKey?.[l.key] ?? 0), 0);
  const order = outgoingOrders.find((o) => o.id === opts.salesOrderId);
  const task: PackingTask = {
    id: `pack-new-${seq}`,
    taskNo: `Packing #${seq}`,
    salesOrderId: opts.salesOrderId,
    salesNo: opts.salesNo,
    pickingTaskId: opts.pickingTaskId,
    pickingTaskNo: opts.pickingTaskNo,
    pickingTaskIds: opts.pickingTaskIds ?? [opts.pickingTaskId],
    pickingTaskNos: opts.pickingTaskNos ?? [opts.pickingTaskNo],
    warehouseId: opts.warehouseId,
    warehouseName: opts.warehouseName,
    assignee: opts.assignee,
    skuQty: opts.skuQty ?? lines.length ?? order?.skuQty ?? 0,
    toPackQty: opts.toPackQty ?? (pickedTotal || order?.orderQty || 0),
    packedQty: 0, // newly created → nothing packed yet
    status: "open",
  };
  packingTasks.unshift(task);
  persistPacking();
  return task;
}

/**
 * Create a packing task DIRECTLY from an outbound order — used when Picking is
 * disabled for the order's warehouse, so there's no picking task to pull SKU
 * lines/qty from. Packs the order's full SKU demand. Newly created → "open".
 */
export function addPackingTaskFromOrder(opts: {
  salesOrderId: string;
  salesNo: string;
  warehouseId: string;
  warehouseName: string;
  assignee: string;
  /** Which SKUs to cover (and their qty). Omit to cover the order's full demand
   *  (e.g. the marketplace all-or-nothing modal). Pass a subset — e.g. from
   *  remainingSkusForOrder() minus whatever the user excluded — to leave the rest
   *  eligible for a follow-up packing task. */
  lines?: Array<{ sku: string; qty: number }>;
}): PackingTask {
  const seq = freshSeq();
  const order = outgoingOrders.find((o) => o.id === opts.salesOrderId);
  const lines = opts.lines ?? (order ? orderSkuLines(order) : []);
  const task: PackingTask = {
    id: `pack-new-${seq}`,
    taskNo: `Packing #${seq}`,
    salesOrderId: opts.salesOrderId,
    salesNo: opts.salesNo,
    warehouseId: opts.warehouseId,
    warehouseName: opts.warehouseName,
    assignee: opts.assignee,
    skuQty: lines.length || order?.skuQty || 0,
    toPackQty: lines.reduce((s, l) => s + l.qty, 0) || order?.orderQty || 0,
    packedQty: 0,
    status: "open",
    directLines: lines.map((l) => ({ sku: l.sku, qty: l.qty })),
  };
  packingTasks.unshift(task);
  persistPacking();
  return task;
}

export interface RemainingSkuLine {
  sku: string;
  product: OrderSkuLine["product"];
  /** Full order demand for this SKU. */
  qty: number;
  /** Already packed for this SKU by an earlier non-canceled direct-mode packing task. */
  packed: number;
}

/**
 * The order's SKU lines not yet fully packed by non-canceled direct-mode (no
 * pickingTaskId) packing tasks — what's left to pack, and how much of each SKU's
 * demand is already spoken for (a prior task may have packed only PART of a SKU's
 * qty, same as partial picking). For orders with no prior direct-mode packing task,
 * every line comes back with packed = 0.
 */
export function remainingSkusForOrder(order: OutgoingOrder): RemainingSkuLine[] {
  const packedBySku = new Map<string, number>();
  for (const t of packingTasks) {
    if (t.salesOrderId !== order.id || t.pickingTaskId || t.status === "canceled") continue;
    for (const l of t.directLines ?? []) packedBySku.set(l.sku, (packedBySku.get(l.sku) ?? 0) + l.qty);
  }
  return orderSkuLines(order)
    .map((l) => ({ sku: l.sku, product: l.product, qty: l.qty, packed: packedBySku.get(l.sku) ?? 0 }))
    .filter((l) => l.qty - l.packed > 0);
}

/**
 * Can a packing task be created straight from this order, with no picking task at
 * all? Only relevant when Picking is disabled for the order's warehouse, the order
 * is still open/in-process, and it still has SKUs not yet covered by an earlier
 * direct-mode packing task (so a follow-up packing task remains possible after a
 * partial one).
 */
export function canCreatePackingDirectlyForOrder(order: OutgoingOrder): boolean {
  if (getWarehouseConfig(order.warehouseId).pickingEnabled) return false;
  if (order.status !== "pending" && order.status !== "open" && order.status !== "in progress") return false;
  return remainingSkusForOrder(order).length > 0;
}

/** Packing tasks scoped to warehouses (all when none given). */
export function packingTasksFor(warehouseIds?: string[]): PackingTask[] {
  return warehouseIds?.length
    ? packingTasks.filter((t) => warehouseIds.includes(t.warehouseId))
    : packingTasks;
}

/** Badge count for the Packing stage = unfinished packing tasks (scoped). */
export function packingOpenCount(warehouseIds?: string[]): number {
  return packingTasksFor(warehouseIds).filter(
    (t) => t.status !== "completed" && t.status !== "canceled",
  ).length;
}

/** Packing task(s) for a given outbound order. */
export function getPackingForOrder(orderId: string): PackingTask[] {
  return packingTasks.filter((t) => t.salesOrderId === orderId);
}

/** True if a picking task already has a (non-canceled) packing task created from
 *  it — an order picked across several lists can feed the same packing task, so
 *  check both the primary pickingTaskId and the full pickingTaskIds list. */
export function pickingTaskHasPacking(pickingTaskId: string): boolean {
  return packingTasks.some(
    (t) =>
      t.status !== "canceled" &&
      (t.pickingTaskId === pickingTaskId || t.pickingTaskIds?.includes(pickingTaskId)),
  );
}

/**
 * True if THIS specific order already has a (non-canceled) packing task created
 * from THIS specific picking task — narrower than "the order has any packing task
 * ever" (getPackingForOrder(id).length > 0), which would incorrectly block a
 * later, independent picking cycle's own remainder from ever being packed once an
 * earlier cycle for the same order was already packed and shipped. Scoped per
 * order (not just per picking task like pickingTaskHasPacking) since one picking
 * task can bundle several orders, each with its own separate packing task.
 */
export function orderPackedFromPickingTask(orderId: string, pickingTaskId: string): boolean {
  return getPackingForOrder(orderId).some(
    (t) => t.status !== "canceled" && (t.pickingTaskId === pickingTaskId || t.pickingTaskIds?.includes(pickingTaskId)),
  );
}

export function getPackingTask(taskId: string): PackingTask | undefined {
  return packingTasks.find((t) => t.id === taskId);
}

/** Days a task has been open (start → end, or start → today while in progress). */
export function packingTaskAgingDays(task: PackingTask): number {
  if (!task.startDate) return 0;
  const dayMs = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const start = new Date(task.startDate);
  const end = task.endDate ? new Date(task.endDate) : new Date(TODAY);
  const diff = Math.round((dayMs(end) - dayMs(start)) / 86_400_000);
  return Math.max(0, diff) + 1;
}

function nowIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function sumPacked(packed: Record<string, number>): number {
  return Object.values(packed).reduce((a, b) => a + (b || 0), 0);
}

/** Operator clicks "Match order" → in progress + start timestamp. */
export function startPacking(taskId: string): void {
  const t = getPackingTask(taskId);
  if (!t || t.status !== "open") return;
  t.status = "in progress";
  t.startDate = nowIso();
  persistPacking();
}

/** Save matched/packed qty per line (Save draft) — stays in progress. */
export function savePackingDraft(taskId: string, packed: Record<string, number>): void {
  const t = getPackingTask(taskId);
  if (!t) return;
  if (t.status === "open") { t.status = "in progress"; t.startDate = nowIso(); }
  t.packedByKey = { ...packed };
  t.packedQty = sumPacked(t.packedByKey);
  persistPacking();
}

/** Operator clicks "End packing" → completed + end timestamp. (Delivery is created by the page.) */
export function endPacking(taskId: string, packed?: Record<string, number>): void {
  const t = getPackingTask(taskId);
  if (!t) return;
  if (packed) { t.packedByKey = { ...packed }; t.packedQty = sumPacked(t.packedByKey); }
  else if (!t.packedByKey) t.packedQty = t.toPackQty;
  t.status = "completed";
  t.endDate = nowIso();
  persistPacking();
}

/** A packing task can only be MANUALLY canceled while packing hasn't finished yet —
 *  "completed" means endPacking() already committed real effects (packed units are
 *  what a delivery/shipment gets created from), so a manual cancel at that point
 *  would silently make packed stock unaccounted for. */
export function canCancelPackingTask(t: PackingTask): boolean {
  return t.status === "open" || t.status === "in progress";
}

/** Cancel a packing task. Terminal state; the record is kept (never deleted) so it
 *  stays in the audit trail.
 *
 *  `force` skips the open/in-progress gate — used when the underlying ORDER is
 *  cancelled: the task is void whatever its status (completed included), the
 *  ready-to-ship delivery it fed is cancelled alongside, and its reserved stock is
 *  order-owned (returned via Release reserved), so nothing goes unaccounted. */
export function cancelPackingTask(taskId: string, reason?: string, force = false): void {
  const t = getPackingTask(taskId);
  if (!t || t.status === "canceled") return;
  if (!force && !canCancelPackingTask(t)) return;
  t.status = "canceled";
  t.canceledDate = nowIso();
  if (reason) t.canceledReason = reason;
  t.canceledBy = "Rizal Candra";
  persistPacking();
}

const PACKING_ACTIVE: PackingTask["status"][] = ["open", "in progress"];

export function activePackingTasksFor(warehouseId: string, assignee: string): PackingTask[] {
  return packingTasks.filter(
    (t) => t.warehouseId === warehouseId && t.assignee === assignee && (PACKING_ACTIVE as string[]).includes(t.status),
  );
}

export function reassignPackingTasks(warehouseId: string, fromName: string, toName: string): void {
  for (const t of activePackingTasksFor(warehouseId, fromName)) t.assignee = toName;
  persistPacking();
}
