import { ref } from 'vue'
import { loadSnapshot, saveSnapshot } from '~/data/persist'

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
 * the status model was written against the VAT Out conditions.
 *
 * Period: Masa pajak 05/2027. Tenant: PT Central Perk Indonesia.
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

/** States that still want a human — everything except a clean match. */
const NON_MATCHED_STATES = [
  'not-in-coretax', 'no-match-in-erp', 'invoice-edited', 'invoice-voided',
  'return-not-reflected', 'return-netted', 'faktur-predates',
  'return-date-mismatch', 'duplicate-reference', 'period-finalized',
] as const

export type ReconSide = 'output' | 'input'

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
  /** ERP side — the sales invoice was voided after the faktur was approved. */
  voided?: boolean
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
}

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
    label: 'Date order', longLabel: 'Not reconciled — faktur predates invoice', chipLabel: 'Faktur predates invoice',
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
    label: 'No faktur', longLabel: 'Not found in Coretax', chipLabel: 'Not found in Coretax',
    badgeType: 'critical',
    dot: 'var(--mp-colors-red-600)',
    bg: 'var(--mp-colors-red-100)',
    border: 'var(--mp-colors-red-200)',
    fg: 'var(--mp-colors-red-800)',
    icon: 'minus-circular',
    iconColor: 'icon.inverse', iconColorOutline: 'icon.danger',
  },
  'no-match-in-erp': {
    label: 'No invoice', longLabel: 'No match in ERP', chipLabel: 'No match in ERP',
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
    title: 'Output tax invoice',
    erpHeader: 'Sales invoices', erpHeaderSub: 'ERP',
    djpHeader: 'Tax invoices issued', djpHeaderSub: 'Coretax DJP',
    erpEmptyAction: 'Create sales invoice', djpEmptyAction: 'Create faktur pajak',
    erpEmptyToast: 'Opening sales invoice…', djpEmptyToast: 'Opening Coretax…',
    partyLabel: 'Customer',
    kpiErpDpp: 'DPP · sales', kpiDjpDpp: 'DPP · faktur',
    kpiErpPpn: 'PPN · sales', kpiDjpPpn: 'PPN · faktur',
  },
  input: {
    title: 'Input tax invoice',
    // The ERP-side document is a Purchase invoice (Purchases module), not a Bill
    // — Bills are the separate Expenses queue.
    erpHeader: 'Purchase invoices', erpHeaderSub: 'ERP',
    djpHeader: 'Tax invoices received', djpHeaderSub: 'Coretax prepopulated',
    erpEmptyAction: 'Create purchase invoice', djpEmptyAction: 'Flag for follow-up',
    erpEmptyToast: 'Opening purchase invoice…', djpEmptyToast: 'Faktur flagged for follow-up',
    partyLabel: 'Vendor',
    kpiErpDpp: 'DPP · purchases', kpiDjpDpp: 'DPP · faktur',
    kpiErpPpn: 'PPN · purchases', kpiDjpPpn: 'PPN · faktur',
  },
}

// ── Output side — Faktur keluaran (sales) ──────────────────────────────────────

export const outputPairs: ReconPair[] = [
  {
    // 1 — key, corroboration and direction all pass; faktur Approved.
    id: 'o-01', match: 'matched', matchedBy: 'auto', confidence: 1,
    erp: { ref: '40142', date: '02 May 2027', customer: 'PT Telkom Indonesia Tbk', npwp: '0010000131093000', dpp: 12500000, ppn: 1500000, total: 14000000 },
    djp: { ref: '27000000039847291', date: '02 May 2027', customer: 'PT Telkom Indonesia Tbk', npwp: '0010000131093000', dpp: 12500000, ppn: 1500000, total: 14000000, approved: true },
  },
  {
    id: 'o-02', match: 'matched', matchedBy: 'auto', confidence: 1,
    erp: { ref: '40143', date: '03 May 2027', customer: 'PT Bank Central Asia Tbk', npwp: '0010010641091000', dpp: 42750000, ppn: 5130000, total: 47880000 },
    djp: { ref: '27000000039847342', date: '03 May 2027', customer: 'PT Bank Central Asia Tbk', npwp: '0010010641091000', dpp: 42750000, ppn: 5130000, total: 47880000, approved: true },
  },
  {
    // 2 — the engine could not close it; a person did, and the log says so.
    id: 'o-03', match: 'matched', matchedBy: 'manual', confidence: 1,
    erp: { ref: '40144', date: '05 May 2027', customer: 'PT Astra International Tbk', npwp: '0013025845092000', dpp: 87500000, ppn: 10500000, total: 98000000 },
    djp: { ref: '27000000039847415', date: '05 May 2027', customer: 'PT Astra Intl. Tbk', npwp: '0013025845092000', dpp: 87500000, ppn: 10500000, total: 98000000, approved: true },
    reason: 'Reference on the faktur was typed without the SI prefix. Matched by hand after checking NPWP and amounts.',
  },
  {
    // 5 (US-010) — the invoice moved after the faktur was approved.
    id: 'o-04', match: 'invoice-edited', confidence: 0,
    erp: { ref: '40145', date: '08 May 2027', customer: 'PT Indofood Sukses Makmur Tbk', npwp: '0011060432092000', dpp: 24800000, ppn: 2976000, total: 27776000 },
    djp: { ref: '27000000039847488', date: '08 May 2027', customer: 'PT Indofood Sukses Makmur Tbk', npwp: '0011060432092000', dpp: 25300000, ppn: 3036000, total: 28336000, approved: true },
    reason: 'Sales invoice edited on 14 Jan, after the faktur was approved on 09 Jan. DPP is Rp500.000 lower than the faktur.',
    fields: ['dpp', 'ppn', 'total'],
  },
  {
    id: 'o-05', match: 'matched', matchedBy: 'auto', confidence: 1,
    erp: { ref: '40146', date: '10 May 2027', customer: 'PT Trinusa Travelindo', npwp: '0025278154031000', dpp: 18900000, ppn: 2268000, total: 21168000 },
    djp: { ref: '27000000039847561', date: '10 May 2027', customer: 'PT Trinusa Travelindo', npwp: '0025278154031000', dpp: 18900000, ppn: 2268000, total: 21168000, approved: true },
  },
  {
    // Faktur dated the day after its invoice — direction is fine, so this is a
    // clean match. The engine checks direction, not distance: there is no window.
    id: 'o-06', match: 'matched', matchedBy: 'auto', confidence: 1,
    erp: { ref: '40147', date: '12 May 2027', customer: 'PT Mitra Keluarga Karyasehat Tbk', npwp: '0010610927054000', dpp: 9800000, ppn: 1176000, total: 10976000 },
    djp: { ref: '27000000039847634', date: '13 May 2027', customer: 'PT Mitra Keluarga Karyasehat Tbk', npwp: '0010610927054000', dpp: 9800000, ppn: 1176000, total: 10976000, approved: true },
  },
  {
    // 3 (US-008) — invoice raised, faktur never issued.
    id: 'o-07', match: 'not-in-coretax', confidence: 0,
    erp: { ref: '40148', date: '15 May 2027', customer: 'PT GoTo Gojek Tokopedia Tbk', npwp: '0071058362092000', dpp: 31200000, ppn: 3744000, total: 34944000 },
    djp: null,
    reason: 'No Approved faktur pajak carries this invoice number as its Referensi.',
  },
  {
    id: 'o-08', match: 'matched', matchedBy: 'auto', confidence: 1,
    erp: { ref: '40149', date: '18 May 2027', customer: 'PT Trans Retail Indonesia', npwp: '0022187064046000', dpp: 56400000, ppn: 6768000, total: 63168000 },
    djp: { ref: '27000000039847707', date: '18 May 2027', customer: 'PT Trans Retail Indonesia', npwp: '0022187064046000', dpp: 56400000, ppn: 6768000, total: 63168000, approved: true },
  },
  {
    // 4 (US-009) — faktur approved against an invoice that was never posted.
    id: 'o-09', match: 'no-match-in-erp', confidence: 0,
    erp: null,
    djp: { ref: '27000000039847780', date: '20 May 2027', customer: 'CV Sinar Jaya Abadi', npwp: '0028345127027000', dpp: 4200000, ppn: 504000, total: 4704000, approved: true },
    reason: 'No sales invoice, journal entry or bank deposit in Jurnal carries this Referensi.',
  },
  {
    // 6 (US-011) — invoice cancelled, faktur still live at DJP.
    id: 'o-10', match: 'invoice-voided', confidence: 0,
    erp: { ref: '40150', date: '22 May 2027', customer: 'PT Bumi Berkah Boga', npwp: '0034289175031000', dpp: 6125000, ppn: 735000, total: 6860000, voided: true },
    djp: { ref: '27000000039847853', date: '22 May 2027', customer: 'PT Bumi Berkah Boga', npwp: '0034289175031000', dpp: 6125000, ppn: 735000, total: 6860000, approved: true },
    reason: 'Sales invoice was voided on 25 Jan. The faktur is still Approved in Coretax and must be cancelled.',
  },
  {
    id: 'o-11', match: 'matched', matchedBy: 'auto', confidence: 1,
    erp: { ref: '40151', date: '25 May 2027', customer: 'PT Hungry Birds Indonesia', npwp: '0078123940058000', dpp: 3500000, ppn: 420000, total: 3920000 },
    djp: { ref: '27000000039847926', date: '25 May 2027', customer: 'PT Hungry Birds Indonesia', npwp: '0078123940058000', dpp: 3500000, ppn: 420000, total: 3920000, approved: true },
  },
  {
    // 7 (US-012) — return booked in Jurnal after the faktur; buyer has not sent
    // a nota retur and no pengganti was issued. The common return path.
    id: 'o-12', match: 'return-not-reflected', confidence: 0,
    erp: { ref: '40152', date: '26 May 2027', customer: 'PT Maju Sejahtera Abadi', npwp: '0017763285013000', dpp: 8400000, ppn: 1008000, total: 9408000, returnRef: 'SR-2027-014', returnDate: '30 May 2027', returnTotal: 2352000 },
    djp: { ref: '27000000039847999', date: '27 May 2027', customer: 'PT Maju Sejahtera Abadi', npwp: '0017763285013000', dpp: 8400000, ppn: 1008000, total: 9408000, approved: true },
    reason: 'Sales return SR-2027-014 (Rp2.352.000) booked on 30 Jan, after the faktur. No nota retur from the buyer and no pengganti.',
  },
  {
    // 9 — every field agrees, but the faktur predates its invoice, which is
    // impossible. This is what the removed ±3-day window used to swallow.
    id: 'o-13', match: 'faktur-predates', confidence: 0,
    erp: { ref: '40153', date: '29 May 2027', customer: 'PT Sumber Alfaria Trijaya Tbk', npwp: '0010914763092000', dpp: 15600000, ppn: 1872000, total: 17472000 },
    djp: { ref: '27000000039848072', date: '26 May 2027', customer: 'PT Sumber Alfaria Trijaya Tbk', npwp: '0010914763092000', dpp: 15600000, ppn: 1872000, total: 17472000, approved: true },
    reason: 'Faktur is dated 26 Jan, three days before its invoice. Correct the date on one side.',
    fields: ['date'],
  },
  {
    // 11 (US-003) — original plus pengganti both carry the same Referensi.
    // Without OD-002 lineage the engine cannot pick, so a person does.
    id: 'o-14', match: 'duplicate-reference', confidence: 0,
    erp: { ref: '40154', date: '29 May 2027', customer: 'PT Erajaya Swasembada Tbk', npwp: '0018452037091000', dpp: 21000000, ppn: 2520000, total: 23520000 },
    djp: { ref: '27000000039848145', date: '29 May 2027', customer: 'PT Erajaya Swasembada Tbk', npwp: '0018452037091000', dpp: 21000000, ppn: 2520000, total: 23520000, approved: true },
    reason: 'Two Approved faktur carry this invoice number: 27000000039848145 and its pengganti 27000000039848218.',
  },
  {
    // 8 (US-017) — return booked *before* the faktur, and the faktur was issued
    // net of it. Legitimate, rare, and never auto-matched: a person confirms.
    id: 'o-15', match: 'return-netted', confidence: 0,
    erp: { ref: '40155', date: '20 May 2027', customer: 'PT Ace Hardware Indonesia Tbk', npwp: '0016038291074000', dpp: 30000000, ppn: 3600000, total: 33600000, returnRef: 'SR-2027-011', returnDate: '24 May 2027', returnTotal: 5600000 },
    djp: { ref: '27000000039848291', date: '28 May 2027', customer: 'PT Ace Hardware Indonesia Tbk', npwp: '0016038291074000', dpp: 25000000, ppn: 3000000, total: 28000000, approved: true },
    reason: 'Invoice Rp33.600.000 less return SR-2027-011 Rp5.600.000 equals the faktur exactly. The return predates the faktur, so a net faktur is correct.',
  },
  {
    // 13 — a Draft faktur is excluded from matching entirely and only tagged, so
    // it can never be mistaken for a missing document.
    id: 'o-16', match: 'no-match-in-erp', confidence: 0,
    erp: null,
    djp: { ref: '27000000039848364', date: '30 May 2027', customer: 'PT Midi Utama Indonesia Tbk', npwp: '0019274056083000', dpp: 7350000, ppn: 882000, total: 8232000, approved: false },
    reason: 'Faktur is still Draft in Coretax, so it is excluded from matching until it is approved.',
  },
]

// ── Input side — Faktur masukan (purchases) ────────────────────────────────────

export const inputPairs: ReconPair[] = [
  {
    id: 'i-01', match: 'matched', matchedBy: 'auto', confidence: 1,
    erp: { ref: 'PINV-2027-018', date: '04 May 2027', vendor: 'PT Pertamina Patra Niaga', npwp: '0010016543058000', dpp: 14500000, ppn: 1740000, total: 16240000 },
    djp: { ref: '27000000071284091', date: '04 May 2027', vendor: 'PT Pertamina Patra Niaga', npwp: '0010016543058000', dpp: 14500000, ppn: 1740000, total: 16240000, approved: true },
  },
  {
    id: 'i-02', match: 'matched', matchedBy: 'auto', confidence: 1,
    erp: { ref: 'PINV-2027-019', date: '06 May 2027', vendor: 'PT Aneka Gas Industri', npwp: '0010724988091000', dpp: 3250000, ppn: 390000, total: 3640000 },
    djp: { ref: '27000000071284164', date: '06 May 2027', vendor: 'PT Aneka Gas Industri', npwp: '0010724988091000', dpp: 3250000, ppn: 390000, total: 3640000, approved: true },
  },
  {
    id: 'i-03', match: 'no-match-in-erp', confidence: 0,
    erp: null,
    djp: { ref: '27000000071284237', date: '09 May 2027', vendor: 'PT Mitra Logistik Cepat', npwp: '0023486712072000', dpp: 8750000, ppn: 1050000, total: 9800000, approved: true },
    reason: 'Prepopulated from Coretax. No purchase invoice recorded in ERP yet — create it from this faktur.',
  },
  {
    id: 'i-04', match: 'matched', matchedBy: 'manual', confidence: 1,
    erp: { ref: 'PINV-2027-021', date: '12 May 2027', vendor: 'PT Sinar Sosro', npwp: '0014281035091000', dpp: 4860000, ppn: 583200, total: 5443200 },
    djp: { ref: '27000000071284310', date: '12 May 2027', vendor: 'PT Sinar Sosro', npwp: '0014281035091000', dpp: 4860000, ppn: 583200, total: 5443200, approved: true },
    reason: 'Purchase invoice number is not stored on the faktur. Matched by hand on NPWP, amount and date.',
  },
  {
    id: 'i-05', match: 'invoice-edited', confidence: 0,
    erp: { ref: 'PINV-2027-022', date: '14 May 2027', vendor: 'PT Wahana Komputer', npwp: '0016732814031000', dpp: 22500000, ppn: 2475000, total: 24975000 },
    djp: { ref: '27000000071284383', date: '14 May 2027', vendor: 'PT Wahana Komputer', npwp: '0016732814031000', dpp: 22500000, ppn: 2700000, total: 25200000, approved: true },
    reason: 'PPN differs — Coretax shows 12% but the purchase invoice recorded 11%.',
    fields: ['ppn', 'total'],
  },
  {
    id: 'i-06', match: 'matched', matchedBy: 'auto', confidence: 1,
    erp: { ref: 'PINV-2027-024', date: '17 May 2027', vendor: 'PT Trans Multi Logistic', npwp: '0021068479064000', dpp: 1875000, ppn: 225000, total: 2100000 },
    djp: { ref: '27000000071284456', date: '17 May 2027', vendor: 'PT Trans Multi Logistic', npwp: '0021068479064000', dpp: 1875000, ppn: 225000, total: 2100000, approved: true },
  },
  {
    id: 'i-07', match: 'no-match-in-erp', confidence: 0,
    erp: null,
    djp: { ref: '27000000071284529', date: '21 May 2027', vendor: 'CV Berkah Stationary', npwp: '0072159483052000', dpp: 980000, ppn: 117600, total: 1097600, approved: true },
    reason: 'Prepopulated from Coretax. No purchase invoice recorded in ERP yet.',
  },
  {
    id: 'i-08', match: 'not-in-coretax', confidence: 0,
    erp: { ref: 'PINV-2027-027', date: '24 May 2027', vendor: 'PT Solusi Bangun Indonesia', npwp: '0015472860091000', dpp: 11250000, ppn: 1350000, total: 12600000 },
    djp: null,
    reason: "Purchase invoice exists in ERP but the vendor hasn't issued a faktur pajak.",
  },
]

/** Alternative match candidates offered in the drawer for a non-matched pair. */
export const matchCandidates = [
  { ref: '26000000039847488', date: '08 Apr 2026', party: 'PT Indofood Sukses Makmur Tbk', dpp: 24800000, ppn: 2976500, total: 27776500, confidence: 0.78, why: 'NPWP and DPP match. PPN differs by Rp500.' },
  { ref: '26000000039847412', date: '07 Apr 2026', party: 'PT Indofood Sukses Makmur Tbk', dpp: 24800000, ppn: 2976000, total: 27776000, confidence: 0.65, why: 'NPWP and amounts match. Date is one day earlier.' },
  { ref: '26000000039847501', date: '09 Apr 2026', party: 'PT Indofood Distribusi', dpp: 25000000, ppn: 3000000, total: 28000000, confidence: 0.42, why: 'NPWP differs (group company). Amount slightly higher.' },
]

// ── Periods — the multi-period index ─────────────────────────────────────────

/**
 * The prototype's "today" — the fixtures are pinned to masa 04/2026, so any date
 * logic here works off this rather than `new Date()`, which would drift.
 */
export const TODAY_ISO = '2027-06-18'

/** Timestamp of the last Coretax pull, shown in the workspace footer. */
export const lastSyncedAt = '18 Jun 2027, 14:32'

/** Date part of `lastSyncedAt` — when automatic matching last ran. */
export const AUTO_SYNC_DATE = '2027-06-18'

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
    id: '2027-06', masa: '06/2027',
    sides: {
      output: { erp: { amount: 268_400_000, count: 9 }, djp: { amount: 0, count: 0 }, matched: 0, total: 9 },
      input:  { erp: { amount: 47_850_000, count: 7 },  djp: { amount: 0, count: 0 }, matched: 0, total: 7 },
    },
  },
  { id: '2027-05', masa: '05/2027', reconciledAt: '2027-06-18', sides: 'live' },
  {
    id: '2027-04', masa: '04/2027', reconciledAt: '2027-05-15',
    sides: {
      output: { erp: { amount: 512_750_000, count: 14 }, djp: { amount: 512_750_000, count: 14 }, matched: 14, total: 14 },
      input:  { erp: { amount: 128_400_000, count: 11 }, djp: { amount: 128_400_000, count: 11 }, matched: 11, total: 11 },
    },
  },
  {
    id: '2027-03', masa: '03/2027', reconciledAt: '2027-04-18',
    sides: {
      output: { erp: { amount: 448_900_000, count: 12 }, djp: { amount: 448_900_000, count: 12 }, matched: 12, total: 12 },
      input:  { erp: { amount: 96_750_000, count: 9 },   djp: { amount: 96_750_000, count: 9 },   matched: 9,  total: 9 },
    },
  },
  {
    id: '2027-02', masa: '02/2027', reconciledAt: '2027-03-16',
    sides: {
      output: { erp: { amount: 376_200_000, count: 10 }, djp: { amount: 376_200_000, count: 10 }, matched: 10, total: 10 },
      input:  { erp: { amount: 84_300_000, count: 8 },   djp: { amount: 84_300_000, count: 8 },   matched: 8,  total: 8 },
    },
  },
  {
    // The first masa the feature covers. Nothing earlier is offered.
    id: '2027-01', masa: '01/2027', reconciledAt: '2027-02-20',
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
export const FIRST_PERIOD_ID = '2027-01'

// ── Setup — which tax codes count as PPN Keluaran (US-016) ────────────────────
/**
 * Reconciliation pulls the ERP side by **tax code**, not by a filter the user
 * re-picks every run: the tax codes chosen here decide which sales invoices are
 * in scope, and the PPN Keluaran COA linked to them is what sweeps in journal
 * entries and bank deposits that carry PPN but no tax code of their own.
 *
 * Setup is mandatory on first visit — the index stays out of reach until it is
 * saved, because an index built from the wrong tax codes is worse than no index.
 *
 * A period that has been reconciled keeps a **snapshot** of the codes used at
 * its last run, so changing setup later never silently rewrites history; re-run
 * warns that it will use the current selection instead.
 */
export interface VatTaxCode {
  id: string
  code: string
  name: string
  rate: number
  /** PPN Keluaran control account the code posts to. */
  account: string
}

export const VAT_OUT_TAX_CODES: VatTaxCode[] = [
  { id: 'ppn-12', code: 'PPN 12%', name: 'PPN Keluaran 12%', rate: 12, account: '2-20300 · PPN Keluaran' },
  { id: 'ppn-11', code: 'PPN 11%', name: 'PPN Keluaran 11% (legacy)', rate: 11, account: '2-20300 · PPN Keluaran' },
  { id: 'ppn-0', code: 'PPN 0%', name: 'PPN Keluaran 0% (ekspor)', rate: 0, account: '2-20300 · PPN Keluaran' },
  { id: 'ppn-dtp', code: 'PPN DTP', name: 'PPN Ditanggung Pemerintah', rate: 12, account: '2-20310 · PPN DTP' },
  { id: 'ppnbm-20', code: 'PPnBM 20%', name: 'PPnBM Keluaran 20%', rate: 20, account: '2-20400 · PPnBM Keluaran' },
  { id: 'ppnbm-40', code: 'PPnBM 40%', name: 'PPnBM Keluaran 40%', rate: 40, account: '2-20400 · PPnBM Keluaran' },
]

/**
 * Which taxes this company reconciles here.
 *
 * VAT Out (sales invoice × faktur keluaran) is OD-001 and ships first. VAT In is
 * OD-008 and shares this shell, so the input side stays built — but a company
 * that has not adopted it should not be shown half a feature. Defaulting to
 * `out` means the prototype demonstrates the shipping scope, and flipping it to
 * `both` shows where OD-008 lands without a second codebase.
 */
export type VatReconScope = 'out' | 'both'

/** What a saved setup looks like. Absent means first run. */
export interface VatReconSetup {
  taxCodeIds: string[]
  scope: VatReconScope
  savedAt: string
}

const SETUP_KEY = 'vat-recon-setup'

let setupCache: VatReconSetup | null = null
let setupLoaded = false

export function loadVatSetup(): VatReconSetup | null {
  if (!setupLoaded) {
    const rows = loadSnapshot<VatReconSetup>(SETUP_KEY)
    setupCache = rows && rows.length ? rows[0]! : null
    setupLoaded = true
  }
  return setupCache
}

export function saveVatSetup(taxCodeIds: string[], scope: VatReconScope = 'out'): VatReconSetup {
  const setup: VatReconSetup = { taxCodeIds, scope, savedAt: new Date().toISOString() }
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
  return loadVatSetup()?.scope === 'both' ? ['output', 'input'] : ['output']
}

export function isSideInScope(side: ReconSide): boolean {
  return reconSides().includes(side)
}

/**
 * The codes a reconciled period was run with. Real data would store this per
 * period at run time; the prototype pins the two codes in use when these
 * fixtures were produced so the detail header has something honest to show.
 */
export const SNAPSHOT_TAX_CODE_IDS = ['ppn-12', 'ppnbm-20']

export function taxCodeLabels(ids: string[]): string {
  return VAT_OUT_TAX_CODES.filter(c => ids.includes(c.id)).map(c => c.code).join(', ')
}

export const periodLabel = (masa: string) => `Masa pajak ${masa}`

/** The masa the pair fixtures describe — what the workspace opens on. */
export const activePeriodId = '2027-05'
export const activePeriod = periodLabel('05/2027')

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
  const erpRef = (i: number) => side === 'output'
    ? String(40000 + Number(month) * 60 + i)
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
        ? { reason: 'Amounts differ between the invoice and the faktur.', fields: ['dpp', 'ppn', 'total'] }
        : {}),
    })
  }
  for (let i = 0; i < erpOnly; i++) {
    pairs.push({
      id: `${period.id}-${side}-e${i + 1}`,
      match: 'not-in-coretax', confidence: 0,
      erp: record(both + i, erpExtra[i]!, false),
      djp: null,
      reason: side === 'output'
        ? 'No matching faktur pajak issued in Coretax.'
        : "Purchase invoice exists in ERP but the vendor hasn't issued a faktur pajak.",
    })
  }
  for (let i = 0; i < djpOnly; i++) {
    pairs.push({
      id: `${period.id}-${side}-d${i + 1}`,
      match: 'no-match-in-erp', confidence: 0,
      erp: null,
      djp: record(both + erpOnly + i, djpExtra[i]!, true),
      reason: side === 'output'
        ? 'Faktur pajak exists in Coretax but no corresponding sales invoice in ERP.'
        : 'Prepopulated from Coretax. No purchase invoice recorded in ERP yet.',
    })
  }
  return pairs
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
interface PeriodRun { periodId: string; ranAt: string }

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
  runs = [...runs.filter(r => r.periodId !== periodId), { periodId, ranAt: TODAY_ISO }]
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
    const pairs = pairsForPeriod(periodId, side)
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
 * The pairs behind one masa + side. The live masa returns the hand-written
 * fixtures; every other masa is derived from its seed (see above).
 */
export function pairsForPeriod(periodId: string, side: ReconSide): ReconPair[] {
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
  const built = generatePairs(effective, side, seed)
  generatedPairs.set(key, built)
  return built
}

/** Totals for one column (erp or djp). Null records are skipped, not zeroed. */
export function reconTotals(pairs: ReconPair[], column: 'erp' | 'djp') {
  let dpp = 0, ppn = 0, total = 0, count = 0
  for (const p of pairs) {
    const row = p[column]
    if (!row) continue
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
      .filter(p => p.match !== 'matched')
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
        status: periodStatus(matched, total, seed.id),
        reconciledAt: periodRanAt(seed.id),
        erpAmount,
        erpCount: erp.count,
        djpAmount,
        djpCount: djp.count,
        selisih: Math.abs(erpAmount - djpAmount),
        matched,
        total,
      }
    }),
  )
}

/**
 * Reconciliations that aren't finished — the `Needs attention` tab's scope, and
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
