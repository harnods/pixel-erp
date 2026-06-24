import { warehouses } from "./warehouses";

/**
 * A receiving task — one assignee receives part (or all) of a PO's goods.
 * A PO may be split into several tasks; when it is, each task covers a distinct
 * subset of SKUs (never "all"). A single-task PO covers all SKUs.
 * A task is Open (still being received) or Completed — and Completed does NOT
 * require receiving the full purchase qty (e.g. 5/10 received then closed).
 */
export interface ReceivingTask {
  id: string;
  /** task number, e.g. "Receiving #10090" */
  taskNo: string;
  /** the single warehouse person assigned */
  assignee: string;
  /** "All SKUs" (single-task PO) or "N SKUs" (a split) */
  skuScope: string;
  /** numeric count of SKUs this task covers */
  skuCount: number;
  /** units expected for this task */
  purchaseQty: number;
  /** units recorded so far */
  receivedQty: number;
  /** open = not started yet · in progress = receiving started · completed = done */
  status: "open" | "in progress" | "completed";
  /** ISO date receiving started — absent while the task is still "open" (not started) */
  startDate?: string;
  /** ISO date the task finished — completed tasks only */
  endDate?: string;
}

// Anchor "today" (local midnight) so aging lines up with the mock data.
const RECEIVING_TODAY = new Date(2026, 5, 23);

/** Local timestamp `YYYY-MM-DDTHH:MM:00`, `days` offset from today at `hour:minute`. */
function isoAt(days: number, hour: number, minute: number): string {
  const d = new Date(RECEIVING_TODAY);
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(hour)}:${p(minute)}:00`;
}

/** Midnight of a date, for whole-day comparisons. */
function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Inclusive day count a task has been worked: start → end (completed) or
 * start → today (in progress). Same calendar day = 1 day; 18→19 Jun = 2 days.
 * Returns 0 when the task hasn't started (no aging).
 */
export function taskAgingDays(task: ReceivingTask): number {
  if (!task.startDate) return 0; // not started yet
  const start = new Date(task.startDate);
  const end = task.endDate ? new Date(task.endDate) : RECEIVING_TODAY;
  const diff = Math.round((dayStart(end) - dayStart(start)) / 86_400_000);
  return Math.max(0, diff) + 1; // inclusive
}

/** A PO with its receiving task(s). */
export interface ReceivingPO {
  id: string;
  purchaseNo: string;
  warehouseId: string;
  warehouseName: string;
  tasks: ReceivingTask[];
}

const ASSIGNEES = [
  "Budi Santoso",
  "Dewi Rahayu",
  "Rizki Pratama",
  "Agus Firmansyah",
  "Sari Indah",
  "Hendra Wijaya",
];

const RECEIVING_WAREHOUSES = warehouses.filter(
  (w) => !w.isDefault && w.status === "active",
);

function generatePOs(count = 12): ReceivingPO[] {
  const pos: ReceivingPO[] = [];
  let seq = 10090;
  const mkTask = (
    assignee: string,
    skuScope: string,
    skuCount: number,
    purchaseQty: number,
    receivedQty: number,
    status: "open" | "in progress" | "completed",
    startDate?: string,
    endDate?: string,
  ): ReceivingTask => ({
    id: `rtask-${seq}`,
    taskNo: `Receiving #${seq++}`,
    assignee,
    skuScope,
    skuCount,
    purchaseQty,
    receivedQty,
    status,
    startDate,
    endDate,
  });

  for (let p = 0; p < count; p++) {
    const wh = RECEIVING_WAREHOUSES[p % RECEIVING_WAREHOUSES.length];
    const purchaseNo = p % 2 === 0
      ? `#PO${String(60 + p).padStart(3, "0")}`
      : `Purchase Order #${10042 + p}`;
    const totalSkus = ((p * 3 + 5) % 14) + 4; // 4–17
    const tasks: ReceivingTask[] = [];

    // Most POs are received in a single "All SKUs" task; only a few are split
    // into SKU-scoped batches (first batch received, remainder still pending).
    if (p % 5 === 0) {
      const s1 = Math.ceil(totalSkus / 2);
      const s2 = totalSkus - s1;
      const q1 = s1 * 4;
      const q2 = s2 * 4;
      // First batch is done — usually received in full, occasionally closed early (partial).
      const earlyClose = (p / 5) % 2 === 1;
      // Completed batch: started 5–8 days ago, ran 0–3 days (some same-day → 1 day, some aged).
      const startA = -(5 + (p % 4));
      const durA = (p + 1) % 4;
      tasks.push(mkTask(
        ASSIGNEES[p % ASSIGNEES.length], `${s1} SKUs`, s1, q1, earlyClose ? Math.round(q1 * 0.7) : q1, "completed",
        isoAt(startA, 8 + (p % 6), (p * 7) % 60),
        isoAt(Math.min(0, startA + durA), 9 + (p % 7), (p * 11) % 60),
      ));
      // Remainder: in progress (started, 50% in) when closed early, else not started yet.
      if (earlyClose) {
        tasks.push(mkTask(ASSIGNEES[(p + 2) % ASSIGNEES.length], `${s2} SKUs`, s2, q2, Math.round(q2 * 0.5), "in progress", isoAt(-((p + 1) % 5), 8 + (p % 5), (p * 13) % 60)));
      } else {
        tasks.push(mkTask(ASSIGNEES[(p + 2) % ASSIGNEES.length], `${s2} SKUs`, s2, q2, 0, "open"));
      }
    } else {
      const q = totalSkus * 4;
      // Single task — realistic spread: not started (0), early progress, almost done.
      const stage = p % 3; // 0 → not started, 1 → ~40%, 2 → ~75%
      const receivedQty = stage === 0 ? 0 : stage === 1 ? Math.round(q * 0.4) : Math.round(q * 0.75);
      if (receivedQty === 0) {
        // Not started → "open", no dates.
        tasks.push(mkTask(ASSIGNEES[p % ASSIGNEES.length], "All SKUs", totalSkus, q, 0, "open"));
      } else {
        // Started → "in progress"; started 0–6 days ago so some are same-day (1 day, no aging).
        tasks.push(mkTask(ASSIGNEES[p % ASSIGNEES.length], "All SKUs", totalSkus, q, receivedQty, "in progress", isoAt(-(p % 7), 8 + (p % 6), (p * 17) % 60)));
      }
    }

    pos.push({ id: `rpo-${p}`, purchaseNo, warehouseId: wh.id, warehouseName: wh.name, tasks });
  }
  return pos;
}

export const receivingPOs: ReceivingPO[] = generatePOs();

/** POs scoped to warehouses (all when none given). */
export function receivingPOsFor(warehouseIds?: string[]): ReceivingPO[] {
  return warehouseIds?.length
    ? receivingPOs.filter((po) => warehouseIds.includes(po.warehouseId))
    : receivingPOs;
}

/** A PO is in the receiving queue while it has any task that isn't completed. */
export function receivingQueuePOs(warehouseIds?: string[]): ReceivingPO[] {
  return receivingPOsFor(warehouseIds).filter((po) =>
    po.tasks.some((t) => t.status !== "completed"),
  );
}

/** Badge count for the Receiving stage = POs with open tasks (scoped). */
export function receivingOpenCount(warehouseIds?: string[]): number {
  return receivingQueuePOs(warehouseIds).length;
}
