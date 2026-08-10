import { reactive } from "vue";
import { warehouses } from "./warehouses";
import { customers } from "./customers";
import { salesOrders } from "./salesOrders";
import { loadSnapshot, saveSnapshot } from "./persist";
import { TODAY } from './master'
import { getWarehouseConfig } from './warehouseConfig'
import { orderSkuLines, productBySku } from './inventory'
import {
  getWarehouseDetail,
  autoSelectLocationBins,
  autoSelectBatches,
  autoSelectSerials,
  reserveStock,
  releaseReservationsForTask,
  getReservationsForOrder,
  hasReservationsForTask,
  reservedQtyForTask,
} from './warehouseDetails'

/** Pending = no picking/packing task yet · Open = task(s) created, none started ·
 *  In progress = at least one task started · Partially shipped = some qty shipped,
 *  short of full · Completed = fully shipped · Canceled = voided. */
export type OutgoingStatus =
  | "pending"
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
  /** FK into the ERP sales orders (`salesOrders.ts`) that this dispatch fulfils.
   *  Set for ERP-sourced orders; undefined for marketplace ("#SO…") / manual
   *  dispatches that have no ERP sales order behind them. When set, `salesNo`
   *  and `customer`/`customerId` are inherited from the linked sales order. */
  salesOrderId?: string;
  /** where the order originated: "Sales Order" (ERP), "Manual", or a Desty
   *  marketplace channel "{Marketplace}: {store name}" (e.g. "Shopee: Central Perk"). */
  source: string;
  /** SOURCE shipping label (resi/AWB) that came with the order — set for
   *  marketplace orders whose channel has already issued the label; UNDEFINED
   *  while a marketplace order is still waiting for its label (Print Shipping
   *  Label is disabled until it lands). ERP/Manual orders leave this undefined and
   *  use the WMS-generated shipping label instead. See data/shippingLabels.ts. */
  shippingLabel?: string;
  warehouseId: string;
  warehouseName: string;
  /** distinct SKUs ordered */
  skuQty: number;
  /** total units ordered to ship out */
  orderQty: number;
  /** units shipped so far (0 = none, < orderQty = partial, = orderQty = full) */
  shippedQty: number;
  /** shipped units PER SKU (derived by syncOutboundOrderStatuses from completed
   *  shipments) — lets reserveOrder avoid re-reserving stock that has already left
   *  when a partially-shipped order is re-evaluated (it's still "pickable"). */
  shippedBySku?: Record<string, number>;
  status: OutgoingStatus;
  /** ISO date the goods fully left the warehouse (completed orders only) */
  shippedDate?: string;
  /** ISO date the order was canceled (canceled orders only) */
  canceledDate?: string;
  /** why the order was canceled (canceled orders only) */
  canceledReason?: string;
  /** who canceled the order (canceled orders only) */
  canceledBy?: string;
  /** D6 — reserved-stock release audit. A cancelled order does NOT auto-release its
   *  reservation; a user triggers "Release Reserved" to return the still-held
   *  (un-shipped) reserved qty to Available. These record that release for audit and
   *  prevent re-release (a released reservation can't be re-held). */
  reservedReleasedDate?: string;
  reservedReleasedBy?: string;
  reservedReleasedQty?: number;
  /** ISO date the order is due to leave the warehouse */
  dueDate: string;
  /** free-text memo the back-office writes on the order (optional) — e.g.
   *  "BATCH # 35 -- 31/03/2026 - 2 Koli". */
  memo?: string;
  /** customer display name — set on user-created orders; seed orders derive it
   *  from the customer master by hash. Kept alongside `customerId` for cheap
   *  display without a lookup. */
  customer?: string;
  /** FK into the shared customer master (`customers.ts`) — the same id the ERP
   *  sales order for this dispatch resolves to. */
  customerId?: string;
  /** ISO date the order was created (user-created orders only). */
  transactionDate?: string;
  /** Full ISO timestamp of creation — set on user-created orders for accurate audit display. */
  createdAt?: string;
  /** Actual line items — stored for user-created orders; seed orders derive via orderSkuLines(). */
  lines?: StoredOrderLine[];
  /** D7 — audit trail of edits to the order (newest last). Each entry lists the
   *  field changes as "old → new" so the activity log shows exactly what changed. */
  editLog?: OutgoingEditEntry[];
}

/** One recorded edit: who, when, and the individual field changes ("apa ke apa"). */
export interface OutgoingEditEntry {
  at: string;
  by: string;
  changes: { label: string; value: string }[];
}

export interface StoredOrderLine {
  sku: string;
  productName: string;
  desc: string;
  img: string;
  unit: string;
  qty: number;
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
//  - pending/open/in progress → 0 (nothing has left yet)
//  - partially shipped → shipped short of the full qty (varied, never full)
//  - completed → shipped in full (or accepted short)
function computeShipped(i: number, status: OutgoingStatus, orderQty: number): number {
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
      return 0; // pending / open / in progress
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
// Customers the outbound orders ship to, drawn from the shared customer master
// (customers.ts) — the SAME records the ERP sales orders use, so a dispatch and
// its sales order resolve to one company id. `CUST_BY_NAME` lets the fixed demo
// orders below attach a real FK from their display name.
const CUSTOMERS = customers.map((c) => ({ id: c.id, name: c.name }))
const CUST_BY_NAME = new Map(customers.map((c) => [c.name, c.id]))

/**
 * Link an ERP-sourced dispatch to a real sales order (`salesOrders.ts`) at a
 * fixed index — so the dispatch's `salesNo`, `customer`/`customerId`, and
 * `salesOrderId` all come from one authoritative record. The seed generators
 * pass disjoint index ranges so no two dispatches claim the same sales order.
 */
function erpSalesOrderAt(index: number) {
  return salesOrders[index % salesOrders.length]!
}

/**
 * Status for order i — weighted to feel like a real outbound queue: mostly Pending +
 * Completed, fewer In progress / Partially shipped. Canceled is appended separately.
 * This is the PRE-task seed value; seedTasks() (pickingTasks.ts/packingTasks.ts) reads
 * it to decide what tasks to attach, then syncOutboundOrderStatuses() re-derives the
 * real status (Pending/Open/In progress/Partially shipped/Completed) from those tasks
 * on every page mount — so "pending" here just means "no task ended (or started) yet".
 */
function statusFor(i: number): OutgoingStatus {
  const h = hash100(i);
  if (h < 30) return "pending";           // ~30% awaiting fulfillment
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
    //  - ERP Sales Order menu → real sales order (FK), "Sales Order #10090"
    //  - Desty (marketplace fulfillment) → "#SO060", no ERP sales order
    const so = fromDesty ? undefined : erpSalesOrderAt(i); // ERP index range: 0–41
    const salesNo = so ? `Sales Order #${so.number}` : `#SO${String(60 + i).padStart(3, "0")}`;
    const custName = so ? so.customer.name : CUSTOMERS[hash100(i * 31) % CUSTOMERS.length].name;
    const custId = so ? so.customer.id : CUSTOMERS[hash100(i * 31) % CUSTOMERS.length].id;
    const source = fromDesty ? `${MARKETPLACES[hash100(i * 29) % MARKETPLACES.length]}: ${STORE_NAME}` : "Sales Order";
    // Marketplace source label (resi/AWB): almost always present (the channel
    // issues it up front), so Print Shipping Label works out of the box. Only a
    // small share of in-warehouse marketplace orders are still waiting for the
    // label (so the disabled/"waiting" state is still demonstrable). ERP/manual = none.
    const waitingLabel = fromDesty && !hasLeft && hash100(i * 41) % 10 === 0;
    const shippingLabel = fromDesty && !waitingLabel
      ? `SPXID${String(40000000 + i * 137).padStart(11, "0")}`
      : undefined;
    out.push({
      id: `out-${String(i + 1).padStart(3, "0")}`,
      number: `OUT-2026-${String(i + 1).padStart(4, "0")}`,
      salesNo,
      source,
      shippingLabel,
      warehouseId: wh.id,
      warehouseName: wh.name,
      skuQty,
      orderQty,
      shippedQty: computeShipped(i, status, orderQty),
      status,
      // Completed orders shipped 1..88 days ago (spread, so date-range filters on
      // the Overview / Reports are meaningful rather than all bunched at "recent").
      shippedDate: status === "completed" ? isoOffset(-(1 + ((i * 37) % 88))) : undefined,
      dueDate,
      memo: generateMemo(i, isoOffset(offset)),
      salesOrderId: so?.id,
      customer: custName,
      customerId: custId,
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
    const so = fromDesty ? undefined : erpSalesOrderAt(50 + k); // ERP index range: 50–59
    const salesNo = so ? `Sales Order #${so.number}` : `#SO${String(140 + k).padStart(3, "0")}`;
    const custName = so ? so.customer.name : CUSTOMERS[hash100(i * 31) % CUSTOMERS.length].name;
    const custId = so ? so.customer.id : CUSTOMERS[hash100(i * 31) % CUSTOMERS.length].id;
    const source = fromDesty ? `${MARKETPLACES[hash100(i * 29) % MARKETPLACES.length]}: ${STORE_NAME}` : "Sales Order";
    out.push({
      id,
      number: `OUT-2026-${String(800 + k).padStart(4, "0")}`,
      salesNo,
      source,
      // Shipped marketplace orders always carry their source label (the channel
      // issued it before it left) so Print Shipping Label works on these too.
      shippingLabel: fromDesty ? `SPXID${String(50000000 + k * 211).padStart(11, "0")}` : undefined,
      warehouseId: wh.id,
      warehouseName: wh.name,
      skuQty,
      orderQty,
      shippedQty: 0, // re-derived by the sync from the delivery tasks
      status: partial ? "partially shipped" : "completed",
      shippedDate: isoOffset(-(1 + ((k * 37) % 88))),
      dueDate: isoOffset(-((k % 12) + 2)),
      memo: generateMemo(i, isoOffset(-((k % 12) + 2))),
      salesOrderId: so?.id,
      customer: custName,
      customerId: custId,
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
    const so = fromDesty ? undefined : erpSalesOrderAt(70 + k); // ERP index range: 70–76
    const salesNo = so ? `Sales Order #${so.number}` : `#SO${String(180 + k).padStart(3, "0")}`;
    const custName = so ? so.customer.name : CUSTOMERS[hash100(i * 31) % CUSTOMERS.length].name;
    const custId = so ? so.customer.id : CUSTOMERS[hash100(i * 31) % CUSTOMERS.length].id;
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
      salesOrderId: so?.id,
      customer: custName,
      customerId: custId,
    });
  }
  return out;
}

/**
 * Reserve this order's batch/serial-tracked SKU lines against the warehouse's
 * *current* selection rules (batch/serial/location, from Settings) — the moment an
 * order becomes reservable (bootstrap below for already-open seed orders, or
 * addOutgoing() for a live-created one). Idempotent PER (order, sku), and
 * quantity-aware, not just existence-based: a line whose already-reserved qty
 * already meets its demand is left untouched (non-retroactive — whatever rule was
 * live when it first reserved stays locked in), but a line that's still SHORT (fully
 * unreserved, or only partially reserved from an earlier pass that ran out of stock,
 * or from an older build with a gap) gets topped up for exactly the shortfall, every
 * call — so safe to call unconditionally on every load rather than gating the whole
 * order or trusting "any reservation exists" as "fully reserved". Plain (non-batch/
 * non-serial) SKUs are left unreserved — same pre-existing boundary as picking-time
 * reservation had.
 */
function reserveOrder(order: OutgoingOrder): void {
  const wh = getWarehouseDetail(order.warehouseId);
  if (!wh) return;
  const picks: { sku: string; batchNo?: string; qty: number; serials?: string[] }[] = [];
  for (const line of orderSkuLines(order)) {
    const item = wh.stock.find((s) => s.sku === line.sku);
    if (!item) continue;
    // Only count a reservation record toward "already covered" if it still points at
    // a batch/serial that actually exists on this item — a record left dangling by an
    // earlier data shape (renamed/renumbered batch, re-seeded serials, etc.) would
    // otherwise silently block this line from ever getting a real reservation, while
    // never showing up as reserved anywhere (Warehouse Details included).
    const already = getReservationsForOrder(order.id, line.sku).reduce((sum, r) => {
      if (r.batchNo) return item.batches?.some((b) => b.batchNo === r.batchNo) ? sum + r.qty : sum;
      if (r.serials?.length) {
        const valid = r.serials.filter((sn) =>
          item.serials?.available.some((u) => u.serial === sn) || item.serials?.reserved.some((u) => u.serial === sn));
        return sum + valid.length;
      }
      // Plain SKU — a bare qty reservation, nothing to validate it against.
      return sum + r.qty;
    }, 0);
    // Subtract units that already SHIPPED (goods gone, reservation consumed at
    // shipment completion) — a partially-shipped order is still "pickable", so
    // without this it would re-reserve the shipped-and-gone quantity.
    const shipped = order.shippedBySku?.[line.sku] ?? 0;
    const remaining = line.qty - shipped - already;
    if (remaining <= 0) continue;
    const preferredLocations = autoSelectLocationBins(order.warehouseId, line.sku, remaining).map((b) => b.location);
    if (item.batches?.length) {
      for (const b of autoSelectBatches(order.warehouseId, line.sku, remaining, preferredLocations)) {
        picks.push({ sku: line.sku, batchNo: b.batchNo, qty: b.take });
      }
    } else if (item.serials) {
      const serials = autoSelectSerials(order.warehouseId, line.sku, remaining, preferredLocations);
      if (serials.length) picks.push({ sku: line.sku, qty: serials.length, serials });
    } else {
      // Plain SKU — no lot/unit to pin, just hold the qty against oversell.
      picks.push({ sku: line.sku, qty: remaining });
    }
  }
  if (picks.length) reserveStock(order.id, order.warehouseId, picks);
}

/**
 * Demo scenario: an open order at Gudang Makassar Selatan (wh-006, whose storage
 * locations are a flat single-level "Bin 01"/"Bin 02"… tree) covering all three
 * tracking modes in one order — a batch-tracked SKU that happens to sit in 2
 * distinct batches there, a serial-tracked SKU, and a plain (untracked) SKU.
 * Explicit `lines` pin the exact SKUs (orderSkuLines() would otherwise derive
 * them deterministically from skuQty, with no control over which land here).
 */
function generateTrackingScenario(): OutgoingOrder[] {
  // Link to a real sales order (free index, not claimed by any generator) so this
  // ERP-sourced demo dispatch carries a valid salesOrderId FK + inherited customer.
  const demoSo = erpSalesOrderAt(90);
  return [
    {
      id: "out-demo-001",
      number: "OUT-2026-0700",
      salesNo: `Sales Order #${demoSo.number}`,
      source: "Sales Order",
      salesOrderId: demoSo.id,
      warehouseId: "wh-006",
      warehouseName: "Gudang Makassar Selatan",
      skuQty: 3,
      orderQty: 9,
      shippedQty: 0,
      status: "pending",
      dueDate: isoOffset(7),
      memo: "For demo 001",
      customer: demoSo.customer.name,
      customerId: demoSo.customer.id,
      lines: [
        {
          sku: "1003",
          productName: "Green Beans Arabica Toraja Sapan",
          desc: "Sulawesi 1,600 masl, semi-washed, 60 kg sack",
          img: "https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_Rwanda-Mbilima-Soil-Project-Lot.0704-2026.jpg?v=1779845863",
          unit: "Sack",
          qty: 3,
        },
        {
          sku: "2004",
          productName: "Espresso Machine Lever Manual 1-Group",
          desc: "Spring-lever, chrome body, commercial",
          img: "https://cdn.shopify.com/s/files/1/2425/8607/files/La-Marzocco-Linea-Mini-Espresso-Machine-White-Hero-KO-by-Clive-Coffee.jpg?v=1711570888",
          unit: "Unit",
          qty: 2,
        },
        {
          sku: "3004",
          productName: "Coffee Scale 2kg / 0.1g",
          desc: "Built-in brew timer, USB-C rechargeable",
          img: "https://cdn.shopify.com/s/files/1/0831/7573/5603/files/ACAIALUNAR2021SMARTESPRESSOSCALEnew.jpg?v=1711084594",
          unit: "Unit",
          qty: 4,
        },
      ],
    },
  ];
}

/**
 * Demo scenario: TWO sales orders at Gudang Jakarta Pusat (wh-001) — one
 * regular ERP order, one Desty marketplace order — meant to be bundled into a
 * single Open picking task (see seedMultiOrderPickingDemo() in
 * pickingTasks.ts), exercising the Combined/By orders toggle on
 * PickingTaskDetailsPage.vue with a real multi-order task. Each order draws
 * from its own distinct SKUs (no SKU shared between the two) so their demand
 * never compounds against the same stock line. Verified via
 * tests/data-integrity.spec.ts (available ≥ demand for every SKU/warehouse
 * pair, post-reservation) against the live seed at wh-001: 3001 available 9,
 * 3002 available 20, 3005 available 21, 3006 available 22 — this demo only
 * ever claims 3 of 3001, 2 of 3002, 3 of 3005, 2 of 3006.
 */
function generateMultiOrderPickingScenario(): OutgoingOrder[] {
  // Regular ERP order of the pair → real sales order FK (free index 91).
  const demoSo = erpSalesOrderAt(91);
  return [
    {
      id: "out-demo-multi-a",
      number: "OUT-2026-0701",
      salesNo: `Sales Order #${demoSo.number}`,
      source: "Sales Order",
      salesOrderId: demoSo.id,
      warehouseId: "wh-001",
      warehouseName: "Gudang Jakarta Pusat",
      skuQty: 2,
      orderQty: 6,
      shippedQty: 0,
      status: "pending",
      dueDate: isoOffset(5),
      memo: "For demo multi-order picking (regular)",
      customer: demoSo.customer.name,
      customerId: demoSo.customer.id,
      lines: [
        {
          sku: "3001",
          productName: "Milk Frothing Pitcher 600ml",
          desc: "Stainless steel, sharp spout, latte art",
          img: "https://cdn.shopify.com/s/files/1/2425/8607/products/milk-steaming-pitcher_7a0b6d9d-dc2f-410b-83e8-0c0caf6403e5.jpg",
          unit: "Unit",
          qty: 3,
        },
        {
          sku: "3005",
          productName: "Paper Filter V60 02 (100 pcs)",
          desc: "Natural unbleached, cone shape",
          img: "https://cdn.shopify.com/s/files/1/0801/9439/files/0129_hariometeo_112_2485daae-afa0-42da-b4d9-97fb436ffc99.jpg",
          unit: "Box",
          qty: 3,
        },
      ],
    },
    {
      id: "out-demo-multi-b",
      number: "OUT-2026-0702",
      salesNo: "#SO201",
      source: "Shopee: Central Perk",
      warehouseId: "wh-001",
      warehouseName: "Gudang Jakarta Pusat",
      skuQty: 2,
      orderQty: 4,
      shippedQty: 0,
      status: "pending",
      dueDate: `${isoOffset(1)}T23:59:00`,
      memo: "For demo multi-order picking (marketplace)",
      customer: "Fore Coffee Thamrin",
      customerId: CUST_BY_NAME.get("Fore Coffee Thamrin"),
      lines: [
        {
          sku: "3002",
          productName: "Tamper 58mm Flat Base",
          desc: "Anodized aluminium handle, calibrated",
          img: "https://cdn.shopify.com/s/files/1/2425/8607/products/Lucca-Stainless-Steel-Espresso-Tamper-05.jpg",
          unit: "Unit",
          qty: 2,
        },
        {
          sku: "3006",
          productName: "Knock Box Drawer Stainless",
          desc: "2.4 L capacity, rubber knock bar",
          img: "https://cdn.shopify.com/s/files/1/2425/8607/files/LUCCA-Knock-Box-Small-Black-by-Clive-Coffee.jpg",
          unit: "Unit",
          qty: 2,
        },
      ],
    },
    {
      // Demo for D3 partial picking + D7 edit-reallocation: one SKU, qty 7, in a
      // warehouse with allowPartialPicking on. seedPartialSplitPickingDemo() hangs
      // two Open picking tasks (4 + 3) off it, so editing the order 7 → 5 exercises
      // the D7 drain-smallest-first reallocation. Direct (Manual) source so it's
      // editable in the WMS surface.
      id: "out-demo-partial-split",
      number: "OUT-2026-0703",
      salesNo: "Split Picking Demo",
      source: "Manual",
      warehouseId: "wh-006",
      warehouseName: "Gudang Makassar Selatan",
      skuQty: 1,
      orderQty: 7,
      shippedQty: 0,
      status: "pending",
      dueDate: isoOffset(4),
      memo: "Demo: SKU split across 2 picking tasks (D3), then edit qty to test D7",
      customer: "Fore Coffee Thamrin",
      customerId: CUST_BY_NAME.get("Fore Coffee Thamrin"),
      lines: [
        {
          sku: "3001",
          productName: "Milk Frothing Pitcher 600ml",
          desc: "Stainless steel, sharp spout, latte art",
          img: "https://cdn.shopify.com/s/files/1/2425/8607/products/milk-steaming-pitcher_7a0b6d9d-dc2f-410b-83e8-0c0caf6403e5.jpg",
          unit: "Unit",
          qty: 7,
        },
      ],
    },
  ];
}

// The outbound graph (orders + picking + packing + delivery) is persisted as a
// full snapshot so seed records mutated by the flow (status derivation, shipped
// qty) survive a refresh. A present snapshot wins over the freshly-built seed;
// "Reset demo data" clears it.
const outgoingSnapshot = loadSnapshot<OutgoingOrder>("outgoing-v5");
export const outgoingOrders = reactive<OutgoingOrder[]>(
  outgoingSnapshot ?? [
    ...generateTrackingScenario(), ...generateMultiOrderPickingScenario(),
    ...generateOrders(), ...generateShipped(3), ...generateCanceled(),
  ],
);

// Pending / open / in-process / partially-shipped orders are pickable. (A partially
// shipped order flips to that status the moment ANY of it ships — even if most of it
// was never picked at all — so it still needs to allow further pick lists for whatever
// SKU/qty remains uncovered; the per-SKU/qty check lives in pickingTasks.canPickOrder.
// "completed" is excluded on purpose: shippedTotal >= orderQty there, so nothing
// can possibly be left to pick.)
const PICKABLE_STATUSES = ["pending", "open", "in progress", "partially shipped"];

/**
 * Reserve every currently pickable (open / in-process) order — stands in for
 * "reserve when the SO enters Requests" since there's no live SO-creation flow yet
 * (addOutgoing() below covers that path). Idempotent (reserveOrder() is itself a
 * per-(order,sku) no-op once fully reserved), so safe to call repeatedly — not just
 * once at module load. This matters because a seed order's status isn't fully
 * settled until syncOutboundOrderStatuses() runs (it can flip a "completed" seed
 * label with no real task chain back to "open") — calling this again after that
 * sync catches any order that just became pickable, instead of only ever seeing
 * whatever status it had at the very first module evaluation.
 */
export function reserveAllPickableOrders(): void {
  for (const o of outgoingOrders) {
    if (PICKABLE_STATUSES.includes(o.status)) reserveOrder(o);
  }
}

reserveAllPickableOrders();

/** Orders with a pre-wired shipped chain — consumed by the task seeds. `partial`
 *  short-picks the last SKU so the order lands on "partially shipped". */
export interface ShippedSeed { id: string; partial: boolean }
export const shippedSeeds: ShippedSeed[] = outgoingOrders
  .filter((o) => o.id.startsWith("out-sh-"))
  .map((o) => ({ id: o.id, partial: o.status === "partially shipped" }));

/** Persist the outgoing snapshot (call after any mutation). */
export function persistOutgoing(): void {
  saveSnapshot("outgoing-v5", outgoingOrders);
}

let outgoingAddSeq = outgoingOrders.filter((o) => o.id.startsWith("out-new-")).length;

const DO_PREFIX_RE = /^Delivery Order #(\d+)$/;
export function nextDeliveryOrderNo(): string {
  let max = 0;
  for (const o of outgoingOrders) {
    const m = o.salesNo.match(DO_PREFIX_RE);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  return `Delivery Order #${String(max + 1).padStart(5, "0")}`;
}

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
  // D6 AC#1 — cancel does NOT auto-release the reservation: the reserved qty stays
  // out of Available until a user explicitly runs "Release Reserved". (No
  // releaseReservationsForTask here on purpose.)
  persistOutgoing();
}

/** D2 cancel gate — an outbound order can be cancelled while NOTHING has truly
 *  shipped (shippedQty is only posted once a shipment is COMPLETED). A partially/
 *  fully shipped order is terminal for cancel (posting guard). */
export function canCancelOutboundOrder(order: OutgoingOrder): boolean {
  return order.status !== "canceled" && (order.shippedQty ?? 0) === 0;
}

/** D7 edit gate — an outbound order is editable while nothing has shipped and it
 *  isn't cancelled. (Prototype: all sources editable; the PRD restricts this to
 *  Direct outbound, but the demo allows any.) The per-SKU add/remove rules vs
 *  picking state are enforced in editOutboundOrder (outboundSync). */
export function canEditOutboundOrder(order: OutgoingOrder): boolean {
  return order.status !== "canceled" && (order.shippedQty ?? 0) === 0;
}

/** Apply an edit's new SKU lines (+ optional header fields) to an order and persist.
 *  Reservation sync (reserve added / release removed) is orchestrated by
 *  editOutboundOrder in outboundSync — this only writes the order record. */
export function updateOutgoingOrderLines(
  orderId: string,
  lines: { sku: string; qty: number }[],
  header?: { customer?: string; dueDate?: string; memo?: string },
): void {
  const order = outgoingOrders.find((o) => o.id === orderId);
  if (!order) return;
  order.lines = lines
    .filter((l) => l.qty > 0)
    .map((l) => {
      const p = productBySku(l.sku);
      return {
        sku: l.sku,
        productName: p?.name ?? l.sku,
        desc: p?.desc ?? "",
        img: p?.img ?? "",
        unit: p?.unit ?? "Unit",
        qty: l.qty,
      };
    });
  order.orderQty = order.lines.reduce((s, l) => s + l.qty, 0);
  order.skuQty = order.lines.length;
  if (header) {
    if (header.customer !== undefined) order.customer = header.customer;
    if (header.dueDate !== undefined) order.dueDate = header.dueDate;
    if (header.memo !== undefined) order.memo = header.memo;
  }
  persistOutgoing();
}

/** D7 — append an edit entry to the order's audit trail. `changes` is the list of
 *  "apa ke apa" field diffs (empty → no-op, so a no-change save records nothing). */
export function recordOutgoingEdit(
  orderId: string,
  changes: { label: string; value: string }[],
  by = "Rizal Candra",
): void {
  if (!changes.length) return;
  const order = outgoingOrders.find((o) => o.id === orderId);
  if (!order) return;
  (order.editLog ??= []).push({ at: new Date().toISOString(), by, changes });
  persistOutgoing();
}

/** D6 — can this cancelled order's reserved stock still be released? Only when it's
 *  cancelled, nothing shipped, the release hasn't already run, and it actually still
 *  holds a reservation. */
export function canReleaseReservedForOrder(orderId: string): boolean {
  const order = outgoingOrders.find((o) => o.id === orderId);
  if (!order) return false;
  return (
    order.status === "canceled" &&
    !order.reservedReleasedDate &&
    (order.shippedQty ?? 0) === 0 &&
    hasReservationsForTask(orderId)
  );
}

/** D6 — return a cancelled order's still-held (un-shipped) reserved qty to Available.
 *  On-hand never moves (nothing was ever deducted for a reservation); no JE. Records
 *  actor/timestamp/qty for audit and is idempotent (a second call is a no-op). Returns
 *  true only when it actually released something. */
export function releaseReservedForCancelledOrder(orderId: string, releasedBy = "Rizal Candra"): boolean {
  if (!canReleaseReservedForOrder(orderId)) return false;
  const order = outgoingOrders.find((o) => o.id === orderId)!;
  const releasedQty = reservedQtyForTask(orderId);
  releaseReservationsForTask(orderId);
  order.reservedReleasedQty = releasedQty;
  order.reservedReleasedDate = new Date().toISOString();
  order.reservedReleasedBy = releasedBy;
  persistOutgoing();
  return true;
}

// status → stage label (used by tabs / sidebar panel)
const STATUS_TO_STAGE: Record<string, string> = {
  pending: "Pending",
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
