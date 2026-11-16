/**
 * Receiving vs issuing batch attribute rules for the batch drawers
 * (ATINV-9082, spec §5.1; docs/superpowers/specs/2026-10-27-batch-attribute-drawers-export-design.md).
 *
 * A batch is identified by product + batch number, not by warehouse: a typed number that
 * matches a product batch record anywhere is the EXISTING batch, never a duplicate.
 * Receiving drawers require a product's required attributes (on the existing batch or
 * filled in the row); issuing drawers never block on attributes. The Unassigned batch is
 * exempt from all of it. Pure data — the drawer renders the result.
 */
import { getBatchAttributeConfig, type BatchAttributeKey, type BatchAttributeValues } from './batchAttributes'
import { findProductBatch, UNASSIGNED_BATCH_NO, validateNewBatch, type ProductBatchSummary } from './productDetails'

export type DrawerMode = 'receiving' | 'issuing'

export type DrawerKind = 'count' | 'in-out' | 'transfer' | 'receiving' | 'put-away' | 'picking' | 'purchase-delivery'

export function drawerModeFor(kind: DrawerKind): DrawerMode | null {
  switch (kind) {
    case 'in-out':
    case 'receiving':
    case 'purchase-delivery':
      return 'receiving'
    case 'transfer':
    case 'put-away':
    case 'picking':
      return 'issuing'
    default:
      return null
  }
}

export interface DrawerBatchInput { batchNo: string; attributes: BatchAttributeValues }

export interface DrawerBatchCheck {
  rows: { batchNo: string; existing: ProductBatchSummary | undefined; isUnassigned: boolean }[]
  errors: { index: number; code: 'required' | 'duplicate-new' | 'batch-no'; key?: BatchAttributeKey }[]
}

const norm = (s: string) => s.trim().toLowerCase()

export function checkDrawerBatches(
  sku: string,
  mode: DrawerMode,
  input: readonly DrawerBatchInput[],
): DrawerBatchCheck {
  const required = getBatchAttributeConfig(sku).filter((a) => a.required).map((a) => a.key)
  const rows: DrawerBatchCheck['rows'] = input.map((r) => ({
    batchNo: r.batchNo,
    existing: findProductBatch(sku, r.batchNo),
    // findProductBatch excludes Unassigned, so detect it explicitly.
    isUnassigned: norm(r.batchNo) === norm(UNASSIGNED_BATCH_NO),
  }))
  const errors: DrawerBatchCheck['errors'] = []

  const newCounts = new Map<string, number>()
  rows.forEach((r) => {
    if (r.existing || r.isUnassigned || !norm(r.batchNo)) return
    newCounts.set(norm(r.batchNo), (newCounts.get(norm(r.batchNo)) ?? 0) + 1)
  })

  input.forEach((r, index) => {
    const row = rows[index]!
    if (row.isUnassigned) return
    if (!row.existing) {
      // Only the batch-number errors; required attributes are reported below.
      if (validateNewBatch(sku, { batchNo: r.batchNo, attributes: r.attributes }).some((e) => e.field === 'batchNo')) {
        errors.push({ index, code: 'batch-no' })
      } else if ((newCounts.get(norm(r.batchNo)) ?? 0) > 1) {
        errors.push({ index, code: 'duplicate-new' })
      }
    }
    if (mode === 'receiving') {
      for (const key of required) {
        if (!row.existing?.attributes[key] && !r.attributes[key]) errors.push({ index, code: 'required', key })
      }
    }
  })
  return { rows, errors }
}

/** PRD story 10 copy for the vendor-mismatch confirm, "Supplier" → "Vendor" (D2). Fill
 *  `{batchVendor}` and `{deliveryVendor}` after translating. */
export const VENDOR_MISMATCH_COPY =
  'This batch is recorded with vendor {batchVendor}, while this transaction is from {deliveryVendor}. The vendor of the batch will not be changed.'

/** Existing batches among `input` whose recorded vendor is set and isn't `vendorId`. */
export function vendorMismatches(
  sku: string,
  vendorId: string,
  input: readonly DrawerBatchInput[],
): { batchNo: string; batchVendorId: string }[] {
  const out: { batchNo: string; batchVendorId: string }[] = []
  for (const r of input) {
    const supplier = findProductBatch(sku, r.batchNo)?.attributes.supplier
    if (supplier && supplier !== vendorId) out.push({ batchNo: r.batchNo, batchVendorId: supplier })
  }
  return out
}
