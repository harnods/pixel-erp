/**
 * Settings → Inventory (prod: /v3/company/setting/goods_and_services).
 * Product settings (costing method + product feature toggles) and batch expiry
 * reminder emails. Persisted to localStorage so a saved change survives reload.
 */

const STORAGE_KEY = 'erp-db:inventory-settings'

export type CostMethod = 'avg' | 'fifo'
export const COST_METHOD_OPTIONS: { id: CostMethod; name: string }[] = [
  { id: 'avg', name: 'Average cost' },
  { id: 'fifo', name: 'FIFO' },
]

export type ProductFeatureCode = 'stock' | 'barcode' | 'variant' | 'sn' | 'batch'

export interface ProductFeature {
  code: ProductFeatureCode
  label: string
  description: string
  value: boolean
  /** Turning it off is blocked while records use it — the reason shows in a tooltip. */
  inUse: boolean
  lockedReason?: string
}

export interface BatchReminderRule {
  id: string
  name: string
  /** Days relative to the expiry date. */
  threshold: number
  beforeExpiry: boolean
  subject: string
  body: string
}

export interface InventorySettings {
  /** Costing method can only be chosen while no inventory transaction exists. */
  costMethod: CostMethod
  isCostMethodEditable: boolean
  features: ProductFeature[]
  emailConfirmed: boolean
  batchReminderActive: boolean
  reminders: BatchReminderRule[]
}

export const REMINDER_NAME_MAX_LENGTH = 50

export const REMINDER_PLACEHOLDERS: { label: string; value: string }[] = [
  { label: 'Warehouse PIC', value: '{Warehouse PIC}' },
  { label: 'Warehouse name', value: '{Warehouse name}' },
  { label: 'X days', value: '{X days}' },
  { label: 'Expiration date', value: '{Expiration date}' },
  { label: 'Product name', value: '{Product name}' },
  { label: 'Batch number', value: '{Batch number}' },
]

const DEFAULTS: InventorySettings = {
  costMethod: 'avg',
  isCostMethodEditable: false,
  features: [
    { code: 'stock', label: 'Stock info on sales & purchases', description: 'Show available quantity (Qty on Hand) while creating sales and purchase forms.', value: true, inUse: false },
    { code: 'barcode', label: 'Barcode scanning', description: 'Enable scanning to quickly add items to transactions using physical barcodes.', value: true, inUse: false },
    { code: 'variant', label: 'Product variant', description: 'Enable products with multiple attributes (e.g. Size, Color, Material).', value: true, inUse: true, lockedReason: 'You cannot deactivate product variant because there is a variant in use. To deactivate this feature, you need to archive the variant first.' },
    { code: 'sn', label: 'Serial number tracking', description: 'Track individual items using unique ID.', value: false, inUse: false, lockedReason: 'You cannot deactivate serial number tracking because there is a serial number in use.' },
    { code: 'batch', label: 'Batch tracking', description: 'Track inventory groups by expiration dates or lot numbers.', value: true, inUse: true, lockedReason: 'You cannot deactivate batch tracking because there is a batch in use. To deactivate this feature, you need to archive the batch first.' },
  ],
  emailConfirmed: true,
  batchReminderActive: true,
  reminders: [
    {
      id: 'rem-1', name: 'Reminder 30 days', threshold: 30, beforeExpiry: true,
      subject: "There's an upcoming expired batch in {X days}",
      body: 'To {Warehouse PIC},\n\nYour batch in {Warehouse name} will expire in {X days}, precisely on {Expiration date}.\n\nPlease adjust the stock or launch a sales promotion for products with batch expiring soon.\n\nThank you.',
    },
    {
      id: 'rem-2', name: 'Reminder 7 days', threshold: 7, beforeExpiry: true,
      subject: 'Batch {Batch number} expires in {X days}',
      body: 'To {Warehouse PIC},\n\n{Product name} batch {Batch number} in {Warehouse name} expires on {Expiration date}.\n\nThank you.',
    },
    {
      id: 'rem-3', name: 'Expired batch follow-up', threshold: 1, beforeExpiry: false,
      subject: 'Batch {Batch number} has expired',
      body: 'To {Warehouse PIC},\n\n{Product name} batch {Batch number} in {Warehouse name} expired on {Expiration date}. Please write off or return the stock.\n\nThank you.',
    },
  ],
}

function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)) as T }

export function getInventorySettings(): InventorySettings {
  if (!import.meta.client) return clone(DEFAULTS)
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...clone(DEFAULTS), ...(JSON.parse(raw) as Partial<InventorySettings>) } : clone(DEFAULTS)
  } catch {
    return clone(DEFAULTS)
  }
}

export function saveInventorySettings(v: InventorySettings): void {
  if (!import.meta.client) return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)) } catch { /* non-fatal */ }
}
