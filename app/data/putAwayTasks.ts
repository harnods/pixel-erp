import { reactive } from "vue";
import { warehouses } from "./warehouses";
import { receipts } from "./receipts";

/**
 * A put-away task — once goods are received they must be moved from the
 * receiving dock into storage (bin) locations. One task covers one PO's
 * received goods for one assignee. A task is Open (still being shelved) or
 * Completed (all units stored).
 */
export interface PutAwayTask {
  id: string;
  /** task number, e.g. "Put-away #20090" */
  taskNo: string;
  /** the source purchase order */
  purchaseNo: string;
  warehouseId: string;
  warehouseName: string;
  /** the warehouse person assigned */
  assignee: string;
  /** units to put away */
  itemQty: number;
  /** destination storage — a single bin, or "N locations" when split */
  destination: string;
  status: "open" | "in progress" | "completed";
  startDate?: string;
  endDate?: string;
}

const ASSIGNEES = [
  "Budi Santoso",
  "Dewi Rahayu",
  "Rizki Pratama",
  "Agus Firmansyah",
  "Sari Indah",
  "Hendra Wijaya",
];

const ZONES = ["A", "B", "C", "D"];

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
const BASE_DATE = "2026-05-01";

const PUTAWAY_WAREHOUSES = warehouses.filter(
  (w) => !w.isDefault && w.status === "active",
);

function generateTasks(count = 9): PutAwayTask[] {
  const out: PutAwayTask[] = [];
  let seq = 20090;
  for (let p = 0; p < count; p++) {
    const wh = PUTAWAY_WAREHOUSES[p % PUTAWAY_WAREHOUSES.length];
    const purchaseNo = p % 2 === 0
      ? `#PO${String(60 + p).padStart(3, "0")}`
      : `Purchase Order #${10042 + p}`;
    const itemQty = (((p * 7 + 5) % 20) + 4) * 4; // realistic unit counts
    // either a single bin location or spread across a few
    const split = p % 3 === 0;
    const zone = ZONES[p % ZONES.length];
    const destination = split
      ? `${((p % 3) + 2)} locations`
      : `${zone}-${String((p % 9) + 1).padStart(2, "0")}-${String((p % 5) + 1).padStart(2, "0")}`;
    // spread across the lifecycle: open · in progress (being shelved) · completed
    const status: PutAwayTask["status"] = p % 4 === 1 ? "completed" : p % 4 === 3 ? "in progress" : "open";
    const startDate = status !== "open" ? shiftDate(BASE_DATE, p * 3 + 1) : undefined;
    const endDate = status === "completed" ? shiftDate(startDate!, 1 + (p % 3)) : undefined;
    out.push({
      id: `pa-${p}`,
      taskNo: `Put-away #${seq++}`,
      purchaseNo,
      warehouseId: wh.id,
      warehouseName: wh.name,
      assignee: ASSIGNEES[p % ASSIGNEES.length],
      itemQty,
      destination,
      status,
      startDate,
      endDate,
    });
  }
  return out;
}

export const putAwayTasks = reactive<PutAwayTask[]>(generateTasks());

// Next task number — continues past the generated ones.
let nextSeq = 20090 + putAwayTasks.length;

/** Create a put-away task (from a completed receiving) — newly created → "open". */
export function addPutAwayTask(opts: {
  purchaseNo: string;
  warehouseId: string;
  warehouseName: string;
  assignee: string;
  itemQty: number;
}): PutAwayTask {
  const seq = nextSeq++;
  const task: PutAwayTask = {
    id: `pa-new-${seq}`,
    taskNo: `Put-away #${seq}`,
    purchaseNo: opts.purchaseNo,
    warehouseId: opts.warehouseId,
    warehouseName: opts.warehouseName,
    assignee: opts.assignee,
    itemQty: opts.itemQty,
    destination: "Unassigned",
    status: "open",
  };
  putAwayTasks.unshift(task);
  return task;
}

/** Put-away tasks scoped to warehouses (all when none given). */
export function putAwayTasksFor(warehouseIds?: string[]): PutAwayTask[] {
  return warehouseIds?.length
    ? putAwayTasks.filter((t) => warehouseIds.includes(t.warehouseId))
    : putAwayTasks;
}

/** Badge count for the Put-away stage = unfinished put-away tasks (scoped). */
export function putAwayOpenCount(warehouseIds?: string[]): number {
  return putAwayTasksFor(warehouseIds).filter((t) => t.status !== "completed").length;
}

/** Put-away task(s) linked to a receipt (completed or partial reception). */
export function getPutAwayForReceipt(orderId: string): PutAwayTask[] {
  const receipt = receipts.find((r) => r.id === orderId);
  if (!receipt) return [];
  const h = orderId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const taskNum = 20200 + (h % 300);
  const status: PutAwayTask["status"] = h % 3 === 0 ? "open" : h % 3 === 1 ? "in progress" : "completed";
  const base = receipt.receivedDate ?? receipt.estimatedArrival;
  const startDate = status !== "open" ? shiftDate(base, 1) : undefined;
  const endDate = status === "completed" ? shiftDate(base, 2 + (h % 3)) : undefined;
  const split = h % 4 === 0;
  const destination = split
    ? `${(h % 3) + 2} locations`
    : `${ZONES[h % 4]}-${String((h % 9) + 1).padStart(2, "0")}-${String((h % 5) + 1).padStart(2, "0")}`;
  return [{
    id: `pa-receipt-${orderId}`,
    taskNo: `Put-away #${taskNum}`,
    purchaseNo: receipt.purchaseNo,
    warehouseId: receipt.warehouseId,
    warehouseName: receipt.warehouseName,
    assignee: ASSIGNEES[h % ASSIGNEES.length] ?? ASSIGNEES[0],
    itemQty: receipt.receivedQty,
    destination,
    status,
    startDate,
    endDate,
  }];
}
