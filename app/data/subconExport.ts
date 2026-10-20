/**
 * The subcon report — an Excel export only (PRD Rev 5, R19).
 *
 * There are no report screens, cards or dashboards in the MVP. One row per subcon
 * work order, built from the work orders themselves, with exactly the R19 columns.
 * Status is the work order's own status (R22).
 *
 * Lives as the Subcon order report under Reports › Production
 * (SubconOrderReportPage.vue), which shows the rows on screen and downloads them.
 * The Work orders index keeps its export while filtered to Subcontracting.
 */
import { subconMaterialsFulfilled, subconCostLinesFor, type WorkOrder, type WorkOrderStatus } from './workOrders'
import { TODAY_ISO } from './master'
import { billOfMaterials, catalogProduct } from './billOfMaterials'
import { SUBCON_METHOD_LABEL, SUBCON_SCOPE_LABEL, type SubconMethod } from './subcon'
import { formatDate } from '../utils/date'

/**
 * R19 column headings, in order. "Qty" reads "Planned" and Received is the
 * quantity received alone, not received/planned (2026-10-20).
 */
export const SUBCON_EXPORT_COLUMNS = [
  'WO number', 'Product', 'BOM', 'Subcon vendor', 'Method', 'Scope',
  'Planned', 'Received', 'Subcon cost', 'Promised date', 'Status',
] as const

/** Cell values — text, except Subcon cost, which stays a number so the sheet can sum it. */
export type SubconExportRow = Record<(typeof SUBCON_EXPORT_COLUMNS)[number], string | number>

/** The work order statuses as the index shows them (R22). */
export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  'not started': 'Not started',
  'waiting rm procurement': 'Waiting RM procurement',
  'waiting subcon order': 'Waiting subcon order',
  'in progress': 'In progress',
  'partially produced': 'Partially produced',
  'partially completed': 'Partially completed',
  'completed': 'Completed',
  'canceled': 'Canceled',
}

/**
 * One subcon work order as the report shows it — typed values, so the screen can
 * sort and filter. The Excel rows are formatted from these, so screen and file
 * never disagree.
 */
export interface SubconReportRow {
  id: string
  number: string
  product: string
  bomNumber: string
  vendorId: string
  vendor: string
  /** Method id, for the method chip; `method` is its label. */
  methodId: SubconMethod
  method: string
  scope: string
  plannedQty: number
  receivedQty: number
  /** Total subcon cost — every cost line on the order (subconCostLinesFor), as the detail page sums it. */
  subconCost: number
  unit: string
  planStartDate: string
  promisedDate: string
  /** Subcon status (promised date + raw material fulfilment) — what the report shows. */
  status: SubconStatus
  /** The work order's own status (R22), kept for reference. */
  woStatus: WorkOrderStatus
}

/** Subcon work orders only, in the order given — non-subcon orders are left out. */
export function subconReportRows(orders: readonly WorkOrder[]): SubconReportRow[] {
  return orders
    .filter(wo => wo.category === 'Subcontracting' && !!wo.subcon)
    .map((wo) => {
      const c = wo.subcon!
      const bom = billOfMaterials.find(b => b.id === wo.bomId)
      const product = bom ? catalogProduct(bom.finishedGoodId) : undefined
      return {
        id: wo.id,
        number: wo.number,
        product: product?.name ?? wo.bomName,
        bomNumber: bom?.number ?? '',
        vendorId: c.vendorId,
        vendor: c.vendorName,
        methodId: c.method,
        method: SUBCON_METHOD_LABEL[c.method],
        scope: SUBCON_SCOPE_LABEL[c.scope],
        plannedQty: wo.plannedQty,
        receivedQty: wo.producedQty,
        subconCost: subconCostLinesFor(wo).reduce((sum, l) => sum + l.amount, 0),
        unit: bom?.finishedGoodUnit ?? product?.unit ?? '',
        planStartDate: wo.planStartDate,
        promisedDate: c.promisedDate,
        status: subconStatus(wo),
        woStatus: wo.status,
      }
    })
}

/** The Excel cells for report rows, under the R19 headings. */
export function toSubconExportRows(rows: readonly SubconReportRow[]): SubconExportRow[] {
  return rows.map(r => ({
    'WO number': r.number,
    'Product': r.product,
    'BOM': r.bomNumber,
    'Subcon vendor': r.vendor,
    'Method': r.method,
    'Scope': r.scope,
    'Planned': `${r.plannedQty} ${r.unit}`.trim(),
    'Received': String(r.receivedQty),
    'Subcon cost': r.subconCost,
    'Promised date': formatDate(r.promisedDate),
    'Status': SUBCON_STATUS_LABEL[r.status] ?? r.status,
  }))
}

/**
 * Subcon status — where the outsourced work stands, read from two facts only:
 * the promised return date, and whether every raw material is at the vendor
 * (`subconMaterialsFulfilled`: approved warehouse transfers on Resupply,
 * purchase-delivery receipts on Dropship; Basic needs none).
 *
 *   completed         the work order is completed
 *   overdue           past the promised date and not completed
 *   due soon          promised date is today or within the next 3 days (D-3…D-0)
 *   ready at vendor   materials fulfilled, more than 3 days to the promised date
 *   waiting materials materials short, more than 3 days to the promised date
 *
 * A canceled work order is none of these — it keeps `canceled` so it never reads
 * as overdue. "Today" is the app's mock timeline (TODAY_ISO), like every date rule.
 */
export type SubconStatus = 'waiting materials' | 'ready at vendor' | 'due soon' | 'overdue' | 'completed' | 'canceled'

/** Days before the promised date at which an open order turns Due soon (D-3). */
export const SUBCON_DUE_SOON_DAYS = 3

export const SUBCON_STATUS_LABEL: Record<SubconStatus, string> = {
  'waiting materials': 'Waiting materials',
  'ready at vendor': 'Ready at vendor',
  'due soon': 'Due soon',
  'overdue': 'Overdue',
  'completed': 'Completed',
  'canceled': 'Canceled',
}

/** Badge colour per subcon status (ErpStatusBadge `type`). */
export const SUBCON_STATUS_TYPE: Record<SubconStatus, 'completed' | 'announcement' | 'information' | 'warning' | 'critical'> = {
  // Waiting is a neutral queue state; amber is kept for the date getting close.
  'waiting materials': 'announcement',
  'ready at vendor': 'information',
  'due soon': 'warning',
  'overdue': 'critical',
  'completed': 'completed',
  'canceled': 'announcement',
}

/** Whole days from one ISO date to another (UTC, so DST never shifts it). */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000)
}

export function subconStatus(wo: WorkOrder, todayIso: string = TODAY_ISO): SubconStatus {
  if (wo.status === 'completed') return 'completed'
  if (wo.status === 'canceled') return 'canceled'
  const promised = wo.subcon?.promisedDate
  if (promised && promised < todayIso) return 'overdue'
  if (promised && daysBetween(todayIso, promised) <= SUBCON_DUE_SOON_DAYS) return 'due soon'
  return subconMaterialsFulfilled(wo) ? 'ready at vendor' : 'waiting materials'
}

/**
 * One row per subcon work order, in the order given. Non-subcon orders are left
 * out, so the caller can pass the list exactly as it is filtered on screen.
 */
export function buildSubconExportRows(orders: readonly WorkOrder[]): SubconExportRow[] {
  return toSubconExportRows(subconReportRows(orders))
}

/**
 * Download the rows as an .xlsx file, named for today. `columns` narrows the sheet
 * to the headings picked in the export dialog (R19 order kept); all by default.
 */
export async function downloadSubconExport(
  rows: SubconExportRow[],
  today = new Date(),
  columns: readonly (typeof SUBCON_EXPORT_COLUMNS)[number][] = SUBCON_EXPORT_COLUMNS,
  fileName?: string,
): Promise<void> {
  const XLSX = await import('xlsx')
  const header = SUBCON_EXPORT_COLUMNS.filter(c => columns.includes(c))
  const picked = rows.map(r => Object.fromEntries(header.map(h => [h, r[h]])))
  const sheet = XLSX.utils.json_to_sheet(picked, { header: [...header] })
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Subcon work orders')
  const stamp = today.toISOString().slice(0, 10)
  XLSX.writeFile(book, fileName ?? `subcon-work-orders-${stamp}.xlsx`)
}

/** What the Export report dialog narrows the file to. Empty product/vendor = all. */
export interface SubconExportFilter {
  /** ISO dates, inclusive — matched against the work order's plan start date. */
  from: string
  to: string
  product?: string
  vendorId?: string
}

/** Report rows inside the dialog's date range, product and vendor. */
export function filterSubconReportRows(rows: readonly SubconReportRow[], f: SubconExportFilter): SubconReportRow[] {
  return rows.filter(r =>
    r.planStartDate >= f.from && r.planStartDate <= f.to
    && (!f.product || r.product === f.product)
    && (!f.vendorId || r.vendorId === f.vendorId))
}
