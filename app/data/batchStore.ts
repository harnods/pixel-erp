/**
 * Batch store — the persisted, user-owned layer of batch data. Seed batches are
 * still derived deterministically in productDetails.ts (getProductBatches); this
 * store only holds what a person changed or created on top of them:
 *
 *   • batches created in-app (master data only, qty 0 — PRD story 8)
 *   • batch-number renames, description edits and attribute values (stories 7, 9)
 *
 * Records are keyed by a stable batch id, never the batch number, so a rename
 * (PM answer A4) can't orphan a batch's barcode or attributes.
 *
 * Kept free of grades.ts / productDetails.ts imports so both can read it.
 */
import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { SEED_GRADE_IDS, getBatchAttributeConfig, type BatchAttributeKey } from './batchAttributes'
import { warehouses } from './warehouses'
import { getWarehouseDetail } from './warehouseDetails'

/** Per-key override of a batch's attribute values. A string sets the value; `null`
 *  clears it — including a value the seed derived (e.g. a seeded expiry date). A key
 *  that's absent leaves the derived value alone. */
export type BatchAttributeOverrides = Partial<Record<BatchAttributeKey, string | null>>

export interface BatchRecord {
  /** Stable id: `${sku}::seed-${i}` for a seed batch, `${sku}::new-…` for a created one. */
  id: string
  sku: string
  /** true = created in-app (the record IS the batch); false = edits over a seed batch. */
  created: boolean
  /** Set on created batches; on a seed batch only once it's been renamed. */
  batchNo?: string
  description?: string
  attributes?: BatchAttributeOverrides
  createdAt?: string
  updatedAt?: string
  updatedBy?: string
  /** Archived batches drop out of the product's batch list unless "Show archived
   *  batches" is on. Master data only — stock and history are untouched. */
  archived?: boolean
}

// Seed edits so the demo has graded, vendor-attributed stock from the start (and a
// grade that's "in use", which blocks deleting it). Both target the first two seed
// batches of 1001 — every stocked product has at least two (see getProductBatches).
const SEED_RECORDS: BatchRecord[] = [
  { id: '1001::seed-0', sku: '1001', created: false, attributes: { supplier: 'V003', grade: SEED_GRADE_IDS.A } },
  { id: '1001::seed-1', sku: '1001', created: false, attributes: { supplier: 'V001', grade: SEED_GRADE_IDS.B } },
]

// ── SEED DATA: records for warehouse lots (ATINV-9082 §5.1) ───────────────────────
// WMS lots (warehouseDetails.ts, `Batch #00001`) and product batch records are ONE
// batch master, identified by product + batch number. So the demo SKUs whose attribute
// set is richer than Expiry get a created record per distinct warehouse lot, filled
// with every attribute the product needs. The FIRST lot of each SKU leaves its required
// non-expiry attributes empty, to demo that state. Seed data, not user input.
const LOT_SEED_SKUS = ['1001', '1002', '1101'] as const
const LOT_SEED_VENDORS = ['V001', 'V002', 'V003']
const LOT_SEED_GRADES = [SEED_GRADE_IDS.A, SEED_GRADE_IDS.B, SEED_GRADE_IDS.C]

/** `YYYY-MM-DD` shifted by whole months (UTC-safe, day clamped to 28 to stay valid). */
function shiftMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const t = y * 12 + (m - 1) + months
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-${String(Math.min(d, 28)).padStart(2, '0')}`
}

/** Built lazily (first read of the store) — warehouseDetails.ts sits in an import
 *  cycle with this module, so nothing may touch it at module load. Deterministic:
 *  warehouses in list order, lots in stock order, first sighting of a number wins. */
function buildLotSeedRecords(): BatchRecord[] {
  const out: BatchRecord[] = []
  for (const sku of LOT_SEED_SKUS) {
    const lots = new Map<string, string>() // batchNo → expiry
    for (const w of warehouses) {
      const item = getWarehouseDetail(w.id)?.stock.find((s) => s.sku === sku)
      for (const lot of item?.batches ?? []) if (!lots.has(lot.batchNo)) lots.set(lot.batchNo, lot.expiryDate)
    }
    const config = getBatchAttributeConfig(sku)
    let n = 0
    for (const [batchNo, expiry] of lots) {
      const attributes: BatchAttributeOverrides = {}
      for (const a of config) {
        if (n === 0 && a.required && a.key !== 'expiry_date') continue // the demo's "still empty" lot
        if (a.key === 'expiry_date' && expiry) attributes.expiry_date = expiry
        else if (a.key === 'manufacturing_date' && expiry) attributes.manufacturing_date = shiftMonths(expiry, -12)
        else if (a.key === 'best_before_date' && expiry) attributes.best_before_date = shiftMonths(expiry, -1)
        else if (a.key === 'supplier') attributes.supplier = LOT_SEED_VENDORS[n % LOT_SEED_VENDORS.length]!
        else if (a.key === 'grade') attributes.grade = LOT_SEED_GRADES[n % LOT_SEED_GRADES.length]!
      }
      out.push({ id: `${sku}::seed-lot-${n}`, sku, created: true, batchNo, description: '', attributes })
      n++
    }
  }
  return out
}

const RECORDS_KEY = 'batch-records-v2'
const storedRecords = loadSnapshot<BatchRecord>(RECORDS_KEY)
const records = reactive<BatchRecord[]>(
  storedRecords ?? SEED_RECORDS.map((r) => ({ ...r, attributes: { ...r.attributes } })),
)
// A stored snapshot already contains the lot records; a fresh seed adds them on first use.
let lotRecordsSeeded = !!storedRecords
function ensureLotRecords() {
  if (lotRecordsSeeded) return
  lotRecordsSeeded = true
  records.push(...buildLotSeedRecords())
}
function persistRecords() { saveSnapshot(RECORDS_KEY, records) }

export function findBatchRecord(id: string): BatchRecord | undefined {
  ensureLotRecords()
  return records.find((r) => r.id === id)
}

/** Records for one product, in insertion order (created batches in creation order). */
export function batchRecordsForSku(sku: string): BatchRecord[] {
  ensureLotRecords()
  return records.filter((r) => r.sku === sku)
}

// ── Batch activity (create / edit history) ────────────────────────────────────────
/** One field that changed. Values stay raw (vendor id, grade id, ISO date) so each
 *  page formats them for display; an empty value is null. */
export interface BatchActivityChange {
  field: 'batchNo' | 'description' | BatchAttributeKey
  from: string | null
  to: string | null
}

export interface BatchActivity {
  batchId: string
  sku: string
  date: string
  user: string
  action: 'created' | 'updated' | 'archived' | 'unarchived'
  changes: BatchActivityChange[]
}

const ACTIVITY_KEY = 'batch-activity-v1'
const activity = reactive<BatchActivity[]>(loadSnapshot<BatchActivity>(ACTIVITY_KEY) ?? [])
function persistActivity() { saveSnapshot(ACTIVITY_KEY, activity) }

/** One batch's recorded creates and edits, newest first. */
export function batchActivityFor(batchId: string): BatchActivity[] {
  return activity.filter((e) => e.batchId === batchId).reverse()
}

/** Insert or replace a record by id, then persist — and, when given, record what
 *  changed for the batch's activity log. */
export function saveBatchRecord(
  record: BatchRecord,
  change?: Omit<BatchActivity, 'batchId' | 'sku'>,
): void {
  ensureLotRecords()
  const i = records.findIndex((r) => r.id === record.id)
  if (i === -1) records.push(record)
  else records.splice(i, 1, record)
  persistRecords()
  if (change) {
    activity.push({ batchId: record.id, sku: record.sku, ...change })
    persistActivity()
  }
}

let idSeq = records.length
export function newBatchId(sku: string): string {
  return `${sku}::new-${Date.now().toString(36)}${(idSeq++).toString(36)}`
}

/** How many batches store this grade. A grade is "used" (so it can't be deleted —
 *  PRD story 3) as long as any batch still holds it, even one whose product has
 *  since dropped Grade from its set: the value is only purged when that batch is
 *  next saved (story 7). Seed batches never derive a grade, so records are the
 *  complete picture. */
export function countBatchesUsingGrade(gradeId: string): number {
  ensureLotRecords()
  return records.filter((r) => r.attributes?.grade === gradeId).length
}
