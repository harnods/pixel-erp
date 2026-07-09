import { reactive } from "vue";
import { warehouses } from "./warehouses";
import { loadSnapshot, saveSnapshot } from "./persist";
import { TODAY } from './master'
import { getWarehouseConfig } from './warehouseConfig'
import { orderSkuLines } from './inventory'
import {
  getWarehouseDetail,
  autoSelectLocationBins,
  autoSelectBatches,
  autoSelectSerials,
  reserveStock,
  releaseReservationsForTask,
  hasReservationsForTask,
} from './warehouseDetails'

/** Outbound order status. */
export type OutgoingStatus =
  | "open"
  | "in progress"
  | "partially shipped"
  | "completed"
  | "canceled";

/** An outbound order (Outbound delivery → Outgoing): a sales order whose goods are
 *  leaving the warehouse. Mirrors {@link Receipt} on the inbound side — the source
 *  document is a Sales Order rather than a Purchase Order, and the goods flow OUT
 *  (picking → packing → delivery) rather than IN (receiving → put-away). */
export interface OutgoingOrder {
  id: string;
  /** outbound dispatch number, e.g. OUT-2026-0001 */
  number: string;
  /** source sales order number, e.g. "Sales Order #10090" */
  salesNo: string;
  /** where the order originated: "Sales Order" (ERP), "Manual", or a Desty
   *  marketplace channel "{Marketplace}: {store name}" (e.g. "Shopee: Central Perk"). */
  source: string;
  warehouseId: string;
  warehouseName: string;
  /** distinct SKUs ordered */
  skuQty: number;
  /** total units ordered to ship out */
  orderQty: number;
  /** units shipped so far (0 = none, < orderQty = partial, = orderQty = full) */
  shippedQty: number;
  status: string;
  /** ISO date the goods fully left the warehouse (completed orders only) */
  shippedDate?: string;
  /** ISO date the order was canceled (canceled orders only) */
  canceledDate?: string;
  /** why the order was canceled (canceled orders only) */
  canceledReason?: string;
  /** who canceled the order (canceled orders only) */
  canceledBy?: string;
  /** ISO date the order is due to leave the warehouse */
  dueDate: string;
  /** free-text memo the back-office writes on the order (optional) — e.g.
   *  "BATCH # 35 -- 31/03/2026 - 2 Koli". */
  memo?: string;
  /** customer — set on user-created orders; seed orders derive it by hash. */
  customer?: string;
}

// Anchor "today" so the due-date presets line up with the mock data.
export const OUTGOING_TODAY = TODAY

// Outbound orders ship from real (non-default, active) warehouses.
const SHIPPING_WAREHOUSES = warehouses.filter(
  (w) => !w.isDefault && w.status === "active",
);

function isoOffset(days: number): string {
  const d = new Date(OUTGOING_TODAY);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Back-office memo — present on ~2/3 of rows.
function generateMemo(i: number, dueIso: string): string | undefined {
  if (i % 3 === 1) return undefined // ~1/3 have no memo
  const batch = ((i * 7) % 80) + 1
  const koli = ((i * 3) % 8) + 1
  const d = new Date(dueIso)
  d.setDate(d.getDate() - 5)
  const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  return `BATCH # ${batch} -- ${dateStr} - ${koli} Koli`
}

// Units shipped so far, derived from the status:
//  - open / in progress → 0 (nothing has left yet)
//  - partially shipped → shipped short of the full qty (varied, never full)
//  - completed → shipped in full (or accepted short)
function computeShipped(i: number, status: string, orderQty: number): number {
  switch (status) {
    case "completed":
      // ~4 of 10 completed orders shipped short (accepted as partial)
      if (i % 3 === 0) {
        const fractions = [0.65, 0.78, 0.88, 0.72, 0.91];
        const f = fractions[(i / 3) % fractions.length];
        return Math.min(orderQty - 1, Math.max(1, Math.round(orderQty * f)));
      }
      return orderQty;
    case "partially shipped": {
      const fractions = [0.35, 0.5, 0.6, 0.75, 0.45, 0.8, 0.55, 0.3];
      const f = fractions[i % fractions.length];
      // never 0 and never the full qty
      return Math.min(orderQty - 1, Math.max(1, Math.round(orderQty * f)));
    }
    default:
      return 0; // open / in progress
  }
}

// Deterministic 0–99 hash with bit-mixing (xorshift-multiply finalizer) so values
// are well scattered — no banding or repeating pattern down the list.
function hash100(i: number): number {
  let x = ((i + 1) * 2654435761) >>> 0;
  x ^= x >>> 15;
  x = (x * 2246822519) >>> 0;
  x ^= x >>> 13;
  return (x >>> 0) % 100;
}

// Future due-date windows for in-warehouse (not-yet-shipped) orders — spread so each
// due-date preset (today / tomorrow / next 7 days / this month / beyond) hits some.
const FUTURE_OFFSETS = [0, 1, 2, 3, 4, 5, 6, 7, 9, 12, 18, 23, 27, 34, 40];

/**
 * Deterministic per-SKU line quantity for an order — small, realistic (1..5 units
 * per SKU). Shared with the picking form (via seed = numeric order id) so the
 * order total (orderQty) and the per-SKU breakdown always agree.
 */
export function skuLineQty(seed: number, i: number): number {
  return ((seed * 13 + i * 7) % 5) + 1; // 1..5
}

// Desty omnichannel marketplaces + the seller's store name shown as the source.
const MARKETPLACES = ['Shopee', 'Shopee', 'Lazada', 'TikTok Shop', 'Blibli']
const STORE_NAME = 'Central Perk'

/**
 * True when an order came from a Desty marketplace channel — its source is
 * "{Marketplace}: {store name}" (e.g. "Shopee: Central Perk"). ERP ("Sales Order")
 * and manual ("Manual") orders return false. Marketplace orders are fulfilled in
 * full: their SKU lines cannot be deselected during picking or packing.
 */
export function isMarketplaceOrder(o: OutgoingOrder | undefined | null): boolean {
  return !!o && o.source !== "Sales Order" && o.source !== "Manual" && o.source.includes(":");
}

// Customers the outbound orders ship to (parallels the receipt vendor).
const CUSTOMERS = [
  'Anomali Coffee', 'Tanamera Coffee Roastery', 'Hotel Mulia Senayan',
  'Fore Coffee Thamrin', 'Djournal Coffee', 'Kopi Kenangan Pusat',
  'Common Grounds PIK', 'Titik Temu Coffee', 'Maxx Coffee Lippo Mall',
  'Janji Jiwa Kemang', 'Tuku Coffee Cipete', 'Excelso Grand Indonesia',
]

/**
 * Status for order i — weighted to feel like a real outbound queue: mostly Open +
 * Completed, fewer In progress / Partially shipped. Canceled is appended separately.
 */
function statusFor(i: number): string {
  const h = hash100(i);
  if (h < 30) return "open";              // ~30% awaiting fulfillment
  if (h < 52) return "in progress";       // ~22% being picked/packed
  if (h < 67) return "partially shipped"; // ~15% shipped short
  return "completed";                     // ~33% fully shipped
}

/** Deterministic mock — ~42 orders spread across warehouses, statuses and dates. */
function generateOrders(count = 42): OutgoingOrder[] {
  const out: OutgoingOrder[] = [];
  for (let i = 0; i < count; i++) {
    // Everything is scattered via the bit-mixed hash (different salts) so there's no
    // visible cadence — warehouses, channels, customers and due times all vary.
    const wh = SHIPPING_WAREHOUSES[hash100(i * 3 + 1) % SHIPPING_WAREHOUSES.length];
    const status = statusFor(i);
    const hasLeft = status === "completed" || status === "partially shipped";
    // ~38% of orders come from a Desty marketplace channel (scattered, no pattern).
    const fromDesty = hash100(i * 7 + 13) % 100 < 38;
    // Due: shipped → recent past; marketplace still in the warehouse → today/tomorrow
    // (time-sensitive, many inside the 24h "expire" window); ERP → spread upcoming.
    const offset = hasLeft
      ? -((hash100(i * 5) % 26) + 2)                          // 2–27 days ago
      : fromDesty
        ? hash100(i * 9) % 2                                  // today / tomorrow (urgent)
        : FUTURE_OFFSETS[hash100(i * 13) % FUTURE_OFFSETS.length];
    // Desty orders carry an end-of-day cut-off (23:59); ERP/manual orders are date-only.
    const dueDate = fromDesty ? `${isoOffset(offset)}T23:59:00` : isoOffset(offset);
    const skuQty = (hash100(i * 23) % 8) + 1; // 1..8 distinct SKUs
    let orderQty = 0;
    for (let s = 0; s < skuQty; s++) orderQty += skuLineQty(i + 1, s); // 1..5 units per SKU
    // Sales no. comes from two sources, each with its own format:
    //  - ERP Sales Order menu → "Sales Order #10090"
    //  - Desty (marketplace fulfillment) → "#SO060"
    const salesNo = fromDesty
      ? `#SO${String(60 + i).padStart(3, "0")}`
      : `Sales Order #${10090 + i}`;
    const source = fromDesty ? `${MARKETPLACES[hash100(i * 29) % MARKETPLACES.length]}: ${STORE_NAME}` : "Sales Order";
    out.push({
      id: `out-${String(i + 1).padStart(3, "0")}`,
      number: `OUT-2026-${String(i + 1).padStart(4, "0")}`,
      salesNo,
      source,
      warehouseId: wh.id,
      warehouseName: wh.name,
      skuQty,
      orderQty,
      shippedQty: computeShipped(i, status, orderQty),
      status,
      // completed orders fully shipped between due date and today
      shippedDate: status === "completed" ? isoOffset(-((i % 10) + 1)) : undefined,
      dueDate,
      memo: generateMemo(i, isoOffset(offset)),
      customer: CUSTOMERS[hash100(i * 31) % CUSTOMERS.length],
    });
  }
  return out;
}

/**
 * Orders that have already left (fully shipped → "completed") or shipped short
 * ("partially shipped"). Their full picking → packing → delivery chain is wired up
 * in the task seeds (see pickingTasks/packingTasks/deliveryTasks) so the derived
 * status agrees and the linked transactions are fully populated. Completed orders
 * are picked/packed/shipped in full; partial ones are short-picked on their last SKU.
 */
function generateShipped(count = 10): OutgoingOrder[] {
  const out: OutgoingOrder[] = [];
  for (let k = 0; k < count; k++) {
    const partial = k % 3 === 2; // ~1/3 partially shipped, the rest completed
    const i = 200 + k; // numbering kept clear of active (0–41) and canceled (100+) orders
    const id = `out-sh-${String(k + 1).padStart(3, "0")}`;
    const seed = Number(id.replace(/\D/g, "")); // numeric id → agrees with buildPickingLines
    const wh = SHIPPING_WAREHOUSES[hash100(i * 3 + 1) % SHIPPING_WAREHOUSES.length];
    // partial orders need ≥2 SKUs so a short pick on the last SKU still leaves some shipped.
    const skuQty = partial ? (hash100(i * 23) % 4) + 2 : (hash100(i * 23) % 6) + 1;
    let orderQty = 0;
    for (let s = 0; s < skuQty; s++) orderQty += skuLineQty(seed, s);
    const fromDesty = hash100(i * 7 + 13) % 100 < 38;
    const salesNo = fromDesty
      ? `#SO${String(140 + k).padStart(3, "0")}`
      : `Sales Order #${10150 + k}`;
    const source = fromDesty ? `${MARKETPLACES[hash100(i * 29) % MARKETPLACES.length]}: ${STORE_NAME}` : "Sales Order";
    out.push({
      id,
      number: `OUT-2026-${String(800 + k).padStart(4, "0")}`,
      salesNo,
      source,
      warehouseId: wh.id,
      warehouseName: wh.name,
      skuQty,
      orderQty,
      shippedQty: 0, // re-derived by the sync from the delivery tasks
      status: partial ? "partially shipped" : "completed",
      shippedDate: isoOffset(-((k % 10) + 1)),
      dueDate: isoOffset(-((k % 12) + 2)),
      memo: generateMemo(i, isoOffset(-((k % 12) + 2))),
      customer: CUSTOMERS[hash100(i * 31) % CUSTOMERS.length],
    });
  }
  return out;
}

const CANCEL_REASONS = [
  "Customer canceled order",
  "Duplicate order",
  "Out of stock",
  "Payment not received",
  "Address unreachable",
  "Quality issue before dispatch",
];

// A handful of canceled orders — appended so the active stages keep their counts.
function generateCanceled(count = 7): OutgoingOrder[] {
  const out: OutgoingOrder[] = [];
  for (let k = 0; k < count; k++) {
    const i = 100 + k; // keep numbering clear of the active orders
    const wh = SHIPPING_WAREHOUSES[hash100(i * 3 + 1) % SHIPPING_WAREHOUSES.length];
    const skuQty = (hash100(i * 23) % 8) + 1; // 1..8 distinct SKUs
    let orderQty = 0;
    for (let s = 0; s < skuQty; s++) orderQty += skuLineQty(k + 1, s); // 1..5 units per SKU
    const fromDesty = hash100(i * 7 + 13) % 100 < 38;
    const salesNo = fromDesty
      ? `#SO${String(180 + k).padStart(3, "0")}`
      : `Sales Order #${10210 + k}`;
    const source = fromDesty ? `${MARKETPLACES[hash100(i * 29) % MARKETPLACES.length]}: ${STORE_NAME}` : "Sales Order";
    out.push({
      id: `out-cx-${String(k + 1).padStart(3, "0")}`,
      number: `OUT-2026-${String(900 + k).padStart(4, "0")}`,
      salesNo,
      source,
      warehouseId: wh.id,
      warehouseName: wh.name,
      skuQty,
      orderQty,
      shippedQty: 0,
      status: "canceled",
      canceledDate: isoOffset(-((k % 12) + 1)),
      canceledReason: CANCEL_REASONS[k % CANCEL_REASONS.length],
      canceledBy: ['Rizal Candra', 'Dewi Rahayu', 'Agus Firmansyah', 'Sari Indah'][hash100(i * 31) % 4],
      dueDate: isoOffset(-((k % 12) + 3)),
      memo: generateMemo(i, isoOffset(0)),
      customer: CUSTOMERS[hash100(i * 31) % CUSTOMERS.length],
    });
  }
  return out;
}

/**
 * Reserve this order's batch/serial-tracked SKU lines against the warehouse's
 * *current* selection rules (batch/serial/location, from Settings) — called once,
 * the moment an order becomes reservable (bootstrap below for already-open seed
 * orders, or addOutgoing() for a live-created one). Non-retroactive by construction:
 * whatever rule is live right now is what gets locked in for this order, and this
 * never runs again for it. Plain (non-batch/non-serial) SKUs are left unreserved —
 * same pre-existing boundary as picking-time reservation had.
 */
function reserveOrder(order: OutgoingOrder): void {
  const wh = getWarehouseDetail(order.warehouseId);
  if (!wh) return;
  const picks: { sku: string; batchNo?: string; qty: number; serials?: string[] }[] = [];
  for (const line of orderSkuLines(order)) {
    const item = wh.stock.find((s) => s.sku === line.sku);
    if (!item) continue;
    const preferredLocations = autoSelectLocationBins(order.warehouseId, line.sku, line.qty).map((b) => b.location);
    if (item.batches?.length) {
      for (const b of autoSelectBatches(order.warehouseId, line.sku, line.qty, preferredLocations)) {
        picks.push({ sku: line.sku, batchNo: b.batchNo, qty: b.take });
      }
    } else if (item.serials) {
      const serials = autoSelectSerials(order.warehouseId, line.sku, line.qty, preferredLocations);
      if (serials.length) picks.push({ sku: line.sku, qty: serials.length, serials });
    }
  }
  if (picks.length) reserveStock(order.id, order.warehouseId, picks);
}

// The outbound graph (orders + picking + packing + delivery) is persisted as a
// full snapshot so seed records mutated by the flow (status derivation, shipped
// qty) survive a refresh. A present snapshot wins over the freshly-built seed;
// "Reset demo data" clears it.
const outgoingSnapshot = loadSnapshot<OutgoingOrder>("outgoing");
export const outgoingOrders = reactive<OutgoingOrder[]>(
  outgoingSnapshot ?? [...generateOrders(), ...generateShipped(3), ...generateCanceled()],
);

// Only open / in-process orders are pickable. (An in-process order can still spawn
// additional pick lists for SKUs not yet on any list — the per-SKU check lives in
// pickingTasks.canPickOrder.)
const PICKABLE_STATUSES = ["open", "in progress"];

// Bootstrap-reserve every currently pickable (open / in-process) order once — stands
// in for "reserve when the SO enters Requests" since there's no live SO-creation flow
// yet (addOutgoing() below covers that path). An "in progress" seed order is one that
// already had picking activity start on some of its SKUs before the app "boots" — it
// still needs its own reservation, same as if it were still "open". Guarded by
// hasReservationsForTask so a page reload never double-reserves an already-covered order.
for (const o of outgoingOrders) {
  if (PICKABLE_STATUSES.includes(o.status) && !hasReservationsForTask(o.id)) reserveOrder(o);
}

/** Orders with a pre-wired shipped chain — consumed by the task seeds. `partial`
 *  short-picks the last SKU so the order lands on "partially shipped". */
export interface ShippedSeed { id: string; partial: boolean }
export const shippedSeeds: ShippedSeed[] = outgoingOrders
  .filter((o) => o.id.startsWith("out-sh-"))
  .map((o) => ({ id: o.id, partial: o.status === "partially shipped" }));

/** Persist the outgoing snapshot (call after any mutation). */
export function persistOutgoing(): void {
  saveSnapshot("outgoing", outgoingOrders);
}

let outgoingAddSeq = outgoingOrders.filter((o) => o.id.startsWith("out-new-")).length;

/** Create a new outbound order from the New order form — persists + clickable. */
export function addOutgoing(
  data: Omit<OutgoingOrder, "id" | "number">,
): OutgoingOrder {
  const n = outgoingAddSeq++;
  const order: OutgoingOrder = {
    ...data,
    id: `out-new-${n}`,
    number: `OUT-2026-${String(5000 + n).padStart(4, "0")}`,
  };
  outgoingOrders.unshift(order);
  if (PICKABLE_STATUSES.includes(order.status)) reserveOrder(order);
  persistOutgoing();
  return order;
}

/** Cancel an order — releases whatever it had reserved, per canCancelOrder's gating. */
export function cancelOutgoingOrder(orderId: string, reason?: string, canceledBy = "Rizal Candra"): void {
  const order = outgoingOrders.find((o) => o.id === orderId);
  if (!order) return;
  order.status = "canceled";
  order.canceledDate = isoOffset(0);
  if (reason) order.canceledReason = reason;
  order.canceledBy = canceledBy;
  releaseReservationsForTask(orderId);
  persistOutgoing();
}

// status → stage label (used by tabs / sidebar panel)
const STATUS_TO_STAGE: Record<string, string> = {
  open: "Open",
  "in progress": "In process",
  "partially shipped": "Partially shipped",
  completed: "Completed",
  canceled: "Canceled",
};

// Terminal stages — orders here need no further outbound action.
const TERMINAL_STAGES = ["Completed", "Canceled"];

/**
 * Live outgoing counts per stage, optionally scoped to a set of warehouses.
 * Keeps the tab/panel badges in sync with what the table actually shows.
 */
export function outgoingCountsByStage(warehouseIds?: string[]): Record<string, number> {
  const src = warehouseIds?.length
    ? outgoingOrders.filter((o) => warehouseIds.includes(o.warehouseId))
    : outgoingOrders;
  const out: Record<string, number> = {};
  for (const o of src) {
    const stage = STATUS_TO_STAGE[o.status] ?? o.status;
    out[stage] = (out[stage] ?? 0) + 1;
  }
  return out;
}

/** Orders in a given stage (status), optionally warehouse-scoped. */
export function outgoingForStage(stage: string, warehouseIds?: string[]): OutgoingOrder[] {
  const status = Object.keys(STATUS_TO_STAGE).find((s) => STATUS_TO_STAGE[s] === stage);
  return outgoingOrders.filter(
    (o) =>
      o.status === status &&
      (!warehouseIds?.length || warehouseIds.includes(o.warehouseId)),
  );
}

/** Stage label for an order (e.g. "in progress" → "In progress"). */
export function outgoingStage(o: OutgoingOrder): string {
  return STATUS_TO_STAGE[o.status] ?? o.status;
}

/** Orders across several stages, optionally warehouse-scoped. */
export function outgoingForStages(stages: string[], warehouseIds?: string[]): OutgoingOrder[] {
  const statuses = stages
    .map((stage) => Object.keys(STATUS_TO_STAGE).find((s) => STATUS_TO_STAGE[s] === stage))
    .filter(Boolean) as string[];
  return outgoingOrders.filter(
    (o) =>
      statuses.includes(o.status) &&
      (!warehouseIds?.length || warehouseIds.includes(o.warehouseId)),
  );
}

/** Open (actionable) outgoing count — everything not yet terminal (Completed/Canceled). */
export function outgoingOpenCount(warehouseIds?: string[]): number {
  const c = outgoingCountsByStage(warehouseIds);
  return Object.entries(c)
    .filter(([stage]) => !TERMINAL_STAGES.includes(stage))
    .reduce((sum, [, n]) => sum + n, 0);
}

/** Can a new picking list still be created for this order? */
export function canCreatePicking(o: OutgoingOrder): boolean {
  return PICKABLE_STATUSES.includes(o.status) && getWarehouseConfig(o.warehouseId).pickingEnabled;
}

/** Orders eligible to be picked (used to seed picking tasks + the create form). */
export function pickableOrders(warehouseIds?: string[]): OutgoingOrder[] {
  return outgoingOrders.filter(
    (o) =>
      canCreatePicking(o) &&
      (!warehouseIds?.length || warehouseIds.includes(o.warehouseId)),
  );
}
