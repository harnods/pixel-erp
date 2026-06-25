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
  /** open = not started · in progress = receiving · pending put-away = received,
   *  awaiting put-away · completed = put away / done */
  status: "open" | "in progress" | "pending put-away" | "completed";
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
  let singleSeq = 0; // cycles single-task POs through the full lifecycle
  const mkTask = (
    assignee: string,
    skuScope: string,
    skuCount: number,
    purchaseQty: number,
    receivedQty: number,
    status: "open" | "in progress" | "pending put-away" | "completed",
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

    // Lifecycle (correct semantics):
    //   open            → not started
    //   in progress     → receiving underway (received < purchase)
    //   pending put-away → received in full, put-away task not done yet
    //   completed       → goods put away (done)
    // Most POs are a single "All SKUs" task; a few are split into SKU batches.
    if (p % 5 === 0) {
      const s1 = Math.ceil(totalSkus / 2);
      const s2 = totalSkus - s1;
      const q1 = s1 * 4;
      const q2 = s2 * 4;
      const startA = -(5 + (p % 4));
      const durA = (p + 1) % 4;
      // First batch received in full; alternate whether it's been put away
      // (completed) or is still awaiting put-away (pending put-away).
      const firstPutAway = (p / 5) % 2 === 0;
      tasks.push(mkTask(
        ASSIGNEES[p % ASSIGNEES.length], `${s1} SKUs`, s1, q1, q1,
        firstPutAway ? "completed" : "pending put-away",
        isoAt(startA, 8 + (p % 6), (p * 7) % 60),
        isoAt(Math.min(0, startA + durA), 9 + (p % 7), (p * 11) % 60),
      ));
      // Remainder: still being received once the first batch is stored, else not started.
      if (firstPutAway) {
        tasks.push(mkTask(ASSIGNEES[(p + 2) % ASSIGNEES.length], `${s2} SKUs`, s2, q2, Math.round(q2 * 0.5), "in progress", isoAt(-((p + 1) % 5), 8 + (p % 5), (p * 13) % 60)));
      } else {
        tasks.push(mkTask(ASSIGNEES[(p + 2) % ASSIGNEES.length], `${s2} SKUs`, s2, q2, 0, "open"));
      }
    } else {
      const q = totalSkus * 4;
      // Single "All SKUs" task — cycle through every lifecycle stage in turn.
      const LIFECYCLE = ['open', 'in40', 'in75', 'pending put-away', 'completed'] as const;
      const stage = LIFECYCLE[singleSeq++ % LIFECYCLE.length];
      if (stage === 'open') {
        // Not started → no dates.
        tasks.push(mkTask(ASSIGNEES[p % ASSIGNEES.length], "All SKUs", totalSkus, q, 0, "open"));
      } else if (stage === 'in40' || stage === 'in75') {
        // Receiving underway — received less than the full qty.
        const receivedQty = stage === 'in40' ? Math.round(q * 0.4) : Math.round(q * 0.75);
        tasks.push(mkTask(ASSIGNEES[p % ASSIGNEES.length], "All SKUs", totalSkus, q, receivedQty, "in progress", isoAt(-(p % 7), 8 + (p % 6), (p * 17) % 60)));
      } else {
        // Received in full — pending put-away (not stored yet) or completed (put away).
        tasks.push(mkTask(
          ASSIGNEES[p % ASSIGNEES.length], "All SKUs", totalSkus, q, q, stage,
          isoAt(-(2 + (p % 4)), 8 + (p % 6), (p * 7) % 60),
          isoAt(-(p % 2), 10 + (p % 5), (p * 17) % 60),
        ));
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
