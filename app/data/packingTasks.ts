import { reactive } from "vue";
import { picForWarehouse } from "./warehouses";
import { outgoingOrders } from "./outgoing";
import { pickingTasks, pickingLinesOf, getPickingTask, pickedQtyForOrderSku, type PickingTask } from "./pickingTasks";
import { orderSkuLines } from "./inventory";
import { binForSku } from "./warehouseDetails";
import { TODAY } from "./master";
import { loadSnapshot, saveSnapshot } from "./persist";

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
  /** the primary picking task this was created from (first contributing list) */
  pickingTaskId: string;
  pickingTaskNo: string;
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
  /** packed qty per line key (set as the operator matches/sorts) */
  packedByKey?: Record<string, number>;
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
}

/** The picked lines belonging to a packing task's sales order. */
export function pickedLinesForPacking(task: PackingTask): PackedSourceLine[] {
  // Read the ORDER's total picked across ALL its picking lists (a packing task can come
  // from several lists), not just the primary one — so match-order shows the full qty.
  const order = outgoingOrders.find((o) => o.id === task.salesOrderId);
  if (!order) return [];
  const lines: PackedSourceLine[] = [];
  for (const l of orderSkuLines(order)) {
    const picked = pickedQtyForOrderSku(task.salesOrderId, l.sku);
    if (picked <= 0) continue; // only what was actually picked can be packed
    lines.push({
      key: `${task.salesOrderId}::${l.sku}`,
      sku: l.sku, product: l.product.name, desc: l.product.desc, img: l.product.img,
      unit: l.product.unit, bin: binForSku(order.warehouseId, l.sku), picked,
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
  // Curated demo picking lists (pick-demo-*) are left UN-packed on purpose so the
  // "Create packing" flow is demoable; only the pre-shipped chain seeds packing here.
  for (const pick of pickingTasks.filter((t) => t.status === "completed" && !t.id.startsWith("pick-sh-") && !t.id.startsWith("pick-demo-"))) {
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
        assignee: picForWarehouse(pick.warehouseId, idx),
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
      assignee: picForWarehouse(pick.warehouseId, k),
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
