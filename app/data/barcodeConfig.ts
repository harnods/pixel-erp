/**
 * Barcode auto-increment configuration — the "Customize format" settings reachable
 * from the Barcode field's settings icon, wherever one is generated: a product's
 * SKU (New product form), a batch, a serial number, or a storage bin. Each KIND
 * has its OWN independent format + counter (a batch number scheme has nothing to
 * do with a serial number scheme) — see `BarcodeKind`.
 *
 * Configurable per AC#2: prefix, zero-padding, start number, separator. Changing
 * it is FORWARD-ONLY: it only affects barcodes generated for records created from
 * here on — it never rewrites a record's already-assigned barcode (seed products
 * keep their own deterministic fallback in productsIndex.ts, untouched by this).
 */
import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'

/** Real standards have a FIXED digit length; 'Custom' is the only one where
 *  Zero-padding is freely editable — editing Prefix/Separator/Zero-padding away
 *  from a real standard's exact shape no longer produces a valid EAN/UPC number,
 *  so the form auto-switches to 'Custom' the moment any of those are touched. */
export type BarcodeFormat = 'EAN-13' | 'UPC-A' | 'EAN-8' | 'Custom'

/** What kind of record this barcode identifies — each has its own config/counter. */
export type BarcodeKind = 'sku' | 'batch' | 'serial' | 'bin'

export interface BarcodeFormatConfig {
  format: BarcodeFormat
  prefix: string
  padding: number
  startNumber: number
  separator: string
  /** how many barcodes have been generated so far — advances the start number */
  counter: number
}

const DEFAULT_CONFIGS: Record<BarcodeKind, BarcodeFormatConfig> = {
  sku: {
    format: 'EAN-13', prefix: '', padding: 13, startNumber: 6_396_754_745_415, separator: '', counter: 0,
  },
  batch: {
    format: 'Custom', prefix: 'BATCH', padding: 6, startNumber: 1, separator: '-', counter: 0,
  },
  serial: {
    format: 'Custom', prefix: 'SN', padding: 6, startNumber: 1, separator: '-', counter: 0,
  },
  bin: {
    format: 'Custom', prefix: 'BIN', padding: 6, startNumber: 1, separator: '-', counter: 0,
  },
}

const configs = {} as Record<BarcodeKind, BarcodeFormatConfig>
for (const kind of Object.keys(DEFAULT_CONFIGS) as BarcodeKind[]) {
  const snapshot = loadSnapshot<BarcodeFormatConfig>(`barcode-format-config-${kind}`)
  configs[kind] = reactive({ ...(snapshot?.[0] ?? DEFAULT_CONFIGS[kind]) })
}

/** The live, reactive config for one kind — read directly in templates/computeds. */
export function getBarcodeConfig(kind: BarcodeKind): BarcodeFormatConfig {
  return configs[kind]
}

function persist(kind: BarcodeKind): void {
  saveSnapshot(`barcode-format-config-${kind}`, [{ ...configs[kind] }])
}

/** Update the format settings from the Customize format modal (counter is untouched). */
export function setBarcodeFormat(kind: BarcodeKind, next: Omit<BarcodeFormatConfig, 'counter'>): void {
  const config = configs[kind]
  config.format = next.format
  config.prefix = next.prefix
  config.padding = next.padding
  config.startNumber = next.startNumber
  config.separator = next.separator
  persist(kind)
}

/**
 * Renders a number to EXACTLY `padding` digits (truncating from the left if the raw
 * value is longer, padding with zeros if shorter) — so the digit count genuinely
 * reflects the chosen standard/padding, and changing either always visibly changes
 * the result. Exported so the Customize format form can preview draft values with
 * the identical logic used when a barcode is actually generated.
 */
export function formatBarcodeValue(value: number, opts: { prefix: string; padding: number; separator: string }): string {
  const padding = Math.max(1, opts.padding)
  const truncated = value % 10 ** padding
  const digits = String(truncated).padStart(padding, '0')
  return opts.separator ? `${opts.prefix}${opts.separator}${digits}` : `${opts.prefix}${digits}`
}

function formatNumber(kind: BarcodeKind, n: number): string {
  return formatBarcodeValue(n, configs[kind])
}

/** Read-only preview shown in the Barcode settings popover — does not consume the counter. */
export function previewNextBarcode(kind: BarcodeKind): string {
  const config = configs[kind]
  return formatNumber(kind, config.startNumber + config.counter)
}

/** Consumes + persists the next barcode number. Call once, when a record is actually created. */
export function generateNextBarcode(kind: BarcodeKind): string {
  const config = configs[kind]
  const value = formatNumber(kind, config.startNumber + config.counter)
  config.counter += 1
  persist(kind)
  return value
}
