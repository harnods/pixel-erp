import { reactive } from 'vue'

/**
 * Settings › Custom fields (jurnal-frontend-app `settings/pages/custom-fields`).
 *
 * A custom field belongs to one page (feature) and, for Sales / Purchases, to
 * one or more sub pages. Status is derived from two timestamps plus who last
 * touched it: deleted → Deleted, inactive by the system (quota downgrade) →
 * Inactive by system, inactive → Inactive, otherwise Active. Active fields
 * consume quota.
 */

export type CustomFieldType = 'Text' | 'Number' | 'Date' | 'Dropdown'
export type CustomFieldFeature = 'Sales' | 'Purchases' | 'Products' | 'Contacts'
export type CustomFieldStatus = 'active' | 'inactive' | 'inactive-system' | 'deleted'

export const CUSTOM_FIELD_TYPES: { value: CustomFieldType; description: string }[] = [
  { value: 'Text', description: 'Letters, numbers, and symbols' },
  { value: 'Number', description: 'Numbers with optional prefix or suffix' },
  { value: 'Date', description: 'A calendar date' },
  { value: 'Dropdown', description: 'Pick from a list of options' },
]

export const CUSTOM_FIELD_FEATURES: CustomFieldFeature[] = ['Sales', 'Purchases', 'Products', 'Contacts']

/** Sub pages a Sales / Purchases field can apply to. */
export const CUSTOM_FIELD_SUB_FEATURES: Record<'Sales' | 'Purchases', string[]> = {
  Sales: ['Sales Quotation', 'Sales Order', 'Sales Delivery', 'Sales Invoice', 'Sales Return', 'Proforma Order', 'Proforma Invoice', 'Down Payment Receipt'],
  Purchases: ['Purchase Request', 'Purchase Quotation', 'Purchase Order', 'Purchase Delivery', 'Purchase Invoice', 'Purchase Return'],
}

export interface CustomFieldLog {
  at: string
  user: string
  description: string
}

export interface CustomField {
  id: string
  name: string
  type: CustomFieldType
  feature: CustomFieldFeature
  subFeatures: string[]
  status: CustomFieldStatus
  required: boolean
  /** Text: max characters (null = unlimited). */
  maxChar: number | null
  /** Number: allow decimals; optional prefix/suffix. */
  useDecimal: boolean
  prefix: string
  suffix: string
  /** Date: auto-select today. */
  defaultToday: boolean
  /** Dropdown options (first = main option when `hasMainOption`). */
  options: string[]
  multiSelect: boolean
  /** Order inside its page (Reorder custom fields). */
  position: number
  updatedAt: string
  /** '' = changed by the system. */
  updatedBy: string
  logs: CustomFieldLog[]
}

export const CUSTOM_FIELD_QUOTA = 10

function field(id: string, name: string, type: CustomFieldType, feature: CustomFieldFeature, subFeatures: string[], status: CustomFieldStatus, position: number, updatedAt: string, updatedBy: string, extra: Partial<CustomField> = {}): CustomField {
  return {
    id, name, type, feature, subFeatures, status, position, updatedAt, updatedBy,
    required: false, maxChar: null, useDecimal: false, prefix: '', suffix: '', defaultToday: false,
    options: [], multiSelect: false,
    logs: [{ at: updatedAt, user: updatedBy || 'System', description: `Added a custom field: ${name}` }],
    ...extra,
  }
}

export const customFields = reactive<CustomField[]>([
  field('CF001', 'Sales channel', 'Dropdown', 'Sales', ['Sales Order', 'Sales Delivery', 'Sales Invoice', 'Sales Quotation', 'Sales Return'], 'active', 1, '2026-08-20T10:12:00+07:00', 'Rizal Candra', { options: ['Outlet', 'Online store', 'Reseller'], required: true }),
  field('CF002', 'PO reference', 'Text', 'Sales', ['Sales Invoice'], 'active', 2, '2026-08-18T14:40:00+07:00', 'Rizal Candra', { maxChar: 25 }),
  field('CF003', 'Delivery slot', 'Date', 'Purchases', ['Purchase Order', 'Purchase Delivery'], 'active', 1, '2026-08-14T09:05:00+07:00', 'Dewi Lestari', { defaultToday: true }),
  field('CF004', 'Roast level', 'Dropdown', 'Products', [], 'active', 1, '2026-08-10T16:20:00+07:00', 'Dewi Lestari', { options: ['Light', 'Medium', 'Dark'] }),
  field('CF005', 'Bean weight', 'Number', 'Products', [], 'active', 2, '2026-08-05T11:00:00+07:00', 'Rizal Candra', { useDecimal: true, suffix: 'kg' }),
  field('CF006', 'Account manager', 'Text', 'Contacts', [], 'inactive', 1, '2026-07-28T08:30:00+07:00', 'Rizal Candra'),
  // Worst case: longest name the 25-char input allows, deactivated by the system after a quota downgrade.
  field('CF007', 'Nomor kontrak distributor', 'Text', 'Contacts', [], 'inactive-system', 2, '2026-08-01T00:00:00+07:00', ''),
  field('CF008', 'Warranty period', 'Number', 'Sales', ['Sales Invoice', 'Sales Delivery'], 'deleted', 3, '2026-07-15T13:45:00+07:00', 'Dewi Lestari', { suffix: 'months' }),
])

export function getCustomField(id: string): CustomField | undefined {
  return customFields.find((f) => f.id === id)
}

/** Active fields consume quota. */
export function usedCustomFieldQuota(): number {
  return customFields.filter((f) => f.status === 'active').length
}

export function isCustomFieldNameUsed(name: string, exceptId?: string): boolean {
  const n = name.trim().toLowerCase()
  return customFields.some((f) => f.id !== exceptId && f.status !== 'deleted' && f.name.toLowerCase() === n)
}

let seq = customFields.length
export function nextCustomFieldId(): string {
  seq += 1
  return `CF${String(seq).padStart(3, '0')}`
}
