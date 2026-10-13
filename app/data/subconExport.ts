/**
 * The subcon report — an Excel export only (PRD Rev 5, R19).
 *
 * There are no report screens, cards or dashboards in the MVP. One row per subcon
 * work order, built from the work orders themselves, with exactly the R19 columns.
 * Status is the work order's own status (R22).
 *
 * OPEN (Product, UX): where the export lives. Default implemented: the Work orders
 * index, exporting only while the list is filtered to Subcontracting.
 */
import type { WorkOrder, WorkOrderStatus } from './workOrders'
import { billOfMaterials, catalogProduct } from './billOfMaterials'
import { SUBCON_METHOD_LABEL, SUBCON_SCOPE_LABEL } from './subcon'
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
 * One row per subcon work order, in the order given. Non-subcon orders are left
 * out, so the caller can pass the list exactly as it is filtered on screen.
 */
export function buildSubconExportRows(orders: readonly WorkOrder[]): SubconExportRow[] {
  return orders
    .filter(wo => wo.category === 'Subcontracting' && !!wo.subcon)
    .map((wo) => {
      const c = wo.subcon!
      const bom = billOfMaterials.find(b => b.id === wo.bomId)
      const product = bom ? catalogProduct(bom.finishedGoodId) : undefined
      const unit = bom?.finishedGoodUnit ?? product?.unit ?? ''
      return {
        'WO number': wo.number,
        'Product': product?.name ?? wo.bomName,
        'BOM': bom?.number ?? '',
        'Subcon vendor': c.vendorName,
        'Method': SUBCON_METHOD_LABEL[c.method],
        'Scope': SUBCON_SCOPE_LABEL[c.scope],
        'Qty': `${wo.plannedQty} ${unit}`.trim(),
        'Received': `${wo.producedQty}/${wo.plannedQty}`,
        'Promised date': formatDate(c.promisedDate),
        'Status': WORK_ORDER_STATUS_LABEL[wo.status] ?? wo.status,
      }
    })
}

/** Download the rows as an .xlsx file, named for today. */
export async function downloadSubconExport(rows: SubconExportRow[], today = new Date()): Promise<void> {
  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.json_to_sheet(rows, { header: [...SUBCON_EXPORT_COLUMNS] })
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Subcon work orders')
  const stamp = today.toISOString().slice(0, 10)
  XLSX.writeFile(book, `subcon-work-orders-${stamp}.xlsx`)
}
