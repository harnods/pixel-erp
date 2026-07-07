import { reactive } from "vue";
import { warehouses } from "./warehouses";
import { loadSnapshot, saveSnapshot } from "./persist";
import { TODAY, VENDORS } from './master'

/** An inbound goods receipt (Inbound delivery → Receipt). */
export interface Receipt {
  id: string;
  /** receipt number, e.g. RCV-2026-0001 */
  number: string;
  /** source purchase order number, e.g. PO-2026-0142 */
  purchaseNo: string;
  warehouseId: string;
  warehouseName: string;
  /** distinct SKUs expected */
  skuQty: number;
  /** total units expected (purchase qty) */
  purchaseQty: number;
  /** units actually received so far (0 = none, < purchaseQty = partial, = purchaseQty = full) */
  receivedQty: number;
  status: string;
  /** ISO date the goods were fully received (completed receipts only) */
  receivedDate?: string;
  /** ISO date the PO was canceled (canceled receipts only) */
  canceledDate?: string;
  /** why the PO was canceled (canceled receipts only) */
  canceledReason?: string;
  /** who canceled the PO (canceled receipts only) */
  canceledBy?: string;
  /** ISO date the goods are estimated to arrive */
  estimatedArrival: string;
  /** free-text memo the back-office writes on the PO (optional) — e.g.
   *  "BATCH # 35 -- 31/03/2026 - 2 Koli". */
  memo?: string;
  /** tracking / resi numbers (e.g. SD0009583). A PO may have 0, 1 or several. */
  trackingNos: string[];
  /** supplier — set on user-created receipts; seed receipts derive it by hash. */
  vendor?: string;
}

// Anchor "today" so the arrival-date presets line up with the mock data.
export const RECEIPT_TODAY = TODAY

// Receipts go to real (non-default, active) warehouses.
const RECEIVING_WAREHOUSES = warehouses.filter(
  (w) => !w.isDefault && w.status === "active",
);

function isoOffset(days: number): string {
  const d = new Date(RECEIPT_TODAY);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Back-office PO memo — present on ~2/3 of rows.
function generateMemo(i: number, arrivalIso: string): string | undefined {
  if (i % 3 === 1) return undefined // ~1/3 have no memo
  const batch = ((i * 7) % 80) + 1
  const koli = ((i * 3) % 8) + 1
  const d = new Date(arrivalIso)
  d.setDate(d.getDate() - 5)
  const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  return `BATCH # ${batch} -- ${dateStr} - ${koli} Koli`
}

// Units received so far, derived from the stage:
//  - on the way → 0 (nothing arrived yet)
//  - receiving → partway through
//  - partial reception → receiving was closed short of the full qty (varied, never full)
//  - completed → received in full
function computeReceived(i: number, status: string, purchaseQty: number): number {
  switch (status) {
    case "completed":
      // ~4 of 10 completed POs were closed short (accepted as partial)
      if (i % 3 === 0) {
        const fractions = [0.65, 0.78, 0.88, 0.72, 0.91];
        const f = fractions[(i / 3) % fractions.length];
        return Math.min(purchaseQty - 1, Math.max(1, Math.round(purchaseQty * f)));
      }
      return purchaseQty;
    case "receiving":
      return Math.round(purchaseQty * 0.4);
    case "partial reception": {
      const fractions = [0.35, 0.5, 0.6, 0.75, 0.45, 0.8, 0.55, 0.3];
      const f = fractions[i % fractions.length];
      // never 0 and never the full qty
      return Math.min(purchaseQty - 1, Math.max(1, Math.round(purchaseQty * f)));
    }
    default:
      return 0; // on the way
  }
}

// Tracking / resi numbers — mostly empty in practice; only a few POs have them
// (usually one, occasionally a couple). Uses a modulo independent of the status
// cycle (i % 4) so it doesn't correlate with the On the way stage.
function generateTrackingNos(i: number): string[] {
  if (i % 16 !== 0) return [] // most POs have none
  const n = i !== 0 && i % 32 === 0 ? 2 : 1 // usually 1, sometimes 2
  return Array.from({ length: n }, (_, k) => `SD${String(9583 + i * 137 + k * 53).padStart(7, '0')}`)
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

// Same hash as receiptDetails.ts so vendor name is consistent across index and detail.
function hashId(id: string): number {
  return id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
}

// Future arrival windows for not-yet-arrived (on the way) POs — spread so each
// arrival-date preset (today / tomorrow / next 7 days / this month / beyond) hits some.
const FUTURE_OFFSETS = [0, 1, 2, 3, 4, 5, 6, 7, 9, 12, 18, 23, 27, 34, 40];

/**
 * Status for receipt i — weighted to feel like a real inbound queue rather than a
 * strict cycle: mostly On the way + Completed, fewer Partial reception. "receiving"
 * isn't used here (it has no list of its own), so every receipt is visible.
 */
function statusFor(i: number): string {
  const h = hash100(i);
  if (h < 42) return "on the way";       // ~42% awaiting arrival
  if (h < 64) return "partial reception"; // ~22% received short
  return "completed";                     // ~36% fully received
}

/** Deterministic mock — ~40 receipts spread across warehouses, statuses and dates. */
function generateReceipts(count = 42): Receipt[] {
  const out: Receipt[] = [];
  for (let i = 0; i < count; i++) {
    const wh = RECEIVING_WAREHOUSES[i % RECEIVING_WAREHOUSES.length];
    const status = statusFor(i);
    // Arrival makes sense per status: on the way → still to come (future);
    // arrived states (partial / completed) → a recent past date.
    const arrived = status !== "on the way";
    const offset = arrived
      ? -(((i * 7) % 26) + 2)                       // 2–27 days ago
      : FUTURE_OFFSETS[i % FUTURE_OFFSETS.length];  // upcoming
    const skuQty = ((i * 7 + 3) % 48) + 2;
    const purchaseQty = skuQty * (((i * 13) % 40) + 5);
    // Purchase no. comes from two sources, each with its own format:
    //  - ERP Purchase Order menu → "Purchase Order #10090"
    //  - Desty (marketplace fulfillment) → "#PO060"
    const fromDesty = i % 3 === 0;
    const purchaseNo = fromDesty
      ? `#PO${String(60 + i).padStart(3, "0")}`
      : `Purchase Order #${10090 + i}`;
    const id = `rcv-${String(i + 1).padStart(3, "0")}`
    out.push({
      id,
      number: `RCV-2026-${String(i + 1).padStart(4, "0")}`,
      purchaseNo,
      warehouseId: wh.id,
      warehouseName: wh.name,
      skuQty,
      purchaseQty,
      receivedQty: computeReceived(i, status, purchaseQty),
      status,
      // completed receipts were fully received between arrival and today
      receivedDate: status === "completed" ? isoOffset(-((i % 10) + 1)) : undefined,
      estimatedArrival: isoOffset(offset),
      memo: generateMemo(i, isoOffset(offset)),
      trackingNos: generateTrackingNos(i),
      vendor: VENDORS[hashId(id) % VENDORS.length],
    });
  }
  return out;
}

const CANCEL_REASONS = [
  "Supplier out of stock",
  "Duplicate order",
  "Price discrepancy",
  "Canceled by buyer",
  "Delivery too late",
  "Quality issue on inspection",
];

// A handful of canceled POs — appended so the active stages keep their counts.
function generateCanceled(count = 7): Receipt[] {
  const out: Receipt[] = [];
  for (let k = 0; k < count; k++) {
    const i = 100 + k; // keep numbering clear of the active receipts
    const wh = RECEIVING_WAREHOUSES[k % RECEIVING_WAREHOUSES.length];
    const skuQty = ((k * 5 + 4) % 40) + 2;
    const purchaseQty = skuQty * (((k * 11) % 30) + 5);
    const fromDesty = k % 3 === 0;
    const purchaseNo = fromDesty
      ? `#PO${String(180 + k).padStart(3, "0")}`
      : `Purchase Order #${10210 + k}`;
    const id = `rcv-cx-${String(k + 1).padStart(3, "0")}`
    out.push({
      id,
      number: `RCV-2026-${String(900 + k).padStart(4, "0")}`,
      purchaseNo,
      warehouseId: wh.id,
      warehouseName: wh.name,
      skuQty,
      purchaseQty,
      receivedQty: 0,
      status: "canceled",
      canceledDate: isoOffset(-((k % 12) + 1)),
      canceledReason: CANCEL_REASONS[k % CANCEL_REASONS.length],
      canceledBy: ['Rizal Candra', 'Dewi Rahayu', 'Agus Firmansyah', 'Sari Indah'][k % 4],
      estimatedArrival: isoOffset(-((k % 12) + 3)),
      memo: generateMemo(i, isoOffset(0)),
      trackingNos: [],
      vendor: VENDORS[hashId(id) % VENDORS.length],
    });
  }
  return out;
}

// The inbound graph (receipts + receiving tasks + put-aways) is persisted as a
// full snapshot so seed records mutated by the flow (status derivation, received
// qty) survive a refresh. A present snapshot wins over the freshly-built seed;
// "Reset demo data" clears it.
const receiptSnapshot = loadSnapshot<Receipt>("receipts-v2");
export const receipts = reactive<Receipt[]>(
  receiptSnapshot ?? [...generateReceipts(), ...generateCanceled()],
);

/** Persist the receipts snapshot (call after any mutation). */
export function persistReceipts(): void {
  saveSnapshot("receipts-v2", receipts);
}

let receiptAddSeq = receipts.filter((r) => r.id.startsWith("rcv-new-")).length;

/** Create a new inbound receipt (PO) from the New receipt form — persists + clickable. */
export function addReceipt(
  data: Omit<Receipt, "id" | "number">,
): Receipt {
  const n = receiptAddSeq++;
  const receipt: Receipt = {
    ...data,
    id: `rcv-new-${n}`,
    number: `RCV-2026-${String(5000 + n).padStart(4, "0")}`,
  };
  receipts.unshift(receipt);
  persistReceipts();
  return receipt;
}

/**
 * Close a partial reception — the PO is accepted as final even though it was
 * received short. It moves out of "Partial reception" and into "Completed"
 * (a completed-but-partial PO: receivedQty stays below purchaseQty).
 */
export function closeReceipt(id: string): void {
  const r = receipts.find((x) => x.id === id);
  if (!r) return;
  r.status = "completed";
  r.receivedDate = new Date(RECEIPT_TODAY).toISOString().slice(0, 10);
  persistReceipts();
}

/** Cancel a receipt (PO) — terminal state; no further receiving/put-away can happen. */
export function cancelReceipt(id: string): void {
  const r = receipts.find((x) => x.id === id);
  if (!r) return;
  r.status = "canceled";
  r.canceledDate = new Date(RECEIPT_TODAY).toISOString().slice(0, 10);
  persistReceipts();
}

/**
 * Manually-created receipts (New receipt form) have no real PO behind them, so they
 * can be deleted outright. Seed/PO-derived receipts must go through Cancel instead.
 */
export function isManualReceipt(r: Receipt): boolean {
  return r.id.startsWith("rcv-new-");
}

/** Delete a manually-created receipt entirely — only valid for isManualReceipt(). */
export function deleteReceipt(id: string): void {
  const i = receipts.findIndex((x) => x.id === id);
  if (i === -1 || !isManualReceipt(receipts[i]!)) return;
  receipts.splice(i, 1);
  persistReceipts();
}

// status → stage label (used by tabs / sidebar panel)
const STATUS_TO_STAGE: Record<string, string> = {
  "on the way": "On the way",
  receiving: "Receiving",
  "partial reception": "Partial reception",
  completed: "Completed",
  canceled: "Canceled",
};

/**
 * Live receipt counts per stage, optionally scoped to a set of warehouses.
 * Keeps the tab/panel badges in sync with what the table actually shows.
 */
export function receiptCountsByStage(warehouseIds?: string[]): Record<string, number> {
  const src = warehouseIds?.length
    ? receipts.filter((r) => warehouseIds.includes(r.warehouseId))
    : receipts;
  const out: Record<string, number> = {};
  for (const r of src) {
    const stage = STATUS_TO_STAGE[r.status] ?? r.status;
    out[stage] = (out[stage] ?? 0) + 1;
  }
  return out;
}

/** Receipts in a given stage (status), optionally warehouse-scoped. */
export function receiptsForStage(stage: string, warehouseIds?: string[]): Receipt[] {
  const status = Object.keys(STATUS_TO_STAGE).find((s) => STATUS_TO_STAGE[s] === stage);
  return receipts.filter(
    (r) =>
      r.status === status &&
      (!warehouseIds?.length || warehouseIds.includes(r.warehouseId)),
  );
}

/** Stage label for a receipt (e.g. "on the way" → "On the way"). */
export function receiptStage(r: Receipt): string {
  return STATUS_TO_STAGE[r.status] ?? r.status;
}

/** Receipts across several stages, optionally warehouse-scoped. */
export function receiptsForStages(stages: string[], warehouseIds?: string[]): Receipt[] {
  const statuses = stages
    .map((stage) => Object.keys(STATUS_TO_STAGE).find((s) => STATUS_TO_STAGE[s] === stage))
    .filter(Boolean) as string[];
  return receipts.filter(
    (r) =>
      statuses.includes(r.status) &&
      (!warehouseIds?.length || warehouseIds.includes(r.warehouseId)),
  );
}
