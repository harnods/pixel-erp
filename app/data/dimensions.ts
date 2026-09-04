/**
 * Dimensions — custom classification tags (Branch, SBU, Project, Channel, ...)
 * that can be applied to transaction lines without adding new accounts. Settings
 * > Dimensions (see DimensionsIndexPage.vue / DimensionsPaywallPage.vue). This is
 * the mock DB for that feature — starts empty (a freshly-activated tenant has no
 * dimensions yet); everything is created via DimensionFormDrawer.vue.
 */
import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { bills } from './bills'
import { stockAdjustments } from './stockAdjustments'

/** The transaction modules a dimension can be tagged against. */
export type DimensionTransactionType = 'sales' | 'purchases' | 'expenses' | 'stock-adjustment'

export const DIMENSION_TRANSACTION_TYPE_OPTIONS: { value: DimensionTransactionType; label: string }[] = [
  { value: 'sales',            label: 'Sales' },
  { value: 'purchases',        label: 'Purchases' },
  { value: 'expenses',         label: 'Expenses' },
  { value: 'stock-adjustment', label: 'Stock adjustment' },
]

export function transactionTypeLabel(type: DimensionTransactionType): string {
  return DIMENSION_TRANSACTION_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type
}

/** A single value within a dimension (e.g. "Jakarta" under the Branch dimension),
 *  with which users can tag transaction lines with it. Empty userIds = "Open to
 *  all" (unrestricted); a non-empty list restricts it to those users. */
export interface DimensionValue {
  name: string
  userIds: string[]
}

export interface Dimension {
  id: string
  name: string
  values: DimensionValue[]
  /** 'all' = applies to every transaction module; otherwise the specific modules it applies to.
   *  Only legacy rows can be 'all' — the create/edit form (DimensionFormDrawer) has no
   *  "all transactions" option, so new/edited dimensions always store an explicit array. */
  transactionTypes: DimensionTransactionType[] | 'all'
  /** "Mandatory to fill" — when true, all new transactions require this dimension. */
  mandatory: boolean
  status: 'active' | 'archived'
  updatedAt: string
  updatedBy: string
}

/** Shape submitted by DimensionFormDrawer's create/edit form. */
export interface DimensionInput {
  name: string
  transactionTypes: DimensionTransactionType[]
  values: DimensionValue[]
  mandatory: boolean
}

/** Plan cap on the number of dimensions a tenant can have (active + archived both count
 *  toward it — archiving a dimension keeps its history but doesn't free the slot; deleting
 *  one does). */
export const DIMENSIONS_QUOTA = 5

const ACTING_USER = 'Rizal Candra'

const DIMENSIONS_KEY = 'dimensions-v1'
const snapshot = loadSnapshot<Dimension>(DIMENSIONS_KEY)
export const dimensions = reactive<Dimension[]>(snapshot ?? [])

function persist(): void {
  saveSnapshot(DIMENSIONS_KEY, dimensions)
}

export function getDimensionById(id: string): Dimension | undefined {
  return dimensions.find((d) => d.id === id)
}

/** Active dimensions scoped to a given transaction module — drives the
 *  line-level "Dimensions" column (ErpLineDimensionsCell) and its column-gate
 *  on both create pages (interactive) and detail pages (read-only). */
export function applicableDimensions(type: DimensionTransactionType): Dimension[] {
  return dimensions.filter((d) => d.status === 'active' && (d.transactionTypes === 'all' || d.transactionTypes.includes(type)))
}

/** Active dimensions that actually have values to report on — the set the
 *  Financials reports slice by (Multidimensional columns, General Ledger tags,
 *  Budget Variance comparison). A dimension with no values can be tagged
 *  against nothing, so it would only produce an empty column. */
export function reportableDimensions(): Dimension[] {
  return dimensions.filter((d) => d.status === 'active' && d.values.length > 0)
}

/** As `reportableDimensions`, narrowed to one transaction module — used by the
 *  General Ledger so a posting only carries tags from dimensions that were
 *  switched on for its transaction type in Settings > Dimensions. */
export function reportableDimensionsFor(type: DimensionTransactionType): Dimension[] {
  return reportableDimensions().filter((d) => d.transactionTypes === 'all' || d.transactionTypes.includes(type))
}

/** Whether any recorded transaction line has this dimension tagged with a value —
 *  gates the "Delete" action in DimensionDetailDrawer (deleting would silently
 *  orphan those tags). Only Expenses (bills.ts) and Stock adjustments actually
 *  persist their line-level `dimensions` record end to end in this prototype —
 *  Sales/Purchases/Spend money line tagging isn't wired to a persisted store yet,
 *  so there's nothing real to check there. */
export function isDimensionInUse(dimensionId: string): boolean {
  const tagged = (rec?: Record<string, string>) => !!rec?.[dimensionId]
  if (bills.some((b) => b.lineItems?.some((li) => tagged(li.dimensions)))) return true
  if (stockAdjustments.some((a) => a.lines?.some((l) => tagged(l.dimensions)))) return true
  return false
}

let seq = dimensions.filter((d) => d.id.startsWith('dim-new-')).length

/** Create a dimension from DimensionFormDrawer (create mode) — persists + shows in the list. */
export function addDimension(input: DimensionInput): Dimension {
  const n = seq++
  const dim: Dimension = {
    id: `dim-new-${n}`,
    name: input.name,
    values: input.values,
    transactionTypes: input.transactionTypes,
    mandatory: input.mandatory,
    status: 'active',
    updatedAt: new Date().toISOString(),
    updatedBy: ACTING_USER,
  }
  dimensions.unshift(dim)
  persist()
  return dim
}

/** Update an existing dimension from DimensionFormDrawer (edit mode) — persists the change. */
export function updateDimension(id: string, input: DimensionInput): Dimension | undefined {
  const dim = dimensions.find((d) => d.id === id)
  if (!dim) return undefined
  dim.name = input.name
  dim.values = input.values
  dim.transactionTypes = input.transactionTypes
  dim.mandatory = input.mandatory
  dim.updatedAt = new Date().toISOString()
  dim.updatedBy = ACTING_USER
  persist()
  return dim
}

/** Append one value to an existing dimension (inline "Add as a new dimension
 *  value" quick-create from ErpLineDimensionsCell) — persists. Skips if a
 *  value with that name already exists. */
export function addDimensionValue(dimensionId: string, valueName: string): DimensionValue | undefined {
  const dim = dimensions.find((d) => d.id === dimensionId)
  if (!dim) return undefined
  const existing = dim.values.find((v) => v.name.toLowerCase() === valueName.toLowerCase())
  if (existing) return existing
  const value: DimensionValue = { name: valueName, userIds: [] }
  dim.values.push(value)
  dim.updatedAt = new Date().toISOString()
  dim.updatedBy = ACTING_USER
  persist()
  return value
}

export function setDimensionStatus(id: string, status: Dimension['status']): void {
  const dim = dimensions.find((d) => d.id === id)
  if (!dim) return
  dim.status = status
  dim.updatedAt = new Date().toISOString()
  dim.updatedBy = ACTING_USER
  persist()
}

export function deleteDimension(id: string): void {
  const idx = dimensions.findIndex((d) => d.id === id)
  if (idx === -1) return
  dimensions.splice(idx, 1)
  persist()
}

/** Move one value off `fromId` onto `toId` (DimensionDetailDrawer's per-value
 *  "Transfer to another dimension") — distinct from DimensionFormDrawer's
 *  same-dimension merge Transfer. If the target already has a same-named
 *  value, the source one is just dropped rather than duplicated. */
export function transferDimensionValue(fromId: string, valueName: string, toId: string): void {
  const from = dimensions.find((d) => d.id === fromId)
  const to = dimensions.find((d) => d.id === toId)
  if (!from || !to || from.id === to.id) return
  const idx = from.values.findIndex((v) => v.name === valueName)
  if (idx === -1) return
  const value = from.values.splice(idx, 1)[0]!
  if (!to.values.some((v) => v.name === value.name)) to.values.push(value)
  const now = new Date().toISOString()
  from.updatedAt = now; from.updatedBy = ACTING_USER
  to.updatedAt = now; to.updatedBy = ACTING_USER
  persist()
}
