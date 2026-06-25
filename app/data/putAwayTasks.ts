import { reactive } from "vue";
import { warehouses } from "./warehouses";

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
