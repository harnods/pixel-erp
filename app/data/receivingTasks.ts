import { reactive } from "vue";
import { warehouses } from "./warehouses";
import { operatorForWarehouse } from "./warehouseTeam";
import { loadSnapshot, saveSnapshot } from "./persist";
import { receipts, persistReceipts, type Receipt } from "./receipts";
import { lineItemsForReceipt } from "./receiptLineItems";
import { TODAY } from "./master";
import { CATALOG } from "./catalog";
import { getWarehouseConfig } from "./warehouseConfig";

const SERIAL_CATS = new Set(['Espresso Machine', 'Grinder', 'Equipment']);
const BATCH_CATS = new Set(['Green Beans', 'Roasted Beans']);
const SKU_CATEGORY = new Map(CATALOG.map((p) => [p.sku, p.category]));

function isSerialSku(sku: string): boolean {
  return SERIAL_CATS.has(SKU_CATEGORY.get(sku) ?? '');
}
function isBatchSku(sku: string): boolean {
  return BATCH_CATS.has(SKU_CATEGORY.get(sku) ?? '');
}

/** Generate deterministic serial numbers for seed receiving data. */
function seedSerials(sku: string, count: number, base: number): string[] {
  const prefix = sku.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'SN';
  return Array.from({ length: count }, (_, k) =>
    `${prefix}${String(80000 + base + k).padStart(5, '0')}`,
  );
}

/** Generate a deterministic single-batch breakdown for seed receiving data. */
function seedBatchLines(unit: string, qty: number, base: number): ReceivingBatchLine[] {
  const exp = new Date(TODAY.getTime());
  exp.setMonth(exp.getMonth() + 2 + (base % 12));
  return [{
    batchNo: `Batch #${String(10000 + base).padStart(5, '0')}`,
    expiryDate: exp.toISOString().slice(0, 10),
    desc: '',
    qty,
    unit,
  }];
}

/**
 * Inbound receiving — the connected per-SKU graph.
 *
 * A Receipt (PO) owns receiving tasks; each task covers a subset of the receipt's
 * SKUs and records received qty per SKU. The PO's status is DERIVED from its tasks
 * (see {@link recomputeReceiptStatus}). See docs/scenarios/inbound-complete-scenario.md.
 */

/** One physical batch recorded against a received SKU (batch-tracked SKUs only). */
export interface ReceivingBatchLine {
  batchNo: string;
  expiryDate: string;
  desc: string;
  qty: number;
  unit: string;
}

/** One SKU line within a receiving task. */
export interface ReceivingItem {
  sku: string;
  productName: string;
  unit: string;
  /** Purchase qty — units ordered for this SKU on the PO line. The hard ceiling:
   *  receivedQty may exceed targetQty but never this. */
  expectedQty: number;
  /** "Expected qty" shown in the UI — how much is realistically expected to
   *  arrive in THIS receiving task. Defaults to expectedQty at creation, but can
   *  be set lower (never higher — see createReceivingTask). Drives the
   *  Outstanding qty display and the barcode-scan-threshold check; does NOT cap
   *  receivedQty (expectedQty/Purchase qty still does). */
  targetQty: number;
  /** units the operator has recorded as received */
  receivedQty: number;
  /** Per-batch breakdown of receivedQty, recorded via Manage batch (batch-tracked SKUs only). */
  batchLines?: ReceivingBatchLine[];
  /** Individual serials recorded via Manage serial number (serial-tracked SKUs only). */
  serialNumbers?: string[];
}

/** Per-SKU batch/serial detail captured alongside a plain qty save. */
export interface ReceivingItemDetail {
  batchLines?: ReceivingBatchLine[];
  serialNumbers?: string[];
}

export interface ReceivingTask {
  id: string;
  /** task number, e.g. "Receiving #10090" */
  taskNo: string;
  /** the owning receipt (PO) */
  receiptId: string;
  /** PO number, copied from the receipt for display/links */
  purchaseNo: string;
  warehouseId: string;
  warehouseName: string;
  /** the single warehouse person assigned */
  assignee: string;
  /** the SKUs this task covers + their received qty (per-SKU source of truth) */
  items: ReceivingItem[];
  /** number of SKUs this task covers, as a display string — derived from items */
  skuScope: string;
  /** numeric count of SKUs this task covers — derived from items */
  skuCount: number;
  /** units expected for this task — derived (Σ expectedQty) */
  purchaseQty: number;
  /** units recorded so far — derived (Σ receivedQty) */
  receivedQty: number;
  /** open = not started · in progress = receiving · pending put-away = received,
   *  awaiting put-away · completed = put away / done · canceled = voided before
   *  receiving finished */
  status: "open" | "in progress" | "pending put-away" | "completed" | "canceled";
  /** ISO timestamp the task was created/assigned (shown as "Date" on the PO) */
  createdDate?: string;
  /** ISO timestamp receiving started — set on Start receiving */
  startDate?: string;
  /** ISO timestamp the task finished receiving — set on End receiving */
  endDate?: string;
  /** the put-away task that consumed this receiving task (→ status completed) */
  putAwayTaskId?: string;
  canceledDate?: string;
  canceledReason?: string;
}

/** A PO with its receiving task(s) — a grouping view derived from the flat store. */
export interface ReceivingPO {
  id: string;
  purchaseNo: string;
  warehouseId: string;
  warehouseName: string;
  estimatedArrival: string;
  receiptId: string;
  tasks: ReceivingTask[];
}

const RECEIVING_TODAY = TODAY;

function isoAt(days: number, hour: number, minute: number): string {
  const d = new Date(RECEIVING_TODAY);
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(hour)}:${p(minute)}:00`;
}
// Real wall-clock timestamp — used when an operator actually performs an action
// (Start / End receiving, task creation), so the time matches "now".
function nowIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function hash(s: string): number {
  return s.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
}

/**
 * Inclusive day count a task has been worked: start → end (completed) or
 * start → today (in progress). Returns 0 when the task hasn't started.
 */
export function taskAgingDays(task: ReceivingTask): number {
  if (!task.startDate) return 0;
  const start = new Date(task.startDate);
  const end = task.endDate ? new Date(task.endDate) : RECEIVING_TODAY;
  const diff = Math.round((dayStart(end) - dayStart(start)) / 86_400_000);
  return Math.max(0, diff) + 1;
}

// ── Derived totals ──────────────────────────────────────────────────────────────
function syncTaskTotals(task: ReceivingTask, totalReceiptSkus: number): void {
  task.skuCount = task.items.length;
  task.purchaseQty = task.items.reduce((s, it) => s + it.expectedQty, 0);
  task.receivedQty = task.items.reduce((s, it) => s + it.receivedQty, 0);
  task.skuScope = String(task.items.length);
}

// ── Seed: generate tasks FROM receipts so warehouse/SKUs/qty always match ────────
type ReceiveMode = "zero" | "partial" | "short" | "full";

function buildItems(
  lines: { sku: string; productName: string; unit: string; purchaseQty: number }[],
  mode: ReceiveMode,
  seed: number,
  taskSeq: number = 0,
): ReceivingItem[] {
  return lines.map((l, i) => {
    let received = 0;
    if (mode === "full") received = l.purchaseQty;
    else if (mode === "zero") received = 0;
    else if (mode === "short")
      received = (seed + i) % 3 === 0 ? Math.max(0, Math.round(l.purchaseQty * 0.6)) : l.purchaseQty;
    else if (mode === "partial")
      received = (seed + i) % 3 === 0 ? 0 : Math.round(l.purchaseQty * (0.4 + ((seed + i) % 3) * 0.2));
    const receivedQty = Math.min(l.purchaseQty, received);
    // Demo variety: ~1 in 4 lines expects a partial shipment this task (Expected
    // qty < Purchase qty) — everything else defaults to the full Purchase qty,
    // same as before this field existed.
    const targetQty = (seed + i) % 4 === 0 ? Math.max(0, Math.round(l.purchaseQty * 0.7)) : l.purchaseQty;
    const item: ReceivingItem = {
      sku: l.sku,
      productName: l.productName,
      unit: l.unit,
      expectedQty: l.purchaseQty,
      targetQty,
      receivedQty,
    };
    if (receivedQty > 0 && isSerialSku(l.sku)) {
      item.serialNumbers = seedSerials(l.sku, receivedQty, seed * 100 + taskSeq * 50 + i * 10);
    } else if (receivedQty > 0 && isBatchSku(l.sku)) {
      item.batchLines = seedBatchLines(l.unit, receivedQty, seed * 100 + taskSeq * 50 + i * 10);
    }
    return item;
  });
}

function seedTasks(): ReceivingTask[] {
  const out: ReceivingTask[] = [];
  let seq = 10090;

  function make(
    r: Receipt,
    lines: { sku: string; productName: string; unit: string; purchaseQty: number }[],
    mode: ReceiveMode,
    status: ReceivingTask["status"],
    pos: number,
    started: boolean,
    ended: boolean,
  ): ReceivingTask {
    const n = seq++;
    const h = hash(r.id) + pos;
    const totalSkus = lineItemsForReceipt(r).length;
    const task: ReceivingTask = {
      id: `rtask-${n}`,
      taskNo: `Receiving #${n}`,
      receiptId: r.id,
      purchaseNo: r.purchaseNo,
      warehouseId: r.warehouseId,
      warehouseName: r.warehouseName,
      assignee: operatorForWarehouse(r.warehouseId, pos),
      items: buildItems(lines, mode, h, pos),
      skuScope: "",
      skuCount: 0,
      purchaseQty: 0,
      receivedQty: 0,
      status,
      createdDate: isoAt(-(5 + (h % 6)), 9, (h * 3) % 60),
      startDate: started ? isoAt(-(3 + (h % 6)), 8 + (h % 4), (h * 7) % 60) : undefined,
      endDate: ended ? isoAt(-(1 + (h % 3)), 16 + (h % 3), (h * 11) % 60) : undefined,
    };
    syncTaskTotals(task, totalSkus);
    return task;
  }

  for (const r of receipts) {
    if (r.status === "canceled") continue; // state H — no tasks
    const lines = lineItemsForReceipt(r);
    if (!lines.length) continue;
    const h = hash(r.id);

    if (r.status === "completed") {
      // state D/E: one task, all SKUs, fully received → pending put-away
      // (some get promoted to "completed" + a put-away by the put-away seed)
      out.push(make(r, lines, "full", "pending put-away", 0, true, true));
    } else if (r.status === "partial reception") {
      if (h % 2 === 0) {
        // state F: one task, all SKUs, short qty
        out.push(make(r, lines, "short", "pending put-away", 0, true, true));
      } else {
        // state G: task1 covers a subset (full), task2 covers the rest (open)
        const cut = Math.max(1, Math.floor(lines.length * 0.6));
        out.push(make(r, lines.slice(0, cut), "full", "pending put-away", 0, true, true));
        out.push(make(r, lines.slice(cut), "zero", "open", 1, false, false));
      }
    } else {
      // "on the way" (Open). Most → no task (state A); a few → B/C.
      const bucket = h % 5;
      if (bucket === 0) out.push(make(r, lines, "zero", "open", 0, false, false)); // B
      else if (bucket === 1) out.push(make(r, lines, "partial", "in progress", 0, true, false)); // C
      // else: no task (state A)
    }
  }
  return out;
}

// ── Store (flat tasks) + derived PO grouping ─────────────────────────────────────
// Seed task IDs are in the rtask-1XXXX range; user-created start at rtask-30000+.
const SEED_ID_RE = /^rtask-1\d{4}$/;

/**
 * Migration: patch a loaded snapshot so that seed tasks (rtask-1XXXX, any status
 * including in-progress drafts) with receivedQty > 0 but no batch/serial breakdown
 * for batch- or serial-tracked SKUs get deterministic detail backfilled. User-created
 * tasks are never touched.
 */
function patchSnapshotSerials(snap: ReceivingTask[]): ReceivingTask[] {
  return snap.map((t) => {
    if (!SEED_ID_RE.test(t.id)) return t; // user-created — never modify
    const needsPatch = t.items.some(
      (it) =>
        (isSerialSku(it.sku) && it.receivedQty > 0 && !it.serialNumbers?.length) ||
        (isBatchSku(it.sku) && it.receivedQty > 0 && !it.batchLines?.length),
    );
    if (!needsPatch) return t;
    const h = hash(t.id);
    return {
      ...t,
      items: t.items.map((it, i) => {
        if (isSerialSku(it.sku) && it.receivedQty > 0 && !it.serialNumbers?.length) {
          return { ...it, serialNumbers: seedSerials(it.sku, it.receivedQty, h * 3 + i * 10) };
        }
        if (isBatchSku(it.sku) && it.receivedQty > 0 && !it.batchLines?.length) {
          return { ...it, batchLines: seedBatchLines(it.unit, it.receivedQty, h * 3 + i * 10) };
        }
        return it;
      }),
    };
  });
}

/**
 * Migration: backfill targetQty on any snapshot saved before this field existed
 * (both seed AND user-created tasks — this is a structural-field default, not a
 * business-data backfill, so it isn't scoped to SEED_ID_RE like the one above).
 * Defaults to expectedQty (Purchase qty), matching every task's actual behavior
 * before "Expected qty" existed as its own concept.
 */
function patchMissingTargetQty(snap: ReceivingTask[]): ReceivingTask[] {
  return snap.map((t) => {
    if (t.items.every((it) => it.targetQty !== undefined)) return t;
    return { ...t, items: t.items.map((it) => ({ ...it, targetQty: it.targetQty ?? it.expectedQty })) };
  });
}

const _snap = loadSnapshot<ReceivingTask>("receiving");
const snapshot = _snap ? patchMissingTargetQty(patchSnapshotSerials(_snap)) : null;
export const receivingTasks = reactive<ReceivingTask[]>(snapshot ?? seedTasks());

/** PO grouping used by the Receiving index — derived from the flat task store. */
export const receivingPOs = reactive<ReceivingPO[]>([]);

function rebuildPOs(): void {
  const byReceipt = new Map<string, ReceivingTask[]>();
  for (const t of receivingTasks) {
    const list = byReceipt.get(t.receiptId);
    if (list) list.push(t);
    else byReceipt.set(t.receiptId, [t]);
  }
  const pos: ReceivingPO[] = [];
  for (const [receiptId, tasks] of byReceipt) {
    const r = receipts.find((x) => x.id === receiptId);
    pos.push({
      id: `rpo-${receiptId}`,
      purchaseNo: r?.purchaseNo ?? tasks[0]!.purchaseNo,
      warehouseId: tasks[0]!.warehouseId,
      warehouseName: tasks[0]!.warehouseName,
      estimatedArrival: r?.estimatedArrival ?? "",
      receiptId,
      tasks,
    });
  }
  receivingPOs.splice(0, receivingPOs.length, ...pos);
}

function persistTasks(): void {
  saveSnapshot("receiving", receivingTasks);
  rebuildPOs();
}

// On first load (no snapshot) the seed just derived nothing yet — make sure each
// receipt's status reflects its seed tasks, then persist both snapshots.
function initInbound(): void {
  rebuildPOs();
  if (!_snap) {
    // Fresh seed — derive receipt statuses from tasks
    const ids = new Set(receivingTasks.map((t) => t.receiptId));
    ids.forEach((id) => recomputeReceiptStatus(id));
  }
  // Always persist: captures fresh seed OR patched snapshot with added SNs
  saveSnapshot("receiving", receivingTasks);
}

// ── PO status derivation ─────────────────────────────────────────────────────────
/** Re-derive a receipt's status (Open / Partial reception / Completed) from its tasks. */
export function recomputeReceiptStatus(receiptId: string): void {
  const r = receipts.find((x) => x.id === receiptId);
  if (!r || r.status === "canceled") return;
  const lines = lineItemsForReceipt(r);
  const tasks = receivingTasks.filter((t) => t.receiptId === receiptId);
  const ended = tasks.filter((t) => t.status === "pending put-away" || t.status === "completed");

  const received: Record<string, number> = {};
  for (const t of ended)
    for (const it of t.items) received[it.sku] = (received[it.sku] ?? 0) + it.receivedQty;

  r.receivedQty = Object.values(received).reduce((s, n) => s + n, 0);

  if (ended.length === 0) {
    r.status = "on the way"; // Open — nothing ended yet
  } else if (lines.every((l) => (received[l.sku] ?? 0) >= l.purchaseQty)) {
    r.status = "completed";
    r.receivedDate = r.receivedDate ?? nowIso().slice(0, 10);
  } else {
    r.status = "partial reception";
  }
  persistReceipts();
}

// ── SKU coverage (which SKUs already belong to a task) ───────────────────────────
export function coverageForReceipt(receiptId: string): Set<string> {
  const covered = new Set<string>();
  for (const t of receivingTasks)
    if (t.receiptId === receiptId) for (const it of t.items) covered.add(it.sku);
  return covered;
}

/** Per-SKU qty already spoken for on this receipt — either physically received
 *  by an ENDED task ("pending put-away"/"completed", its real receivedQty), or
 *  claimed by a still-open/in-progress task (its own planned targetQty, not
 *  necessarily received yet). A SKU can be split across more than one
 *  concurrent task this way, as long as their combined claim never exceeds the
 *  line's Purchase qty — used everywhere "how much of this SKU is left to
 *  receive" needs to account for BOTH, so a second task can't re-claim units
 *  an open task already has dibs on. */
export function claimedQtyBySku(receiptId: string): Record<string, number> {
  const claimed: Record<string, number> = {};
  for (const t of receivingTasks) {
    if (t.receiptId !== receiptId) continue;
    if (t.status === "open" || t.status === "in progress") {
      for (const it of t.items) claimed[it.sku] = (claimed[it.sku] ?? 0) + it.targetQty;
    } else if (t.status === "pending put-away" || t.status === "completed") {
      for (const it of t.items) claimed[it.sku] = (claimed[it.sku] ?? 0) + it.receivedQty;
    }
  }
  return claimed;
}

/** PO line items that still need receiving: purchaseQty exceeds what's already
 *  claimed across every task on this receipt (open/in-progress claims by their
 *  own targetQty, ended tasks by their real receivedQty) — never a blanket
 *  "any open task touches this SKU at all" exclusion, so a SKU only partially
 *  targeted by an open task still offers its real remainder to a new one. */
export function uncoveredLineItems(
  receiptId: string,
): { sku: string; productName: string; unit: string; purchaseQty: number }[] {
  const r = receipts.find((x) => x.id === receiptId);
  if (!r) return [];
  const claimed = claimedQtyBySku(receiptId);
  return lineItemsForReceipt(r).filter((l) => (claimed[l.sku] ?? 0) < l.purchaseQty);
}

/** A receiving task can be created while uncovered SKUs remain (and PO isn't canceled). */
export function canCreateReceivingTask(receiptId: string): boolean {
  const r = receipts.find((x) => x.id === receiptId);
  if (!r || r.status === "canceled" || r.status === "completed") return false;
  const claimed = claimedQtyBySku(receiptId);
  return lineItemsForReceipt(r).some((l) => (claimed[l.sku] ?? 0) < l.purchaseQty);
}

// ── Mutations (state machine) ────────────────────────────────────────────────────
let nextSeq = 30000;
function freshSeq(): number {
  // keep created ids clear of the 10090… seed range and of each other
  const used = receivingTasks
    .map((t) => Number(t.taskNo.replace(/\D/g, "")))
    .filter((n) => n >= 30000);
  nextSeq = Math.max(nextSeq, ...used, 29999) + 1;
  return nextSeq;
}

/**
 * Admin creates an Open receiving task covering the given SKUs (a subset of the
 * receipt's uncovered SKUs). PO status is unchanged. Returns the new task.
 */
export function createReceivingTask(opts: {
  receiptId: string;
  assignee: string;
  skus: string[];
  /** Per-SKU "Expected qty" from the Create Purchase Receiving form — how much
   *  is realistically expected THIS task, distinct from (and never above) the
   *  SKU's outstanding qty (Purchase qty minus whatever's already claimed
   *  elsewhere on this same receipt — ended tasks' real receivedQty, plus any
   *  other still-open/in-progress task's own targetQty). Any SKU left out, or
   *  given a value above its own outstanding qty, just defaults to the
   *  outstanding qty. */
  targetQtyBySku?: Record<string, number>;
}): ReceivingTask | null {
  const r = receipts.find((x) => x.id === opts.receiptId);
  if (!r) return null;
  const lines = lineItemsForReceipt(r);
  const chosen = lines.filter((l) => opts.skus.includes(l.sku));
  if (!chosen.length) return null;

  const claimed = claimedQtyBySku(r.id);

  const n = freshSeq();
  const task: ReceivingTask = {
    id: `rtask-${n}`,
    taskNo: `Receiving #${n}`,
    receiptId: r.id,
    purchaseNo: r.purchaseNo,
    warehouseId: r.warehouseId,
    warehouseName: r.warehouseName,
    assignee: opts.assignee || operatorForWarehouse(r.warehouseId, 0),
    items: chosen.map((l) => {
      const outstanding = Math.max(0, l.purchaseQty - (claimed[l.sku] ?? 0));
      const target = opts.targetQtyBySku?.[l.sku];
      return {
        sku: l.sku,
        productName: l.productName,
        unit: l.unit,
        expectedQty: l.purchaseQty,
        targetQty: target === undefined ? outstanding : Math.min(Math.max(0, target), outstanding),
        receivedQty: 0,
      };
    }),
    skuScope: "",
    skuCount: 0,
    purchaseQty: 0,
    receivedQty: 0,
    status: "open",
    createdDate: nowIso(),
  };
  syncTaskTotals(task, lines.length);
  receivingTasks.unshift(task);
  persistTasks();
  return task;
}

export function getReceivingTask(taskId: string): ReceivingTask | undefined {
  return receivingTasks.find((t) => t.id === taskId);
}

/** Operator starts receiving → In progress + start timestamp. */
export function startReceiving(taskId: string): void {
  const t = getReceivingTask(taskId);
  if (!t || t.status !== "open") return;
  t.status = "in progress";
  t.startDate = nowIso();
  persistTasks();
}

/** A receiving task can only be canceled while receiving hasn't finished yet —
 *  "pending put-away"/"completed" mean the PO's outstanding qty already counts
 *  this task's receivedQty (see recomputeReceiptStatus/uncoveredLineItems), so
 *  canceling it at that point would silently make received stock unaccounted
 *  for. The task itself never touches real on-hand stock directly (that only
 *  happens downstream at put-away), so canceling here has nothing to revert. */
export function canCancelReceivingTask(t: ReceivingTask): boolean {
  return t.status === "open" || t.status === "in progress";
}

/** Cancel a not-yet-finished receiving task — its SKUs simply become uncovered
 *  again (uncoveredLineItems only excludes open/in-progress tasks), so a new
 *  receiving task can be created for them. Terminal state; the record itself is
 *  kept (never deleted) so it stays in the audit trail. */
export function cancelReceivingTask(taskId: string, reason?: string): void {
  const t = getReceivingTask(taskId);
  if (!t || !canCancelReceivingTask(t)) return;
  t.status = "canceled";
  t.canceledDate = nowIso();
  if (reason) t.canceledReason = reason;
  persistTasks();
}

function applyReceivingDetail(
  t: ReceivingTask,
  received: Record<string, number>,
  detail?: Record<string, ReceivingItemDetail>,
): void {
  for (const it of t.items) {
    if (received[it.sku] != null) it.receivedQty = Math.max(0, received[it.sku]!);
    const d = detail?.[it.sku];
    if (d?.batchLines) it.batchLines = d.batchLines;
    if (d?.serialNumbers) it.serialNumbers = d.serialNumbers;
  }
}

/** Save received qty per SKU (manual save or autosave) — stays In progress. */
export function saveReceivingDraft(
  taskId: string,
  received: Record<string, number>,
  detail?: Record<string, ReceivingItemDetail>,
): void {
  const t = getReceivingTask(taskId);
  if (!t) return;
  applyReceivingDetail(t, received, detail);
  const lines = lineItemsForReceipt(receipts.find((x) => x.id === t.receiptId)!);
  syncTaskTotals(t, lines.length);
  persistTasks();
}

/**
 * Operator ends receiving → end timestamp; re-derive PO status. Goes to
 * "pending put-away" normally, or straight to "completed" when put-away is
 * disabled for this task's warehouse (see app/data/warehouseConfig.ts).
 */
export function endReceiving(
  taskId: string,
  received?: Record<string, number>,
  detail?: Record<string, ReceivingItemDetail>,
): void {
  const t = getReceivingTask(taskId);
  if (!t) return;
  if (received) applyReceivingDetail(t, received, detail);
  const lines = lineItemsForReceipt(receipts.find((x) => x.id === t.receiptId)!);
  syncTaskTotals(t, lines.length);
  t.status = getWarehouseConfig(t.warehouseId).putAwayEnabled ? "pending put-away" : "completed";
  t.endDate = nowIso();
  persistTasks();
  recomputeReceiptStatus(t.receiptId);
}

/** A put-away task consumed this receiving task → mark Completed. */
export function linkPutAway(taskId: string, putAwayTaskId: string): void {
  const t = getReceivingTask(taskId);
  if (!t) return;
  t.putAwayTaskId = putAwayTaskId;
  t.status = "completed";
  persistTasks();
}

/**
 * Put-away was just disabled for this task's warehouse while it sat in
 * "pending put-away" with no put-away task ever created — finish it directly,
 * matching the new normal for that warehouse (no putAwayTaskId to link).
 */
export function completeReceivingWithoutPutAway(taskId: string): void {
  const t = getReceivingTask(taskId);
  if (!t) return;
  t.status = "completed";
  persistTasks();
}

/**
 * Legacy entry point kept for the existing create flow — delegates to
 * {@link createReceivingTask}, covering the receipt's first `skuCount` uncovered
 * SKUs. (The create page is migrated to createReceivingTask + a coverage picker.)
 */
export function addReceivingTask(opts: {
  receiptId: string;
  assignee: string;
  skuCount?: number;
  skus?: string[];
}): ReceivingTask | null {
  const skus =
    opts.skus ?? uncoveredLineItems(opts.receiptId).slice(0, opts.skuCount ?? 99).map((l) => l.sku);
  return createReceivingTask({ receiptId: opts.receiptId, assignee: opts.assignee, skus });
}

// ── Read helpers (unchanged signatures) ──────────────────────────────────────────
export function receivingTaskRefsForWarehouse(
  warehouseId: string,
): Array<{ id: string; no: string; assignee: string; status: ReceivingTask["status"] }> {
  return receivingTasks
    .filter((t) => t.warehouseId === warehouseId)
    .map((t) => ({ id: t.id, no: t.taskNo, assignee: t.assignee, status: t.status }));
}

export function receivingPOsFor(warehouseIds?: string[]): ReceivingPO[] {
  return warehouseIds?.length
    ? receivingPOs.filter((po) => warehouseIds.includes(po.warehouseId))
    : receivingPOs;
}

export function receivingQueuePOs(warehouseIds?: string[]): ReceivingPO[] {
  return receivingPOsFor(warehouseIds).filter((po) => po.tasks.some((t) => t.status !== "completed"));
}

export function receivingOpenCount(warehouseIds?: string[]): number {
  return receivingPOsFor(warehouseIds)
    .flatMap((po) => po.tasks)
    .filter((t) => t.status !== "completed" && t.status !== "canceled").length;
}

/** Receiving tasks for a receipt (used by the receipt detail "Purchase receiving" tab). */
export function receivingTasksForReceipt(receiptId: string): ReceivingTask[] {
  return receivingTasks.filter((t) => t.receiptId === receiptId);
}

/**
 * Per-SKU received summary for a receipt — aggregated across its ENDED receiving
 * tasks (the officially-received goods). Drives the receipt detail's line-items
 * "Received qty" / "Received by" so they reflect what was actually received.
 */
export function receivedSummaryForReceipt(
  receiptId: string,
): Record<string, { received: number; assignee: string }> {
  const out: Record<string, { received: number; assignee: string }> = {};
  for (const t of receivingTasks) {
    if (t.receiptId !== receiptId) continue;
    if (t.status !== "pending put-away" && t.status !== "completed") continue;
    for (const it of t.items) {
      if (!out[it.sku]) out[it.sku] = { received: 0, assignee: "—" };
      out[it.sku]!.received += it.receivedQty;
      if (it.receivedQty > 0) out[it.sku]!.assignee = t.assignee;
    }
  }
  return out;
}

const RECEIVING_ACTIVE: ReceivingTask["status"][] = ["open", "in progress", "pending put-away"];

export function activeReceivingTasksFor(warehouseId: string, assignee: string): ReceivingTask[] {
  return receivingTasks.filter(
    (t) => t.warehouseId === warehouseId && t.assignee === assignee && (RECEIVING_ACTIVE as string[]).includes(t.status),
  );
}

export function reassignReceivingTasks(warehouseId: string, fromName: string, toName: string): void {
  for (const t of activeReceivingTasksFor(warehouseId, fromName)) t.assignee = toName;
  persistTasks();
}

initInbound();
