/**
 * Batches on a purchase delivery — the Vendor batch attribute follows the purchase
 * (Batch Attribute PRD story 10; plan Phase 5, docs/prd/batch-attribute-plan.md).
 *
 * Each batch-tracked line of a New purchase delivery splits its qty across batches:
 * new batches (created when the delivery is saved) and existing ones. The rules:
 *   1. A new batch's Vendor is prefilled with the delivery's vendor and keeps following
 *      it while the form is unsaved — unless the user changed that batch's vendor.
 *   2. An existing batch whose vendor differs is allowed after ONE confirmation that
 *      lists every such batch. Its vendor is never overwritten.
 *   3. An existing batch with no vendor is silently given the delivery's vendor.
 * Only products whose attribute set includes Vendor take part in 1–3.
 *
 * Pure data, like batchUpdateImport.ts: the form holds the allocations; this module
 * checks them and writes batches through createBatch / updateBatch on save.
 */
import { getBatchAttributeConfig, type BatchAttributeKey } from './batchAttributes'
import {
  createBatch, getProductBatchById, updateBatch, validateNewBatch,
  type BatchAttributeInput, type BatchError,
} from './productDetails'
import { vendors } from './vendors'

export interface DeliveryBatchAllocation {
  /** Stable row key within the form. */
  key: string
  /** The existing batch's id; absent for a batch this delivery creates. */
  batchId?: string
  batchNo: string
  qty: number
  /** New batch only — attribute values as stored (ISO dates, vendor id, grade id). */
  attributes?: Partial<Record<BatchAttributeKey, string>>
  /** New batch only — the user set this batch's vendor themselves, so it no longer
   *  follows the delivery's vendor. */
  vendorEdited?: boolean
}

export interface DeliveryBatchLine {
  sku: string
  productName: string
  qty: number
  batches: DeliveryBatchAllocation[]
}

export function productUsesVendor(sku: string): boolean {
  return getBatchAttributeConfig(sku).some((a) => a.key === 'supplier')
}

/** Rule 1: new batches that still follow the delivery take its vendor. */
export function followDeliveryVendor(
  sku: string,
  batches: readonly DeliveryBatchAllocation[],
  vendorId: string,
): DeliveryBatchAllocation[] {
  if (!productUsesVendor(sku)) return [...batches]
  return batches.map((b) =>
    b.batchId || b.vendorEdited ? b : { ...b, attributes: { ...b.attributes, supplier: vendorId } },
  )
}

export interface VendorMismatch { sku: string; productName: string; batchNo: string; vendorName: string }

/** PRD story 10 copy for rule 2, "Supplier" → "Vendor" (D2). Fill `{batchVendor}` and
 *  `{deliveryVendor}` after translating. */
export const VENDOR_MISMATCH_COPY =
  'This batch is recorded with vendor {batchVendor}, while this transaction is from {deliveryVendor}. The vendor of the batch will not be changed.'

/** Rule 2: existing batches on the delivery whose vendor isn't the delivery's. */
export function deliveryVendorMismatches(lines: readonly DeliveryBatchLine[], vendorId: string): VendorMismatch[] {
  const out: VendorMismatch[] = []
  for (const line of lines) {
    if (!productUsesVendor(line.sku)) continue
    for (const b of line.batches) {
      if (!b.batchId) continue
      const supplier = getProductBatchById(line.sku, b.batchId)?.attributes.supplier
      if (supplier && supplier !== vendorId) {
        out.push({
          sku: line.sku,
          productName: line.productName,
          batchNo: b.batchNo,
          vendorName: vendors.find((v) => v.id === supplier)?.name ?? supplier,
        })
      }
    }
  }
  return out
}

export interface DeliveryBatchCheck {
  /** Batch qty doesn't add up to the line qty. */
  qtyMismatch: boolean
  /** A row's qty isn't more than 0, by row key. */
  qtyInvalid: string[]
  /** New-batch errors by row key (createBatch's rules). */
  rowErrors: Record<string, BatchError[]>
  /** The same existing batch picked twice. */
  duplicateBatch: string[]
}

/** Check one line's batches. `otherNewBatchNos` are new batch numbers for the same
 *  product on OTHER lines of this delivery, so two lines can't create the same batch. */
export function checkDeliveryBatches(
  line: DeliveryBatchLine,
  otherNewBatchNos: readonly string[] = [],
): DeliveryBatchCheck {
  const rowErrors: Record<string, BatchError[]> = {}
  const claimed: string[] = [...otherNewBatchNos]
  const seenExisting = new Set<string>()
  const duplicateBatch: string[] = []
  for (const b of line.batches) {
    if (b.batchId) {
      if (seenExisting.has(b.batchId)) duplicateBatch.push(b.key)
      seenExisting.add(b.batchId)
      continue
    }
    const errors = validateNewBatch(line.sku, { batchNo: b.batchNo, attributes: b.attributes }, claimed)
    if (errors.length) rowErrors[b.key] = errors
    if (b.batchNo.trim()) claimed.push(b.batchNo)
  }
  const total = line.batches.reduce((s, b) => s + (b.qty > 0 ? b.qty : 0), 0)
  return {
    qtyMismatch: total !== line.qty,
    qtyInvalid: line.batches.filter((b) => !(b.qty > 0)).map((b) => b.key),
    rowErrors,
    duplicateBatch,
  }
}

export function deliveryBatchCheckOk(check: DeliveryBatchCheck): boolean {
  return !check.qtyMismatch && !check.qtyInvalid.length && !check.duplicateBatch.length && !Object.keys(check.rowErrors).length
}

export interface SavedDeliveryBatch { batchId: string; batchNo: string; qty: number }

/**
 * On delivery save: create the new batches (rule 1 values already on them) and give
 * existing vendor-less batches the delivery's vendor (rule 3). Existing batches with
 * another vendor are left as they are (rule 2). Run `checkDeliveryBatches` first.
 */
export function commitDeliveryBatches(
  line: DeliveryBatchLine,
  vendorId: string,
  by?: string,
): { ok: true; batches: SavedDeliveryBatch[] } | { ok: false; errors: Record<string, BatchError[]> } {
  const usesVendor = productUsesVendor(line.sku)
  const saved: SavedDeliveryBatch[] = []
  const errors: Record<string, BatchError[]> = {}
  for (const b of line.batches) {
    if (b.batchId) {
      const batch = getProductBatchById(line.sku, b.batchId)
      if (usesVendor && batch && !batch.attributes.supplier) {
        updateBatch(line.sku, b.batchId, { attributes: { supplier: vendorId } }, by)
      }
      saved.push({ batchId: b.batchId, batchNo: b.batchNo, qty: b.qty })
      continue
    }
    const attributes: BatchAttributeInput = { ...b.attributes }
    const created = createBatch(line.sku, { batchNo: b.batchNo, attributes }, by)
    if (created.ok) saved.push({ batchId: created.value.id, batchNo: created.value.batchNo, qty: b.qty })
    else errors[b.key] = created.errors
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, batches: saved }
}
