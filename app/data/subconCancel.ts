/**
 * Cancelling a work order — and, on a subcon order, getting back whatever raw
 * material already reached the vendor.
 *
 * A subcon order can be cancelled until the subcon purchase order for the
 * vendor's work is issued; after that the action is not offered. If raw material
 * is already in the subcon warehouse (an approved transfer on Resupply, a
 * purchase-delivery receipt on Dropship — `subconSentToVendor`), cancelling
 * lists it and the user picks the warehouse each line returns to. One draft
 * warehouse transfer is raised per chosen warehouse, out of the subcon warehouse,
 * awaiting approval like every other transfer subcon raises. Transfers to the
 * vendor still awaiting approval are cancelled: they never moved anything.
 */
import {
  workOrders, persistWorkOrders, recordSubconDocument, subconSentToVendor,
  subconServicePoIssued, type WorkOrder, type WorkOrderStatus,
} from './workOrders'
import { billOfMaterials, catalogProduct } from './billOfMaterials'
import { warehouseTransfers, addTransfer, cancelTransfer } from './warehouseTransfers'
import { warehouses } from './warehouses'
import { getWarehouseDetail, autoSelectSerials } from './warehouseDetails'
import { TODAY } from './master'

/** Statuses before the vendor's work is ordered — the only ones a subcon order cancels from. */
const SUBCON_CANCELABLE: WorkOrderStatus[] = ['not started', 'waiting rm procurement', 'waiting subcon order']

/** Whether Cancel work order is offered. Hidden once the subcon PO exists. */
export function canCancelWorkOrder(wo: WorkOrder): boolean {
  if (!wo.subcon) return wo.status === 'not started'
  return SUBCON_CANCELABLE.includes(wo.status) && !subconServicePoIssued(wo)
}

/** One raw material line already at the vendor, with where it returns to by default. */
export interface SubconReturnLine {
  sku: string
  productId: string
  name: string
  unit: string
  /** Qty in the subcon warehouse for this order. */
  qty: number
  defaultWarehouseId: string
}

/** Company warehouses a return can go to (never a vendor's subcon warehouse). */
export function returnWarehouseOptions(): { id: string; name: string }[] {
  return warehouses
    .filter(w => !w.isDefault && w.status === 'active')
    .map(w => ({ id: w.id, name: w.name }))
}

/**
 * Raw material at the vendor for this order, in BOM order. Empty when nothing
 * has reached the vendor — cancelling then needs only a confirmation.
 *
 * Default return warehouse: where the stock came from — the origin of the
 * transfer that carried it (Resupply), else the order's source warehouse; on
 * Dropship, which never held it, the order's receiving warehouse.
 */
export function subconReturnLines(wo: WorkOrder): SubconReturnLine[] {
  const c = wo.subcon
  if (!c) return []
  const atVendor = subconSentToVendor(wo)
  const bom = billOfMaterials.find(b => b.id === wo.bomId)
  const options = new Set(returnWarehouseOptions().map(w => w.id))
  const fallback = (c.method === 'dropship' ? c.receivingWarehouseId : c.sourceWarehouseId) ?? ''
  const originFor = (sku: string): string => {
    for (const d of c.raisedDocuments ?? []) {
      if (d.route !== '/warehouse-transfers') continue
      const tr = warehouseTransfers.find(t => t.id === d.id)
      if (tr && tr.destinationId === c.subconWarehouseId && tr.status !== 'draft'
        && tr.status !== 'canceled' && tr.status !== 'rejected'
        && (tr.lines ?? []).some(l => l.sku === sku)) return tr.originId
    }
    return fallback
  }
  return (bom?.rawMaterials ?? []).flatMap((r) => {
    const product = catalogProduct(r.productId)
    const sku = product?.sku
    const qty = sku ? atVendor[sku] ?? 0 : 0
    if (!sku || qty <= 0) return []
    const origin = originFor(sku)
    return [{
      sku, productId: r.productId, name: product!.name, unit: r.unit, qty,
      defaultWarehouseId: options.has(origin) ? origin : (returnWarehouseOptions()[0]?.id ?? ''),
    }]
  })
}

export interface SubconReturnChoice { sku: string; qty: number; warehouseId: string }

/**
 * Cancel a work order. On a subcon order, raise the return transfers for the
 * chosen warehouses first, then cancel. Returns the transfers raised.
 */
export function cancelWorkOrder(workOrderId: string, returns: SubconReturnChoice[] = []): { id: string; number: string }[] {
  const wo = workOrders.find(w => w.id === workOrderId)
  if (!wo || !canCancelWorkOrder(wo)) return []
  const c = wo.subcon
  const today = `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, '0')}-${String(TODAY.getDate()).padStart(2, '0')}`

  // Cancel first, so recording the returns cannot move the status back.
  wo.status = 'canceled'
  wo.endDate = today
  persistWorkOrders()
  if (!c) return []

  // Transfers to the vendor still awaiting approval moved nothing — withdraw them.
  for (const d of c.raisedDocuments ?? []) {
    const tr = warehouseTransfers.find(t => t.id === d.id)
    if (tr && tr.destinationId === c.subconWarehouseId && tr.status === 'draft') {
      cancelTransfer(tr.id, `Work order ${wo.number} canceled`)
    }
  }

  const names = new Map(returnWarehouseOptions().map(w => [w.id, w.name]))
  const vendorStock = getWarehouseDetail(c.subconWarehouseId)?.stock ?? []
  const byWarehouse = new Map<string, SubconReturnChoice[]>()
  for (const r of returns) {
    if (r.qty <= 0 || !r.warehouseId) continue
    byWarehouse.set(r.warehouseId, [...(byWarehouse.get(r.warehouseId) ?? []), r])
  }

  const raised: { id: string; number: string }[] = []
  for (const [warehouseId, lines] of byWarehouse) {
    const created = addTransfer({
      date: today,
      originId: c.subconWarehouseId,
      originName: c.subconWarehouseName,
      destinationId: warehouseId,
      destinationName: names.get(warehouseId) ?? warehouseId,
      tags: [],
      memo: `Return from ${wo.number} · canceled · ${c.vendorName}`,
      lines: lines.map(l => ({
        sku: l.sku,
        qty: l.qty,
        // A serial-tracked unit only moves with its serials named — the subcon
        // warehouse's own selection rule picks them, as on the outbound transfer.
        serials: vendorStock.find(s => s.sku === l.sku)?.serials
          ? autoSelectSerials(c.subconWarehouseId, l.sku, l.qty)
          : undefined,
      })),
    })
    recordSubconDocument(wo.id, { kind: 'returnTransfer', id: created.id, number: created.number, route: '/warehouse-transfers' })
    raised.push({ id: created.id, number: created.number })
  }
  return raised
}
