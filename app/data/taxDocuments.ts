/**
 * Tax documents created via "Create tax document" (Sales Invoice detail ▸
 * Actions), stored per source sales invoice. Backs the detail page's
 * "Tax document" tab and the Sales invoices index's bulk "Submit to DJP".
 *
 * Documents form a LINEAGE (PRD-05 Output Tax Document Change Management): an
 * `normal` document can be superseded by a `replacement` (Faktur Pajak
 * Pengganti) or withdrawn by a `cancellation` (Pembatalan Faktur Pajak) plus a
 * fresh Normal document.
 * A superseded document is never removed — it flips to `replaced`/`cancelled`
 * and stays on file as the historical record (BR-007).
 */
import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import type { DetectedTaxChange, SalesInvoiceTaxSnapshot, TaxAction } from './taxDocumentChanges'

export type TaxDocumentPaymentStage = 'full-payment' | 'down-payment' | 'settlement'
export type TaxDocumentStatus =
  | 'draft' | 'awaiting-approval' | 'approved' | 'rejected'
  /** Superseded by an approved replacement — kept as the historical record. */
  | 'replaced'
  /** Withdrawn by an approved cancellation — kept as the historical record. */
  | 'cancelled'
  /**
   * Return note only: raised against a sales return and waiting for the BUYER to
   * issue and send the nota retur. Never goes to DJP from here — the seller
   * doesn't submit this document, they chase it.
   */
  | 'awaiting-from-buyer'
/** Which drawer form produced this document — Domestic (VAT Code) or Foreign
 *  (Transaction detail export classification). Drives which fields the "View
 *  details" drawer shows and how the Summary's PPN is computed. */
export type TaxDocumentLane = 'domestic' | 'foreign'
/** Where the document sits in its lineage — DJP's own e-Faktur classification
 *  (Faktur Pajak Normal / Pengganti / Dibatalkan). `normal` covers both the
 *  first document raised against an invoice and the fresh one raised after a
 *  cancellation: each reports the delivery in its own right, neither corrects
 *  another document.
 *
 *  `return-note` is the odd one out: a Nota Retur is not a faktur at all and is
 *  not issued by us — the buyer raises it when goods are returned, and we hold a
 *  record of it so the return is traceable from the invoice it came from. */
export type TaxDocumentKind = 'normal' | 'replacement' | 'cancellation' | 'return-note'

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
  /**
   * The 13-digit Nomor Seri Faktur Pajak — the tail of the faktur number, WITHOUT
   * the transaction code or the status digit that precede it (see
   * formatTaxDocumentNumber for how the full 16-digit number is assembled).
   *
   * A replacement or cancellation INHERITS this from the document it acts on: a
   * Faktur Pajak Pengganti carries the same serial as the faktur it corrects and
   * differs only in the status digit. Only a Normal document draws a fresh one.
   *
   * Pre-generated at creation and only surfaced once DJP approves the document —
   * that keeps the reveal a pure display concern instead of a later mutation.
   *
   * EMPTY for a return note, which carries no NSFP of ours at all — the number on
   * a nota retur is the buyer's, and inventing one here would be a fabricated tax
   * number waiting to leak into a print.
   */
  serial: string
  status: TaxDocumentStatus
  kind: TaxDocumentKind
  /** 0 for a Normal document; 1, 2, … for each successive replacement in the chain. */
  revision: number
  /** The document this one supersedes (replacement) or withdraws (cancellation). */
  replacesId?: string
  /** Set on the superseded document once its successor is approved by DJP. */
  replacedById?: string
  /**
   * A faktur this document RELATES to without acting on it — used by a return
   * note, which points at the faktur the returned goods were delivered under.
   *
   * Deliberately not `replacesId`: that field means "supersede this document",
   * and approving something that carries it flips the target to replaced/cancelled
   * (see updateTaxDocumentStatus). A return leaves the issued faktur standing.
   */
  relatesToId?: string
  /** The Sales Invoice edit that triggered this document, for the review drawer. */
  changes?: DetectedTaxChange[]
  /** The Sales Invoice exactly as this document reported it. Captured at
   *  creation so a later edit has a truthful "previously approved version" to
   *  diff against (AC-001) — reconstructing it from today's invoice would
   *  compare the edit against itself. Absent on documents created before
   *  PRD-05; callers fall back to the pristine (un-edited) invoice. */
  invoiceSnapshot?: SalesInvoiceTaxSnapshot
}

const STORE_KEY = 'tax-documents'

/**
 * Bring a persisted document up to the current shape:
 *  - documents saved before lineage existed carry no kind/revision at all;
 *  - documents saved while this kind was spelled `original` predate the switch
 *    to DJP's "Normal" wording — both normalise to `normal`, so an old snapshot
 *    still renders and still matches the `kind === 'normal'` checks below;
 *  - documents saved before the number was split into kode transaksi + kode
 *    status + NSFP carry a 15-digit serial, which would now render an 18-digit
 *    faktur number. Keep the LAST 13 digits so the number stays the right
 *    length (the leading digits it drops are the ones the status digit and
 *    transaction code now occupy).
 */
const SERIAL_LENGTH = 13

function normalize(doc: TaxDocument): TaxDocument {
  const kind = (!doc.kind || (doc.kind as string) === 'original') ? 'normal' : doc.kind
  const stored = doc.serial ?? ''
  // An empty serial is a document that HAS no NSFP of ours (a return note), not a
  // short one to be padded — zero-filling it would mint 0000000000000 as a number.
  const serial = !stored || stored.length === SERIAL_LENGTH
    ? stored
    : stored.slice(-SERIAL_LENGTH).padStart(SERIAL_LENGTH, '0')
  return { ...doc, kind, serial, revision: doc.revision ?? 0 }
}

/**
 * Seed lineage — so PRD-05's end states are visible the moment anyone opens the
 * app, instead of only after they've manually driven an edit through the whole
 * replacement or cancellation flow. Two invoices, one story each:
 *
 *   SI150 — a Normal faktur that has been superseded (Replaced, prints DIGANTI)
 *           plus the approved Pengganti that now stands. Same NSFP, status
 *           digit 0 → 1.
 *   SI149 — a Normal faktur that was cancelled (prints BATAL) plus the fresh
 *           Normal faktur raised for the corrected transaction, on its own NSFP.
 *
 * Serials are fixed, not generated, so every load and every machine shows the
 * same faktur numbers — a demo where the numbers move is a demo nobody trusts.
 */
function buildSeedTaxDocuments(): TaxDocument[] {
  const common = {
    documentType: 'Output tax invoice',
    paymentStage: 'settlement' as TaxDocumentPaymentStage,
    lane: 'domestic' as TaxDocumentLane,
    djpCode: '04',
  }
  return [
    // SI150 — replaced → pengganti
    {
      ...common, id: 'taxdoc-seed-si150-normal', salesInvoiceId: 'SI150', date: '19/08/2026',
      serial: '2500001234567', status: 'replaced', kind: 'normal', revision: 0,
      replacedById: 'taxdoc-seed-si150-pengganti',
    },
    {
      ...common, id: 'taxdoc-seed-si150-pengganti', salesInvoiceId: 'SI150', date: '02/09/2026',
      serial: '2500001234567', status: 'approved', kind: 'replacement', revision: 1,
      replacesId: 'taxdoc-seed-si150-normal',
    },
    // SI149 — cancelled → re-issued
    {
      ...common, id: 'taxdoc-seed-si149-cancelled', salesInvoiceId: 'SI149', date: '12/08/2026',
      serial: '2500007654321', status: 'cancelled', kind: 'normal', revision: 0,
    },
    {
      ...common, id: 'taxdoc-seed-si149-reissued', salesInvoiceId: 'SI149', date: '02/09/2026',
      serial: '2500008765432', status: 'approved', kind: 'normal', revision: 0,
    },
  ]
}

// A present snapshot always wins — once the user has created or advanced any tax
// document, that state is theirs and the seed must not reappear underneath it.
const store = reactive<TaxDocument[]>(
  (loadSnapshot<TaxDocument>(STORE_KEY) ?? buildSeedTaxDocuments()).map(normalize),
)

function persist() { saveSnapshot(STORE_KEY, [...store]) }

/** A fresh NSFP — what DJP would hand out for a new faktur. */
function generateSerial(): string {
  let s = ''
  for (let i = 0; i < SERIAL_LENGTH; i++) s += Math.floor(Math.random() * 10)
  return s
}

function generateId(): string {
  return `taxdoc-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
}

/** DD/MM/YYYY → sortable epoch. Returns 0 on anything unparseable so a malformed
 *  date sorts last rather than throwing the whole list into an arbitrary order. */
function dateValue(dmy: string): number {
  const [d, m, y] = (dmy ?? '').split('/')
  const t = Date.parse(`${y}-${m}-${d}`)
  return Number.isNaN(t) ? 0 : t
}

/**
 * All tax documents raised against one sales invoice, most recent first.
 *
 * Ordered by document DATE, then revision, then id — NOT by id alone. Ids used
 * to be generated with a timestamp prefix, so sorting on them happened to be
 * chronological; seeded documents have hand-written ids, where that would
 * silently degrade to alphabetical.
 */
export function getTaxDocumentsForInvoice(salesInvoiceId: string): TaxDocument[] {
  return store
    .filter(d => d.salesInvoiceId === salesInvoiceId)
    .sort((a, b) =>
      dateValue(b.date) - dateValue(a.date)
      || b.revision - a.revision
      || b.id.localeCompare(a.id),
    )
}

/**
 * How much a document is asking of the user — lower sorts first. Drives which
 * document speaks for the whole invoice on the Sales invoices index, where
 * there is only one "DJP status" cell to fill.
 *
 * The order is deliberately about WORK, not chronology: a draft replacement
 * sitting behind an approved faktur is the thing that still needs submitting,
 * so it should be what the index surfaces and what the status filter matches.
 */
const ATTENTION_RANK: Record<TaxDocumentStatus, number> = {
  'rejected':           0,   // DJP pushed it back — most urgent
  'draft':              1,   // raised but not submitted
  // Outstanding work, and the work is OURS: someone has to chase the buyer for
  // the nota retur. That is why it outranks awaiting-approval, where there is
  // genuinely nothing to do but wait on DJP.
  'awaiting-from-buyer': 2,
  'awaiting-approval':  3,   // with DJP, nothing to do but wait
  'approved':           4,   // settled
  'cancelled':          5,   // history
  'replaced':           6,   // history
}

/** True for a document that has been superseded — kept as a record, but it no
 *  longer describes the invoice's tax position. */
function isHistorical(doc: TaxDocument): boolean {
  return doc.status === 'replaced' || doc.status === 'cancelled'
}

/**
 * The single document that speaks for an invoice's DJP position right now.
 *
 * An invoice can carry a whole lineage (a Normal faktur, its Pengganti, a
 * cancellation, a re-issue), but the index has one status cell and one status
 * filter. This picks which one they mean:
 *
 *  1. Superseded documents are ignored while any live document exists — an
 *     invoice whose replacement DJP approved reads "Approved", not "Replaced".
 *  2. Among the live ones, the one that most needs attention wins, so a draft
 *     replacement behind an approved faktur still surfaces as work to do.
 *  3. If EVERY document is superseded — a cancelled faktur with no re-issue yet
 *     — the invoice really is in that state, so report it rather than pretend
 *     the invoice has no tax document at all.
 *
 * Returns null only when the invoice has no tax document.
 */
export function currentTaxDocument(salesInvoiceId: string): TaxDocument | null {
  const all = getTaxDocumentsForInvoice(salesInvoiceId)
  if (!all.length) return null
  const live = all.filter(d => !isHistorical(d))
  const pool = live.length ? live : all
  // getTaxDocumentsForInvoice already ordered newest-first, so a stable sort on
  // rank alone keeps the newest of any tied statuses.
  return [...pool].sort((a, b) => ATTENTION_RANK[a.status] - ATTENTION_RANK[b.status])[0] ?? null
}

export function getTaxDocument(id: string): TaxDocument | undefined {
  return store.find(d => d.id === id)
}

/**
 * The document a Sales Invoice edit has to answer to: an APPROVED Normal or
 * replacement document that is still standing. Change evaluation applies to nothing else
 * (BR-001) — a draft can simply be edited, and a superseded document is history.
 */
export function getApprovedTaxDocument(salesInvoiceId: string): TaxDocument | null {
  const standing = store.filter(d =>
    d.salesInvoiceId === salesInvoiceId && d.status === 'approved'
    // Neither of these is a faktur that reports the delivery, so neither is
    // something an edit has to correct.
    && d.kind !== 'cancellation' && d.kind !== 'return-note',
  )
  // Latest revision wins — a chain of replacements answers to its newest link.
  return standing.sort((a, b) => b.revision - a.revision || b.id.localeCompare(a.id))[0] ?? null
}

export function hasApprovedTaxDocument(salesInvoiceId: string): boolean {
  return getApprovedTaxDocument(salesInvoiceId) !== null
}

/** True when the invoice already has a Down payment tax document on file —
 *  gates CreateTaxDocumentDrawer's Settlement "Invoice number reference"
 *  picker. A Settlement document doesn't itself count. */
export function hasDownPaymentTaxDocument(salesInvoiceId: string): boolean {
  return store.some(d => d.salesInvoiceId === salesInvoiceId && d.paymentStage === 'down-payment')
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
  kind?: TaxDocumentKind
  revision?: number
  replacesId?: string
  relatesToId?: string
  changes?: DetectedTaxChange[]
  invoiceSnapshot?: SalesInvoiceTaxSnapshot
  /** NSFP to carry over — set by a replacement/cancellation, which reuses the
   *  serial of the faktur it acts on. Omit to draw a fresh one; pass '' for a
   *  document that has no NSFP of ours (a return note). */
  serial?: string
}): TaxDocument {
  const doc: TaxDocument = {
    ...input,
    kind: input.kind ?? 'normal',
    revision: input.revision ?? 0,
    id: generateId(),
    serial: input.serial ?? generateSerial(),
  }
  store.push(doc)
  persist()
  return doc
}

/**
 * Everything a Sales Invoice edit produces once the user confirms the tax impact
 * (AC-005 / AC-006). Fields the source document already settled — lane, VAT code,
 * payment stage, document type — carry over untouched: a replacement corrects the
 * invoice content, not the classification it was raised under. The NSFP carries
 * over too, so the pengganti differs from the faktur it corrects in exactly the
 * status digit (see formatTaxDocumentNumber).
 *
 *   • replacement  → one Replacement draft superseding `source`, reusing its NSFP.
 *   • cancellation → a Cancellation draft withdrawing `source` (also on that same
 *                    NSFP, since pembatalan voids that very faktur), PLUS a fresh
 *                    Normal draft — a new delivery report, so a NEW NSFP.
 *
 * `source` keeps its Approved status here — it is only marked replaced/cancelled
 * once DJP approves the successor (see updateTaxDocumentStatus), because until
 * then nothing has actually changed on DJP's side.
 */
export function generateChangeDrafts(opts: {
  source: TaxDocument
  action: Exclude<TaxAction, 'none'>
  changes: DetectedTaxChange[]
  /** Tax document date for the generated drafts, DD/MM/YYYY. */
  date: string
  /** The invoice as edited — becomes each draft's own reported version, so the
   *  NEXT edit diffs against the correction rather than the superseded original. */
  invoiceSnapshot: SalesInvoiceTaxSnapshot
}): TaxDocument[] {
  const { source, action, changes, date, invoiceSnapshot } = opts
  const carried = {
    salesInvoiceId: source.salesInvoiceId,
    date,
    documentType: source.documentType,
    paymentStage: source.paymentStage,
    lane: source.lane,
    djpCode: source.djpCode,
    pebReference: source.pebReference,
    exportNoticeReference: source.exportNoticeReference,
    classificationCode: source.classificationCode,
    status: 'draft' as const,
    changes,
    invoiceSnapshot,
  }

  if (action === 'replacement') {
    return [addTaxDocument({
      ...carried,
      kind: 'replacement',
      revision: source.revision + 1,
      replacesId: source.id,
      serial: source.serial,   // pengganti keeps the corrected faktur's NSFP
    })]
  }

  const cancellation = addTaxDocument({
    ...carried, kind: 'cancellation', revision: source.revision, replacesId: source.id,
    serial: source.serial,     // pembatalan voids that same faktur number
  })
  // The corrected transaction still has to be reported — a cancellation on its
  // own would leave the delivery unfaktured. This is a Normal document, not a
  // replacement: it supersedes nothing, it reports the delivery afresh.
  const reissued = addTaxDocument({ ...carried, kind: 'normal', revision: 0 })
  return [cancellation, reissued]
}

/**
 * The return note still outstanding on an invoice, if any — a record we've raised
 * and not yet had the buyer's nota retur for.
 *
 * Guards "Create sales return" against raising a second identical placeholder on
 * a double click. It deliberately looks for an OUTSTANDING one rather than any
 * return note, so a later return against the same invoice can still be tracked
 * once the first one has been settled.
 */
export function outstandingReturnNote(salesInvoiceId: string): TaxDocument | null {
  return store.find(d =>
    d.salesInvoiceId === salesInvoiceId
    && d.kind === 'return-note' && d.status === 'awaiting-from-buyer',
  ) ?? null
}

/**
 * The record raised when an invoice carrying a DJP-approved faktur is sent back
 * as a sales return.
 *
 * Unlike an edit, a return produces NO replacement and NO cancellation: the
 * faktur reported the delivery correctly when it was issued, and DJP corrects a
 * return through a Nota Retur raised by the buyer. So `source` is left Approved
 * and untouched, and what's created here is a record of a document we are waiting
 * to RECEIVE — hence `awaiting-from-buyer` and no NSFP of our own.
 *
 * The document's classification (lane, VAT code) carries over from the faktur the
 * return is against, because that's the delivery being unwound. Payment stage does
 * not: a nota retur has no such concept.
 */
export function generateReturnNoteDraft(opts: {
  source: TaxDocument
  /** Date the return was raised, DD/MM/YYYY. */
  date: string
  /** The invoice as it stood when the return was raised. */
  invoiceSnapshot: SalesInvoiceTaxSnapshot
}): TaxDocument {
  const { source, date, invoiceSnapshot } = opts
  return addTaxDocument({
    salesInvoiceId: source.salesInvoiceId,
    date,
    documentType: 'Return note',
    lane: source.lane,
    djpCode: source.djpCode,
    status: 'awaiting-from-buyer',
    kind: 'return-note',
    revision: 0,
    relatesToId: source.id,
    serial: '',              // the number on a nota retur is the buyer's, not ours
    invoiceSnapshot,
  })
}

/**
 * Status digit — the 3rd digit of a faktur number, which counts the pembetulan:
 * 0 for a Normal faktur, 1 for its first pengganti, 2 for the second, and so on.
 * That makes the revision readable straight off the number, so nothing else needs
 * to spell it out.
 *
 * A cancellation carries the digit of the faktur it voids (its `revision` is
 * copied from that document), because pembatalan acts ON an existing faktur
 * rather than issuing a corrected one.
 *
 * Clamped to one digit — a 10th replacement of the same faktur is far past
 * anything this prototype models, and silently widening the number would break
 * its 16-digit shape.
 */
function statusDigit(doc: TaxDocument): string {
  return String(Math.min(Math.max(doc.revision, 0), 9))
}

/**
 * The 16-digit faktur number, assembled from its three parts:
 *
 *   04         1        4891702057779
 *   ↑          ↑        ↑
 *   kode       kode     Nomor Seri Faktur Pajak (13)
 *   transaksi  status   — inherited unchanged by a replacement
 *   (2)        (1)
 *
 * So a Normal faktur and its penggantis differ in exactly one digit, the 3rd:
 *   Normal        04 0 4891702057779
 *   Pengganti 1   04 1 4891702057779
 *   Pengganti 2   04 2 4891702057779
 *
 * Em dash until DJP has approved the document — a draft/awaiting/rejected faktur
 * has no issued number yet. Superseded documents keep showing theirs.
 *
 * A return note never gets one at all: a nota retur is numbered by the buyer who
 * issues it, so there is nothing for us to assemble here.
 */
export function formatTaxDocumentNumber(doc: TaxDocument): string {
  if (doc.kind === 'return-note') return '—'
  const issued = doc.status === 'approved' || doc.status === 'replaced' || doc.status === 'cancelled'
  return issued ? `${doc.djpCode}${statusDigit(doc)}${doc.serial}` : '—'
}

/**
 * Row-kebab status transitions — "Submit to DJP" (draft → awaiting-approval)
 * and "Refresh DJP status" (awaiting-approval → approved, simulating DJP's
 * own review since there's no real backend to poll here).
 *
 * Approving a replacement or cancellation also settles the document it
 * supersedes: only at that point has DJP actually accepted the change.
 */
export function updateTaxDocumentStatus(id: string, status: TaxDocumentStatus): void {
  const doc = store.find(d => d.id === id)
  if (!doc) return
  doc.status = status

  if (status === 'approved' && doc.replacesId) {
    const superseded = store.find(d => d.id === doc.replacesId)
    if (superseded) {
      superseded.status = doc.kind === 'cancellation' ? 'cancelled' : 'replaced'
      superseded.replacedById = doc.id
    }
  }
  persist()
}

/** DJP Status badge — its own colour set, independent of ErpStatusBadge's
 *  shared status map (which already uses 'awaiting approval' for something else). */
export const DJP_STATUS_CONFIG: Record<TaxDocumentStatus, { label: string; type: 'announcement' | 'warning' | 'completed' | 'critical' }> = {
  'draft':             { label: 'Draft',             type: 'announcement' },
  'awaiting-approval': { label: 'Awaiting approval', type: 'warning'      },
  'approved':          { label: 'Approved',          type: 'completed'   },
  'rejected':          { label: 'Rejected',          type: 'critical'    },
  'replaced':          { label: 'Replaced',          type: 'announcement' },
  'cancelled':         { label: 'Cancelled',         type: 'announcement' },
  // Warning, same as awaiting-approval: something is outstanding. It is not a
  // DJP status at all strictly speaking — nothing has been sent to DJP — but it
  // is the invoice's tax position, which is what this column reports.
  'awaiting-from-buyer': { label: 'Awaiting from buyer', type: 'warning'   },
}

/**
 * "Type" column label — DJP's e-Faktur classification, and nothing more. Which
 * pembetulan a replacement is doesn't belong here: the faktur number's 3rd digit
 * already says it (see statusDigit), so repeating it as "(rev. 2)" would just be
 * the same fact told twice.
 *
 * Kept a bare translatable term so it can go straight through `t()` without
 * interpolation.
 */
export function formatTaxDocumentKind(doc: TaxDocument): string {
  if (doc.kind === 'cancellation') return 'Cancellation'
  if (doc.kind === 'replacement') return 'Replacement'
  if (doc.kind === 'return-note') return 'Return note'
  return 'Normal'
}

/**
 * Watermark stamped across a printed faktur that no longer stands on its own —
 * the same cap DJP's own e-Faktur output carries:
 *
 *   • DIGANTI — this faktur has been superseded by a Faktur Pajak Pengganti.
 *   • BATAL   — this faktur has been cancelled (pembatalan).
 *
 * Only the SUPERSEDED document is stamped. A pengganti DJP has approved is the
 * faktur that now stands, so it prints clean — that it replaces something is
 * already readable from the status digit in its number.
 *
 * Empty for anything still current (draft, awaiting approval, approved, rejected).
 */
export function taxDocumentStamp(doc: TaxDocument): string {
  if (doc.status === 'replaced') return 'DIGANTI'
  if (doc.status === 'cancelled') return 'BATAL'
  return ''
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
  // A superseded faktur stays printable — it is the historical record (BR-007),
  // and it prints with its DIGANTI/BATAL cap so nobody mistakes it for current
  // (see taxDocumentStamp). Cancelled used to be missing here, which left a
  // voided faktur with no way to view it at all.
  else if (status === 'approved' || status === 'replaced' || status === 'cancelled') {
    items.push({ label: 'Print e-faktur' })
  }
  // 'awaiting-from-buyer' adds nothing: there is no action for us to take on a
  // return note beyond chasing the buyer, which happens outside the app.

  /**
   * Anything out of Draft's hands locks Edit/Delete — with the reason that
   * actually applies, since a wrong reason is worse than none:
   *
   *   • historical record  — replaced / cancelled, kept on file (BR-007)
   *   • not ours to edit   — a return note the buyer issues, not us
   *   • submitted to DJP   — awaiting approval / approved / rejected
   *
   * Empty for a draft, which stays fully editable.
   */
  const lockReason =
    status === 'draft' ? ''
    : status === 'replaced' || status === 'cancelled'
      ? 'Cannot be changed because it is kept as a historical record'
    : status === 'awaiting-from-buyer'
      ? 'Cannot be changed because the return note is issued by the buyer'
    : 'Cannot be edited because it has been submitted to DJP'
  const submittedToDjp = lockReason === 'Cannot be edited because it has been submitted to DJP'

  items.push({ label: 'Edit', disabled: !!lockReason, tooltip: lockReason || undefined })
  items.push({
    label: 'Delete', disabled: !!lockReason,
    tooltip: (submittedToDjp ? 'Cannot be deleted because it has been submitted to DJP' : lockReason) || undefined,
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
