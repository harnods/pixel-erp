import { reactive } from "vue";
import { warehouses } from "./warehouses";
import { operatorForWarehouse } from "./warehouseTeam";
import { outgoingOrders, pickableOrders, canCreatePicking, isMarketplaceOrder, shippedSeeds, type OutgoingOrder } from "./outgoing";
import { orderSkuLines } from "./inventory";
import { getWarehouseConfig } from "./warehouseConfig";
import {
  binForSku, getWarehouseDetail, getReservationsForOrder, releaseReservationsForOrderSku, reserveStock,
  autoSelectLocationBins, autoSelectBatches, autoSelectSerials, registerNewBatch,
} from "./warehouseDetails";
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

/** One batch picked from to fulfil a line — a batch lives in exactly one bin. */
export interface PickingBatchPick {
  batchNo: string;
  expiryDate: string;
  desc: string;
  qty: number;
  unit: string;
  location: string;
}

/** One serial picked to fulfil a line — a serial lives in exactly one bin. */
export interface PickingSerialPick {
  serial: string;
  location: string;
}

export interface PickingAssignments {
  batchPicks?: Record<string, PickingBatchPick[]>;
  serialPicks?: Record<string, PickingSerialPick[]>;
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
  status: "open" | "in progress" | "partially picked" | "completed" | "canceled";
  startDate?: string;
  endDate?: string;
  /** ISO timestamp — set when auto-canceled by disabling Picking for the warehouse. */
  canceledDate?: string;
  /** Why this task was canceled — shown on the task detail page. */
  canceledReason?: string;
  /** Who canceled it — shown on the task detail page. */
  canceledBy?: string;
  /** A SHARED order on this task was cancelled and the operator hasn't acknowledged
   *  it yet — the pick list still shows the original numbers; a banner prompts the
   *  operator to acknowledge, which drops the cancelled order's lines from the pick
   *  work (acknowledgeCanceledPickingOrders). The cancelled order stays LINKED
   *  (visible in the task's Sales orders list) either way. */
  needsCancelAck?: boolean;
  /** Orders whose cancellation has been acknowledged — their lines are excluded from
   *  the pick work (Qty to pick / rows) but they remain in salesOrderIds for linking. */
  canceledAckedOrderIds?: string[];
  /** planned pick lines (per SKU per order) */
  lines?: PickingLine[];
  /** picked qty per line key (set as the operator picks) */
  pickedByKey?: Record<string, number>;
  /** Per-line batch picks (batch-tracked SKUs), keyed by PickingLine.key. */
  batchPicks?: Record<string, PickingBatchPick[]>;
  /** Per-line serial picks (serial-tracked SKUs), keyed by PickingLine.key. */
  serialPicks?: Record<string, PickingSerialPick[]>;
  /** Snapshot of batchPicks, taken ONCE at task creation (the reservation plan) —
   *  batchPicks above gets overwritten with the real per-batch result the moment
   *  anything is actually picked, so this is the only place "what this task
   *  originally asked for, per batch" survives. Never mutated after creation. */
  plannedBatchPicks?: Record<string, PickingBatchPick[]>;
  /** Same idea as plannedBatchPicks, for serial-tracked SKUs. */
  plannedSerialPicks?: Record<string, PickingSerialPick[]>;
}

/** Deep-clone a batch/serial pick record so a later reassignment of the live
 *  batchPicks/serialPicks field can never retroactively alter a frozen plan
 *  snapshot taken from the same object. */
function clonePicks<T>(picks: Record<string, T[]>): Record<string, T[]> {
  return JSON.parse(JSON.stringify(picks));
}

/**
 * assignmentsFromReservations() caps each line's picks at the line's FULL qty
 * (the reservation plan) — correct for plannedBatchPicks/plannedSerialPicks, but
 * wrong for the task's REAL batchPicks/serialPicks on a demo task seeded with only
 * a FRACTION actually picked ("in progress"/"partially picked", pickedByKey < line
 * qty): without this trim, the real picks would list the full plan while the
 * Picked qty stat shows only the fraction, disagreeing with each other. Mutates
 * serialPicks/batchPicks in place, trimming (or dropping) each line down to its
 * own pickedByKey qty.
 */
function trimPicksToPickedQty(
  serialPicks: Record<string, PickingSerialPick[]>,
  batchPicks: Record<string, PickingBatchPick[]>,
  pickedByKey: Record<string, number>,
): void {
  for (const [key, picks] of Object.entries(serialPicks)) {
    const cap = pickedByKey[key] ?? 0;
    if (cap <= 0) delete serialPicks[key];
    else if (picks.length > cap) serialPicks[key] = picks.slice(0, cap);
  }
  for (const [key, picks] of Object.entries(batchPicks)) {
    let remaining = pickedByKey[key] ?? 0;
    const trimmed: PickingBatchPick[] = [];
    for (const b of picks) {
      if (remaining <= 0) break;
      const take = Math.min(b.qty, remaining);
      trimmed.push(take === b.qty ? b : { ...b, qty: take });
      remaining -= take;
    }
    if (trimmed.length) batchPicks[key] = trimmed;
    else delete batchPicks[key];
  }
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

// Fraction picked vs planned, per seed status (in progress = partway; completed =
// usually full, sometimes a short pick).
const PICK_FRACTIONS = [0.4, 0.6, 0.3, 0.7, 0.5];
const SHORT_PICK_FRACTIONS = [0.6, 0.75, 0.85, 0.9, 0.7];
function pickRatioFor(status: PickingTask["status"], idx: number): number {
  if (status === "completed") return 1; // fully picked
  if (status === "partially picked") return SHORT_PICK_FRACTIONS[idx % SHORT_PICK_FRACTIONS.length]!; // finished short
  if (status === "in progress") return PICK_FRACTIONS[idx % PICK_FRACTIONS.length]!;
  return 0; // open / canceled
}

// ── Seed: a small, CURATED demo set — one picking list per status in a single
// warehouse, consuming only a few orders. Deliberately leaves MOST orders un-picked
// (so "Create picking" is demoable) and the FINISHED lists un-packed (so the bulk
// "Create packing" flow is demoable). The pre-shipped chain (below) still populates
// the Completed / Delivery stages so those tabs aren't empty. ──
function seedTasks(): PickingTask[] {
  const out: PickingTask[] = [];
  let seq = 30090;
  // One picking list per status, each consuming ONE order. Allocate from the richest
  // warehouse first (so the finished/packable lists — partially picked + completed —
  // land in the SAME warehouse and the bulk "Create packing" demo works), then borrow
  // from other warehouses for the remaining statuses. No warehouse has 5 pickable
  // orders on its own, so the canceled list may sit in another warehouse — fine, it
  // isn't packable anyway.
  const cands = PICKING_WAREHOUSES.map((w) => ({
    w,
    // out-demo-multi-* are reserved for seedMultiOrderPickingDemo() below — kept
    // out of this generic single-order pool so they're never accidentally
    // consumed by it first (they'd otherwise be prime candidates: wh-001 is
    // comfortably stocked, so it's a likely "richest warehouse" pick).
    orders: pickableOrders([w.id]).filter((o) => o.source !== "Outbound delivery" && !o.id.startsWith("out-demo-multi")),
  })).sort((a, b) => b.orders.length - a.orders.length);
  const pool = cands.flatMap((c) => c.orders); // richest warehouse's orders come first
  if (pool.length) {
    const plan: PickingTask["status"][] = ["partially picked", "completed", "open", "in progress", "canceled"];
    plan.forEach((status, t) => {
      const o = pool[t];
      if (!o) return;
      const lines = buildPickingLines([o.id], [o.salesNo]);
      const toPickQty = lines.reduce((s, l) => s + l.qty, 0);
      const ratio = pickRatioFor(status, t);
      const started = status !== "open" && status !== "canceled";
      const finished = status === "completed" || status === "partially picked";
      let pickedByKey: Record<string, number> | undefined;
      let pickedQty = 0;
      if (started) {
        pickedByKey = {};
        for (const l of lines) {
          const q = Math.min(l.qty, Math.max(0, Math.round(l.qty * ratio)));
          pickedByKey[l.key] = q;
          pickedQty += q;
        }
      }
      const dayOffset = -(t * 2) - 1;
      // These demo tasks are pushed straight into the array (never through
      // addPickingTask()), so they'd otherwise never pick up their order's
      // already-reserved batch/serial — read it the same way addPickingTask() does.
      const { batchPicks, serialPicks } = assignmentsFromReservations(lines, o.warehouseId);
      const hasPlannedBatch = Object.keys(batchPicks).length > 0;
      const hasPlannedSerial = Object.keys(serialPicks).length > 0;
      const plannedBatchPicks = clonePicks(batchPicks);
      const plannedSerialPicks = clonePicks(serialPicks);
      // assignmentsFromReservations() caps at each line's FULL qty (the plan) —
      // but pickedByKey above may only be a FRACTION of that ("in progress"/
      // "partially picked"). Trim the REAL picks down to match, or the Picked
      // qty stat and the batch/serial table would disagree.
      if (pickedByKey) trimPicksToPickedQty(serialPicks, batchPicks, pickedByKey);
      out.push({
        id: `pick-demo-${t}`,
        taskNo: `Picking #${seq++}`,
        salesOrderIds: [o.id],
        salesNos: [o.salesNo],
        warehouseId: o.warehouseId,
        warehouseName: o.warehouseName,
        assignee: operatorForWarehouse(o.warehouseId, t),
        skuQty: lines.length,
        toPickQty,
        pickedQty,
        status,
        startDate: started ? isoAt(dayOffset, 8, 30) : undefined,
        endDate: finished ? isoAt(dayOffset, 11, 15) : undefined,
        lines,
        pickedByKey,
        ...(hasPlannedBatch ? { ...(Object.keys(batchPicks).length ? { batchPicks } : {}), plannedBatchPicks } : {}),
        ...(hasPlannedSerial ? { ...(Object.keys(serialPicks).length ? { serialPicks } : {}), plannedSerialPicks } : {}),
      });
    });
  }
  out.push(...seedShippedPicks(seq));
  out.push(seedMultiOrderPickingDemo());
  out.push(...seedPartialSplitPickingDemo());
  return out;
}

/**
 * These pre-shipped orders never enter the live reservation system (they're seeded
 * directly as completed/partially shipped, never open/in-progress — reserveOrder()
 * skips them forever), so there's no order reservation to read back for their picking
 * task the way seedTasks()/addPickingTask() do. Pick straight from current available
 * stock instead — and actually reserve it (rather than just reading it), so a batch/
 * serial doesn't end up double-shown for two different historical orders, and
 * Warehouse Details' reserved/available stays consistent with what these View batch /
 * View serial number drawers display. Safe: these orders are never revisited by
 * reserveAllPickableOrders(), so nothing else ever competes for or releases this.
 */
function plausiblePicksFor(
  orderId: string,
  lines: PickingLine[],
  warehouseId: string,
  qtyByKey: Record<string, number>,
): { batchPicks: Record<string, PickingBatchPick[]>; serialPicks: Record<string, PickingSerialPick[]> } {
  const batchPicks: Record<string, PickingBatchPick[]> = {};
  const serialPicks: Record<string, PickingSerialPick[]> = {};
  const wh = getWarehouseDetail(warehouseId);
  const reservePicks: { sku: string; batchNo?: string; qty: number; serials?: string[] }[] = [];
  for (const l of lines) {
    const qty = qtyByKey[l.key] ?? 0;
    if (qty <= 0) continue;
    const item = wh?.stock.find((s) => s.sku === l.sku);
    if (!item) continue;
    const preferredLocations = autoSelectLocationBins(warehouseId, l.sku, qty).map((b) => b.location);
    if (item.batches?.length) {
      const picks = autoSelectBatches(warehouseId, l.sku, qty, preferredLocations);
      if (picks.length) {
        batchPicks[l.key] = picks.map((b) => ({
          batchNo: b.batchNo, expiryDate: b.expiryDate, desc: "", qty: b.take, unit: item.unit, location: b.location,
        }));
        for (const b of picks) reservePicks.push({ sku: l.sku, batchNo: b.batchNo, qty: b.take });
      }
    } else if (item.serials) {
      const serials = autoSelectSerials(warehouseId, l.sku, qty, preferredLocations);
      if (serials.length) {
        serialPicks[l.key] = serials.map((sn) => ({
          serial: sn,
          location: item.serials!.available.find((u) => u.serial === sn)?.location
            ?? item.serials!.reserved.find((u) => u.serial === sn)?.location ?? "",
        }));
        reservePicks.push({ sku: l.sku, qty: serials.length, serials });
      }
    }
  }
  if (reservePicks.length) reserveStock(orderId, warehouseId, reservePicks);
  return { batchPicks, serialPicks };
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
    const { batchPicks, serialPicks } = plausiblePicksFor(o.id, lines, o.warehouseId, pickedByKey);
    const dayOffset = -((k % 12) + 2);
    out.push({
      id: `pick-sh-${String(k + 1).padStart(3, "0")}`,
      taskNo: `Picking #${seq++}`,
      salesOrderIds: [o.id],
      salesNos: [o.salesNo],
      warehouseId: o.warehouseId,
      warehouseName: o.warehouseName,
      assignee: operatorForWarehouse(o.warehouseId, k),
      skuQty: lines.length,
      toPickQty: lines.reduce((sum, l) => sum + l.qty, 0),
      pickedQty,
      status: "completed",
      startDate: isoAt(dayOffset, 8, 30),
      endDate: isoAt(dayOffset, 11, 15),
      lines,
      pickedByKey,
      ...(Object.keys(batchPicks).length ? { batchPicks, plannedBatchPicks: clonePicks(batchPicks) } : {}),
      ...(Object.keys(serialPicks).length ? { serialPicks, plannedSerialPicks: clonePicks(serialPicks) } : {}),
    });
  });
  return out;
}

/**
 * Seed: ONE Open picking task bundling 2 sales orders from the same warehouse —
 * one regular ERP order (out-demo-multi-a), one Desty marketplace order
 * (out-demo-multi-b) — demoing the Combined/By orders toggle on
 * PickingTaskDetailsPage.vue with a real multi-order task. Qty and stock
 * reservation both come straight from buildPickingLines()/
 * assignmentsFromReservations() — the exact same functions addPickingTask()
 * itself uses — so nothing here is hand-faked; the reservation was already
 * made automatically by reserveAllPickableOrders() (outgoing.ts) the moment
 * these two orders were seeded as "pending", same as any other pickable order.
 */
function seedMultiOrderPickingDemo(): PickingTask {
  const orderA = outgoingOrders.find((o) => o.id === "out-demo-multi-a")!;
  const orderB = outgoingOrders.find((o) => o.id === "out-demo-multi-b")!;
  const lines = buildPickingLines([orderA.id, orderB.id], [orderA.salesNo, orderB.salesNo]);
  const toPickQty = lines.reduce((s, l) => s + l.qty, 0);
  const { batchPicks, serialPicks } = assignmentsFromReservations(lines, orderA.warehouseId);
  return {
    id: "pick-demo-multi-001",
    taskNo: "Picking #30500", // clearly outside the 30090+ range other seeds use, so it can never collide
    salesOrderIds: [orderA.id, orderB.id],
    salesNos: [orderA.salesNo, orderB.salesNo],
    warehouseId: orderA.warehouseId,
    warehouseName: orderA.warehouseName,
    assignee: operatorForWarehouse(orderA.warehouseId, 0),
    skuQty: new Set(lines.map((l) => l.sku)).size,
    toPickQty,
    pickedQty: 0,
    status: "open",
    lines,
    ...(Object.keys(batchPicks).length ? { batchPicks, plannedBatchPicks: clonePicks(batchPicks) } : {}),
    ...(Object.keys(serialPicks).length ? { serialPicks, plannedSerialPicks: clonePicks(serialPicks) } : {}),
  };
}

/**
 * Demo for PRD 1.2 D3 (partial picking) + D7 (edit-reallocation): the single
 * SKU-3001 order out-demo-partial-split (qty 7) split across TWO Open picking
 * tasks — 4 pcs and 3 pcs. Lets a demo edit the order 7 → 5 and watch D7 drain
 * the smallest Open task first (the 3-pcs one → 1). Only possible now that
 * partial picking lets one SKU span multiple lists (pickedKeysForOrder qty-aware).
 */
function seedPartialSplitPickingDemo(): PickingTask[] {
  const order = outgoingOrders.find((o) => o.id === "out-demo-partial-split");
  if (!order) return [];
  const [full] = buildPickingLines([order.id], [order.salesNo]);
  if (!full) return [];
  const mk = (seq: number, qty: number): PickingTask => ({
    id: `pick-demo-split-00${seq}`,
    taskNo: `Picking #3051${seq}`, // outside the 30090+/30500 ranges other seeds use
    salesOrderIds: [order.id],
    salesNos: [order.salesNo],
    warehouseId: order.warehouseId,
    warehouseName: order.warehouseName,
    assignee: operatorForWarehouse(order.warehouseId, 0),
    skuQty: 1,
    toPickQty: qty,
    pickedQty: 0,
    status: "open",
    lines: [{ ...full, qty }],
  });
  return [mk(1, 4), mk(2, 3)];
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

// Freeze the freshly-generated seed on first client load. The demo picking tasks
// bind to whatever pickableOrders() returns AT SEED TIME; that pool shifts as
// orders get cancelled/shipped, so without freezing, a reload with no snapshot yet
// would re-run seedTasks() against the changed pool and silently RE-BIND a demo
// task to a DIFFERENT sales order. Persisting immediately makes the binding stable.
if (!snapshot) persistPicking();

let nextSeq = 30090 + pickingTasks.length;
function freshSeq(): number {
  const used = pickingTasks.map((t) => Number(t.taskNo.replace(/\D/g, ""))).filter(Number.isFinite);
  nextSeq = Math.max(nextSeq, ...used, 30089) + 1;
  return nextSeq;
}

/**
 * This task's batch/serial assignments, read straight from each bundled order's
 * existing reservation (made once, when the order was created) — never computed
 * fresh here. A picking task just reads what was already claimed; it doesn't reserve.
 *
 * Capped to each line's OWN qty (l.qty) — an order's reservation covers its FULL
 * demand for that SKU, but a picking task can request only PART of it (a partial
 * pick, leaving the rest for a later list). Without this cap, a reduced-qty line
 * whose batch/serial allocation was never manually re-pinned in the drawer would
 * surface the order's entire reservation here, well over what this task's own
 * "Qty to pick" says — table total ends up inflated past the header stat.
 */
function assignmentsFromReservations(
  lines: PickingLine[],
  warehouseId: string,
): { batchPicks: Record<string, PickingBatchPick[]>; serialPicks: Record<string, PickingSerialPick[]> } {
  const batchPicks: Record<string, PickingBatchPick[]> = {};
  const serialPicks: Record<string, PickingSerialPick[]> = {};
  const wh = getWarehouseDetail(warehouseId);
  for (const l of lines) {
    const item = wh?.stock.find((s) => s.sku === l.sku);
    if (!item) continue;
    const resv = getReservationsForOrder(l.orderId, l.sku);
    if (!resv.length) continue;
    if (item.batches?.length) {
      // Merge by batchNo — reservations can be spread across more than one record
      // for the same batch (partial picks re-pinned, then the order's outstanding
      // remainder topped up later); never surface the same batch as 2 rows.
      const byBatch = new Map<string, number>();
      for (const r of resv) {
        if (!r.batchNo) continue;
        byBatch.set(r.batchNo, (byBatch.get(r.batchNo) ?? 0) + r.qty);
      }
      let budget = l.qty;
      const picks: PickingBatchPick[] = [];
      for (const [batchNo, qty] of byBatch) {
        if (budget <= 0) break;
        const b = item.batches.find((x) => x.batchNo === batchNo);
        if (!b || qty <= 0) continue;
        const take = Math.min(qty, budget);
        picks.push({ batchNo: b.batchNo, expiryDate: b.expiryDate, desc: "", qty: take, unit: item.unit, location: b.location });
        budget -= take;
      }
      if (picks.length) batchPicks[l.key] = picks;
    } else if (item.serials) {
      const seen = new Set<string>();
      const picks: PickingSerialPick[] = [];
      outer: for (const r of resv) {
        for (const serial of r.serials ?? []) {
          if (picks.length >= l.qty) break outer;
          if (seen.has(serial)) continue;
          seen.add(serial);
          const u = item.serials.reserved.find((x) => x.serial === serial);
          picks.push({ serial, location: u?.location ?? "" });
        }
      }
      if (picks.length) serialPicks[l.key] = picks;
    }
  }
  return { batchPicks, serialPicks };
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
  /** SKUs the operator explicitly re-picked in the drawer at creation time — re-pins
   *  that (order, sku)'s reservation to this plan before the task's assignments are
   *  read back out. Any line left out keeps whatever the order already had reserved. */
  overrides?: PickingAssignments;
}): PickingTask {
  const seq = freshSeq();
  const lines = opts.lines ?? buildPickingLines(opts.salesOrderIds, opts.salesNos);
  if (opts.overrides) {
    for (const [orderId, picks] of picksByOrder(opts.overrides)) {
      for (const sku of new Set(picks.map((p) => p.sku))) releaseReservationsForOrderSku(orderId, sku);
      reserveStock(orderId, opts.warehouseId, picks);
    }
  }
  const { batchPicks, serialPicks } = assignmentsFromReservations(lines, opts.warehouseId);
  const task: PickingTask = {
    id: `pick-new-${seq}`,
    taskNo: `Picking #${seq}`,
    salesOrderIds: opts.salesOrderIds,
    salesNos: opts.salesNos,
    warehouseId: opts.warehouseId,
    warehouseName: opts.warehouseName,
    assignee: opts.assignee,
    // Distinct SKU count — a SKU spanning 2+ orders is still ONE line (row) worth
    // of stock to pick, even though it's stored as separate per-order PickingLines.
    skuQty: opts.skuQty ?? new Set(lines.map((l) => l.sku)).size,
    toPickQty: opts.toPickQty ?? lines.reduce((s, l) => s + l.qty, 0),
    pickedQty: 0, // newly created → nothing picked yet
    status: "open",
    lines,
    ...(Object.keys(batchPicks).length ? { batchPicks, plannedBatchPicks: clonePicks(batchPicks) } : {}),
    ...(Object.keys(serialPicks).length ? { serialPicks, plannedSerialPicks: clonePicks(serialPicks) } : {}),
  };
  pickingTasks.unshift(task);
  persistPicking();
  return task;
}

/** Line keys are `${orderId}::${sku}` — split on the FIRST "::" so a sku/orderId
 *  can't itself confuse the split. Groups batch/serial picks by (orderId, sku) —
 *  each bundled order owns its own reservation, so a task spanning two orders must
 *  never merge their picks together. */
function picksByOrder(
  task: PickingAssignments,
): Map<string, { sku: string; batchNo?: string; qty: number; serials?: string[] }[]> {
  const splitKey = (lineKey: string) => {
    const idx = lineKey.indexOf("::");
    return { orderId: lineKey.slice(0, idx), sku: lineKey.slice(idx + 2) };
  };
  const byOrder = new Map<string, { sku: string; batchNo?: string; qty: number; serials?: string[] }[]>();
  const push = (orderId: string, pick: { sku: string; batchNo?: string; qty: number; serials?: string[] }) => {
    const arr = byOrder.get(orderId) ?? [];
    arr.push(pick);
    byOrder.set(orderId, arr);
  };
  for (const [lineKey, picks] of Object.entries(task.batchPicks ?? {})) {
    const { orderId, sku } = splitKey(lineKey);
    for (const p of picks) push(orderId, { sku, batchNo: p.batchNo, qty: p.qty });
  }
  const serialsByOrderSku = new Map<string, Map<string, string[]>>();
  for (const [lineKey, picks] of Object.entries(task.serialPicks ?? {})) {
    const { orderId, sku } = splitKey(lineKey);
    const bySku = serialsByOrderSku.get(orderId) ?? new Map<string, string[]>();
    bySku.set(sku, [...(bySku.get(sku) ?? []), ...picks.map((p) => p.serial)]);
    serialsByOrderSku.set(orderId, bySku);
  }
  for (const [orderId, bySku] of serialsByOrderSku) {
    for (const [sku, serials] of bySku) {
      if (serials.length) push(orderId, { sku, qty: serials.length, serials });
    }
  }
  return byOrder;
}

/** Picking tasks scoped to warehouses (all when none given). */
export function pickingTasksFor(warehouseIds?: string[]): PickingTask[] {
  return warehouseIds?.length
    ? pickingTasks.filter((t) => warehouseIds.includes(t.warehouseId))
    : pickingTasks;
}

/** Badge count for the Picking stage = tasks still being picked (open / in progress).
 *  Finished tasks (completed or partially picked) and canceled ones don't count. */
export function pickingOpenCount(warehouseIds?: string[]): number {
  return pickingTasksFor(warehouseIds).filter(
    (t) => t.status === "open" || t.status === "in progress",
  ).length;
}

/** Picking task(s) that include a given outbound order. */
export function getPickingForOrder(orderId: string): PickingTask[] {
  return pickingTasks.filter((t) => t.salesOrderIds.includes(orderId));
}

/**
 * SKU line keys for an order that are already "covered" — i.e. nothing left to pick.
 * A key is covered when it's either still on an UNFINISHED picking task (open / in
 * progress, so no duplicate list), or it has been FULLY picked. The un-picked remainder
 * of a finished "partially picked" task is NOT covered → it can go on a new picking list.
 */
export function pickedKeysForOrder(orderId: string): Set<string> {
  const order = outgoingOrders.find((o) => o.id === orderId);
  const demand = new Map<string, number>(); // planned qty per SKU line
  if (order) for (const l of buildPickingLines([orderId], [order.salesNo])) demand.set(l.key, l.qty);

  // PRD 1.2 D3: when the warehouse allows partial picking, one SKU line may be split
  // across several picking tasks — so coverage is QTY-AWARE: a line is only "covered"
  // once the total COMMITTED qty (open/in-progress tasks' claimed line qty + finished
  // tasks' actually-picked qty) meets demand, leaving any remainder creatable on a new
  // list. When partial picking is OFF, any open task claims the WHOLE line (no split —
  // the original double-commit guard).
  const partial = order ? getWarehouseConfig(order.warehouseId).allowPartialPicking : false;

  const committed = new Map<string, number>();
  const onActive = new Set<string>();
  for (const t of getPickingForOrder(orderId)) {
    if (t.status === "canceled") continue;
    const finished = t.status === "completed" || t.status === "partially picked";
    for (const l of pickingLinesOf(t)) {
      if (l.orderId !== orderId) continue;
      if (!finished) onActive.add(l.key);
      // finished → count only what was actually picked (un-picked remainder is freed);
      // open/in-progress → count the qty it claimed on the list.
      const claim = finished ? (t.pickedByKey?.[l.key] ?? 0) : l.qty;
      committed.set(l.key, (committed.get(l.key) ?? 0) + claim);
    }
  }

  const covered = new Set<string>();
  for (const [key, need] of demand) {
    if ((committed.get(key) ?? 0) >= need || (!partial && onActive.has(key))) covered.add(key);
  }
  return covered;
}

/**
 * Qty of one order+SKU already committed to existing (non-canceled) picking tasks —
 * finished tasks count their ACTUAL picked qty (the un-picked remainder is freed for
 * a top-up list), open/in-progress tasks count their claimed line qty ONLY when the
 * warehouse allows partial picking (else an open task claims the whole line and the
 * SKU is dropped entirely from a new list via pickedKeysForOrder). Lets a new picking
 * list offer just the still-unclaimed remainder (PRD 1.2 D3).
 */
export function committedQtyForOrderSku(orderId: string, sku: string): number {
  const order = outgoingOrders.find((o) => o.id === orderId);
  const partial = order ? getWarehouseConfig(order.warehouseId).allowPartialPicking : false;
  const key = `${orderId}::${sku}`;
  let sum = 0;
  for (const t of getPickingForOrder(orderId)) {
    if (t.status === "canceled") continue;
    const finished = t.status === "completed" || t.status === "partially picked";
    if (finished) { sum += t.pickedByKey?.[key] ?? 0; continue; }
    if (!partial) continue;
    for (const l of pickingLinesOf(t)) if (l.orderId === orderId && l.sku === sku) sum += l.qty;
  }
  return sum;
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

/** Total units already picked for one order+SKU across every (non-canceled) picking
 *  task — so a NEW picking list only asks for the remaining qty. */
export function pickedQtyForOrderSku(orderId: string, sku: string): number {
  const key = `${orderId}::${sku}`;
  let sum = 0;
  for (const t of getPickingForOrder(orderId)) {
    if (t.status === "canceled") continue;
    sum += t.pickedByKey?.[key] ?? 0;
  }
  return sum;
}

/** Qty of one order+SKU that is LOCKED into an already-started picking task
 *  (in progress / partially picked / completed) — this much can't be removed or
 *  reduced when the order is edited (D7 AC#4). A SKU only on Pending/Open picking
 *  tasks (or none) is not locked, so it can still be freely reduced/removed. */
export function lockedOutboundQtyForSku(orderId: string, sku: string): number {
  const STARTED = new Set(["in progress", "partially picked", "completed"]);
  let sum = 0;
  for (const t of getPickingForOrder(orderId)) {
    if (!STARTED.has(t.status)) continue;
    for (const l of pickingLinesOf(t)) {
      if (l.orderId === orderId && l.sku === sku) sum += l.qty;
    }
  }
  return sum;
}

/** One order+SKU's qty on each PENDING (open) picking task — the tasks a D7 reduction
 *  can drain from, per task (D7 allocation step). Started tasks are excluded (locked). */
export function pendingPickingLinesForSku(orderId: string, sku: string): { taskId: string; taskNo: string; qty: number }[] {
  const out: { taskId: string; taskNo: string; qty: number }[] = [];
  for (const t of getPickingForOrder(orderId)) {
    if (t.status !== "open") continue;
    const qty = pickingLinesOf(t).filter((l) => l.orderId === orderId && l.sku === sku).reduce((s, l) => s + l.qty, 0);
    if (qty > 0) out.push({ taskId: t.id, taskNo: t.taskNo, qty });
  }
  return out;
}

/** Would reducing (orderId, sku) to 0 on this task leave the task with NO lines at all?
 *  (Used to flag "will be cancelled" and to decide auto-cancel — a task still holding
 *  another SKU or another order's line is kept; only the emptied line is removed.) */
export function pickingTaskEmptiedByRemoving(taskId: string, orderId: string, sku: string): boolean {
  const t = getPickingTask(taskId);
  if (!t) return false;
  return pickingLinesOf(t).every((l) => l.orderId === orderId && l.sku === sku);
}

/** D7 allocation step — reduce (orderId, sku)'s line qty on ONE pending picking task
 *  by `reduceBy`. If the line hits 0 it's removed (its batch/serial/picked entries
 *  cleared); if the task then holds NO lines at all it auto-cancels (AC#5) and its
 *  reservation-owned bin-lines return to the claimable pool. A task still holding
 *  other SKUs / other orders' lines is kept — only the emptied line goes. */
export function reduceOrderSkuOnPickingTask(taskId: string, orderId: string, sku: string, reduceBy: number): void {
  const t = getPickingTask(taskId);
  if (!t || t.status !== "open" || reduceBy <= 0) return;
  const lines = t.lines?.length ? t.lines : buildPickingLines(t.salesOrderIds, t.salesNos);
  const key = `${orderId}::${sku}`;
  let remaining = reduceBy;
  const next: PickingLine[] = [];
  for (const l of lines) {
    if (l.orderId === orderId && l.sku === sku && remaining > 0) {
      const take = Math.min(l.qty, remaining);
      remaining -= take;
      const nq = l.qty - take;
      if (nq > 0) next.push({ ...l, qty: nq });
      // else: line fully removed
    } else next.push(l);
  }
  t.lines = next;
  const stillHasLine = next.some((l) => l.orderId === orderId && l.sku === sku);
  if (!stillHasLine) {
    for (const map of [t.batchPicks, t.serialPicks, t.plannedBatchPicks, t.plannedSerialPicks, t.pickedByKey]) {
      if (map) delete (map as Record<string, unknown>)[key];
    }
  }
  t.skuQty = new Set(next.map((l) => l.sku)).size;
  t.toPickQty = next.reduce((s, l) => s + l.qty, 0);
  // Drop this order from the task's order list if it no longer has any line here.
  if (!next.some((l) => l.orderId === orderId)) {
    const keep = t.salesOrderIds.map((id, i) => (id === orderId ? -1 : i)).filter((i) => i >= 0);
    t.salesOrderIds = keep.map((i) => t.salesOrderIds[i]!);
    t.salesNos = keep.map((i) => t.salesNos[i]!);
  }
  if (next.length === 0) {
    t.status = "canceled";
    t.canceledDate = nowIso();
    t.canceledReason = "Emptied by order edit";
    t.canceledBy = "Rizal Candra";
  }
  persistPicking();
}

/** Merge a batch-pick array down to one entry per batchNo, summing qty — a task's
 *  own batchPicks[key], or several tasks' concatenated, can otherwise carry the same
 *  batch as 2+ separate entries (a stale reservation duplicate, a re-pin followed by
 *  a top-up, etc.), which renders as duplicate rows and double-counted qty. */
export function mergeBatchPicks(picks: PickingBatchPick[]): PickingBatchPick[] {
  const byBatch = new Map<string, PickingBatchPick>();
  for (const p of picks) {
    const existing = byBatch.get(p.batchNo);
    byBatch.set(p.batchNo, existing ? { ...existing, qty: existing.qty + p.qty } : p);
  }
  return [...byBatch.values()];
}

/** Dedupe a serial-pick array by serial number — same rationale as mergeBatchPicks. */
export function dedupeSerialPicks(picks: PickingSerialPick[]): PickingSerialPick[] {
  const seen = new Set<string>();
  const result: PickingSerialPick[] = [];
  for (const p of picks) {
    if (seen.has(p.serial)) continue;
    seen.add(p.serial);
    result.push(p);
  }
  return result;
}

/** Batch(es) picked for one order+SKU across every (non-canceled) picking task —
 *  for packing to show which batch(es) the picked units actually came from. */
export function batchPicksForOrderSku(orderId: string, sku: string): PickingBatchPick[] {
  const key = `${orderId}::${sku}`;
  const result: PickingBatchPick[] = [];
  for (const t of getPickingForOrder(orderId)) {
    if (t.status === "canceled") continue;
    const picks = t.batchPicks?.[key];
    if (picks) result.push(...picks);
  }
  return mergeBatchPicks(result);
}

/** Serial(s) picked for one order+SKU across every (non-canceled) picking task. */
export function serialPicksForOrderSku(orderId: string, sku: string): PickingSerialPick[] {
  const key = `${orderId}::${sku}`;
  const result: PickingSerialPick[] = [];
  for (const t of getPickingForOrder(orderId)) {
    if (t.status === "canceled") continue;
    const picks = t.serialPicks?.[key];
    if (picks) result.push(...picks);
  }
  return dedupeSerialPicks(result);
}

/**
 * Same idea as pickedQtyForOrderSku, but scoped to a SPECIFIC set of picking task
 * ids instead of every non-canceled picking task the order has EVER had. An order
 * can go through more than one independent picking→packing→shipment cycle (e.g.
 * partially shipped, then picked again for the remainder) — a packing task must
 * only ever count what its OWN linked picking task(s) actually picked, never an
 * earlier, unrelated cycle's already-packed-and-shipped units too.
 */
export function pickedQtyForPickingTasks(pickingTaskIds: string[], orderId: string, sku: string): number {
  const key = `${orderId}::${sku}`;
  let sum = 0;
  for (const id of pickingTaskIds) {
    const t = getPickingTask(id);
    if (!t || t.status === "canceled") continue;
    sum += t.pickedByKey?.[key] ?? 0;
  }
  return sum;
}

/** Same scoping as pickedQtyForPickingTasks, for batch picks. */
export function batchPicksForPickingTasks(pickingTaskIds: string[], orderId: string, sku: string): PickingBatchPick[] {
  const key = `${orderId}::${sku}`;
  const result: PickingBatchPick[] = [];
  for (const id of pickingTaskIds) {
    const t = getPickingTask(id);
    if (!t || t.status === "canceled") continue;
    const picks = t.batchPicks?.[key];
    if (picks) result.push(...picks);
  }
  return mergeBatchPicks(result);
}

/** Same scoping as pickedQtyForPickingTasks, for serial picks. */
export function serialPicksForPickingTasks(pickingTaskIds: string[], orderId: string, sku: string): PickingSerialPick[] {
  const key = `${orderId}::${sku}`;
  const result: PickingSerialPick[] = [];
  for (const id of pickingTaskIds) {
    const t = getPickingTask(id);
    if (!t || t.status === "canceled") continue;
    const picks = t.serialPicks?.[key];
    if (picks) result.push(...picks);
  }
  return dedupeSerialPicks(result);
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
export function savePickingDraft(
  taskId: string,
  picked: Record<string, number>,
  assignments?: PickingAssignments,
): void {
  const t = getPickingTask(taskId);
  if (!t) return;
  if (t.status === "open") { t.status = "in progress"; t.startDate = nowIso(); }
  t.pickedByKey = { ...picked };
  t.pickedQty = sumPicked(t.pickedByKey);
  if (assignments?.batchPicks) t.batchPicks = assignments.batchPicks;
  if (assignments?.serialPicks) t.serialPicks = assignments.serialPicks;
  persistPicking();
}

/**
 * Operator clicks "Finish picking" → end timestamp. Fully picked ⇒ "completed";
 * anything less ⇒ "partially picked" (allowed for ANY order, marketplace or not — the
 * marketplace-completeness rule is enforced only when creating the packing task).
 */
export function endPicking(
  taskId: string,
  picked: Record<string, number>,
  assignments?: PickingAssignments,
): void {
  const t = getPickingTask(taskId);
  if (!t) return;
  t.pickedByKey = { ...picked };
  t.pickedQty = sumPicked(t.pickedByKey);
  t.status = t.pickedQty >= t.toPickQty ? "completed" : "partially picked";
  t.endDate = nowIso();
  if (assignments?.batchPicks) t.batchPicks = assignments.batchPicks;
  if (assignments?.serialPicks) t.serialPicks = assignments.serialPicks;
  if (assignments) {
    // Operator may have picked from a batch the warehouse never logged (found/
    // counted stock under an unrecognized batch no.) — register it BEFORE
    // reserving, so reserveStock() below has an actual batch to apply against
    // instead of silently reserving into thin air.
    if (assignments.batchPicks) {
      const wh = getWarehouseDetail(t.warehouseId);
      for (const [lineKey, picks] of Object.entries(assignments.batchPicks)) {
        const sku = lineKey.slice(lineKey.indexOf("::") + 2);
        const known = new Set(wh?.stock.find((s) => s.sku === sku)?.batches?.map((b) => b.batchNo));
        for (const p of picks) {
          if (known.has(p.batchNo)) continue;
          registerNewBatch(t.warehouseId, sku, { batchNo: p.batchNo, expiryDate: p.expiryDate, onHand: p.qty, location: p.location });
          known.add(p.batchNo);
        }
      }
    }
    // Operator may have changed batch/serial at the real pick — re-pin each affected
    // order's reservation to whatever was actually picked (release that order+sku's
    // stale claim first so a swapped-out batch/serial doesn't stay double-reserved).
    // Scoped to (orderId, sku), never the whole task, since one task can bundle
    // several orders and each owns its own reservation.
    for (const [orderId, picks] of picksByOrder(t)) {
      for (const sku of new Set(picks.map((p) => p.sku))) releaseReservationsForOrderSku(orderId, sku);
      reserveStock(orderId, t.warehouseId, picks);
    }
  }
  persistPicking();
}

/** A picking task can only be canceled while picking hasn't finished yet —
 *  "partially picked"/"completed" mean endPicking() already committed real
 *  effects (batch/serial pins, reservation re-pinning), so canceling at that
 *  point would silently make picked stock unaccounted for. */
export function canCancelPickingTask(t: PickingTask): boolean {
  return t.status === "open" || t.status === "in progress";
}

/** Cancel a picking task. Terminal state; the record is kept (never deleted) so it
 *  stays in the audit trail.
 *
 *  `force` skips the open/in-progress gate: a MANUAL cancel from the picking detail
 *  is only allowed while unfinished (canCancelPickingTask), but when the underlying
 *  ORDER is cancelled the whole task is void regardless of how far picking got
 *  (partially picked / completed included) — there's no live order left for it to
 *  serve, and its reserved stock is order-owned and returned via Release reserved,
 *  so nothing goes unaccounted. */
export function cancelPickingTask(taskId: string, reason?: string, force = false): void {
  const t = getPickingTask(taskId);
  if (!t || t.status === "canceled") return;
  if (!force && !canCancelPickingTask(t)) return;
  t.status = "canceled";
  t.canceledDate = nowIso();
  if (reason) t.canceledReason = reason;
  t.canceledBy = "Rizal Candra";
  persistPicking();
}

/** Flag a shared picking task that just had one of its orders cancelled — the pick
 *  list still shows the original numbers; the operator must acknowledge (below) to
 *  drop the cancelled order's lines from the pick work. No-op if there's nothing
 *  left un-acknowledged. */
export function markPickingNeedsCancelAck(taskId: string): void {
  const t = getPickingTask(taskId);
  if (!t || t.status === "canceled") return;
  if (pendingCanceledOrderIds(t).length === 0) return;
  t.needsCancelAck = true;
  persistPicking();
}

/** Orders on this task that are cancelled but whose cancellation the operator hasn't
 *  acknowledged yet (still counted in the pick work + driving the ack banner). */
export function pendingCanceledOrderIds(t: PickingTask): string[] {
  const acked = new Set(t.canceledAckedOrderIds ?? []);
  return t.salesOrderIds.filter((id) => {
    if (acked.has(id)) return false;
    const o = outgoingOrders.find((x) => x.id === id);
    return o?.status === "canceled";
  });
}

/** Operator acknowledges the cancelled order(s) on a SHARED picking task: their lines
 *  drop out of the pick work (Qty to pick / SKU qty / rows recomputed for the LIVE
 *  orders only), but they stay in salesOrderIds so they remain visible in the task's
 *  Sales orders list (linked transactions). The task keeps running for its live orders. */
export function acknowledgeCanceledPickingOrders(taskId: string): void {
  const t = getPickingTask(taskId);
  if (!t) return;
  const pending = pendingCanceledOrderIds(t);
  if (pending.length === 0) { if (t.needsCancelAck) { t.needsCancelAck = false; persistPicking(); } return; }
  t.canceledAckedOrderIds = [...new Set([...(t.canceledAckedOrderIds ?? []), ...pending])];
  t.needsCancelAck = false;
  // Recompute the pick-work stats from the remaining (non-acknowledged) lines only.
  const acked = new Set(t.canceledAckedOrderIds);
  const liveLines = (t.lines?.length ? t.lines : buildPickingLines(t.salesOrderIds, t.salesNos))
    .filter((l) => !acked.has(l.orderId));
  t.skuQty = new Set(liveLines.map((l) => l.sku)).size;
  t.toPickQty = liveLines.reduce((s, l) => s + l.qty, 0);
  // Drop the acknowledged order(s)' picked/batch/serial entries so the task's picked
  // count reflects the LIVE orders only — otherwise a cancelled order's already-picked
  // units linger in pickedQty (inflating "picked X of Y" and isFullyPicked). Mirrors
  // removeOrderFromPickingTask, but keeps the order LINKED (salesOrderIds) for audit.
  for (const map of [t.pickedByKey, t.batchPicks, t.serialPicks, t.plannedBatchPicks, t.plannedSerialPicks]) {
    if (map) for (const k of Object.keys(map)) {
      const oid = k.split("::")[0]!;
      if (acked.has(oid)) delete (map as Record<string, unknown>)[k];
    }
  }
  t.pickedQty = sumPicked(t.pickedByKey ?? {});
  persistPicking();
}

/** D2 AC#6 — when a SHARED (multi-order) picking task's ONE outbound is cancelled,
 *  the task is NOT cancelled: it drops that order's lines and continues picking the
 *  remaining orders. Removes the order from salesOrderIds/salesNos, rebuilds the
 *  line set + skuQty/toPickQty, and clears that order's batch/serial/picked entries.
 *  The order-owned reservation is untouched here (returned via manual Release Reserved). */
export function removeOrderFromPickingTask(taskId: string, orderId: string): void {
  const t = getPickingTask(taskId);
  if (!t || !t.salesOrderIds.includes(orderId)) return;
  const fullLines = t.lines?.length ? t.lines : buildPickingLines(t.salesOrderIds, t.salesNos);
  const remaining = fullLines.filter((l) => l.orderId !== orderId);
  const keepIdx = t.salesOrderIds.map((id, i) => (id === orderId ? -1 : i)).filter((i) => i >= 0);
  t.salesOrderIds = keepIdx.map((i) => t.salesOrderIds[i]!);
  t.salesNos = keepIdx.map((i) => t.salesNos[i]!);
  t.lines = remaining;
  t.skuQty = new Set(remaining.map((l) => l.sku)).size;
  t.toPickQty = remaining.reduce((s, l) => s + l.qty, 0);
  const prefix = `${orderId}::`;
  for (const map of [t.batchPicks, t.serialPicks, t.plannedBatchPicks, t.plannedSerialPicks, t.pickedByKey]) {
    if (map) for (const k of Object.keys(map)) if (k.startsWith(prefix)) delete (map as Record<string, unknown>)[k];
  }
  persistPicking();
}

/**
 * Picking just got disabled for this warehouse (see ConfigureWarehousePage.vue).
 * Existing open/in-progress picking tasks are left untouched — users must be able
 * to finish work already underway. Only new outbound orders created after this
 * config change skip picking entirely (see canPickOrder/outgoing.ts, which reads
 * pickingEnabled live and doesn't depend on this function at all).
 */
export function disablePickingForWarehouse(_warehouseId: string): { canceledPickings: number } {
  return { canceledPickings: 0 };
}

/** Read-only preview of disablePickingForWarehouse's effect, for the confirmation dialog. */
export function previewDisablePicking(warehouseId: string): { openPickings: number } {
  const openPickings = pickingTasksFor([warehouseId]).filter(
    (t) => t.status === "open" || t.status === "in progress",
  ).length;
  return { openPickings };
}

/** Status allows spawning a packing task — open (nothing picked yet on THIS list,
 *  but another list may have already picked some of its orders), partially picked,
 *  or completed. The actual gate on WHAT can be packed is packableOrderIds() below. */
export function isPickingReadyToPack(t: PickingTask): boolean {
  return t.status === "open" || t.status === "completed" || t.status === "partially picked";
}
/** True when every planned unit has been picked. */
export function isFullyPicked(t: PickingTask): boolean {
  return t.pickedQty >= t.toPickQty;
}
/** Does this task bundle any marketplace order? */
export function hasMarketplaceOrder(t: PickingTask): boolean {
  return t.salesOrderIds.some((id) => {
    const o = outgoingOrders.find((x) => x.id === id);
    return o ? isMarketplaceOrder(o) : false;
  });
}
/** Units picked for one order's lines within this task. */
export function orderPickedQtyInTask(t: PickingTask, orderId: string): number {
  return pickingLinesOf(t)
    .filter((l) => l.orderId === orderId)
    .reduce((s, l) => s + (t.pickedByKey?.[l.key] ?? 0), 0);
}
/** Every line of one order picked to its full planned qty (within this task). */
export function orderFullyPickedInTask(t: PickingTask, orderId: string): boolean {
  const lines = pickingLinesOf(t).filter((l) => l.orderId === orderId);
  return lines.length > 0 && lines.every((l) => (t.pickedByKey?.[l.key] ?? 0) >= l.qty);
}
/** Total planned demand for an order (sum of its SKU line qtys). */
export function orderDemand(orderId: string): number {
  const o = outgoingOrders.find((x) => x.id === orderId);
  return o ? orderSkuLines(o).reduce((s, l) => s + l.qty, 0) : 0;
}
/** Units picked for an order ACROSS ALL its picking lists (not just one task). */
export function orderPickedTotal(orderId: string): number {
  const o = outgoingOrders.find((x) => x.id === orderId);
  if (!o) return 0;
  return orderSkuLines(o).reduce((s, l) => s + pickedQtyForOrderSku(orderId, l.sku), 0);
}
/** Order fully picked once its picked total across every list meets its demand. */
export function orderFullyPickedAcrossTasks(orderId: string): boolean {
  const demand = orderDemand(orderId);
  return demand > 0 && orderPickedTotal(orderId) >= demand;
}
/**
 * Order ids in this task that CAN become a packing task right now — evaluated at the
 * ORDER level across all picking lists (an order split over 2 lists still counts):
 * marketplace ⇒ fully picked across lists; non-marketplace ⇒ at least one unit picked.
 * (Whether the order already HAS a packing task is checked by the caller.)
 */
export function packableOrderIds(t: PickingTask): string[] {
  return t.salesOrderIds.filter((id) => {
    const o = outgoingOrders.find((x) => x.id === id);
    // A cancelled order can NEVER be packed or shipped again — exclude it whatever
    // state its (kept-for-audit) partially-picked/completed picking task is left in.
    if (!o || o.status === "canceled") return false;
    const marketplace = isMarketplaceOrder(o);
    return marketplace ? orderFullyPickedAcrossTasks(id) : orderPickedTotal(id) > 0;
  });
}
/** Can a packing task be created from this picking task yet? (any order packable) */
export function canCreatePackingFrom(t: PickingTask): boolean {
  return isPickingReadyToPack(t) && packableOrderIds(t).length > 0;
}

const PICKING_ACTIVE: PickingTask["status"][] = ["open", "in progress", "partially picked"];

export function activePickingTasksFor(warehouseId: string, assignee: string): PickingTask[] {
  return pickingTasks.filter(
    (t) => t.warehouseId === warehouseId && t.assignee === assignee && (PICKING_ACTIVE as string[]).includes(t.status),
  );
}

export function reassignPickingTasks(warehouseId: string, fromName: string, toName: string): void {
  for (const t of activePickingTasksFor(warehouseId, fromName)) t.assignee = toName;
  persistPicking();
}
