import { toast } from '@mekari/pixel3'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { playScanErrorSound } from '~/utils/sound'

export type ScanKind = 'batch' | 'serial' | 'sku'

export interface ScanResolution {
  kind: ScanKind
  sku: string
  /** Set only when kind === 'batch'. */
  batchNo?: string
  /** Set only when kind === 'serial'. */
  serial?: string
}

/** A physical barcode doesn't carry case — a scanner (or an operator typing
 *  the code manually) must match a stored SKU/batch/serial/bin code
 *  regardless of letter case or incidental leading/trailing whitespace. Every
 *  scan-comparison site across the app should compare through this instead of
 *  a raw `===`/`.includes()`. */
export function normalizeCode(s: string): string {
  return s.trim().toLowerCase()
}
export function sameCode(a: string, b: string): boolean {
  return normalizeCode(a) === normalizeCode(b)
}
/** Case/whitespace-insensitive version of `array.includes(value)`. */
export function includesCode(codes: readonly string[], value: string): boolean {
  return codes.some(c => sameCode(c, value))
}

/**
 * Resolve a raw scanned code — Batch No., Serial Number, or SKU — against a
 * warehouse's real stock, independent of whatever a page/drawer already has
 * loaded into its own local state. This is the single source of truth for
 * "what does this scan mean and which SKU does it belong to", so every scan
 * flow across the app (picking, receiving, put-away, ...) resolves a scan the
 * same way instead of only recognizing codes it already happens to know about.
 */
export function resolveScan(warehouseId: string, rawValue: string): ScanResolution | null {
  const v = rawValue.trim()
  if (!v) return null
  const wh = getWarehouseDetail(warehouseId)
  if (!wh) return null

  for (const item of wh.stock) {
    const batch = item.batches?.find(b => sameCode(b.batchNo, v))
    // Return the canonical stored casing, not the raw scan — so a caller that
    // does its own downstream `===`/`.includes()` against stored data (not
    // every one has been converted to sameCode()) still matches correctly.
    if (batch) return { kind: 'batch', sku: item.sku, batchNo: batch.batchNo }
    const su = item.serials
    const serialUnit = su && (su.available.find(u => sameCode(u.serial, v)) ?? su.reserved.find(u => sameCode(u.serial, v)))
    if (serialUnit) return { kind: 'serial', sku: item.sku, serial: serialUnit.serial }
  }
  const bySku = wh.stock.find(item => sameCode(item.sku, v))
  if (bySku) return { kind: 'sku', sku: bySku.sku }
  return null
}

/** A scan was rejected (not found, wrong SKU, already fully picked, ...) — a single
 *  place for the toast + error beep so every scan flow gives the same feedback. */
export function notifyScanError(title: string, description?: string): void {
  playScanErrorSound()
  toast.notify({ variant: 'error', title, description, maxWidth: 'max-content' })
}
