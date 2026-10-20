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
import type { WorkOrder, WorkOrderStatus } from './workOrders'
import { billOfMaterials, catalogProduct } from './billOfMaterials'
import { SUBCON_METHOD_LABEL, SUBCON_SCOPE_LABEL, type SubconMethod } from './subcon'
import { formatDate } from '../utils/date'

/** R19 column headings, in order. */
export const SUBCON_EXPORT_COLUMNS = [
  'WO number', 'Product', 'BOM', 'Subcon vendor', 'Method', 'Scope',
  'Qty', 'Received', 'Promised date', 'Status',
] as const

export type SubconExportRow = Record<(typeof SUBCON_EXPORT_COLUMNS)[number], string>

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
  unit: string
  planStartDate: string
  promisedDate: string
  status: WorkOrderStatus
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
        unit: bom?.finishedGoodUnit ?? product?.unit ?? '',
        planStartDate: wo.planStartDate,
        promisedDate: c.promisedDate,
        status: wo.status,
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
    'Qty': `${r.plannedQty} ${r.unit}`.trim(),
    'Received': `${r.receivedQty}/${r.plannedQty}`,
    'Promised date': formatDate(r.promisedDate),
    'Status': WORK_ORDER_STATUS_LABEL[r.status] ?? r.status,
  }))
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
): Promise<void> {
  const XLSX = await import('xlsx')
  const header = SUBCON_EXPORT_COLUMNS.filter(c => columns.includes(c))
  const picked = rows.map(r => Object.fromEntries(header.map(h => [h, r[h]])))
  const sheet = XLSX.utils.json_to_sheet(picked, { header: [...header] })
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Subcon work orders')
  const stamp = today.toISOString().slice(0, 10)
  XLSX.writeFile(book, `subcon-work-orders-${stamp}.xlsx`)
}
