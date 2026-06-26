import { reactive } from "vue";
import { warehouses } from "./warehouses";
import { receipts } from "./receipts";
import { receivingTaskRefsForWarehouse } from "./receivingTasks";
import { picForWarehouse } from "./warehouses";
import { TODAY_ISO } from './master'

/**
 * A put-away task — once goods are received they must be moved from the
 * receiving dock into storage (bin) locations. One task can cover one or more
 * receiving tasks whose status is "pending put-away". A task is Open (not
 * started), In progress (shelving underway) or Completed (all units stored).
 */
export interface PutAwayTask {
  id: string;
  /** task number, e.g. "Put-away #20090" */
  taskNo: string;
  /** the source receiving tasks bundled into this put-away */
  receivingTaskIds: string[];
  receivingTaskNos: string[];
  warehouseId: string;
  warehouseName: string;
  /** the warehouse person assigned */
  assignee: string;
  /** total units to put away */
  itemQty: number;
  /** destination storage — a single bin, or "N locations" when split */
  destination: string;
  status: "open" | "in progress" | "completed";
  startDate?: string;
  endDate?: string;
}

const ZONES = ["A", "B", "C", "D"];

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
const BASE_DATE = TODAY_ISO

const PUTAWAY_WAREHOUSES = warehouses.filter(
  (w) => !w.isDefault && w.status === "active",
);

// Receiving tasks awaiting / finished put-away, grouped by warehouse. A put-away
// only ever bundles tasks from its own warehouse, so the linked receiving tasks,
// destination and assignee all stay consistent with the put-away's warehouse.
function putAwaySourcePool(warehouseId: string): Array<{ id: string; no: string }> {
  return receivingTaskRefsForWarehouse(warehouseId)
    .filter((t) => t.status === "pending put-away" || t.status === "completed")
    .map((t) => ({ id: t.id, no: t.no }));
}

function generateTasks(): PutAwayTask[] {
  const out: PutAwayTask[] = [];
  let seq = 20090;
  // Only warehouses that actually have received goods to shelve get a put-away.
  const whs = PUTAWAY_WAREHOUSES.filter((w) => putAwaySourcePool(w.id).length > 0);
  whs.forEach((wh, p) => {
    const pool = putAwaySourcePool(wh.id);
    const itemQty = (((p * 7 + 5) % 20) + 4) * 4;
    const split = p % 3 === 0 && pool.length > 1;
    const zone = ZONES[p % ZONES.length];
    const destination = split
      ? `${((p % 3) + 2)} locations`
      : `${zone}-${String((p % 9) + 1).padStart(2, "0")}-${String((p % 5) + 1).padStart(2, "0")}`;
    const status: PutAwayTask["status"] = p % 4 === 1 ? "completed" : p % 4 === 3 ? "in progress" : "open";
    const daysBack = status === "in progress" ? 2 + p : 8 + p * 2
    const startDate = status !== "open" ? shiftDate(BASE_DATE, -daysBack) : undefined;
    const endDate = status === "completed" ? shiftDate(startDate!, 2 + (p % 3)) : undefined;

    // bundle 1–3 of this warehouse's receiving tasks
    const taskCount = Math.min(pool.length, p % 4 === 2 ? 3 : p % 3 === 1 ? 2 : 1);
    const rtasks = pool.slice(0, taskCount);

    out.push({
      id: `pa-${p}`,
      taskNo: `Put-away #${seq++}`,
      receivingTaskIds: rtasks.map((r) => r.id),
      receivingTaskNos: rtasks.map((r) => r.no),
      warehouseId: wh.id,
      warehouseName: wh.name,
      assignee: picForWarehouse(wh.id, p),
      itemQty,
      destination,
      status,
      startDate,
      endDate,
    });
  });
  return out;
}

export const putAwayTasks = reactive<PutAwayTask[]>(generateTasks());

let nextSeq = 20090 + putAwayTasks.length;

/** Create a put-away task from one or more completed receiving tasks — newly created → "open". */
export function addPutAwayTask(opts: {
  receivingTaskIds: string[];
  receivingTaskNos: string[];
  warehouseId: string;
  warehouseName: string;
  assignee: string;
  itemQty: number;
}): PutAwayTask {
  const seq = nextSeq++;
  const task: PutAwayTask = {
    id: `pa-new-${seq}`,
    taskNo: `Put-away #${seq}`,
    receivingTaskIds: opts.receivingTaskIds,
    receivingTaskNos: opts.receivingTaskNos,
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

/**
 * Put-away task(s) shown on a receipt's detail page. Goods received against a
 * receipt are put away in that receipt's warehouse, so we return the real
 * put-away task(s) for the receipt's warehouse — same warehouse, same PIC as the
 * receipt's purchase receivings, and a working link to the put-away detail.
 */
export function getPutAwayForReceipt(orderId: string): PutAwayTask[] {
  const receipt = receipts.find((r) => r.id === orderId);
  if (!receipt) return [];
  return putAwayTasks.filter((t) => t.warehouseId === receipt.warehouseId);
}
