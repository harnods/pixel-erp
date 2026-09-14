/**
 * Update Batch import — validate a spreadsheet of batch edits and apply the valid rows
 * (Batch Attribute PRD story 9; plan Phase 4, docs/prd/batch-attribute-plan.md).
 *
 * Pure data: the import page reads the file (xlsx) into rows of cell text, and this
 * module decides row by row what's wrong. Only valid rows are imported; every invalid
 * row comes back with its reasons so the user can fix the file and try again.
 *
 * Cell rules (PRD): a blank cell leaves the value as it is, the word "null" clears it,
 * anything else sets it. Batches are matched by product name + batch number, so the
 * import can't rename a batch. Grades match by name (PM answer A1), vendors by name.
 */
import { productIndexRows } from './productsIndex'
import { vendors } from './vendors'
import { gradeById, gradeByName } from './grades'
import {
  batchAttributeDef, expiryPrecision, getBatchAttributeConfig, type BatchAttributeKey,
} from './batchAttributes'
import {
  getProductBatchById, getProductBatches, isProductBatchTracked, updateBatch,
  type BatchAttributeInput,
} from './productDetails'

/** Template columns, in order. Every attribute column is always present, whichever
 *  product the import was started from (PRD). "Vendor" is the Supplier attribute (D2). */
export const BATCH_UPDATE_COLUMNS = [
  { key: 'productName', label: 'Product name' },
  { key: 'batchNumber', label: 'Batch number' },
  { key: 'description', label: 'Description' },
  { key: 'expiry_date', label: 'Expiry date' },
  { key: 'manufacturing_date', label: 'Manufacturing date' },
  { key: 'best_before_date', label: 'Best before date' },
  { key: 'supplier', label: 'Vendor' },
  { key: 'grade', label: 'Grade' },
] as const

export type BatchUpdateColumnKey = typeof BATCH_UPDATE_COLUMNS[number]['key']
export type BatchUpdateCells = Record<BatchUpdateColumnKey, string>
/** One spreadsheet row as cell text. `rowNumber` is the sheet row (the header is row 1). */
export type BatchUpdateRow = { rowNumber: number } & BatchUpdateCells

export interface BatchUpdateRowResult {
  rowNumber: number
  productName: string
  batchNumber: string
  /** Why the row wasn't imported, in PRD copy. Empty for a valid row. */
  errors: string[]
}

export interface BatchUpdateImportResult {
  total: number
  /** Valid rows that changed a batch. */
  updated: number
  /** Valid rows that changed nothing (every cell blank or already equal). */
  unchanged: number
  failed: BatchUpdateRowResult[]
}

const NULL_WORD = 'null'
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function pad(n: number): string { return String(n).padStart(2, '0') }

/** A month as written in a date cell: 1–12, or an English month name / abbreviation. */
function monthOf(text: string): number | null {
  if (/^\d{1,2}$/.test(text)) {
    const n = Number(text)
    return n >= 1 && n <= 12 ? n : null
  }
  const i = MONTHS.indexOf(text.toLowerCase().slice(0, 3))
  return /^[a-z]{3,9}$/i.test(text) && i >= 0 ? i + 1 : null
}

/**
 * A date cell → ISO, or null when it doesn't parse. A day is DD/MM/YYYY with "/" or "-"
 * and the month as a number or a name (31/08/2026, 31-Aug-2026). When `allowMonth`
 * (Expiry date only) a month-precision MM/YYYY is accepted too (08/2026, Aug-2026).
 */
export function parseImportDate(text: string, allowMonth: boolean): string | null {
  const parts = text.trim().split(/[/-]/)
  if (parts.length === 3) {
    const [d, m, y] = parts as [string, string, string]
    const month = monthOf(m)
    if (!/^\d{1,2}$/.test(d) || !/^\d{4}$/.test(y) || !month) return null
    const iso = `${y}-${pad(month)}-${pad(Number(d))}`
    return expiryPrecision(iso) === 'day' ? iso : null
  }
  if (parts.length === 2 && allowMonth) {
    const [m, y] = parts as [string, string]
    const month = monthOf(m)
    if (!/^\d{4}$/.test(y) || !month) return null
    return `${y}-${pad(month)}`
  }
  return null
}

/** ISO → the import's own cell format (DD/MM/YYYY, or MM/YYYY for a month). */
function isoToCell(iso: string | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return d ? `${d}/${m}/${y}` : `${m}/${y}`
}

function productByName(name: string) {
  const needle = name.trim().toLowerCase()
  return productIndexRows().find((r) => r.name.trim().toLowerCase() === needle)
}

const ATTRIBUTE_KEYS: readonly BatchAttributeKey[] = ['expiry_date', 'manufacturing_date', 'best_before_date', 'supplier', 'grade']

interface CheckedRow {
  result: BatchUpdateRowResult
  /** Present only for a valid row: what to apply to which batch. */
  patch?: { sku: string; batchId: string; description?: string; attributes: BatchAttributeInput }
}

/** Check every row against the PRD's rules without changing anything. */
export function validateBatchUpdateRows(rows: readonly BatchUpdateRow[]): CheckedRow[] {
  // The same product + batch twice in one file is an error on both rows.
  const comboKey = (r: BatchUpdateRow) => `${r.productName.trim().toLowerCase()}::${r.batchNumber.trim().toLowerCase()}`
  const comboCount = new Map<string, number>()
  for (const r of rows) {
    if (r.productName.trim() && r.batchNumber.trim()) comboCount.set(comboKey(r), (comboCount.get(comboKey(r)) ?? 0) + 1)
  }

  return rows.map((row) => {
    const productName = row.productName.trim()
    const batchNumber = row.batchNumber.trim()
    const errors: string[] = []
    const result: BatchUpdateRowResult = { rowNumber: row.rowNumber, productName, batchNumber, errors }

    const product = productName ? productByName(productName) : undefined
    const tracked = !!product && isProductBatchTracked(product.sku)
    if (!productName) errors.push('You must fill in product name')
    else if (!product) errors.push('Product name not found')
    else if (!tracked) errors.push('Product is not tracked by batch')

    const batch = tracked && batchNumber
      ? getProductBatches(product!.sku).find((b) => b.batchNo.toLowerCase() === batchNumber.toLowerCase())
      : undefined
    if (!batchNumber) errors.push('You must fill in batch number')
    else if (tracked && !batch) errors.push('Batch number not found')

    if (productName && batchNumber && (comboCount.get(comboKey(row)) ?? 0) > 1) {
      errors.push('Duplicated Product and Batch combination')
    }

    // Nothing to check cell by cell without a known batch of a batch-tracked product.
    if (!tracked || !batch) return { result }

    const descriptionCell = row.description.trim()
    const filledAttributes = ATTRIBUTE_KEYS.filter((k) => row[k].trim())
    if (batch.isUnassigned) {
      // The Unassigned batch never carries attributes (PM answer A5); it's a system
      // batch, so its description isn't imported either. Copy pending PM (A7).
      if (descriptionCell || filledAttributes.length) errors.push("Unassigned batch can't have attributes")
      return { result }
    }

    const selected = new Set(getBatchAttributeConfig(product!.sku).map((a) => a.key))
    const attributes: BatchAttributeInput = {}
    for (const key of filledAttributes) {
      const cell = row[key].trim()
      const label = batchAttributeDef(key).label
      if (!selected.has(key)) {
        errors.push(`This product does not use attribute ${label}`)
        continue
      }
      if (cell.toLowerCase() === NULL_WORD) {
        attributes[key] = null
        continue
      }
      switch (key) {
        case 'expiry_date': {
          const iso = parseImportDate(cell, true)
          if (iso) attributes[key] = iso
          else errors.push('Format must be in DD/MM/YYYY or MM/YYYY')
          break
        }
        case 'manufacturing_date':
        case 'best_before_date': {
          const iso = parseImportDate(cell, false)
          if (iso) attributes[key] = iso
          else errors.push('Format must be in DD/MM/YYYY')
          break
        }
        case 'supplier': {
          const vendor = vendors.find((v) => v.name.trim().toLowerCase() === cell.toLowerCase())
          if (vendor) attributes[key] = vendor.id
          else errors.push('Vendor name not found')
          break
        }
        case 'grade': {
          const grade = gradeByName(cell)
          if (!grade) errors.push('Grade name not found')
          else if (grade.status !== 'active') errors.push('Grade is not active')
          else attributes[key] = grade.id
          break
        }
      }
    }

    // A required attribute must have a value once the row is applied.
    for (const a of getBatchAttributeConfig(product!.sku)) {
      if (!a.required) continue
      const after = a.key in attributes ? attributes[a.key] : batch.attributes[a.key]
      if (!after && !errors.some((e) => e.includes(batchAttributeDef(a.key).label))) {
        errors.push(`Attribute ${batchAttributeDef(a.key).label} must be filled`)
      }
    }

    if (errors.length) return { result }
    return {
      result,
      patch: {
        sku: product!.sku,
        batchId: batch.id,
        ...(descriptionCell ? { description: descriptionCell.toLowerCase() === NULL_WORD ? '' : descriptionCell } : {}),
        attributes,
      },
    }
  })
}

/** Validate every row, then apply the valid ones. Invalid rows change nothing. */
export function applyBatchUpdateImport(rows: readonly BatchUpdateRow[], by?: string): BatchUpdateImportResult {
  let updated = 0
  let unchanged = 0
  const failed: BatchUpdateRowResult[] = []

  for (const { result, patch } of validateBatchUpdateRows(rows)) {
    if (!patch) {
      failed.push(result)
      continue
    }
    const before = getProductBatchById(patch.sku, patch.batchId)
    const applied = updateBatch(patch.sku, patch.batchId, { description: patch.description, attributes: patch.attributes }, by)
    if (!applied.ok) {
      // Validation mirrors updateBatch, so this is a safety net rather than a path.
      failed.push({ ...result, errors: ['Row could not be updated'] })
      continue
    }
    const changed = JSON.stringify([before?.description, before?.attributes]) !==
      JSON.stringify([applied.value.description, applied.value.attributes])
    if (changed) updated++
    else unchanged++
  }
  return { total: rows.length, updated, unchanged, failed }
}

/** The batches of these products as template rows, in the import's own formats — so a
 *  downloaded list can be edited and imported back as-is. Unassigned batches are left
 *  out: they never carry attributes. */
export function batchUpdateTemplateRows(skus: readonly string[]): BatchUpdateCells[] {
  const out: BatchUpdateCells[] = []
  for (const sku of skus) {
    const product = productIndexRows().find((r) => r.sku === sku)
    if (!product || !isProductBatchTracked(sku)) continue
    for (const b of getProductBatches(sku)) {
      if (b.isUnassigned) continue
      out.push({
        productName: product.name,
        batchNumber: b.batchNo,
        description: b.description,
        expiry_date: isoToCell(b.attributes.expiry_date),
        manufacturing_date: isoToCell(b.attributes.manufacturing_date),
        best_before_date: isoToCell(b.attributes.best_before_date),
        supplier: b.attributes.supplier ? vendors.find((v) => v.id === b.attributes.supplier)?.name ?? '' : '',
        grade: b.attributes.grade ? gradeById(b.attributes.grade)?.name ?? '' : '',
      })
    }
  }
  return out
}
