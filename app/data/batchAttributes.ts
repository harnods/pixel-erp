/**
 * Batch Attribute — the fixed attribute catalog, each product's attribute set, and
 * the date helpers the attribute values share. PRD: [PRD] INV - Batch Attribute
 * (stories 2, 5, 6), plan: docs/prd/batch-attribute-plan.md.
 *
 * Deliberately dependency-light (persist only) so grades.ts, batchStore.ts and
 * productDetails.ts can all build on it without an import cycle.
 */
import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { formatDate, formatDateLong } from '~/utils/date'

// ── Shared result shape ───────────────────────────────────────────────────────────
/** A validation failure. `field` names the form field it belongs to (inline error
 *  placement); `count` carries a number the copy needs (e.g. "used by N batches"). */
export interface DataError<C extends string, F extends string = string> {
  code: C
  field?: F
  count?: number
}
export type DataResult<T, E> = { ok: true; value: T } | { ok: false; errors: E[] }

// ── Catalog (story 2) ─────────────────────────────────────────────────────────────
/** Stable keys — what import and API reference, independent of label or language. */
export type BatchAttributeKey = 'expiry_date' | 'manufacturing_date' | 'best_before_date' | 'supplier' | 'grade'

export type BatchAttributeValueType = 'date-or-month' | 'date' | 'vendor' | 'grade'

export interface BatchAttributeDef {
  key: BatchAttributeKey
  /** English label (a `t()` key). `supplier` is labelled "Vendor" per
   *  rule/copy-vendor-not-supplier — the key stays `supplier` (plan D2). */
  label: string
  valueType: BatchAttributeValueType
}

export const BATCH_ATTRIBUTE_CATALOG: readonly BatchAttributeDef[] = [
  { key: 'expiry_date', label: 'Expiry date', valueType: 'date-or-month' },
  { key: 'manufacturing_date', label: 'Manufacturing date', valueType: 'date' },
  { key: 'best_before_date', label: 'Best before date', valueType: 'date' },
  { key: 'supplier', label: 'Vendor', valueType: 'vendor' },
  { key: 'grade', label: 'Grade', valueType: 'grade' },
]

export const BATCH_ATTRIBUTE_KEYS: readonly BatchAttributeKey[] = BATCH_ATTRIBUTE_CATALOG.map((a) => a.key)

export function isBatchAttributeKey(v: string): v is BatchAttributeKey {
  return (BATCH_ATTRIBUTE_KEYS as readonly string[]).includes(v)
}

export function batchAttributeDef(key: BatchAttributeKey): BatchAttributeDef {
  return BATCH_ATTRIBUTE_CATALOG.find((a) => a.key === key)!
}

/** One value per attribute. Dates are ISO (`YYYY-MM-DD`, or `YYYY-MM` for a
 *  month-precision expiry); `supplier` is a vendor id; `grade` is a grade id —
 *  never the grade name, which can be renamed (PM answer A1/A8). */
export type BatchAttributeValues = Partial<Record<BatchAttributeKey, string>>

/** Grade ids the seed Grade List is created with (A/B/C). Lives here, not in
 *  grades.ts, so the batch seed can reference them without importing grades.ts. */
export const SEED_GRADE_IDS = { A: 'grade-a', B: 'grade-b', C: 'grade-c' } as const

// ── Per-product attribute set (stories 5, 6) ────────────────────────────────────────
export const MIN_BATCH_ATTRIBUTES = 1
export const MAX_BATCH_ATTRIBUTES = 3

export interface BatchAttributeSetting {
  key: BatchAttributeKey
  required: boolean
}

/** What a batch-tracked product gets when it has no selection — at creation, and
 *  whenever an edit would leave it with none (PRD fallback, never an error). */
export const DEFAULT_BATCH_ATTRIBUTES: readonly BatchAttributeSetting[] = [{ key: 'expiry_date', required: false }]

export type BatchAttributeConfigError = DataError<'too-many' | 'duplicate' | 'unknown-key'>

interface ProductBatchAttributeConfig {
  sku: string
  attributes: BatchAttributeSetting[]
}

// A few batch-tracked catalog products start with richer sets so the demo isn't
// Expiry-only everywhere. Everything else falls back to DEFAULT_BATCH_ATTRIBUTES.
const SEED_CONFIGS: ProductBatchAttributeConfig[] = [
  // Green beans are bought from cooperatives and graded on arrival.
  { sku: '1001', attributes: [{ key: 'supplier', required: true }, { key: 'grade', required: false }, { key: 'expiry_date', required: false }] },
  { sku: '1002', attributes: [{ key: 'expiry_date', required: true }, { key: 'grade', required: false }] },
  // Roasted beans carry roast (manufacturing) and best-before dates.
  { sku: '1101', attributes: [{ key: 'expiry_date', required: true }, { key: 'manufacturing_date', required: false }, { key: 'best_before_date', required: false }] },
]

const CONFIG_KEY = 'batch-attr-config-v1'
const configs = reactive<ProductBatchAttributeConfig[]>(
  loadSnapshot<ProductBatchAttributeConfig>(CONFIG_KEY) ?? SEED_CONFIGS.map((c) => ({ sku: c.sku, attributes: c.attributes.map((a) => ({ ...a })) })),
)
function persistConfigs() { saveSnapshot(CONFIG_KEY, configs) }

/** The product's attribute set, in display order. Never empty. */
export function getBatchAttributeConfig(sku: string): BatchAttributeSetting[] {
  const found = configs.find((c) => c.sku === sku)
  const list = found?.attributes.length ? found.attributes : DEFAULT_BATCH_ATTRIBUTES
  return list.map((a) => ({ ...a }))
}

/** Check a proposed set without saving it. An empty set is valid — it resolves to
 *  the Expiry fallback rather than failing. */
export function validateBatchAttributeConfig(
  next: readonly { key: string; required?: boolean }[],
): DataResult<BatchAttributeSetting[], BatchAttributeConfigError> {
  const errors: BatchAttributeConfigError[] = []
  if (next.length > MAX_BATCH_ATTRIBUTES) errors.push({ code: 'too-many', count: MAX_BATCH_ATTRIBUTES })
  if (next.some((a) => !isBatchAttributeKey(a.key))) errors.push({ code: 'unknown-key' })
  if (new Set(next.map((a) => a.key)).size !== next.length) errors.push({ code: 'duplicate' })
  if (errors.length) return { ok: false, errors }
  const value = next.length
    ? next.map((a) => ({ key: a.key as BatchAttributeKey, required: a.required ?? false }))
    : DEFAULT_BATCH_ATTRIBUTES.map((a) => ({ ...a }))
  return { ok: true, value }
}

// ── Attribute-set activity (story 6a) ──────────────────────────────────────────────
/** Stand-in for the signed-in user until the prototype has a session. */
const CURRENT_USER = 'Rizal Candra'

/** One attempt to change a product's attribute set. Stored structured (not as display
 *  text) so the product's activity log can render it in the viewer's language. */
export interface BatchAttributeConfigActivity {
  sku: string
  date: string
  user: string
  outcome: 'success' | 'failed'
  previous: BatchAttributeSetting[]
  /** What was saved — or, for a failed attempt, what was proposed. */
  next: { key: string; required: boolean }[]
  errors: BatchAttributeConfigError['code'][]
}

const CONFIG_ACTIVITY_KEY = 'batch-attr-config-activity-v1'
const configActivity = reactive<BatchAttributeConfigActivity[]>(
  loadSnapshot<BatchAttributeConfigActivity>(CONFIG_ACTIVITY_KEY) ?? [],
)
function persistConfigActivity() { saveSnapshot(CONFIG_ACTIVITY_KEY, configActivity) }

/** One product's attribute-set changes, newest first — failed attempts included. */
export function batchAttributeConfigActivity(sku: string): BatchAttributeConfigActivity[] {
  return configActivity.filter((e) => e.sku === sku).reverse()
}

/** Same selection, same order, same required flags. */
export function sameBatchAttributeConfig(
  a: readonly BatchAttributeSetting[],
  b: readonly BatchAttributeSetting[],
): boolean {
  return a.length === b.length && a.every((x, i) => x.key === b[i]!.key && x.required === b[i]!.required)
}

/** Replace the product's attribute set (replace, not merge — same as the PRD's API
 *  semantics). Existing batches are NOT rewritten; they're reconciled one at a time
 *  when edited (story 7, see updateBatch in productDetails.ts).
 *
 *  Every real change and every failed attempt is recorded for the product's activity
 *  log. Saving the set unchanged is a no-op — no write, no entry — so a product form
 *  that always calls this on save doesn't flood the log. */
export function setBatchAttributeConfig(
  sku: string,
  next: readonly { key: string; required?: boolean }[],
  by = CURRENT_USER,
): DataResult<BatchAttributeSetting[], BatchAttributeConfigError> {
  const previous = getBatchAttributeConfig(sku)
  const result = validateBatchAttributeConfig(next)
  if (!result.ok) {
    configActivity.push({
      sku, date: new Date().toISOString(), user: by, outcome: 'failed', previous,
      next: next.map((a) => ({ key: a.key, required: a.required ?? false })),
      errors: result.errors.map((e) => e.code),
    })
    persistConfigActivity()
    return result
  }
  if (sameBatchAttributeConfig(previous, result.value)) return { ok: true, value: previous }

  const existing = configs.find((c) => c.sku === sku)
  if (existing) existing.attributes = result.value
  else configs.push({ sku, attributes: result.value })
  persistConfigs()
  configActivity.push({
    sku, date: new Date().toISOString(), user: by, outcome: 'success', previous,
    next: result.value.map((a) => ({ ...a })), errors: [],
  })
  persistConfigActivity()
  return { ok: true, value: result.value.map((a) => ({ ...a })) }
}

// ── Date values ─────────────────────────────────────────────────────────────────
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTH_RE = /^(\d{4})-(\d{2})$/

function isRealDay(y: number, m: number, d: number): boolean {
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

export type ExpiryPrecision = 'day' | 'month'

/** Precision is carried by the value itself (PM answer A2: chosen per batch). */
export function expiryPrecision(value: string | undefined | null): ExpiryPrecision | null {
  if (!value) return null
  const day = DAY_RE.exec(value)
  if (day) return isRealDay(+day[1]!, +day[2]!, +day[3]!) ? 'day' : null
  const month = MONTH_RE.exec(value)
  if (month) return +month[2]! >= 1 && +month[2]! <= 12 ? 'month' : null
  return null
}

/** Whether `value` is acceptable for a date attribute. Only Expiry accepts a month. */
export function isValidAttributeDate(key: BatchAttributeKey, value: string): boolean {
  const precision = expiryPrecision(value)
  return key === 'expiry_date' ? precision !== null : precision === 'day'
}

/** The day an expiry takes effect — a month value counts as its LAST day, so a
 *  "02/2027" batch is still good through 28 Feb 2027. '' when empty/invalid. */
export function expiryEffectiveDate(value: string | undefined | null): string {
  const precision = expiryPrecision(value)
  if (precision === 'day') return value!
  if (precision === 'month') {
    const [y, m] = value!.split('-').map(Number) as [number, number]
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  }
  return ''
}

/** Render an expiry at its own precision. `table` → `DD/MM/YYYY` / `MM/YYYY`;
 *  `long` → `DD Mon YYYY` / `Mon YYYY` (docs/patterns/date-format.md). */
export function formatExpiry(value: string | undefined | null, style: 'table' | 'long' = 'table'): string {
  const precision = expiryPrecision(value)
  if (precision === 'day') return style === 'table' ? formatDate(value) : formatDateLong(value)
  if (precision === 'month') {
    const [y, m] = value!.split('-') as [string, string]
    if (style === 'table') return `${m}/${y}`
    return new Date(Date.UTC(+y, +m - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  }
  return '—'
}
