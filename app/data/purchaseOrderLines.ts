/**
 * Stored PO documents — real line items and a real warehouse FK for POs created in
 * the app, rather than the generated ones the 60 seed orders use.
 *
 * Why this exists: `purchaseOrderDetails.ts` builds line items from a private,
 * hardcoded INDUSTRIAL-PARTS list (Steel plate 3mm, Bearing 6204-2RS…) that has no
 * relation to the coffee `CATALOG`, and its exported `WAREHOUSES` is a free-text
 * list of four names matching nothing in `warehouses.ts`. Both are fine for the
 * seed, but a replenishment PO has to show the actual coffee SKUs it was raised for
 * and the actual warehouse it replenishes.
 *
 * So rather than rewriting that generator (and changing every seed PO's appearance),
 * `getPurchaseOrderDetail` checks here FIRST and falls back to the generator. The
 * seed is untouched; new POs carry the truth.
 *
 * Each document keeps BOTH `warehouseId` (a real wh-00x FK, what any future
 * receipt bridge needs) and `warehouse` (the real display name, what the detail page
 * already prints) — so the PO detail page needs no changes at all.
 */
import type { POLineItem, POTotals } from './purchaseOrderDetails'

const STORAGE_KEY = 'erp-db:po-documents'

export interface StoredPoDocument {
  poId: string
  /** Real FK → Warehouse.id */
  warehouseId: string
  /** Real warehouse name, from warehouses.ts */
  warehouse: string
  paymentTerms: string
  shipDate: string
  lineItems: POLineItem[]
  totals: POTotals
}

type Store = Record<string, StoredPoDocument>

function read(): Store {
  if (!import.meta.client) return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Store) : {}
  } catch {
    return {}
  }
}

function write(store: Store): void {
  if (!import.meta.client) return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)) } catch { /* non-fatal */ }
}

// Mirrored in memory so a spec (and SSR) can read back what this session wrote,
// even where localStorage is unavailable.
const memory: Store = {}

export function setPurchaseOrderDocument(doc: StoredPoDocument): void {
  memory[doc.poId] = doc
  const store = read()
  store[doc.poId] = doc
  write(store)
}

export function getPurchaseOrderDocument(poId: string): StoredPoDocument | undefined {
  return memory[poId] ?? read()[poId]
}

export function hasStoredPurchaseOrderDocument(poId: string): boolean {
  return getPurchaseOrderDocument(poId) !== undefined
}

export function resetPurchaseOrderDocuments(): void {
  for (const k of Object.keys(memory)) delete memory[k]
  if (!import.meta.client) return
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}
