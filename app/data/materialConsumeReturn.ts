import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { workOrders, type WorkOrderStatus, type WorkOrderMaterialReservation } from './workOrders'
import { billOfMaterials, catalogProduct } from './billOfMaterials'
import { warehouses } from './warehouses'
import { isBatchTracked, isSerialized, autoSelectBatches, autoSelectSerials } from './warehouseDetails'

/**
 * A single material consume/return entry (Work order detail → Material consume &
 * return tab, and the "New material record" create form). One row per product —
 * a form submission with several checked products creates one record per product.
 */
export interface MaterialConsumeReturnRecord {
  id: string
  workOrderId: string
  /** e.g. "Material Consume #10001" / "Material Return #10001" */
  number: string
  type: 'Consume' | 'Return'
  productId: string
  /** ISO date */
  date: string
  /** signed: positive for Consume, negative for Return */
  qty: number
  unit: string
  warehouseId: string
  memo: string
  recordedBy: string
  /** Which specific batch/serial units this record consumed or returned — only
   *  set for tracked (batch- or serial-managed) products. Used to work out how
   *  much of a work order's material reservation is still unconsumed. */
  batchSelection?: { batchNo: string; qty: number }[]
  serialSelection?: string[]
}

const CRR_RECORDER_POOL = ['Agung Mulyadi', 'Siti Rahma', 'Bayu Saputra']

// consumed-so-far, mirroring the Overview → Raw materials "Consumed qty" column.
function consumedForStatus(needed: number, status: WorkOrderStatus): number {
  if (status === 'partially produced' || status === 'partially completed') return Math.round(needed * 0.5)
  if (status === 'completed') return needed
  return 0
}

// Seed: one Consume record per raw material actually consumed (per the work
// order's status), plus a small excess-Return record for every other material —
// same shape the Material consume & return tab used before records were real.
// Also reserves batch/serial units for whatever's left unconsumed on each
// tracked material, straight onto the work order (wo.materialReservations) —
// computed here, not in workOrders.ts, because this is the one place that
// already knows each material's exact net-consumed qty (Consume net of the
// occasional excess Return below); duplicating that math on the workOrders.ts
// side risks drifting out of sync with the Return it can't see.
function buildSeed(): MaterialConsumeReturnRecord[] {
  const defaultWarehouseId = warehouses.find(w => !w.isDefault && w.status === 'active')?.id ?? warehouses[0]?.id ?? ''
  const records: MaterialConsumeReturnRecord[] = []
  let seq = 0
  let consumeSeq = 10001
  let returnSeq = 10001

  for (const wo of workOrders) {
    const bom = billOfMaterials.find(b => b.id === wo.bomId)
    if (!bom) continue
    const reservations: Record<string, WorkOrderMaterialReservation> = {}
    bom.rawMaterials.forEach((r, i) => {
      const consumedQty = consumedForStatus(r.needed, wo.status)
      let netConsumed = 0
      if (consumedQty > 0) {
        netConsumed = consumedQty
        const recordedBy = CRR_RECORDER_POOL[i % CRR_RECORDER_POOL.length]!
        records.push({
          id: `mcr-seed-${seq++}`,
          workOrderId: wo.id,
          number: `Material Consume #${consumeSeq++}`,
          type: 'Consume',
          productId: r.productId,
          date: wo.startDate ?? wo.planStartDate,
          qty: consumedQty,
          unit: r.unit,
          warehouseId: defaultWarehouseId,
          memo: '',
          recordedBy,
        })
        if (i % 2 === 1) {
          const returnQty = Math.min(5, consumedQty)
          netConsumed -= returnQty
          records.push({
            id: `mcr-seed-${seq++}`,
            workOrderId: wo.id,
            number: `Material Return #${returnSeq++}`,
            type: 'Return',
            productId: r.productId,
            date: wo.endDate ?? wo.startDate ?? wo.planStartDate,
            qty: -returnQty,
            unit: r.unit,
            warehouseId: defaultWarehouseId,
            memo: '',
            recordedBy,
          })
        }
      }
      // Reserve batch/serial units covering exactly what's left unconsumed —
      // the same qty the "Complete work order" guard's "Remaining qty" shows
      // and "Auto-consume & complete" would consume.
      const remaining = r.needed - netConsumed
      if (remaining <= 0) return
      const p = catalogProduct(r.productId)
      if (!p) return
      if (isBatchTracked(p.category)) {
        const picks = autoSelectBatches(defaultWarehouseId, p.sku, remaining)
        if (picks.length) reservations[r.productId] = { warehouseId: defaultWarehouseId, batchSelection: picks.map(b => ({ batchNo: b.batchNo, qty: b.take })) }
      } else if (isSerialized(p.category)) {
        const serials = autoSelectSerials(defaultWarehouseId, p.sku, remaining)
        if (serials.length) reservations[r.productId] = { warehouseId: defaultWarehouseId, serialSelection: serials }
      }
    })
    if (Object.keys(reservations).length) wo.materialReservations = reservations
  }
  return records
}

const snapshot = loadSnapshot<MaterialConsumeReturnRecord>('materialConsumeReturn')
export const materialConsumeReturnRecords = reactive<MaterialConsumeReturnRecord[]>(snapshot ?? buildSeed())

/** Persist the material consume/return snapshot (call after any mutation). */
export function persistMaterialConsumeReturn(): void {
  saveSnapshot('materialConsumeReturn', materialConsumeReturnRecords)
}

export function recordsForWorkOrder(workOrderId: string): MaterialConsumeReturnRecord[] {
  return materialConsumeReturnRecords.filter(r => r.workOrderId === workOrderId)
}

/**
 * What's left of a work order's batch/serial reservation for one product,
 * after subtracting whatever's already been consumed against it (a Return
 * doesn't give reservation back — it returns already-consumed stock, not
 * un-reserves it). Used to pre-fill the Material consume pick drawer and to
 * show what's still reserved-but-unconsumed in the "Complete work order" guard.
 */
export function remainingReservation(
  workOrderId: string,
  productId: string,
  reservation: WorkOrderMaterialReservation | undefined,
): WorkOrderMaterialReservation {
  if (!reservation) return {}
  const consumedBatch = new Map<string, number>()
  const consumedSerial = new Set<string>()
  for (const r of recordsForWorkOrder(workOrderId)) {
    if (r.productId !== productId || r.type !== 'Consume') continue
    for (const b of r.batchSelection ?? []) consumedBatch.set(b.batchNo, (consumedBatch.get(b.batchNo) ?? 0) + b.qty)
    for (const s of r.serialSelection ?? []) consumedSerial.add(s)
  }
  const batchSelection = reservation.batchSelection
    ?.map(b => ({ batchNo: b.batchNo, qty: b.qty - (consumedBatch.get(b.batchNo) ?? 0) }))
    .filter(b => b.qty > 0)
  const serialSelection = reservation.serialSelection?.filter(s => !consumedSerial.has(s))
  return { warehouseId: reservation.warehouseId, batchSelection, serialSelection }
}

let addSeq = materialConsumeReturnRecords.length
function nextNumber(type: 'Consume' | 'Return'): string {
  const prefix = type === 'Consume' ? 'Material Consume' : 'Material Return'
  const re = type === 'Consume' ? /^Material Consume #(\d+)$/ : /^Material Return #(\d+)$/
  let max = 10000
  for (const r of materialConsumeReturnRecords) {
    const m = r.number.match(re)
    if (m) max = Math.max(max, parseInt(m[1]!, 10))
  }
  return `${prefix} #${max + 1}`
}

/** Create a new consume/return record from the "New material record" form. */
export function addMaterialConsumeReturnRecord(data: Omit<MaterialConsumeReturnRecord, 'id' | 'number'>): MaterialConsumeReturnRecord {
  const rec: MaterialConsumeReturnRecord = {
    ...data,
    id: `mcr-new-${addSeq++}`,
    number: nextNumber(data.type),
  }
  materialConsumeReturnRecords.push(rec)
  persistMaterialConsumeReturn()
  return rec
}
