/**
 * WMS Analytics — Operational quick-view derivations (WMS PRD 1.4, user stories
 * 2 & 3). Live counts computed from the mock data, scoped by warehouse + operator
 * + a single date, bucketed against each item's expected date (estimatedArrival /
 * dueDate): due ON the filtered date, BEFORE it, or AFTER it.
 *
 * Mock "today" is 2026-06-26 (data/master.ts TODAY), so the page defaults its date
 * filter to that — comparing against the real current date would show ~nothing.
 */
import { receipts } from "./receipts";
import { receivingTasks } from "./receivingTasks";
import { putAwayTasks } from "./putAwayTasks";
import { outgoingOrders } from "./outgoing";
import { pickingTasks } from "./pickingTasks";
import { packingTasks } from "./packingTasks";
import { deliveryTasks } from "./deliveryTasks";

export interface Bucket2 { total: number; onDate: number; before: number }
export interface Bucket3 { total: number; onDate: number; before: number; after: number }
export interface InboundQuickview { pending: Bucket2; receiving: Bucket3; putaway: Bucket3; closed: Bucket3 }
export interface OutboundQuickview { pending: Bucket2; picking: Bucket3; packing: Bucket3; shipping: Bucket3 }

/** Operator filter value: 'all' (no filter), 'not-assigned' (no assignee), or an assignee name. */
export type OperatorFilter = string;

const dateOnly = (iso: string | undefined) => (iso ?? "").slice(0, 10);

function inWh(warehouseId: string, whIds?: string[]) {
  return !whIds || whIds.length === 0 || whIds.includes(warehouseId);
}
function opOk(assignee: string | undefined, operator: OperatorFilter) {
  if (operator === "all") return true;
  if (operator === "not-assigned") return !assignee;
  return assignee === operator;
}

function bucket3(dates: string[], d: string): Bucket3 {
  let onDate = 0, before = 0, after = 0;
  for (const raw of dates) {
    const a = dateOnly(raw);
    if (!a) continue;
    if (a === d) onDate++;
    else if (a < d) before++;
    else after++;
  }
  return { total: dates.length, onDate, before, after };
}
function bucket2(dates: string[], d: string): Bucket2 {
  let onDate = 0, before = 0;
  for (const raw of dates) {
    const a = dateOnly(raw);
    if (a === d) onDate++;
    else if (a && a < d) before++;
  }
  return { total: dates.length, onDate, before };
}

// ── Inbound (US2) ────────────────────────────────────────────────────────────
export function inboundQuickview(dateIso: string, whIds?: string[], operator: OperatorFilter = "all"): InboundQuickview {
  const d = dateOnly(dateIso);

  // Pending — no work started yet (operator filter N/A per PRD).
  const pendingReceipts = receipts.filter(r => inWh(r.warehouseId, whIds) && (r.status === "pending" || r.status === "open"));
  const pending = bucket2(pendingReceipts.map(r => r.estimatedArrival), d);

  // On receiving — receipts with an in-progress receiving task (operator-filtered).
  const recReceiptIds = new Set(
    receivingTasks.filter(t => inWh(t.warehouseId, whIds) && t.status === "in progress" && opOk(t.assignee, operator)).map(t => t.receiptId),
  );
  const receiving = bucket3(receipts.filter(r => recReceiptIds.has(r.id)).map(r => r.estimatedArrival), d);

  // On putaway — active put-away task (open/in progress) linked back to its receipt.
  const recTaskById = new Map(receivingTasks.map(t => [t.id, t]));
  const paReceiptIds = new Set<string>();
  for (const t of putAwayTasks) {
    if (!inWh(t.warehouseId, whIds) || !(t.status === "open" || t.status === "in progress") || !opOk(t.assignee, operator)) continue;
    for (const rid of t.receivingTaskIds) { const rt = recTaskById.get(rid); if (rt) paReceiptIds.add(rt.receiptId); }
  }
  const putaway = bucket3(receipts.filter(r => paReceiptIds.has(r.id)).map(r => r.estimatedArrival), d);

  // Closed — completed inbound (operator filter N/A per PRD).
  const closedReceipts = receipts.filter(r => inWh(r.warehouseId, whIds) && r.status === "completed");
  const closed = bucket3(closedReceipts.map(r => r.estimatedArrival), d);

  return { pending, receiving, putaway, closed };
}

// ── Outbound (US3) ───────────────────────────────────────────────────────────
export function outboundQuickview(dateIso: string, whIds?: string[], operator: OperatorFilter = "all"): OutboundQuickview {
  const d = dateOnly(dateIso);

  const pendingOrders = outgoingOrders.filter(o => inWh(o.warehouseId, whIds) && (o.status === "pending" || o.status === "open"));
  const pending = bucket2(pendingOrders.map(o => o.dueDate), d);

  const pickingOrderIds = new Set<string>();
  for (const t of pickingTasks) {
    if (!inWh(t.warehouseId, whIds) || !(t.status === "open" || t.status === "in progress") || !opOk(t.assignee, operator)) continue;
    for (const oid of t.salesOrderIds) pickingOrderIds.add(oid);
  }
  const picking = bucket3(outgoingOrders.filter(o => pickingOrderIds.has(o.id)).map(o => o.dueDate), d);

  const packingOrderIds = new Set(
    packingTasks.filter(t => inWh(t.warehouseId, whIds) && (t.status === "open" || t.status === "in progress") && opOk(t.assignee, operator)).map(t => t.salesOrderId),
  );
  const packing = bucket3(outgoingOrders.filter(o => packingOrderIds.has(o.id)).map(o => o.dueDate), d);

  const shippingOrderIds = new Set(
    deliveryTasks.filter(t => inWh(t.warehouseId, whIds) && (t.status === "ready to ship" || t.status === "out for delivery") && opOk(t.assignee, operator)).map(t => t.salesOrderId),
  );
  const shipping = bucket3(outgoingOrders.filter(o => shippingOrderIds.has(o.id)).map(o => o.dueDate), d);

  return { pending, picking, packing, shipping };
}

/** Distinct assignee names present on any task in the given warehouse scope — the
 *  Operator filter pool (plus the "All" / "Not assigned" pseudo-values the UI adds). */
export function operatorNames(whIds?: string[]): string[] {
  const names = new Set<string>();
  const add = (wh: string, a?: string) => { if (a && inWh(wh, whIds)) names.add(a); };
  receivingTasks.forEach(t => add(t.warehouseId, t.assignee));
  putAwayTasks.forEach(t => add(t.warehouseId, t.assignee));
  pickingTasks.forEach(t => add(t.warehouseId, t.assignee));
  packingTasks.forEach(t => add(t.warehouseId, t.assignee));
  deliveryTasks.forEach(t => add(t.warehouseId, t.assignee));
  return [...names].sort((a, b) => a.localeCompare(b));
}
