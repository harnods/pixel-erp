import { ref } from 'vue'
import { loadSnapshot, saveSnapshot } from '~/data/persist'
import { coaAccounts, type CoaAccount } from '~/data/wmsCutover'
import { salesInvoices } from '~/data/salesInvoices'
import { getSalesInvoiceDetail } from '~/data/salesInvoiceDetails'
import { currentTaxDocument, DJP_STATUS_CONFIG, formatTaxDocumentNumber, updateTaxDocumentStatus, taxDocumentsVersion, type TaxDocument } from '~/data/taxDocuments'
import { formatIDR } from '~/utils/currency'
import { VAT_IN_ENABLED, AIRENE_SUGGEST_ENABLED } from '~/data/vatReconFlags'

// Re-exported so screens import the switch from the module they already use.
export { VAT_IN_ENABLED, AIRENE_SUGGEST_ENABLED }

/**
 * VAT reconciliation — ERP records ↔ DJP Coretax faktur pajak.
 *
 * Two sides, one shape:
 *   output (Faktur keluaran) — sales invoices (ERP)    ↔ tax invoices issued (Coretax)
 *   input  (Faktur masukan)  — purchase invoices (ERP) ↔ prepopulated faktur (Coretax)
 *
 * Identifiers follow **Coretax**, not legacy e-Faktur:
 *   nomor faktur pajak — 17 digits, numeric only (was `010.001-26.39847291`)
 *   NPWP               — 16 digits, numeric only (was `01.000.013.1-093.000`)
 *
 * A "pair" always carries both sides; either one may be null, which is what
 * makes it one-sided. `match` is the engine's verdict (PRD OD-001 v1.0 §5.1),
 * `fields` the field keys that differ (drives diff highlighting), and `reason`
 * the plain-language explanation shown to the user.
 *
 * Scope note: the PRD is **VAT Out only** (sales invoice × faktur keluaran).
 * VAT In is OD-008 and shares this shell, so the input side stays modelled here
 * rather than being deleted and rebuilt — but its fixtures are illustrative and
 * the status model was written against the VAT Out conditions. While VAT In is
 * a non-goal it is hidden behind `VAT_IN_ENABLED` (~/data/vatReconFlags).
 *
 * Period: Masa pajak 02/2027. Tenant: PT Central Perk Indonesia.
 */

/**
 * Row status — PRD OD-001 v1.0 §5.1, one key per numbered condition.
 *
 * Every state is a *named root cause with a named fix*; there is deliberately no
 * generic "unmatched" bucket (goal G2). `matched` covers rows 1 and 2 — the PRD
 * lists Reconciled (auto) and Reconciled (manual) separately and `matchedBy`
 * carries which, because an audit has to tell a rule from a decision.
 *
 * There is no `suggested` state any more: v1.0 makes probabilistic/AI matching a
 * non-goal here. Airene suggests candidates for Find & match (US-014/015, split
 * out to OD-001-AI-01) and never sets a status.
 */
export type MatchState =
  /** 1, 2 — key + corroboration + direction pass, FK Approved, no duplicate. */
  | 'matched'
  /** 3 (US-008) — SI exists, no Approved faktur. */
  | 'not-in-coretax'
  /** 4 (US-009) — Approved faktur exists, nothing on the ERP side. */
  | 'no-match-in-erp'
  /** 5 (US-010) — SI edited after the faktur was approved; values disagree. */
  | 'invoice-edited'
  /** 6 (US-011) — SI voided, faktur still Approved. */
  | 'invoice-voided'
  /** 7 (US-012) — sales return in Jurnal, no nota retur and no pengganti. */
  | 'return-not-reflected'
  /** 8 (US-017) — return dated before the faktur, SI − return = FK. */
  | 'return-netted'
  /** 9 — faktur dated before the invoice it belongs to. */
  | 'faktur-predates'
  /** 10 (US-005) — nota retur date ≠ sales return date (equality is intentional). */
  | 'return-date-mismatch'
  /** 11 (US-003) — one SI number referenced by more than one Approved faktur. */
  | 'duplicate-reference'
  /** 12 (US-004) — the match would land in a Finalized period. */
  | 'period-finalized'
  /**
   * 13 (US-001 AC-06/07) — Coretax-only faktur that is not Approved (Draft /
   * Batal / Rejected). Excluded from matching and from every count; NOT "No
   * match in ERP", which is reserved for an Approved faktur.
   */
  | 'not-approved'

/** States that still want a human — everything except a clean match. */
const NON_MATCHED_STATES = [
  'not-in-coretax', 'no-match-in-erp', 'invoice-edited', 'invoice-voided',
  'return-not-reflected', 'return-netted', 'faktur-predates',
  'return-date-mismatch', 'duplicate-reference', 'period-finalized', 'not-approved',
] as const

export type ReconSide = 'output' | 'input'

/** Coretax statuses that keep a faktur out of matching (PRD §5.1 row 13). */
export type CoretaxNotApprovedStatus = 'Draft' | 'Batal' | 'Rejected'

export interface ReconRecord {
  ref: string
  date: string
  /** Customer on the output side, vendor on the input side. */
  customer?: string
  vendor?: string
  npwp: string
  dpp: number
  ppn: number
  total: number
  /**
   * Coretax approval state — DJP side only. Only an Approved faktur is matched;
   * Draft / Batal / Rejected are excluded and tagged (PRD §5.1 row 13).
   */
  approved?: boolean
  /**
   * DJP side, only when `approved` is false — the faktur's own Coretax status, so
   * the "Not approved" tag can say which (PRD §5.1 row 13).
   */
  coretaxStatus?: CoretaxNotApprovedStatus
  /** ERP side — the sales invoice was voided after the faktur was approved. */
  voided?: boolean
  /**
   * ERP side, output only — the real Sales invoice this row is (`SI…`), so the
   * row's actions can open it. Set on every "Not found in Coretax" row, which is
   * where the user goes to the invoice to raise its tax document.
   */
  salesInvoiceId?: string
  /** ERP side — a sales return linked to this invoice (US-012 / US-017). */
  returnRef?: string
  returnDate?: string
  returnTotal?: number
}

export interface ReconPair {
  id: string
  match: MatchState
  /**
   * How a matched pair came to be matched. The PRD keeps these as two statuses
   * (OD-001 §5 rows 3 and 10) because G4 has to defend them separately at a DJP
   * audit — a match a human made is evidence of a decision, one the engine made
   * is evidence of a rule. They read as one status to the user (both are simply
   * matched) so this is an attribute rather than a second `MatchState`, but it
   * is filterable and it is what the activity trail records.
   *
   * Only meaningful when `match === 'matched'`.
   */
  matchedBy?: 'auto' | 'manual'
  confidence: number
  erp: ReconRecord | null
  djp: ReconRecord | null
  reason?: string
  /** Field keys that differ between the two sides. */
  fields?: string[]
  /**
   * Duplicate reference (US-003) — the OTHER Approved faktur carrying this
   * invoice number as Referensi (typically a pengganti). With `djp` they are
   * the candidates the user picks between.
   */
  duplicates?: ReconRecord[]
  /**
   * How a manual match was made (US-014): by hand, or an Airene suggestion a
   * person confirmed. Only set on `matchedBy === 'manual'` pairs.
   */
  matchOrigin?: MatchOrigin
  /** The Airene reason the person confirmed (EN, built locally), for export and Activity. */
  aiReason?: string
}

export type MatchOrigin = 'manual' | 'ai_suggested_human_confirmed'

/** A pair carrying the side it came from — used by the cross-cut Unmatched report. */
export interface ReconIssue extends ReconPair { side: ReconSide }

// ── Match-state presentation ───────────────────────────────────────────────────
// Kept next to the data (not in the pages) so the workspace, the report table and
// the drawer can never drift apart on colour or wording.

/**
 * Colours are Pixel design-system tokens, never raw hex.
 *
 * Two deliberate constraints shaped this map:
 *   1. `MpBadge` has five types and no purple, so *status* always renders as a
 *      standard badge type. The AI identity lives on AI *affordances* (the review
 *      action, the suggestion banner, the confidence pill) via the Airene tokens —
 *      which is how Mekari brands AI everywhere else.
 *   2. Semantic tokens (`--mp-background-success`, …) are not emitted into CSS in
 *      this app, so they silently resolve to nothing. The `--mp-colors-*` palette
 *      and `--mp-airene-*` are emitted, so surfaces use those — they are the same
 *      values the semantic tokens alias in the Enterprise theme.
 */
export type MpBadgeType = 'completed' | 'information' | 'warning' | 'critical' | 'announcement'

export interface MatchMeta {
  /** Badge/table label — the short form, kept to three words at most. */
  label: string
  /** The PRD's own status name, shown in the drawer header and the row banner. */
  longLabel: string
  /** Filter-select label, where there is room for the full name. */
  chipLabel: string
  /** MpBadge `type` for status display. */
  badgeType: MpBadgeType
  /** Surface tokens for the row/connector treatment. */
  dot: string
  bg: string
  border: string
  fg: string
  icon: string
  /**
   * MpIcon `color` prop for `icon` when it sits on the filled `dot` surface.
   *
   * MpIcon writes `--mp-icon-color: var(--mp-colors-icon-default)` as an *inline
   * style on its own <svg>*, so a CSS `color` on the icon or any ancestor is
   * ignored — the icon renders grey #536062 no matter what the surface is. The
   * only way to recolor it is this prop, whose value is a dot-path into the
   * `--mp-colors-*` namespace (`icon.inverse` → `--mp-colors-icon-inverse`).
   *
   * Valid paths: icon.brand · icon.danger · icon.default · icon.disabled ·
   * icon.highlight · icon.information · icon.inverse · icon.inverse.static ·
   * icon.selected · icon.subtle · icon.success · icon.warning
   */
  iconColor: string
  /** Same, for the outline treatment (no fill — icon takes the state colour). */
  iconColorOutline: string
}

export const MATCH_META: Record<MatchState, MatchMeta> = {
  matched: {
    label: 'Reconciled', longLabel: 'Reconciled', chipLabel: 'Reconciled',
    badgeType: 'completed',
    dot: 'var(--mp-colors-emerald-700)',
    bg: 'var(--mp-colors-green-100)',
    border: 'var(--mp-colors-green-200)',
    fg: 'var(--mp-colors-emerald-800)',
    icon: 'done',
    iconColor: 'icon.inverse', iconColorOutline: 'icon.success',
  },

  // ── Pending review — a human decides, the engine will not ──────────────────
  'return-netted': {
    label: 'Return netted', longLabel: 'Pending review — return netted', chipLabel: 'Return netted',
    badgeType: 'information',
    dot: 'var(--mp-colors-blue-600)',
    bg: 'var(--mp-colors-blue-100)',
    border: 'var(--mp-colors-blue-200)',
    fg: 'var(--mp-colors-blue-800)',
    icon: 'undo',
    iconColor: 'icon.inverse', iconColorOutline: 'icon.information',
  },
  'duplicate-reference': {
    label: 'Duplicate reference', longLabel: 'Pending review — duplicate reference', chipLabel: 'Duplicate reference',
    badgeType: 'information',
    dot: 'var(--mp-colors-blue-600)',
    bg: 'var(--mp-colors-blue-100)',
    border: 'var(--mp-colors-blue-200)',
    fg: 'var(--mp-colors-blue-800)',
    icon: 'copy',
    iconColor: 'icon.inverse', iconColorOutline: 'icon.information',
  },

  // ── Not reconciled — something on one side is wrong and must be corrected ──
  'invoice-edited': {
    label: 'Invoice edited', longLabel: 'Not reconciled — invoice edited', chipLabel: 'Invoice edited',
    badgeType: 'warning',
    dot: 'var(--mp-colors-orange-600)',
    bg: 'var(--mp-colors-orange-100)',
    border: 'var(--mp-colors-orange-200)',
    fg: 'var(--mp-colors-orange-800)',
    icon: 'edit',
    iconColor: 'icon.inverse', iconColorOutline: 'icon.warning',
  },
  'invoice-voided': {
    label: 'Invoice voided', longLabel: 'Not reconciled — invoice voided', chipLabel: 'Invoice voided',
    badgeType: 'warning',
    dot: 'var(--mp-colors-orange-600)',
    bg: 'var(--mp-colors-orange-100)',
    border: 'var(--mp-colors-orange-200)',
    fg: 'var(--mp-colors-orange-800)',
    icon: 'close',
    iconColor: 'icon.inverse', iconColorOutline: 'icon.warning',
  },
  'return-not-reflected': {
    label: 'Return missing', longLabel: 'Not reconciled — return not reflected', chipLabel: 'Return not reflected',
    badgeType: 'warning',
    dot: 'var(--mp-colors-orange-600)',
    bg: 'var(--mp-colors-orange-100)',
    border: 'var(--mp-colors-orange-200)',
    fg: 'var(--mp-colors-orange-800)',
    icon: 'undo',
    iconColor: 'icon.inverse', iconColorOutline: 'icon.warning',
  },
  'faktur-predates': {
    // Badge copy stays inside the two-word limit; the drawer carries the sentence.
    label: 'Date order', longLabel: 'Not reconciled — tax document predates transaction', chipLabel: 'Tax document predates transaction',
    badgeType: 'warning',
    dot: 'var(--mp-colors-orange-600)',
    bg: 'var(--mp-colors-orange-100)',
    border: 'var(--mp-colors-orange-200)',
    fg: 'var(--mp-colors-orange-800)',
    icon: 'time',
    iconColor: 'icon.inverse', iconColorOutline: 'icon.warning',
  },
  'return-date-mismatch': {
    label: 'Date mismatch', longLabel: 'Not reconciled — return date mismatch', chipLabel: 'Return date mismatch',
    badgeType: 'warning',
    dot: 'var(--mp-colors-orange-600)',
    bg: 'var(--mp-colors-orange-100)',
    border: 'var(--mp-colors-orange-200)',
    fg: 'var(--mp-colors-orange-800)',
    icon: 'time',
    iconColor: 'icon.inverse', iconColorOutline: 'icon.warning',
  },
  'period-finalized': {
    label: 'Period finalized', longLabel: 'Not reconciled — period finalized', chipLabel: 'Period finalized',
    badgeType: 'warning',
    dot: 'var(--mp-colors-orange-600)',
    bg: 'var(--mp-colors-orange-100)',
    border: 'var(--mp-colors-orange-200)',
    fg: 'var(--mp-colors-orange-800)',
    icon: 'receipt-lock',
    iconColor: 'icon.inverse', iconColorOutline: 'icon.warning',
  },

  // ── A document is missing altogether ───────────────────────────────────────
  'not-in-coretax': {
    // Badge names the document that is absent, not the system it is absent from:
    // two words, and it pairs with 'No invoice' opposite it. The PRD's own name
    // survives in the drawer header and the status filter, where there is room.
    // Sides are Transaction / Tax document (PM, 2026-11-05) — both live in ERP, so
    // no status names Coretax or ERP. `label` is the ≤ 2-word badge/chip form
    // (full name in the badge tooltip); long/chip labels carry the full name.
    label: 'Not issued', longLabel: 'Tax document not found', chipLabel: 'Tax document not found',
    badgeType: 'critical',
    dot: 'var(--mp-colors-red-600)',
    bg: 'var(--mp-colors-red-100)',
    border: 'var(--mp-colors-red-200)',
    fg: 'var(--mp-colors-red-800)',
    icon: 'minus-circular',
    iconColor: 'icon.inverse', iconColorOutline: 'icon.danger',
  },
  // ── Row 13: excluded from matching — neutral, never a red "missing" state ──
  'not-approved': {
    label: 'Not approved', longLabel: 'Not approved', chipLabel: 'Not approved',
    badgeType: 'information',
    dot: 'var(--mp-colors-gray-600)',
    bg: 'var(--mp-colors-gray-50)',
    border: 'var(--mp-colors-gray-100)',
    fg: 'var(--mp-colors-gray-600)',
    icon: 'minus-circular',
    iconColor: 'icon.inverse', iconColorOutline: 'icon.subtle',
  },
  'no-match-in-erp': {
    label: 'Not recorded', longLabel: 'Transaction not found', chipLabel: 'Transaction not found',
    badgeType: 'critical',
    dot: 'var(--mp-colors-red-600)',
    bg: 'var(--mp-colors-red-100)',
    border: 'var(--mp-colors-red-200)',
    fg: 'var(--mp-colors-red-800)',
    icon: 'minus-circular',
    iconColor: 'icon.inverse', iconColorOutline: 'icon.danger',
  },
}

/** Per-side copy. The layout is identical; only the labels change. */
export const SIDE_LABELS: Record<ReconSide, {
  title: string
  erpHeader: string
  erpHeaderSub: string
  djpHeader: string
  djpHeaderSub: string
  erpEmptyAction: string
  djpEmptyAction: string
  /** Transitional toast for the create action — the destination isn't built yet. */
  erpEmptyToast: string
  djpEmptyToast: string
  partyLabel: string
  kpiErpDpp: string
  kpiDjpDpp: string
  kpiErpPpn: string
  kpiDjpPpn: string
}> = {
  output: {
    // English gets the standard VAT term, not the Indonesian one: the EN locale
    // already says "Tax invoice" for faktur pajak, so leaving the two sides in
    // Indonesian was the odd one out. ID keeps "Faktur keluaran/masukan".
    // "VAT Out" names the workspace (PM, 2026-11-05) — it covers other output
    // documents too, not only faktur. ID: "PPN Keluaran".
    title: 'VAT Out',
    erpHeader: 'Transactions', erpHeaderSub: '',
    djpHeader: 'Tax documents', djpHeaderSub: '',
    erpEmptyAction: 'Create sales invoice', djpEmptyAction: 'Create tax document',
    erpEmptyToast: 'Opening sales invoice…', djpEmptyToast: 'Opening tax document…',
    partyLabel: 'Customer',
    kpiErpDpp: 'Transaction DPP', kpiDjpDpp: 'Tax document DPP',
    kpiErpPpn: 'Transaction PPN', kpiDjpPpn: 'Tax document PPN',
  },
  input: {
    title: 'Input tax invoice',
    // The ERP-side document is a Purchase invoice (Purchases module), not a Bill
    // — Bills are the separate Expenses queue.
    erpHeader: 'Transactions', erpHeaderSub: '',
    djpHeader: 'Tax documents', djpHeaderSub: '',
    erpEmptyAction: 'Create purchase invoice', djpEmptyAction: 'Flag for follow-up',
    erpEmptyToast: 'Opening purchase invoice…', djpEmptyToast: 'Faktur flagged for follow-up',
    partyLabel: 'Vendor',
    kpiErpDpp: 'Transaction DPP', kpiDjpDpp: 'Tax document DPP',
    kpiErpPpn: 'Transaction PPN', kpiDjpPpn: 'Tax document PPN',
  },
}

// ── Linking "Not found in Coretax" rows to real Sales invoices ────────────────
/**
 * A sales invoice with no faktur is fixed on the invoice itself — that is where
 * "Create tax document" lives — so every output row in that state points at a
 * real invoice the user can open. The ids are named, not derived, and each one
 * can actually raise a tax document (PPN present, every product DJP-classified,
 * domestic buyer, no tax document seeded of its own); a test holds that.
 *
 * Linking takes the invoice's own number, customer and amounts, so the row and
 * the invoice it opens never disagree on what is owed.
 */
export const OUTPUT_NOT_IN_CORETAX_LINKS: Record<string, string[]> = {
  '2027-03': ['SI103', 'SI097', 'SI061', 'SI050', 'SI043', 'SI013', 'SI002'],
}

export function linkToSalesInvoice(rec: ReconRecord, salesInvoiceId: string | undefined): ReconRecord {
  const inv = salesInvoiceId ? salesInvoices.find(s => s.id === salesInvoiceId) : undefined
  if (!inv) return rec
  const { totals } = getSalesInvoiceDetail(inv.id)
  return {
    ...rec,
    ref: String(inv.number),
    salesInvoiceId: inv.id,
    customer: inv.customer.name,
    dpp: totals.total - totals.taxAmount,
    ppn: totals.taxAmount,
    total: totals.total,
  }
}

/**
 * Where the invoice's own tax document stands, for a "Not found in Coretax"
 * row. Absence in Coretax has different fixes depending on how far the faktur
 * got in ERP — none yet (create one), a draft (submit or edit it), or already
 * with DJP (nothing to do but wait) — so the row says which, and offers that.
 */
export type ErpFakturState = 'none' | 'draft' | 'submitted' | 'rejected' | 'approved'

export interface ErpFaktur {
  salesInvoiceId: string
  state: ErpFakturState
  doc: TaxDocument | null
}

export function erpFakturOf(pair: ReconPair): ErpFaktur | null {
  const id = pair.erp?.salesInvoiceId
  if (pair.match !== 'not-in-coretax' || !id) return null
  const doc = currentTaxDocument(id)
  const live = doc && doc.status !== 'replaced' && doc.status !== 'cancelled' ? doc : null
  const state: ErpFakturState =
    !live ? 'none'
    : live.status === 'draft' ? 'draft'
    : live.status === 'rejected' ? 'rejected'
    : live.status === 'approved' ? 'approved'
    : 'submitted'
  return { salesInvoiceId: id, state, doc: live }
}

/** Sales invoice detail URL that opens the matching tax-document drawer on load. */
export function salesInvoiceTaxDocUrl(
  salesInvoiceId: string,
  action: 'create' | 'edit' | 'view',
  taxDocumentId?: string,
): string {
  const base = `/sales-invoices/${salesInvoiceId}`
  if (action === 'create') return `${base}?action=create-tax-document`
  if (action === 'edit' && taxDocumentId) return `${base}?action=edit-tax-document&taxDocument=${encodeURIComponent(taxDocumentId)}`
  return `${base}?tab=tax-document`
}

// ── Output side — Faktur keluaran (sales) ──────────────────────────────────────

export const outputPairs: ReconPair[] = [
  {
    // 1 — key, corroboration and direction all pass; faktur Approved.
    id: 'o-01', match: 'matched', matchedBy: 'auto', confidence: 1,
    erp: { ref: '40142', date: '02 Feb 2027', customer: 'PT Telkom Indonesia Tbk', npwp: '0010000131093000', dpp: 12500000, ppn: 1500000, total: 14000000 },
    djp: { ref: '27000000039847291', date: '02 Feb 2027', customer: 'PT Telkom Indonesia Tbk', npwp: '0010000131093000', dpp: 12500000, ppn: 1500000, total: 14000000, approved: true },
  },
  {
    id: 'o-02', match: 'matched', matchedBy: 'auto', confidence: 1,
    erp: { ref: '40143', date: '03 Feb 2027', customer: 'PT Bank Central Asia Tbk', npwp: '0010010641091000', dpp: 42750000, ppn: 5130000, total: 47880000 },
    djp: { ref: '27000000039847342', date: '03 Feb 2027', customer: 'PT Bank Central Asia Tbk', npwp: '0010010641091000', dpp: 42750000, ppn: 5130000, total: 47880000, approved: true },
  },
  {
    // 2 — the engine could not close it; a person did, and the log says so.
    id: 'o-03', match: 'matched', matchedBy: 'manual', confidence: 1,
    erp: { ref: '40144', date: '05 Feb 2027', customer: 'PT Astra International Tbk', npwp: '0013025845092000', dpp: 87500000, ppn: 10500000, total: 98000000 },
    djp: { ref: '27000000039847415', date: '05 Feb 2027', customer: 'PT Astra Intl. Tbk', npwp: '0013025845092000', dpp: 87500000, ppn: 10500000, total: 98000000, approved: true },
    reason: 'The reference on the tax document was typed without the SI prefix. Matched by hand after checking the amounts.',
  },
  {
    // 5 (US-010) — the invoice moved after the faktur was approved.
    id: 'o-04', match: 'invoice-edited', confidence: 0,
    erp: { ref: '40145', date: '08 Feb 2027', customer: 'PT Indofood Sukses Makmur Tbk', npwp: '0011060432092000', dpp: 24800000, ppn: 2976000, total: 27776000 },
    djp: { ref: '27000000039847488', date: '08 Feb 2027', customer: 'PT Indofood Sukses Makmur Tbk', npwp: '0011060432092000', dpp: 25300000, ppn: 3036000, total: 28336000, approved: true },
    reason: 'Sales invoice edited on 14 Feb, after the tax document was approved on 09 Feb. DPP is Rp500.000 lower than the tax document.',
    fields: ['dpp', 'ppn', 'total'],
  },
  {
    id: 'o-05', match: 'matched', matchedBy: 'auto', confidence: 1,
    erp: { ref: '40146', date: '10 Feb 2027', customer: 'PT Trinusa Travelindo', npwp: '0025278154031000', dpp: 18900000, ppn: 2268000, total: 21168000 },
    djp: { ref: '27000000039847561', date: '10 Feb 2027', customer: 'PT Trinusa Travelindo', npwp: '0025278154031000', dpp: 18900000, ppn: 2268000, total: 21168000, approved: true },
  },
  {
    // Faktur dated the day after its invoice — direction is fine, so this is a
    // clean match. The engine checks direction, not distance: there is no window.
    id: 'o-06', match: 'matched', matchedBy: 'auto', confidence: 1,
    erp: { ref: '40147', date: '12 Feb 2027', customer: 'PT Mitra Keluarga Karyasehat Tbk', npwp: '0010610927054000', dpp: 9800000, ppn: 1176000, total: 10976000 },
    djp: { ref: '27000000039847634', date: '13 Feb 2027', customer: 'PT Mitra Keluarga Karyasehat Tbk', npwp: '0010610927054000', dpp: 9800000, ppn: 1176000, total: 10976000, approved: true },
  },
  {
    // 3 (US-008) — invoice raised, faktur never issued.
    id: 'o-07', match: 'not-in-coretax', confidence: 0,
    erp: { ref: '40148', date: '15 Feb 2027', customer: 'PT GoTo Gojek Tokopedia Tbk', npwp: '0071058362092000', dpp: 31200000, ppn: 3744000, total: 34944000 },
    djp: null,
    reason: 'No approved tax document carries this invoice number as its reference.',
  },
  {
    id: 'o-08', match: 'matched', matchedBy: 'auto', confidence: 1,
    erp: { ref: '40149', date: '18 Feb 2027', customer: 'PT Trans Retail Indonesia', npwp: '0022187064046000', dpp: 56400000, ppn: 6768000, total: 63168000 },
    djp: { ref: '27000000039847707', date: '18 Feb 2027', customer: 'PT Trans Retail Indonesia', npwp: '0022187064046000', dpp: 56400000, ppn: 6768000, total: 63168000, approved: true },
  },
  {
    // 4 (US-009) — faktur approved against an invoice that was never posted.
    id: 'o-09', match: 'no-match-in-erp', confidence: 0,
    erp: null,
    djp: { ref: '27000000039847780', date: '20 Feb 2027', customer: 'CV Sinar Jaya Abadi', npwp: '0028345127027000', dpp: 4200000, ppn: 504000, total: 4704000, approved: true },
    reason: 'No transaction in Jurnal carries the reference on this tax document.',
  },
  {
    // 6 (US-011) — invoice cancelled, faktur still live at DJP.
    id: 'o-10', match: 'invoice-voided', confidence: 0,
    erp: { ref: '40150', date: '22 Feb 2027', customer: 'PT Bumi Berkah Boga', npwp: '0034289175031000', dpp: 6125000, ppn: 735000, total: 6860000, voided: true },
    djp: { ref: '27000000039847853', date: '22 Feb 2027', customer: 'PT Bumi Berkah Boga', npwp: '0034289175031000', dpp: 6125000, ppn: 735000, total: 6860000, approved: true },
    reason: 'Sales invoice was voided on 25 Feb. The tax document is still approved and must be cancelled.',
  },
  {
    id: 'o-11', match: 'matched', matchedBy: 'auto', confidence: 1,
    erp: { ref: '40151', date: '25 Feb 2027', customer: 'PT Hungry Birds Indonesia', npwp: '0078123940058000', dpp: 3500000, ppn: 420000, total: 3920000 },
    djp: { ref: '27000000039847926', date: '25 Feb 2027', customer: 'PT Hungry Birds Indonesia', npwp: '0078123940058000', dpp: 3500000, ppn: 420000, total: 3920000, approved: true },
  },
  {
    // 7 (US-012) — return booked in Jurnal after the faktur; buyer has not sent
    // a nota retur and no pengganti was issued. The common return path.
    id: 'o-12', match: 'return-not-reflected', confidence: 0,
    erp: { ref: '40152', date: '26 Feb 2027', customer: 'PT Maju Sejahtera Abadi', npwp: '0017763285013000', dpp: 8400000, ppn: 1008000, total: 9408000, returnRef: 'SR-2027-014', returnDate: '28 Feb 2027', returnTotal: 2352000 },
    djp: { ref: '27000000039847999', date: '27 Feb 2027', customer: 'PT Maju Sejahtera Abadi', npwp: '0017763285013000', dpp: 8400000, ppn: 1008000, total: 9408000, approved: true },
    reason: 'Sales return SR-2027-014 (Rp2.352.000) booked on 28 Feb, after the tax document. No nota retur from the buyer and no faktur pengganti.',
  },
  {
    // 9 — every field agrees, but the faktur predates its invoice, which is
    // impossible. This is what the removed ±3-day window used to swallow.
    id: 'o-13', match: 'faktur-predates', confidence: 0,
    erp: { ref: '40153', date: '28 Feb 2027', customer: 'PT Sumber Alfaria Trijaya Tbk', npwp: '0010914763092000', dpp: 15600000, ppn: 1872000, total: 17472000 },
    djp: { ref: '27000000039848072', date: '26 Feb 2027', customer: 'PT Sumber Alfaria Trijaya Tbk', npwp: '0010914763092000', dpp: 15600000, ppn: 1872000, total: 17472000, approved: true },
    reason: 'The tax document is dated 26 Feb, two days before its transaction. Correct the date on one side.',
    fields: ['date'],
  },
  {
    // 11 (US-003) — original plus pengganti both carry the same Referensi.
    // Without OD-002 lineage the engine cannot pick, so a person does.
    id: 'o-14', match: 'duplicate-reference', confidence: 0,
    erp: { ref: '40154', date: '28 Feb 2027', customer: 'PT Erajaya Swasembada Tbk', npwp: '0018452037091000', dpp: 21000000, ppn: 2520000, total: 23520000 },
    djp: { ref: '27000000039848145', date: '28 Feb 2027', customer: 'PT Erajaya Swasembada Tbk', npwp: '0018452037091000', dpp: 21000000, ppn: 2520000, total: 23520000, approved: true },
    reason: 'Two approved faktur carry this invoice number: 27000000039848145 and its faktur pengganti 27000000039848218.',
    duplicates: [
      { ref: '27000000039848218', date: '28 Feb 2027', customer: 'PT Erajaya Swasembada Tbk', npwp: '0018452037091000', dpp: 21000000, ppn: 2520000, total: 23520000, approved: true },
    ],
  },
  {
    // 8 (US-017) — return booked *before* the faktur, and the faktur was issued
    // net of it. Legitimate, rare, and never auto-matched: a person confirms.
    id: 'o-15', match: 'return-netted', confidence: 0,
    erp: { ref: '40155', date: '20 Feb 2027', customer: 'PT Ace Hardware Indonesia Tbk', npwp: '0016038291074000', dpp: 30000000, ppn: 3600000, total: 33600000, returnRef: 'SR-2027-011', returnDate: '24 Feb 2027', returnTotal: 5600000 },
    djp: { ref: '27000000039848291', date: '28 Feb 2027', customer: 'PT Ace Hardware Indonesia Tbk', npwp: '0016038291074000', dpp: 25000000, ppn: 3000000, total: 28000000, approved: true },
    reason: 'Invoice Rp33.600.000 less return SR-2027-011 Rp5.600.000 equals the tax document exactly. The return predates the tax document, so a net tax document is correct.',
  },
  {
    // 13 — a Draft faktur is excluded from matching entirely and only tagged, so
    // it can never be mistaken for a missing document.
    id: 'o-16', match: 'not-approved', confidence: 0,
    erp: null,
    djp: { ref: '27000000039848364', date: '28 Feb 2027', customer: 'PT Midi Utama Indonesia Tbk', npwp: '0019274056083000', dpp: 7350000, ppn: 882000, total: 8232000, approved: false, coretaxStatus: 'Draft' },
    reason: 'This tax document is still a draft, so it is excluded from matching until it is approved.',
  },
  {
    // 4 (US-009) — the faktur for invoice 40122 (o-07, linked to SI122), but its
    // Referensi was typed as "INV-40122", so the exact key match missed it. The
    // candidate list finds it on NPWP + amount: the "Match found" case in To match.
    id: 'o-17', match: 'no-match-in-erp', confidence: 0,
    erp: null,
    djp: { ref: '27000000039848437', date: '16 Feb 2027', customer: 'Cafe Halaman Jogja', npwp: '0071058362092000', dpp: 11981982, ppn: 1318018, total: 13300000, approved: true },
    reason: 'The reference on this tax document reads "INV-40122". No transaction in Jurnal carries that number.',
  },
  {
    // 4 (US-009) — same buyer, Rp500.000 more: a near miss. Matching it needs a reason.
    id: 'o-18', match: 'no-match-in-erp', confidence: 0,
    erp: null,
    djp: { ref: '27000000039848510', date: '17 Feb 2027', customer: 'Cafe Halaman Jogja', npwp: '0071058362092000', dpp: 12428429, ppn: 1371571, total: 13800000, approved: true },
    reason: 'The reference on this tax document is blank, so no transaction matches it.',
  },
]

/**
 * o-07 is the 02/2027 "invoice raised, faktur never issued" case — the row the
 * user acts on by going to the invoice, so it has to BE one.
 */
{
  const o07 = outputPairs.find(p => p.id === 'o-07')
  if (o07?.erp) o07.erp = linkToSalesInvoice(o07.erp, 'SI122')
}

// ── Input side — Faktur masukan (purchases) ────────────────────────────────────

export const inputPairs: ReconPair[] = [
  {
    id: 'i-01', match: 'matched', matchedBy: 'auto', confidence: 1,
    erp: { ref: 'PINV-2027-018', date: '04 Feb 2027', vendor: 'PT Pertamina Patra Niaga', npwp: '0010016543058000', dpp: 14500000, ppn: 1740000, total: 16240000 },
    djp: { ref: '27000000071284091', date: '04 Feb 2027', vendor: 'PT Pertamina Patra Niaga', npwp: '0010016543058000', dpp: 14500000, ppn: 1740000, total: 16240000, approved: true },
  },
  {
    id: 'i-02', match: 'matched', matchedBy: 'auto', confidence: 1,
    erp: { ref: 'PINV-2027-019', date: '06 Feb 2027', vendor: 'PT Aneka Gas Industri', npwp: '0010724988091000', dpp: 3250000, ppn: 390000, total: 3640000 },
    djp: { ref: '27000000071284164', date: '06 Feb 2027', vendor: 'PT Aneka Gas Industri', npwp: '0010724988091000', dpp: 3250000, ppn: 390000, total: 3640000, approved: true },
  },
  {
    id: 'i-03', match: 'no-match-in-erp', confidence: 0,
    erp: null,
    djp: { ref: '27000000071284237', date: '09 Feb 2027', vendor: 'PT Mitra Logistik Cepat', npwp: '0023486712072000', dpp: 8750000, ppn: 1050000, total: 9800000, approved: true },
    reason: 'No purchase invoice is recorded for this tax document yet. Create it from the tax document.',
  },
  {
    id: 'i-04', match: 'matched', matchedBy: 'manual', confidence: 1,
    erp: { ref: 'PINV-2027-021', date: '12 Feb 2027', vendor: 'PT Sinar Sosro', npwp: '0014281035091000', dpp: 4860000, ppn: 583200, total: 5443200 },
    djp: { ref: '27000000071284310', date: '12 Feb 2027', vendor: 'PT Sinar Sosro', npwp: '0014281035091000', dpp: 4860000, ppn: 583200, total: 5443200, approved: true },
    reason: 'The purchase invoice number is not stored on the tax document. Matched by hand on amount and date.',
  },
  {
    id: 'i-05', match: 'invoice-edited', confidence: 0,
    erp: { ref: 'PINV-2027-022', date: '14 Feb 2027', vendor: 'PT Wahana Komputer', npwp: '0016732814031000', dpp: 22500000, ppn: 2475000, total: 24975000 },
    djp: { ref: '27000000071284383', date: '14 Feb 2027', vendor: 'PT Wahana Komputer', npwp: '0016732814031000', dpp: 22500000, ppn: 2700000, total: 25200000, approved: true },
    reason: 'PPN differs — the tax document shows 12% but the purchase invoice recorded 11%.',
    fields: ['ppn', 'total'],
  },
  {
    id: 'i-06', match: 'matched', matchedBy: 'auto', confidence: 1,
    erp: { ref: 'PINV-2027-024', date: '17 Feb 2027', vendor: 'PT Trans Multi Logistic', npwp: '0021068479064000', dpp: 1875000, ppn: 225000, total: 2100000 },
    djp: { ref: '27000000071284456', date: '17 Feb 2027', vendor: 'PT Trans Multi Logistic', npwp: '0021068479064000', dpp: 1875000, ppn: 225000, total: 2100000, approved: true },
  },
  {
    id: 'i-07', match: 'no-match-in-erp', confidence: 0,
    erp: null,
    djp: { ref: '27000000071284529', date: '21 Feb 2027', vendor: 'CV Berkah Stationary', npwp: '0072159483052000', dpp: 980000, ppn: 117600, total: 1097600, approved: true },
    reason: 'No purchase invoice is recorded for this tax document yet.',
  },
  {
    id: 'i-08', match: 'not-in-coretax', confidence: 0,
    erp: { ref: 'PINV-2027-027', date: '24 Feb 2027', vendor: 'PT Solusi Bangun Indonesia', npwp: '0015472860091000', dpp: 11250000, ppn: 1350000, total: 12600000 },
    djp: null,
    reason: "The vendor hasn't issued a tax document for this purchase invoice.",
  },
]

// ── Candidates, comparison and grouping (workspace rows + detail drawer) ──────

export interface MatchCandidate {
  ref: string
  date: string
  party: string
  dpp: number
  ppn: number
  total: number
  confidence: number
  why: string
  /** The open pair this record comes from (its counterpart row), when there is one.
   *  Confirming the match consumes that row, so it never shows twice. */
  pairId?: string
  /**
   * Duplicate reference (US-003 AC-02) — the latest faktur in the pengganti chain,
   * which is the one a person most likely wants. A hint only: nothing is matched
   * until somebody selects a faktur.
   */
  suggested?: boolean
}

/** States where the pair is still open for a person to pick its counterpart. */
export const CANDIDATE_STATES: MatchState[] = ['not-in-coretax', 'no-match-in-erp', 'duplicate-reference']

export function hasCandidates(pair: ReconPair): boolean {
  return CANDIDATE_STATES.includes(pair.match)
}

/** A Coretax-only row whose faktur is not Approved (Draft / Batal / Rejected) — §5.1 row 13. */
export function isNotApproved(pair: ReconPair): boolean {
  return pair.match === 'not-approved' || (!pair.erp && !!pair.djp && pair.djp.approved === false)
}

/**
 * Which masa + side a pair lives in. Fixture ids are `o-`/`i-` (the live masa);
 * generated ids start with the masa id (`2027-03-output-…`); an unmatched auto
 * match splits into `<id>~erp` / `<id>~djp`, which keep their parent's prefix.
 */
export function pairLocation(pair: ReconPair): { periodId: string; side: ReconSide } {
  const m = /^(\d{4}-\d{2})-(output|input)-/.exec(pair.id)
  if (m) return { periodId: m[1]!, side: m[2] as ReconSide }
  return { periodId: activePeriodId, side: pair.id.startsWith('i-') ? 'input' : 'output' }
}

/**
 * Counterparts for an open pair — **only records that exist**: the opposite
 * side's own open rows in the same masa (a Coretax-only faktur for an ERP-only
 * invoice, and the reverse). A masa whose faktur have not synced therefore
 * offers nothing, which is the truth. Ranked: same NPWP and amount (the Referensi
 * was typed differently), then same NPWP, then same amount. No invented rows.
 */
export function candidatesFor(pair: ReconPair): MatchCandidate[] {
  if (!hasCandidates(pair)) return []
  // Draft / awaiting DJP / rejected: the transaction HAS a tax document — the fix
  // is on that one (TaxDocActions), so no counterpart is proposed.
  const sub = taxDocSubState(pair)
  if (sub && sub !== 'none') return []
  // Duplicate reference: the invoice is known — the choice is which of the
  // Approved faktur carrying its number is the live one (US-003 AC-01).
  if (pair.match === 'duplicate-reference') {
    const fakturs = [pair.djp, ...(pair.duplicates ?? [])].filter((r): r is ReconRecord => !!r)
    // The chain is listed original first, each pengganti after the one it
    // replaces, so the last entry is the latest — the Suggested one.
    return fakturs.map((f, i) => ({
      ref: f.ref, date: f.date, party: partyOf(f), dpp: f.dpp, ppn: f.ppn, total: f.total,
      confidence: 1,
      why: i === 0 ? 'Original faktur.' : 'Pengganti — also references this invoice.',
      ...(fakturs.length > 1 && i === fakturs.length - 1 ? { suggested: true } : {}),
    }))
  }
  const base = pair.erp ?? pair.djp
  if (!base) return []
  // A Draft / Batal / Rejected faktur is excluded from matching — no candidate
  // is offered for it, auto or manual, until it is Approved (§5.1 row 13).
  if (isNotApproved(pair)) return []
  const lookingForFaktur = !!pair.erp && !pair.djp
  const { periodId, side } = pairLocation(pair)
  const pool = pairsForPeriod(periodId, side).filter(p => p.id !== pair.id && (lookingForFaktur
    // Only an Approved faktur can be matched (§5.1 row 13).
    ? p.match === 'no-match-in-erp' && !!p.djp?.approved
    : p.match === 'not-in-coretax' && !!p.erp))
  const out: MatchCandidate[] = []
  for (const p of pool) {
    const r = (lookingForFaktur ? p.djp : p.erp)!
    const sameNpwp = r.npwp === base.npwp
    const sameTotal = r.total === base.total
    if (!sameNpwp && !sameTotal) continue
    const gap = Math.abs(r.total - base.total)
    out.push({
      ref: r.ref, date: r.date, party: partyOf(r), dpp: r.dpp, ppn: r.ppn, total: r.total,
      pairId: p.id,
      confidence: sameNpwp && sameTotal ? 1 : sameNpwp ? 0.6 : 0.4,
      why: sameNpwp && sameTotal ? 'NPWP and amounts match. Referensi differs.'
        : sameNpwp ? `NPWP matches. Total differs by ${formatIDR(gap)}.`
        : 'Amounts match. NPWP differs.',
    })
  }
  return out.sort((x, y) => y.confidence - x.confidence)
}

// ── Workspace tabs (bank-reconciliation layout) ───────────────────────────────
/**
 * The workspace splits the masa by the job, like Jurnal's bank Reconciliations:
 *   To match       — a person pairs or confirms (missing counterpart, duplicate
 *                    reference, return netted) — the bank-style matching rows
 *   Not reconciled — a root cause to fix on a document (edited, voided, returns,
 *                    dates, finalized period) — a table
 *   Matched        — reconciled, auto or manual — a table
 */
export type WorkspaceTab = 'To match' | 'Not reconciled' | 'Matched'
export const WORKSPACE_TABS: WorkspaceTab[] = ['To match', 'Not reconciled', 'Matched']
export const TO_MATCH_STATES: MatchState[] = ['not-in-coretax', 'no-match-in-erp', 'duplicate-reference', 'return-netted', 'not-approved']

export function workspaceTabOf(pair: ReconPair): WorkspaceTab {
  if (pair.match === 'matched') return 'Matched'
  return TO_MATCH_STATES.includes(pair.match) ? 'To match' : 'Not reconciled'
}

/**
 * Coretax-only rows that are already some invoice's best suggestion. To match
 * shows that pairing once — on the invoice's row, like a bank statement line and
 * its matched transaction — so these rows fold into it instead of repeating it.
 */
export function absorbedPairIds(pairs: ReconPair[]): Set<string> {
  const out = new Set<string>()
  for (const p of pairs) {
    if (p.match !== 'not-in-coretax') continue
    // With Airene on, an invoice with no tax document of its own gets Airene's
    // suggestions on expand instead of the heuristic, so nothing is folded into it.
    if (AIRENE_SUGGEST_ENABLED && taxDocSubState(p) === 'none') continue
    // Draft / awaiting DJP / rejected are fixed on their own tax document — never folded.
    if (taxDocSubState(p) !== 'none') continue
    const top = candidatesFor(p)[0]
    if (top?.pairId) out.add(top.pairId)
  }
  return out
}

/** The rows a tab lists (To match without the absorbed Coretax-only rows). */
export function workspaceTabRows(pairs: ReconPair[], tab: WorkspaceTab): ReconPair[] {
  const absorbed = tab === 'To match' ? absorbedPairIds(pairs) : new Set<string>()
  return pairs.filter(p => workspaceTabOf(p) === tab && !absorbed.has(p.id))
}

export function workspaceTabCounts(pairs: ReconPair[]): Record<WorkspaceTab, number> {
  return {
    'To match': workspaceTabRows(pairs, 'To match').length,
    'Not reconciled': workspaceTabRows(pairs, 'Not reconciled').length,
    'Matched': workspaceTabRows(pairs, 'Matched').length,
  }
}

/** Fields compared side by side, in reading order. */
export interface CompareField { key: keyof ReconRecord; label: string; money?: boolean }

/**
 * No NPWP: the reconciliation API never sends the buyer's NPWP/NIK (VR-4), so the
 * row detail and the drawer can't show it. The fixtures keep `npwp` only because
 * candidate ranking stands in for the engine's own corroboration.
 */
export function compareFields(side: ReconSide): CompareField[] {
  return [
    { key: 'ref', label: 'Number' },
    { key: 'date', label: 'Date' },
    side === 'input' ? { key: 'vendor', label: 'Vendor' } : { key: 'customer', label: 'Customer' },
    { key: 'dpp', label: 'DPP', money: true },
    { key: 'ppn', label: 'PPN', money: true },
    { key: 'total', label: 'Total', money: true },
  ]
}

/** A field is shown as differing only when it is flagged AND the sides disagree. */
export function isFieldDiff(pair: ReconPair, key: string): boolean {
  if (!(pair.fields ?? []).includes(key)) return false
  return pair.erp?.[key as keyof ReconRecord] !== pair.djp?.[key as keyof ReconRecord]
}

/** One line on where the invoice's own tax document stands (erpFakturOf). */
export const ERP_FAKTUR_HINTS: Record<ErpFakturState, string> = {
  none: 'No tax document yet. Create one on the sales invoice, then submit it to DJP.',
  draft: 'A draft tax document exists but has not been submitted to DJP.',
  submitted: 'Submitted to DJP, waiting for approval.',
  rejected: 'Rejected by DJP. Fix it on the sales invoice and resubmit.',
  approved: 'Approved. Sync with Klikpajak to match it.',
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

/** '05 Mar 2027' → epoch ms (UTC midnight). Unparseable → 0, so it sorts last. */
export function reconDateValue(d: string): number {
  const [dd, mon, yyyy] = (d ?? '').split(' ')
  const m = MONTHS.indexOf(mon ?? '')
  if (m < 0) return 0
  return Date.UTC(Number(yyyy), m, Number(dd))
}

/** The date a row sits under — the invoice's, or the faktur's when there is no invoice. */
export function pairDate(pair: ReconPair): string {
  return pair.erp?.date ?? pair.djp?.date ?? ''
}

export interface ReconDateGroup { key: string; label: string; pairs: ReconPair[] }

/**
 * Rows grouped by date, newest date first — the bank-reconciliation reading
 * order. Within a date the incoming order is kept, so a work queue still leads
 * with the biggest exposure.
 */
export function groupPairsByDate(pairs: ReconPair[]): ReconDateGroup[] {
  const byKey = new Map<string, ReconDateGroup>()
  for (const p of pairs) {
    const date = pairDate(p)
    const key = String(reconDateValue(date))
    if (!byKey.has(key)) {
      const v = reconDateValue(date)
      const label = v
        ? new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
            .format(new Date(v)).replace(/^(\w+)/, '$1,').replace(',,', ',')
        : date
      byKey.set(key, { key, label, pairs: [] })
    }
    byKey.get(key)!.pairs.push(p)
  }
  return [...byKey.values()].sort((a, b) => Number(b.key) - Number(a.key))
}

// ── Periods — the multi-period index ─────────────────────────────────────────

/**
 * The prototype's "today" — the fixtures are pinned to masa 04/2026, so any date
 * logic here works off this rather than `new Date()`, which would drift.
 */
export const TODAY_ISO = '2027-03-18'

/** Timestamp of the last Coretax pull, shown in the workspace footer. */
export const lastSyncedAt = '18 Mar 2027, 14:32'

/** Date part of `lastSyncedAt` — when automatic matching last ran. */
export const AUTO_SYNC_DATE = '2027-03-18'

/**
 * Reconciliation state of one masa+side (PRD OD-001 v1.0 §5.2).
 *
 *   not reconciled       Belum direkonsiliasi    — nothing matched
 *   partially reconciled Terekonsiliasi sebagian — some matched, some left
 *   reconciled           Selesai rekonsiliasi    — every pair matched
 *   finalized            Difinalisasi            — reconciled, then signed off
 *
 * The first three are derived from the pairs and never stored. `finalized` is
 * the one that *is* stored: it records a decision somebody made, which is the
 * whole point of it — it is the record of what was reconciled and by whom.
 */
export type ReconPeriodStatus =
  'not reconciled' | 'partially reconciled' | 'reconciled' | 'finalized'

/** Totals and record count for one column of one masa+side. */
interface ReconColumnSeed { amount: number; count: number }

interface ReconSideSeed {
  /** ERP side — sales invoices (keluaran) or purchase invoices (masukan). */
  erp: ReconColumnSeed
  /** Coretax side — faktur pajak. */
  djp: ReconColumnSeed
  /** Pairs matched, of `total` in play. Not shown in the table; drives status. */
  matched: number
  total: number
}

interface ReconPeriodSeed {
  /** Sort/route key — 'YYYY-MM'. */
  id: string
  /** Display form, e.g. '04/2026'. */
  masa: string
  /** When the reconciliation was last run (ISO). Absent = never run. */
  reconciledAt?: string
  /** `'live'` resolves from the pair fixtures above, so the active masa can never
   *  disagree with the workspace it links to. */
  sides: { output: ReconSideSeed; input: ReconSideSeed } | 'live'
}

/**
 * Six masa, newest first, covering all three states:
 *
 *   05/2026  not reconciled        faktur pulled from Coretax, recon not run yet
 *   04/2026  partially reconciled  the live one; derived from the pair fixtures
 *   03/2026 – 12/2025  reconciled  the closed tail (both columns agree, so one
 *                                  figure describes them — selisih is 0 by
 *                                  definition once every pair is matched)
 */
const PERIOD_SEEDS: ReconPeriodSeed[] = [
  {
    // The masa in progress. Invoices are booked in Jurnal, but Coretax has no
    // approved faktur for it yet, so automatic matching finds nothing to pair —
    // which is exactly the "Not reconciled" case in §5.2, without anybody having
    // to not-press a button.
    id: '2027-03', masa: '03/2027',
    sides: {
      output: { erp: { amount: 89_100_000, count: 7 }, djp: { amount: 0, count: 0 }, matched: 0, total: 7 },
      input:  { erp: { amount: 47_850_000, count: 7 },  djp: { amount: 0, count: 0 }, matched: 0, total: 7 },
    },
  },
  { id: '2027-02', masa: '02/2027', reconciledAt: '2027-03-18', sides: 'live' },
  {
    id: '2027-01', masa: '01/2027', reconciledAt: '2027-02-15',
    sides: {
      output: { erp: { amount: 512_750_000, count: 14 }, djp: { amount: 512_750_000, count: 14 }, matched: 14, total: 14 },
      input:  { erp: { amount: 128_400_000, count: 11 }, djp: { amount: 128_400_000, count: 11 }, matched: 11, total: 11 },
    },
  },
  {
    id: '2026-12', masa: '12/2026', reconciledAt: '2027-01-18',
    sides: {
      output: { erp: { amount: 448_900_000, count: 12 }, djp: { amount: 448_900_000, count: 12 }, matched: 12, total: 12 },
      input:  { erp: { amount: 96_750_000, count: 9 },   djp: { amount: 96_750_000, count: 9 },   matched: 9,  total: 9 },
    },
  },
  {
    id: '2026-11', masa: '11/2026', reconciledAt: '2026-12-16',
    sides: {
      output: { erp: { amount: 376_200_000, count: 10 }, djp: { amount: 376_200_000, count: 10 }, matched: 10, total: 10 },
      input:  { erp: { amount: 84_300_000, count: 8 },   djp: { amount: 84_300_000, count: 8 },   matched: 8,  total: 8 },
    },
  },
  {
    // The first masa the feature covers. Nothing earlier is offered.
    id: '2026-10', masa: '10/2026', reconciledAt: '2026-11-20',
    sides: {
      output: { erp: { amount: 604_850_000, count: 16 }, djp: { amount: 604_850_000, count: 16 }, matched: 16, total: 16 },
      input:  { erp: { amount: 142_600_000, count: 12 }, djp: { amount: 142_600_000, count: 12 }, matched: 12, total: 12 },
    },
  },
]

/**
 * The first masa pajak the feature covers. Fixed in production (PRD US-016);
 * nothing before it is offered, because the ERP surface starts here.
 */
export const FIRST_PERIOD_ID = '2026-10'

// ── Setup — which accounts hold PPN (US-016) ──────────────────────────────────
/**
 * Reconciliation pulls the ERP side by **account**: every transaction that posts
 * to the accounts chosen here — sales invoices, journal entries, bank deposits —
 * is in scope. The user picks them by hand rather than the system guessing from
 * tax codes, because every company names and numbers its PPN accounts
 * differently; a guessed account that is wrong pulls the wrong transactions.
 *
 * Setup is mandatory on first visit — the index stays out of reach until it is
 * saved, because an index built from the wrong accounts is worse than no index.
 *
 * A period that has been reconciled keeps a **snapshot** of the accounts used at
 * its last run, so changing setup later never silently rewrites history; re-run
 * warns that it will use the current selection instead.
 */

/**
 * Which taxes this company reconciles here.
 *
 * VAT Out (sales invoice × faktur keluaran) is OD-001 and ships first. VAT In is
 * OD-008 and shares this shell, so the input side stays built — but a company
 * that has not adopted it should not be shown half a feature. Defaulting to
 * `out` means the prototype demonstrates the shipping scope, and flipping it to
 * `both` shows where OD-008 lands without a second codebase.
 *
 * VAT In is currently a non-goal: with `VAT_IN_ENABLED` off, `both` is never
 * offered, never saved and never loaded — it normalizes to `out`.
 */
export type VatReconScope = 'out' | 'both'

/** What a saved setup looks like. Absent means first run. */
export interface VatReconSetup {
  /** PPN Keluaran (VAT Out) account codes. */
  outputAccountCodes: string[]
  /** PPN Masukan (VAT In) account codes — only used when scope is `both`. */
  inputAccountCodes: string[]
  scope: VatReconScope
  savedAt: string
}

const SETUP_KEY = 'vat-recon-setup'

let setupCache: VatReconSetup | null = null
let setupLoaded = false

/**
 * Older snapshots stored `taxCodeIds` instead of accounts. They still count as
 * "set up" (the gate stays open) but carry no accounts, so the page asks the
 * user to pick them.
 */
export function normalizeSetup(raw: Partial<VatReconSetup>): VatReconSetup {
  return {
    outputAccountCodes: Array.isArray(raw.outputAccountCodes) ? raw.outputAccountCodes : [],
    inputAccountCodes: Array.isArray(raw.inputAccountCodes) ? raw.inputAccountCodes : [],
    // A stored `both` only counts while VAT In is enabled (VAT_IN_ENABLED), so
    // browser state saved before VAT In was hidden can't bring it back.
    scope: VAT_IN_ENABLED && raw.scope === 'both' ? 'both' : 'out',
    savedAt: raw.savedAt ?? new Date().toISOString(),
  }
}

export function loadVatSetup(): VatReconSetup | null {
  if (!setupLoaded) {
    const rows = loadSnapshot<Partial<VatReconSetup>>(SETUP_KEY)
    setupCache = rows && rows.length ? normalizeSetup(rows[0]!) : null
    setupLoaded = true
  }
  return setupCache
}

export function saveVatSetup(input: {
  outputAccountCodes: string[]
  inputAccountCodes?: string[]
  scope?: VatReconScope
}): VatReconSetup {
  const setup: VatReconSetup = {
    outputAccountCodes: [...input.outputAccountCodes],
    inputAccountCodes: [...(input.inputAccountCodes ?? [])],
    scope: VAT_IN_ENABLED ? (input.scope ?? 'out') : 'out',
    // The prototype's clock (TODAY_ISO), like every other stamp in the module —
    // a wall-clock 2026 date read as saved before the 2027 masa it governs.
    savedAt: reconNowIso(),
  }
  setupCache = setup
  setupLoaded = true
  saveSnapshot(SETUP_KEY, [setup])
  reconVersion.value++
  return setup
}

/**
 * The sides in scope for this company. Everything that lists or counts per side
 * reads this, so turning VAT In off removes it from the index, the filters and
 * the nav badge together rather than leaving it half-hidden.
 */
export function reconSides(): ReconSide[] {
  // VAT In is a non-goal until OD-008: off, the input side is never in scope.
  return VAT_IN_ENABLED && loadVatSetup()?.scope === 'both' ? ['output', 'input'] : ['output']
}

export function isSideInScope(side: ReconSide): boolean {
  return reconSides().includes(side)
}

/**
 * The accounts a reconciled period was run with. Real data would store this per
 * period at run time; the prototype pins the default chart's VAT accounts so the
 * "Heads up" note has something honest to compare against.
 */
export const SNAPSHOT_ACCOUNT_CODES: { output: string[]; input: string[] } = {
  output: ['2-20500'],
  input: ['1-10500'],
}

/** "(2-20500) - VAT Out" — the picker's option label, Jurnal-style. */
export function vatAccountOptionLabel(a: CoaAccount): string {
  return `(${a.code}) - ${a.name}`
}

/** Labels for saved codes, read from the live chart; unknown codes show bare. */
export function accountLabels(codes: string[]): string {
  return codes
    .map((code) => {
      const a = coaAccounts.find((x) => x.code === code)
      return a ? vatAccountOptionLabel(a) : code
    })
    .join(', ')
}

export const periodLabel = (masa: string) => `Masa pajak ${masa}`

/** The masa the pair fixtures describe — what the workspace opens on. */
export const activePeriodId = '2027-02'
export const activePeriod = periodLabel('02/2027')

/** Options for the workspace period selector, newest first. */
export const reconPeriods = PERIOD_SEEDS.map(p => periodLabel(p.masa))

/**
 * Label for a period id — `'2026-04'` → `'Masa pajak 04/2026'`. The period index
 * links to the workspace by id (`?masa=2026-04`) because the masa's own display
 * form carries a slash, which would have to be URL-encoded.
 */
export function periodLabelById(id: string): string | undefined {
  const seed = PERIOD_SEEDS.find(p => p.id === id)
  return seed && periodLabel(seed.masa)
}
/** The masa alone ("02/2027") — for a "Masa pajak:" label that's already on screen. */
export function periodMasaById(id: string): string | undefined {
  return PERIOD_SEEDS.find(p => p.id === id)?.masa
}

// ── Derivations ───────────────────────────────────────────────────────────────

// ── Pairs for the non-live masa ───────────────────────────────────────────────
/**
 * The pair fixtures above describe one masa (04/2026). Every other masa used to
 * render those same fixtures, so opening 12/2025 showed April's faktur under a
 * December header — the index row and the workspace behind it disagreed.
 *
 * Rather than hand-write five more fixture sets, the other masa are *derived
 * from their own seed*, so the workspace can never contradict the row you
 * clicked to reach it: the generated pairs sum back to exactly the seed's ERP
 * and Coretax amounts and counts, and exactly `matched` of them are matched.
 * `vat-reconciliation-periods.spec.ts` pins that invariant.
 *
 * The shape falls out of the seed with no invention:
 *   both     = min(erpCount, djpCount)  — records that exist on both sides
 *   erpOnly  = erpCount - both          — invoices with no faktur
 *   djpOnly  = djpCount - both          — faktur with no invoice
 * and the amount the one-sided records carry is exactly the gap between the two
 * columns, which is what makes a period's Difference column self-explaining.
 */
const FILLER_PARTIES: { name: string; npwp: string }[] = [
  { name: 'PT Telkom Indonesia Tbk',        npwp: '0010000131093000' },
  { name: 'PT Bank Central Asia Tbk',       npwp: '0010010641091000' },
  { name: 'PT Astra International Tbk',     npwp: '0013025845092000' },
  { name: 'PT Indofood Sukses Makmur Tbk',  npwp: '0011060432092000' },
  { name: 'PT Trinusa Travelindo',          npwp: '0025278154031000' },
  { name: 'PT Trans Retail Indonesia',      npwp: '0022187064046000' },
  { name: 'PT Solusi Bangun Indonesia',     npwp: '0015472860091000' },
  { name: 'PT Pertamina Patra Niaga',       npwp: '0010016543058000' },
  { name: 'PT Aneka Gas Industri',          npwp: '0010724988091000' },
  { name: 'PT Wahana Komputer',             npwp: '0016732814031000' },
  { name: 'CV Sinar Jaya Abadi',            npwp: '0028345127027000' },
  { name: 'PT Mitra Logistik Cepat',        npwp: '0023486712072000' },
]

/**
 * `n` amounts summing to exactly `total`, varied so the table doesn't read as a
 * column of identical numbers. Rounded to the nearest thousand; the residual
 * lands on the last row, which is what keeps the sum exact.
 */
function splitAmount(total: number, n: number, salt: number): number[] {
  if (n <= 0) return []
  const weights = Array.from({ length: n }, (_, i) => 1 + 0.35 * Math.sin(i * 1.7 + salt))
  const sum = weights.reduce((a, b) => a + b, 0)
  const out = weights.map(w => Math.round((total * w) / sum / 1000) * 1000)
  out[n - 1] = total - out.slice(0, n - 1).reduce((a, b) => a + b, 0)
  return out
}

/** Splits a gross amount into DPP + PPN at 12%, keeping the gross exact. */
function grossToLines(gross: number): { dpp: number; ppn: number; total: number } {
  const dpp = Math.round(gross / 1.12)
  return { dpp, ppn: gross - dpp, total: gross }
}

function generatePairs(seed: ReconSideSeed, side: ReconSide, period: ReconPeriodSeed): ReconPair[] {
  const both = Math.min(seed.erp.count, seed.djp.count)
  const erpOnly = seed.erp.count - both
  const djpOnly = seed.djp.count - both

  // One-sided records carry the gap between the columns, so a period's
  // Difference is always explained by the records that are missing a counterpart.
  const erpOnlyAmount = erpOnly > 0 ? Math.max(0, seed.erp.amount - seed.djp.amount) : 0
  const djpOnlyAmount = djpOnly > 0 ? Math.max(0, seed.djp.amount - seed.erp.amount) : 0

  const erpPaired = splitAmount(seed.erp.amount - erpOnlyAmount, both, 1)
  const djpPaired = splitAmount(seed.djp.amount - djpOnlyAmount, both, 1)
  const erpExtra = splitAmount(erpOnlyAmount, erpOnly, 5)
  const djpExtra = splitAmount(djpOnlyAmount, djpOnly, 9)

  const [year, month] = period.id.split('-') as [string, string]
  const monthName = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(month) - 1]
  const dateAt = (i: number) => `${String((i * 2) % 27 + 1).padStart(2, '0')} ${monthName} ${year}`
  const partyAt = (i: number) => FILLER_PARTIES[(i + Number(month)) % FILLER_PARTIES.length]!
  const partyField = (i: number) =>
    side === 'output' ? { customer: partyAt(i).name } : { vendor: partyAt(i).name }

  // Sales invoices are plain numbers (salesInvoices.ts), purchase invoices are
  // PINV-YYYY-NNN (purchaseInvoices.ts) — the same identifiers the rest of the
  // app uses, because the match key *is* the commercial invoice number.
  // Output refs start at 41000 so a fixture number can never collide with a
  // real Sales invoice (40001–40150) — the rows that ARE real are linked
  // explicitly (linkToSalesInvoice), the rest must not look like they are.
  const erpRef = (i: number) => side === 'output'
    ? String(41000 + Number(month) * 60 + i)
    : `PINV-${year}-${String(Number(month) * 5 + i).padStart(3, '0')}`
  // Coretax nomor faktur pajak: 17 digits, numeric only. YY + MM + a 13-digit
  // serial, so the generated numbers are the right shape as well as unique.
  const djpRef = (i: number) =>
    `${year.slice(2)}${String(Number(month)).padStart(2, '0')}${String(1000000 + i * 73).padStart(13, '0')}`

  const record = (i: number, gross: number, isDjp: boolean): ReconRecord => ({
    ref: isDjp ? djpRef(i) : erpRef(i),
    date: dateAt(i),
    ...partyField(i),
    npwp: partyAt(i).npwp,
    ...grossToLines(gross),
    ...(isDjp ? { approved: true } : {}),
  })

  const pairs: ReconPair[] = []
  for (let i = 0; i < both; i++) {
    const agrees = erpPaired[i] === djpPaired[i]
    // Matched first, so `matched` of the two-sided pairs are clean. A remaining
    // pair whose two sides disagree on amount is an edited invoice (§5.1 row 5) —
    // the only condition a generated pair can demonstrate, since the rest depend
    // on facts (a void, a return, a duplicate reference) the seed doesn't carry.
    const match: MatchState = i < seed.matched || agrees ? 'matched' : 'invoice-edited'
    pairs.push({
      id: `${period.id}-${side}-${String(i + 1).padStart(2, '0')}`,
      match,
      // Every fourth clean match is recorded as one a person made, so a closed
      // masa shows the mix an audit would actually see rather than a wall of
      // engine matches.
      ...(match === 'matched' ? { matchedBy: (i % 4 === 3 ? 'manual' : 'auto') as 'auto' | 'manual' } : {}),
      confidence: match === 'matched' ? 1 : 0,
      erp: record(i, erpPaired[i]!, false),
      djp: record(i, djpPaired[i]!, true),
      ...(match === 'invoice-edited'
        ? { reason: 'Amounts differ between the transaction and the tax document.', fields: ['dpp', 'ppn', 'total'] }
        : {}),
    })
  }
  for (let i = 0; i < erpOnly; i++) {
    pairs.push({
      id: `${period.id}-${side}-e${i + 1}`,
      match: 'not-in-coretax', confidence: 0,
      erp: side === 'output'
        ? linkToSalesInvoice(record(both + i, erpExtra[i]!, false), OUTPUT_NOT_IN_CORETAX_LINKS[period.id]?.[i])
        : record(both + i, erpExtra[i]!, false),
      djp: null,
      reason: side === 'output'
        ? 'No tax document matches this transaction.'
        : "The vendor hasn't issued a tax document for this purchase invoice.",
    })
  }
  for (let i = 0; i < djpOnly; i++) {
    pairs.push({
      id: `${period.id}-${side}-d${i + 1}`,
      match: 'no-match-in-erp', confidence: 0,
      erp: null,
      djp: record(both + erpOnly + i, djpExtra[i]!, true),
      reason: side === 'output'
        ? 'No transaction matches this tax document.'
        : 'No purchase invoice is recorded for this tax document yet.',
    })
  }
  return pairs
}

// ── Manual matches (US-002 AC-02) ─────────────────────────────────────────────
/**
 * A match a person confirmed. Stored as an overlay on the engine's pairs rather
 * than by rewriting them, so Unmatch is exact (drop the overlay, the engine's
 * own status comes back) and the record of who matched what, when and — for a
 * match with a difference — why, survives a refresh (goal G4: an audit has to
 * tell a decision from a rule).
 */
const MANUAL_MATCH_KEY = 'vat-recon-manual-matches'

export interface ManualMatch {
  pairId: string
  periodId: string
  side: ReconSide
  candidate: MatchCandidate
  /** Anchor total − candidate total. Non-zero means the user confirmed a difference. */
  difference: number
  /**
   * Legacy only — matches saved before VR-6 carried a free-text reason. The BE
   * stores no reason on a manual match; reasons are Remarks (US-013) now.
   */
  reason?: string
  /** `ai_suggested_human_confirmed` when the person confirmed an Airene suggestion. */
  origin?: MatchOrigin
  aiReasonCode?: string
  aiReason?: string
  by: string
  at: string
}

let manualMatches: ManualMatch[] = loadSnapshot<ManualMatch>(MANUAL_MATCH_KEY) ?? []

/**
 * "Now" on the prototype's clock: TODAY_ISO's date with the wall-clock time, so
 * a stamp never reads as months before the masa it belongs to.
 */
export function reconNowIso(): string {
  const d = new Date()
  return `${TODAY_ISO}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`
}

export function manualMatchOf(pairId: string): ManualMatch | undefined {
  void reconVersion.value
  return manualMatches.find(m => m.pairId === pairId)
}

/**
 * A pair whose two sides are both present (return netted, duplicate reference)
 * is confirmed against its own faktur — the candidate is the Coretax side.
 */
export function ownFakturCandidate(pair: ReconPair): MatchCandidate | null {
  if (!pair.djp) return null
  return {
    ref: pair.djp.ref, date: pair.djp.date, party: partyOf(pair.djp),
    dpp: pair.djp.dpp, ppn: pair.djp.ppn, total: pair.djp.total, confidence: 1,
    why: 'The tax document already paired with this transaction.',
  }
}

/** For a netted return the faktur is issued for invoice − return (US-017). */
export function nettedAnchor(pair: ReconPair): number {
  return (pair.erp?.total ?? 0) - (pair.erp?.returnTotal ?? 0)
}

/**
 * Record a manual match. A match whose sides differ is still never one click —
 * the UI confirms the difference first (VatReconciliationMatchConfirmModal) — but
 * there is no free-text reason any more: the BE stores none on a manual match
 * (VR-6). Why a row is the way it is goes in its Remarks (US-013).
 */
export function confirmManualMatch(input: {
  pair: ReconPair
  periodId: string
  side: ReconSide
  candidate: MatchCandidate
  /** What the candidate must equal. Defaults to the row's own total; a netted
   *  return passes invoice − return, which is what its faktur was issued for. */
  anchorTotal?: number
  /** Airene (US-014): the person confirmed a suggestion — recorded as its origin. */
  origin?: MatchOrigin
  aiReasonCode?: string
  aiReason?: string
}): boolean {
  const anchor = input.anchorTotal ?? (input.pair.erp ?? input.pair.djp)?.total ?? 0
  const difference = anchor - input.candidate.total
  manualMatches = manualMatches.filter(m => m.pairId !== input.pair.id)
  manualMatches.push({
    pairId: input.pair.id, periodId: input.periodId, side: input.side,
    candidate: input.candidate, difference,
    ...(input.origin === 'ai_suggested_human_confirmed'
      ? { origin: input.origin, aiReasonCode: input.aiReasonCode, aiReason: input.aiReason }
      : { origin: 'manual' as const }),
    by: CURRENT_USER, at: reconNowIso(),
  })
  saveSnapshot(MANUAL_MATCH_KEY, manualMatches)
  reconVersion.value++
  return true
}

/** Unmatch a manual match: the engine's own status comes back. */
export function undoManualMatch(pairId: string): boolean {
  const before = manualMatches.length
  manualMatches = manualMatches.filter(m => m.pairId !== pairId)
  if (manualMatches.length === before) return false
  saveSnapshot(MANUAL_MATCH_KEY, manualMatches)
  reconVersion.value++
  return true
}

/** The counterpart a candidate stands for, as a record on the missing side. */
function candidateRecord(c: MatchCandidate, like: ReconRecord, isDjp: boolean, side: ReconSide): ReconRecord {
  return {
    ref: c.ref, date: c.date,
    ...(side === 'input' ? { vendor: c.party } : { customer: c.party }),
    npwp: like.npwp, dpp: c.dpp, ppn: c.ppn, total: c.total,
    ...(isDjp ? { approved: true } : {}),
  }
}

function applyManualMatch(p: ReconPair, m: ManualMatch): ReconPair {
  const erp = p.erp ?? (p.djp ? candidateRecord(m.candidate, p.djp, false, m.side) : null)
  // A duplicate reference is settled by WHICH faktur was picked — keep that one.
  const picked = p.match === 'duplicate-reference'
    ? [p.djp, ...(p.duplicates ?? [])].find(r => r?.ref === m.candidate.ref) ?? null
    : null
  const djp = picked ?? p.djp ?? (p.erp ? candidateRecord(m.candidate, p.erp, true, m.side) : null)
  return {
    ...p, erp, djp,
    match: 'matched', matchedBy: 'manual', confidence: 1,
    matchOrigin: m.origin ?? 'manual',
    ...(m.aiReason ? { aiReason: m.aiReason } : {}),
    fields: m.difference !== 0 ? ['dpp', 'ppn', 'total'] : [],
    // `m.reason` survives only on matches saved before VR-6 dropped the field.
    reason: m.reason
      ? `Matched by hand with a difference of ${formatIDR(Math.abs(m.difference))}. Reason: ${m.reason}`
      : m.difference !== 0
        ? `Matched by hand with a difference of ${formatIDR(Math.abs(m.difference))}.`
        : 'Matched by hand.',
  }
}

// ── Activity (audit trail, goal G4) ───────────────────────────────────────────
/**
 * One line of a pair's history. `label` (and `status`) are copy keys the UI
 * passes through t(); `detail` is data — a number, an amount, the user's own
 * reason — and is shown as-is.
 */
export interface ActivityEntry {
  icon: string
  label: string
  status?: string
  detail?: string
  who: string
  time: string
}

function fmtStamp(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(d.getTime())) return iso
  const date = `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
  return iso.length === 10 ? date : `${date}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * What happened to a pair, newest first — from the records this module actually
 * keeps, never invented: the manual match and its reason, the waiting-on-buyer
 * mark, the invoice's tax document, the engine's verdict and the Coretax sync.
 */
export function pairActivity(pair: ReconPair, periodId: string): ActivityEntry[] {
  void reconVersion.value
  const out: { at: string; e: ActivityEntry }[] = []
  const m = manualMatchOf(pair.id)
  if (m) {
    const diff = m.difference !== 0 ? ` · ${formatIDR(Math.abs(m.difference))}` : ''
    out.push({ at: m.at, e: {
      icon: 'link',
      label: m.origin === 'ai_suggested_human_confirmed' ? 'Matched with Airene suggestion'
        : m.difference !== 0 ? 'Matched manually with a difference' : 'Matched manually',
      detail: `${m.candidate.ref}${diff}${m.reason ? ` — “${m.reason}”` : ''}${m.aiReason ? ` — ${m.aiReason}` : ''}`,
      who: m.by, time: fmtStamp(m.at),
    } })
  }
  const r = remarkOf(pair)
  if (r) {
    out.push({ at: r.at, e: {
      icon: 'comment', label: 'Remark added', status: r.reason,
      ...(r.text ? { detail: r.text } : {}),
      who: r.by, time: fmtStamp(r.at),
    } })
  }
  const w = waitingOnBuyerMark(pair)
  if (w && canWaitOnBuyer(pair)) {
    out.push({ at: w.at, e: { icon: 'time', label: 'Marked as waiting on buyer', who: w.by, time: fmtStamp(w.at) } })
  }
  const f = erpFakturOf(pair)
  if (f?.doc) {
    const [dd, mm, yy] = f.doc.date.split('/')
    const iso = `${yy}-${mm}-${dd}`
    out.push({ at: iso, e: {
      icon: 'doc', label: 'Tax document', status: DJP_STATUS_CONFIG[f.doc.status].label,
      who: 'Sales invoice', time: fmtStamp(iso),
    } })
  }
  // The engine's verdict and the sync are the baseline every user action builds
  // on, so they always sit at the bottom — a prototype stamp (wall-clock time on
  // the pinned TODAY) can't be trusted to order them against a 14:32 run.
  const ran = `${periodRanAt(periodId) ?? AUTO_SYNC_DATE}T14:32:00`
  const autoMatched = pair.match === 'matched' && pair.matchedBy !== 'manual' && !m
  const baseline: ActivityEntry[] = [
    {
      icon: 'magic',
      label: autoMatched ? 'Auto-matched on NPWP, DPP, PPN and date' : 'Flagged for review by matching engine',
      who: 'Reconciliation engine', time: fmtStamp(ran),
    },
    { icon: 'refresh', label: 'Tax documents synced', who: 'System', time: lastSyncedAt },
  ]
  return [...out.sort((a, b) => b.at.localeCompare(a.at)).map(x => x.e), ...baseline]
}

// ── Waiting on buyer (US-012 AC-02) ───────────────────────────────────────────
/**
 * A "return not reflected" row can be parked on the buyer: the seller has
 * nothing to issue until the buyer's nota retur arrives. It's a TOGGLE the user
 * sets per row — not a status, and not every row in that state — so the row
 * keeps its status and only the rows actually toggled leave the "need review"
 * count. Persisted with who toggled it and when, so it survives a refresh and
 * the trail can say who parked it.
 */
const WAITING_KEY = 'vat-recon-waiting-on-buyer'
interface WaitingMark { pairId: string; by: string; at: string }

let waitingMarks: WaitingMark[] = loadSnapshot<WaitingMark>(WAITING_KEY) ?? []

/** Only a "return not reflected" row can wait on the buyer. */
export function canWaitOnBuyer(pair: ReconPair): boolean {
  return pair.match === 'return-not-reflected'
}

export function isWaitingOnBuyer(pair: ReconPair): boolean {
  void reconVersion.value
  return canWaitOnBuyer(pair) && waitingMarks.some(m => m.pairId === pair.id)
}

export function waitingOnBuyerMark(pair: ReconPair): WaitingMark | undefined {
  void reconVersion.value
  return waitingMarks.find(m => m.pairId === pair.id)
}

export function setWaitingOnBuyer(pair: ReconPair, on: boolean): void {
  if (!canWaitOnBuyer(pair)) return
  waitingMarks = waitingMarks.filter(m => m.pairId !== pair.id)
  if (on) waitingMarks.push({ pairId: pair.id, by: CURRENT_USER, at: reconNowIso() })
  saveSnapshot(WAITING_KEY, waitingMarks)
  reconVersion.value++
}

/**
 * Footer counts for a set of rows (US-020 AC-03): matched · need review ·
 * unmatched · waiting on buyer. "Unmatched" is the two states where a document
 * is missing outright; "waiting" is only the rows TOGGLED onto the buyer; need
 * review is everything else that isn't matched.
 */
export function footerCounts(pairs: ReconPair[]) {
  // A not-approved faktur (§5.1 row 13) is excluded from matching, so it is in
  // none of the four counts — not unmatched, and nothing for a person to review.
  const counted = pairs.filter(p => !isNotApproved(p))
  const matched = counted.filter(p => p.match === 'matched').length
  const unmatched = counted.filter(p => p.match === 'not-in-coretax' || p.match === 'no-match-in-erp').length
  const waiting = counted.filter(isWaitingOnBuyer).length
  return { matched, unmatched, waiting, review: counted.length - matched - unmatched - waiting }
}

// ── Running a period (US-002) ─────────────────────────────────────────────────
/**
 * Manual re-runs (US-002), on top of the automatic per-masa matching. Persisted
 * so a re-run survives a refresh, and version-stamped so the screens that read
 * pairs re-evaluate: everything here is plain functions, so without a reactive
 * signal a Vue `computed` would keep serving the previous answer and the user
 * would press Re-run and watch nothing happen.
 */
const RUNS_KEY = 'vat-recon-runs'
interface PeriodRun {
  periodId: string
  ranAt: string
  /** Full stamp on the prototype clock — the period header's Last sync. */
  at?: string
  /** PPN Keluaran accounts the run used — the period's snapshot (US-016 AC-08). */
  accountCodes?: string[]
}

export const reconVersion = ref(0)

let runs: PeriodRun[] = loadSnapshot<PeriodRun>(RUNS_KEY) ?? []

function runtimeRunAt(periodId: string): string | undefined {
  return runs.find(r => r.periodId === periodId)?.ranAt
}

/**
 * Run matching for a masa. Clears the memoised pairs so they are rebuilt against
 * the period's new state, and bumps the version every screen reads.
 */
export function runPeriod(periodId: string): void {
  // TODAY_ISO, not the wall clock: every date in this module is pinned to the
  // prototype's own "today", so a re-run must not stamp a 2026 system date onto
  // a 2027 masa and read as though it ran before the invoices existed.
  // A re-run uses the CURRENT setup, so that becomes the period's snapshot
  // (US-016 AC-07). With no setup saved, the old snapshot is kept.
  const current = currentOutputAccountCodes()
  const accountCodes = current.length ? current : periodAccountCodes(periodId)
  runs = [...runs.filter(r => r.periodId !== periodId), { periodId, ranAt: TODAY_ISO, at: reconNowIso(), accountCodes }]
  saveSnapshot(RUNS_KEY, runs)
  generatedPairs.clear()
  reconVersion.value++
}

// ── Finalize (US-021) ─────────────────────────────────────────────────────────
/**
 * Finalizing a masa is a **record, not a lock**. It says "this is what we
 * reconciled, and I signed it off" — it does not stop anyone editing the sales
 * invoices behind it in Jurnal, and it does not stop Klikpajak syncing a changed
 * faktur (R5, and consistent with how Jurnal already treats an invoice whose
 * faktur is approved). What it does stop is *this* module silently rewriting the
 * signed-off result: Re-run and Match are blocked until it is unfinalized.
 *
 * Stored per masa, not per side: keluaran and masukan are two views of one tax
 * period, and you sign off the period.
 */
const FINALIZE_KEY = 'vat-recon-finalized'

export interface PeriodFinalization {
  periodId: string
  finalizedAt: string
  finalizedBy: string
}

/** The signed-in user in this prototype — real roles are not modelled yet. */
export const CURRENT_USER = 'Rizal Candra'

/**
 * Held in memory and written through to storage, rather than re-read on every
 * lookup. Two reasons: `periodStatus` asks per row, so a localStorage read per
 * row would be wasteful; and `saveSnapshot` is a no-op off the client, so a
 * read-through-storage design would silently drop every change outside a
 * browser — including under test, which is exactly where it must still work.
 */
let finalizations: PeriodFinalization[] = loadSnapshot<PeriodFinalization>(FINALIZE_KEY) ?? []

export function periodFinalization(periodId: string): PeriodFinalization | undefined {
  return finalizations.find(f => f.periodId === periodId)
}

export function isPeriodFinalized(periodId: string): boolean {
  return !!periodFinalization(periodId)
}

export function finalizePeriod(periodId: string): void {
  finalizations = [
    ...finalizations.filter(f => f.periodId !== periodId),
    { periodId, finalizedAt: TODAY_ISO, finalizedBy: CURRENT_USER },
  ]
  saveSnapshot(FINALIZE_KEY, finalizations)
  reconVersion.value++
}

export function unfinalizePeriod(periodId: string): void {
  finalizations = finalizations.filter(f => f.periodId !== periodId)
  saveSnapshot(FINALIZE_KEY, finalizations)
  reconVersion.value++
}

/**
 * Can this masa be finalized? Only when every side of it is fully reconciled —
 * you cannot sign off a period that still has exceptions in it.
 */
export function canFinalizePeriod(periodId: string): boolean {
  if (isPeriodFinalized(periodId)) return false
  // Only the sides in scope — a company reconciling VAT Out only must not be
  // blocked from signing off by an input side it never adopted.
  return reconSides().every((side) => {
    // A not-approved faktur is excluded from matching, so it can't hold sign-off up.
    const pairs = pairsForPeriod(periodId, side).filter(p => !isNotApproved(p))
    return pairs.length > 0 && pairs.every(p => p.match === 'matched')
  })
}

/**
 * When a masa was last reconciled.
 *
 * Matching is **automatic per masa pajak** — a period is reconciled as its data
 * syncs, not because somebody pressed a button, so every period that has data
 * carries a date. A manual re-run (US-002) only moves that date forward.
 */
export function periodRanAt(periodId: string): string | undefined {
  const seed = PERIOD_SEEDS.find(p => p.id === periodId)
  if (!seed) return undefined
  return runtimeRunAt(periodId) ?? seed.reconciledAt ?? AUTO_SYNC_DATE
}

/** Memoised so repeated reads (index row, workspace, tab count) stay identical. */
const generatedPairs = new Map<string, ReconPair[]>()

/**
 * The pairs of one masa+side, with any manual matches the user confirmed laid
 * over them (US-002 AC-02). Everything that reads pairs — KPIs, footer, period
 * index, Unmatched page, nav badge — goes through here, so a confirmed match
 * moves all of them together. With no overlay the base array is returned as-is.
 */
export function pairsForPeriod(periodId: string, side: ReconSide): ReconPair[] {
  void reconVersion.value
  const split = unmatchedAuto.filter(u => u.periodId === periodId && u.side === side)
  const unsplit = split.length
    ? basePairsForPeriod(periodId, side).flatMap(p => (split.some(u => u.pairId === p.id) ? splitPair(p) : [p]))
    : basePairsForPeriod(periodId, side)
  const base = applyRerunOutcomes(periodId, unsplit)
  const overlays = manualMatches.filter(m => m.periodId === periodId && m.side === side)
  if (!overlays.length) return applyOwnTaxDocMatches(base)
  // A confirmed match takes its counterpart row with it — it is now one pair.
  const consumed = new Set(overlays.map(o => o.candidate.pairId).filter(Boolean))
  return applyOwnTaxDocMatches(base.filter(p => !consumed.has(p.id)).map(p => {
    const m = overlays.find(o => o.pairId === p.id)
    return m ? applyManualMatch(p, m) : p
  }))
}

// ── Unmatching an auto match (US-002 AC-03) ───────────────────────────────────
/**
 * Unmatch on one of the ENGINE's matches puts both sides back to their own open
 * status: the pair splits into an ERP-only row (Not found in Coretax) and a
 * Coretax-only row (No match in ERP), each of which lists the other as its
 * candidate. Persisted with who did it and when, like a manual match.
 */
const UNMATCHED_AUTO_KEY = 'vat-recon-unmatched-auto'
interface UnmatchedAuto { pairId: string; periodId: string; side: ReconSide; by: string; at: string }
let unmatchedAuto: UnmatchedAuto[] = loadSnapshot<UnmatchedAuto>(UNMATCHED_AUTO_KEY) ?? []

function splitPair(p: ReconPair): ReconPair[] {
  const out: ReconPair[] = []
  if (p.erp) out.push({ id: `${p.id}~erp`, match: 'not-in-coretax', confidence: 0, erp: p.erp, djp: null,
    reason: `Unmatched by hand from tax document ${p.djp?.ref ?? ''}.`.trim() })
  if (p.djp) out.push({ id: `${p.id}~djp`, match: 'no-match-in-erp', confidence: 0, erp: null, djp: p.djp,
    reason: `Unmatched by hand from transaction ${p.erp?.ref ?? ''}.`.trim() })
  return out
}

export function unmatchAutoPair(pair: ReconPair): boolean {
  if (pair.match !== 'matched' || pair.matchedBy === 'manual' || pair.id.includes('~')) return false
  const { periodId, side } = pairLocation(pair)
  if (unmatchedAuto.some(u => u.pairId === pair.id)) return false
  unmatchedAuto = [...unmatchedAuto, { pairId: pair.id, periodId, side, by: CURRENT_USER, at: reconNowIso() }]
  saveSnapshot(UNMATCHED_AUTO_KEY, unmatchedAuto)
  reconVersion.value++
  return true
}

/** Put an engine match back (drops the split). Also undoes any re-match of its halves. */
export function restoreAutoMatch(pairId: string): boolean {
  if (!unmatchedAuto.some(u => u.pairId === pairId)) return false
  unmatchedAuto = unmatchedAuto.filter(u => u.pairId !== pairId)
  manualMatches = manualMatches.filter(m => m.pairId !== `${pairId}~erp` && m.pairId !== `${pairId}~djp`)
  saveSnapshot(UNMATCHED_AUTO_KEY, unmatchedAuto)
  saveSnapshot(MANUAL_MATCH_KEY, manualMatches)
  reconVersion.value++
  return true
}

/**
 * The pairs behind one masa + side. The live masa returns the hand-written
 * fixtures; every other masa is derived from its seed (see above).
 */
function basePairsForPeriod(periodId: string, side: ReconSide): ReconPair[] {
  if (periodId === activePeriodId) return side === 'output' ? outputPairs : inputPairs
  // A period nobody has run has no row statuses — matching hasn't happened, so
  // there is nothing to say about any pair yet. Returning invented statuses here
  // is what made a never-run masa render a screen of matches it hadn't earned.
  // The index still shows its pulled totals (US-018); the workspace prompts a run.
  const key = `${periodId}:${side}`
  const hit = generatedPairs.get(key)
  if (hit) return hit
  const seed = PERIOD_SEEDS.find(p => p.id === periodId)
  if (!seed || seed.sides === 'live') return []
  const seedSide = seed.sides[side]
  // Matching is automatic, so a seed's `matched` is not an input — it is what
  // the engine would have concluded. Every pair whose two sides agree matches;
  // whatever is left over is the exception queue. A masa whose faktur have not
  // synced yet therefore matches nothing, which is what makes it Not reconciled.
  const effective = { ...seedSide, matched: Math.min(seedSide.erp.count, seedSide.djp.count) }
  const generated = generatePairs(effective, side, seed)
  const built = [...generated, ...(NOT_APPROVED_DRAFT_SEEDS[key] ?? []), ...aireneSeedFakturs(key, generated)]
  generatedPairs.set(key, built)
  return built
}

/**
 * Totals for one column (erp or djp). Null records are skipped, not zeroed.
 * The Coretax column counts **Approved faktur only** — a Draft / Batal /
 * Rejected faktur is not a tax invoice yet (or any more), so it never adds to
 * DPP·faktur, PPN·faktur, the tax difference or the index's Tax invoice column.
 */
export function reconTotals(pairs: ReconPair[], column: 'erp' | 'djp') {
  let dpp = 0, ppn = 0, total = 0, count = 0
  for (const p of pairs) {
    const row = p[column]
    if (!row) continue
    if (column === 'djp' && row.approved === false) continue
    dpp += row.dpp
    ppn += row.ppn
    total += row.total
    count++
  }
  return { dpp, ppn, total, count }
}

export function matchCounts(pairs: ReconPair[]): Record<string, number> {
  const counts: Record<string, number> = {
    all: pairs.length,
    matched: pairs.filter(p => p.match === 'matched').length,
    // Rows 1 and 2 of the status model: the engine's matches and a person's,
    // counted apart because an audit has to tell them apart (goal G4).
    'matched-auto': pairs.filter(p => p.match === 'matched' && p.matchedBy !== 'manual').length,
    'matched-manual': pairs.filter(p => p.match === 'matched' && p.matchedBy === 'manual').length,
  }
  for (const state of NON_MATCHED_STATES) {
    counts[state] = pairs.filter(p => p.match === state).length
  }
  return counts
}

/**
 * Everything that isn't cleanly matched, across both sides — the report feed.
 * Scoped to one masa when `periodId` is given; the queue is always reached from
 * a period row, so it renders that period's issues, not April's.
 */
export function reconIssues(periodId: string = activePeriodId): ReconIssue[] {
  return reconSides().flatMap(side =>
    pairsForPeriod(periodId, side)
      // A not-approved faktur is excluded from matching — nothing to fix in ERP.
      .filter(p => p.match !== 'matched' && p.match !== 'not-approved')
      .map(p => ({ ...p, side })),
  )
}

/** Sidebar badge — total pairs needing attention across both sides. */
export function reconIssueCount(): number {
  return reconIssues().length
}

export function partyOf(row: ReconRecord): string {
  return row.customer ?? row.vendor ?? '—'
}

/** Every state that still wants a human — i.e. everything except a clean match. */
export const ATTENTION_STATES: MatchState[] = [...NON_MATCHED_STATES]

/**
 * Tax exposure of a pair, in rupiah — how much money is actually at stake.
 *
 * For a pair present on both sides that's the size of the disagreement; for an
 * unmatched record it's the whole amount, since the entire value is unaccounted
 * for on one side. Used to sort the work queues so the largest exposure is dealt
 * with first — with a real masa pajak, date order buries the rows that matter.
 */
export function exposureOf(pair: ReconPair): number {
  // A return that never reached the faktur side is the one case where both
  // totals agree and money is still at risk: the faktur was issued gross, the
  // books carry the return, and the difference is the return itself. Taking the
  // plain gap here would report Rp0 on the row that most needs chasing.
  if (pair.match === 'return-not-reflected' && pair.erp?.returnTotal) {
    return pair.erp.returnTotal
  }
  // A voided invoice against a live faktur is the same trap in reverse: the two
  // totals still agree, but the invoice no longer exists, so the whole faktur is
  // sitting at DJP unbacked.
  if (pair.match === 'invoice-voided' && pair.djp) return pair.djp.total
  if (pair.erp && pair.djp) return Math.abs(pair.djp.total - pair.erp.total)
  return (pair.erp ?? pair.djp)?.total ?? 0
}

/**
 * Issues flattened for a paginated table: the sortable columns are hoisted to the
 * top level because useTableState sorts on plain own properties, and the two sides
 * live one level down. `issue` keeps the original pair for the detail drawer.
 */
export interface ReconIssueRow {
  id: string
  issue: ReconIssue
  match: MatchState
  side: ReconSide
  ref: string
  party: string
  npwp: string
  date: string
  dpp: number
  ppn: number
  total: number
  exposure: number
}

export function issueRows(periodId: string = activePeriodId): ReconIssueRow[] {
  return reconIssues(periodId).map((issue) => {
    const row = (issue.erp ?? issue.djp)!
    return {
      id: issue.side + issue.id,
      issue,
      match: issue.match,
      side: issue.side,
      ref: row.ref,
      party: partyOf(row),
      npwp: row.npwp,
      date: row.date,
      dpp: row.dpp,
      ppn: row.ppn,
      total: row.total,
      exposure: exposureOf(issue),
    }
  })
}

/**
 * One row of the period index — **one masa, one side**.
 *
 * Keluaran and masukan are reconciled as separate pieces of work (different
 * documents, often different people, closed at different times), so each gets
 * its own row with its own figures and status, told apart by `jenis`. They share
 * one table rather than one row — the shape Klikpajak already ships.
 *
 * Flat on purpose: `useTableState` sorts on plain own properties, so everything
 * sortable sits at the top level, and `reconciledAt` stays ISO so the string
 * sort is chronological.
 */
export interface ReconPeriodRow {
  /** Unique per row — a masa appears twice, once per side. */
  id: string
  /** The masa's own id, for the `?masa=` link into the workspace. */
  periodId: string
  masa: string
  label: string
  year: string
  side: ReconSide
  /** `Jenis faktur` cell — the side in the user's vocabulary. */
  jenis: string
  status: ReconPeriodStatus
  /** ISO, or undefined when the reconciliation has never been run. */
  reconciledAt?: string
  /** Sales invoices (keluaran) or purchase invoices (masukan) — the ERP column. */
  erpAmount: number
  erpCount: number
  /** Faktur pajak — the Coretax column. */
  djpAmount: number
  djpCount: number
  /** How far the two columns disagree. 0 once every pair is matched. */
  selisih: number
  /** Pairs matched of the total in play — behind the status, not a column. */
  matched: number
  total: number
  /** Rows whose source changed since the last run (US-019 AC-05). Re-run clears it. */
  changes: number
}

/** Status is a function of the counts, so a row can't contradict its own figures. */
function periodStatus(matched: number, total: number, periodId: string): ReconPeriodStatus {
  // Finalize is only offered on a reconciled masa, but check the derivation too:
  // if source data changed after sign-off the period stays Finalized (US-021) —
  // it is a record of a decision, not a live verdict.
  if (isPeriodFinalized(periodId)) return 'finalized'
  if (matched === 0) return 'not reconciled'
  return matched >= total ? 'reconciled' : 'partially reconciled'
}

/**
 * The period index feed — every masa × both sides, newest masa first and
 * keluaran before masukan within a masa.
 *
 * The active masa is derived from the pair fixtures rather than restated, so its
 * two rows can never drift from the workspace they link to.
 */
export function reconPeriodRows(): ReconPeriodRow[] {
  const SIDES = reconSides()

  return PERIOD_SEEDS.flatMap(seed =>
    SIDES.map((side): ReconPeriodRow => {
      // Every row is derived from the pairs the workspace renders, so the index
      // and the screen behind it cannot disagree — and because matching is
      // automatic, there is no pre-run state for them to disagree about.
      const pairs = pairsForPeriod(seed.id, side)
      const erpT = reconTotals(pairs, 'erp')
      const djpT = reconTotals(pairs, 'djp')
      const erp = { amount: erpT.total, count: erpT.count }
      const djp = { amount: djpT.total, count: djpT.count }
      const matched = matchCounts(pairs).matched!
      const total = pairs.length

      const erpAmount = erp.amount
      const djpAmount = djp.amount

      return {
        id: `${seed.id}-${side}`,
        periodId: seed.id,
        masa: seed.masa,
        label: periodLabel(seed.masa),
        year: seed.masa.slice(-4),
        side,
        jenis: SIDE_LABELS[side].title,
        // Excluded faktur (§5.1 row 13) never keep a period from Reconciled.
        status: periodStatus(matched, total - pairs.filter(isNotApproved).length, seed.id),
        reconciledAt: periodRanAt(seed.id),
        erpAmount,
        erpCount: erp.count,
        djpAmount,
        djpCount: djp.count,
        selisih: Math.abs(erpAmount - djpAmount),
        matched,
        total,
        changes: periodChangeCount(seed.id, side),
      }
    }),
  )
}

/**
 * Reconciliations that aren't finished — the rows the index sorts to the top, and
 * the module's nav badge. Deliberately the same number in both places: a badge
 * on a nav item should mean the same thing as the badge on the tab it lands you
 * near, otherwise the two numbers read as a contradiction.
 */
export function reconUnfinishedCount(): number {
  // Finalized counts as finished too — otherwise signing a period off would make
  // the badge go up, which is the opposite of what just happened.
  return reconPeriodRows()
    .filter(r => r.status !== 'reconciled' && r.status !== 'finalized').length
}

/** Masa options for the All filters drawer, newest first. */
export function reconPeriodOptions(): { value: string; label: string }[] {
  return PERIOD_SEEDS.map(p => ({ value: p.id, label: p.masa }))
}

/**
 * Bare grouped amount — no `Rp` prefix. Used only for the dense DPP/PPN/Total
 * triplets where a labelled column already establishes that it's money (see
 * docs/patterns/currency-format.md — those aren't currency displays). Headline
 * figures (KPI tiles, drawer comparison) use formatIDR.
 */
export function formatAmountPlain(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Not-approved faktur (PRD §5.1 row 13, US-001 AC-06/AC-07) ─────────────────
/**
 * A faktur that is not Approved in Coretax is never matched, auto or manual.
 * Where it shows depends on why:
 *
 *   Draft, no SI           still on its way — a To match row, Coretax side only,
 *                          tagged "Not approved" (Draft). It is in the period's
 *                          pairs, so it counts as unmatched like any other
 *                          Coretax-only row.
 *   Batal / Rejected, no SI dead — not in any tab and not in any count. Only the
 *                          To match Status filter's "Not approved" option lists
 *                          it, so it can still be found.
 *
 * An SI whose OWN faktur is a draft is a different case — it stays
 * `not-in-coretax` with the "Draft pending" marker (erpFakturOf).
 */
const NOT_APPROVED_DRAFT_SEEDS: Record<string, ReconPair[]> = {
  '2027-03:output': [{
    id: '2027-03-output-x1', match: 'not-approved', confidence: 0,
    erp: null,
    djp: { ref: '27030000001284091', date: '12 Mar 2027', customer: 'PT Indofood Sukses Makmur Tbk', npwp: '0011060432092000', dpp: 6250000, ppn: 750000, total: 7000000, approved: false, coretaxStatus: 'Draft' },
    reason: 'This tax document is still a draft, so it is excluded from matching until it is approved.',
  }],
}

const NOT_APPROVED_HIDDEN_SEEDS: Record<string, ReconPair[]> = {
  '2027-03:output': [{
    id: '2027-03-output-x2', match: 'not-approved', confidence: 0,
    erp: null,
    djp: { ref: '27030000001284164', date: '09 Mar 2027', customer: 'PT Bank Central Asia Tbk', npwp: '0010010641091000', dpp: 4500000, ppn: 540000, total: 5040000, approved: false, coretaxStatus: 'Batal' },
    reason: 'This tax document was cancelled (Batal). It is excluded from matching and from every count.',
  }],
}

/**
 * Batal / Rejected faktur with no SI — kept OUT of `pairsForPeriod`, so no tab,
 * KPI, footer count or period status sees them. The workspace lists them only
 * under the "Not approved" status filter.
 */
export function hiddenNotApprovedFor(periodId: string, side: ReconSide): ReconPair[] {
  return NOT_APPROVED_HIDDEN_SEEDS[`${periodId}:${side}`] ?? []
}

/** "Not approved" tag tooltip — which Coretax status keeps it out of matching. */
export function notApprovedHint(rec: ReconRecord): string {
  // One sentence for every status — the status itself sits beside the number.
  void rec
  return 'This tax document is not approved yet, so it is excluded from matching.'
}

// ── Accounts used per period (US-016 AC-07/AC-08, VR-4/VR-5) ──────────────────
/**
 * Each period keeps the PPN Keluaran accounts its last run used, so changing
 * setup later never silently rewrites history. Unlisted periods ran with the
 * default chart's VAT Out account; 11/2026 also ran with Other Payables, which
 * was dropped from setup afterwards — the period where Re-run warns.
 */
const PERIOD_ACCOUNT_SEEDS: Record<string, string[]> = {
  '2026-11': ['2-20500', '2-20200'],
}

/** The accounts this period's last run used. */
export function periodAccountCodes(periodId: string): string[] {
  void reconVersion.value
  return runs.find(r => r.periodId === periodId)?.accountCodes
    ?? PERIOD_ACCOUNT_SEEDS[periodId]
    ?? SNAPSHOT_ACCOUNT_CODES.output
}

/** The PPN Keluaran accounts in the saved setup (empty before setup). */
export function currentOutputAccountCodes(): string[] {
  void reconVersion.value
  return loadVatSetup()?.outputAccountCodes ?? []
}

const sameCodeSet = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join()

/**
 * The setup change a Re-run would apply, or null when the period already ran
 * with the current accounts. No saved setup → null: there is nothing to compare.
 */
export function periodSetupChange(periodId: string): { was: string[]; now: string[] } | null {
  const now = currentOutputAccountCodes()
  const was = periodAccountCodes(periodId)
  if (!now.length || sameCodeSet(was, now)) return null
  return { was, now }
}

/** A Re-run made in this prototype (new-format run, carrying its own stamp). */
function rerunOf(periodId: string): PeriodRun | undefined {
  return runs.find(r => r.periodId === periodId && !!r.at)
}

/** "Last sync" for the period header: its last re-run, else the Coretax pull. */
export function periodLastSync(periodId: string): string {
  void reconVersion.value
  const run = rerunOf(periodId)
  return run?.at ? fmtStamp(run.at) : lastSyncedAt
}

/** Simulated duration of a Re-run, so the "Reconciling…" state is visible. */
export const RERUN_SIMULATED_MS = 1200

// ── What a Re-run finds (US-002 AC-01) ────────────────────────────────────────
/**
 * Source data that moved since the period's last run. The engine only sees it
 * on the next run, so these apply once the period has been re-run:
 *   o-13               the faktur date was corrected in Coretax → Reconciled
 *   2027-01-output-07  the invoice was edited after sign-off → Invoice edited
 */
function applyRerunOutcomes(periodId: string, pairs: ReconPair[]): ReconPair[] {
  if (!rerunOf(periodId)) return pairs
  return pairs.map((p) => {
    if (p.id === 'o-13' && p.djp && p.erp) {
      return { ...p, match: 'matched', matchedBy: 'auto', confidence: 1, fields: [], reason: undefined,
        djp: { ...p.djp, date: p.erp.date } }
    }
    if (p.id === '2027-01-output-07' && p.erp) {
      const total = p.erp.total + 1_120_000
      const dpp = Math.round(total / 1.12)
      return { ...p, match: 'invoice-edited', matchedBy: undefined, confidence: 0,
        erp: { ...p.erp, dpp, ppn: total - dpp, total },
        fields: ['dpp', 'ppn', 'total'],
        reason: 'Sales invoice edited on 12 Feb 2027, after this period was reconciled. Its total is now Rp1.120.000 higher than the tax document.' }
    }
    return p
  })
}

// ── Changed since reconciled (US-019) ─────────────────────────────────────────
/**
 * A row whose source document changed after the period was last reconciled.
 * A flag, never a status: the row keeps whatever the last run concluded until
 * the next Re-run re-evaluates it — and that Re-run clears the flag.
 */
const CHANGED_SINCE_SEEDS: { pairId: string; periodId: string; side: ReconSide; note: string }[] = [
  { pairId: '2027-01-output-03', periodId: '2027-01', side: 'output', note: 'Sales invoice memo edited on 10 Feb 2027. Amounts unchanged.' },
  { pairId: '2027-01-output-07', periodId: '2027-01', side: 'output', note: 'Sales invoice amounts edited on 12 Feb 2027.' },
]

export function changedSinceReconciled(pair: ReconPair): { note: string } | undefined {
  void reconVersion.value
  const { periodId } = pairLocation(pair)
  if (rerunOf(periodId)) return undefined
  const hit = CHANGED_SINCE_SEEDS.find(c => c.pairId === pair.id)
  return hit ? { note: hit.note } : undefined
}

export function periodChangeCount(periodId: string, side: ReconSide = 'output'): number {
  void reconVersion.value
  if (rerunOf(periodId)) return 0
  return CHANGED_SINCE_SEEDS.filter(c => c.periodId === periodId && c.side === side).length
}

// ── Remarks (US-013) ──────────────────────────────────────────────────────────
/**
 * A reason a person records against a row that isn't settled by the engine.
 * Not a status and not a match: the row keeps its status, the remark explains
 * it. Waiting on buyer stays its own toggle (US-012) — it is not a reason here.
 */
export const REMARK_REASONS = ['Timing', 'Missing entry', 'Duplicate', 'Return', 'Rounding', 'Other'] as const
export type RemarkReason = typeof REMARK_REASONS[number]
export const REMARK_MAX_CHARS = 500

export interface PairRemark { pairId: string; reason: RemarkReason; text: string; by: string; at: string }

const REMARKS_KEY = 'vat-recon-remarks'
let remarks: PairRemark[] = loadSnapshot<PairRemark>(REMARKS_KEY) ?? []

/** Every row except one the engine reconciled on its own — Reconciled (auto). */
export function canRemark(pair: ReconPair): boolean {
  return pair.match !== 'matched' || pair.matchedBy === 'manual'
}

export function remarkOf(pair: ReconPair): PairRemark | undefined {
  void reconVersion.value
  return remarks.find(r => r.pairId === pair.id)
}

/** Save (or replace) a row's remark. Refuses an unknown reason or text over the limit. */
export function saveRemark(pair: ReconPair, reason: string, text: string): boolean {
  if (!canRemark(pair)) return false
  if (!(REMARK_REASONS as readonly string[]).includes(reason)) return false
  const body = text.trim()
  if (body.length > REMARK_MAX_CHARS) return false
  remarks = [...remarks.filter(r => r.pairId !== pair.id),
    { pairId: pair.id, reason: reason as RemarkReason, text: body, by: CURRENT_USER, at: reconNowIso() }]
  saveSnapshot(REMARKS_KEY, remarks)
  reconVersion.value++
  return true
}

// ── "Tax document not found" sub-states (PM, 2026-11-05) ─────────────────────
/**
 * Status #3 splits by how far the transaction's OWN tax document got
 * (erpFakturOf), because the fix differs: create one, submit the draft, wait for
 * DJP, or look at why DJP rejected it. A sub-state, not a MatchState — the
 * engine's verdict is still `not-in-coretax`, and all four stay in To match.
 * An Approved own tax document is not a sub-state: the engine matches it
 * (applyOwnTaxDocMatches), so the row reconciles.
 */
export type TaxDocSubState = 'none' | 'draft' | 'submitted' | 'rejected'
export const TAX_DOC_SUBSTATES: TaxDocSubState[] = ['none', 'draft', 'submitted', 'rejected']

export const TAX_DOC_SUBSTATE_META: Record<TaxDocSubState, { label: string; badge: string; reason: string; fg: string; badgeType: MpBadgeType }> = {
  none: { label: 'Tax document not found', badge: 'Not issued', badgeType: 'critical',
    reason: 'No tax document has been created for this transaction yet.', fg: 'var(--mp-colors-red-800)' },
  draft: { label: 'Tax document in draft', badge: 'Draft', badgeType: 'warning',
    reason: 'Submit the tax document to reconcile this transaction.', fg: 'var(--mp-colors-orange-800)' },
  submitted: { label: 'Awaiting DJP approval', badge: 'Awaiting approval', badgeType: 'warning',
    reason: 'The tax document is being processed by DJP.', fg: 'var(--mp-colors-orange-800)' },
  rejected: { label: 'Tax document rejected', badge: 'Rejected', badgeType: 'critical',
    reason: 'DJP rejected this tax document.', fg: 'var(--mp-colors-red-800)' },
}

export function taxDocSubState(pair: ReconPair): TaxDocSubState | null {
  if (pair.match !== 'not-in-coretax') return null
  const f = erpFakturOf(pair)
  // No linked invoice (input side), or an approved one the engine hasn't seen yet.
  if (!f || f.state === 'approved') return 'none'
  return f.state
}

/** Full status label — expanded row, drawer, tooltip, Status filter. */
export function statusLabelOf(pair: ReconPair): string {
  const sub = taxDocSubState(pair)
  return sub ? TAX_DOC_SUBSTATE_META[sub].label : MATCH_META[pair.match].chipLabel
}
/** ≤ 2-word badge/chip label — issue-queue Status column, tables. */
export function statusBadgeOf(pair: ReconPair): string {
  const sub = taxDocSubState(pair)
  return sub ? TAX_DOC_SUBSTATE_META[sub].badge : MATCH_META[pair.match].label
}
/** Reason sentence under the status — the sub-state's, else the engine's. */
export function statusReasonOf(pair: ReconPair): string | undefined {
  const sub = taxDocSubState(pair)
  return sub ? TAX_DOC_SUBSTATE_META[sub].reason : pair.reason
}
/** Badge / banner tone — the sub-state's (draft and waiting on DJP are warnings). */
export function statusBadgeTypeOf(pair: ReconPair): MpBadgeType {
  const sub = taxDocSubState(pair)
  return sub ? TAX_DOC_SUBSTATE_META[sub].badgeType : MATCH_META[pair.match].badgeType
}
export function statusFgOf(pair: ReconPair): string {
  const sub = taxDocSubState(pair)
  return sub ? TAX_DOC_SUBSTATE_META[sub].fg : MATCH_META[pair.match].fg
}

/**
 * Engine: a transaction whose own tax document is Approved is reconciled
 * against it (auto). Applied last in pairsForPeriod, so approving a document —
 * e.g. Refresh status — moves the row to Matched everywhere at once.
 */
// pairsForPeriod runs on every candidate lookup, so the "is this invoice's own
// tax document approved?" answer is memoised per store version — reading the
// reactive store on every call made the workspace's first render ~3× slower.
const approvedOwnDocCache = new Map<string, TaxDocument | null>()
let approvedOwnDocCacheVersion = -1
function approvedOwnDoc(salesInvoiceId: string): TaxDocument | null {
  const v = taxDocumentsVersion.value
  if (v !== approvedOwnDocCacheVersion) { approvedOwnDocCache.clear(); approvedOwnDocCacheVersion = v }
  if (!approvedOwnDocCache.has(salesInvoiceId)) {
    const doc = currentTaxDocument(salesInvoiceId)
    approvedOwnDocCache.set(salesInvoiceId, doc && doc.status === 'approved' && !doc.supersededAs ? doc : null)
  }
  return approvedOwnDocCache.get(salesInvoiceId) ?? null
}

function applyOwnTaxDocMatches(pairs: ReconPair[]): ReconPair[] {
  if (!pairs.some(p => p.match === 'not-in-coretax' && p.erp?.salesInvoiceId && approvedOwnDoc(p.erp.salesInvoiceId))) return pairs
  return pairs.map((p) => {
    const doc = p.match === 'not-in-coretax' && p.erp?.salesInvoiceId ? approvedOwnDoc(p.erp.salesInvoiceId) : null
    if (!doc || !p.erp) return p
    const [dd, mm, yyyy] = doc.date.split('/')
    return {
      ...p, match: 'matched' as const, matchedBy: 'auto' as const, confidence: 1, fields: [], reason: undefined,
      djp: { ...p.erp, ref: formatTaxDocumentNumber(doc), date: `${dd} ${MONTHS[Number(mm) - 1]} ${yyyy}`, approved: true,
        salesInvoiceId: undefined },
    }
  })
}

/** Simulated DJP check for "Refresh status" — the duration of its loading state. */
export const REFRESH_SIMULATED_MS = 900
/** Seeded DJP outcomes: this one is approved on refresh; every other stays processing. */
const DJP_APPROVES_ON_REFRESH = new Set(['taxdoc-seed-si043-submitted'])

/** Ask DJP (simulated). Approved → the engine reconciles the row; else it stays processing. */
export function refreshOwnTaxDocStatus(pair: ReconPair): 'approved' | 'processing' | null {
  const f = erpFakturOf(pair)
  if (!f?.doc || f.state !== 'submitted') return null
  if (!DJP_APPROVES_ON_REFRESH.has(f.doc.id)) return 'processing'
  updateTaxDocumentStatus(f.doc.id, 'approved')
  reconVersion.value++
  return 'approved'
}

// ── Airene suggestion seeds, masa 03/2027 (US-014, PM 2026-11-06) ────────────
/**
 * Approved tax documents with no transaction behind them — "Transaction not
 * found" rows in their own right, and the counterparts Airene suggests for the
 * invoices that have no tax document (vatReconSuggest.ts holds the responses):
 *
 *   f1  for SI103 — reference with extra text           → Tier 1
 *   f2  for SI013 — same number, different order/prefix   → Tier 1
 *   f3  for SI013 — same reference, customer name differs → Tier 2
 *   f4  for SI002 — reference typo, DPP/PPN higher       → Tier 2 only
 *   f5  standalone — Airene finds nothing                 → no_candidates
 *   f6  standalone — Airene times out                     → no_candidates (fail open)
 *
 * The linked ones copy their invoice's figures, so the row and its suggestion
 * agree to the rupiah unless a delta is seeded.
 */
interface AireneSeedFaktur {
  id: string
  ref: string
  date: string
  forSalesInvoiceId?: string
  customer?: string
  npwp?: string
  dpp?: number
  ppn?: number
  dppDelta?: number
  ppnDelta?: number
}
const AIRENE_SEED_FAKTURS: Record<string, AireneSeedFaktur[]> = {
  '2027-03:output': [
    { id: '2027-03-output-f1', forSalesInvoiceId: 'SI103', ref: '27030000001284310', date: '02 Mar 2027' },
    { id: '2027-03-output-f2', forSalesInvoiceId: 'SI013', ref: '27030000001284383', date: '12 Mar 2027' },
    { id: '2027-03-output-f3', forSalesInvoiceId: 'SI013', ref: '27030000001284456', date: '12 Mar 2027', customer: 'PT Excelso Multi Rasa' },
    { id: '2027-03-output-f4', forSalesInvoiceId: 'SI002', ref: '27030000001284529', date: '14 Mar 2027', dppDelta: 500_000, ppnDelta: 55_000 },
    { id: '2027-03-output-f5', ref: '27030000001284602', date: '15 Mar 2027', customer: 'CV Sinar Jaya Abadi', npwp: '0091234567012000', dpp: 3_000_000, ppn: 330_000 },
    { id: '2027-03-output-f6', ref: '27030000001284675', date: '16 Mar 2027', customer: 'PT Mitra Logistik Cepat', npwp: '0092345678023000', dpp: 5_400_000, ppn: 594_000 },
  ],
}

function aireneSeedFakturs(key: string, generated: ReconPair[]): ReconPair[] {
  return (AIRENE_SEED_FAKTURS[key] ?? []).flatMap((f): ReconPair[] => {
    const inv = f.forSalesInvoiceId ? generated.find(p => p.erp?.salesInvoiceId === f.forSalesInvoiceId)?.erp : undefined
    if (f.forSalesInvoiceId && !inv) return []
    const dpp = (inv?.dpp ?? f.dpp ?? 0) + (f.dppDelta ?? 0)
    const ppn = (inv?.ppn ?? f.ppn ?? 0) + (f.ppnDelta ?? 0)
    return [{
      id: f.id, match: 'no-match-in-erp', confidence: 0, erp: null,
      djp: {
        ref: f.ref, date: f.date, customer: f.customer ?? inv?.customer ?? '—', npwp: f.npwp ?? inv?.npwp ?? '',
        dpp, ppn, total: dpp + ppn, approved: true,
      },
      reason: 'No transaction in Jurnal carries the reference on this tax document.',
    }]
  })
}
