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
    if (item.batches?.some(b => b.batchNo === v)) return { kind: 'batch', sku: item.sku, batchNo: v }
    const su = item.serials
    if (su && (su.available.some(u => u.serial === v) || su.reserved.some(u => u.serial === v))) {
      return { kind: 'serial', sku: item.sku, serial: v }
    }
  }
  const bySku = wh.stock.find(item => item.sku === v)
  if (bySku) return { kind: 'sku', sku: bySku.sku }
  return null
}

/** A scan was rejected (not found, wrong SKU, already fully picked, ...) — a single
 *  place for the toast + error beep so every scan flow gives the same feedback. */
export function notifyScanError(title: string, description?: string): void {
  playScanErrorSound()
  toast.notify({ variant: 'error', title, description, maxWidth: 'max-content' })
}
