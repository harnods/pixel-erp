/**
 * WMS Reports — the row-level "raw data dump" behind the four WMS report tables
 * (docs/prd/wms-reports-analytics-prd.md, Stories 11–14). Rendered by
 * WmsReportDetailPage.vue.
 *
 * Everything here is DERIVED from the live operational datasets (receipts +
 * receiving/put-away tasks on the inbound side; outgoing orders + picking/packing/
 * delivery tasks on the outbound side) — nothing is faked. It mirrors the same
 * "closed" derivation the WMS Overview analytics uses (wmsAnalytics.ts): a receipt
 * closes when its receiving is fully concluded (put-away Start/End is out of scope
 * in the mock, so receipts rarely reach status='completed'); an order closes when
 * it is completed and shipped.
 *
 * Row values are stored RAW (dates as ISO strings, qtys as numbers, everything
 * else as text) so the page can sort/format/export them uniformly. Missing
 * timestamps are `undefined` and render blank (—), never zero/epoch (PRD AC#3).
 */
import { receipts } from './receipts'
import { receivingTasks, type ReceivingTask } from './receivingTasks'
import { putAwayTasks } from './putAwayTasks'
import { outgoingOrders } from './outgoing'
import { pickingTasks, pickedQtyForOrderSku } from './pickingTasks'
import { packingTasks } from './packingTasks'
import { deliveryTasks, shippedQtyBySkuForOrder } from './deliveryTasks'
import { orderSkuLines } from './inventory'
import { TODAY } from './master'

// ── Filter shape ──────────────────────────────────────────────────────────────
export interface ReportFilter {
  /** selected warehouse ids; empty = all */
  warehouseIds: string[]
  /** selected operator (assignee) names; empty = all */
  operators: string[]
  /** performance period, inclusive, in days back from TODAY — used when customRange is null */
  periodDays: number
  /** explicit inclusive ISO (yyyy-mm-dd) date range; overrides periodDays when set */
  customRange?: { from: string; to: string } | null
}

export const DEFAULT_REPORT_FILTER: ReportFilter = { warehouseIds: [], operators: [], periodDays: 30, customRange: null }

// ── Column + row types ────────────────────────────────────────────────────────
export interface ReportColumn {
  key: string
  label: string
  sortType: 'text' | 'number' | 'date'
  /** right-align numeric columns */
  align?: 'right'
  /** date column whose source is a pure calendar date (no meaningful time) —
   *  render as DD/MM/YYYY, never a spurious 00:00/07:00 timestamp. */
  dateOnly?: boolean
}
/** A raw row: ISO-string dates, numbers for qty, strings for text; missing = undefined/null. */
export type ReportRow = Record<string, string | number | null | undefined>

export interface ReportDef {
  title: string
  /** which operator pool feeds the Operator filter dropdown */
  direction: 'inbound' | 'outbound'
  columns: ReportColumn[]
  rows(filter: ReportFilter): ReportRow[]
}

// ── Date helpers ──────────────────────────────────────────────────────────────
const MS_DAY = 86_400_000
function parse(d?: string): Date | null {
  if (!d) return null
  const t = new Date(d)
  return isNaN(t.getTime()) ? null : t
}
function periodStart(days: number): Date {
  return new Date(TODAY.getTime() - days * MS_DAY)
}
/** Date-range match — a custom range (inclusive, by calendar day) takes precedence
 *  over the rolling periodDays window (D-periodDays … TODAY). */
function inPeriod(f: ReportFilter, d?: string): boolean {
  const dt = parse(d)
  if (!dt) return false
  if (f.customRange) {
    const from = parse(f.customRange.from)
    const to = parse(f.customRange.to)
    if (!from || !to) return false
    // inclusive: from 00:00 of `from` up to 23:59:59.999 of `to`
    const end = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999)
    const start = new Date(from.getFullYear(), from.getMonth(), from.getDate())
    return dt >= start && dt <= end
  }
  return dt >= periodStart(f.periodDays) && dt <= TODAY
}
function whOk(f: ReportFilter, warehouseId: string): boolean {
  return !f.warehouseIds.length || f.warehouseIds.includes(warehouseId)
}
/** Row-level operator match — passes when the filter is empty or any of the row's
 *  operator names (receiver/putaway PIC, or picker/packer/shipping PIC) matches. */
function opMatch(f: ReportFilter, names: (string | undefined)[]): boolean {
  return !f.operators.length || names.some((n) => n !== undefined && f.operators.includes(n))
}

// ══════════════════════════════════════════════════════════════════════════════
// INBOUND — closed-receipt derivation (mirrors wmsAnalytics)
// ══════════════════════════════════════════════════════════════════════════════
function recvTasksByReceipt(): Map<string, ReceivingTask[]> {
  const m = new Map<string, ReceivingTask[]>()
  for (const t of receivingTasks) {
    if (t.status === 'canceled') continue
    const a = m.get(t.receiptId) ?? []
    a.push(t)
    m.set(t.receiptId, a)
  }
  return m
}
/** A receipt is closed once every one of its (non-cancelled) receiving tasks has
 *  ended (completed or awaiting put-away) — the meaningful close event, since
 *  put-away rarely finishes in the mock. */
function isClosed(tasks: ReceivingTask[] | undefined): boolean {
  return !!tasks && tasks.length > 0 && tasks.every((t) => t.status === 'completed' || t.status === 'pending put-away')
}
/** Inbound closing time = the latest receiving finish across the receipt's tasks. */
function closeDate(tasks: ReceivingTask[]): string | undefined {
  return tasks.map((t) => t.endDate).filter(Boolean).sort().slice(-1)[0]
}
/** The non-cancelled put-away task that consumed a given receiving task, if any. */
function putAwayForReceiving(taskId: string) {
  return putAwayTasks.find((pa) => pa.status !== 'canceled' && pa.receivingTaskIds.includes(taskId))
}

// 1 ── Inbound Timeliness — one row per receiving task ─────────────────────────
function inboundTimelinessRows(f: ReportFilter): ReportRow[] {
  const byReceipt = recvTasksByReceipt()
  const out: ReportRow[] = []
  for (const r of receipts) {
    if (r.status === 'canceled' || !whOk(f, r.warehouseId)) continue
    const tasks = byReceipt.get(r.id)
    if (!isClosed(tasks) || !inPeriod(f, closeDate(tasks!))) continue
    const closing = closeDate(tasks!)
    for (const t of tasks!) {
      const pa = putAwayForReceiving(t.id)
      if (!opMatch(f, [t.assignee, pa?.assignee])) continue
      out.push({
        warehouseName: t.warehouseName,
        inboundId: r.number,
        expectedArrival: r.estimatedArrival,
        inboundClosing: closing,
        receivingId: t.taskNo,
        receiverName: t.assignee,
        receivingStart: t.startDate,
        receivingFinish: t.endDate,
        putawayPic: pa?.assignee,
        putawayId: pa?.taskNo,
        putawayStart: pa?.startDate,
        putawayFinish: pa?.endDate,
      })
    }
  }
  return out
}

// 2 ── Inbound Accuracy — one row per receiving item (SKU line) ────────────────
function inboundAccuracyRows(f: ReportFilter): ReportRow[] {
  const byReceipt = recvTasksByReceipt()
  const out: ReportRow[] = []
  for (const r of receipts) {
    if (r.status === 'canceled' || !whOk(f, r.warehouseId)) continue
    const tasks = byReceipt.get(r.id)
    if (!isClosed(tasks) || !inPeriod(f, closeDate(tasks!))) continue
    for (const t of tasks!) {
      const pa = putAwayForReceiving(t.id)
      if (!opMatch(f, [t.assignee, pa?.assignee])) continue
      for (const it of t.items) {
        // Put-away qty for this SKU — summed across completedItems (blank if the
        // put-away never actually ran, which is the norm in the mock).
        const paItems = pa?.completedItems?.filter((ci) => ci.skuCode === it.sku)
        const putawayQty = paItems && paItems.length ? paItems.reduce((s, ci) => s + ci.qty, 0) : null
        out.push({
          supplierSender: r.vendor,
          warehouseName: t.warehouseName,
          inboundId: r.number,
          productName: it.productName,
          inboundQty: it.expectedQty,
          receiverName: t.assignee,
          receivingId: t.taskNo,
          receivingQty: it.receivedQty,
          putawayPic: pa?.assignee,
          putawayId: pa?.taskNo,
          putawayQty,
        })
      }
    }
  }
  return out
}

// ══════════════════════════════════════════════════════════════════════════════
// OUTBOUND — closed-order derivation
// ══════════════════════════════════════════════════════════════════════════════
/** Closed outbound orders in scope: completed + shipped within the filtered date. */
function closedOrders(f: ReportFilter) {
  return outgoingOrders.filter(
    (o) => o.status === 'completed' && whOk(f, o.warehouseId) && inPeriod(f, o.shippedDate),
  )
}
function pickingTasksForOrder(orderId: string) {
  return pickingTasks.filter((t) => t.status !== 'canceled' && t.salesOrderIds.includes(orderId))
}
function packingTaskForOrder(orderId: string) {
  const tasks = packingTasks.filter((t) => t.status !== 'canceled' && t.salesOrderId === orderId)
  return tasks.find((t) => t.status === 'completed') ?? tasks[0]
}
function deliveryForOrder(orderId: string) {
  const tasks = deliveryTasks.filter((t) => t.status !== 'canceled' && t.salesOrderId === orderId)
  return tasks.find((t) => t.status === 'shipped') ?? tasks[0]
}
/** Packed qty for one order+SKU, summed across the order's packing tasks. */
function packedQtyForOrderSku(orderId: string, sku: string): number | null {
  const tasks = packingTasks.filter((t) => t.status !== 'canceled' && t.salesOrderId === orderId)
  if (!tasks.length) return null
  const key = `${orderId}::${sku}`
  return tasks.reduce((s, t) => s + (t.packedByKey?.[key] ?? 0), 0)
}

// 3 ── Outbound Timeliness — one row per picking task ──────────────────────────
function outboundTimelinessRows(f: ReportFilter): ReportRow[] {
  const out: ReportRow[] = []
  for (const o of closedOrders(f)) {
    const pack = packingTaskForOrder(o.id)
    const del = deliveryForOrder(o.id)
    const picks = pickingTasksForOrder(o.id)
    // An order with no picking task (picking disabled) still emits one row.
    const rows = picks.length ? picks : [undefined]
    for (const pick of rows) {
      if (!opMatch(f, [pick?.assignee, pack?.assignee, del?.assignee])) continue
      out.push({
        customer: o.customer,
        warehouseName: o.warehouseName,
        outboundId: o.number,
        outboundClosing: o.shippedDate,
        pickingId: pick?.taskNo,
        pickerName: pick?.assignee,
        pickingStart: pick?.startDate,
        pickingFinish: pick?.endDate,
        packerName: pack?.assignee,
        packingId: pack?.taskNo,
        packingStart: pack?.startDate,
        packingFinish: pack?.endDate,
        shippingPic: del?.assignee,
        courier: del?.courier,
        shippingId: del?.taskNo,
        shippingAt: del?.shippedDate,
      })
    }
  }
  return out
}

// 4 ── Outbound Accuracy — one row per order SKU line ──────────────────────────
function outboundAccuracyRows(f: ReportFilter): ReportRow[] {
  const out: ReportRow[] = []
  for (const o of closedOrders(f)) {
    const pack = packingTaskForOrder(o.id)
    const del = deliveryForOrder(o.id)
    const picks = pickingTasksForOrder(o.id)
    const pick = picks[0]
    if (!opMatch(f, [pick?.assignee, pack?.assignee, del?.assignee])) continue
    const shippedBySku = shippedQtyBySkuForOrder(o.id)
    for (const line of orderSkuLines(o)) {
      out.push({
        customer: o.customer,
        warehouseName: o.warehouseName,
        outboundId: o.number,
        productName: line.product.name,
        outboundQty: line.qty,
        pickerName: pick?.assignee,
        pickingId: pick?.taskNo,
        pickedQty: pickedQtyForOrderSku(o.id, line.sku),
        packerName: pack?.assignee,
        packingId: pack?.taskNo,
        packedQty: packedQtyForOrderSku(o.id, line.sku),
        courierName: del?.courier,
        shippingId: del?.taskNo,
        shippedQty: del ? (shippedBySku[line.sku] ?? 0) : null,
      })
    }
  }
  return out
}

// ══════════════════════════════════════════════════════════════════════════════
// Registry
// ══════════════════════════════════════════════════════════════════════════════
export const WMS_REPORTS: Record<string, ReportDef> = {
  'inbound-timeliness': {
    title: 'Inbound timeliness',
    direction: 'inbound',
    columns: [
      { key: 'warehouseName', label: 'Warehouse name', sortType: 'text' },
      { key: 'inboundId', label: 'Inbound ID', sortType: 'text' },
      { key: 'expectedArrival', label: 'Inbound expected arrival at', sortType: 'date', dateOnly: true },
      { key: 'inboundClosing', label: 'Inbound closing time', sortType: 'date' },
      { key: 'receivingId', label: 'Receiving ID', sortType: 'text' },
      { key: 'receiverName', label: 'Receiver name', sortType: 'text' },
      { key: 'receivingStart', label: 'Receiving start', sortType: 'date' },
      { key: 'receivingFinish', label: 'Receiving finish', sortType: 'date' },
      { key: 'putawayPic', label: 'Putaway PIC name', sortType: 'text' },
      { key: 'putawayId', label: 'Putaway ID', sortType: 'text' },
      { key: 'putawayStart', label: 'Putaway start', sortType: 'date' },
      { key: 'putawayFinish', label: 'Putaway finish', sortType: 'date' },
    ],
    rows: inboundTimelinessRows,
  },
  'inbound-accuracy': {
    title: 'Inbound accuracy',
    direction: 'inbound',
    columns: [
      { key: 'supplierSender', label: 'Supplier / sender name', sortType: 'text' },
      { key: 'warehouseName', label: 'Warehouse name', sortType: 'text' },
      { key: 'inboundId', label: 'Inbound ID', sortType: 'text' },
      { key: 'productName', label: 'Product name', sortType: 'text' },
      { key: 'inboundQty', label: 'Purchase qty', sortType: 'number', align: 'right' },
      { key: 'receiverName', label: 'Receiver name', sortType: 'text' },
      { key: 'receivingId', label: 'Receiving ID', sortType: 'text' },
      { key: 'receivingQty', label: 'Receiving qty', sortType: 'number', align: 'right' },
      { key: 'putawayPic', label: 'Putaway PIC', sortType: 'text' },
      { key: 'putawayId', label: 'Putaway ID', sortType: 'text' },
      { key: 'putawayQty', label: 'Putaway qty', sortType: 'number', align: 'right' },
    ],
    rows: inboundAccuracyRows,
  },
  'outbound-timeliness': {
    title: 'Outbound timeliness',
    direction: 'outbound',
    columns: [
      { key: 'customer', label: 'Customer / recipient name', sortType: 'text' },
      { key: 'warehouseName', label: 'Warehouse name', sortType: 'text' },
      { key: 'outboundId', label: 'Outbound ID', sortType: 'text' },
      { key: 'outboundClosing', label: 'Outbound closing time', sortType: 'date', dateOnly: true },
      { key: 'pickingId', label: 'Picking ID', sortType: 'text' },
      { key: 'pickerName', label: 'Picker name', sortType: 'text' },
      { key: 'pickingStart', label: 'Picking start', sortType: 'date' },
      { key: 'pickingFinish', label: 'Picking finish', sortType: 'date' },
      { key: 'packerName', label: 'Packer name', sortType: 'text' },
      { key: 'packingId', label: 'Packing ID', sortType: 'text' },
      { key: 'packingStart', label: 'Packing start', sortType: 'date' },
      { key: 'packingFinish', label: 'Packing finish', sortType: 'date' },
      { key: 'shippingPic', label: 'Shipping PIC', sortType: 'text' },
      { key: 'courier', label: 'Courier name', sortType: 'text' },
      { key: 'shippingId', label: 'Shipping ID', sortType: 'text' },
      { key: 'shippingAt', label: 'Shipping at', sortType: 'date' },
    ],
    rows: outboundTimelinessRows,
  },
  'outbound-accuracy': {
    title: 'Outbound accuracy',
    direction: 'outbound',
    columns: [
      { key: 'customer', label: 'Customer / recipient name', sortType: 'text' },
      { key: 'warehouseName', label: 'Warehouse name', sortType: 'text' },
      { key: 'outboundId', label: 'Outbound ID', sortType: 'text' },
      { key: 'productName', label: 'Product name', sortType: 'text' },
      { key: 'outboundQty', label: 'Order qty', sortType: 'number', align: 'right' },
      { key: 'pickerName', label: 'Picker name', sortType: 'text' },
      { key: 'pickingId', label: 'Picking ID', sortType: 'text' },
      { key: 'pickedQty', label: 'Picked qty', sortType: 'number', align: 'right' },
      { key: 'packerName', label: 'Packer name', sortType: 'text' },
      { key: 'packingId', label: 'Packing ID', sortType: 'text' },
      { key: 'packedQty', label: 'Packed qty', sortType: 'number', align: 'right' },
      { key: 'courierName', label: 'Courier name', sortType: 'text' },
      { key: 'shippingId', label: 'Shipping ID', sortType: 'text' },
      { key: 'shippedQty', label: 'Shipped qty', sortType: 'number', align: 'right' },
    ],
    rows: outboundAccuracyRows,
  },
}
