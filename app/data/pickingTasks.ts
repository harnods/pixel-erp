import { reactive } from "vue";
import { warehouses, picForWarehouse } from "./warehouses";
import { outgoingOrders, pickableOrders, canCreatePicking, shippedSeeds, type OutgoingOrder } from "./outgoing";
import { orderSkuLines } from "./inventory";
import { binForSku } from "./warehouseDetails";
import { TODAY } from "./master";
import { loadSnapshot, saveSnapshot } from "./persist";

/** A single SKU line within a picking task (one row of the picking list). */
export interface PickingLine {
  key: string;        // `${orderId}::${sku}`
  orderId: string;
  salesNo: string;
  sku: string;
  product: string;
  desc: string;
  img: string;
  unit: string;
  bin: string;        // storage location to pick from
  qty: number;        // planned to-pick qty
}

/**
 * A picking task — once an outbound order is confirmed, a warehouse operator must
 * collect (pick) its goods from storage bins. One task can bundle one or more sales
 * orders that ship from the SAME warehouse. The operator picks per bin, then the
 * picked goods are sorted back per sales order for packing. Mirrors the inbound
 * receiving-task flow (open → in progress → completed, with start/end timestamps).
 */
export interface PickingTask {
  id: string;
  taskNo: string;
  /** source outbound order ids (links to outgoing.ts) */
  salesOrderIds: string[];
  /** source sales order numbers */
  salesNos: string[];
  warehouseId: string;
  warehouseName: string;
  assignee: string;
  /** distinct SKU lines to pick across the bundled orders */
  skuQty: number;
  /** total units the picking list calls for (planned) */
  toPickQty: number;
  /** units actually picked so far (0 ≤ pickedQty ≤ toPickQty) */
  pickedQty: number;
  status: "open" | "in progress" | "completed" | "canceled";
  startDate?: string;
  endDate?: string;
  /** planned pick lines (per SKU per order) */
  lines?: PickingLine[];
  /** picked qty per line key (set as the operator picks) */
  pickedByKey?: Record<string, number>;
}

const PICKING_WAREHOUSES = warehouses.filter(
  (w) => !w.isDefault && w.status === "active",
);

/** Build the default pick lines (all SKUs of the given orders). SKUs come from the
 *  product DB, drawn from what each order's warehouse actually stocks, so every pick
 *  line maps to a real bin. */
export function buildPickingLines(salesOrderIds: string[], salesNos: string[]): PickingLine[] {
  const lines: PickingLine[] = [];
  salesOrderIds.forEach((orderId, oi) => {
    const o = outgoingOrders.find((x) => x.id === orderId);
    if (!o) return;
    for (const l of orderSkuLines(o)) {
      const p = l.product;
      lines.push({
        key: `${orderId}::${p.sku}`,
        orderId,
        salesNo: salesNos[oi] ?? o.salesNo,
        sku: p.sku, product: p.name, desc: p.desc, img: p.img,
        unit: p.unit, bin: binForSku(o.warehouseId, p.sku), qty: l.qty,
      });
    }
  });
  return lines;
}

// Stage status assigned to a seed task — mostly Open, some In progress / Completed,
// the occasional Canceled, so all states are demonstrable (deterministic).
const SEED_STATUSES: PickingTask["status"][] = [
  "open", "in progress", "open", "completed", "open", "in progress", "completed", "canceled",
];

// Fraction picked vs planned, per seed status (in progress = partway; completed =
// usually full, sometimes a short pick).
const PICK_FRACTIONS = [0.4, 0.6, 0.3, 0.7, 0.5];
const SHORT_PICK_FRACTIONS = [0.6, 0.75, 0.85, 0.9, 0.7];
function pickRatioFor(status: PickingTask["status"], idx: number): number {
  if (status === "completed") return idx % 3 === 0 ? SHORT_PICK_FRACTIONS[idx % SHORT_PICK_FRACTIONS.length]! : 1;
  if (status === "in progress") return PICK_FRACTIONS[idx % PICK_FRACTIONS.length]!;
  return 0; // open / canceled
}

// ── Seed: bundle each warehouse's pickable orders into picking tasks ──────────────
function seedTasks(): PickingTask[] {
  const out: PickingTask[] = [];
  let seq = 30090;
  PICKING_WAREHOUSES.forEach((wh, p) => {
    const orders = pickableOrders([wh.id]);
    if (!orders.length) return;
    const bundleSize = 2 + (p % 2); // 2 or 3 orders per task
    for (let start = 0, t = 0; start < orders.length; start += bundleSize, t++) {
      const bundle = orders.slice(start, start + bundleSize);
      const status = SEED_STATUSES[(p + t) % SEED_STATUSES.length]!;
      const lines = buildPickingLines(bundle.map((o) => o.id), bundle.map((o) => o.salesNo));
      const toPickQty = lines.reduce((s, l) => s + l.qty, 0);
      const ratio = pickRatioFor(status, p + t);
      let pickedByKey: Record<string, number> | undefined;
      let pickedQty = 0;
      if (status === "in progress" || status === "completed") {
        pickedByKey = {};
        for (const l of lines) {
          const q = Math.min(l.qty, Math.max(0, Math.round(l.qty * ratio)));
          pickedByKey[l.key] = q;
          pickedQty += q;
        }
      }
      const dayOffset = -(((p + t) * 3) % 12) - 1;
      out.push({
        id: `pick-${p}-${t}`,
        taskNo: `Picking #${seq++}`,
        salesOrderIds: bundle.map((o) => o.id),
        salesNos: bundle.map((o) => o.salesNo),
        warehouseId: wh.id,
        warehouseName: wh.name,
        assignee: picForWarehouse(wh.id, p + t),
        skuQty: lines.length,
        toPickQty,
        pickedQty,
        status,
        startDate: status === "open" || status === "canceled" ? undefined : isoAt(dayOffset, 8, 30),
        endDate: status === "completed" ? isoAt(dayOffset, 11, 15) : undefined,
        lines,
        pickedByKey,
      });
    }
  });
  out.push(...seedShippedPicks(seq));
  return out;
}

// ── Seed: a COMPLETED picking task per pre-shipped order (full pick; partial orders
// are short-picked on their last SKU). Wired through to packing/delivery seeds. ──
function seedShippedPicks(startSeq: number): PickingTask[] {
  const out: PickingTask[] = [];
  let seq = startSeq;
  shippedSeeds.forEach((s, k) => {
    const o = outgoingOrders.find((x) => x.id === s.id);
    if (!o) return;
    const lines = buildPickingLines([o.id], [o.salesNo]);
    const pickedByKey: Record<string, number> = {};
    let pickedQty = 0;
    lines.forEach((l, li) => {
      const q = s.partial && li === lines.length - 1 ? 0 : l.qty; // short-pick last SKU
      pickedByKey[l.key] = q;
      pickedQty += q;
    });
    const dayOffset = -((k % 12) + 2);
    out.push({
      id: `pick-sh-${String(k + 1).padStart(3, "0")}`,
      taskNo: `Picking #${seq++}`,
      salesOrderIds: [o.id],
      salesNos: [o.salesNo],
      warehouseId: o.warehouseId,
      warehouseName: o.warehouseName,
      assignee: picForWarehouse(o.warehouseId, k),
      skuQty: lines.length,
      toPickQty: lines.reduce((sum, l) => sum + l.qty, 0),
      pickedQty,
      status: "completed",
      startDate: isoAt(dayOffset, 8, 30),
      endDate: isoAt(dayOffset, 11, 15),
      lines,
      pickedByKey,
    });
  });
  return out;
}

function isoAt(dayOffset: number, hour: number, minute: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + dayOffset);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(hour)}:${p(minute)}:00`;
}

const snapshot = loadSnapshot<PickingTask>("picking");
export const pickingTasks = reactive<PickingTask[]>(snapshot ?? seedTasks());

function persistPicking(): void {
  saveSnapshot("picking", pickingTasks);
}

let nextSeq = 30090 + pickingTasks.length;
function freshSeq(): number {
  const used = pickingTasks.map((t) => Number(t.taskNo.replace(/\D/g, ""))).filter(Number.isFinite);
  nextSeq = Math.max(nextSeq, ...used, 30089) + 1;
  return nextSeq;
}

/** Create a picking task from selected sales orders (same warehouse). Newly created → "open". */
export function addPickingTask(opts: {
  salesOrderIds: string[];
  salesNos: string[];
  warehouseId: string;
  warehouseName: string;
  assignee: string;
  lines?: PickingLine[];
  skuQty?: number;
  toPickQty?: number;
}): PickingTask {
  const seq = freshSeq();
  const lines = opts.lines ?? buildPickingLines(opts.salesOrderIds, opts.salesNos);
  const task: PickingTask = {
    id: `pick-new-${seq}`,
    taskNo: `Picking #${seq}`,
    salesOrderIds: opts.salesOrderIds,
    salesNos: opts.salesNos,
    warehouseId: opts.warehouseId,
    warehouseName: opts.warehouseName,
    assignee: opts.assignee,
    skuQty: opts.skuQty ?? lines.length,
    toPickQty: opts.toPickQty ?? lines.reduce((s, l) => s + l.qty, 0),
    pickedQty: 0, // newly created → nothing picked yet
    status: "open",
    lines,
  };
  pickingTasks.unshift(task);
  persistPicking();
  return task;
}

/** Picking tasks scoped to warehouses (all when none given). */
export function pickingTasksFor(warehouseIds?: string[]): PickingTask[] {
  return warehouseIds?.length
    ? pickingTasks.filter((t) => warehouseIds.includes(t.warehouseId))
    : pickingTasks;
}

/** Badge count for the Picking stage = unfinished picking tasks (scoped). */
export function pickingOpenCount(warehouseIds?: string[]): number {
  return pickingTasksFor(warehouseIds).filter(
    (t) => t.status !== "completed" && t.status !== "canceled",
  ).length;
}

/** Picking task(s) that include a given outbound order. */
export function getPickingForOrder(orderId: string): PickingTask[] {
  return pickingTasks.filter((t) => t.salesOrderIds.includes(orderId));
}

/** SKU line keys for an order already covered by an existing picking task. */
function pickedKeysForOrder(orderId: string): Set<string> {
  const keys = new Set<string>();
  for (const t of getPickingForOrder(orderId))
    for (const l of pickingLinesOf(t)) if (l.orderId === orderId) keys.add(l.key);
  return keys;
}

/**
 * Can a (new) picking list be created for this order? Only when it's open/in-process
 * AND at least one of its SKUs isn't on any picking list yet (more left to pick).
 */
export function canPickOrder(order: OutgoingOrder): boolean {
  if (!canCreatePicking(order)) return false;
  const covered = pickedKeysForOrder(order.id);
  return buildPickingLines([order.id], [order.salesNo]).some((l) => !covered.has(l.key));
}

export function getPickingTask(taskId: string): PickingTask | undefined {
  return pickingTasks.find((t) => t.id === taskId);
}

/** The pick lines of a task (stored, or generated for seed tasks without them). */
export function pickingLinesOf(task: PickingTask): PickingLine[] {
  return task.lines?.length ? task.lines : buildPickingLines(task.salesOrderIds, task.salesNos);
}

/** Days a task has been open (start → end, or start → today while in progress). */
export function pickingTaskAgingDays(task: PickingTask): number {
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

function sumPicked(picked: Record<string, number>): number {
  return Object.values(picked).reduce((a, b) => a + (b || 0), 0);
}

/** Operator clicks "Start picking" → in progress + start timestamp. */
export function startPicking(taskId: string): void {
  const t = getPickingTask(taskId);
  if (!t || t.status !== "open") return;
  t.status = "in progress";
  t.startDate = nowIso();
  if (!t.lines?.length) t.lines = buildPickingLines(t.salesOrderIds, t.salesNos);
  persistPicking();
}

/** Save picked qty per line (autosave / Save draft) — stays in progress. */
export function savePickingDraft(taskId: string, picked: Record<string, number>): void {
  const t = getPickingTask(taskId);
  if (!t) return;
  if (t.status === "open") { t.status = "in progress"; t.startDate = nowIso(); }
  t.pickedByKey = { ...picked };
  t.pickedQty = sumPicked(t.pickedByKey);
  persistPicking();
}

/** Operator clicks "End picking" → completed + end timestamp. */
export function endPicking(taskId: string, picked: Record<string, number>): void {
  const t = getPickingTask(taskId);
  if (!t) return;
  t.pickedByKey = { ...picked };
  t.pickedQty = sumPicked(t.pickedByKey);
  t.status = "completed";
  t.endDate = nowIso();
  persistPicking();
}
