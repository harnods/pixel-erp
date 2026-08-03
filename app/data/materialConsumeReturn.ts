import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { workOrders, type WorkOrderStatus } from './workOrders'
import { billOfMaterials } from './billOfMaterials'
import { warehouses } from './warehouses'

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
function buildSeed(): MaterialConsumeReturnRecord[] {
  const defaultWarehouseId = warehouses.find(w => !w.isDefault && w.status === 'active')?.id ?? warehouses[0]?.id ?? ''
  const records: MaterialConsumeReturnRecord[] = []
  let seq = 0
  let consumeSeq = 10001
  let returnSeq = 10001

  for (const wo of workOrders) {
    const bom = billOfMaterials.find(b => b.id === wo.bomId)
    if (!bom) continue
    bom.rawMaterials.forEach((r, i) => {
      const consumedQty = consumedForStatus(r.needed, wo.status)
      if (consumedQty <= 0) return
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
    })
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
