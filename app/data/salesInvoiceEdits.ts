/**
 * User edits to a Sales Invoice, kept as an OVERLAY on top of the deterministic
 * seed (see salesInvoiceDetails.ts, which generates every detail from the base
 * record's `total` + `itemCount`).
 *
 * Storing an overlay rather than rewriting the seed keeps the generator honest —
 * the seed stays a pure function of its index, and `getSalesInvoiceDetail` just
 * merges whatever the user changed on top. That also gives PRD-05 the thing it
 * needs most: a stable "before" to diff an edit against, since dropping the
 * overlay always reproduces the invoice exactly as it was first issued.
 */
import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import type { SILineItem } from './types'

export interface SalesInvoiceEdit {
  salesInvoiceId: string
  customer: { id: string; name: string }
  date: string                 // ISO
  dueDate: string              // ISO
  email: string[]
  billingAddress: string
  shipTo: string
  paymentTerms: string
  referenceNo: string
  warehouse: string
  tags: string[]
  lineItems: SILineItem[]
  globalDiscount: number
  shippingFee: number
  message: string
  memo: string
  attachments: { name: string; sizeKB: number }[]
  /** ISO timestamp of the edit — surfaces as the detail page's "Last updated". */
  editedAt: string
  editedBy: string
}

const STORE_KEY = 'sales-invoice-edits'
const store = reactive<SalesInvoiceEdit[]>(loadSnapshot<SalesInvoiceEdit>(STORE_KEY) ?? [])

function persist() { saveSnapshot(STORE_KEY, [...store]) }

export function getSalesInvoiceEdit(salesInvoiceId: string): SalesInvoiceEdit | null {
  return store.find(e => e.salesInvoiceId === salesInvoiceId) ?? null
}

/** Latest edit wins — one overlay per invoice, replaced wholesale on each save. */
export function saveSalesInvoiceEdit(edit: SalesInvoiceEdit): void {
  const i = store.findIndex(e => e.salesInvoiceId === edit.salesInvoiceId)
  if (i >= 0) store.splice(i, 1, edit)
  else store.push(edit)
  persist()
}
