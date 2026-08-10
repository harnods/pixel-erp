/**
 * Tax documents created via "Create tax document" (Sales Invoice detail ▸
 * Actions), stored per source sales invoice. Backs the detail page's
 * "Tax document" tab and the Sales invoices index's bulk "Submit to DJP".
 */
import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'

export type TaxDocumentPaymentStage = 'full-payment' | 'down-payment' | 'settlement'
export type TaxDocumentStatus = 'draft' | 'awaiting-approval' | 'approved' | 'rejected'
/** Which drawer form produced this document — Domestic (VAT Code) or Foreign
 *  (Transaction detail export classification). Drives which fields the "View
 *  details" drawer shows and how the Summary's PPN is computed. */
export type TaxDocumentLane = 'domestic' | 'foreign'

export interface TaxDocument {
  id: string
  salesInvoiceId: string
  date: string                  // as entered in the drawer's date picker, DD/MM/YYYY
  documentType: string           // e.g. 'Output tax invoice', 'CK-1 excise document'
  /** Domestic only — Foreign lane doesn't collect a sales invoice type. */
  paymentStage?: TaxDocumentPaymentStage
  lane: TaxDocumentLane
  /** Domestic: selected VAT Code ('01'..'10'). Foreign: selected Transaction
   *  detail code ('11'..'13'). Same field either way — both are just "the
   *  code this document was raised under" for numbering purposes. */
  djpCode: string
  /** Foreign, code 11 only. */
  pebReference?: string
  /** Foreign, codes 12/13 only. */
  exportNoticeReference?: string
  /** Foreign, codes 12/13 only. */
  classificationCode?: string
  /** Pre-generated 15-digit serial — only surfaced once DJP has approved the
   *  document (see formatTaxDocumentNumber); a draft/pending doc has no real
   *  number yet, but generating it upfront keeps that reveal a pure display
   *  concern instead of a later mutation. */
  serial: string
  status: TaxDocumentStatus
}

const STORE_KEY = 'tax-documents'
const store = reactive<TaxDocument[]>(loadSnapshot<TaxDocument>(STORE_KEY) ?? [])

function persist() { saveSnapshot(STORE_KEY, [...store]) }

function generateSerial(): string {
  let s = ''
  for (let i = 0; i < 15; i++) s += Math.floor(Math.random() * 10)
  return s
}

/** All tax documents raised against one sales invoice, most recent first. */
export function getTaxDocumentsForInvoice(salesInvoiceId: string): TaxDocument[] {
  return store
    .filter(d => d.salesInvoiceId === salesInvoiceId)
    .sort((a, b) => b.id.localeCompare(a.id))
}

export function addTaxDocument(input: {
  salesInvoiceId: string
  date: string
  documentType: string
  paymentStage?: TaxDocumentPaymentStage
  lane: TaxDocumentLane
  djpCode: string
  pebReference?: string
  exportNoticeReference?: string
  classificationCode?: string
  status: TaxDocumentStatus
}): TaxDocument {
  const doc: TaxDocument = {
    ...input,
    id: `taxdoc-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
    serial: generateSerial(),
  }
  store.push(doc)
  persist()
  return doc
}

/** Number column: em dash unless DJP has approved it — draft/awaiting/rejected never show a serial. */
export function formatTaxDocumentNumber(doc: TaxDocument): string {
  return doc.status === 'approved' ? `${doc.djpCode}${doc.serial}` : '—'
}

/** Row-kebab status transitions — "Submit to DJP" (draft → awaiting-approval)
 *  and "Refresh DJP status" (awaiting-approval → approved, simulating DJP's
 *  own review since there's no real backend to poll here). */
export function updateTaxDocumentStatus(id: string, status: TaxDocumentStatus): void {
  const doc = store.find(d => d.id === id)
  if (!doc) return
  doc.status = status
  persist()
}

/** DJP Status badge — its own colour set, independent of ErpStatusBadge's
 *  shared status map (which already uses 'awaiting approval' for something else). */
export const DJP_STATUS_CONFIG: Record<TaxDocumentStatus, { label: string; type: 'announcement' | 'warning' | 'completed' | 'critical' }> = {
  'draft':             { label: 'Draft',             type: 'announcement' },
  'awaiting-approval': { label: 'Awaiting approval', type: 'warning'      },
  'approved':          { label: 'Approved',          type: 'completed'   },
  'rejected':          { label: 'Rejected',          type: 'critical'    },
}

export interface TaxDocMenuItemDef { label: string; disabled?: boolean; tooltip?: string }

/** Kebab menu shape per DJP status (Figma: E-Faktur node 4249-23752, "Popover
 *  / Document Type"). Pure label/order/disabled/tooltip data, shared by the
 *  "Tax documents" table row kebab and the detail drawer's "Actions" button —
 *  callers wire their own onClick handlers by matching `label`, and may drop
 *  "View details" once already inside the detail drawer. */
export function taxDocMenuItemDefs(status: TaxDocumentStatus): TaxDocMenuItemDef[] {
  const items: TaxDocMenuItemDef[] = [{ label: 'View details' }]
  if (status === 'draft') items.push({ label: 'Submit to DJP' })
  else if (status === 'awaiting-approval') items.push({ label: 'Refresh DJP status' })
  else if (status === 'rejected') items.push({ label: 'Resubmit to DJP' })
  else if (status === 'approved') items.push({ label: 'Print e-faktur' })

  // Once submitted to DJP (awaiting approval, approved, or rejected), the
  // document is out of Draft's hands — Edit/Delete lock, each explaining why.
  const submitted = status !== 'draft'
  items.push({
    label: 'Edit', disabled: submitted,
    tooltip: submitted ? 'Cannot be edited because it has been submitted to DJP' : undefined,
  })
  items.push({
    label: 'Delete', disabled: submitted,
    tooltip: submitted ? 'Cannot be deleted because it has been submitted to DJP' : undefined,
  })
  return items
}

/** "Full payment" / "Down payment" / "Settlement" — the human label for a
 *  document's payment stage. Foreign-lane documents have none. */
export function formatPaymentStage(stage: TaxDocumentPaymentStage | undefined): string {
  if (stage === 'down-payment') return 'Down payment'
  if (stage === 'settlement') return 'Settlement'
  if (stage === 'full-payment') return 'Full payment'
  return '—'
}
