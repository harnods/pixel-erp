import { purchaseRequests } from './purchaseRequests'
import type { PurchaseRequest } from './types'

/**
 * Presentational detail for the Purchase Request *details* page. A
 * PurchaseRequest in purchaseRequests.ts already carries real line items, so
 * unlike salesQuoteDetails this file synthesises NO line items and NO money
 * totals — a purchase request is an internal request with no vendor and no
 * pricing. It only layers on the document chrome (department, warehouse,
 * deliver-to address, note, attachments, last-updated, linked transactions)
 * deterministically from the record's index, so the view is stable per id.
 */

export interface PRAttachment { name: string; sizeKB: number }

export interface PRLinkedTxn {
  date: string          // ISO
  type: string          // "Purchase Order"
  number: string        // "#PO-40118"
  status: string        // mapped via ErpStatusBadge
}

export interface PurchaseRequestDetail extends PurchaseRequest {
  department: string
  warehouse: string
  deliverTo: string
  note: string
  attachments: PRAttachment[]
  lastUpdatedBy: string
  lastUpdatedAt: string
  linkedTransactions: PRLinkedTxn[]
}

const DEPARTMENTS = ['Procurement', 'Operations', 'Warehouse', 'Roastery', 'Retail']
const WAREHOUSES = ['Default warehouse', 'Cibinong warehouse', 'Pulogadung DC', 'Bandung hub']
const DELIVER_TO = [
  'Jl. Sindang III/5, Kompleks Pertamina, DKI Jakarta 12820',
  'Gudang Blok C No. 12, Kawasan Industri Pulogadung, Jakarta Timur',
  'Jl. Raya Bogor KM 30, Cibinong, Bogor, Jawa Barat',
  'Ruko Sentra Niaga No. 7, Bintaro, Tangerang Selatan',
]
const NOTES = [
  'Please expedite — stock is running low ahead of the weekend rush.',
  'Standard restock. Consolidate with the next scheduled delivery if possible.',
  'Required for the upcoming seasonal menu launch. Confirm lead times with vendor.',
  'Replacement for damaged goods received last cycle.',
]

function pick<T>(arr: T[], i: number): T { return arr[i % arr.length]! }

/**
 * A request that has been processed (partially processed / closed) has been
 * turned into a purchase order; open/voided requests link to nothing.
 */
function buildLinked(pr: PurchaseRequest, idx: number): PRLinkedTxn[] {
  if (pr.status !== 'partially processed' && pr.status !== 'closed') return []
  return [{
    date: pr.date,
    type: 'Purchase Order',
    number: `#PO-${40100 + idx}`,
    status: pr.status === 'closed' ? 'closed' : 'open',
  }]
}

function buildDetail(base: PurchaseRequest, idx: number): PurchaseRequestDetail {
  return {
    ...base,
    department: pick(DEPARTMENTS, idx),
    warehouse: pick(WAREHOUSES, idx),
    deliverTo: pick(DELIVER_TO, idx),
    note: pick(NOTES, idx),
    attachments: base.attachment ? [{ name: `PR-${base.number}.pdf`, sizeKB: 48 }] : [],
    lastUpdatedBy: base.procurementStaff,
    lastUpdatedAt: `${base.date}T09:30:00+07:00`,
    linkedTransactions: buildLinked(base, idx),
  }
}

/** Look up a full purchase-request detail by id; falls back to the first record. */
export function getPurchaseRequestDetail(id: string): PurchaseRequestDetail {
  const i = purchaseRequests.findIndex(pr => pr.id === id)
  const idx = i >= 0 ? i : 0
  return buildDetail(purchaseRequests[idx]!, idx)
}
