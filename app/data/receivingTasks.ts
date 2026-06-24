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
  status: "open" | "completed";
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
    status: "open" | "completed",
  ): ReceivingTask => ({
    id: `rtask-${seq}`,
    taskNo: `Receiving #${seq++}`,
    assignee,
    skuScope,
    skuCount,
    purchaseQty,
    receivedQty,
    status,
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
      tasks.push(mkTask(ASSIGNEES[p % ASSIGNEES.length], `${s1} SKUs`, s1, q1, earlyClose ? Math.round(q1 * 0.7) : q1, "completed"));
      // Remainder is still open — either not started yet (0) or partway through.
      tasks.push(mkTask(ASSIGNEES[(p + 2) % ASSIGNEES.length], `${s2} SKUs`, s2, q2, earlyClose ? Math.round(q2 * 0.5) : 0, "open"));
    } else {
      const q = totalSkus * 4;
      // Single open task — realistic spread: not started (0), early progress, almost done.
      const stage = p % 3; // 0 → not started, 1 → ~40%, 2 → ~75%
      const receivedQty = stage === 0 ? 0 : stage === 1 ? Math.round(q * 0.4) : Math.round(q * 0.75);
      tasks.push(mkTask(ASSIGNEES[p % ASSIGNEES.length], "All SKUs", totalSkus, q, receivedQty, "open"));
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

/** A PO is in the receiving queue while it still has an open task. */
export function receivingQueuePOs(warehouseIds?: string[]): ReceivingPO[] {
  return receivingPOsFor(warehouseIds).filter((po) =>
    po.tasks.some((t) => t.status === "open"),
  );
}

/** Badge count for the Receiving stage = POs with open tasks (scoped). */
export function receivingOpenCount(warehouseIds?: string[]): number {
  return receivingQueuePOs(warehouseIds).length;
}
