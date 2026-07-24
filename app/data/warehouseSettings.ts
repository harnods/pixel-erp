/**
 * Global (CID-level) warehouse settings — apply to every warehouse, unlike the
 * per-warehouse flags in warehouseConfig.ts. Edited via SettingsWarehousePage.vue
 * (/settings/warehouse), but readable from anywhere (e.g. the picking-task
 * auto-select engine in warehouseDetails.ts) since they're a shared data module,
 * not component-local state.
 */

const STORAGE_KEY = 'erp-db:warehouse-settings'

// Rules WMS follows to auto-select a batch/serial at outbound task creation, ONLY
// when the source doesn't already supply one. Not a toggle — auto-selection always
// runs on an omitted detail; these choose which rule it uses.
export type BatchSelectionRule = 'fefo' | 'batch_number_asc' | 'batch_number_desc' | 'batch_created_asc'
export type SerialSelectionRule = 'serial_number_asc' | 'serial_number_desc' | 'serial_created_asc'

export const BATCH_RULE_OPTIONS: { id: BatchSelectionRule; name: string }[] = [
  { id: 'fefo', name: 'FEFO (earliest expiry first)' },
  { id: 'batch_number_asc', name: 'Batch number/name (ascending)' },
  { id: 'batch_number_desc', name: 'Batch number/name (descending)' },
  { id: 'batch_created_asc', name: 'Batch created date (earliest first)' },
]
export const SERIAL_RULE_OPTIONS: { id: SerialSelectionRule; name: string }[] = [
  { id: 'serial_number_asc', name: 'Serial number/name (ascending)' },
  { id: 'serial_number_desc', name: 'Serial number/name (descending)' },
  { id: 'serial_created_asc', name: 'Serial created date (earliest first)' },
]

// Which symbology "Print barcode" (SKU/batch/serial/bin labels) renders — a
// display choice, not a data change, so switching it never touches barcode
// values already assigned.
export type BarcodeStyle = 'barcode' | 'qrcode'
export const BARCODE_STYLE_OPTIONS: { id: BarcodeStyle; name: string }[] = [
  { id: 'barcode', name: 'Barcode (Code 128)' },
  { id: 'qrcode', name: 'QR code' },
]

export interface WarehouseSettings {
  multiLocationStorage: boolean
  batchSelectionRule:   BatchSelectionRule
  serialSelectionRule:  SerialSelectionRule
  barcodeStyle:         BarcodeStyle
}

const DEFAULTS: WarehouseSettings = {
  multiLocationStorage: true,
  batchSelectionRule:   'fefo',
  serialSelectionRule:  'serial_created_asc',
  barcodeStyle:         'barcode',
}

export function getWarehouseSettings(): WarehouseSettings {
  if (!import.meta.client) return { ...DEFAULTS }
  try {
    const raw    = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return {
      multiLocationStorage: parsed.multiLocationStorage ?? DEFAULTS.multiLocationStorage,
      batchSelectionRule:   parsed.batchSelectionRule   ?? DEFAULTS.batchSelectionRule,
      serialSelectionRule:  parsed.serialSelectionRule  ?? DEFAULTS.serialSelectionRule,
      barcodeStyle:         parsed.barcodeStyle         ?? DEFAULTS.barcodeStyle,
    }
  } catch { return { ...DEFAULTS } }
}

export function saveWarehouseSettings(v: WarehouseSettings): void {
  if (!import.meta.client) return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)) } catch { /* non-fatal for a prototype */ }
}
