import { warehouses, picForWarehouse } from "./warehouses";
import { TODAY, STAFF } from './master'

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

// Anchor "today" — imported from master so all modules share the same date.
const RECEIVING_TODAY = TODAY

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
  estimatedArrival: string;
  receiptId: string;
  tasks: ReceivingTask[];
}

const ASSIGNEES = STAFF

const RECEIVING_WAREHOUSES = warehouses.filter(
  (w) => !w.isDefault && w.status === "active",
);

function generatePOs(): ReceivingPO[] {
  const pos: ReceivingPO[] = [];
  let seq = 10090;

  function task(
    assigneeIdx: number,
    skuScope: string,
    skuCount: number,
    purchaseQty: number,
    receivedQty: number,
    status: ReceivingTask["status"],
    startDaysAgo?: number,
    endDaysAgo?: number,
  ): ReceivingTask {
    return {
      id: `rtask-${seq}`,
      taskNo: `Receiving #${seq++}`,
      assignee: ASSIGNEES[assigneeIdx % ASSIGNEES.length]!,
      skuScope,
      skuCount,
      purchaseQty,
      receivedQty,
      status,
      startDate: startDaysAgo != null ? isoAt(-startDaysAgo, 8 + (seq % 4), (seq * 7) % 60) : undefined,
      endDate:   endDaysAgo   != null ? isoAt(-endDaysAgo,   16 + (seq % 3), (seq * 11) % 60) : undefined,
    };
  }

  function po(
    purchaseNo: string,
    whIdx: number,
    tasks: ReceivingTask[],
  ): ReceivingPO {
    const wh = RECEIVING_WAREHOUSES[whIdx % RECEIVING_WAREHOUSES.length]!;
    // A task is worked by the assigned warehouse's PIC(s). Split POs rotate among
    // the warehouse's PICs by task index so each batch can have its own receiver.
    tasks.forEach((t, i) => { t.assignee = picForWarehouse(wh.id, i); });
    const idx = pos.length;
    const startDates = tasks.map(t => t.startDate).filter(Boolean) as string[];
    let estimatedArrival: string;
    if (startDates.length) {
      const earliest = startDates.reduce((a, b) => (a < b ? a : b));
      const daysAgo = Math.round((RECEIVING_TODAY.getTime() - new Date(earliest).getTime()) / 86400000);
      estimatedArrival = isoAt(-(daysAgo + 2 + (idx % 3)), 9, (idx * 17) % 60).slice(0, 10);
    } else {
      estimatedArrival = isoAt(2 + (idx % 4), 0, 0).slice(0, 10);
    }
    const receiptId = `rcv-${String((idx % 42) + 1).padStart(3, '0')}`;
    return { id: `rpo-${idx}`, purchaseNo, warehouseId: wh.id, warehouseName: wh.name, estimatedArrival, receiptId, tasks };
  }

  // ── wh-001 Gudang Jakarta Pusat (whIdx 0) ──────────────────────────────────
  // 3 tasks pending put-away, 1 in progress, 1 completed
  pos.push(po("#PO-2026-0060", 0, [
    task(0, "All SKUs", 8,  320, 320, "pending put-away", 5, 3),
  ]));
  pos.push(po("Purchase Order #10042", 0, [
    task(1, "All SKUs", 12, 480, 480, "pending put-away", 7, 4),
  ]));
  pos.push(po("#PO-2026-0074", 0, [
    task(2, "All SKUs",  6, 240, 140, "in progress",      3),
  ]));
  pos.push(po("Purchase Order #10061", 0, [
    task(0, "All SKUs", 10, 400, 380, "completed",        12, 9),
  ]));
  // Split PO: first batch received and pending put-away; second batch not started
  pos.push(po("#PO-2026-0088", 0, [
    task(3, "6 SKUs",   6, 240, 240, "pending put-away", 4, 2),
    task(5, "5 SKUs",   5, 200,   0, "open"),
  ]));

  // ── wh-002 Gudang Surabaya Timur (whIdx 1) ─────────────────────────────────
  // 4 tasks pending put-away, 1 in progress, 1 open
  pos.push(po("#PO-2026-0065", 1, [
    task(1, "All SKUs",  9, 360, 360, "pending put-away", 6, 4),
  ]));
  pos.push(po("Purchase Order #10047", 1, [
    task(2, "All SKUs", 14, 560, 560, "pending put-away", 8, 5),
  ]));
  pos.push(po("#PO-2026-0071", 1, [
    task(3, "All SKUs",  7, 280, 280, "pending put-away", 3, 1),
  ]));
  pos.push(po("Purchase Order #10055", 1, [
    task(4, "All SKUs", 11, 440, 440, "pending put-away", 10, 7),
  ]));
  pos.push(po("#PO-2026-0083", 1, [
    task(5, "All SKUs",  5, 200, 150, "in progress",      4),
  ]));
  pos.push(po("Purchase Order #10062", 1, [
    task(0, "All SKUs",  8, 320,   0, "open"),
  ]));

  // ── wh-003 Gudang Bandung Selatan (whIdx 2) ────────────────────────────────
  // 1 task pending put-away, 1 in progress, 1 completed
  pos.push(po("#PO-2026-0068", 2, [
    task(2, "All SKUs", 10, 400, 400, "pending put-away", 5, 3),
  ]));
  pos.push(po("Purchase Order #10048", 2, [
    task(3, "All SKUs",  6, 240, 100, "in progress",      2),
  ]));
  pos.push(po("#PO-2026-0079", 2, [
    task(1, "All SKUs",  8, 320, 305, "completed",        11, 8),
  ]));

  // ── wh-004 Gudang Medan Baru (whIdx 3) ────────────────────────────────────
  // Split PO: 1 task pending put-away + 1 in progress; 1 open
  pos.push(po("#PO-2026-0072", 3, [
    task(4, "All SKUs",  7, 280,   0, "open"),
  ]));
  pos.push(po("Purchase Order #10053", 3, [
    task(0, "9 SKUs",    9, 360, 360, "pending put-away", 6, 4),
    task(2, "4 SKUs",    4, 160,  90, "in progress",      3),
  ]));

  // ── wh-005 Gudang Semarang Industrial (whIdx 4) ────────────────────────────
  // 3 tasks pending put-away, 1 open, 1 completed
  pos.push(po("#PO-2026-0066", 4, [
    task(3, "All SKUs", 11, 440, 440, "pending put-away", 9, 6),
  ]));
  pos.push(po("Purchase Order #10050", 4, [
    task(5, "All SKUs",  8, 320, 320, "pending put-away", 7, 4),
  ]));
  // Split PO: first batch pending put-away; second batch open
  pos.push(po("#PO-2026-0080", 4, [
    task(1, "7 SKUs",    7, 280, 280, "pending put-away", 5, 2),
    task(4, "6 SKUs",    6, 240,   0, "open"),
  ]));
  pos.push(po("Purchase Order #10057", 4, [
    task(2, "All SKUs",  9, 360, 360, "completed",        14, 11),
  ]));

  // ── wh-006 Gudang Makassar Selatan (whIdx 5) ───────────────────────────────
  // 2 tasks pending put-away, 1 in progress
  // Split PO: first batch pending put-away; second batch open
  pos.push(po("#PO-2026-0069", 5, [
    task(4, "7 SKUs",    7, 280, 280, "pending put-away", 6, 4),
    task(0, "4 SKUs",    4, 160,   0, "open"),
  ]));
  pos.push(po("Purchase Order #10058", 5, [
    task(3, "All SKUs",  8, 320, 320, "pending put-away", 4, 2),
  ]));
  pos.push(po("#PO-2026-0086", 5, [
    task(1, "All SKUs",  6, 240, 170, "in progress",      3),
  ]));

  // ── wh-008 Gudang Palembang (whIdx 6) ─────────────────────────────────────
  // No pending put-away — all either open, in progress, or completed
  pos.push(po("#PO-2026-0073", 6, [
    task(2, "All SKUs",  9, 360,   0, "open"),
  ]));
  pos.push(po("Purchase Order #10059", 6, [
    task(5, "All SKUs",  7, 280, 280, "completed",        10, 7),
  ]));
  pos.push(po("#PO-2026-0085", 6, [
    task(0, "All SKUs",  5, 200, 150, "in progress",      4),
  ]));

  // ── wh-010 Gudang Makassar Utara (whIdx 8) ────────────────────────────────
  // Agus's second warehouse (WMS Ops 2). 2 pending put-away, 1 in progress, 1 completed.
  pos.push(po("#PO-2026-0091", 8, [
    task(0, "All SKUs",  9, 360, 360, "pending put-away", 6, 4),
  ]));
  pos.push(po("Purchase Order #10063", 8, [
    task(0, "All SKUs", 12, 480, 480, "pending put-away", 8, 5),
  ]));
  pos.push(po("#PO-2026-0094", 8, [
    task(0, "All SKUs",  7, 280, 160, "in progress",      3),
  ]));
  // Split PO: first batch completed, second batch open
  pos.push(po("Purchase Order #10068", 8, [
    task(0, "6 SKUs",    6, 240, 240, "completed",        11, 8),
    task(0, "5 SKUs",    5, 200,   0, "open"),
  ]));

  return pos;
}

export const receivingPOs: ReceivingPO[] = generatePOs();

/**
 * Flat receiving-task refs for a warehouse — used by downstream modules
 * (purchase receivings, put-away) so a receipt's linked tasks always live in the
 * receipt's own warehouse and carry that warehouse's PIC as assignee.
 */
export function receivingTaskRefsForWarehouse(
  warehouseId: string,
): Array<{ id: string; no: string; assignee: string; status: ReceivingTask["status"] }> {
  return receivingPOs
    .filter((po) => po.warehouseId === warehouseId)
    .flatMap((po) =>
      po.tasks.map((t) => ({ id: t.id, no: t.taskNo, assignee: t.assignee, status: t.status })),
    );
}

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

/** Badge count for the Receiving stage = tasks with open/in-progress/pending status. */
export function receivingOpenCount(warehouseIds?: string[]): number {
  return receivingPOsFor(warehouseIds)
    .flatMap((po) => po.tasks)
    .filter((t) => t.status !== 'completed')
    .length;
}
